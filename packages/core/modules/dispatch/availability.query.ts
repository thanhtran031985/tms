// Tra cứu tài nguyên gán được cho một container và khung giờ, mỗi tài nguyên kèm lý do được hoặc không được điều
// (bảng gán xe Screen03 của task 07). Chỉ đọc thường, không khóa dòng nào; dùng đúng các hàm quy tắc của assignResources
// nên lý do khớp với lỗi người dùng sẽ gặp khi bấm gán.
import { and, eq, inArray, isNull } from 'drizzle-orm';
import {
  parseDispatchSettings,
  type ListResourceAvailabilityInput,
} from '@shared/schemas/dispatch';
import { AppError } from '@shared/errors';
import type { RequestContext } from '../../lib/context';
import {
  consolidatedTrips,
  drivers,
  orderContainers,
  tractors,
  trailers,
  tripContainers,
} from '../../lib/db/schema';
import type { DriverRow, TractorRow, TrailerRow } from '../fleet/repo';
import { loadTripContext } from './context';
import { authorize, ACTIVE_TRIP_STATUSES, type DispatchDeps } from './deps';
import { evaluateResource } from './evaluate';
import type { AvailabilityReason, AvailabilityResult, ResourceAvailability } from './index';
import { checkPhysical } from './rules/physical';
import { checkTwin20 } from './rules/twin20';
import { checkTripWeight } from './rules/weight';
import { mergeResults, type ResourceKind, type RuleResult } from './rules/types';

const CHUNK = 8; // dưới connectionLimit của pool để không chiếm hết kết nối

function toAvailability(id: string, label: string, result: RuleResult): ResourceAvailability {
  const reasons: AvailabilityReason[] = [
    ...result.errors.map((e) => ({
      code: e.code as string,
      severity: 'danger' as const,
      message: e.message,
      ...(e.details ? { details: e.details } : {}),
    })),
    ...result.warnings.map((w) => ({
      code: w.code,
      severity: w.severity,
      message: w.message,
      ...(w.details ? { details: w.details } : {}),
    })),
  ];
  if (reasons.length === 0) {
    reasons.push({ code: 'AVAILABLE', severity: 'info', message: 'Rảnh trong khung giờ này' });
  }
  return { id, label, available: result.errors.length === 0, reasons };
}

async function inChunks<T, R>(items: T[], run: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += CHUNK) {
    out.push(...(await Promise.all(items.slice(i, i + CHUNK).map(run))));
  }
  return out;
}

export function createAvailabilityQuery(deps: DispatchDeps) {
  async function listResourceAvailability(
    ctx: RequestContext,
    input: ListResourceAvailabilityInput,
  ): Promise<AvailabilityResult> {
    authorize(ctx, 'dispatch.view');
    const tdb = deps.tenantDb(ctx);
    const settings = parseDispatchSettings(await deps.loadSettings(ctx));
    const window = { start: input.start, end: input.end };

    const [container] = await tdb.select(
      orderContainers,
      eq(orderContainers.id, input.orderContainerId),
    );
    if (!container) throw new AppError('NOT_FOUND');

    // Assignment của chính chuyến hiện tại của container không tính là trùng giờ.
    const links = await tdb.select(
      tripContainers,
      eq(tripContainers.orderContainerId, container.id),
    );
    const activeTrip = links.length
      ? (
          await tdb.select(
            consolidatedTrips,
            and(
              inArray(
                consolidatedTrips.id,
                links.map((l) => l.tripId),
              ),
              inArray(consolidatedTrips.status, [...ACTIVE_TRIP_STATUSES]),
            ),
          )
        )[0]
      : undefined;
    const common = {
      window,
      now: deps.now(),
      ...(activeTrip ? { excludeTripId: activeTrip.id } : {}),
    };
    // Container đã nằm trong chuyến ghép: bảng gán xe xét cả chuyến (Rule 1, 2 cộng dồn, 5, 6), không chỉ container này.
    const tripContext = activeTrip ? await loadTripContext(tdb, activeTrip.id) : undefined;
    const containers = tripContext?.containers.length ? tripContext.containers : [container];
    const tripMode = activeTrip?.tripMode ?? 'SINGLE';
    const physical = (rows: {
      driver?: (typeof drivers)['$inferSelect'];
      trailer?: (typeof trailers)['$inferSelect'];
    }): RuleResult => {
      const result = mergeResults(
        ...containers.map((c) =>
          checkPhysical({
            container: c,
            driver: rows.driver,
            tractor: undefined,
            trailer: rows.trailer,
            plannedEnd: window.end,
            timeZone: ctx.timezone,
            confirmMissingWeight: true, // chỉ để cảnh báo thiếu khối lượng, không chặn từng dòng
            skipWeight: containers.length > 1,
          }),
        ),
      );
      if (containers.length > 1 && rows.trailer) {
        const twin = checkTwin20({ tripMode, containers, trailer: rows.trailer });
        const weight = checkTripWeight({
          containers,
          tractor: undefined,
          trailer: rows.trailer,
          confirmMissingWeight: true,
        });
        result.errors.push(...twin.errors, ...weight.errors);
        result.warnings.push(...twin.warnings, ...weight.warnings);
        if (tripMode === 'TWIN_20' && twin.errors.length === 0) {
          result.warnings.push({
            code: 'TWIN20_OK',
            severity: 'info',
            resource: 'TRAILER',
            message: 'Ghép TWIN_20 được',
          });
        }
      }
      return result;
    };

    const evaluate = async (
      kind: ResourceKind,
      row: DriverRow | TractorRow | TrailerRow,
      label: string,
      extra: RuleResult,
    ) => {
      const base = await evaluateResource(ctx, tdb, {
        ...common,
        resource: { kind, id: row.id, row, label },
        ...(kind === 'DRIVER' ? { maxDrivingHoursPerDay: settings.maxDrivingHoursPerDay } : {}),
      });
      // Quy tắc theo container chỉ hiển thị khi tài nguyên chưa bị chặn vì lý do khác ở bước đầu (trạng thái, xóa mềm).
      const blockedEarly = base.errors.some(
        (e) => e.reason === 'NOT_FOUND' || e.reason === 'INACTIVE',
      );
      return toAvailability(
        row.id,
        label,
        mergeResults(base, blockedEarly ? { errors: [], warnings: [] } : extra),
      );
    };

    const [driverRows, tractorRows, trailerRows] = await Promise.all([
      tdb.select(drivers, isNull(drivers.deletedAt)),
      tdb.select(tractors, isNull(tractors.deletedAt)),
      tdb.select(trailers, isNull(trailers.deletedAt)),
    ]);

    const sortByLabel = (a: ResourceAvailability, b: ResourceAvailability) =>
      a.label.localeCompare(b.label, 'vi');
    const [driverResults, tractorResults, trailerResults] = await Promise.all([
      inChunks(driverRows, (d) => evaluate('DRIVER', d, d.fullName, physical({ driver: d }))),
      inChunks(tractorRows, (t) =>
        evaluate('TRACTOR', t, t.plateNumber, { errors: [], warnings: [] }),
      ),
      inChunks(trailerRows, (t) => evaluate('TRAILER', t, t.plateNumber, physical({ trailer: t }))),
    ]);
    return {
      drivers: driverResults.sort(sortByLabel),
      tractors: tractorResults.sort(sortByLabel),
      trailers: trailerResults.sort(sortByLabel),
    };
  }

  return { listResourceAvailability };
}
