// Hạ tầng test tích hợp: MariaDB + Redis thật bằng Testcontainers, tự chạy migration.
// Dùng chung cho test tích hợp (*.int.test.ts) của mọi task; không phụ thuộc docker compose của dev.
import { fileURLToPath } from 'node:url';
import { MariaDbContainer } from '@testcontainers/mariadb';
import { migrate } from 'drizzle-orm/mysql2/migrator';
import type { Redis } from 'ioredis';
import { GenericContainer, Wait } from 'testcontainers';
import { createDb } from '../lib/db/client';
import { createRedis } from '../lib/redis/client';

const migrationsFolder = fileURLToPath(new URL('../lib/db/migrations', import.meta.url));

export type TestInfra = {
  db: ReturnType<typeof createDb>['db'];
  pool: ReturnType<typeof createDb>['pool'];
  redis: Redis;
  databaseUrl: string;
  redisUrl: string;
  stop: () => Promise<void>;
};

export async function startTestInfra(): Promise<TestInfra> {
  const [mariadb, redisContainer] = await Promise.all([
    new MariaDbContainer('mariadb:11.4')
      .withDatabase('tms_test')
      .withCommand([
        '--character-set-server=utf8mb4',
        '--collation-server=utf8mb4_unicode_ci',
        '--default-time-zone=+00:00',
      ])
      .start(),
    new GenericContainer('redis:7')
      .withExposedPorts(6379)
      .withWaitStrategy(Wait.forLogMessage(/Ready to accept connections/))
      .start(),
  ]);

  const databaseUrl = mariadb.getConnectionUri();
  const redisUrl = `redis://${redisContainer.getHost()}:${redisContainer.getMappedPort(6379)}`;
  const { db, pool } = createDb(databaseUrl);
  const redis = createRedis(redisUrl);

  await migrate(db, { migrationsFolder });

  return {
    db,
    pool,
    redis,
    databaseUrl,
    redisUrl,
    stop: async () => {
      await redis.quit();
      await pool.end();
      await Promise.all([mariadb.stop(), redisContainer.stop()]);
    },
  };
}
