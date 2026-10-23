/* eslint-disable @typescript-eslint/no-unused-vars -- khung chưa cài đặt của task 08, gỡ khi cài đặt */
// Tách chuyến ghép và gỡ container khỏi chuyến khi hủy container/Order (task 08, spec 03 mục 4).
// CHƯA CÀI ĐẶT (bước 4); khung hàm để test biên dịch được và đỏ vì chưa có nghiệp vụ.
import { AppError } from '@shared/errors';
import type { RemoveContainerFromTripInput } from '@shared/schemas/dispatch';
import type { RequestContext } from '../../lib/context';
import type { TenantDb } from '../../lib/db/tenant-db';
import type { DispatchEvent } from '../../lib/redis/publish';
import type { DispatchDeps } from './deps';
import type { TripResult } from './index';

const NOT_IMPLEMENTED = 'Chưa cài đặt (task 08).';

export type RemoveContainerResult = TripResult & {
  removedContainerId: string;
  /** Container bị đánh dấu cần tính lại giá (container bị tách và container còn lại của chuyến). */
  repriceContainerIds: string[];
};

/**
 * Gỡ các container khỏi mọi chuyến hoạt động của chúng, trong transaction của người gọi (Order hủy container/Order).
 * Trả các sự kiện `dispatch.updated` để người gọi phát SAU khi commit.
 */
export type DetachFromTrips = (
  tx: TenantDb,
  ctx: RequestContext,
  input: { orderContainerIds: string[]; reason: string },
) => Promise<DispatchEvent[]>;

export const detachContainersFromTrips: DetachFromTrips = async () => {
  throw new AppError('INTERNAL_ERROR', NOT_IMPLEMENTED);
};

export function createSplitService(_deps: DispatchDeps) {
  async function removeContainerFromTrip(
    _ctx: RequestContext,
    _input: RemoveContainerFromTripInput,
  ): Promise<RemoveContainerResult> {
    throw new AppError('INTERNAL_ERROR', NOT_IMPLEMENTED);
  }

  return { removeContainerFromTrip };
}
