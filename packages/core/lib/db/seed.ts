import type { Db } from './client';
import { closeDb, getDb } from './client';

// Mỗi seeder phải idempotent: chạy lại nhiều lần không sinh bản ghi trùng (dùng upsert hoặc kiểm tra tồn tại).
// Dữ liệu mẫu tối thiểu 2 tenant được thêm ở task 01; task 00 chỉ dựng khung.
type Seeder = { name: string; run: (db: Db) => Promise<void> };

const seeders: Seeder[] = [];

try {
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
