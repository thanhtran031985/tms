import { execSync } from 'node:child_process';
import path from 'node:path';

// Đưa DB e2e về trạng thái chuẩn trước mỗi lần chạy: migrate rồi seed (seed đặt lại bộ đếm sai mật khẩu và giờ khóa).
// Cần MariaDB đang chạy (docker compose up -d) và DATABASE_URL, SEED_DEV_PASSWORD trong môi trường hoặc .env gốc.
export default async function globalSetup() {
  if (!process.env.DATABASE_URL || !process.env.SEED_DEV_PASSWORD) {
    throw new Error(
      'E2E cần DATABASE_URL và SEED_DEV_PASSWORD (xem .env.example). Bật MariaDB bằng `docker compose up -d`.',
    );
  }
  const root = path.join(import.meta.dirname, '..', '..', '..');
  execSync('pnpm db:migrate && pnpm db:seed', { cwd: root, stdio: 'inherit', env: process.env });

  // next dev biên dịch từng route ở lần gọi đầu; gọi trước để các test không phải chờ biên dịch.
  const base = `http://localhost:${process.env.E2E_PORT ?? 3100}`;
  await Promise.all(
    ['/login', '/select-tenant', '/'].map((route) => fetch(`${base}${route}`).catch(() => null)),
  );
}
