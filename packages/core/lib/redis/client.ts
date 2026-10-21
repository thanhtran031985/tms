// Quy ước key Redis: mọi key theo tenant có dạng `t:{tenantId}:{miền}:{...}` (vd. `t:{tenantId}:gps:last:{vehicleId}`).
// Key dùng chung toàn hệ thống (không thuộc tenant) bắt đầu bằng `sys:` (vd. `sys:heartbeat`).
// Luôn tạo key bằng tenantKey()/sysKey(), không ghép chuỗi tay.
import { Redis } from 'ioredis';
import { requireEnv } from '../env';

export function createRedis(url: string, options: { forBullMQ?: boolean } = {}) {
  // BullMQ yêu cầu maxRetriesPerRequest = null cho kết nối blocking.
  return new Redis(url, options.forBullMQ ? { maxRetriesPerRequest: null } : {});
}

let shared: Redis | undefined;

export function getRedis() {
  shared ??= createRedis(requireEnv('REDIS_URL'));
  return shared;
}

export async function closeRedis() {
  if (shared) {
    await shared.quit();
    shared = undefined;
  }
}

export function tenantKey(tenantId: string, ...parts: string[]) {
  if (!tenantId) throw new Error('tenantKey cần tenantId');
  return ['t', tenantId, ...parts].join(':');
}

export function sysKey(...parts: string[]) {
  return ['sys', ...parts].join(':');
}
