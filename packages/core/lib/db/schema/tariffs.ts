// Bảng giá 4 chiều (spec 02 nhóm giá, spec 06): tuyến × loại cont × chế độ chạy × khách (NULL = giá chung).
// validFrom/validTo là DATE (chuỗi YYYY-MM-DD theo ngày của tenant), validTo NULL = vô thời hạn.
import {
  boolean,
  date,
  decimal,
  index,
  mysqlEnum,
  mysqlTable,
  varchar,
} from 'drizzle-orm/mysql-core';
import { CALC_BASES, CONTAINER_TYPES, FEE_TARIFF_CATEGORIES, TRIP_MODES } from '@shared/enums';
import { currency, money, pk, timestamps } from './_helpers';
import { ref, tenantId } from './identity';
import { customers, routes } from './master-data';

export const freightTariffs = mysqlTable(
  'freight_tariffs',
  {
    id: pk(),
    tenantId: tenantId(),
    routeId: ref('route_id')
      .notNull()
      .references(() => routes.id),
    containerType: mysqlEnum('container_type', CONTAINER_TYPES).notNull(),
    tripMode: mysqlEnum('trip_mode', TRIP_MODES).default('SINGLE').notNull(),
    customerId: ref('customer_id').references(() => customers.id), // NULL = giá chung
    basePrice: money('base_price').notNull(),
    currency: currency(),
    vatRatePercent: decimal('vat_rate_percent', { precision: 5, scale: 2 }).notNull(),
    validFrom: date('valid_from', { mode: 'string' }).notNull(),
    validTo: date('valid_to', { mode: 'string' }), // NULL = vô thời hạn
    isActive: boolean('is_active').default(true).notNull(),
    ...timestamps(),
  },
  (t) => [
    index('idx_freight_4d').on(
      t.tenantId,
      t.routeId,
      t.containerType,
      t.tripMode,
      t.customerId,
      t.validFrom,
    ),
  ],
);

export const feeTariffs = mysqlTable(
  'fee_tariffs',
  {
    id: pk(),
    tenantId: tenantId(),
    routeId: ref('route_id').references(() => routes.id), // NULL = áp mọi tuyến
    containerType: mysqlEnum('container_type', CONTAINER_TYPES).notNull(),
    tripMode: mysqlEnum('trip_mode', TRIP_MODES).default('SINGLE').notNull(),
    customerId: ref('customer_id').references(() => customers.id), // NULL = phí chung
    feeCategory: mysqlEnum('fee_category', FEE_TARIFF_CATEGORIES).notNull(),
    feeCode: varchar('fee_code', { length: 50 }).notNull(),
    feeName: varchar('fee_name', { length: 255 }).notNull(),
    calcBasis: mysqlEnum('calc_basis', CALC_BASES).default('PER_TRIP').notNull(),
    amount: money('amount').notNull(),
    currency: currency(),
    vatRatePercent: decimal('vat_rate_percent', { precision: 5, scale: 2 }),
    isExcluded: boolean('is_excluded').default(false).notNull(), // khách riêng được MIỄN mã phí này
    validFrom: date('valid_from', { mode: 'string' }).notNull(),
    validTo: date('valid_to', { mode: 'string' }),
    isActive: boolean('is_active').default(true).notNull(),
    ...timestamps(),
  },
  (t) => [
    index('idx_fee_4d').on(
      t.tenantId,
      t.routeId,
      t.containerType,
      t.tripMode,
      t.customerId,
      t.feeCode,
      t.validFrom,
    ),
  ],
);
