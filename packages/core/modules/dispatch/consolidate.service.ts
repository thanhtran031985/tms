// Ghép chuyến TWIN_20 và COMBINED (task 08, TICKET-08): lập chuyến cho 2 container, ghép thêm container vào chuyến đơn.
// Khóa theo thứ tự cố định: chuyến (nếu có) -> drivers -> tractors -> trailers -> order_containers (id tăng dần), cùng thứ tự với
// assignResources nên hai Điều vận ghép chéo không deadlock (spec 03 mục 1). Mọi đọc thường diễn ra SAU các khóa.
import { eq, inArray } from 'drizzle-orm';
import type { TripMode } from '@shared/enums';
import { AppError } from '@shared/errors';
import {
  parseDispatchSettings,
  parsePricingSettings,
  type AddContainerToTripInput,
  type CreateConsolidatedTripInput,
} from '@shared/schemas/dispatch';
import { writeAudit } from '../../lib/audit';
import type { RequestContext } from '../../lib/context';
import { isLockContentionError } from '../../lib/db/errors';
import { nextNumber } from '../../lib/db/numbering';
import { consolidatedTrips, orderContainers, orders, tripContainers } from '../../lib/db/schema';
import type { TenantDb } from '../../lib/db/tenant-db';
import { toTenantDate } from '../../lib/time';
import { can } from '../identity/permissions';
import { createMasterDataRepo } from '../master-data/repo';
import { assertContainerTransition } from '../orders/state-machine';
import type { OrderContainerRow } from '../orders/repo';
import { applyAssignment } from './assign.service';
import { patchContainerForTrip, sharesTripDiscount } from './container-patch';
import { loadTripContext, type TripContext } from './context';
import {
  ACTIVE_TRIP_STATUSES,
  authorize,
  emit,
  emitReprice,
  invalid,
  LOCK_WAIT_TIMEOUT_SECONDS,
  lockTrip,
  snapshot,
  updateTripWithVersion,
  type DispatchDeps,
} from './deps';
import { lockResources, type LockedResources, type ResourceIds } from './evaluate';
import type { TripResult } from './index';
import { createDispatchRepo, type TripRow } from './repo';
import { checkTripShape } from './rules/trip-shape';
import { formatTripCode, TRIPPABLE_ORDER_STATUSES } from './trips.service';

/** Khóa các dòng container theo id tăng dần (SELECT … FOR UPDATE từng dòng). Thiếu hoặc khác tenant: NOT_FOUND. */
async function lockContainers(tx: TenantDb, ids: string[]): Promise<OrderContainerRow[]> {
  const locked: OrderContainerRow[] = [];
  for (const id of [...new Set(ids)].sort()) {
    const [row] = await tx.select(orderContainers, eq(orderContainers.id, id), { forUpdate: true });
    if (!row) throw new AppError('NOT_FOUND');
    locked.push(row);
  }
  return locked;
}

/** Order của các container phải còn nhận điều xe, và container chưa nằm trên chuyến hoạt động nào. */
async function assertTrippable(tx: TenantDb, containers: OrderContainerRow[]): Promise<void> {
  const orderRows = await tx.select(orders, inArray(orders.id, [...new Set(containers.map((c) => c.orderId))]));
  const byId = new Map(orderRows.map((o) => [o.id, o]));
  for (const container of containers) {
    const order = byId.get(container.orderId);
    if (!order || !(TRIPPABLE_ORDER_STATUSES as readonly string[]).includes(order.status)) {
      throw new AppError('ORDER_NOT_CONFIRMED');
    }
  }
  const links = await tx.select(
    tripContainers,
    inArray(
      tripContainers.orderContainerId,
      containers.map((c) => c.id),
    ),
  );
  if (links.length > 0) {
    const trips = await tx.select(
      consolidatedTrips,
      inArray(
        consolidatedTrips.id,
        links.map((l) => l.tripId),
      ),
    );
    if (trips.some((t) => ACTIVE_TRIP_STATUSES.includes(t.status))) {
      throw new AppError('CONTAINER_ALREADY_IN_TRIP');
    }
  }
}

/**
 * Sau khi container vào chuyến ghép: lên PLANNED, và nếu cả cặp cùng khách (và tenant bật chia giá ghép) thì đổi chế độ áp giá
 * sang chế độ chuyến và đánh dấu cần tính lại giá (spec 06 mục 3, 4); khác khách giữ SINGLE, không đặt cờ.
 */
async function enterTrip(
  tx: TenantDb,
  ctx: RequestContext,
  input: {
    containers: OrderContainerRow[];
    context: TripContext;
    tripMode: TripMode;
    tripId: string;
    shareDiscount: boolean;
  },
): Promise<string[]> {
  const shares = sharesTripDiscount(input.context.containers, input.context.orders, input.shareDiscount);
  const flagged: string[] = [];
  for (const container of input.containers) {
    if (container.status !== 'PLANNED') assertContainerTransition(container.status, 'PLANNED');
    await patchContainerForTrip(
      tx,
      ctx,
      container,
      {
        status: 'PLANNED',
        ...(shares ? { appliedTripMode: input.tripMode, repriceRequired: true } : {}),
      },
      input.tripId,
    );
    if (shares) flagged.push(container.id);
  }
  return flagged;
}

function firstError(result: { errors: { code: AppError['code']; message: string; details?: Record<string, string | number> }[] }) {
  const blocking = result.errors[0];
  if (blocking) throw new AppError(blocking.code, blocking.message, blocking.details);
}

export function createConsolidateService(deps: DispatchDeps) {
  async function createConsolidatedTrip(
    ctx: RequestContext,
    input: CreateConsolidatedTripInput,
  ): Promise<TripResult> {
    authorize(ctx, 'dispatch.assign');
    if (input.overrideDrivingHours && !can(ctx.role, 'dispatch.overrideDriveHours')) {
      throw new AppError('DRIVING_HOURS_OVERRIDE_FORBIDDEN');
    }
    if (input.plannedEnd <= input.plannedStart) {
      throw invalid('plannedEnd', 'Giờ kết thúc phải sau giờ bắt đầu.');
    }
    if (input.orderContainerIds.length !== 2 || new Set(input.orderContainerIds).size !== 2) {
      throw new AppError('TRIP_MODE_INVALID');
    }
    const rawSettings = await deps.loadSettings(ctx);
    const settings = parseDispatchSettings(rawSettings);
    const pricing = parsePricingSettings(rawSettings);

    let outcome: Awaited<ReturnType<typeof run>>;
    async function run() {
      return deps.tenantDb(ctx).transaction(
        async (tx) => {
          // Khóa tài nguyên trước (drivers -> tractors -> trailers), rồi container theo id tăng dần.
          const ids: ResourceIds | null = input.resources ?? null;
          const locked: LockedResources | null = ids ? await lockResources(tx, ids) : null;
          const containers = await lockContainers(tx, input.orderContainerIds);
          await assertTrippable(tx, containers);

          const first = containers.find((c) => c.id === input.orderContainerIds[0]) ?? containers[0]!;
          const routeId = input.routeId ?? first.routeId;
          if (!(await createMasterDataRepo(tx).routes.get(routeId))) {
            throw invalid('routeId', 'Tuyến không tồn tại hoặc không thuộc công ty của bạn.');
          }

          const repo = createDispatchRepo(tx);
          const tenantDate = toTenantDate(deps.now(), ctx.timezone);
          const serial = await nextNumber(tx, `TRIP:${tenantDate.slice(0, 7)}`);
          const created = await repo.trips.insert({
            tripCode: formatTripCode(tenantDate, serial),
            tripMode: input.tripMode,
            routeId,
            plannedStart: input.plannedStart,
            plannedEnd: input.plannedEnd,
            createdBy: ctx.userId,
          });
          for (const container of containers) {
            await repo.tripContainers.insert({
              tripId: created.id,
              orderContainerId: container.id,
              orderId: container.orderId,
            });
          }

          // Ràng buộc theo hình dạng chuyến (số cont, Rule 1 cont 20 feet, Rule 4, Rule 6) trước khi chọn xe.
          const context = await loadTripContext(tx, created.id);
          const shape = checkTripShape({
            tripMode: input.tripMode,
            containers: context.containers,
            orders: context.orders,
            stops: context.stops,
          });
          firstError(shape);

          const flagged = await enterTrip(tx, ctx, {
            containers,
            context,
            tripMode: input.tripMode,
            tripId: created.id,
            shareDiscount: pricing.shareTwinDiscountWithCustomer,
          });

          const trip = (await repo.trips.get(created.id))!;
          await writeAudit(tx, ctx, {
            entity: 'consolidated_trips',
            entityId: trip.id,
            action: 'CREATE',
            before: null,
            after: { ...snapshot(trip), orderContainerIds: containers.map((c) => c.id).join(',') },
          });

          if (ids && locked) {
            const applied = await applyAssignment(ctx, tx, deps, {
              trip,
              tripMode: input.tripMode,
              ids,
              locked,
              context,
              settings,
              confirmMissingWeight: input.confirmMissingWeight === true,
              overrideDrivingHours: input.overrideDrivingHours ?? null,
            });
            return {
              ...applied,
              warnings: [...shape.warnings, ...applied.warnings],
              orderContainerIds: containers.map((c) => c.id),
              repriceIds: flagged,
            };
          }
          return {
            trip,
            assignments: [],
            warnings: shape.warnings,
            orderContainerIds: containers.map((c) => c.id),
            repriceIds: flagged,
          };
        },
        { lockWaitTimeoutSec: LOCK_WAIT_TIMEOUT_SECONDS },
      );
    }
    try {
      outcome = await run();
    } catch (error) {
      if (isLockContentionError(error)) throw new AppError('RESOURCE_BUSY_RETRY');
      throw error;
    }

    await emit(deps, {
      type: 'dispatch.updated',
      tenantId: ctx.tenantId,
      tripId: outcome.trip.id,
      version: outcome.trip.version,
      orderContainerIds: outcome.orderContainerIds,
    });
    await emitReprice(deps, ctx.tenantId, outcome.repriceIds);
    return { trip: outcome.trip, assignments: outcome.assignments, warnings: outcome.warnings };
  }

  async function addContainerToTrip(
    ctx: RequestContext,
    input: AddContainerToTripInput,
  ): Promise<TripResult> {
    authorize(ctx, 'dispatch.assign');
    const rawSettings = await deps.loadSettings(ctx);
    const settings = parseDispatchSettings(rawSettings);
    const pricing = parsePricingSettings(rawSettings);

    let outcome: Awaited<ReturnType<typeof run>>;
    async function run() {
      return deps.tenantDb(ctx).transaction(
        async (tx) => {
          // Chuyến trước, rồi tài nguyên đang gán, rồi container mới (cùng thứ tự với assignResources).
          const trip: TripRow = await lockTrip(tx, input.tripId, input.version);
          if (trip.status !== 'PLANNED') throw new AppError('INVALID_STATUS_TRANSITION');
          if (trip.tripMode !== 'SINGLE') throw new AppError('TRIP_MODE_INVALID');

          const ids: ResourceIds | null =
            trip.primaryDriverId && trip.primaryTractorId && trip.primaryTrailerId
              ? {
                  driverId: trip.primaryDriverId,
                  tractorId: trip.primaryTractorId,
                  trailerId: trip.primaryTrailerId,
                }
              : null;
          const locked = ids ? await lockResources(tx, ids) : null;
          const [added] = await lockContainers(tx, [input.orderContainerId]);
          await assertTrippable(tx, [added!]);

          const repo = createDispatchRepo(tx);
          await repo.tripContainers.insert({
            tripId: trip.id,
            orderContainerId: added!.id,
            orderId: added!.orderId,
          });
          const context = await loadTripContext(tx, trip.id);
          const shape = checkTripShape({
            tripMode: input.tripMode,
            containers: context.containers,
            orders: context.orders,
            stops: context.stops,
          });
          firstError(shape);

          const flagged = await enterTrip(tx, ctx, {
            containers: [added!],
            context,
            tripMode: input.tripMode,
            tripId: trip.id,
            shareDiscount: pricing.shareTwinDiscountWithCustomer,
          });
          // Cont có sẵn trong chuyến cũng đổi khóa tra giá khi cặp được chia giá ghép.
          const shares = sharesTripDiscount(
            context.containers,
            context.orders,
            pricing.shareTwinDiscountWithCustomer,
          );
          if (shares) {
            for (const existing of context.containers.filter((c) => c.id !== added!.id)) {
              flagged.push(existing.id);
              await patchContainerForTrip(
                tx,
                ctx,
                existing,
                { appliedTripMode: input.tripMode, repriceRequired: true },
                trip.id,
              );
            }
          }

          let result: Awaited<ReturnType<typeof applyAssignment>>;
          if (ids && locked) {
            result = await applyAssignment(ctx, tx, deps, {
              trip,
              tripMode: input.tripMode,
              ids,
              locked,
              context,
              settings,
              confirmMissingWeight: input.confirmMissingWeight === true,
              overrideDrivingHours: null,
              tripSet: { tripMode: input.tripMode },
            });
          } else {
            await updateTripWithVersion(tx, trip, { tripMode: input.tripMode });
            result = { trip: (await repo.trips.get(trip.id))!, assignments: [], warnings: [] };
          }
          await writeAudit(tx, ctx, {
            entity: 'consolidated_trips',
            entityId: trip.id,
            action: 'ADD_CONTAINER',
            before: { tripMode: trip.tripMode, version: trip.version },
            after: {
              tripMode: input.tripMode,
              orderContainerId: added!.id,
              version: result.trip.version,
            },
          });
          return {
            ...result,
            warnings: [...shape.warnings, ...result.warnings],
            orderContainerIds: context.orderContainerIds,
            repriceIds: flagged,
          };
        },
        { lockWaitTimeoutSec: LOCK_WAIT_TIMEOUT_SECONDS },
      );
    }
    try {
      outcome = await run();
    } catch (error) {
      if (isLockContentionError(error)) throw new AppError('RESOURCE_BUSY_RETRY');
      throw error;
    }

    await emit(deps, {
      type: 'dispatch.updated',
      tenantId: ctx.tenantId,
      tripId: outcome.trip.id,
      version: outcome.trip.version,
      orderContainerIds: outcome.orderContainerIds,
    });
    await emitReprice(deps, ctx.tenantId, outcome.repriceIds);
    return { trip: outcome.trip, assignments: outcome.assignments, warnings: outcome.warnings };
  }

  return { createConsolidatedTrip, addContainerToTrip };
}

