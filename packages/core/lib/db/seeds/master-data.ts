import type { Db } from '../client';
import { customers, locations, routes, shippingLines, vendors } from '../schema';
import {
  SEED_CUSTOMERS,
  SEED_LOCATIONS,
  SEED_ROUTES,
  SEED_SHIPPING_LINES,
  SEED_VENDORS,
} from './master-data.test-data';

// Seed danh mục cho dev/test (2 công ty, có mã dùng chung giữa hai công ty). Idempotent: UUID cố định + upsert,
// và đặt lại deleted_at để e2e chạy lặp được. Chạy sau seed identity vì cần tenants.
export async function seedMasterData(db: Db): Promise<void> {
  for (const row of Object.values(SEED_CUSTOMERS)) {
    const { id, tenantId, ...rest } = row;
    await db
      .insert(customers)
      .values({ id, tenantId, ...rest })
      .onDuplicateKeyUpdate({ set: { ...rest, deletedAt: null } });
  }

  for (const { st, ...row } of SEED_SHIPPING_LINES) {
    const { id, tenantId, ...rest } = row;
    const values = { ...rest, allowsStreetTurn: st };
    await db
      .insert(shippingLines)
      .values({ id, tenantId, ...values })
      .onDuplicateKeyUpdate({ set: { ...values, deletedAt: null } });
  }

  for (const row of Object.values(SEED_VENDORS)) {
    const { id, tenantId, ...rest } = row;
    await db
      .insert(vendors)
      .values({ id, tenantId, ...rest })
      .onDuplicateKeyUpdate({ set: { ...rest, deletedAt: null } });
  }

  for (const row of SEED_LOCATIONS) {
    const { id, tenantId, ...rest } = row;
    await db
      .insert(locations)
      .values({ id, tenantId, ...rest })
      .onDuplicateKeyUpdate({ set: { ...rest, deletedAt: null } });
  }

  for (const row of SEED_ROUTES) {
    const { id, tenantId, ...rest } = row;
    await db
      .insert(routes)
      .values({ id, tenantId, ...rest })
      .onDuplicateKeyUpdate({ set: { ...rest, deletedAt: null } });
  }
}
