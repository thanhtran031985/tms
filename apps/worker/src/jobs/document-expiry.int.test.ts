import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Writable } from 'node:stream';
import pino from 'pino';
import { Queue } from 'bullmq';
import { eq } from 'drizzle-orm';
import { createRedis } from '@core/lib/redis/client';
import { startWorker } from '../worker';
import { startTestInfra, type TestInfra } from '@core/test/containers';
import { seedIdentity } from '@core/lib/db/seeds/identity';
import { SEED_TENANTS } from '@core/lib/db/seeds/identity.test-data';
import { seedFleet } from '@core/lib/db/seeds/fleet';
import { tenants } from '@core/lib/db/schema';
import {
  type DocumentExpiryEvent,
  type DocumentExpiryJobData,
  processDocumentExpiryJob,
  scheduleDocumentExpiryJobs,
} from './document-expiry';

describe('worker job fleet.document-expiry', () => {
  let infra: TestInfra;

  beforeAll(async () => {
    infra = await startTestInfra({ redis: true });
    await seedIdentity(infra.db, { password: 'mat-khau-thu-nghiem' });
    await seedFleet(infra.db);
  }, 120_000);

  afterAll(async () => {
    await infra?.stop();
  });

  const tenantPhucAn = SEED_TENANTS.phucAn.id;
  const tenantSaoViet = SEED_TENANTS.saoViet.id;

  it('chạy job 2 lần cùng ngày chỉ phát 1 sự kiện mỗi tenant', async () => {
    const emittedEvents: DocumentExpiryEvent[] = [];
    const lines: string[] = [];
    const sink = new Writable({
      write(chunk, _encoding, done) {
        lines.push(String(chunk));
        done();
      },
    });
    const logger = pino({ base: { service: 'worker' } }, sink);

    const refDate = '2026-10-22T08:00:00.000Z';

    // Lần 1: Xử lý và phát sự kiện
    const run1 = await processDocumentExpiryJob(
      { tenantId: tenantPhucAn, referenceDate: refDate },
      {
        db: infra.db,
        redis: infra.redis,
        logger,
        onEvent: (event) => {
          emittedEvents.push(event);
        },
      },
    );

    expect(run1.status).toBe('PROCESSED');
    expect(run1.count).toBeGreaterThan(0);
    expect(emittedEvents.length).toBe(1);
    expect(emittedEvents[0]?.tenantId).toBe(tenantPhucAn);
    expect(emittedEvents[0]?.event).toBe('fleet.documents_expiring');

    // Lần 2 cùng ngày: Bỏ qua (SKIPPED), không phát sự kiện thứ hai
    const run2 = await processDocumentExpiryJob(
      { tenantId: tenantPhucAn, referenceDate: refDate },
      {
        db: infra.db,
        redis: infra.redis,
        logger,
        onEvent: (event) => {
          emittedEvents.push(event);
        },
      },
    );

    expect(run2.status).toBe('SKIPPED');
    expect(emittedEvents.length).toBe(1); // Vẫn chỉ là 1

    // Kiểm tra log JSON: có tenantId, không có SĐT hay GPLX nhạy cảm
    const logStr = lines.join('\n');
    expect(logStr).toContain(tenantPhucAn);
    expect(logStr).not.toContain('0903123456');
    expect(logStr).not.toContain('GPLX-79-112233');
  });

  it('tenant ở múi giờ khác chạy theo giờ của tenant đó', async () => {
    // Đặt tenant Sao Việt sang múi giờ New York
    await infra.db
      .update(tenants)
      .set({ timezone: 'America/New_York' })
      .where(eq(tenants.id, tenantSaoViet));

    const lines: string[] = [];
    const logger = pino(
      { base: { service: 'worker' } },
      new Writable({
        write(chunk, _encoding, done) {
          lines.push(String(chunk));
          done();
        },
      }),
    );

    // Mốc thời gian: 2026-10-22T02:00:00.000Z (ở New York là 2026-10-21 22:00:00)
    const instant = '2026-10-22T02:00:00.000Z';

    const res = await processDocumentExpiryJob(
      { tenantId: tenantSaoViet, referenceDate: instant },
      {
        db: infra.db,
        redis: infra.redis,
        logger,
      },
    );

    expect(res.key).toBe(`DOC_EXPIRY:${tenantSaoViet}:2026-10-21`);
  });

  it('lỗi DB thì job ném lỗi để BullMQ retry', async () => {
    const logger = pino({ level: 'silent' });
    const fakeDb = {
      select: () => {
        throw new Error('Database connection lost');
      },
    } as unknown as typeof infra.db;

    await expect(
      processDocumentExpiryJob(
        { tenantId: tenantPhucAn },
        {
          db: fakeDb,
          redis: infra.redis,
          logger,
        },
      ),
    ).rejects.toThrow('Database connection lost');
  });
});

describe('worker job fleet.document-expiry: khóa idempotent và lịch', () => {
  let infra: TestInfra;

  beforeAll(async () => {
    infra = await startTestInfra({ redis: true });
    await seedIdentity(infra.db, { password: 'mat-khau-thu-nghiem' });
    await seedFleet(infra.db);
  }, 120_000);

  afterAll(async () => {
    await infra?.stop();
  });

  const tenantPhucAn = SEED_TENANTS.phucAn.id;
  const tenantSaoViet = SEED_TENANTS.saoViet.id;
  const silent = pino({ level: 'silent' });

  it('phát sự kiện lỗi thì nhả khóa để lần retry vẫn phát được, không bị SKIPPED', async () => {
    const refDate = '2026-10-23T08:00:00.000Z';
    const events: DocumentExpiryEvent[] = [];

    await expect(
      processDocumentExpiryJob(
        { tenantId: tenantPhucAn, referenceDate: refDate },
        {
          db: infra.db,
          redis: infra.redis,
          logger: silent,
          onEvent: () => {
            throw new Error('Kênh sự kiện lỗi');
          },
        },
      ),
    ).rejects.toThrow('Kênh sự kiện lỗi');
    expect(await infra.redis.exists(`DOC_EXPIRY:${tenantPhucAn}:2026-10-23`)).toBe(0);

    const retry = await processDocumentExpiryJob(
      { tenantId: tenantPhucAn, referenceDate: refDate },
      { db: infra.db, redis: infra.redis, logger: silent, onEvent: (e) => void events.push(e) },
    );
    expect(retry.status).toBe('PROCESSED');
    expect(events).toHaveLength(1);
  });

  it('đăng ký một lịch hằng ngày cho mỗi tenant ACTIVE theo múi giờ của tenant, chạy lại không nhân đôi', async () => {
    await infra.db
      .update(tenants)
      .set({ timezone: 'America/New_York', status: 'ACTIVE' })
      .where(eq(tenants.id, tenantSaoViet));
    const connection = createRedis(infra.redisUrl, { forBullMQ: true });
    const queue = new Queue<DocumentExpiryJobData>('test.fleet.document-expiry', { connection });
    try {
      await scheduleDocumentExpiryJobs({ db: infra.db, queue, hour: 6 });
      await scheduleDocumentExpiryJobs({ db: infra.db, queue, hour: 6 });

      const schedulers = await queue.getJobSchedulers();
      const byTenant = new Map(schedulers.map((s) => [s.key, s]));
      const phucAn = byTenant.get(`doc-expiry:${tenantPhucAn}`);
      const saoViet = byTenant.get(`doc-expiry:${tenantSaoViet}`);
      expect(phucAn?.pattern).toBe('0 6 * * *');
      expect(phucAn?.tz).toBe('Asia/Ho_Chi_Minh');
      expect(saoViet?.tz).toBe('America/New_York');
      expect(schedulers.filter((s) => s.key.startsWith('doc-expiry:'))).toHaveLength(2);

      // Tenant bị tạm ngưng thì gỡ lịch.
      await infra.db
        .update(tenants)
        .set({ status: 'SUSPENDED' })
        .where(eq(tenants.id, tenantSaoViet));
      await scheduleDocumentExpiryJobs({ db: infra.db, queue, hour: 6 });
      const after = await queue.getJobSchedulers();
      expect(after.map((s) => s.key)).not.toContain(`doc-expiry:${tenantSaoViet}`);
      expect(after.map((s) => s.key)).toContain(`doc-expiry:${tenantPhucAn}`);
    } finally {
      await queue.close();
      await connection.quit();
    }
  });

  it('startWorker tự đăng ký lịch cảnh báo giấy tờ khi có DB', async () => {
    await infra.db.update(tenants).set({ status: 'ACTIVE' }).where(eq(tenants.id, tenantSaoViet));
    const running = await startWorker({ redisUrl: infra.redisUrl, logger: silent, db: infra.db });
    const connection = createRedis(infra.redisUrl, { forBullMQ: true });
    const queue = new Queue<DocumentExpiryJobData>('fleet.document-expiry', { connection });
    try {
      const keys = (await queue.getJobSchedulers()).map((s) => s.key);
      expect(keys).toContain(`doc-expiry:${tenantPhucAn}`);
      expect(keys).toContain(`doc-expiry:${tenantSaoViet}`);
    } finally {
      await queue.close();
      await connection.quit();
      await running.stop();
    }
  });
});
