// Chuyến SINGLE của một container: tạo chuyến, sửa giờ (task 06, bước 3). Gán tài nguyên ở assign.service.ts.
import { and, eq, inArray, notInArray } from 'drizzle-orm';
import { AppError } from '@shared/errors';
import type { CreateSingleTripInput, UpdateTripTimesInput } from '@shared/schemas/dispatch';
import { writeAudit } from '../../lib/audit';
import type { RequestContext } from '../../lib/context';
import { nextNumber } from '../../lib/db/numbering';
import {
  consolidatedTrips,
  dispatchAssignments,
  orderContainers,
  orders,
  tripContainers,
} from '../../lib/db/schema';
import { toTenantDate } from '../../lib/time';
import { createMasterDataRepo } from '../master-data/repo';
import { assertContainerTransition } from '../orders/state-machine';
import {
  ACTIVE_TRIP_STATUSES,
  authorize,
  emit,
  INACTIVE_ASSIGNMENT_STATUSES,
  invalid,
  isActiveAssignment,
  lockTrip,
  snapshot,
  updateTripWithVersion,
  type DispatchDeps,
} from './deps';
import type { TripResult } from './index';
import { createDispatchRepo } from './repo';

// Order còn nhận điều xe: đã xác nhận hoặc đang chạy (các container khác của Order vẫn chờ điều).
const TRIPPABLE_ORDER_STATUSES = ['CONFIRMED', 'IN_PROGRESS', 'PARTIALLY_DELIVERED'] as const;

// Mã chuyến TRIP-yymm-NNN, bộ đếm theo tenant và tháng (spec 02: seq_key 'TRIP:2026-10').
export function formatTripCode(tenantDate: string, serial: number): string {
  return `TRIP-${tenantDate.slice(2, 4)}${tenantDate.slice(5, 7)}-${String(serial).padStart(3, '0')}`;
}

export function createTripService(deps: DispatchDeps) {
  async function createSingleTrip(
    ctx: RequestContext,
    input: CreateSingleTripInput,
  ): Promise<TripResult> {
    authorize(ctx, 'dispatch.assign');
    if (input.plannedEnd <= input.plannedStart) {
      throw invalid('plannedEnd', 'Giờ kết thúc phải sau giờ bắt đầu.');
    }

    const result = await deps.tenantDb(ctx).transaction(async (tx) => {
      // Khóa dòng container trước: hai Điều vận cùng lập chuyến cho một container sẽ xếp hàng, người sau thấy chuyến của người trước.
      const [container] = await tx.select(
        orderContainers,
        eq(orderContainers.id, input.orderContainerId),
        { forUpdate: true },
      );
      if (!container) throw new AppError('NOT_FOUND');

      const [order] = await tx.select(orders, eq(orders.id, container.orderId));
      if (!order || !(TRIPPABLE_ORDER_STATUSES as readonly string[]).includes(order.status)) {
        throw new AppError('ORDER_NOT_CONFIRMED');
      }

      const links = await tx.select(
        tripContainers,
        eq(tripContainers.orderContainerId, container.id),
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
      // Container PLANNED mà không còn chuyến hoạt động (chuyến cũ đã hủy) thì lập chuyến mới được.
      if (container.status !== 'PLANNED') assertContainerTransition(container.status, 'PLANNED');

      const routeId = input.routeId ?? container.routeId;
      if (!(await createMasterDataRepo(tx).routes.get(routeId))) {
        throw invalid('routeId', 'Tuyến không tồn tại hoặc không thuộc công ty của bạn.');
      }

      const tenantDate = toTenantDate(deps.now(), ctx.timezone);
      const serial = await nextNumber(tx, `TRIP:${tenantDate.slice(0, 7)}`);
      const repo = createDispatchRepo(tx);
      const created = await repo.trips.insert({
        tripCode: formatTripCode(tenantDate, serial),
        tripMode: 'SINGLE',
        routeId,
        plannedStart: input.plannedStart,
        plannedEnd: input.plannedEnd,
        createdBy: ctx.userId,
      });
      await repo.tripContainers.insert({
        tripId: created.id,
        orderContainerId: container.id,
        orderId: container.orderId,
      });
      if (container.status !== 'PLANNED') {
        await tx.update(
          orderContainers,
          { status: 'PLANNED', version: container.version + 1 },
          eq(orderContainers.id, container.id),
        );
      }

      const trip = (await repo.trips.get(created.id))!;
      await writeAudit(tx, ctx, {
        entity: 'consolidated_trips',
        entityId: trip.id,
        action: 'CREATE',
        before: null,
        after: { ...snapshot(trip), orderContainerId: container.id },
      });
      if (container.status !== 'PLANNED') {
        await writeAudit(tx, ctx, {
          entity: 'order_containers',
          entityId: container.id,
          action: 'STATUS_CHANGE',
          before: { status: container.status },
          after: { status: 'PLANNED', tripId: trip.id },
        });
      }
      return { trip, orderContainerId: container.id };
    });

    await emit(deps, {
      type: 'dispatch.updated',
      tenantId: ctx.tenantId,
      tripId: result.trip.id,
      version: result.trip.version,
      orderContainerIds: [result.orderContainerId],
    });
    return { trip: result.trip, assignments: [], warnings: [] };
  }

  async function updateTripTimes(
    ctx: RequestContext,
    input: UpdateTripTimesInput,
  ): Promise<TripResult> {
    authorize(ctx, 'dispatch.assign');
    if (input.plannedEnd <= input.plannedStart) {
      throw invalid('plannedEnd', 'Giờ kết thúc phải sau giờ bắt đầu.');
    }

    const result = await deps.tenantDb(ctx).transaction(async (tx) => {
      const before = await lockTrip(tx, input.tripId, input.version);
      if (before.status !== 'PLANNED') throw new AppError('INVALID_STATUS_TRANSITION');

      await updateTripWithVersion(tx, before, {
        plannedStart: input.plannedStart,
        plannedEnd: input.plannedEnd,
      });
      // Assignment hoạt động của chuyến theo khung giờ mới (cùng khung giờ chuyến, ADR-004).
      await tx.update(
        dispatchAssignments,
        { plannedStart: input.plannedStart, plannedEnd: input.plannedEnd },
        and(
          eq(dispatchAssignments.consolidatedTripId, before.id),
          notInArray(dispatchAssignments.status, INACTIVE_ASSIGNMENT_STATUSES),
        ),
      );

      const repo = createDispatchRepo(tx);
      const trip = (await repo.trips.get(before.id))!;
      const assignments = (
        await repo.assignments.list(eq(dispatchAssignments.consolidatedTripId, trip.id))
      ).filter(isActiveAssignment);
      await writeAudit(tx, ctx, {
        entity: 'consolidated_trips',
        entityId: trip.id,
        action: 'UPDATE_TIMES',
        before: { plannedStart: before.plannedStart, plannedEnd: before.plannedEnd },
        after: { plannedStart: trip.plannedStart, plannedEnd: trip.plannedEnd },
      });
      const links = await repo.tripContainers.list(eq(tripContainers.tripId, trip.id));
      return { trip, assignments, orderContainerIds: links.map((l) => l.orderContainerId) };
    });

    await emit(deps, {
      type: 'dispatch.updated',
      tenantId: ctx.tenantId,
      tripId: result.trip.id,
      version: result.trip.version,
      orderContainerIds: result.orderContainerIds,
    });
    return { trip: result.trip, assignments: result.assignments, warnings: [] };
  }

  return { createSingleTrip, updateTripTimes };
}
