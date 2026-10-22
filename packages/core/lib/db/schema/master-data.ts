// 1. MASTER DATA (spec 02). Mọi bảng thuộc về tenant, mã duy nhất theo tenant, xóa mềm bằng deleted_at.
// [BỔ SUNG task 02] shipping_lines.deleted_at; vendors.code và locations.code (unique theo tenant).
import {
  boolean,
  decimal,
  int,
  mysqlEnum,
  mysqlTable,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/mysql-core';
import { LOCATION_TYPES, VENDOR_TYPES } from '@shared/enums';
import { money, pk, timestamps, ts } from './_helpers';
import { ref, tenantId } from './identity';

export const customers = mysqlTable(
  'customers',
  {
    id: pk(),
    tenantId: tenantId(),
    code: varchar('code', { length: 50 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    taxCode: varchar('tax_code', { length: 20 }),
    billingAddress: varchar('billing_address', { length: 500 }),
    paymentTermDays: int('payment_term_days').default(30),
    creditLimit: money('credit_limit'),
    ...timestamps(),
    deletedAt: ts('deleted_at'),
  },
  (t) => [uniqueIndex('uq_customer_code').on(t.tenantId, t.code)],
);

export const shippingLines = mysqlTable(
  'shipping_lines',
  {
    id: pk(),
    tenantId: tenantId(),
    code: varchar('code', { length: 20 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    allowsStreetTurn: boolean('allows_street_turn').default(false).notNull(),
    ...timestamps(),
    deletedAt: ts('deleted_at'),
  },
  (t) => [uniqueIndex('uq_sl_code').on(t.tenantId, t.code)],
);

export const vendors = mysqlTable(
  'vendors',
  {
    id: pk(),
    tenantId: tenantId(),
    code: varchar('code', { length: 50 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    taxCode: varchar('tax_code', { length: 20 }),
    type: mysqlEnum('type', VENDOR_TYPES).notNull(),
    paymentTermDays: int('payment_term_days').default(30),
    ...timestamps(),
    deletedAt: ts('deleted_at'),
  },
  (t) => [uniqueIndex('uq_vendor_code').on(t.tenantId, t.code)],
);

export const locations = mysqlTable(
  'locations',
  {
    id: pk(),
    tenantId: tenantId(),
    code: varchar('code', { length: 50 }).notNull(),
    type: mysqlEnum('type', LOCATION_TYPES).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    address: varchar('address', { length: 500 }),
    customerId: ref('customer_id').references(() => customers.id),
    vendorId: ref('vendor_id').references(() => vendors.id),
    lat: decimal('lat', { precision: 9, scale: 6 }).notNull(),
    lng: decimal('lng', { precision: 9, scale: 6 }).notNull(),
    geofenceRadiusM: int('geofence_radius_m').default(300).notNull(),
    zone: varchar('zone', { length: 100 }),
    ...timestamps(),
    deletedAt: ts('deleted_at'),
  },
  (t) => [uniqueIndex('uq_location_code').on(t.tenantId, t.code)],
);

export const routes = mysqlTable(
  'routes',
  {
    id: pk(),
    tenantId: tenantId(),
    routeCode: varchar('route_code', { length: 50 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    originZone: varchar('origin_zone', { length: 100 }).notNull(),
    destinationZone: varchar('destination_zone', { length: 100 }).notNull(),
    standardDistanceKm: int('standard_distance_km').notNull(),
    ...timestamps(),
    deletedAt: ts('deleted_at'),
  },
  (t) => [uniqueIndex('uq_route_code').on(t.tenantId, t.routeCode)],
);
