import type { Db } from '../client';
import { drivers, tractors, trailers } from '../schema';
import { getSeedFleetData } from './fleet.test-data';

// Seed đội xe, rơ moóc, tài xế cho dev/test (2 công ty). Idempotent: UUID cố định + upsert.
export async function seedFleet(db: Db, baseInstant = new Date()): Promise<void> {
  const {
    tractors: seedTractors,
    trailers: seedTrailers,
    drivers: seedDrivers,
  } = getSeedFleetData(baseInstant);

  for (const row of seedTractors) {
    const { id, tenantId, ...rest } = row;
    await db
      .insert(tractors)
      .values({ id, tenantId, ...rest })
      .onDuplicateKeyUpdate({ set: { ...rest, deletedAt: null } });
  }

  for (const row of seedTrailers) {
    const { id, tenantId, ...rest } = row;
    await db
      .insert(trailers)
      .values({ id, tenantId, ...rest })
      .onDuplicateKeyUpdate({ set: { ...rest, deletedAt: null } });
  }

  for (const row of seedDrivers) {
    const { id, tenantId, ...rest } = row;
    await db
      .insert(drivers)
      .values({ id, tenantId, ...rest })
      .onDuplicateKeyUpdate({ set: { ...rest, deletedAt: null } });
  }
}
