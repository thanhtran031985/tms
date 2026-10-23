// Chồng lấn thời gian với assignment còn hiệu lực (spec 03 mục 1 bước 3; spec 01 mục 3). Chỉ dựa vào khung giờ kế hoạch,
// không dựa vào `status` của tài nguyên: xe đang chạy chuyến sáng vẫn xếp được chuyến chiều.
import { and, eq, gt, isNull, lt, ne, notInArray, or } from 'drizzle-orm';
import { consolidatedTrips, dispatchAssignments } from '../../../lib/db/schema';
import type { TenantDb } from '../../../lib/db/tenant-db';
import { INACTIVE_ASSIGNMENT_STATUSES } from '../deps';
import type { AssignmentRow } from '../repo';
import { RESOURCE_NOUN, type ResourceKind, type RuleError, type TimeWindow } from './types';

const COLUMN = {
  DRIVER: dispatchAssignments.driverId,
  TRACTOR: dispatchAssignments.tractorId,
  TRAILER: dispatchAssignments.trailerId,
} as const;

export type OverlapConflict = { assignment: AssignmentRow; tripCode: string | null };

/**
 * Assignment còn hiệu lực của tài nguyên giao với `window` (planned_start < end AND planned_end > start; sát giờ không tính),
 * bỏ qua các dòng của chính chuyến `excludeTripId`. Dùng index idx_assign_*_time. Không khóa dòng nào.
 * Phải gọi SAU khi đã khóa tài nguyên để thấy dữ liệu đã commit của người đi trước.
 */
export async function findAssignmentOverlaps(
  tdb: TenantDb,
  input: { kind: ResourceKind; resourceId: string; window: TimeWindow; excludeTripId?: string },
): Promise<OverlapConflict[]> {
  const { kind, resourceId, window, excludeTripId } = input;
  const rows = await tdb.select(
    dispatchAssignments,
    and(
      eq(COLUMN[kind], resourceId),
      notInArray(dispatchAssignments.status, INACTIVE_ASSIGNMENT_STATUSES),
      lt(dispatchAssignments.plannedStart, window.end),
      gt(dispatchAssignments.plannedEnd, window.start),
      excludeTripId
        ? or(
            isNull(dispatchAssignments.consolidatedTripId),
            ne(dispatchAssignments.consolidatedTripId, excludeTripId),
          )
        : undefined,
    ),
  );
  if (rows.length === 0) return [];

  const tripIds = [
    ...new Set(rows.map((r) => r.consolidatedTripId).filter((id): id is string => !!id)),
  ];
  const tripCodes = new Map<string, string>();
  for (const id of tripIds) {
    const [trip] = await tdb.select(consolidatedTrips, eq(consolidatedTrips.id, id));
    if (trip) tripCodes.set(id, trip.tripCode);
  }
  return rows.map((assignment) => ({
    assignment,
    tripCode: assignment.consolidatedTripId
      ? (tripCodes.get(assignment.consolidatedTripId) ?? null)
      : null,
  }));
}

export function overlapError(
  kind: ResourceKind,
  label: string,
  conflicts: OverlapConflict[],
): RuleError | null {
  const first = conflicts[0];
  if (!first) return null;
  const where = first.tripCode ? `chuyến ${first.tripCode}` : 'một chuyến khác';
  return {
    code: 'RESOURCE_TIME_CONFLICT',
    resource: kind,
    reason: 'TIME_CONFLICT',
    message: `${RESOURCE_NOUN[kind]} ${label} trùng giờ với ${where}.`,
    details: {
      resource: kind,
      reason: 'TIME_CONFLICT',
      ...(first.tripCode ? { conflictTripCode: first.tripCode } : {}),
    },
  };
}
