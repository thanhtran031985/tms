import type { Db } from '../client';
import { feeTariffs, freightTariffs } from '../schema';
import { SEED_FEES, SEED_FREIGHT } from './tariffs.test-data';

// Seed bảng giá mẫu. Idempotent: UUID cố định + upsert, đặt lại isActive để e2e chạy lặp được.
// Chạy sau seed master-data vì cần tuyến và khách.
export async function seedTariffs(db: Db): Promise<void> {
  for (const row of SEED_FREIGHT) {
    const { id, tenantId, ...rest } = row;
    await db
      .insert(freightTariffs)
      .values({ id, tenantId, ...rest })
      .onDuplicateKeyUpdate({ set: { ...rest, isActive: true } });
  }
  for (const row of SEED_FEES) {
    const { id, tenantId, ...rest } = row;
    await db
      .insert(feeTariffs)
      .values({ id, tenantId, ...rest })
      .onDuplicateKeyUpdate({ set: { ...rest, isActive: true } });
  }
}
