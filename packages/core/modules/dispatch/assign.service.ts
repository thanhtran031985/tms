// Gán tài xế + đầu kéo + rơ moóc cho chuyến (spec 03 mục 1, ADR-004, task 06 bước 4).
// Khóa bi quan theo thứ tự cố định drivers -> tractors -> trailers; mọi đọc thường (consistent read) chỉ diễn ra SAU khi đã khóa
// để thấy dữ liệu đã commit của người đi trước. Lỗi trả bằng AppError, Server Action chuyển thành Result.
import { and, asc, eq, inArray, notInArray } from 'drizzle-orm';
import { AppError } from '@shared/errors';
import type { AssignResourcesInput } from '@shared/schemas/dispatch';
import { writeAudit } from '../../lib/audit';
import type { RequestContext } from '../../lib/context';
import { isLockContentionError } from '../../lib/db/errors';
import { dispatchAssignments, orderStops, tripContainers } from '../../lib/db/schema';
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
import { evaluateAssignment, lockResources } from './evaluate';
import type { TripResult } from './index';
import { createDispatchRepo, type AssignmentRow, type TripRow } from './repo';

export function createAssignService(deps: DispatchDeps) {
  async function assignResources(
    ctx: RequestContext,
    input: AssignResourcesInput,
  ): Promise<TripResult> {
    authorize(ctx, 'dispatch.assign');

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

          // 3) Sau khi giữ khóa mới đọc thường: kiểm tra quy tắc.
          const window = { start: trip.plannedStart, end: trip.plannedEnd };
          const evaluated = await evaluateAssignment(ctx, tx, {
            tripId: trip.id,
            window,
            ids,
            locked,
            now: deps.now(),
          });
          const blocking = evaluated.errors[0];
          if (blocking) throw new AppError(blocking.code, blocking.message, blocking.details);

          // 4) Ghi: hủy assignment cũ của chuyến (gán lại), tạo mới một dòng cho mỗi Stop, đồng bộ primary*, tăng version, audit.
          const repo = createDispatchRepo(tx);
          const links = await tx.select(tripContainers, eq(tripContainers.tripId, trip.id));
          const containerIds = links.map((l) => l.orderContainerId);
          const stops = containerIds.length
            ? (
                await tx.select(orderStops, inArray(orderStops.orderContainerId, containerIds), {
                  orderBy: [asc(orderStops.orderContainerId), asc(orderStops.sequenceNo)],
                })
              ).filter((s) => s.status !== 'SKIPPED')
            : [];
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
              driverId: input.driverId,
              tractorId: input.tractorId,
              trailerId: input.trailerId,
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
            primaryDriverId: input.driverId,
            primaryTractorId: input.tractorId,
            primaryTrailerId: input.trailerId,
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
              primaryDriverId: input.driverId,
              primaryTractorId: input.tractorId,
              primaryTrailerId: input.trailerId,
              version: trip.version + 1,
              assignmentIds: created.map((a) => a.id).join(','),
            },
          });

          return {
            trip: (await repo.trips.get(trip.id))!,
            assignments: created,
            warnings: evaluated.warnings,
            orderContainerIds: containerIds,
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
    return { trip: outcome.trip, assignments: outcome.assignments, warnings: outcome.warnings };
  }

  return { assignResources };
}
