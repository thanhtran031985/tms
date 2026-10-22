import { Queue, Worker } from 'bullmq';
import type { Logger } from 'pino';
import type { Db } from '@core/lib/db/client';
import { getDb } from '@core/lib/db/client';
import { createRedis } from '@core/lib/redis/client';
import {
  type DocumentExpiryJobData,
  processDocumentExpiryJob,
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
    logger.error({ queue: QUEUE_NAMES.documentExpiry, jobId: job?.id, err: error }, 'job cảnh báo giấy tờ lỗi');
  });
  await docExpiryWorker.waitUntilReady();

  logger.info({ queues: [QUEUE_NAMES.heartbeat, QUEUE_NAMES.documentExpiry], heartbeatEveryMs }, 'worker ready');

  let stopping: Promise<void> | undefined;
  return {
    stop: () => {
      stopping ??= (async () => {
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
