import { loadOrderList } from '@/features/orders/order-loader';
import { OrderList } from '@/features/orders/order-list';
import { requireOrderPage } from '@/features/orders/order-page-auth';

export default async function OrdersPage() {
  const { ctx, access, now } = await requireOrderPage('order.view');
  const rows = await loadOrderList(ctx);
  return <OrderList initialRows={rows} access={access} serverNow={now} />;
}
