import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestInfra, type TestInfra } from './containers';

describe('hạ tầng test (MariaDB + Redis qua Testcontainers)', () => {
  let infra: TestInfra;

  beforeAll(async () => {
    infra = await startTestInfra();
  });

  afterAll(async () => {
    await infra?.stop();
  });

  it('MariaDB trả lời SELECT 1', async () => {
    const [rows] = await infra.pool.query('SELECT 1 AS one');
    expect(rows).toEqual([{ one: 1 }]);
  });

  it('phiên MariaDB dùng múi giờ UTC', async () => {
    const [rows] = await infra.db.execute(sql`SELECT @@session.time_zone AS tz`);
    expect(rows).toEqual([{ tz: '+00:00' }]);
  });

  it('migration đã chạy (có bảng __drizzle_migrations)', async () => {
    const [rows] = await infra.pool.query(
      "SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_name = '__drizzle_migrations'",
    );
    expect(rows).toEqual([{ n: 1 }]);
  });

  it('Redis trả PONG', async () => {
    expect(await infra.redis.ping()).toBe('PONG');
  });
});
