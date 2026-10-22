import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@core': path.resolve(import.meta.dirname, '../../packages/core'),
      '@shared': path.resolve(import.meta.dirname, '../../packages/shared'),
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
