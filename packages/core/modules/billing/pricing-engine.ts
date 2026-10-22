// Pricing Engine 4D (spec 06 mục 1–2, ADR-005): một câu truy vấn có WHERE đầy đủ và ORDER BY theo điểm ưu tiên.
//   Priority 0: khách riêng + đúng chế độ chạy      Priority 2: khách riêng + SINGLE
//   Priority 1: giá chung   + đúng chế độ chạy      Priority 3: giá chung   + SINGLE
// Điều kiện BẮT BUỘC trong WHERE: customer IN (khách, NULL), trip_mode IN (chế độ, SINGLE), isActive, validFrom ≤ ngày
// ≤ validTo hoặc validTo NULL. Thiếu một trong các điều kiện này thì biểu thức ưu tiên sẽ trả giá riêng của khách khác.
// Không tìm thấy giá thì trả TARIFF_NOT_FOUND, tuyệt đối không trả 0.
import { and, asc, desc, eq, gte, inArray, isNull, lte, or, sql, type SQL } from 'drizzle-orm';
import type { AnyMySqlColumn } from 'drizzle-orm/mysql-core';
import type { ContainerType, TripMode } from '@shared/enums';
import { fail, ok, type Result } from '@shared/result';
import { feeTariffs, freightTariffs } from '../../lib/db/schema';
import type { TenantDb } from '../../lib/db/tenant-db';
import { toTenantDate } from '../../lib/time';
import type { FeeTariffRow, FreightTariffRow } from './repo';

export type LookupKey = {
  routeId: string;
  containerType: ContainerType;
  tripMode: TripMode;
  /** null = tra giá/phí chung (vd. định mức chi phí của chuyến ghép hai khách). */
  customerId: string | null;
  /** 'YYYY-MM-DD' theo múi giờ tenant. Dùng tariffDateOf để đổi từ một thời điểm; không tự cắt bằng new Date(). */
  targetDate: string;
};

/** Ngày dương lịch của một thời điểm theo múi giờ của tenant (Rule 6). */
export function tariffDateOf(ctx: { timezone: string }, instant: Date): string {
  return toTenantDate(instant, ctx.timezone);
}

const priorityExpr = (customer: AnyMySqlColumn, mode: AnyMySqlColumn, target: TripMode) => sql`
  CASE
    WHEN ${customer} IS NOT NULL AND ${mode} = ${target} THEN 0
    WHEN ${customer} IS NULL     AND ${mode} = ${target} THEN 1
    WHEN ${customer} IS NOT NULL AND ${mode} = 'SINGLE'  THEN 2
    ELSE 3
  END`;

type TariffColumns = {
  containerType: AnyMySqlColumn;
  tripMode: AnyMySqlColumn;
  customerId: AnyMySqlColumn;
  isActive: AnyMySqlColumn;
  validFrom: AnyMySqlColumn;
  validTo: AnyMySqlColumn;
};

// Phần WHERE chung của giá cước và bảng phí (chưa gồm tuyến và tenant).
function commonConditions(t: TariffColumns, k: LookupKey): SQL[] {
  return [
    eq(t.containerType, k.containerType),
    inArray(t.tripMode, k.tripMode === 'SINGLE' ? ['SINGLE'] : [k.tripMode, 'SINGLE']),
    k.customerId ? or(eq(t.customerId, k.customerId), isNull(t.customerId))! : isNull(t.customerId),
    eq(t.isActive, true),
    lte(t.validFrom, k.targetDate),
    or(isNull(t.validTo), gte(t.validTo, k.targetDate))!,
  ];
}

/** WHERE của tra giá cước (chưa gồm tenant: TenantDb tự thêm). Xuất ra để test EXPLAIN. */
export function freightConditions(k: LookupKey): SQL {
  return and(eq(freightTariffs.routeId, k.routeId), ...commonConditions(freightTariffs, k))!;
}

export function freightOrder(k: LookupKey): SQL[] {
  return [
    asc(priorityExpr(freightTariffs.customerId, freightTariffs.tripMode, k.tripMode)),
    desc(freightTariffs.validFrom),
  ];
}

/** Giá cước cho một container: đúng một bản ghi, hoặc TARIFF_NOT_FOUND. */
export async function resolveFreight(
  tdb: TenantDb,
  k: LookupKey,
): Promise<Result<FreightTariffRow>> {
  const [row] = await tdb.select(freightTariffs, freightConditions(k), {
    orderBy: freightOrder(k),
    limit: 1,
  });
  return row ? ok(row) : fail('TARIFF_NOT_FOUND');
}

export type ResolveFeesOptions = { category?: FeeTariffRow['feeCategory'] };

/**
 * Các mã phí áp dụng cho một container. Bản ghi thắng của mỗi feeCode được chọn theo priority, rồi phí có routeId cụ thể
 * trước phí routeId NULL, rồi validFrom mới nhất. Bản thắng isExcluded thì bỏ mã đó (khách được miễn), không rơi xuống bảng chung.
 * Không có bản ghi ứng viên nào: TARIFF_NOT_FOUND. Có ứng viên nhưng toàn bộ bị miễn: ok với danh sách rỗng.
 */
export async function resolveFees(
  tdb: TenantDb,
  k: LookupKey,
  options: ResolveFeesOptions = {},
): Promise<Result<FeeTariffRow[]>> {
  const t = feeTariffs;
  const conditions = [
    or(eq(t.routeId, k.routeId), isNull(t.routeId))!,
    ...commonConditions(t, k),
    ...(options.category ? [eq(t.feeCategory, options.category)] : []),
  ];
  const rows = await tdb.select(t, and(...conditions), {
    orderBy: [
      asc(priorityExpr(t.customerId, t.tripMode, k.tripMode)),
      asc(sql`${t.routeId} IS NULL`), // phí có routeId cụ thể (0) trước phí áp mọi tuyến (1)
      desc(t.validFrom),
    ],
  });
  if (rows.length === 0) return fail('TARIFF_NOT_FOUND');

  const winners = new Map<string, FeeTariffRow>();
  for (const row of rows) if (!winners.has(row.feeCode)) winners.set(row.feeCode, row);
  const applicable = [...winners.values()]
    .filter((row) => !row.isExcluded)
    .sort((a, b) => a.feeCode.localeCompare(b.feeCode));
  return ok(applicable);
}
