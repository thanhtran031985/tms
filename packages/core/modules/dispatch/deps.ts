// Phần dùng chung của service điều vận: phụ thuộc đầu vào, kiểm quyền, khóa chuyến, ảnh chụp audit, phát sự kiện.
import { and, eq } from 'drizzle-orm';
import {
  ASSIGNMENT_INACTIVE_STATUSES,
  type AssignmentStatus,
  type TripStatus,
} from '@shared/enums';
import { AppError } from '@shared/errors';
import type { RequestContext } from '../../lib/context';
import { consolidatedTrips } from '../../lib/db/schema';
import type { TenantDb } from '../../lib/db/tenant-db';
import { can, type Permission } from '../identity/permissions';
import type { DispatchEvent, PricingEvent } from '../../lib/redis/publish';
import type { TripRow } from './repo';

export type DispatchDeps = {
  tenantDb: (ctx: RequestContext) => TenantDb;
  now: () => Date;
  loadSettings: (ctx: RequestContext) => Promise<unknown>;
  publish: (event: DispatchEvent) => Promise<void>;
  /** Báo worker tính lại giá (task 08); bỏ trống thì chỉ dựa vào cờ repriceRequired và job quét. */
  publishPricing?: (event: PricingEvent) => Promise<void>;
};

/** Chờ khóa dòng tối đa ngần này giây rồi trả RESOURCE_BUSY_RETRY (spec 03 mục 1 bước 8). */
export const LOCK_WAIT_TIMEOUT_SECONDS = 5;

/** Chuyến còn hoạt động: container của chuyến này chưa được lập chuyến khác. */
export const ACTIVE_TRIP_STATUSES: readonly TripStatus[] = ['PLANNED', 'DISPATCHED', 'IN_TRANSIT'];

/** Assignment không còn tính cho chồng lấn (spec 03 mục 1 bước 3). */
export const INACTIVE_ASSIGNMENT_STATUSES: AssignmentStatus[] = [...ASSIGNMENT_INACTIVE_STATUSES];
export const isActiveAssignment = (a: { status: AssignmentStatus }) =>
  !INACTIVE_ASSIGNMENT_STATUSES.includes(a.status);

export function authorize(ctx: RequestContext, permission: Permission): void {
  if (!can(ctx.role, permission)) throw new AppError('FORBIDDEN');
}

export function invalid(field: string, message: string): AppError {
  return new AppError('VALIDATION_ERROR', message, { field });
}

// Ảnh chụp bản ghi cho audit: bỏ mốc thời gian kỹ thuật, giữ nguyên giá trị nghiệp vụ.
export function snapshot(row: object): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...row };
  delete copy.createdAt;
  delete copy.updatedAt;
  return copy;
}

/**
 * Khóa dòng chuyến (SELECT … FOR UPDATE) rồi kiểm tra khóa lạc quan. Chuyến không thuộc tenant hoặc không tồn tại: NOT_FOUND.
 * Là lần đọc đầu tiên của transaction, đúng yêu cầu "mọi đọc trước khóa tài nguyên đều là locking read".
 */
export async function lockTrip(tx: TenantDb, tripId: string, version?: number): Promise<TripRow> {
  const [trip] = await tx.select(consolidatedTrips, eq(consolidatedTrips.id, tripId), {
    forUpdate: true,
  });
  if (!trip) throw new AppError('NOT_FOUND');
  if (version !== undefined && trip.version !== version) throw new AppError('STALE_DATA');
  return trip;
}

/** Cập nhật chuyến với khóa lạc quan: `WHERE id AND version`, không dòng nào bị ảnh hưởng thì STALE_DATA. */
export async function updateTripWithVersion(
  tx: TenantDb,
  trip: TripRow,
  set: Partial<Omit<typeof consolidatedTrips.$inferInsert, 'tenantId' | 'id' | 'version'>>,
): Promise<void> {
  const changed = await tx.update(
    consolidatedTrips,
    { ...set, version: trip.version + 1 },
    and(eq(consolidatedTrips.id, trip.id), eq(consolidatedTrips.version, trip.version)),
  );
  if (changed !== 1) throw new AppError('STALE_DATA');
}

/** Phát sự kiện SAU commit. Lỗi phát (Redis tắt…) không làm hỏng thao tác đã commit. */
export async function emit(deps: DispatchDeps, event: DispatchEvent): Promise<void> {
  try {
    await deps.publish(event);
  } catch {
    // Kanban sẽ đồng bộ lại khi tải trang; không ném lỗi cho người gọi.
  }
}

/** Phát sự kiện tính lại giá SAU commit khi có container bị đánh dấu. Lỗi phát không ảnh hưởng: job quét sẽ nhặt cờ treo. */
export async function emitReprice(
  deps: DispatchDeps,
  tenantId: string,
  orderContainerIds: string[],
): Promise<void> {
  if (orderContainerIds.length === 0 || !deps.publishPricing) return;
  try {
    await deps.publishPricing({ type: 'pricing.reprice_required', tenantId, orderContainerIds });
  } catch {
    // Job quét cờ treo sẽ xử lý.
  }
}
