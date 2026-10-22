import { notFound } from 'next/navigation';
import { AppError } from '@shared/errors';
import { OrderDetail } from '@/features/orders/order-detail';
import { loadOrderDetail } from '@/features/orders/order-loader';
import { requireOrderPage } from '@/features/orders/order-page-auth';
import { getMasterDataService } from '@/server/services';

export default async function OrderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const [{ id }, { created }] = await Promise.all([params, searchParams]);
  const { ctx, access, now } = await requireOrderPage('order.view');
  let detail;
  try {
    detail = await loadOrderDetail(ctx, id);
  } catch (error) {
    if (error instanceof AppError && error.code === 'NOT_FOUND') notFound();
    throw error;
  }
  const routes = await getMasterDataService().list(ctx, 'routes');
  return (
    <OrderDetail
      detail={detail}
      justCreated={created === '1'}
      access={access}
      routes={routes.map((r) => ({ id: r.id, name: r.name }))}
      serverNow={now}
    />
  );
}
