// Sự kiện dispatch.updated phát lên Redis Pub/Sub sau khi commit (spec 03 mục 1 bước 7), kênh theo tenant.
import { dispatchChannel } from '../../lib/redis/publish';
import type { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  A,
  at,
  B,
  createWorld,
  dispatcher,
  expectAppError,
  type World,
} from './dispatch.test-world';

const WINDOW = { start: at('01:00'), end: at('05:00') };
const settle = () => new Promise((resolve) => setTimeout(resolve, 400));

describe('dispatch.updated trên Redis', () => {
  let w: World;
  let subscriber: Redis;
  const received: { channel: string; payload: Record<string, unknown> }[] = [];

  beforeAll(async () => {
    w = await createWorld({ redis: true });
    subscriber = w.infra.redis.duplicate();
    subscriber.on('message', (channel, message) => {
      received.push({ channel, payload: JSON.parse(message) as Record<string, unknown> });
    });
    await subscriber.subscribe(dispatchChannel(A), dispatchChannel(B));
  });

  afterAll(async () => {
    await subscriber?.quit();
    await w?.stop();
  });

  it('kênh có tiền tố tenant', () => {
    expect(dispatchChannel(A)).toBe(`tenant:${A}:dispatch`);
  });

  it('gán thành công: đúng 1 thông điệp ở kênh tenant A kèm id chuyến, version, id container; tenant B không nhận', async () => {
    const r = await w.newResources();
    const { trip, containerId } = await w.newTrip(WINDOW);
    received.length = 0;

    const result = await w.assign(dispatcher, trip.id, r.ids);
    await settle();

    expect(received).toHaveLength(1);
    expect(received[0]!.channel).toBe(dispatchChannel(A));
    expect(received[0]!.payload).toMatchObject({
      type: 'dispatch.updated',
      tenantId: A,
      tripId: trip.id,
      version: result.trip.version,
      orderContainerIds: [containerId],
    });
    expect(received.some((m) => m.channel === dispatchChannel(B))).toBe(false);
  });

  it('transaction lỗi (trùng giờ) thì không phát gì', async () => {
    const r = await w.newResources();
    const first = await w.newTrip(WINDOW);
    const second = await w.newTrip(WINDOW);
    await w.assign(dispatcher, first.trip.id, r.ids);
    await settle();
    received.length = 0;

    await expectAppError(w.assign(dispatcher, second.trip.id, r.ids), 'RESOURCE_TIME_CONFLICT');
    await settle();

    expect(received).toEqual([]);
  });

  it('tạo chuyến, điều chuyến và hủy gán mỗi thao tác phát đúng 1 thông điệp', async () => {
    const r = await w.newResources();
    const { container } = await w.newContainer({ status: 'PENDING' });
    received.length = 0;

    const created = await w.service.createSingleTrip(dispatcher, {
      orderContainerId: container.id,
      plannedStart: WINDOW.start,
      plannedEnd: WINDOW.end,
    });
    const planned = await w.assign(dispatcher, created.trip.id, r.ids);
    const dispatched = await w.service.dispatchTrip(dispatcher, {
      tripId: created.trip.id,
      version: planned.trip.version,
    });
    await w.service.cancelAssignment(dispatcher, {
      tripId: created.trip.id,
      version: dispatched.trip.version,
    });
    await settle();

    expect(received).toHaveLength(4);
    expect(received.map((m) => m.payload.tripId)).toEqual(Array(4).fill(created.trip.id));
    const versions = received.map((m) => m.payload.version as number);
    expect(versions).toEqual([...versions].sort((x, y) => x - y));
  });

  it('Redis lỗi không làm hỏng thao tác đã commit', async () => {
    const r = await w.newResources();
    const { trip } = await w.newTrip(WINDOW);
    const { createDispatchService } = await import('./index');
    const service = createDispatchService({
      tenantDb: (ctx) => w.tdb(ctx.tenantId),
      now: () => new Date('2026-10-22T05:00:00.000Z'),
      publish: async () => {
        throw new Error('Redis không kết nối được');
      },
    });

    const result = await service.assignResources(dispatcher, {
      tripId: trip.id,
      version: trip.version,
      ...r.ids,
    });

    expect(result.assignments.length).toBeGreaterThan(0);
  });
});
