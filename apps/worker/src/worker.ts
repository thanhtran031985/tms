import { Queue, Worker } from 'bullmq';
import type { Logger } from 'pino';
import type { Db } from '@core/lib/db/client';
import { getDb } from '@core/lib/db/client';
import { createRedis } from '@core/lib/redis/client';
import {
  type DocumentExpiryJobData,
  processDocumentExpiryJob,
  scheduleDocumentExpiryJobs,
} from './jobs/document-expiry';
import { defaultJobOptions, QUEUE_NAMES } from './queues';

export type StartWorkerOptions = {
  redisUrl: string;
  logger: Logger;
  db?: Db;
  heartbeatEveryMs?: number;
};

export type RunningWorker = {
  stop: () => Promise<void>;
};

// Khởi động worker: hàng đợi mẫu system.heartbeat và job cảnh báo hạn giấy tờ fleet.document-expiry.
export async function startWorker(options: StartWorkerOptions): Promise<RunningWorker> {
  const { redisUrl, logger, heartbeatEveryMs = 60_000 } = options;
  const getDatabase = () => options.db ?? getDb().db;
  const connection = createRedis(redisUrl, { forBullMQ: true });

  const queue = new Queue(QUEUE_NAMES.heartbeat, { connection, defaultJobOptions });
  await queue.upsertJobScheduler(
    'heartbeat',
    { every: heartbeatEveryMs },
    { name: 'heartbeat', opts: defaultJobOptions },
  );

  const worker = new Worker(
    QUEUE_NAMES.heartbeat,
    async (job) => {
      logger.info({ queue: QUEUE_NAMES.heartbeat, jobId: job.id }, 'heartbeat');
    },
    { connection },
  );
  worker.on('failed', (job, error) => {
    logger.error({ queue: QUEUE_NAMES.heartbeat, jobId: job?.id, err: error }, 'job lỗi');
  });
  worker.on('error', (error) => {
    logger.error({ err: error }, 'worker lỗi');
  });
  await worker.waitUntilReady();

  // Đăng ký worker cho job cảnh báo giấy tờ đội xe
  const docExpiryQueue = new Queue<DocumentExpiryJobData>(QUEUE_NAMES.documentExpiry, {
    connection,
    defaultJobOptions,
  });
  const docExpiryWorker = new Worker<DocumentExpiryJobData>(
    QUEUE_NAMES.documentExpiry,
    async (job) => {
      await processDocumentExpiryJob(job.data, {
        db: getDatabase(),
        redis: connection,
        logger,
      });
    },
    { connection },
  );
  docExpiryWorker.on('failed', (job, error) => {
    logger.error(
      { queue: QUEUE_NAMES.documentExpiry, jobId: job?.id, err: error },
      'job cảnh báo giấy tờ lỗi',
    );
  });
  await docExpiryWorker.waitUntilReady();

  // Lịch hằng ngày theo múi giờ từng tenant (task 05). Cần DB: không có DATABASE_URL (vd. test chỉ cần Redis) thì chỉ cảnh báo.
  const syncDocExpirySchedules = async () => {
    const { scheduled, removed } = await scheduleDocumentExpiryJobs({
      db: getDatabase(),
      queue: docExpiryQueue,
    });
    logger.info(
      { queue: QUEUE_NAMES.documentExpiry, scheduled, removed },
      'đã đồng bộ lịch cảnh báo giấy tờ',
    );
  };
  let resyncTimer: NodeJS.Timeout | undefined;
  if (options.db || process.env.DATABASE_URL) {
    await syncDocExpirySchedules();
    // Tenant mới hoặc đổi múi giờ được áp dụng sau tối đa 1 giờ, không cần khởi động lại worker.
    resyncTimer = setInterval(() => {
      syncDocExpirySchedules().catch((error: unknown) => {
        logger.error({ err: error }, 'đồng bộ lịch cảnh báo giấy tờ lỗi');
      });
    }, 3_600_000);
    resyncTimer.unref();
  } else {
    logger.warn('Thiếu DATABASE_URL: chưa đăng ký lịch cảnh báo giấy tờ fleet.document-expiry');
  }

  logger.info(
    { queues: [QUEUE_NAMES.heartbeat, QUEUE_NAMES.documentExpiry], heartbeatEveryMs },
    'worker ready',
  );

  let stopping: Promise<void> | undefined;
  return {
    stop: () => {
      stopping ??= (async () => {
        if (resyncTimer) clearInterval(resyncTimer);
        await worker.close();
        await docExpiryWorker.close();
        await queue.close();
        await docExpiryQueue.close();
        await connection.quit();
        logger.info('worker đã dừng');
      })();
      return stopping;
    },
  };
}
