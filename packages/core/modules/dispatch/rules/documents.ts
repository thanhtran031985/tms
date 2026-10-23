// Giấy tờ còn hạn tại giờ kết thúc chuyến (spec 03 mục 1 bước 3): hết hạn chặn DOCUMENT_EXPIRED, còn dưới 15 ngày thì cảnh báo.
// Giấy tờ hết hạn đúng ngày chuyến kết thúc vẫn còn hiệu lực trong ngày đó. Giấy tờ chưa có ngày hết hạn thì bỏ qua (chưa có dữ liệu).
import { diffCalendarDays, toTenantDate } from '../../../lib/time';
import type { DriverRow, TractorRow, TrailerRow } from '../../fleet/repo';
import { noIssues, RESOURCE_NOUN, type ResourceKind, type RuleResult } from './types';

export const DOCUMENT_WARNING_DAYS = 15;

export type DocumentItem = { name: string; expiry: string | null };

/** Giấy tờ của từng loại tài nguyên: GPLX; đăng kiểm, bảo hiểm, phù hiệu (đầu kéo); kiểm định (rơ moóc). */
export function documentsOf(
  kind: ResourceKind,
  row: DriverRow | TractorRow | TrailerRow | undefined,
): DocumentItem[] {
  if (!row) return [];
  if (kind === 'DRIVER') {
    return [{ name: 'GPLX', expiry: (row as DriverRow).licenseExpiry }];
  }
  if (kind === 'TRACTOR') {
    const tractor = row as TractorRow;
    return [
      { name: 'Đăng kiểm', expiry: tractor.registrationExpiry },
      { name: 'Bảo hiểm', expiry: tractor.insuranceExpiry },
      { name: 'Phù hiệu', expiry: tractor.transportBadgeExpiry },
    ];
  }
  return [{ name: 'Kiểm định', expiry: (row as TrailerRow).inspectionExpiry }];
}

const vnDate = (iso: string) => iso.split('-').reverse().join('/');

export function checkDocuments(input: {
  kind: ResourceKind;
  label: string;
  items: DocumentItem[];
  plannedEnd: Date;
  timeZone: string;
}): RuleResult {
  const { kind, label, items, plannedEnd, timeZone } = input;
  const result = noIssues();
  const endDate = toTenantDate(plannedEnd, timeZone);
  const noun = RESOURCE_NOUN[kind];

  for (const { name, expiry } of items) {
    if (!expiry) continue;
    const daysRemaining = diffCalendarDays(expiry, endDate);
    const details = { resource: kind, document: name, expiryDate: expiry, daysRemaining };
    if (daysRemaining < 0) {
      result.errors.push({
        code: 'DOCUMENT_EXPIRED',
        resource: kind,
        reason: 'DOCUMENT_EXPIRED',
        message: `${name} của ${noun.toLowerCase()} ${label} hết hạn ngày ${vnDate(expiry)}, trước khi chuyến kết thúc. Không được điều.`,
        details,
      });
    } else if (daysRemaining < DOCUMENT_WARNING_DAYS) {
      result.warnings.push({
        code: 'DOCUMENT_EXPIRING',
        severity: 'warn',
        resource: kind,
        message: `${name} của ${noun.toLowerCase()} ${label} còn ${daysRemaining} ngày (hết hạn ${vnDate(expiry)}).`,
        details,
      });
    }
  }
  return result;
}
