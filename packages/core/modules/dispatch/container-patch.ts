// Cập nhật container khi vào hoặc ra chuyến: trạng thái, chế độ chạy áp giá và cờ tính lại giá (spec 06 mục 4), mỗi container
// một câu UPDATE kèm audit trong transaction của người gọi. Dùng chung cho ghép chuyến, tách chuyến và hủy.
import { eq } from 'drizzle-orm';
import type { ContainerStatus, TripMode } from '@shared/enums';
import { writeAudit } from '../../lib/audit';
import type { RequestContext } from '../../lib/context';
import { orderContainers } from '../../lib/db/schema';
import type { TenantDb } from '../../lib/db/tenant-db';
import type { OrderContainerRow, OrderRow } from '../orders/repo';

export type ContainerPatch = {
  status?: ContainerStatus;
  appliedTripMode?: TripMode;
  repriceRequired?: boolean;
};

/** Ghép chung giá chỉ khi mọi container cùng một khách và tenant chưa tắt `shareTwinDiscountWithCustomer` (spec 06 mục 3). */
export function sharesTripDiscount(
  containers: Pick<OrderContainerRow, 'orderId'>[],
  orders: Map<string, Pick<OrderRow, 'customerId'>>,
  shareTwinDiscountWithCustomer: boolean,
): boolean {
  if (!shareTwinDiscountWithCustomer) return false;
  const customers = new Set(containers.map((c) => orders.get(c.orderId)?.customerId));
  return customers.size === 1 && !customers.has(undefined);
}

/** Ghi các trường thay đổi của container (bỏ qua nếu không có gì đổi) và audit; trả bản ghi sau khi cập nhật. */
export async function patchContainerForTrip(
  tx: TenantDb,
  ctx: RequestContext,
  container: OrderContainerRow,
  patch: ContainerPatch,
  tripId: string,
): Promise<OrderContainerRow> {
  const changed: ContainerPatch = {};
  if (patch.status !== undefined && patch.status !== container.status) changed.status = patch.status;
  if (patch.appliedTripMode !== undefined && patch.appliedTripMode !== container.appliedTripMode) {
    changed.appliedTripMode = patch.appliedTripMode;
  }
  if (patch.repriceRequired !== undefined && patch.repriceRequired !== container.repriceRequired) {
    changed.repriceRequired = patch.repriceRequired;
  }
  if (Object.keys(changed).length === 0) return container;

  const version = container.version + 1;
  await tx.update(orderContainers, { ...changed, version }, eq(orderContainers.id, container.id));
  const updated: OrderContainerRow = { ...container, ...changed, version };

  if (changed.status !== undefined) {
    await writeAudit(tx, ctx, {
      entity: 'order_containers',
      entityId: container.id,
      action: 'STATUS_CHANGE',
      before: { status: container.status },
      after: { status: changed.status, tripId },
    });
  }
  if (changed.appliedTripMode !== undefined || changed.repriceRequired !== undefined) {
    await writeAudit(tx, ctx, {
      entity: 'order_containers',
      entityId: container.id,
      action: 'MARK_REPRICE',
      before: {
        appliedTripMode: container.appliedTripMode,
        repriceRequired: container.repriceRequired,
      },
      after: {
        appliedTripMode: updated.appliedTripMode,
        repriceRequired: updated.repriceRequired,
        tripId,
      },
    });
  }
  return updated;
}
