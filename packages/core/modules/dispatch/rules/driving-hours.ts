// Giờ lái trong ngày (spec 03 mục 1 bước 3): tổng thời gian kế hoạch của tài xế trong một ngày (múi giờ tenant) không quá giới hạn.
// Chỉ áp giới hạn ngày; mốc "liên tục 4 giờ" cần dữ liệu GPS nên để task sau (decisions.md task 06).
import { and, eq, gt, lt, notInArray } from 'drizzle-orm';
import { dispatchAssignments } from '../../../lib/db/schema';
import type { TenantDb } from '../../../lib/db/tenant-db';
import { addCalendarDays, startOfTenantDay, toTenantDate } from '../../../lib/time';
import { INACTIVE_ASSIGNMENT_STATUSES } from '../deps';
import type { RuleError, TimeWindow } from './types';

const HOUR_MS = 3_600_000;

export type DrivingHoursExceeded = {
  date: string;
  plannedHours: number;
  limitHours: number;
};

/** Các ngày (YYYY-MM-DD, múi giờ tenant) mà khung giờ chạm tới. */
export function tenantDaysOf(window: TimeWindow, timeZone: string): string[] {
  const first = toTenantDate(window.start, timeZone);
  const last = toTenantDate(new Date(window.end.getTime() - 1), timeZone);
  const days = [first];
  while (days[days.length - 1]! < last) days.push(addCalendarDays(days[days.length - 1]!, 1));
  return days;
}

/** Tổng độ dài (mili giây) của hợp các khoảng đã cắt theo [from, to). Khoảng trùng nhau chỉ tính một lần. */
function unionLength(intervals: TimeWindow[], from: Date, to: Date): number {
  const clipped = intervals
    .map((i) => ({
      start: Math.max(i.start.getTime(), from.getTime()),
      end: Math.min(i.end.getTime(), to.getTime()),
    }))
    .filter((i) => i.end > i.start)
    .sort((a, b) => a.start - b.start);
  let total = 0;
  let cursor = -Infinity;
  for (const i of clipped) {
    const start = Math.max(i.start, cursor);
    if (i.end > start) total += i.end - start;
    cursor = Math.max(cursor, i.end);
  }
  return total;
}

/**
 * Ngày đầu tiên có tổng giờ kế hoạch (các chuyến đã có + khung giờ mới) vượt giới hạn, hoặc null.
 * `existing` là khoảng của các assignment khác của tài xế (3 dòng của cùng một chuyến trùng nhau nên tính một lần nhờ hợp khoảng).
 */
export function findDrivingHoursExcess(input: {
  existing: TimeWindow[];
  window: TimeWindow;
  timeZone: string;
  limitHours: number;
}): DrivingHoursExceeded | null {
  const { existing, window, timeZone, limitHours } = input;
  for (const date of tenantDaysOf(window, timeZone)) {
    const dayStart = startOfTenantDay(date, timeZone);
    const dayEnd = startOfTenantDay(addCalendarDays(date, 1), timeZone);
    const hours = unionLength([...existing, window], dayStart, dayEnd) / HOUR_MS;
    const planned = Math.round(hours * 100) / 100;
    if (planned > limitHours) return { date, plannedHours: planned, limitHours };
  }
  return null;
}

/** Khoảng assignment còn hiệu lực của tài xế trong các ngày mà `window` chạm tới, trừ chuyến `excludeTripId`. */
export async function loadDriverIntervals(
  tdb: TenantDb,
  input: { driverId: string; window: TimeWindow; timeZone: string; excludeTripId?: string },
): Promise<TimeWindow[]> {
  const { driverId, window, timeZone, excludeTripId } = input;
  const days = tenantDaysOf(window, timeZone);
  const from = startOfTenantDay(days[0]!, timeZone);
  const to = startOfTenantDay(addCalendarDays(days[days.length - 1]!, 1), timeZone);
  const rows = await tdb.select(
    dispatchAssignments,
    and(
      eq(dispatchAssignments.driverId, driverId),
      notInArray(dispatchAssignments.status, INACTIVE_ASSIGNMENT_STATUSES),
      lt(dispatchAssignments.plannedStart, to),
      gt(dispatchAssignments.plannedEnd, from),
    ),
  );
  return rows
    .filter((r) => !excludeTripId || r.consolidatedTripId !== excludeTripId)
    .map((r) => ({ start: r.plannedStart, end: r.plannedEnd }));
}

export function drivingHoursError(label: string, excess: DrivingHoursExceeded): RuleError {
  return {
    code: 'DRIVING_HOURS_EXCEEDED',
    resource: 'DRIVER',
    reason: 'DRIVING_HOURS_EXCEEDED',
    message: `Tài xế ${label} có ${excess.plannedHours} giờ kế hoạch trong ngày ${excess.date.split('-').reverse().join('/')}, vượt giới hạn ${excess.limitHours} giờ.`,
    details: {
      resource: 'DRIVER',
      reason: 'DRIVING_HOURS_EXCEEDED',
      date: excess.date,
      plannedHours: excess.plannedHours,
      limitHours: excess.limitHours,
    },
  };
}
