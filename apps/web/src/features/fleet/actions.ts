'use server';

// Server Action cho Đội xe, Tài xế (task 05). Khuôn defineAction: requireRole → zod → service → Result.
import { getTenantDb } from '@core/lib/db/tenant-db';
import { rolesFor } from '@core/modules/identity/permissions';
import * as fleetSvc from '@core/modules/fleet/fleet.service';
import { ok } from '@shared/result';
import {
  driverInputSchema,
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
