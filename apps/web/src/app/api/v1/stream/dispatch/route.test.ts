// SSE điều vận với Redis thật (Testcontainers): đúng tenant, đúng quyền, đóng kết nối thì hủy đăng ký.
import { dispatchChannel, publishDispatchEvent, type DispatchEvent } from '@core/lib/redis/publish';
import { createRedis } from '@core/lib/redis/client';
import { startTestInfra, type TestInfra } from '@core/test/containers';
import { AppError } from '@shared/errors';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  createDispatchStreamHandler,
  createRedisSubscriber,
} from '@/features/dispatch/stream-handler';
import { createRequireRole } from '@/server/require-role';

vi.setConfig({ testTimeout: 30_000 });

const TENANT_A = '0190a000-0000-7000-8000-00000000000a';
const TENANT_B = '0190a000-0000-7000-8000-00000000000b';

type TestRole = 'VIEWER' | 'DISPATCHER' | 'ACCOUNTANT' | 'ADMIN';
const requireRoleOf = (role: TestRole | null, tenantId: string | null = TENANT_A) =>
  createRequireRole({
    getSession: async () => (role ? { userId: 'u1', tenantId } : null),
    loadMembership: async () => ({
      role: role ?? 'VIEWER',
      userActive: true,
      tenantStatus: 'ACTIVE',
      timezone: 'Asia/Ho_Chi_Minh',
    }),
  });

const event = (tenantId: string, tripId: string): DispatchEvent => ({
  type: 'dispatch.updated',
  tenantId,
  tripId,
  version: 1,
  orderContainerIds: ['c1'],
});

describe('GET /api/v1/stream/dispatch', () => {
  let infra: TestInfra;
  const openClients: (() => void)[] = [];

  beforeAll(async () => {
    infra = await startTestInfra({ redis: true });
  }, 240_000);

  afterAll(async () => {
    openClients.forEach((abort) => abort());
    await infra?.stop();
  });

  const handler = (
    role: TestRole | null,
    options: { tenantId?: string | null; heartbeatMs?: number } = {},
  ) =>
    createDispatchStreamHandler({
      requireRole: requireRoleOf(role, options.tenantId),
      openSubscription: createRedisSubscriber(() => createRedis(infra.redisUrl)),
      ...(options.heartbeatMs ? { heartbeatMs: options.heartbeatMs } : {}),
    });

  // Mở luồng SSE và trả công cụ đọc: đọc tới khi văn bản đã nhận thỏa điều kiện hoặc hết giờ.
  async function connect(h: (r: Request) => Promise<Response>) {
    const controller = new AbortController();
    openClients.push(() => controller.abort());
    const response = await h(
      new Request('http://localhost/api/v1/stream/dispatch', { signal: controller.signal }),
    );
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let text = '';
    async function readUntil(done: (text: string) => boolean, timeoutMs = 5000) {
      const deadline = Date.now() + timeoutMs;
      while (!done(text) && Date.now() < deadline && reader) {
        const next = await Promise.race([
          reader.read(),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 200)),
        ]);
        if (next && !next.done) text += decoder.decode(next.value);
        if (next?.done) break;
      }
      return text;
    }
    return { response, readUntil, abort: () => controller.abort(), text: () => text };
  }

  it('client tenant A nhận sự kiện của tenant A, không nhận của tenant B', async () => {
    const client = await connect(handler('DISPATCHER'));
    expect(client.response.status).toBe(200);
    expect(client.response.headers.get('content-type')).toContain('text/event-stream');
    await client.readUntil((t) => t.includes(': connected'));

    await publishDispatchEvent(infra.redis, event(TENANT_B, 'trip-of-b'));
    await publishDispatchEvent(infra.redis, event(TENANT_A, 'trip-of-a'));
    const text = await client.readUntil((t) => t.includes('trip-of-a'));

    expect(text).toContain('event: dispatch.updated');
    expect(text).toContain('"tripId":"trip-of-a"');
    expect(text).not.toContain('trip-of-b');
    client.abort();
  });

  it('người chỉ xem (VIEWER) vẫn nhận được sự kiện', async () => {
    const client = await connect(handler('VIEWER'));
    await client.readUntil((t) => t.includes(': connected'));

    await publishDispatchEvent(infra.redis, event(TENANT_A, 'trip-viewer'));
    const text = await client.readUntil((t) => t.includes('trip-viewer'));

    expect(text).toContain('"tripId":"trip-viewer"');
    client.abort();
  });

  it('chưa đăng nhập: 401; chưa chọn công ty: 403; không đủ quyền (Kế toán): 403', async () => {
    const anonymous = await handler(null)(new Request('http://localhost/api/v1/stream/dispatch'));
    expect(anonymous.status).toBe(401);
    expect(await anonymous.json()).toMatchObject({ ok: false, code: 'UNAUTHENTICATED' });

    const noTenant = await handler('DISPATCHER', { tenantId: null })(
      new Request('http://localhost/api/v1/stream/dispatch'),
    );
    expect(noTenant.status).toBe(403);

    const accountant = await handler('ACCOUNTANT')(
      new Request('http://localhost/api/v1/stream/dispatch'),
    );
    expect(accountant.status).toBe(403);
    expect(await accountant.json()).toMatchObject({ code: 'FORBIDDEN' });
  });

  it('sự kiện không phải dispatch.updated hoặc mang tenantId khác trên cùng kênh bị bỏ qua', async () => {
    const client = await connect(handler('DISPATCHER'));
    await client.readUntil((t) => t.includes(': connected'));

    const channel = dispatchChannel(TENANT_A);
    await infra.redis.publish(channel, 'không phải json');
    await infra.redis.publish(channel, JSON.stringify({ type: 'khac', tenantId: TENANT_A }));
    await infra.redis.publish(channel, JSON.stringify(event(TENANT_B, 'trip-leak')));
    await publishDispatchEvent(infra.redis, event(TENANT_A, 'trip-ok'));
    const text = await client.readUntil((t) => t.includes('trip-ok'));

    expect(text).toContain('trip-ok');
    expect(text).not.toContain('trip-leak');
    expect(text).not.toContain('khac');
    client.abort();
  });

  it('gửi nhịp tim định kỳ để kết nối không bị cắt', async () => {
    const client = await connect(handler('DISPATCHER', { heartbeatMs: 50 }));

    const text = await client.readUntil((t) => t.includes(': ping'));

    expect(text).toContain(': ping');
    client.abort();
  });

  it('client ngắt kết nối thì hủy đăng ký Redis', async () => {
    const channel = dispatchChannel(TENANT_A);
    const subscribers = async () =>
      Number(((await infra.redis.pubsub('NUMSUB', channel)) as [string, number])[1]);
    const before = await subscribers();
    const client = await connect(handler('DISPATCHER'));
    await client.readUntil((t) => t.includes(': connected'));
    expect(await subscribers()).toBe(before + 1);

    client.abort();

    await expect.poll(subscribers, { timeout: 5000, interval: 100 }).toBe(before);
  });

  it('lỗi bất ngờ của requireRole được ném ra (không nuốt)', async () => {
    const boom = createDispatchStreamHandler({
      requireRole: async () => {
        throw new Error('mất DB');
      },
      openSubscription: createRedisSubscriber(() => createRedis(infra.redisUrl)),
    });
    await expect(boom(new Request('http://localhost/x'))).rejects.toThrow('mất DB');
    expect(new AppError('FORBIDDEN').code).toBe('FORBIDDEN');
  });
});
