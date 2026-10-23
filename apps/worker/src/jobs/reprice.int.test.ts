// Job tính lại giá pricing.reprice (task 08, bước 5; spec 06 mục 4): xử lý theo danh sách container, quét cờ treo, nhận sự kiện
// pricing.reprice_required từ Redis để đẩy job, đăng ký lịch quét cho từng tenant ACTIVE.
import { Queue } from 'bullmq';
import { eq } from 'drizzle-orm';
import pino from 'pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { listAuditForEntity } from '@core/lib/audit/repo';
import { orderContainers } from '@core/lib/db/schema';
import { seedIdentity } from '@core/lib/db/seeds/identity';
import { SEED_TENANTS } from '@core/lib/db/seeds/identity.test-data';
import { seedMasterData } from '@core/lib/db/seeds/master-data';
import { seedOrders } from '@core/lib/db/seeds/orders';
import { SEED_ORDER_CONTAINERS } from '@core/lib/db/seeds/orders.test-data';
import { seedTariffs } from '@core/lib/db/seeds/tariffs';
import { getTenantDb } from '@core/lib/db/tenant-db';
import { createRedis } from '@core/lib/redis/client';
import { publishPricingEvent } from '@core/lib/redis/publish';
import { startTestInfra, type TestInfra } from '@core/test/containers';
import { defaultJobOptions, QUEUE_NAMES } from '../queues';
import {
  processRepriceJob,
  scheduleRepriceSweeps,
  subscribePricingEvents,
  type RepriceJobData,
} from './reprice';

const silent = pino({ level: 'silent' });
const A = SEED_TENANTS.phucAn.id;
const container = (containerNo: string) => SEED_ORDER_CONTAINERS.find((c) => c.containerNo === containerNo)!;

describe('worker job pricing.reprice', () => {
  let infra: TestInfra;

  beforeAll(async () => {
    infra = await startTestInfra({ redis: true });
    await seedIdentity(infra.db, { password: 'mat-khau-thu-nghiem' });
    await seedMasterData(infra.db);
    await seedTariffs(infra.db);
    await seedOrders(infra.db);
  }, 120_000);

  afterAll(async () => {
    await infra?.stop();
  });

  const row = async (id: string) =>
    (await infra.db.select().from(orderContainers).where(eq(orderContainers.id, id)))[0]!;
  const flag = (id: string) =>
    infra.db
      .update(orderContainers)
      .set({ repriceRequired: true, appliedTripMode: 'TWIN_20' })
      .where(eq(orderContainers.id, id));

  it('tính lại theo danh sách container; chạy lại không sinh audit thứ hai', async () => {
    // MAEU2388417 (20DC) đang giá SINGLE 1.800.000; bảng giá mẫu có TWIN_20 chung 3.000.000.
    const id = container('MAEU2388417').id!;
    await flag(id);

    const first = await processRepriceJob(
      { tenantId: A, orderContainerIds: [id] },
      { db: infra.db, logger: silent },
    );
    expect(first.results.map((r) => r.outcome)).toEqual(['REPRICED']);
    const after = await row(id);
    expect(after.baseFreightAmount).toBe('3000000.00');
    expect(after.repriceRequired).toBe(false);

    const second = await processRepriceJob(
      { tenantId: A, orderContainerIds: [id] },
      { db: infra.db, logger: silent },
    );
    expect(second.results.map((r) => r.outcome)).toEqual(['UNCHANGED']);
    const audits = await listAuditForEntity(getTenantDb({ tenantId: A }, { db: infra.db }), 'order_containers', id);
    expect(audits.filter((a) => a.action === 'REPRICE')).toHaveLength(1);
  });

  it('không có danh sách container thì quét mọi cờ treo của tenant', async () => {
    const id = container('MAEU2388422').id!;
    await flag(id);
    const swept = await processRepriceJob({ tenantId: A }, { db: infra.db, logger: silent });
    expect(swept.results.some((r) => r.orderContainerId === id)).toBe(true);
    expect((await row(id)).repriceRequired).toBe(false);
  });

  it('tenant ngừng hoạt động bị bỏ qua', async () => {
    const result = await processRepriceJob(
      { tenantId: '0190a000-0000-7000-0000-00000000dead' },
      { db: infra.db, logger: silent },
    );
    expect(result.results).toEqual([]);
  });

  it('nhận sự kiện pricing.reprice_required thì đẩy job pricing.reprice vào hàng đợi', async () => {
    const connection = createRedis(infra.redisUrl, { forBullMQ: true });
    const queue = new Queue<RepriceJobData>(QUEUE_NAMES.reprice, { connection, defaultJobOptions });
    const subscription = await subscribePricingEvents({ redisUrl: infra.redisUrl, queue, logger: silent });
    try {
      await publishPricingEvent(infra.redis, {
        type: 'pricing.reprice_required',
        tenantId: A,
        orderContainerIds: ['a', 'b'],
      });
      await expect
        .poll(async () => (await queue.getJobs(['waiting', 'active', 'delayed'])).length, { timeout: 10_000 })
        .toBeGreaterThan(0);
      const [job] = await queue.getJobs(['waiting', 'active', 'delayed']);
      expect(job?.name).toBe('pricing.reprice');
      expect(job?.data).toMatchObject({ tenantId: A, orderContainerIds: ['a', 'b'] });
    } finally {
      await subscription.close();
      await queue.obliterate({ force: true });
      await queue.close();
      await connection.quit();
    }
  });

  it('đăng ký lịch quét cho tenant ACTIVE và chạy lại không nhân đôi', async () => {
    const connection = createRedis(infra.redisUrl, { forBullMQ: true });
    const queue = new Queue<RepriceJobData>(`${QUEUE_NAMES.reprice}-schedule-test`, {
      connection,
      defaultJobOptions,
    });
    try {
      const first = await scheduleRepriceSweeps({ db: infra.db, queue });
      const second = await scheduleRepriceSweeps({ db: infra.db, queue });
      expect(first.scheduled).toBeGreaterThanOrEqual(1);
      expect(second.scheduled).toBe(first.scheduled);
      const schedulers = await queue.getJobSchedulers();
      expect(schedulers.filter((s) => s.key.startsWith('reprice-sweep:'))).toHaveLength(first.scheduled);
    } finally {
      await queue.obliterate({ force: true });
      await queue.close();
      await connection.quit();
    }
  });
});
