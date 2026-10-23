// Đồng bộ tổng tiền của Order sau khi container hoặc phí đổi ở module khác (Street Turn, tính lại giá, tách chuyến).
// Chạy trong transaction của người gọi: khóa dòng Order rồi tính lại từ container và phí (computeOrderTotals) và ghi kèm version + 1.
import { eq } from 'drizzle-orm';
import { AppError } from '@shared/errors';
import { orderContainers, orderFees, orders } from '../../lib/db/schema';
import type { TenantDb } from '../../lib/db/tenant-db';
import { computeOrderTotals } from './totals';

export async function syncOrderTotals(tx: TenantDb, orderId: string): Promise<void> {
  const [order] = await tx.select(orders, eq(orders.id, orderId), { forUpdate: true });
  if (!order) throw new AppError('NOT_FOUND');
  const [containers, fees] = await Promise.all([
    tx.select(orderContainers, eq(orderContainers.orderId, orderId)),
    tx.select(orderFees, eq(orderFees.orderId, orderId)),
  ]);
  const totals = computeOrderTotals(containers, fees);
  await tx.update(orders, { ...totals, version: order.version + 1 }, eq(orders.id, orderId));
}
