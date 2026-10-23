// SSE realtime của Kanban điều vận (task 07): đẩy sự kiện `dispatch.updated` của đúng tenant tới trình duyệt.
// Tách khỏi route.ts (Next chỉ cho route.ts export phương thức HTTP) để test được với Redis thật.
// Luồng: requireRole → subscribe kênh `tenant:{tenantId}:dispatch` (tenantId lấy từ phiên, không từ client) → SSE.
import type { RequestContext } from '@core/lib/context';
import { dispatchChannel } from '@core/lib/redis/publish';
import { rolesFor } from '@core/modules/identity/permissions';
import { AppError, ERROR_MESSAGES } from '@shared/errors';
import type { getRedis } from '@core/lib/redis/client';

// ioredis không phải dependency của web; lấy kiểu qua core.
type Redis = ReturnType<typeof getRedis>;

export const DISPATCH_EVENT = 'dispatch.updated';
const RETRY_MS = 3000;
const HEARTBEAT_MS = 15_000;

/** Mở đăng ký một kênh; trả hàm hủy. onMessage nhận nguyên văn chuỗi JSON đã publish. */
export type OpenSubscription = (
  channel: string,
  onMessage: (raw: string) => void,
) => Promise<() => Promise<void>>;

export type DispatchStreamDeps = {
  requireRole: (roles: ReturnType<typeof rolesFor>) => Promise<RequestContext>;
  openSubscription: OpenSubscription;
  heartbeatMs?: number;
};

const STATUS_BY_CODE: Partial<Record<keyof typeof ERROR_MESSAGES, number>> = {
  UNAUTHENTICATED: 401,
  NO_TENANT_MEMBERSHIP: 403,
  FORBIDDEN: 403,
};

function errorResponse(error: unknown): Response {
  if (error instanceof AppError) {
    return Response.json(
      { ok: false, code: error.code, message: error.message },
      { status: STATUS_BY_CODE[error.code as keyof typeof ERROR_MESSAGES] ?? 400 },
    );
  }
  throw error;
}

/** Kết nối Redis Pub/Sub riêng cho mỗi luồng SSE (kết nối đang subscribe không dùng được cho lệnh khác). */
export function createRedisSubscriber(createClient: () => Redis): OpenSubscription {
  return async (channel, onMessage) => {
    const client = createClient();
    client.on('error', () => undefined); // ngắt kết nối được xử lý ở phía luồng SSE; tránh sập tiến trình
    client.on('message', (received, raw) => {
      if (received === channel) onMessage(raw);
    });
    await client.subscribe(channel);
    return async () => {
      try {
        await client.unsubscribe(channel);
      } finally {
        client.disconnect();
      }
    };
  };
}

export function createDispatchStreamHandler(deps: DispatchStreamDeps) {
  const heartbeatMs = deps.heartbeatMs ?? HEARTBEAT_MS;
  const encoder = new TextEncoder();

  return async function GET(request: Request): Promise<Response> {
    let ctx: RequestContext;
    try {
      ctx = await deps.requireRole(rolesFor('dispatch.view'));
    } catch (error) {
      return errorResponse(error);
    }

    // Đăng ký TRƯỚC khi trả Response để không mất sự kiện phát ngay sau khi client nhận được phản hồi.
    const pending: string[] = [];
    let write = (chunk: string) => {
      pending.push(chunk);
    };
    const unsubscribe = await deps.openSubscription(dispatchChannel(ctx.tenantId), (raw) => {
      try {
        const event = JSON.parse(raw) as { type?: string; tenantId?: string };
        // Phòng thủ thêm: kênh đã theo tenant, vẫn bỏ sự kiện nào mang tenantId khác.
        if (event.type !== DISPATCH_EVENT || event.tenantId !== ctx.tenantId) return;
        write(`event: ${DISPATCH_EVENT}\ndata: ${raw}\n\n`);
      } catch {
        // Bỏ qua thông điệp không phải JSON.
      }
    });

    let timer: ReturnType<typeof setInterval> | undefined;
    let closed = false;
    let finish: () => void = () => undefined;
    const close = async () => {
      if (closed) return;
      closed = true;
      clearInterval(timer);
      finish();
      await unsubscribe().catch(() => undefined);
    };
    request.signal.addEventListener('abort', () => void close());

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        write = (chunk) => {
          if (closed) return;
          try {
            controller.enqueue(encoder.encode(chunk));
          } catch {
            void close();
          }
        };
        finish = () => {
          try {
            controller.close();
          } catch {
            // đã đóng
          }
        };
        write(`retry: ${RETRY_MS}\n\n: connected\n\n`);
        for (const chunk of pending.splice(0)) write(chunk);
        timer = setInterval(() => write(': ping\n\n'), heartbeatMs);
        if (request.signal.aborted) void close();
      },
      cancel: close,
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  };
}
