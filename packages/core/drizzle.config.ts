import { defineConfig } from 'drizzle-kit';

// Chỉ dùng `drizzle-kit generate` rồi review SQL; KHÔNG dùng `drizzle-kit push` (spec 08 mục 3).
export default defineConfig({
  dialect: 'mysql',
  schema: './lib/db/schema/index.ts',
  out: './lib/db/migrations',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'mysql://tms:change-me@localhost:3307/tms',
  },
});
