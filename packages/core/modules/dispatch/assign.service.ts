// Gán tài xế + đầu kéo + rơ moóc cho chuyến (spec 03 mục 1, ADR-004, task 06 bước 4).
// Khóa bi quan theo thứ tự cố định drivers -> tractors -> trailers; mọi đọc thường (consistent read) chỉ diễn ra SAU khi đã khóa
// để thấy dữ liệu đã commit của người đi trước. Lỗi trả bằng AppError, Server Action chuyển thành Result.
import { and, eq, inArray, isNull, ne, notInArray, or } from 'drizzle-orm';
import type { TripMode } from '@shared/enums';
import { AppError } from '@shared/errors';
import {
  parseDispatchSettings,
  type AssignResourcesInput,
  type CancelAssignmentInput,
  type TenantDispatchSettings,
} from '@shared/schemas/dispatch';
import { writeAudit } from '../../lib/audit';
import type { RequestContext } from '../../lib/context';
import { isLockContentionError } from '../../lib/db/errors';
import { dispatchAssignments, drivers, tractors, trailers } from '../../lib/db/schema';
import type { TenantDb } from '../../lib/db/tenant-db';
import { can } from '../identity/permissions';
import { loadTripContext, type TripContext } from './context';
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
import {
  evaluateAssignment,
  lockResources,
  type LockedResources,
  type ResourceIds,
} from './evaluate';
import type { TripResult } from './index';
import { createDispatchRepo, type AssignmentRow, type TripRow } from './repo';

export type ApplyAssignmentInput = {
  /** Chuyến đã khóa, trạng thái PLANNED. */
  trip: TripRow;
  /** Chế độ chạy áp quy tắc; khác trip.tripMode khi đang ghép thêm container (chuyến SINGLE sắp thành TWIN_20). */
  tripMode: TripMode;
  ids: ResourceIds;
  /** Kết quả lockResources: phải khóa TRƯỚC khi gọi. */
  locked: LockedResources;
  context: TripContext;
  settings: TenantDispatchSettings;
  confirmMissingWeight: boolean;
  overrideDrivingHours: { reason: string } | null;
  /** Cập nhật thêm cho chuyến trong cùng lần tăng version (vd. tripMode khi ghép thêm container). */
  tripSet?: Parameters<typeof updateTripWithVersion>[2];
};

/**
 * Đánh giá rồi ghi gán tài nguyên cho chuyến trong transaction của người gọi: hủy assignment cũ của chuyến (gán lại), tạo mới
 * một dòng cho mỗi Stop, đồng bộ primary*, tăng version, audit. Người gọi đã khóa chuyến và tài nguyên theo thứ tự cố định
 * (spec 03 mục 1). Dùng chung cho assignResources, createConsolidatedTrip và addContainerToTrip.
 */
export async function applyAssignment(
  ctx: RequestContext,
  tx: TenantDb,
  deps: DispatchDeps,
  input: ApplyAssignmentInput,
): Promise<{ trip: TripRow; assignments: AssignmentRow[]; warnings: TripResult['warnings'] }> {
  const { trip, ids, locked, context, settings } = input;
  const window = { start: trip.plannedStart, end: trip.plannedEnd };
  const evaluated = await evaluateAssignment(ctx, tx, {
    tripId: trip.id,
    tripMode: input.tripMode,
    window,
    ids,
    locked,
    context,
    now: deps.now(),
    options: {
      maxDrivingHoursPerDay: settings.maxDrivingHoursPerDay,
      confirmMissingWeight: input.confirmMissingWeight,
      overrideDrivingHours: input.overrideDrivingHours,
    },
  });
  const blocking = evaluated.errors[0];
  if (blocking) throw new AppError(blocking.code, blocking.message, blocking.details);

  // Ghi: hủy assignment cũ của chuyến (gán lại), tạo mới một dòng cho mỗi Stop, đồng bộ primary*, tăng version, audit.
  const repo = createDispatchRepo(tx);
  const stops = context.stops;
  if (stops.length === 0) {
    throw new AppError('VALIDATION_ERROR', 'Container của chuyến chưa có Stop để gán.', {
      field: 'tripId',
    });
  }

  const previous = (
    await repo.assignments.list(eq(dispatchAssignments.consolidatedTripId, trip.id))
  ).filter(isActiveAssignment);
  for (const old of previous) {
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

  const now = deps.now();
  const inserted = await repo.assignments.insertMany(
    stops.map((stop) => ({
      consolidatedTripId: trip.id,
      stopId: stop.id,
      assignmentType: 'INTERNAL_FLEET' as const,
      driverId: ids.driverId,
      tractorId: ids.tractorId,
      trailerId: ids.trailerId,
      plannedStart: window.start,
      plannedEnd: window.end,
      dispatchedAt: now,
      createdBy: ctx.userId,
    })),
  );
  // insertMany trả đúng giá trị đã ghi (không có mặc định của DB như status, version): đọc lại bản đầy đủ.
  const created = await repo.assignments.list(
    inArray(
      dispatchAssignments.id,
      inserted.map((a) => a.id),
    ),
  );
  for (const assignment of created) {
    await writeAudit(tx, ctx, {
      entity: 'dispatch_assignments',
      entityId: assignment.id,
      action: 'CREATE',
      before: null,
      after: snapshot(assignment),
    });
  }

  await updateTripWithVersion(tx, trip, {
    ...input.tripSet,
    primaryDriverId: ids.driverId,
    primaryTractorId: ids.tractorId,
    primaryTrailerId: ids.trailerId,
  });
  await writeAudit(tx, ctx, {
    entity: 'consolidated_trips',
    entityId: trip.id,
    action: 'ASSIGN',
    before: {
      primaryDriverId: trip.primaryDriverId,
      primaryTractorId: trip.primaryTractorId,
      primaryTrailerId: trip.primaryTrailerId,
      version: trip.version,
    },
    after: {
      primaryDriverId: ids.driverId,
      primaryTractorId: ids.tractorId,
      primaryTrailerId: ids.trailerId,
      version: trip.version + 1,
      assignmentIds: created.map((a) => a.id).join(','),
      ...(evaluated.drivingHoursOverrideReason
        ? { drivingHoursOverrideReason: evaluated.drivingHoursOverrideReason }
        : {}),
    },
  });

  return {
    trip: (await repo.trips.get(trip.id))!,
    assignments: created,
    warnings: evaluated.warnings,
  };
}

export function createAssignService(deps: DispatchDeps) {
  async function assignResources(
    ctx: RequestContext,
    input: AssignResourcesInput,
  ): Promise<TripResult> {
    authorize(ctx, 'dispatch.assign');
    // Chỉ Quản trị được ghi đè giờ lái; role khác gửi cờ này bị từ chối ngay, kể cả khi chưa vượt giờ.
    if (input.overrideDrivingHours && !can(ctx.role, 'dispatch.overrideDriveHours')) {
      throw new AppError('DRIVING_HOURS_OVERRIDE_FORBIDDEN');
    }
    const settings = parseDispatchSettings(await deps.loadSettings(ctx));

    let outcome: {
      trip: TripRow;
      assignments: AssignmentRow[];
      warnings: TripResult['warnings'];
      orderContainerIds: string[];
    };
    try {
      outcome = await deps.tenantDb(ctx).transaction(
        async (tx) => {
          // 1) Mọi lần đọc trước khi có khóa tài nguyên đều là locking read: chuyến rồi tới tài nguyên.
          const trip = await lockTrip(tx, input.tripId, input.version);
          if (trip.status !== 'PLANNED') throw new AppError('INVALID_STATUS_TRANSITION');

          // 2) Thứ tự khóa cố định drivers -> tractors -> trailers (xem lockResources).
          const ids = {
            driverId: input.driverId,
            tractorId: input.tractorId,
            trailerId: input.trailerId,
          };
          const locked = await lockResources(tx, ids);

          // 3) Sau khi giữ khóa mới đọc thường: kiểm tra quy tắc rồi ghi (dùng chung với ghép chuyến).
          const context = await loadTripContext(tx, trip.id);
          const applied = await applyAssignment(ctx, tx, deps, {
            trip,
            tripMode: trip.tripMode,
            ids,
            locked,
            context,
            settings,
            confirmMissingWeight: input.confirmMissingWeight === true,
            overrideDrivingHours: input.overrideDrivingHours ?? null,
          });
          return { ...applied, orderContainerIds: context.orderContainerIds };
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
      orderContainerIds: outcome.orderContainerIds,
    });
    return { trip: outcome.trip, assignments: outcome.assignments, warnings: outcome.warnings };
  }

  /**
   * Hủy mọi assignment đang hoạt động của chuyến (spec 03 mục 4): chuyển CANCELLED, không xóa. Xóa primary*, chuyến về PLANNED.
   * Tài xế ON_DUTY, đầu kéo/rơ moóc IN_USE trở về AVAILABLE nếu không còn assignment hoạt động nào khác giữ chúng.
   */
  async function cancelAssignment(
    ctx: RequestContext,
    input: CancelAssignmentInput,
  ): Promise<TripResult> {
    authorize(ctx, 'dispatch.assign');

    let outcome: { trip: TripRow; orderContainerIds: string[] };
    try {
      outcome = await deps.tenantDb(ctx).transaction(
        async (tx) => {
          const trip = await lockTrip(tx, input.tripId, input.version);
          if (trip.status !== 'PLANNED' && trip.status !== 'DISPATCHED') {
            throw new AppError('INVALID_STATUS_TRANSITION');
          }
          // Khóa tài nguyên theo thứ tự cố định (từ primary* của dòng chuyến đã khóa) trước mọi đọc thường.
          const locked = await lockResources(tx, {
            driverId: trip.primaryDriverId,
            tractorId: trip.primaryTractorId,
            trailerId: trip.primaryTrailerId,
          });

          const repo = createDispatchRepo(tx);
          const active = (
            await repo.assignments.list(eq(dispatchAssignments.consolidatedTripId, trip.id))
          ).filter(isActiveAssignment);
          if (active.length === 0) {
            throw new AppError('VALIDATION_ERROR', 'Chuyến chưa có assignment nào để hủy.', {
              field: 'tripId',
            });
          }

          for (const assignment of active) {
            await repo.assignments.update(assignment.id, {
              status: 'CANCELLED',
              version: assignment.version + 1,
            });
            await writeAudit(tx, ctx, {
              entity: 'dispatch_assignments',
              entityId: assignment.id,
              action: 'CANCEL',
              before: snapshot(assignment),
              after: {
                ...snapshot(assignment),
                status: 'CANCELLED',
                version: assignment.version + 1,
              },
            });
          }

          // Trả tài nguyên về AVAILABLE khi không còn assignment hoạt động nào khác giữ chúng.
          const stillHeld = async (column: 'driverId' | 'tractorId' | 'trailerId', id: string) =>
            (
              await tx.select(
                dispatchAssignments,
                and(
                  eq(dispatchAssignments[column], id),
                  notInArray(dispatchAssignments.status, INACTIVE_ASSIGNMENT_STATUSES),
                  or(
                    isNull(dispatchAssignments.consolidatedTripId),
                    ne(dispatchAssignments.consolidatedTripId, trip.id),
                  ),
                ),
                { limit: 1 },
              )
            ).length > 0;
          const { driver, tractor, trailer } = locked;
          if (driver && driver.status === 'ON_DUTY' && !(await stillHeld('driverId', driver.id))) {
            await tx.update(
              drivers,
              { status: 'AVAILABLE', version: driver.version + 1 },
              eq(drivers.id, driver.id),
            );
          }
          if (
            tractor &&
            tractor.status === 'IN_USE' &&
            !(await stillHeld('tractorId', tractor.id))
          ) {
            await tx.update(
              tractors,
              { status: 'AVAILABLE', version: tractor.version + 1 },
              eq(tractors.id, tractor.id),
            );
          }
          if (
            trailer &&
            trailer.status === 'IN_USE' &&
            !(await stillHeld('trailerId', trailer.id))
          ) {
            await tx.update(
              trailers,
              { status: 'AVAILABLE', version: trailer.version + 1 },
              eq(trailers.id, trailer.id),
            );
          }

          await updateTripWithVersion(tx, trip, {
            primaryDriverId: null,
            primaryTractorId: null,
            primaryTrailerId: null,
            status: 'PLANNED',
          });
          const updated = (await repo.trips.get(trip.id))!;
          await writeAudit(tx, ctx, {
            entity: 'consolidated_trips',
            entityId: trip.id,
            action: 'CANCEL_ASSIGNMENT',
            before: {
              status: trip.status,
              primaryDriverId: trip.primaryDriverId,
              primaryTractorId: trip.primaryTractorId,
              primaryTrailerId: trip.primaryTrailerId,
              version: trip.version,
            },
            after: {
              status: updated.status,
              primaryDriverId: null,
              primaryTractorId: null,
              primaryTrailerId: null,
              version: updated.version,
              cancelledAssignmentIds: active.map((a) => a.id).join(','),
            },
          });
          return {
            trip: updated,
            orderContainerIds: (await loadTripContext(tx, trip.id)).orderContainerIds,
          };
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
      orderContainerIds: outcome.orderContainerIds,
    });
    return { trip: outcome.trip, assignments: [], warnings: [] };
  }

  return { assignResources, cancelAssignment };
}
