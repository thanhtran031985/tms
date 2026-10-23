// Phát sự kiện nghiệp vụ lên Redis Pub/Sub. Kênh theo tenant nên tenant khác không nhận được (khác key `t:{tenantId}:` của tenantKey
// vì Pub/Sub không phải key lưu trữ; task 07 đăng ký đúng kênh này để đẩy SSE tới Kanban).
import type { Redis } from 'ioredis';

/** Điều vận đổi: Kanban tải lại các thẻ container liên quan. */
export type DispatchEvent = {
  type: 'dispatch.updated';
  tenantId: string;
  tripId: string;
  version: number;
  orderContainerIds: string[];
};

export const dispatchChannel = (tenantId: string): string => {
  if (!tenantId) throw new Error('dispatchChannel cần tenantId');
  return `tenant:${tenantId}:dispatch`;
};

/** Phát SAU khi transaction commit, ngoài transaction. Trả số subscriber nhận được. */
export async function publishDispatchEvent(redis: Redis, event: DispatchEvent): Promise<number> {
  return redis.publish(dispatchChannel(event.tenantId), JSON.stringify(event));
}
