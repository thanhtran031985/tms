import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

// Nạp .env gốc repo (không ghi đè biến đã có); CI truyền biến thẳng qua môi trường.
try {
  process.loadEnvFile(path.join(import.meta.dirname, '..', '..', '.env'));
} catch {
  // Không có .env.
}

const port = Number(process.env.E2E_PORT ?? 3100);

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  // next dev biên dịch từng route lần đầu nên cho phép chờ lâu hơn mặc định.
  expect: { timeout: 20_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'desktop-1440',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: {
    command: `pnpm exec next dev -p ${port}`,
    url: `http://localhost:${port}/login`,
    reuseExistingServer: !process.env.CI,
    env: { E2E: '1' },
    timeout: 120_000,
  },
});
