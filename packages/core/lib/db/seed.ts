import type { Db } from './client';
import { closeDb, getDb } from './client';
import { requireEnv } from '../env';
import { seedDispatch } from './seeds/dispatch';
import { seedFleet } from './seeds/fleet';
import { seedIdentity } from './seeds/identity';
import { seedMasterData } from './seeds/master-data';
import { seedOrders } from './seeds/orders';
import { seedTariffs } from './seeds/tariffs';

// Mỗi seeder phải idempotent: chạy lại nhiều lần không sinh bản ghi trùng (dùng upsert hoặc kiểm tra tồn tại).
// Dữ liệu mẫu chỉ dành cho dev/test; không chạy ở production.
type Seeder = { name: string; run: (db: Db) => Promise<void> };

const seeders: Seeder[] = [
  {
    name: 'identity',
    run: (db) => seedIdentity(db, { password: requireEnv('SEED_DEV_PASSWORD') }),
  },
  { name: 'master-data', run: (db) => seedMasterData(db) },
  { name: 'fleet', run: (db) => seedFleet(db) },
  { name: 'tariffs', run: (db) => seedTariffs(db) },
  { name: 'orders', run: (db) => seedOrders(db) },
  { name: 'dispatch', run: (db) => seedDispatch(db) },
];

try {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Không chạy seed dữ liệu mẫu ở production.');
  }
  const { db } = getDb();
  for (const seeder of seeders) {
    await seeder.run(db);
    console.log(`db:seed ${seeder.name} xong`);
  }
  console.log(`db:seed xong (${seeders.length} seeder)`);
} catch (error) {
  console.error('db:seed lỗi', error);
  process.exitCode = 1;
} finally {
  await closeDb();
}
