import { getRedis } from '@core/lib/redis/client';
import {
  createDispatchStreamHandler,
  createRedisSubscriber,
} from '@/features/dispatch/stream-handler';
import { requireRole } from '@/server';

// SSE cho Kanban điều vận: GET /api/v1/stream/dispatch. requireRole nằm trong handler (stream-handler.ts).
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const GET = createDispatchStreamHandler({
  requireRole,
  openSubscription: createRedisSubscriber(() => getRedis().duplicate()),
});
