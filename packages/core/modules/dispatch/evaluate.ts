// Đánh giá một bộ tài nguyên cho một khung giờ chuyến: khóa theo thứ tự cố định rồi gom lỗi và cảnh báo của mọi quy tắc.
// Dùng chung cho assignResources, updateTripTimes (đổi giờ chuyến đã gán phải kiểm tra lại như gán mới) và listResourceAvailability.
import { eq } from 'drizzle-orm';
import type { RequestContext } from '../../lib/context';
import { drivers, tractors, trailers } from '../../lib/db/schema';
import type { TenantDb } from '../../lib/db/tenant-db';
import type { DriverRow, TractorRow, TrailerRow } from '../fleet/repo';
import type { TripContext } from './context';
import { checkDocuments, documentsOf } from './rules/documents';
import {
  drivingHoursError,
  findDrivingHoursExcess,
  loadDriverIntervals,
} from './rules/driving-hours';
import { checkMaintenance } from './rules/maintenance';
import { findAssignmentOverlaps, overlapError } from './rules/overlap';
import { checkCutOff, checkPhysical } from './rules/physical';
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

type ResourceRow = DriverRow | TractorRow | TrailerRow;
type Resource = { kind: ResourceKind; id: string; row: ResourceRow | undefined; label: string };

/**
 * Quy tắc theo từng tài nguyên: tồn tại + trạng thái, chồng lấn assignment, bảo dưỡng (đầu kéo và rơ moóc), giấy tờ tại giờ kết thúc
 * và (tài xế) giờ lái trong ngày khi có `maxDrivingHoursPerDay`. Dùng chung cho assignResources (sau khi khóa) và
 * listResourceAvailability (không khóa).
 */
export async function evaluateResource(
  ctx: RequestContext,
  tdb: TenantDb,
  input: {
    resource: Resource;
    window: TimeWindow;
    now: Date;
    excludeTripId?: string;
    maxDrivingHoursPerDay?: number;
  },
): Promise<RuleResult> {
  const { resource, window, now, excludeTripId, maxDrivingHoursPerDay } = input;
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

  const documents = checkDocuments({
    kind: resource.kind,
    label: resource.label,
    items: documentsOf(resource.kind, resource.row),
    plannedEnd: window.end,
    timeZone: ctx.timezone,
  });
  result.errors.push(...documents.errors);
  result.warnings.push(...documents.warnings);

  if (resource.kind === 'DRIVER' && maxDrivingHoursPerDay !== undefined) {
    const excess = findDrivingHoursExcess({
      existing: await loadDriverIntervals(tdb, {
        driverId: resource.id,
        window,
        timeZone: ctx.timezone,
        ...(excludeTripId ? { excludeTripId } : {}),
      }),
      window,
      timeZone: ctx.timezone,
      limitHours: maxDrivingHoursPerDay,
    });
    if (excess) result.errors.push(drivingHoursError(resource.label, excess));
  }
  return result;
}

export type AssignmentOptions = {
  maxDrivingHoursPerDay: number;
  confirmMissingWeight: boolean;
  /** Đã kiểm quyền ADMIN ở service; có thì lỗi vượt giờ lái được chuyển thành cảnh báo. */
  overrideDrivingHours?: { reason: string } | null;
};

export type AssignmentEvaluation = RuleResult & {
  /** Lý do ghi đè giờ lái đã được áp dụng (để audit), có khi thật sự vượt giờ và có ghi đè. */
  drivingHoursOverrideReason?: string;
};

/** Đánh giá cả ba tài nguyên đã khóa của một chuyến cùng ràng buộc theo container. Phải gọi SAU lockResources. */
export async function evaluateAssignment(
  ctx: RequestContext,
  tx: TenantDb,
  input: {
    tripId: string;
    window: TimeWindow;
    ids: ResourceIds;
    locked: LockedResources;
    context: TripContext;
    now: Date;
    options: AssignmentOptions;
  },
): Promise<AssignmentEvaluation> {
  const { tripId, window, ids, locked, context, now, options } = input;
  const common = { window, now, excludeTripId: tripId };

  const resources = mergeResults(
    await evaluateResource(ctx, tx, {
      ...common,
      maxDrivingHoursPerDay: options.maxDrivingHoursPerDay,
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

  // Ràng buộc theo container: chỉ xét khi cả ba tài nguyên dùng được, tránh báo lỗi vật lý trên tài nguyên không tồn tại.
  const containerRules = noIssues();
  if (resources.errors.length === 0) {
    for (const container of context.containers) {
      const physical = checkPhysical({
        container,
        driver: locked.driver,
        tractor: locked.tractor,
        trailer: locked.trailer,
        plannedEnd: window.end,
        timeZone: ctx.timezone,
        confirmMissingWeight: options.confirmMissingWeight,
      });
      const order = context.orders.get(container.orderId);
      const cutOff = order
        ? checkCutOff({
            order,
            stops: context.stops.filter((s) => s.orderContainerId === container.id),
            plannedEnd: window.end,
            containerLabel: container.containerNo ?? `dòng ${container.lineNo}`,
          })
        : noIssues();
      containerRules.errors.push(...physical.errors, ...cutOff.errors);
      containerRules.warnings.push(...physical.warnings, ...cutOff.warnings);
    }
  }

  const merged = mergeResults(resources, containerRules);
  const override = options.overrideDrivingHours;
  const exceeded = merged.errors.find((e) => e.code === 'DRIVING_HOURS_EXCEEDED');
  if (exceeded && override) {
    return {
      errors: merged.errors.filter((e) => e !== exceeded),
      warnings: [
        ...merged.warnings,
        {
          code: 'DRIVING_HOURS_OVERRIDDEN',
          severity: 'warn',
          resource: 'DRIVER',
          message: `${exceeded.message} Quản trị đã ghi đè: ${override.reason}`,
          ...(exceeded.details ? { details: exceeded.details } : {}),
        },
      ],
      drivingHoursOverrideReason: override.reason,
    };
  }
  return merged;
}
