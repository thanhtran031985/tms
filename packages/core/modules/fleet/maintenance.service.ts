// Service kế hoạch và lệnh bảo dưỡng (spec 02, spec 03 mục 1, task 05).
import { and, eq, gt, inArray, lt } from 'drizzle-orm';
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
  const repo = createFleetRepo(tdb);
  const row = await repo.maintenanceOrders.insert(input);

  if (input.status === 'IN_PROGRESS') {
    if (input.tractorId) {
      await repo.tractors.update(input.tractorId, { status: 'MAINTENANCE' });
    }
    if (input.trailerId) {
      await repo.trailers.update(input.trailerId, { status: 'MAINTENANCE' });
    }
  }

  return row;
}

export async function updateMaintenanceOrderStatus(
  _ctx: RequestContext,
  tdb: TenantDb,
  id: string,
  newStatus: MaintenanceOrderStatus,
): Promise<MaintenanceOrderRow> {
  const repo = createFleetRepo(tdb);
  const existing = await repo.maintenanceOrders.get(id);
  if (!existing) {
    throw new AppError('NOT_FOUND', 'Không tìm thấy lệnh bảo dưỡng.');
  }

  await repo.maintenanceOrders.update(id, { status: newStatus });

  // Cập nhật trạng thái xe tương ứng
  if (newStatus === 'IN_PROGRESS') {
    if (existing.tractorId) {
      await repo.tractors.update(existing.tractorId, { status: 'MAINTENANCE' });
    }
    if (existing.trailerId) {
      await repo.trailers.update(existing.trailerId, { status: 'MAINTENANCE' });
    }
  } else if (newStatus === 'DONE') {
    if (existing.tractorId) {
      const tractor = await repo.tractors.get(existing.tractorId);
      if (tractor && tractor.status === 'MAINTENANCE') {
        await repo.tractors.update(existing.tractorId, { status: 'AVAILABLE' });
      }
    }
    if (existing.trailerId) {
      const trailer = await repo.trailers.get(existing.trailerId);
      if (trailer && trailer.status === 'MAINTENANCE') {
        await repo.trailers.update(existing.trailerId, { status: 'AVAILABLE' });
      }
    }
  }

  const updated = await repo.maintenanceOrders.get(id);
  return updated!;
}

// ================= TÌM LỆNH BẢO DƯỠNG CHỒNG LẤN (spec 03 mục 1) =================
export async function findMaintenanceOverlap(
  _ctx: RequestContext,
  tdb: TenantDb,
  params: { tractorId?: string; trailerId?: string; start: Date; end: Date },
): Promise<MaintenanceOrderRow[]> {
  const conditions = [
    inArray(maintenanceOrders.status, ['PLANNED', 'IN_PROGRESS']),
    lt(maintenanceOrders.plannedStart, params.end),
    gt(maintenanceOrders.plannedEnd, params.start),
  ];

  if (params.tractorId) {
    conditions.push(eq(maintenanceOrders.tractorId, params.tractorId));
  }
  if (params.trailerId) {
    conditions.push(eq(maintenanceOrders.trailerId, params.trailerId));
  }

  return tdb.select(maintenanceOrders, and(...conditions));
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
