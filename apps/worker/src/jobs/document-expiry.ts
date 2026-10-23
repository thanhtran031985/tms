// Worker job rà soát và cảnh báo hạn giấy tờ đội xe (spec 02, ADR-007, task 05).
import type { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import type { Logger } from 'pino';
import { eq } from 'drizzle-orm';
import type { Db } from '@core/lib/db/client';
import { tenants } from '@core/lib/db/schema';
import { getTenantDb } from '@core/lib/db/tenant-db';
import { DEFAULT_TIME_ZONE, toTenantDate } from '@core/lib/time';
import { listExpiringDocuments } from '@core/modules/fleet/documents.service';
import { defaultJobOptions } from '../queues';

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

  if (!tenant || tenant.status !== 'ACTIVE') {
    logger.info(
      { tenantId, status: tenant?.status ?? 'NOT_FOUND' },
      'Tenant không hoạt động, bỏ qua cảnh báo giấy tờ',
    );
    return { status: 'SKIPPED', key };
  }

  // 2. Đã phát hôm nay thì bỏ qua sớm, đỡ phải rà lại.
  if (await redis.exists(key)) {
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

  // 5. Khóa idempotent chỉ đặt SAU khi rà xong và trước khi phát: lỗi DB ở bước 3 không để lại khóa.
  // Phát lỗi thì nhả khóa để lần retry của BullMQ phát lại được, không bị bỏ qua.
  const claimed = await redis.set(key, '1', 'EX', 86400 * 2, 'NX');
  if (!claimed) {
    logger.info({ tenantId, dateStr, key }, 'Job cảnh báo giấy tờ đã chạy hôm nay, bỏ qua');
    return { status: 'SKIPPED', key };
  }
  try {
    await redis.publish('fleet.documents_expiring', JSON.stringify(eventPayload));
    if (onEvent) {
      await onEvent(eventPayload);
    }
  } catch (error) {
    await redis.del(key);
    throw error;
  }

  return { status: 'PROCESSED', count: docs.length, key };
}

// Giờ chạy mặc định theo giờ địa phương của tenant (06:00), trước giờ điều vận làm việc.
const SCHEDULER_PREFIX = 'doc-expiry:';

// Đăng ký lịch hằng ngày cho từng tenant ACTIVE theo múi giờ của tenant, gỡ lịch của tenant không còn hoạt động.
// Idempotent: upsertJobScheduler cập nhật lịch cùng id nên chạy lại không nhân đôi.
export async function scheduleDocumentExpiryJobs(options: {
  db: Db;
  queue: Queue<DocumentExpiryJobData>;
  hour?: number;
}): Promise<{ scheduled: number; removed: number }> {
  const { db, queue, hour = 6 } = options;
  const active = await db
    .select({ id: tenants.id, timezone: tenants.timezone })
    .from(tenants)
    .where(eq(tenants.status, 'ACTIVE'));

  for (const tenant of active) {
    await queue.upsertJobScheduler(
      `${SCHEDULER_PREFIX}${tenant.id}`,
      { pattern: `0 ${hour} * * *`, tz: tenant.timezone || DEFAULT_TIME_ZONE },
      { name: 'scan', data: { tenantId: tenant.id }, opts: defaultJobOptions },
    );
  }

  const activeKeys = new Set(active.map((t) => `${SCHEDULER_PREFIX}${t.id}`));
  let removed = 0;
  for (const scheduler of await queue.getJobSchedulers()) {
    if (scheduler.key.startsWith(SCHEDULER_PREFIX) && !activeKeys.has(scheduler.key)) {
      await queue.removeJobScheduler(scheduler.key);
      removed += 1;
    }
  }
  return { scheduled: active.length, removed };
}
