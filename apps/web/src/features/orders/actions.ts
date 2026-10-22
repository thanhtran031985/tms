'use server';

// Server Action của Order và container (task 04). Mỗi action dựng bằng defineAction: requireRole → zod → service → Result.
// Service kiểm lại quyền theo vai trò, validate tham chiếu theo tenant và ghi audit trong cùng transaction.
import { rolesFor } from '@core/modules/identity/permissions';
import { ok } from '@shared/result';
import {
  addContainersSchema,
  cancelContainerSchema,
  cancelOrderSchema,
  confirmOrderSchema,
  createOrderInputSchema,
  manualPriceSchema,
  removeContainerSchema,
  routeStopTemplateSchema,
} from '@shared/schemas/orders';
import { z } from 'zod';
import { defineAction } from '@/server';
import { getOrderService } from '@/server/services';
import { loadOrderList } from './order-loader';

const VIEW = rolesFor('order.view');
const WRITE = rolesFor('order.write');
const MANUAL_PRICE = rolesFor('order.manualPrice');
const CATALOG_WRITE = rolesFor('masterData.write');
const svc = () => getOrderService();

// Nạp lại danh sách Order (Thử lại, sau khi xác nhận hàng loạt); màn danh sách giữ dữ liệu cũ nếu lỗi.
export const listOrders = defineAction(VIEW, z.object({}), async (ctx) =>
  ok(await loadOrderList(ctx)),
);

export const createOrder = defineAction(WRITE, createOrderInputSchema, async (ctx, input) => {
  const { order, warnings } = await svc().createOrder(ctx, input);
  return ok({
    id: order.id,
    orderNo: order.orderNo,
    containerCount: order.containerCount,
    warnings,
  });
});

export const setRouteStopTemplate = defineAction(
  CATALOG_WRITE,
  routeStopTemplateSchema,
  async (ctx, { routeId, stopTypes }) =>
    ok(await svc().setRouteStopTemplate(ctx, routeId, stopTypes)),
);

export const confirmOrder = defineAction(WRITE, confirmOrderSchema, async (ctx, input) => {
  const { order } = await svc().confirmOrder(ctx, input);
  return ok({ id: order.id, status: order.status, version: order.version });
});

export const setManualPrice = defineAction(MANUAL_PRICE, manualPriceSchema, async (ctx, input) => {
  const { order, container } = await svc().setManualPrice(ctx, input);
  return ok({
    orderVersion: order.version,
    containerId: container.id,
    baseFreightAmount: container.baseFreightAmount,
  });
});

export const addContainers = defineAction(WRITE, addContainersSchema, async (ctx, input) => {
  const { order, containers, warnings } = await svc().addContainers(ctx, input);
  return ok({ orderVersion: order.version, addedCount: containers.length, warnings });
});

export const removeContainer = defineAction(WRITE, removeContainerSchema, async (ctx, input) => {
  const { order } = await svc().removeContainer(ctx, input);
  return ok({ orderVersion: order.version, containerCount: order.containerCount });
});

export const cancelContainer = defineAction(WRITE, cancelContainerSchema, async (ctx, input) => {
  const { order, orderCancelled } = await svc().cancelContainer(ctx, input);
  return ok({ orderVersion: order.version, orderStatus: order.status, orderCancelled });
});

export const cancelOrder = defineAction(WRITE, cancelOrderSchema, async (ctx, input) => {
  const { order, orderCancelled, cancelledCount } = await svc().cancelOrder(ctx, input);
  return ok({
    orderVersion: order.version,
    orderStatus: order.status,
    orderCancelled,
    cancelledCount,
  });
});
