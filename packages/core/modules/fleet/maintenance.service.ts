// Service kế hoạch và lệnh bảo dưỡng (spec 02, spec 03 mục 1, task 05).
import { and, eq, gt, inArray, lt, ne, or, type SQL } from 'drizzle-orm';
import { AppError } from '@shared/errors';
import type { MaintenanceOrderStatus } from '@shared/enums';
import {
  type MaintenanceOrderInput,
  maintenanceOrderInputSchema,
  type MaintenancePlanInput,
  maintenancePlanInputSchema,
} from '@shared/schemas/fleet';
import { DEFAULT_TIME_ZONE, toTenantDate } from '../../lib/time';
import type { RequestContext } from '../../lib/context';
import { maintenanceOrders } from '../../lib/db/schema';
import type { TenantDb } from '../../lib/db/tenant-db';
import {
  createFleetRepo,
  type FleetRepo,
  type MaintenanceOrderRow,
  type MaintenancePlanRow,
} from './repo';

function diffInCalendarDays(targetDateStr: string, baseDateStr: string): number {
  const targetUtc = Date.UTC(
    Number(targetDateStr.slice(0, 4)),
    Number(targetDateStr.slice(5, 7)) - 1,
    Number(targetDateStr.slice(8, 10)),
  );
  const baseUtc = Date.UTC(
    Number(baseDateStr.slice(0, 4)),
    Number(baseDateStr.slice(5, 7)) - 1,
    Number(baseDateStr.slice(8, 10)),
  );
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  return Math.round((targetUtc - baseUtc) / MS_PER_DAY);
}

// Xe hoặc rơ moóc trong kế hoạch, lệnh phải thuộc đúng tenant và chưa bị xóa mềm.
async function assertTargetsExist(
  repo: FleetRepo,
  target: { tractorId?: string | null; trailerId?: string | null },
): Promise<void> {
  if (target.tractorId) {
    const tractor = await repo.tractors.get(target.tractorId);
    if (!tractor || tractor.deletedAt) throw new AppError('NOT_FOUND', 'Không tìm thấy đầu kéo.');
  }
  if (target.trailerId) {
    const trailer = await repo.trailers.get(target.trailerId);
    if (!trailer || trailer.deletedAt) throw new AppError('NOT_FOUND', 'Không tìm thấy rơ moóc.');
  }
}

// ================= KẾ HOẠCH BẢO DƯỠNG =================
export async function listMaintenancePlans(
  _ctx: RequestContext,
  tdb: TenantDb,
  options?: { tractorId?: string; trailerId?: string },
): Promise<MaintenancePlanRow[]> {
  const repo = createFleetRepo(tdb);
  const all = await repo.maintenancePlans.list();
  return all.filter((p) => {
    if (options?.tractorId && p.tractorId !== options.tractorId) return false;
    if (options?.trailerId && p.trailerId !== options.trailerId) return false;
    return true;
  });
}

export async function createMaintenancePlan(
  _ctx: RequestContext,
  tdb: TenantDb,
  rawInput: MaintenancePlanInput,
): Promise<MaintenancePlanRow> {
  const input = maintenancePlanInputSchema.parse(rawInput);
  const repo = createFleetRepo(tdb);
  await assertTargetsExist(repo, input);
  return repo.maintenancePlans.insert(input);
}

// ================= LỆNH BẢO DƯỠNG =================
export async function listMaintenanceOrders(
  _ctx: RequestContext,
  tdb: TenantDb,
  options?: { tractorId?: string; trailerId?: string; status?: MaintenanceOrderStatus },
): Promise<MaintenanceOrderRow[]> {
  const repo = createFleetRepo(tdb);
  const all = await repo.maintenanceOrders.list();
  return all.filter((o) => {
    if (options?.tractorId && o.tractorId !== options.tractorId) return false;
    if (options?.trailerId && o.trailerId !== options.trailerId) return false;
    if (options?.status && o.status !== options.status) return false;
    return true;
  });
}

export async function createMaintenanceOrder(
  _ctx: RequestContext,
  tdb: TenantDb,
  rawInput: MaintenanceOrderInput,
): Promise<MaintenanceOrderRow> {
  const input = maintenanceOrderInputSchema.parse(rawInput);

  return tdb.transaction(async (tx) => {
    const repo = createFleetRepo(tx);
    await assertTargetsExist(repo, input);
    const row = await repo.maintenanceOrders.insert(input);
    if (row.status === 'IN_PROGRESS') await syncVehicleStatus(tx, row);
    return row;
  });
}

// Trạng thái hợp lệ của lệnh: DONE và CANCELLED là trạng thái cuối.
const ALLOWED_TRANSITIONS: Record<MaintenanceOrderStatus, MaintenanceOrderStatus[]> = {
  PLANNED: ['IN_PROGRESS', 'DONE', 'CANCELLED'],
  IN_PROGRESS: ['DONE', 'CANCELLED'],
  DONE: [],
  CANCELLED: [],
};

// Đồng bộ trạng thái xe và rơ moóc theo lệnh (task 05): IN_PROGRESS đặt MAINTENANCE;
// DONE hoặc CANCELLED trả AVAILABLE, trừ khi xe còn lệnh IN_PROGRESS khác.
async function syncVehicleStatus(tx: TenantDb, order: MaintenanceOrderRow): Promise<void> {
  const repo = createFleetRepo(tx);

  const hasOtherInProgress = async (column: 'tractorId' | 'trailerId', id: string) => {
    const others = await tx.select(
      maintenanceOrders,
      and(
        eq(maintenanceOrders[column], id),
        eq(maintenanceOrders.status, 'IN_PROGRESS'),
        ne(maintenanceOrders.id, order.id),
      ),
    );
    return others.length > 0;
  };

  if (order.tractorId) {
    const tractor = await repo.tractors.get(order.tractorId);
    if (tractor && !tractor.deletedAt) {
      if (order.status === 'IN_PROGRESS') {
        await repo.tractors.update(tractor.id, { status: 'MAINTENANCE' });
      } else if (
        tractor.status === 'MAINTENANCE' &&
        !(await hasOtherInProgress('tractorId', tractor.id))
      ) {
        await repo.tractors.update(tractor.id, { status: 'AVAILABLE' });
      }
    }
  }
  if (order.trailerId) {
    const trailer = await repo.trailers.get(order.trailerId);
    if (trailer && !trailer.deletedAt) {
      if (order.status === 'IN_PROGRESS') {
        await repo.trailers.update(trailer.id, { status: 'MAINTENANCE' });
      } else if (
        trailer.status === 'MAINTENANCE' &&
        !(await hasOtherInProgress('trailerId', trailer.id))
      ) {
        await repo.trailers.update(trailer.id, { status: 'AVAILABLE' });
      }
    }
  }
}

export async function updateMaintenanceOrderStatus(
  _ctx: RequestContext,
  tdb: TenantDb,
  id: string,
  newStatus: MaintenanceOrderStatus,
): Promise<MaintenanceOrderRow> {
  return tdb.transaction(async (tx) => {
    // Khóa dòng lệnh để hai người đổi trạng thái cùng lúc không vượt qua kiểm tra chuyển trạng thái.
    const [existing] = await tx.select(maintenanceOrders, eq(maintenanceOrders.id, id), {
      forUpdate: true,
    });
    if (!existing) {
      throw new AppError('NOT_FOUND', 'Không tìm thấy lệnh bảo dưỡng.');
    }
    if (!ALLOWED_TRANSITIONS[existing.status].includes(newStatus)) {
      throw new AppError(
        'INVALID_STATUS_TRANSITION',
        'Lệnh bảo dưỡng ở trạng thái hiện tại không chuyển sang trạng thái này được. Tải lại trang để xem trạng thái mới nhất.',
      );
    }

    const repo = createFleetRepo(tx);
    await repo.maintenanceOrders.update(id, { status: newStatus });
    const updated = { ...existing, status: newStatus };
    await syncVehicleStatus(tx, updated);
    return updated;
  });
}

// ================= TÌM LỆNH BẢO DƯỠNG CHỒNG LẤN (spec 03 mục 1) =================
// Lệnh chồng lấn nếu dính đầu kéo HOẶC rơ moóc được truyền vào.
export async function findMaintenanceOverlap(
  _ctx: RequestContext,
  tdb: TenantDb,
  params: { tractorId?: string; trailerId?: string; start: Date; end: Date },
): Promise<MaintenanceOrderRow[]> {
  const targets: SQL[] = [];
  if (params.tractorId) targets.push(eq(maintenanceOrders.tractorId, params.tractorId));
  if (params.trailerId) targets.push(eq(maintenanceOrders.trailerId, params.trailerId));
  if (targets.length === 0) {
    throw new AppError('VALIDATION_ERROR', 'Cần chọn đầu kéo hoặc rơ moóc để tìm lệnh bảo dưỡng.');
  }

  return tdb.select(
    maintenanceOrders,
    and(
      inArray(maintenanceOrders.status, ['PLANNED', 'IN_PROGRESS']),
      lt(maintenanceOrders.plannedStart, params.end),
      gt(maintenanceOrders.plannedEnd, params.start),
      or(...targets),
    ),
  );
}

// ================= DANH SÁCH XE ĐẾN KỲ BẢO DƯỠNG =================
export interface MaintenanceDueItem {
  planId: string;
  targetType: 'TRACTOR' | 'TRAILER';
  targetId: string;
  targetLabel: string;
  taskCode: string;
  isDue: boolean;
  kmRun?: number;
  intervalKm?: number | null;
  daysElapsed?: number;
  intervalDays?: number | null;
}

export async function listMaintenanceDue(
  ctx: RequestContext,
  tdb: TenantDb,
): Promise<MaintenanceDueItem[]> {
  const repo = createFleetRepo(tdb);
  const plans = await repo.maintenancePlans.list();
  const tractors = await repo.tractors.list({ includeDeleted: false });
  const trailers = await repo.trailers.list({ includeDeleted: false });

  const tractorMap = new Map(tractors.map((t) => [t.id, t]));
  const trailerMap = new Map(trailers.map((tr) => [tr.id, tr]));

  const tz = ctx.timezone || DEFAULT_TIME_ZONE;
  const todayStr = toTenantDate(new Date(), tz);

  const dueItems: MaintenanceDueItem[] = [];

  for (const plan of plans) {
    let isDue = false;
    let kmRun: number | undefined;
    let daysElapsed: number | undefined;
    let targetType: 'TRACTOR' | 'TRAILER' = 'TRACTOR';
    let targetId = '';
    let targetLabel = '';

    if (plan.tractorId) {
      const tractor = tractorMap.get(plan.tractorId);
      if (!tractor) continue;
      targetType = 'TRACTOR';
      targetId = tractor.id;
      targetLabel = tractor.plateNumber;

      if (plan.intervalKm) {
        kmRun = (tractor.currentOdometer ?? 0) - (plan.lastDoneOdometer ?? 0);
        if (kmRun >= plan.intervalKm) {
          isDue = true;
        }
      }
    } else if (plan.trailerId) {
      const trailer = trailerMap.get(plan.trailerId);
      if (!trailer) continue;
      targetType = 'TRAILER';
      targetId = trailer.id;
      targetLabel = trailer.plateNumber;
    }

    if (plan.intervalDays && plan.lastDoneAt) {
      daysElapsed = diffInCalendarDays(todayStr, plan.lastDoneAt);
      if (daysElapsed >= plan.intervalDays) {
        isDue = true;
      }
    }

    if (isDue) {
      dueItems.push({
        planId: plan.id,
        targetType,
        targetId,
        targetLabel,
        taskCode: plan.taskCode,
        isDue: true,
        kmRun,
        intervalKm: plan.intervalKm,
        daysElapsed,
        intervalDays: plan.intervalDays,
      });
    }
  }

  return dueItems;
}
