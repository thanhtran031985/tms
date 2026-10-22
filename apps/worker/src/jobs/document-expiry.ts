// Worker job rà soát và cảnh báo hạn giấy tờ đội xe (spec 02, ADR-007, task 05).
import type { Redis } from 'ioredis';
import type { Logger } from 'pino';
import { eq } from 'drizzle-orm';
import type { Db } from '@core/lib/db/client';
import { tenants } from '@core/lib/db/schema';
import { getTenantDb } from '@core/lib/db/tenant-db';
import { DEFAULT_TIME_ZONE, toTenantDate } from '@core/lib/time';
import { listExpiringDocuments } from '@core/modules/fleet/documents.service';

export type DocumentExpiryJobData = {
  tenantId: string;
  referenceDate?: string;
};

export type DocumentExpiryEvent = {
  event: 'fleet.documents_expiring';
  tenantId: string;
  date: string;
  count: number;
  documents: {
    id: string;
    targetType: string;
    targetId: string;
    targetLabel: string;
    documentType: string;
    documentLabel: string;
    expiryDate: string;
    daysRemaining: number;
    isExpired: boolean;
    isExpiringSoon: boolean;
  }[];
};

export type ProcessDocumentExpiryOptions = {
  db: Db;
  redis: Redis;
  logger: Logger;
  onEvent?: (event: DocumentExpiryEvent) => Promise<void> | void;
};

export async function processDocumentExpiryJob(
  data: DocumentExpiryJobData,
  options: ProcessDocumentExpiryOptions,
): Promise<{ status: 'SKIPPED' | 'PROCESSED'; count?: number; key: string }> {
  const { tenantId, referenceDate } = data;
  const { db, redis, logger, onEvent } = options;

  // 1. Tìm thông tin tenant để lấy múi giờ
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
  const timeZone = tenant?.timezone || DEFAULT_TIME_ZONE;

  const now = referenceDate ? new Date(referenceDate) : new Date();
  const dateStr = toTenantDate(now, timeZone);
  const key = `DOC_EXPIRY:${tenantId}:${dateStr}`;

  // 2. Khóa Idempotency trên Redis: chỉ chạy 1 lần / tenant / ngày
  const setOk = await redis.set(key, '1', 'EX', 86400 * 2, 'NX');
  if (!setOk) {
    logger.info({ tenantId, dateStr, key }, 'Job cảnh báo giấy tờ đã chạy hôm nay, bỏ qua');
    return { status: 'SKIPPED', key };
  }

  // 3. Rà soát giấy tờ sắp hết hạn và đã hết hạn trong 15 ngày
  const ctx = {
    tenantId,
    userId: 'system-worker',
    role: 'FLEET_MANAGER' as const,
    timezone: timeZone,
    requestId: `job-doc-expiry-${tenantId}-${dateStr}`,
  };
  const tdb = getTenantDb(ctx, { db });

  const docs = await listExpiringDocuments(ctx, tdb, {
    withinDays: 15,
    referenceDate: now,
  });

  // Log JSON: chỉ ghi tenantId, count, docSummary, KHÔNG ghi PII (SĐT, GPLX)
  logger.info(
    {
      tenantId,
      dateStr,
      count: docs.length,
      docSummary: docs.map((d) => ({
        targetType: d.targetType,
        documentType: d.documentType,
        daysRemaining: d.daysRemaining,
      })),
    },
    'Hoàn tất rà soát hạn giấy tờ đội xe',
  );

  // 4. Phát sự kiện fleet.documents_expiring
  const eventPayload: DocumentExpiryEvent = {
    event: 'fleet.documents_expiring',
    tenantId,
    date: dateStr,
    count: docs.length,
    documents: docs.map((d) => ({
      id: d.id,
      targetType: d.targetType,
      targetId: d.targetId,
      targetLabel: d.targetLabel,
      documentType: d.documentType,
      documentLabel: d.documentLabel,
      expiryDate: d.expiryDate,
      daysRemaining: d.daysRemaining,
      isExpired: d.isExpired,
      isExpiringSoon: d.isExpiringSoon,
    })),
  };

  // Publish lên Redis channel
  await redis.publish('fleet.documents_expiring', JSON.stringify(eventPayload));

  if (onEvent) {
    await onEvent(eventPayload);
  }

  return { status: 'PROCESSED', count: docs.length, key };
}
