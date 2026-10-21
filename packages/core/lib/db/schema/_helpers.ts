import { char, datetime, decimal } from 'drizzle-orm/mysql-core';
import { sql } from 'drizzle-orm';

export const pk = () => char('id', { length: 36 }).primaryKey();
export const ts = (name: string) => datetime(name, { mode: 'date', fsp: 3 });
export const money = (name: string) => decimal(name, { precision: 18, scale: 2 });
export const currency = () => char('currency', { length: 3 }).default('VND').notNull();
export const timestamps = () => ({
  createdAt: ts('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP(3)`),
  updatedAt: ts('updated_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP(3)`)
    .$onUpdate(() => new Date()),
  createdBy: char('created_by', { length: 36 }),
});
