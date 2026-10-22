import { createLogger } from './logger';
import { startWorker } from './worker';

const logger = createLogger();

// Dev có giá trị mặc định cho Redis của docker compose; production bắt buộc đặt REDIS_URL.
const redisUrl =
  process.env.REDIS_URL ??
  (process.env.NODE_ENV === 'production' ? undefined : 'redis://localhost:6379');

if (!redisUrl) {
  logger.fatal('Thiếu biến môi trường REDIS_URL');
  process.exit(1);
}

const running = await startWorker({ redisUrl, logger });

// Tắt êm khi nhận tín hiệu (Ctrl+C = SIGINT, SIGBREAK trên Windows, SIGTERM từ trình điều phối).
let shuttingDown = false;
for (const signal of ['SIGINT', 'SIGTERM', 'SIGBREAK'] as const) {
  process.on(signal, () => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'nhận tín hiệu dừng');
    running
      .stop()
      .then(() => process.exit(0))
      .catch((error: unknown) => {
        logger.error({ err: error }, 'dừng worker lỗi');
        process.exit(1);
      });
  });
}
