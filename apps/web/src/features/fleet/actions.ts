'use server';

// Server Action cho Đội xe, Tài xế (task 05). Khuôn defineAction: requireRole → zod → service → Result.
import { getTenantDb } from '@core/lib/db/tenant-db';
import { rolesFor } from '@core/modules/identity/permissions';
import * as documentsSvc from '@core/modules/fleet/documents.service';
import * as fleetSvc from '@core/modules/fleet/fleet.service';
import * as maintenanceSvc from '@core/modules/fleet/maintenance.service';
import { MAINTENANCE_ORDER_STATUS } from '@shared/enums';
import { ok } from '@shared/result';
import {
  driverInputSchema,
  maintenanceOrderInputSchema,
  maintenancePlanInputSchema,
  tractorInputSchema,
  trailerBaseSchema,
  trailerInputSchema,
} from '@shared/schemas/fleet';
import { z } from 'zod';
import { defineAction } from '@/server';

const READ = rolesFor('fleet.view');
const WRITE = rolesFor('fleet.write');

const idInputSchema = z.object({ id: z.string().length(36) });
const noInput = z.object({});

// ================= ĐẦU KÉO =================
export const listTractors = defineAction(READ, noInput, async (ctx) =>
  ok(await fleetSvc.listTractors(ctx, getTenantDb(ctx))),
);

export const createTractor = defineAction(WRITE, tractorInputSchema, async (ctx, input) =>
  ok(await fleetSvc.createTractor(ctx, getTenantDb(ctx), input)),
);

export const updateTractor = defineAction(
  WRITE,
  idInputSchema.extend(tractorInputSchema.partial().shape),
  async (ctx, { id, ...input }) =>
    ok(await fleetSvc.updateTractor(ctx, getTenantDb(ctx), id, input)),
);

export const softDeleteTractor = defineAction(WRITE, idInputSchema, async (ctx, { id }) => {
  await fleetSvc.softDeleteTractor(ctx, getTenantDb(ctx), id);
  return ok({ id });
});

// ================= RƠ MOÓC =================
export const listTrailers = defineAction(READ, noInput, async (ctx) =>
  ok(await fleetSvc.listTrailers(ctx, getTenantDb(ctx))),
);

export const createTrailer = defineAction(WRITE, trailerInputSchema, async (ctx, input) =>
  ok(await fleetSvc.createTrailer(ctx, getTenantDb(ctx), input)),
);

export const updateTrailer = defineAction(
  WRITE,
  idInputSchema.extend(trailerBaseSchema.partial().shape),
  async (ctx, { id, ...input }) =>
    ok(await fleetSvc.updateTrailer(ctx, getTenantDb(ctx), id, input)),
);

export const softDeleteTrailer = defineAction(WRITE, idInputSchema, async (ctx, { id }) => {
  await fleetSvc.softDeleteTrailer(ctx, getTenantDb(ctx), id);
  return ok({ id });
});

// ================= TÀI XẾ =================
export const listDrivers = defineAction(READ, noInput, async (ctx) =>
  ok(await fleetSvc.listDrivers(ctx, getTenantDb(ctx))),
);

export const createDriver = defineAction(WRITE, driverInputSchema, async (ctx, input) =>
  ok(await fleetSvc.createDriver(ctx, getTenantDb(ctx), input)),
);

export const updateDriver = defineAction(
  WRITE,
  idInputSchema.extend(driverInputSchema.partial().shape),
  async (ctx, { id, ...input }) =>
    ok(await fleetSvc.updateDriver(ctx, getTenantDb(ctx), id, input)),
);

export const softDeleteDriver = defineAction(WRITE, idInputSchema, async (ctx, { id }) => {
  await fleetSvc.softDeleteDriver(ctx, getTenantDb(ctx), id);
  return ok({ id });
});

// ================= GIẤY TỜ SẮP HẾT HẠN =================
const listExpiringDocsSchema = z.object({
  withinDays: z.number().int().min(1).max(365).optional().default(15),
  filter: z.enum(['ALL', 'EXPIRING_SOON', 'EXPIRED']).optional().default('ALL'),
  targetType: z.enum(['TRACTOR', 'TRAILER', 'DRIVER']).optional(),
});

export const listExpiringDocuments = defineAction(
  READ,
  listExpiringDocsSchema,
  async (ctx, input) =>
    ok(await documentsSvc.listExpiringDocuments(ctx, getTenantDb(ctx), input)),
);

// ================= KẾ HOẠCH & LỆNH BẢO DƯỠNG =================
const listPlansSchema = z.object({
  tractorId: z.string().length(36).optional(),
  trailerId: z.string().length(36).optional(),
});

export const listMaintenancePlans = defineAction(READ, listPlansSchema, async (ctx, input) =>
  ok(await maintenanceSvc.listMaintenancePlans(ctx, getTenantDb(ctx), input)),
);

export const createMaintenancePlan = defineAction(
  WRITE,
  maintenancePlanInputSchema,
  async (ctx, input) =>
    ok(await maintenanceSvc.createMaintenancePlan(ctx, getTenantDb(ctx), input)),
);

const listOrdersSchema = z.object({
  tractorId: z.string().length(36).optional(),
  trailerId: z.string().length(36).optional(),
  status: z.enum(MAINTENANCE_ORDER_STATUS).optional(),
});

export const listMaintenanceOrders = defineAction(READ, listOrdersSchema, async (ctx, input) =>
  ok(await maintenanceSvc.listMaintenanceOrders(ctx, getTenantDb(ctx), input)),
);

export const createMaintenanceOrder = defineAction(
  WRITE,
  maintenanceOrderInputSchema,
  async (ctx, input) =>
    ok(await maintenanceSvc.createMaintenanceOrder(ctx, getTenantDb(ctx), input)),
);

const updateOrderStatusSchema = z.object({
  id: z.string().length(36),
  status: z.enum(MAINTENANCE_ORDER_STATUS),
});

export const updateMaintenanceOrderStatus = defineAction(
  WRITE,
  updateOrderStatusSchema,
  async (ctx, { id, status }) =>
    ok(await maintenanceSvc.updateMaintenanceOrderStatus(ctx, getTenantDb(ctx), id, status)),
);

export const listMaintenanceDue = defineAction(READ, noInput, async (ctx) =>
  ok(await maintenanceSvc.listMaintenanceDue(ctx, getTenantDb(ctx))),
);

const findOverlapSchema = z.object({
  tractorId: z.string().length(36).optional(),
  trailerId: z.string().length(36).optional(),
  start: z.union([z.string(), z.date()]).transform((v) => new Date(v)),
  end: z.union([z.string(), z.date()]).transform((v) => new Date(v)),
});

export const findMaintenanceOverlap = defineAction(READ, findOverlapSchema, async (ctx, input) =>
  ok(await maintenanceSvc.findMaintenanceOverlap(ctx, getTenantDb(ctx), input)),
);

