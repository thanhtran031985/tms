// Tách chuyến ghép và gỡ container khỏi chuyến khi hủy container/Order (task 08, spec 03 mục 4).
// Gỡ container: hủy assignment của các Stop thuộc container đó (CANCELLED, không xóa), bỏ dòng trip_containers, đưa container về
// PENDING, chuyến còn 1 cont thì về SINGLE, đánh dấu cần tính lại giá cho container có giá ghép, đặt lại phân bổ Kế toán đã sửa tay.
// Thứ tự khóa: chuyến, rồi container (cùng thứ tự với ghép chuyến).
import { and, eq, inArray, notInArray } from 'drizzle-orm';
import type { TripStatus } from '@shared/enums';
import { AppError } from '@shared/errors';
import type { RemoveContainerFromTripInput } from '@shared/schemas/dispatch';
import { writeAudit } from '../../lib/audit';
import type { RequestContext } from '../../lib/context';
import { isLockContentionError } from '../../lib/db/errors';
import {
  dispatchAssignments,
  orderContainers,
  orderStops,
  tripContainers,
} from '../../lib/db/schema';
import type { TenantDb } from '../../lib/db/tenant-db';
import type { DispatchEvent } from '../../lib/redis/publish';
import { patchContainerForTrip } from './container-patch';
import {
  authorize,
  emit,
  INACTIVE_ASSIGNMENT_STATUSES,
  isActiveAssignment,
  LOCK_WAIT_TIMEOUT_SECONDS,
  lockTrip,
  snapshot,
  updateTripWithVersion,
  type DispatchDeps,
} from './deps';
import type { TripResult } from './index';
import { createDispatchRepo, type TripRow } from './repo';

export type RemoveContainerResult = TripResult & {
  removedContainerId: string;
  /** Container bị đánh dấu cần tính lại giá (container bị tách và container còn lại của chuyến). */
  repriceContainerIds: string[];
};

/**
 * Gỡ các container khỏi mọi chuyến hoạt động của chúng, trong transaction của người gọi (Order hủy container/Order).
 * Trả các sự kiện `dispatch.updated` để người gọi phát SAU khi commit.
 */
export type DetachFromTrips = (
  tx: TenantDb,
  ctx: RequestContext,
  input: { orderContainerIds: string[]; reason: string },
) => Promise<DispatchEvent[]>;

/** Chuyến chưa chạy: còn tách và hủy được. */
const DETACHABLE: readonly TripStatus[] = ['PLANNED', 'DISPATCHED'];

type DetachOutcome = {
  trip: TripRow;
  /** Mọi container từng thuộc chuyến (cả cont bị gỡ), để phát sự kiện. */
  affectedContainerIds: string[];
  repriceContainerIds: string[];
};

/** Gỡ `removeIds` khỏi chuyến ĐÃ KHÓA. Chuyến hết container thì chuyển CANCELLED và bỏ tài nguyên. */
async function detachFromLockedTrip(
  tx: TenantDb,
  ctx: RequestContext,
  trip: TripRow,
  removeIds: string[],
  reason: string,
): Promise<DetachOutcome> {
  const repo = createDispatchRepo(tx);
  const links = await repo.tripContainers.list(eq(tripContainers.tripId, trip.id), {
    forUpdate: true,
  });
  const removeSet = new Set(removeIds);
  const remainingLinks = links.filter((l) => !removeSet.has(l.orderContainerId));
  const removedLinks = links.filter((l) => removeSet.has(l.orderContainerId));
  const affectedContainerIds = links.map((l) => l.orderContainerId);

  // Khóa container theo id tăng dần rồi mới đọc thường.
  const rows = new Map<string, typeof orderContainers.$inferSelect>();
  for (const id of [...affectedContainerIds].sort()) {
    const [row] = await tx.select(orderContainers, eq(orderContainers.id, id), { forUpdate: true });
    if (row) rows.set(id, row);
  }

  // Hủy assignment của các Stop thuộc container bị gỡ (giữ lại với trạng thái CANCELLED).
  const stopIds = (
    await tx.select(orderStops, inArray(orderStops.orderContainerId, [...removeSet]))
  ).map((s) => s.id);
  const assignments = stopIds.length
    ? (
        await repo.assignments.list(
          and(
            eq(dispatchAssignments.consolidatedTripId, trip.id),
            inArray(dispatchAssignments.stopId, stopIds),
          ),
        )
      ).filter(isActiveAssignment)
    : [];
  for (const old of assignments) {
    await repo.assignments.updateWhere(
      and(
        eq(dispatchAssignments.id, old.id),
        notInArray(dispatchAssignments.status, INACTIVE_ASSIGNMENT_STATUSES),
      )!,
      { status: 'CANCELLED', version: old.version + 1 },
    );
    await writeAudit(tx, ctx, {
      entity: 'dispatch_assignments',
      entityId: old.id,
      action: 'CANCEL',
      before: snapshot(old),
      after: { ...snapshot(old), status: 'CANCELLED', version: old.version + 1 },
    });
  }

  for (const link of removedLinks) await repo.tripContainers.remove(trip.id, link.orderContainerId);

  // Đổi khóa tra giá: cont đang tính giá ghép (appliedTripMode khác SINGLE) về SINGLE và cần tính lại (spec 06 mục 4).
  const repriceContainerIds: string[] = [];
  for (const id of affectedContainerIds) {
    const row = rows.get(id);
    if (!row) continue;
    const removed = removeSet.has(id);
    const wasPricedAsCombined = row.appliedTripMode !== 'SINGLE';
    await patchContainerForTrip(
      tx,
      ctx,
      row,
      {
        ...(removed && row.status === 'PLANNED' ? { status: 'PENDING' as const } : {}),
        ...(wasPricedAsCombined ? { appliedTripMode: 'SINGLE' as const, repriceRequired: true } : {}),
      },
      trip.id,
    );
    if (wasPricedAsCombined) repriceContainerIds.push(id);
  }

  // Phân bổ Kế toán đã sửa tay thì đặt lại về số hệ thống và báo Kế toán xem lại (spec 03 mục 4).
  const hadManualAllocation = links.some((l) => l.isManualOverride) && remainingLinks.length > 0;
  if (hadManualAllocation) {
    for (const link of remainingLinks) {
      await repo.tripContainers.update(trip.id, link.orderContainerId, {
        allocationRatio: link.systemRatio,
        allocatedAmount: link.systemAmount,
        isManualOverride: false,
        overrideReason: null,
      });
    }
    await writeAudit(tx, ctx, {
      entity: 'consolidated_trips',
      entityId: trip.id,
      action: 'RESET_ALLOCATION',
      before: {
        allocationMethod: trip.allocationMethod,
        rows: links
          .map((l) => `${l.orderContainerId}:${l.allocatedAmount ?? ''}:${l.isManualOverride}`)
          .join(','),
      },
      after: {
        allocationMethod: trip.allocationMethod === 'MANUAL' ? 'COST_NORM_RATIO' : trip.allocationMethod,
        allocationReviewRequired: true,
        reason: 'Tách chuyến',
      },
    });
  }

  const empty = remainingLinks.length === 0;
  await updateTripWithVersion(tx, trip, {
    ...(remainingLinks.length === 1 ? { tripMode: 'SINGLE' as const } : {}),
    ...(hadManualAllocation
      ? {
          allocationMethod: trip.allocationMethod === 'MANUAL' ? 'COST_NORM_RATIO' : trip.allocationMethod,
          allocationReviewRequired: true,
          allocationAdjustedBy: null,
          allocationAdjustedAt: null,
        }
      : {}),
    ...(empty
      ? {
          status: 'CANCELLED' as const,
          primaryDriverId: null,
          primaryTractorId: null,
          primaryTrailerId: null,
        }
      : {}),
  });
  const after = (await repo.trips.get(trip.id))!;
  await writeAudit(tx, ctx, {
    entity: 'consolidated_trips',
    entityId: trip.id,
    action: 'REMOVE_CONTAINER',
    before: { tripMode: trip.tripMode, status: trip.status, version: trip.version },
    after: {
      tripMode: after.tripMode,
      status: after.status,
      version: after.version,
      removedContainerIds: removedLinks.map((l) => l.orderContainerId).join(','),
      reason,
    },
  });
  return { trip: after, affectedContainerIds, repriceContainerIds };
}

/**
 * Gỡ container khỏi chuyến khi hủy container hoặc Order (module Order gọi trong transaction hủy). Mỗi chuyến hoạt động chứa
 * container bị gỡ được khóa rồi gỡ; chuyến đang chạy (IN_TRANSIT) chặn việc hủy.
 */
export const detachContainersFromTrips: DetachFromTrips = async (
  tx,
  ctx,
  { orderContainerIds, reason },
) => {
  if (orderContainerIds.length === 0) return [];
  // Đọc có khóa để thấy liên kết mới nhất của người điều vận khác.
  const links = await tx.select(tripContainers, inArray(tripContainers.orderContainerId, orderContainerIds), {
    forUpdate: true,
  });
  const byTrip = new Map<string, string[]>();
  for (const link of links) {
    byTrip.set(link.tripId, [...(byTrip.get(link.tripId) ?? []), link.orderContainerId]);
  }

  const events: DispatchEvent[] = [];
  for (const tripId of [...byTrip.keys()].sort()) {
    const trip = await lockTrip(tx, tripId);
    if (trip.status === 'CANCELLED' || trip.status === 'COMPLETED') continue;
    if (!DETACHABLE.includes(trip.status)) {
      throw new AppError(
        'INVALID_STATUS_TRANSITION',
        'Container đang nằm trên chuyến đã chạy nên chưa hủy được. Hoàn tất hoặc hủy chuyến trước.',
      );
    }
    const outcome = await detachFromLockedTrip(tx, ctx, trip, byTrip.get(tripId)!, reason);
    events.push({
      type: 'dispatch.updated',
      tenantId: ctx.tenantId,
      tripId,
      version: outcome.trip.version,
      orderContainerIds: outcome.affectedContainerIds,
    });
  }
  return events;
};

export function createSplitService(deps: DispatchDeps) {
  async function removeContainerFromTrip(
    ctx: RequestContext,
    input: RemoveContainerFromTripInput,
  ): Promise<RemoveContainerResult> {
    authorize(ctx, 'dispatch.assign');
    const reason = input.reason?.trim() || 'Tách chuyến';

    let outcome: DetachOutcome & { assignments: Awaited<ReturnType<typeof listActive>> };
    async function listActive(tx: TenantDb, tripId: string) {
      return (
        await createDispatchRepo(tx).assignments.list(
          eq(dispatchAssignments.consolidatedTripId, tripId),
        )
      ).filter(isActiveAssignment);
    }
    try {
      outcome = await deps.tenantDb(ctx).transaction(
        async (tx) => {
          const trip = await lockTrip(tx, input.tripId, input.version);
          if (!DETACHABLE.includes(trip.status)) throw new AppError('INVALID_STATUS_TRANSITION');
          const repo = createDispatchRepo(tx);
          const links = await repo.tripContainers.list(eq(tripContainers.tripId, trip.id), {
            forUpdate: true,
          });
          if (!links.some((l) => l.orderContainerId === input.orderContainerId)) {
            throw new AppError('NOT_FOUND');
          }
          if (links.length === 1) throw new AppError('TRIP_LAST_CONTAINER');

          const detached = await detachFromLockedTrip(tx, ctx, trip, [input.orderContainerId], reason);
          return { ...detached, assignments: await listActive(tx, trip.id) };
        },
        { lockWaitTimeoutSec: LOCK_WAIT_TIMEOUT_SECONDS },
      );
    } catch (error) {
      if (isLockContentionError(error)) throw new AppError('RESOURCE_BUSY_RETRY');
      throw error;
    }

    await emit(deps, {
      type: 'dispatch.updated',
      tenantId: ctx.tenantId,
      tripId: outcome.trip.id,
      version: outcome.trip.version,
      orderContainerIds: outcome.affectedContainerIds,
    });
    return {
      trip: outcome.trip,
      assignments: outcome.assignments,
      warnings: [],
      removedContainerId: input.orderContainerId,
      repriceContainerIds: outcome.repriceContainerIds,
    };
  }

  return { removeContainerFromTrip };
}
