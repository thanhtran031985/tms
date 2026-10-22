import path from 'node:path';
import type { NextConfig } from 'next';

// Gốc repo: cho phép đọc designs/tokens.css và packages/* nằm ngoài apps/web.
const repoRoot = path.join(import.meta.dirname, '..', '..');

// Next chỉ nạp .env trong thư mục app; biến môi trường dùng chung nằm ở .env gốc repo (không ghi đè biến đã có).
try {
  process.loadEnvFile(path.join(repoRoot, '.env'));
} catch {
  // Không có .env (CI, production): biến lấy từ môi trường.
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Khi chạy e2e, ẩn nút công cụ dev của Next: nó nằm trong thứ tự Tab và làm sai kiểm tra thứ tự Tab của trang.
  ...(process.env.E2E ? { devIndicators: false as const } : {}),
  outputFileTracingRoot: repoRoot,
  turbopack: { root: repoRoot },
  // Thư viện native/đi kèm kết nối: để Node nạp thay vì đóng gói.
  serverExternalPackages: [
    '@node-rs/argon2',
    'mysql2',
    'ioredis',
    'read-excel-file',
    'write-excel-file',
  ],
};

export default nextConfig;
