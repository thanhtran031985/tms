import { drizzle } from 'drizzle-orm/mysql2';
import { createPool } from 'mysql2/promise';
import { requireEnv } from '../env';
import * as schema from './schema';

// Thời gian lưu DATETIME(3) UTC (ADR-008): driver đọc/ghi UTC và phiên MariaDB đặt múi giờ +00:00.
export function createDb(databaseUrl: string) {
  const pool = createPool({ uri: databaseUrl, timezone: 'Z', connectionLimit: 10 });
  pool.on('connection', (conn) => {
    conn.query("SET time_zone = '+00:00'");
  });
  const db = drizzle(pool, { schema, mode: 'default' });
  return { db, pool };
}

export type Db = ReturnType<typeof createDb>['db'];

let shared: ReturnType<typeof createDb> | undefined;

// Chỉ dùng ở tầng hạ tầng (migrate, seed, getTenantDb). Nghiệp vụ trong modules/** bị lint chặn import file này.
export function getDb() {
  shared ??= createDb(requireEnv('DATABASE_URL'));
  return shared;
}

export async function closeDb() {
  if (shared) {
    await shared.pool.end();
    shared = undefined;
  }
}
