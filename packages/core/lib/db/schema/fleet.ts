// 2. ĐỘI XE, TÀI XẾ, BẢO DƯỠNG (spec 02). Mọi bảng thuộc về tenant.
// [BỔ SUNG task 05] drivers.dg_certificate_no và drivers.dg_certificate_expiry (Rule 6).
import {
  boolean,
  date,
  decimal,
  int,
  mysqlEnum,
  mysqlTable,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/mysql-core';
import {
  DRIVER_EMPLOYMENT_TYPES,
  DRIVER_STATUS,
  MAINTENANCE_ORDER_STATUS,
  MAINTENANCE_ORDER_TYPES,
  TRACTOR_OWNERSHIP,
  TRACTOR_STATUS,
  TRAILER_STATUS,
  TRAILER_TYPES,
} from '@shared/enums';
import { currency, money, pk, timestamps, ts } from './_helpers';
import { ref, tenantId, users } from './identity';
import { locations, vendors } from './master-data';

export const tractors = mysqlTable(
  'tractors',
  {
    id: pk(),
    tenantId: tenantId(),
    plateNumber: varchar('plate_number', { length: 20 }).notNull(),
    model: varchar('model', { length: 100 }),
    ownership: mysqlEnum('ownership', TRACTOR_OWNERSHIP).default('OWNED').notNull(),
    fuelNormLitersPer100km: decimal('fuel_norm_liters_per_100km', {
      precision: 5,
      scale: 2,
    }).notNull(),
    currentOdometer: int('current_odometer').default(0).notNull(),
    odometerUpdatedAt: ts('odometer_updated_at'),
    nextMaintenanceOdometer: int('next_maintenance_odometer'),
    registrationExpiry: date('registration_expiry', { mode: 'string' }),
    insuranceExpiry: date('insurance_expiry', { mode: 'string' }),
    transportBadgeExpiry: date('transport_badge_expiry', { mode: 'string' }),
    permittedGrossWeightTons: decimal('permitted_gross_weight_tons', {
      precision: 6,
      scale: 2,
    }),
    // [BỔ SUNG task 08] Tự trọng đầu kéo để Rule 2 cộng đủ khối lượng toàn bộ; NULL = chưa khai báo (vẫn cảnh báo).
    tareWeightTons: decimal('tare_weight_tons', { precision: 6, scale: 2 }),
    gpsDeviceId: ref('gps_device_id'),
    status: mysqlEnum('status', TRACTOR_STATUS).default('AVAILABLE').notNull(),
    version: int('version').default(0).notNull(),
    ...timestamps(),
    deletedAt: ts('deleted_at'),
  },
  (t) => [uniqueIndex('uq_tractor_plate').on(t.tenantId, t.plateNumber)],
);

export const trailers = mysqlTable(
  'trailers',
  {
    id: pk(),
    tenantId: tenantId(),
    plateNumber: varchar('plate_number', { length: 20 }).notNull(),
    trailerType: mysqlEnum('trailer_type', TRAILER_TYPES).notNull(),
    canCarryTwin20: boolean('can_carry_twin_20').default(false).notNull(),
    hasGensetPower: boolean('has_genset_power').default(false).notNull(),
    tareWeightTons: decimal('tare_weight_tons', { precision: 5, scale: 2 }),
    maxPayloadTons: decimal('max_payload_tons', { precision: 5, scale: 2 }).notNull(),
    inspectionExpiry: date('inspection_expiry', { mode: 'string' }),
    currentLocationId: ref('current_location_id').references(() => locations.id),
    currentLocationNote: varchar('current_location_note', { length: 255 }),
    status: mysqlEnum('status', TRAILER_STATUS).default('AVAILABLE').notNull(),
    version: int('version').default(0).notNull(),
    ...timestamps(),
    deletedAt: ts('deleted_at'),
  },
  (t) => [uniqueIndex('uq_trailer_plate').on(t.tenantId, t.plateNumber)],
);

export const drivers = mysqlTable('drivers', {
  id: pk(),
  tenantId: tenantId(),
  userId: ref('user_id').references(() => users.id),
  fullName: varchar('full_name', { length: 255 }).notNull(),
  phone: varchar('phone', { length: 20 }).notNull(),
  nationalIdNo: varchar('national_id_no', { length: 20 }),
  licenseNo: varchar('license_no', { length: 20 }),
  licenseClass: varchar('license_class', { length: 10 }),
  licenseExpiry: date('license_expiry', { mode: 'string' }),
  dgCertificateNo: varchar('dg_certificate_no', { length: 30 }),
  dgCertificateExpiry: date('dg_certificate_expiry', { mode: 'string' }),
  employmentType: mysqlEnum('employment_type', DRIVER_EMPLOYMENT_TYPES)
    .default('FULL_TIME')
    .notNull(),
  status: mysqlEnum('status', DRIVER_STATUS).default('AVAILABLE').notNull(),
  version: int('version').default(0).notNull(),
  ...timestamps(),
  deletedAt: ts('deleted_at'),
});

export const maintenancePlans = mysqlTable('maintenance_plans', {
  id: pk(),
  tenantId: tenantId(),
  tractorId: ref('tractor_id').references(() => tractors.id),
  trailerId: ref('trailer_id').references(() => trailers.id),
  taskCode: varchar('task_code', { length: 50 }).notNull(),
  intervalKm: int('interval_km'),
  intervalDays: int('interval_days'),
  lastDoneOdometer: int('last_done_odometer'),
  lastDoneAt: date('last_done_at', { mode: 'string' }),
  ...timestamps(),
});

export const maintenanceOrders = mysqlTable('maintenance_orders', {
  id: pk(),
  tenantId: tenantId(),
  tractorId: ref('tractor_id').references(() => tractors.id),
  trailerId: ref('trailer_id').references(() => trailers.id),
  vendorId: ref('vendor_id').references(() => vendors.id),
  type: mysqlEnum('type', MAINTENANCE_ORDER_TYPES).notNull(),
  odometerAt: int('odometer_at'),
  plannedStart: ts('planned_start'),
  plannedEnd: ts('planned_end'),
  cost: money('cost'),
  currency: currency(),
  status: mysqlEnum('status', MAINTENANCE_ORDER_STATUS).default('PLANNED').notNull(),
  ...timestamps(),
});
