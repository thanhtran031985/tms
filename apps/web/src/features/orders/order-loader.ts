// Nạp dữ liệu cho màn Đơn hàng ở server: gọi service rồi chọn từng cột gửi xuống client (không đẩy cả dòng DB).
import type { RequestContext } from '@core/lib/context';
import type { OrderContainerRow, OrderRow } from '@core/modules/orders/repo';
import { getIdentityRepo, getMasterDataService, getOrderService } from '@/server/services';
import { describeAudit } from './order-history';
import type { ContainerDto, OrderDetailDto, OrderListItemDto } from './order-types';

const iso = (value: Date | null) => (value ? value.toISOString() : null);

type Previews = Awaited<ReturnType<ReturnType<typeof getOrderService>['previewPrices']>>;

function priceOf(
  c: OrderContainerRow,
  previews: Previews,
): Pick<ContainerDto, 'priceState' | 'priceAmount'> {
  if (c.status === 'CANCELLED') return { priceState: 'none', priceAmount: null };
  if (c.freightTariffId !== null || c.isManualPrice) {
    return { priceState: 'set', priceAmount: c.baseFreightAmount };
  }
  const preview = previews[c.id];
  return preview?.found
    ? { priceState: 'preview', priceAmount: preview.amount }
    : { priceState: 'missing', priceAmount: null };
}

function containerDto(c: OrderContainerRow, previews: Previews): ContainerDto {
  return {
    id: c.id,
    lineNo: c.lineNo,
    containerNo: c.containerNo,
    containerType: c.containerType,
    sealNo: c.sealNo,
    status: c.status,
    portReadiness: c.portReadinessStatus,
    demFreeUntil: iso(c.demFreeUntil),
    detFreeUntil: iso(c.detFreeUntil),
    baseFreightAmount: c.baseFreightAmount,
    ...priceOf(c, previews),
    isManualPrice: c.isManualPrice,
    repriceRequired: c.repriceRequired,
    isEpodVerified: c.isEpodVerified,
    routeId: c.routeId,
    cancelReason: c.cancelReason,
  };
}

type Names = {
  customers: Map<string, string>;
  lines: Map<string, string>;
  routes: Map<string, string>;
};

async function loadNames(ctx: RequestContext): Promise<Names> {
  const master = getMasterDataService();
  const [customers, lines, routes] = await Promise.all([
    master.list(ctx, 'customers'),
    master.list(ctx, 'shippingLines'),
    master.list(ctx, 'routes'),
  ]);
  return {
    customers: new Map(customers.map((c) => [c.id, c.name])),
    lines: new Map(lines.map((l) => [l.id, l.code])),
    routes: new Map(routes.map((r) => [r.id, r.name])),
  };
}

function listItem(
  order: OrderRow,
  containers: OrderContainerRow[],
  names: Names,
  previews: Previews,
): OrderListItemDto {
  return {
    id: order.id,
    orderNo: order.orderNo,
    orderType: order.orderType,
    bookingOrBlNo: order.bookingOrBlNo,
    customerId: order.customerId,
    customerName: names.customers.get(order.customerId) ?? 'Khách không còn',
    shippingLineId: order.shippingLineId,
    shippingLineName: order.shippingLineId ? (names.lines.get(order.shippingLineId) ?? null) : null,
    vesselVoyage: order.vesselVoyage,
    cutOffAt: iso(order.cutOffAt),
    eta: iso(order.eta),
    status: order.status,
    version: order.version,
    containerCount: order.containerCount,
    totalFreightAmount: order.totalFreightAmount,
    totalSurchargeAmount: order.totalSurchargeAmount,
    totalPassThroughAmount: order.totalPassThroughAmount,
    currency: order.currency,
    createdAt: order.createdAt.toISOString(),
    containers: containers.map((c) => containerDto(c, previews)),
  };
}

export async function loadOrderList(ctx: RequestContext): Promise<OrderListItemDto[]> {
  const service = getOrderService();
  const [rows, names] = await Promise.all([service.listOrders(ctx), loadNames(ctx)]);
  // Order nháp chưa chốt giá: tra giá dự kiến để hiện tổng và cont chưa có giá (không ghi gì).
  const previews = await service.previewPrices(
    ctx,
    rows.filter((r) => r.order.status === 'DRAFT').map((r) => r.order.id),
  );
  return rows.map(({ order, containers }) => listItem(order, containers, names, previews));
}

export async function loadOrderDetail(
  ctx: RequestContext,
  orderId: string,
): Promise<OrderDetailDto> {
  const service = getOrderService();
  const [detail, history, warnings, previews, names] = await Promise.all([
    service.getOrder(ctx, orderId),
    service.getOrderHistory(ctx, orderId),
    service.getContainerWarnings(ctx, orderId),
    service.previewPrices(ctx, [orderId]),
    loadNames(ctx),
  ]);

  const actors = new Map<string, string>();
  for (const userId of new Set(
    history.map((h) => h.actorUserId).filter((id): id is string => !!id),
  )) {
    actors.set(userId, (await getIdentityRepo().findUserById(userId))?.fullName ?? 'Người dùng');
  }

  return {
    order: {
      ...listItem(detail.order, detail.containers, names, previews),
      routeName: names.routes.get(detail.order.routeId) ?? 'Tuyến không còn',
      cargoDescription: detail.order.cargoDescription,
      customerRef: detail.order.customerRef,
      cancelReason: detail.order.cancelReason,
    },
    stops: detail.stops.map((s) => ({
      id: s.id,
      orderContainerId: s.orderContainerId,
      sequenceNo: s.sequenceNo,
      stopType: s.stopType,
      locationName: s.locationName,
      windowStart: iso(s.windowStart),
      status: s.status,
    })),
    fees: detail.fees.map((f) => ({
      id: f.id,
      orderContainerId: f.orderContainerId,
      feeCategory: f.feeCategory,
      feeCode: f.feeCode,
      quantity: f.quantity,
      amount: f.amount,
      source: f.source,
    })),
    history: history.map((h) => ({
      id: h.id,
      at: h.createdAt.toISOString(),
      who: h.actorUserId ? (actors.get(h.actorUserId) ?? 'Người dùng') : 'Hệ thống',
      what: describeAudit(h),
    })),
    warnings,
  };
}
