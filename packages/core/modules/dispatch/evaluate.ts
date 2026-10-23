// Đánh giá một bộ tài nguyên cho một khung giờ chuyến: khóa theo thứ tự cố định rồi gom lỗi và cảnh báo của mọi quy tắc.
// Dùng chung cho assignResources và updateTripTimes (đổi giờ chuyến đã gán phải kiểm tra lại như gán mới).
import { eq } from 'drizzle-orm';
import type { RequestContext } from '../../lib/context';
import { drivers, tractors, trailers } from '../../lib/db/schema';
import type { TenantDb } from '../../lib/db/tenant-db';
import type { DriverRow, TractorRow, TrailerRow } from '../fleet/repo';
import { checkMaintenance } from './rules/maintenance';
import { findAssignmentOverlaps, overlapError } from './rules/overlap';
import { checkResourceState } from './rules/resource-state';
import {
  mergeResults,
  noIssues,
  type ResourceKind,
  type RuleResult,
  type TimeWindow,
} from './rules/types';

export type ResourceIds = { driverId: string; tractorId: string; trailerId: string };
export type LockedResources = {
  driver: DriverRow | undefined;
  tractor: TractorRow | undefined;
  trailer: TrailerRow | undefined;
};

async function lockById<T extends typeof drivers | typeof tractors | typeof trailers>(
  tx: TenantDb,
  table: T,
  id: string,
): Promise<T['$inferSelect'] | undefined> {
  const [row] = await tx.select(table, eq(table.id, id), { forUpdate: true });
  return row;
}

/**
 * Khóa dòng (SELECT … FOR UPDATE) theo thứ tự cố định drivers -> tractors -> trailers để hai Điều vận ghép chéo không deadlock
 * (spec 03 mục 1 bước 2). Mỗi bảng một dòng nên đã tăng dần theo id. Trả undefined nếu không tồn tại hoặc khác tenant.
 */
export async function lockResources(tx: TenantDb, ids: ResourceIds): Promise<LockedResources> {
  const driver = await lockById(tx, drivers, ids.driverId);
  const tractor = await lockById(tx, tractors, ids.tractorId);
  const trailer = await lockById(tx, trailers, ids.trailerId);
  return { driver, tractor, trailer };
}

type Resource = {
  kind: ResourceKind;
  id: string;
  row: { status: string; deletedAt: Date | null } | undefined;
  label: string;
};

/**
 * Quy tắc theo từng tài nguyên: tồn tại + trạng thái, chồng lấn assignment, bảo dưỡng (đầu kéo và rơ moóc).
 * Dùng chung cho assignResources (sau khi khóa) và listResourceAvailability (không khóa).
 */
export async function evaluateResource(
  ctx: RequestContext,
  tdb: TenantDb,
  input: { resource: Resource; window: TimeWindow; now: Date; excludeTripId?: string },
): Promise<RuleResult> {
  const { resource, window, now, excludeTripId } = input;
  const result = noIssues();

  const stateError = checkResourceState({
    kind: resource.kind,
    row: resource.row,
    label: resource.label,
    start: window.start,
    now,
  });
  if (stateError) {
    // Tài nguyên không dùng được thì các kiểm tra sau vô nghĩa.
    result.errors.push(stateError);
    return result;
  }

  const conflicts = await findAssignmentOverlaps(tdb, {
    kind: resource.kind,
    resourceId: resource.id,
    window,
    ...(excludeTripId ? { excludeTripId } : {}),
  });
  const conflict = overlapError(resource.kind, resource.label, conflicts);
  if (conflict) result.errors.push(conflict);

  if (resource.kind !== 'DRIVER') {
    const maintenance = await checkMaintenance(ctx, tdb, {
      kind: resource.kind,
      resourceId: resource.id,
      label: resource.label,
      window,
    });
    if (maintenance) result.errors.push(maintenance);
  }
  return result;
}

/** Đánh giá cả ba tài nguyên đã khóa của một chuyến. Phải gọi SAU lockResources. */
export async function evaluateAssignment(
  ctx: RequestContext,
  tx: TenantDb,
  input: {
    tripId: string;
    window: TimeWindow;
    ids: ResourceIds;
    locked: LockedResources;
    now: Date;
  },
): Promise<RuleResult> {
  const { tripId, window, ids, locked, now } = input;
  const common = { window, now, excludeTripId: tripId };
  return mergeResults(
    await evaluateResource(ctx, tx, {
      ...common,
      resource: {
        kind: 'DRIVER',
        id: ids.driverId,
        row: locked.driver,
        label: locked.driver?.fullName ?? '',
      },
    }),
    await evaluateResource(ctx, tx, {
      ...common,
      resource: {
        kind: 'TRACTOR',
        id: ids.tractorId,
        row: locked.tractor,
        label: locked.tractor?.plateNumber ?? '',
      },
    }),
    await evaluateResource(ctx, tx, {
      ...common,
      resource: {
        kind: 'TRAILER',
        id: ids.trailerId,
        row: locked.trailer,
        label: locked.trailer?.plateNumber ?? '',
      },
    }),
  );
}
