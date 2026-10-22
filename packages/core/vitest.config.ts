import path from 'node:path';
import { defineConfig } from 'vitest/config';

// Hai project: test đơn vị chạy nhanh, test tích hợp (Testcontainers) cần Docker và timeout dài.
export default defineConfig({
  resolve: {
    alias: {
      '@core': path.resolve(import.meta.dirname),
      '@shared': path.resolve(import.meta.dirname, '../shared'),
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['**/*.test.ts'],
          exclude: ['**/node_modules/**', '**/*.int.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'int',
          include: ['**/*.int.test.ts'],
          exclude: ['**/node_modules/**'],
          testTimeout: 120_000,
          hookTimeout: 240_000,
          fileParallelism: false,
        },
      },
    ],
  },
});
