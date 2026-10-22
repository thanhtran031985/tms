import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@core': path.resolve(import.meta.dirname, '../../packages/core'),
      '@shared': path.resolve(import.meta.dirname, '../../packages/shared'),
    },
  },
  test: {
    include: ['**/*.test.ts'],
    exclude: ['**/node_modules/**'],
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
