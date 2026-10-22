// 5. ĐƠN HÀNG (spec 02 nhóm 5, task 04): 1 Order = 1 Booking/B/L, chứa nhiều container (order_containers).
// Container là đơn vị điều vận, tính giá, DEM/DET và ePOD; Stop và phí thu khách gắn theo container.
// [BỔ SUNG task 04] route_stop_templates: chuỗi Stop chuẩn của đơn DOMESTIC theo tuyến.
import {
  boolean,
  decimal,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/mysql-core';
import {
  CONTAINER_STATUSES,
  CONTAINER_TYPES,
  ORDER_FEE_CATEGORIES,
  ORDER_FEE_SOURCES,
  ORDER_STATUSES,
  ORDER_TYPES,
  PORT_READINESS,
  STOP_STATUSES,
  STOP_TYPES,
  TRIP_MODES,
} from '@shared/enums';
import { currency, money, pk, timestamps, ts } from './_helpers';
import { ref, tenantId } from './identity';
import { customers, locations, routes, shippingLines } from './master-data';

export const orders = mysqlTable(
  'orders',
  {
    id: pk(),
    tenantId: tenantId(),
    orderNo: varchar('order_no', { length: 30 }).notNull(),
    customerId: ref('customer_id')
      .notNull()
      .references(() => customers.id),
    orderType: mysqlEnum('order_type', ORDER_TYPES).notNull(),
    bookingOrBlNo: varchar('booking_or_bl_no', { length: 50 }).notNull(),
    shippingLineId: ref('shipping_line_id').references(() => shippingLines.id),
    vesselVoyage: varchar('vessel_voyage', { length: 100 }),
    eta: ts('eta'),
    etd: ts('etd'),
    cutOffAt: ts('cut_off_at'), // hàng Xuất
    customerRef: varchar('customer_ref', { length: 100 }),
    routeId: ref('route_id')
      .notNull()
      .references(() => routes.id), // tuyến mặc định, container có thể ghi đè
    cargoDescription: varchar('cargo_description', { length: 255 }),
    // Tổng hợp từ order_containers / order_fees, cập nhật trong cùng transaction khi container hoặc phí đổi.
    containerCount: int('container_count').default(0).notNull(),
    totalFreightAmount: money('total_freight_amount').default('0.00').notNull(),
    totalSurchargeAmount: money('total_surcharge_amount').default('0.00').notNull(),
    totalPassThroughAmount: money('total_pass_through_amount').default('0.00').notNull(),
    totalAllocatedCostAmount: money('total_allocated_cost_amount').default('0.00').notNull(),
    currency: currency(),
    isEpodVerified: boolean('is_epod_verified').default(false).notNull(),
    status: mysqlEnum('status', ORDER_STATUSES).default('DRAFT').notNull(),
    cancelReason: varchar('cancel_reason', { length: 255 }),
    version: int('version').default(0).notNull(),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('uq_order_no').on(t.tenantId, t.orderNo),
    index('idx_order_booking').on(t.tenantId, t.bookingOrBlNo),
    index('idx_order_status').on(t.tenantId, t.status),
  ],
);

export const orderContainers = mysqlTable(
  'order_containers',
  {
    id: pk(),
    tenantId: tenantId(),
    orderId: ref('order_id')
      .notNull()
      .references(() => orders.id),
    lineNo: int('line_no').notNull(), // thứ tự cont trong Order: 1, 2, 3...
    routeId: ref('route_id')
      .notNull()
      .references(() => routes.id), // copy từ Order, cho phép ghi đè
    containerNo: varchar('container_no', { length: 11 }), // ISO 6346; hàng Xuất có thể chưa có
    sealNo: varchar('seal_no', { length: 20 }),
    containerType: mysqlEnum('container_type', CONTAINER_TYPES).notNull(),
    cargoWeightTons: decimal('cargo_weight_tons', { precision: 6, scale: 2 }),
    vgmTons: decimal('vgm_tons', { precision: 6, scale: 2 }),
    isDangerousGoods: boolean('is_dangerous_goods').default(false).notNull(),
    dgClass: varchar('dg_class', { length: 10 }),
    reeferSetpointC: decimal('reefer_setpoint_c', { precision: 4, scale: 1 }),
    releaseRefNo: varchar('release_ref_no', { length: 50 }),
    portReadinessStatus: mysqlEnum('port_readiness', PORT_READINESS).default('PENDING').notNull(),
    appliedTripMode: mysqlEnum('applied_trip_mode', TRIP_MODES).default('SINGLE').notNull(),
    linkedContainerId: ref('linked_container_id'), // Street Turn (task 08)
    streetTurnApprovalRef: varchar('street_turn_approval_ref', { length: 50 }),
    demFreeUntil: ts('dem_free_until'),
    detFreeUntil: ts('det_free_until'),
    storageFreeUntil: ts('storage_free_until'),
    baseFreightAmount: money('base_freight_amount').default('0.00').notNull(), // giá cước snapshot của cont này
    freightTariffId: ref('freight_tariff_id'), // truy vết snapshot
    isManualPrice: boolean('is_manual_price').default(false).notNull(),
    repriceRequired: boolean('reprice_required').default(false).notNull(), // task 08
    allocatedCostAmount: money('allocated_cost_amount').default('0.00').notNull(),
    isEpodVerified: boolean('is_epod_verified').default(false).notNull(),
    epodVerifiedBy: ref('epod_verified_by'),
    epodVerifiedAt: ts('epod_verified_at'),
    status: mysqlEnum('status', CONTAINER_STATUSES).default('PENDING').notNull(),
    cancelReason: varchar('cancel_reason', { length: 255 }),
    version: int('version').default(0).notNull(),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('uq_order_container_line').on(t.orderId, t.lineNo),
    index('idx_oc_order').on(t.tenantId, t.orderId),
    index('idx_oc_container_no').on(t.tenantId, t.containerNo),
    index('idx_oc_det').on(t.tenantId, t.detFreeUntil),
  ],
);

export const orderStops = mysqlTable(
  'order_stops',
  {
    id: pk(),
    tenantId: tenantId(),
    orderId: ref('order_id')
      .notNull()
      .references(() => orders.id),
    orderContainerId: ref('order_container_id')
      .notNull()
      .references(() => orderContainers.id), // chặng thuộc từng cont
    sequenceNo: int('sequence_no').notNull(),
    stopType: mysqlEnum('stop_type', STOP_TYPES).notNull(),
    locationId: ref('location_id').references(() => locations.id),
    locationName: varchar('location_name', { length: 255 }).notNull(), // snapshot hiển thị
    windowStart: ts('window_start'), // khung giờ khách hẹn
    deadlineTime: ts('deadline_time'),
    arrivedAt: ts('arrived_at'),
    departedAt: ts('departed_at'),
    occurredAt: ts('occurred_at'), // thời gian thực tế tại thiết bị của lần hoàn tất
    syncedAt: ts('synced_at'),
    timeSource: mysqlEnum('time_source', ['DEVICE', 'GEOFENCE', 'MANUAL']),
    requiresProof: boolean('requires_proof').default(false).notNull(),
    isAiVerified: boolean('is_ai_verified').default(false).notNull(),
    isHumanVerified: boolean('is_human_verified').default(false).notNull(),
    status: mysqlEnum('status', STOP_STATUSES).default('PENDING').notNull(),
    ...timestamps(),
  },
  (t) => [uniqueIndex('uq_stop_seq').on(t.orderContainerId, t.sequenceNo)],
);

export const orderFees = mysqlTable(
  'order_fees',
  {
    id: pk(),
    tenantId: tenantId(),
    orderId: ref('order_id')
      .notNull()
      .references(() => orders.id),
    orderContainerId: ref('order_container_id').references(() => orderContainers.id), // NULL = phí cấp Order
    feeCategory: mysqlEnum('fee_category', ORDER_FEE_CATEGORIES).notNull(),
    feeCode: varchar('fee_code', { length: 50 }).notNull(),
    source: mysqlEnum('source', ORDER_FEE_SOURCES).notNull(),
    sourceTariffId: ref('source_tariff_id'),
    sourceRefId: ref('source_ref_id'),
    idempotencyKey: varchar('idempotency_key', { length: 100 }),
    quantity: decimal('quantity', { precision: 10, scale: 2 }).default('1').notNull(),
    amount: money('amount').notNull(),
    currency: currency(),
    vatRatePercent: decimal('vat_rate_percent', { precision: 5, scale: 2 }),
    isApproved: boolean('is_approved').default(false).notNull(),
    approvedBy: ref('approved_by'),
    invoiceId: ref('invoice_id'),
    reversalOfId: ref('reversal_of_id'),
    ...timestamps(),
  },
  (t) => [uniqueIndex('uq_order_fee_idem').on(t.tenantId, t.idempotencyKey)],
);

// [BỔ SUNG task 04] Chuỗi Stop chuẩn của đơn DOMESTIC theo tuyến (spec 02 chưa có nơi lưu "cấu hình theo tuyến").
export const routeStopTemplates = mysqlTable(
  'route_stop_templates',
  {
    id: pk(),
    tenantId: tenantId(),
    routeId: ref('route_id')
      .notNull()
      .references(() => routes.id),
    sequenceNo: int('sequence_no').notNull(),
    stopType: mysqlEnum('stop_type', STOP_TYPES).notNull(),
    ...timestamps(),
  },
  (t) => [uniqueIndex('uq_route_stop_seq').on(t.routeId, t.sequenceNo)],
);
