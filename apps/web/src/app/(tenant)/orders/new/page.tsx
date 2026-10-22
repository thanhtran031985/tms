import { OrderCreate } from '@/features/orders/order-create';
import { requireOrderPage } from '@/features/orders/order-page-auth';
import { getMasterDataService, getOrderService } from '@/server/services';

export default async function NewOrderPage() {
  const { ctx } = await requireOrderPage('order.write');
  const master = getMasterDataService();
  const [customers, shippingLines, routes, locations, templates] = await Promise.all([
    master.list(ctx, 'customers'),
    master.list(ctx, 'shippingLines'),
    master.list(ctx, 'routes'),
    master.list(ctx, 'locations'),
    getOrderService().listRouteStopTemplates(ctx),
  ]);
  return (
    <OrderCreate
      customers={customers.map((c) => ({ id: c.id, name: c.name }))}
      shippingLines={shippingLines.map((l) => ({ id: l.id, name: `${l.code} · ${l.name}` }))}
      routes={routes.map((r) => ({ id: r.id, name: r.name }))}
      locations={locations.map((l) => ({ id: l.id, name: l.name, type: l.type }))}
      domesticRouteIds={Object.keys(templates)}
    />
  );
}
