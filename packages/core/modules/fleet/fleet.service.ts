// Service đội xe: đầu kéo, rơ moóc, tài xế (spec 02, spec 08 mục 2, task 05).
import { AppError } from '@shared/errors';
import {
  type DriverInput,
  driverInputSchema,
  maskDriverPII,
  type TractorInput,
  tractorInputSchema,
  trailerBaseSchema,
  type TrailerInput,
  trailerInputSchema,
} from '@shared/schemas/fleet';
import type { RequestContext } from '../../lib/context';
import type { TenantDb } from '../../lib/db/tenant-db';
import { createFleetRepo, type DriverRow, type TractorRow, type TrailerRow } from './repo';

// ================= TRACTORS =================
export async function listTractors(
  _ctx: RequestContext,
  tdb: TenantDb,
  options?: { includeDeleted?: boolean },
): Promise<TractorRow[]> {
  const repo = createFleetRepo(tdb);
  return repo.tractors.list(options);
}

export async function getTractor(
  _ctx: RequestContext,
  tdb: TenantDb,
  id: string,
): Promise<TractorRow | undefined> {
  const repo = createFleetRepo(tdb);
  return repo.tractors.get(id);
}

export async function createTractor(
  _ctx: RequestContext,
  tdb: TenantDb,
  rawInput: TractorInput,
): Promise<TractorRow> {
  const input = tractorInputSchema.parse(rawInput);
  const repo = createFleetRepo(tdb);

  const existing = await repo.tractors.findByPlate(input.plateNumber);
  if (existing) {
    throw new AppError(
      'DUPLICATE_CODE',
      `Biển số đầu kéo ${input.plateNumber} đã tồn tại trong công ty.`,
    );
  }

  return repo.tractors.insert(input);
}

export async function updateTractor(
  _ctx: RequestContext,
  tdb: TenantDb,
  id: string,
  rawInput: Partial<TractorInput>,
): Promise<TractorRow> {
  const repo = createFleetRepo(tdb);
  const existing = await repo.tractors.get(id);
  if (!existing) {
    throw new AppError('NOT_FOUND', 'Không tìm thấy đầu kéo.');
  }

  const patch = tractorInputSchema.partial().parse(rawInput);

  if (patch.plateNumber && patch.plateNumber !== existing.plateNumber) {
    const duplicate = await repo.tractors.findByPlate(patch.plateNumber);
    if (duplicate && duplicate.id !== id) {
      throw new AppError(
        'DUPLICATE_CODE',
        `Biển số đầu kéo ${patch.plateNumber} đã tồn tại trong công ty.`,
      );
    }
  }

  await repo.tractors.update(id, patch);
  const updated = await repo.tractors.get(id);
  return updated!;
}

export async function softDeleteTractor(
  _ctx: RequestContext,
  tdb: TenantDb,
  id: string,
): Promise<void> {
  const repo = createFleetRepo(tdb);
  const existing = await repo.tractors.get(id);
  if (!existing) {
    throw new AppError('NOT_FOUND', 'Không tìm thấy đầu kéo.');
  }
  await repo.tractors.setDeleted(id, new Date());
}

// ================= TRAILERS =================
export async function listTrailers(
  _ctx: RequestContext,
  tdb: TenantDb,
  options?: { includeDeleted?: boolean },
): Promise<TrailerRow[]> {
  const repo = createFleetRepo(tdb);
  return repo.trailers.list(options);
}

export async function getTrailer(
  _ctx: RequestContext,
  tdb: TenantDb,
  id: string,
): Promise<TrailerRow | undefined> {
  const repo = createFleetRepo(tdb);
  return repo.trailers.get(id);
}

export async function createTrailer(
  _ctx: RequestContext,
  tdb: TenantDb,
  rawInput: TrailerInput,
): Promise<TrailerRow> {
  const input = trailerInputSchema.parse(rawInput);
  const repo = createFleetRepo(tdb);

  const existing = await repo.trailers.findByPlate(input.plateNumber);
  if (existing) {
    throw new AppError(
      'DUPLICATE_CODE',
      `Biển số rơ moóc ${input.plateNumber} đã tồn tại trong công ty.`,
    );
  }

  return repo.trailers.insert(input);
}

export async function updateTrailer(
  _ctx: RequestContext,
  tdb: TenantDb,
  id: string,
  rawInput: Partial<TrailerInput>,
): Promise<TrailerRow> {
  const repo = createFleetRepo(tdb);
  const existing = await repo.trailers.get(id);
  if (!existing) {
    throw new AppError('NOT_FOUND', 'Không tìm thấy rơ moóc.');
  }

  const patch = trailerBaseSchema.partial().parse(rawInput);

  if (patch.plateNumber && patch.plateNumber !== existing.plateNumber) {
    const duplicate = await repo.trailers.findByPlate(patch.plateNumber);
    if (duplicate && duplicate.id !== id) {
      throw new AppError(
        'DUPLICATE_CODE',
        `Biển số rơ moóc ${patch.plateNumber} đã tồn tại trong công ty.`,
      );
    }
  }

  await repo.trailers.update(id, patch);
  const updated = await repo.trailers.get(id);
  return updated!;
}

export async function softDeleteTrailer(
  _ctx: RequestContext,
  tdb: TenantDb,
  id: string,
): Promise<void> {
  const repo = createFleetRepo(tdb);
  const existing = await repo.trailers.get(id);
  if (!existing) {
    throw new AppError('NOT_FOUND', 'Không tìm thấy rơ moóc.');
  }
  await repo.trailers.setDeleted(id, new Date());
}

// ================= DRIVERS =================
export async function listDrivers(
  ctx: RequestContext,
  tdb: TenantDb,
  options?: { includeDeleted?: boolean },
): Promise<DriverRow[]> {
  const repo = createFleetRepo(tdb);
  const rows = await repo.drivers.list(options);
  return rows.map((r) => maskDriverPII(r, ctx.role));
}

export async function getDriver(
  ctx: RequestContext,
  tdb: TenantDb,
  id: string,
): Promise<DriverRow | undefined> {
  const repo = createFleetRepo(tdb);
  const row = await repo.drivers.get(id);
  if (!row) return undefined;
  return maskDriverPII(row, ctx.role);
}

export async function createDriver(
  ctx: RequestContext,
  tdb: TenantDb,
  rawInput: DriverInput,
): Promise<DriverRow> {
  const input = driverInputSchema.parse(rawInput);
  const repo = createFleetRepo(tdb);

  const inserted = await repo.drivers.insert(input);
  return maskDriverPII(inserted, ctx.role);
}

export async function updateDriver(
  ctx: RequestContext,
  tdb: TenantDb,
  id: string,
  rawInput: Partial<DriverInput>,
): Promise<DriverRow> {
  const repo = createFleetRepo(tdb);
  const existing = await repo.drivers.get(id);
  if (!existing) {
    throw new AppError('NOT_FOUND', 'Không tìm thấy tài xế.');
  }

  const patch = driverInputSchema.partial().parse(rawInput);

  await repo.drivers.update(id, patch);
  const updated = await repo.drivers.get(id);
  return maskDriverPII(updated!, ctx.role);
}

export async function softDeleteDriver(
  _ctx: RequestContext,
  tdb: TenantDb,
  id: string,
): Promise<void> {
  const repo = createFleetRepo(tdb);
  const existing = await repo.drivers.get(id);
  if (!existing) {
    throw new AppError('NOT_FOUND', 'Không tìm thấy tài xế.');
  }
  await repo.drivers.setDeleted(id, new Date());
}
