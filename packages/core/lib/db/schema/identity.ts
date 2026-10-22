// 0. SAAS, IDENTITY, AUDIT (spec 02). `users`, `tenants`, `tenant_memberships` là bảng toàn cục (không có tenant_id);
// `audit_logs`, `number_sequences` thuộc về tenant.
import {
  boolean,
  char,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  primaryKey,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/mysql-core';
import { ROLES } from '@shared/enums';
import { pk, timestamps, ts } from './_helpers';

export const ref = (name: string) => char(name, { length: 36 });
export const tenantId = () =>
  char('tenant_id', { length: 36 })
    .notNull()
    .references(() => tenants.id);

export const tenants = mysqlTable('tenants', {
  id: pk(),
  name: varchar('name', { length: 255 }).notNull(),
  taxCode: varchar('tax_code', { length: 20 }),
  timezone: varchar('timezone', { length: 64 }).default('Asia/Ho_Chi_Minh').notNull(),
  plan: mysqlEnum('plan', ['TRIAL', 'STANDARD', 'PRO']).default('TRIAL').notNull(),
  status: mysqlEnum('status', ['ACTIVE', 'SUSPENDED', 'CLOSED']).default('ACTIVE').notNull(),
  settings: json('settings'), // { costAllocationMethod, numberingFormats, demDetCronHour, ... } – validate bằng zod
  ...timestamps(),
});

export const users = mysqlTable(
  'users',
  {
    id: pk(),
    email: varchar('email', { length: 255 }),
    phone: varchar('phone', { length: 20 }),
    fullName: varchar('full_name', { length: 255 }).notNull(),
    passwordHash: varchar('password_hash', { length: 255 }),
    isActive: boolean('is_active').default(true).notNull(),
    // Khóa tạm sau 5 lần sai liên tiếp trong 15 phút (task 01; bổ sung so với spec 02 ban đầu).
    failedLoginCount: int('failed_login_count').default(0).notNull(),
    lockedUntil: ts('locked_until'),
    ...timestamps(),
  },
  (t) => [uniqueIndex('uq_users_email').on(t.email), uniqueIndex('uq_users_phone').on(t.phone)],
);

export const tenantMemberships = mysqlTable(
  'tenant_memberships',
  {
    id: pk(),
    tenantId: tenantId(),
    userId: ref('user_id')
      .notNull()
      .references(() => users.id),
    role: mysqlEnum('role', ROLES).notNull(),
    // Lần đăng nhập gần nhất vào công ty này, để TenantPicker sắp xếp (task 01; bổ sung so với spec 02 ban đầu).
    lastLoginAt: ts('last_login_at'),
    ...timestamps(),
  },
  (t) => [uniqueIndex('uq_membership').on(t.tenantId, t.userId)],
);

export const auditLogs = mysqlTable(
  'audit_logs',
  {
    id: pk(),
    tenantId: tenantId(),
    actorUserId: ref('actor_user_id'),
    entity: varchar('entity', { length: 50 }).notNull(), // 'orders', 'fee_tariffs', ...
    entityId: ref('entity_id').notNull(),
    action: varchar('action', { length: 50 }).notNull(), // CREATE, UPDATE, STATUS_CHANGE, REPRICE, ...
    before: json('before'),
    after: json('after'),
    createdAt: ts('created_at').notNull(),
  },
  (t) => [index('idx_audit_entity').on(t.tenantId, t.entity, t.entityId)],
);

export const numberSequences = mysqlTable(
  'number_sequences',
  {
    tenantId: tenantId(),
    seqKey: varchar('seq_key', { length: 50 }).notNull(), // 'TRIP:2026-10', 'FUEL_VOUCHER:2026', 'INVOICE:2026'
    lastValue: int('last_value').default(0).notNull(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.seqKey] })],
);
