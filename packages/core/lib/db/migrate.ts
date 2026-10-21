import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/mysql2/migrator';
import { closeDb, getDb } from './client';

// Chạy được trên DB trống và DB đã có dữ liệu; chạy lại nhiều lần không lỗi.
const migrationsFolder = fileURLToPath(new URL('./migrations', import.meta.url));

try {
  await migrate(getDb().db, { migrationsFolder });
  console.log('db:migrate xong');
} catch (error) {
  console.error('db:migrate lỗi', error);
  process.exitCode = 1;
} finally {
  await closeDb();
}
