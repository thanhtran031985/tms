import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';
import { Writable } from 'node:stream';
import pino from 'pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startWorker } from './worker';

describe('worker BullMQ', () => {
  let redis: StartedTestContainer;

  beforeAll(async () => {
    redis = await new GenericContainer('redis:7')
      .withExposedPorts(6379)
      .withWaitStrategy(Wait.forLogMessage(/Ready to accept connections/))
      .start();
  });

  afterAll(async () => {
    await redis?.stop();
  });

  it('chạy heartbeat theo chu kỳ, ghi log JSON và dừng êm', async () => {
    const lines: string[] = [];
    const sink = new Writable({
      write(chunk, _encoding, done) {
        lines.push(String(chunk));
        done();
      },
    });
    const logger = pino({ base: { service: 'worker' } }, sink);

    const running = await startWorker({
      redisUrl: `redis://${redis.getHost()}:${redis.getMappedPort(6379)}`,
      logger,
      heartbeatEveryMs: 200,
    });

    await expect
      .poll(() => lines.filter((l) => l.includes('"msg":"heartbeat"')).length, { timeout: 15_000 })
      .toBeGreaterThanOrEqual(2);

    await running.stop();
    await running.stop(); // gọi lần hai không lỗi

    const parsed = lines.map((l) => JSON.parse(l) as { msg: string; service: string });
    expect(parsed.some((l) => l.msg === 'worker ready')).toBe(true);
    expect(parsed.every((l) => l.service === 'worker')).toBe(true);
    expect(parsed.at(-1)?.msg).toBe('worker đã dừng');
  });
});
