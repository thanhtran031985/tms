// Worker job tính lại giá (task 08, spec 06 mục 4): `pricing.reprice` xử lý các container vừa đổi khóa tra giá (ghép, tách chuyến),
// `pricing.reprice-sweep` quét định kỳ cờ `repriceRequired` còn treo phòng khi mất sự kiện. Cờ trong DB là nguồn sự thật;
// job idempotent (container hết cờ thì bỏ qua) nên chạy lại hay chạy trùng đều an toàn.
import type { Queue } from 'bullmq';
import type { Logger } from 'pino';
import { eq } from 'drizzle-orm';
import type { Db } from '@core/lib/db/client';
import { tenants } from '@core/lib/db/schema';
import { getTenantDb } from '@core/lib/db/tenant-db';
import { createRedis } from '@core/lib/redis/client';
import { PRICING_CHANNEL_PATTERN } from '@core/lib/redis/publish';
import { DEFAULT_TIME_ZONE } from '@core/lib/time';
import { createRepriceService, type RepriceResult } from '@core/modules/billing/reprice.service';
import { defaultJobOptions } from '../queues';

export type RepriceJobData = {
  tenantId: string;
  /** Có thì chỉ tính lại các container này; bỏ trống là lượt quét mọi cờ treo của tenant. */
  orderContainerIds?: string[];
};

export type ProcessRepriceOptions = { db: Db; logger: Logger };

export async function processRepriceJob(
  data: RepriceJobData,
  options: ProcessRepriceOptions,
): Promise<{ results: RepriceResult[] }> {
  const { db, logger } = options;
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, data.tenantId));
  if (!tenant || tenant.status !== 'ACTIVE') {
    logger.info({ tenantId: data.tenantId, status: tenant?.status ?? 'NOT_FOUND' }, 'Tenant không hoạt động, bỏ qua tính lại giá');
    return { results: [] };
  }

  const ctx = {
    tenantId: data.tenantId,
    userId: 'system-worker',
    role: 'ADMIN' as const,
    timezone: tenant.timezone || DEFAULT_TIME_ZONE,
    requestId: `job-reprice-${data.tenantId}`,
  };
  const service = createRepriceService({ tenantDb: (c) => getTenantDb(c, { db }) });

  let results: RepriceResult[];
  if (data.orderContainerIds?.length) {
    results = [];
    for (const orderContainerId of data.orderContainerIds) {
      try {
        results.push(await service.repriceContainer(ctx, { orderContainerId }));
      } catch (error) {
        // Một container lỗi (vd. chưa có bảng giá) không chặn các container còn lại; cờ còn nguyên cho lượt quét sau.
        results.push({
          orderContainerId,
          outcome: 'FAILED',
          before: null,
          after: null,
          errorCode: (error as { code?: string }).code ?? 'INTERNAL_ERROR',
        });
      }
    }
  } else {
    results = await service.repriceFlagged(ctx);
  }

  const failed = results.filter((r) => r.outcome === 'FAILED');
  // Log JSON: chỉ mã container và kết quả, không ghi số tiền hay thông tin khách.
  logger.info(
    {
      tenantId: data.tenantId,
      processed: results.length,
      repriced: results.filter((r) => r.outcome === 'REPRICED').length,
      failed: failed.map((r) => ({ id: r.orderContainerId, code: r.errorCode })),
    },
    'Hoàn tất tính lại giá',
  );
  // Lỗi tạm thời (vd. khóa DB) cần BullMQ thử lại; lỗi nghiệp vụ như TARIFF_NOT_FOUND thì không, chờ người nhập giá.
  const retriable = failed.find((r) => r.errorCode === 'RESOURCE_BUSY_RETRY' || r.errorCode === 'INTERNAL_ERROR');
  if (retriable) throw new Error(`Tính lại giá lỗi tạm thời cho container ${retriable.orderContainerId}`);
  return { results };
}

// Không thêm zod cho worker (cấm cài package mới): kiểm tra tay hình dạng sự kiện.
function parsePricingEvent(raw: string): { tenantId: string; orderContainerIds: string[] } | null {
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    const ids = value.orderContainerIds;
    if (
      value.type !== 'pricing.reprice_required' ||
      typeof value.tenantId !== 'string' ||
      !value.tenantId ||
      !Array.isArray(ids) ||
      ids.length === 0 ||
      !ids.every((id) => typeof id === 'string' && id.length > 0)
    ) {
      return null;
    }
    return { tenantId: value.tenantId, orderContainerIds: ids as string[] };
  } catch {
    return null;
  }
}

/** Đăng ký sự kiện `pricing.reprice_required` của mọi tenant rồi đẩy mỗi sự kiện thành một job `pricing.reprice`. */
export async function subscribePricingEvents(options: {
  redisUrl: string;
  queue: Queue<RepriceJobData>;
  logger: Logger;
}): Promise<{ close: () => Promise<void> }> {
  const { redisUrl, queue, logger } = options;
  const subscriber = createRedis(redisUrl);
  subscriber.on('pmessage', (_pattern, _channel, message) => {
    const parsed = parsePricingEvent(message);
    if (!parsed) {
      logger.warn('Bỏ qua sự kiện giá không hợp lệ');
      return;
    }
    queue
      .add(
        'pricing.reprice',
        { tenantId: parsed.tenantId, orderContainerIds: parsed.orderContainerIds },
        defaultJobOptions,
      )
      .catch((error: unknown) => logger.error({ err: error }, 'Đẩy job tính lại giá lỗi'));
  });
  await subscriber.psubscribe(PRICING_CHANNEL_PATTERN);
  return {
    close: async () => {
      await subscriber.punsubscribe(PRICING_CHANNEL_PATTERN);
      await subscriber.quit();
    },
  };
}

const SWEEP_PREFIX = 'reprice-sweep:';

/** Mỗi tenant ACTIVE một lịch quét cờ treo; gỡ lịch của tenant không còn hoạt động. Idempotent theo id lịch. */
export async function scheduleRepriceSweeps(options: {
  db: Db;
  queue: Queue<RepriceJobData>;
  everyMs?: number;
}): Promise<{ scheduled: number; removed: number }> {
  const { db, queue, everyMs = 300_000 } = options;
  const active = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.status, 'ACTIVE'));
  for (const tenant of active) {
    await queue.upsertJobScheduler(
      `${SWEEP_PREFIX}${tenant.id}`,
      { every: everyMs },
      { name: 'pricing.reprice-sweep', data: { tenantId: tenant.id }, opts: defaultJobOptions },
    );
  }
  const activeKeys = new Set(active.map((t) => `${SWEEP_PREFIX}${t.id}`));
  let removed = 0;
  for (const scheduler of await queue.getJobSchedulers()) {
    if (scheduler.key.startsWith(SWEEP_PREFIX) && !activeKeys.has(scheduler.key)) {
      await queue.removeJobScheduler(scheduler.key);
      removed += 1;
    }
  }
  return { scheduled: active.length, removed };
}
