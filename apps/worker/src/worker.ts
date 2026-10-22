import { Queue, Worker } from 'bullmq';
import type { Logger } from 'pino';
import { createRedis } from '@core/lib/redis/client';
import { defaultJobOptions, QUEUE_NAMES } from './queues';

export type StartWorkerOptions = {
  redisUrl: string;
  logger: Logger;
  heartbeatEveryMs?: number;
};

export type RunningWorker = {
  stop: () => Promise<void>;
};

// Khởi động worker: hàng đợi mẫu system.heartbeat chạy lặp để chứng minh BullMQ + Redis hoạt động.
// Job nghiệp vụ (DEM/DET, GPS, OCR, thông báo) đăng ký thêm ở các task sau.
export async function startWorker(options: StartWorkerOptions): Promise<RunningWorker> {
  const { redisUrl, logger, heartbeatEveryMs = 60_000 } = options;
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

  logger.info({ queues: [QUEUE_NAMES.heartbeat], heartbeatEveryMs }, 'worker ready');

  let stopping: Promise<void> | undefined;
  return {
    stop: () => {
      stopping ??= (async () => {
        await worker.close();
        await queue.close();
        await connection.quit();
        logger.info('worker đã dừng');
      })();
      return stopping;
    },
  };
}
