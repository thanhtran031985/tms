// Service rà soát hạn giấy tờ đội xe và tài xế (spec 02, spec 03 mục 1 bước 3, task 05).
import { DEFAULT_TIME_ZONE, toTenantDate } from '../../lib/time';
import type { RequestContext } from '../../lib/context';
import type { TenantDb } from '../../lib/db/tenant-db';
import { createFleetRepo } from './repo';

export type FleetTargetType = 'TRACTOR' | 'TRAILER' | 'DRIVER';

export type FleetDocumentType =
  | 'REGISTRATION'
  | 'INSURANCE'
  | 'TRANSPORT_BADGE'
  | 'TRAILER_INSPECTION'
  | 'DRIVER_LICENSE'
  | 'DG_CERTIFICATE';

export interface ExpiringDocumentItem {
  id: string;
  targetType: FleetTargetType;
  targetId: string;
  targetLabel: string;
  documentType: FleetDocumentType;
  documentLabel: string;
  documentNo: string | null;
  expiryDate: string; // YYYY-MM-DD
  daysRemaining: number;
  isExpired: boolean;
  isExpiringSoon: boolean;
}

export interface ListExpiringDocumentsOptions {
  withinDays?: number;
  referenceDate?: Date;
  filter?: 'ALL' | 'EXPIRING_SOON' | 'EXPIRED';
  targetType?: FleetTargetType;
}

function diffInCalendarDays(targetDateStr: string, baseDateStr: string): number {
  const targetUtc = Date.UTC(
    Number(targetDateStr.slice(0, 4)),
    Number(targetDateStr.slice(5, 7)) - 1,
    Number(targetDateStr.slice(8, 10)),
  );
  const baseUtc = Date.UTC(
    Number(baseDateStr.slice(0, 4)),
    Number(baseDateStr.slice(5, 7)) - 1,
    Number(baseDateStr.slice(8, 10)),
  );
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  return Math.round((targetUtc - baseUtc) / MS_PER_DAY);
}

export async function listExpiringDocuments(
  ctx: RequestContext,
  tdb: TenantDb,
  options: ListExpiringDocumentsOptions = {},
): Promise<ExpiringDocumentItem[]> {
  const repo = createFleetRepo(tdb);
  const withinDays = options.withinDays ?? 15;
  const filter = options.filter ?? 'ALL';
  const tz = ctx.timezone || DEFAULT_TIME_ZONE;
  const todayStr = toTenantDate(options.referenceDate ?? new Date(), tz);

  const results: ExpiringDocumentItem[] = [];

  const evaluateDoc = (
    targetType: FleetTargetType,
    targetId: string,
    targetLabel: string,
    documentType: FleetDocumentType,
    documentLabel: string,
    documentNo: string | null,
    expiryDate: string | null | undefined,
  ) => {
    if (!expiryDate) return;
    const daysRemaining = diffInCalendarDays(expiryDate, todayStr);
    const isExpired = daysRemaining < 0;
    const isExpiringSoon = daysRemaining >= 0 && daysRemaining <= withinDays;

    if (filter === 'EXPIRED' && !isExpired) return;
    if (filter === 'EXPIRING_SOON' && !isExpiringSoon) return;
    if (filter === 'ALL' && !isExpired && !isExpiringSoon) return;

    results.push({
      id: `${targetType}_${targetId}_${documentType}`,
      targetType,
      targetId,
      targetLabel,
      documentType,
      documentLabel,
      documentNo,
      expiryDate,
      daysRemaining,
      isExpired,
      isExpiringSoon,
    });
  };

  // 1. Đầu kéo
  if (!options.targetType || options.targetType === 'TRACTOR') {
    const tractors = await repo.tractors.list({ includeDeleted: false });
    for (const t of tractors) {
      evaluateDoc(
        'TRACTOR',
        t.id,
        t.plateNumber,
        'REGISTRATION',
        'Đăng kiểm',
        null,
        t.registrationExpiry,
      );
      evaluateDoc(
        'TRACTOR',
        t.id,
        t.plateNumber,
        'INSURANCE',
        'Bảo hiểm TNDS',
        null,
        t.insuranceExpiry,
      );
      evaluateDoc(
        'TRACTOR',
        t.id,
        t.plateNumber,
        'TRANSPORT_BADGE',
        'Phù hiệu vận tải',
        null,
        t.transportBadgeExpiry,
      );
    }
  }

  // 2. Rơ moóc
  if (!options.targetType || options.targetType === 'TRAILER') {
    const trailers = await repo.trailers.list({ includeDeleted: false });
    for (const tr of trailers) {
      evaluateDoc(
        'TRAILER',
        tr.id,
        tr.plateNumber,
        'TRAILER_INSPECTION',
        'Kiểm định rơ moóc',
        null,
        tr.inspectionExpiry,
      );
    }
  }

  // 3. Tài xế
  if (!options.targetType || options.targetType === 'DRIVER') {
    const drivers = await repo.drivers.list({ includeDeleted: false });
    for (const d of drivers) {
      evaluateDoc(
        'DRIVER',
        d.id,
        d.fullName,
        'DRIVER_LICENSE',
        'GPLX',
        d.licenseNo,
        d.licenseExpiry,
      );
      evaluateDoc(
        'DRIVER',
        d.id,
        d.fullName,
        'DG_CERTIFICATE',
        'Chứng chỉ hàng nguy hiểm',
        d.dgCertificateNo,
        d.dgCertificateExpiry,
      );
    }
  }

  // Sắp xếp: sắp hết hạn / quá hạn nhiều nhất lên đầu
  results.sort((a, b) => {
    if (a.daysRemaining !== b.daysRemaining) {
      return a.daysRemaining - b.daysRemaining;
    }
    return a.targetLabel.localeCompare(b.targetLabel);
  });

  return results;
}
