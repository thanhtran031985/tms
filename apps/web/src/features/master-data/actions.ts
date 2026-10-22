'use server';

// Server Action của danh mục cơ bản (task 02). Mỗi action dựng bằng defineAction: requireRole → zod → service → Result.
// list* là đọc, để màn danh sách tải lại giữ dữ liệu cũ khi lỗi. Kế toán chỉ có updateCustomerBilling.
import type { RequestContext } from '@core/lib/context';
import { rolesFor } from '@core/modules/identity/permissions';
import { ok } from '@shared/result';
import {
  customerBillingSchema,
  customerInputSchema,
  idInputSchema,
  locationInputSchema,
  routeInputSchema,
  shippingLineInputSchema,
  vendorInputSchema,
} from '@shared/schemas/master-data';
import { z } from 'zod';
import { defineAction } from '@/server';
import { getMasterDataService } from '@/server/services';

const READ = rolesFor('masterData.view');
const WRITE = rolesFor('masterData.write');
const BILLING = rolesFor('masterData.editBilling');

const noInput = z.object({});
const svc = () => getMasterDataService();

// ---- Khách hàng
export const listCustomers = defineAction(READ, noInput, async (ctx) =>
  ok(await svc().list(ctx, 'customers')),
);
export const createCustomer = defineAction(WRITE, customerInputSchema, async (ctx, input) =>
  ok(await svc().create(ctx, 'customers', input)),
);
export const updateCustomer = defineAction(
  WRITE,
  idInputSchema.extend(customerInputSchema.shape),
  async (ctx, { id, ...input }) => ok(await svc().update(ctx, 'customers', id, input)),
);
export const updateCustomerBilling = defineAction(
  BILLING,
  idInputSchema.extend(customerBillingSchema.shape),
  async (ctx, { id, ...input }) => ok(await svc().updateCustomerBilling(ctx, id, input)),
);
export const softDeleteCustomer = defineAction(WRITE, idInputSchema, async (ctx, { id }) =>
  ok(await svc().softDelete(ctx, 'customers', id)),
);
export const restoreCustomer = defineAction(WRITE, idInputSchema, async (ctx, { id }) =>
  ok(await svc().restore(ctx, 'customers', id)),
);

// ---- Hãng tàu
export const listShippingLines = defineAction(READ, noInput, async (ctx: RequestContext) =>
  ok(await svc().list(ctx, 'shippingLines')),
);
export const createShippingLine = defineAction(WRITE, shippingLineInputSchema, async (ctx, input) =>
  ok(await svc().create(ctx, 'shippingLines', input)),
);
export const updateShippingLine = defineAction(
  WRITE,
  idInputSchema.extend(shippingLineInputSchema.shape),
  async (ctx, { id, ...input }) => ok(await svc().update(ctx, 'shippingLines', id, input)),
);
export const softDeleteShippingLine = defineAction(WRITE, idInputSchema, async (ctx, { id }) =>
  ok(await svc().softDelete(ctx, 'shippingLines', id)),
);
export const restoreShippingLine = defineAction(WRITE, idInputSchema, async (ctx, { id }) =>
  ok(await svc().restore(ctx, 'shippingLines', id)),
);

// ---- Nhà cung cấp
export const listVendors = defineAction(READ, noInput, async (ctx) =>
  ok(await svc().list(ctx, 'vendors')),
);
export const createVendor = defineAction(WRITE, vendorInputSchema, async (ctx, input) =>
  ok(await svc().create(ctx, 'vendors', input)),
);
export const updateVendor = defineAction(
  WRITE,
  idInputSchema.extend(vendorInputSchema.shape),
  async (ctx, { id, ...input }) => ok(await svc().update(ctx, 'vendors', id, input)),
);
export const softDeleteVendor = defineAction(WRITE, idInputSchema, async (ctx, { id }) =>
  ok(await svc().softDelete(ctx, 'vendors', id)),
);
export const restoreVendor = defineAction(WRITE, idInputSchema, async (ctx, { id }) =>
  ok(await svc().restore(ctx, 'vendors', id)),
);

// ---- Địa điểm
export const listLocations = defineAction(READ, noInput, async (ctx) =>
  ok(await svc().list(ctx, 'locations')),
);
export const createLocation = defineAction(WRITE, locationInputSchema, async (ctx, input) =>
  ok(await svc().create(ctx, 'locations', input)),
);
export const updateLocation = defineAction(
  WRITE,
  idInputSchema.extend(locationInputSchema.shape),
  async (ctx, { id, ...input }) => ok(await svc().update(ctx, 'locations', id, input)),
);
export const softDeleteLocation = defineAction(WRITE, idInputSchema, async (ctx, { id }) =>
  ok(await svc().softDelete(ctx, 'locations', id)),
);
export const restoreLocation = defineAction(WRITE, idInputSchema, async (ctx, { id }) =>
  ok(await svc().restore(ctx, 'locations', id)),
);

// ---- Tuyến
export const listRoutes = defineAction(READ, noInput, async (ctx) =>
  ok(await svc().list(ctx, 'routes')),
);
export const createRoute = defineAction(WRITE, routeInputSchema, async (ctx, input) =>
  ok(await svc().create(ctx, 'routes', input)),
);
export const updateRoute = defineAction(
  WRITE,
  idInputSchema.extend(routeInputSchema.shape),
  async (ctx, { id, ...input }) => ok(await svc().update(ctx, 'routes', id, input)),
);
export const softDeleteRoute = defineAction(WRITE, idInputSchema, async (ctx, { id }) =>
  ok(await svc().softDelete(ctx, 'routes', id)),
);
export const restoreRoute = defineAction(WRITE, idInputSchema, async (ctx, { id }) =>
  ok(await svc().restore(ctx, 'routes', id)),
);
