// 6. ĐIỀU VẬN (spec 02 nhóm 6, task 06): chuyến, chuyến-container và assignment. Mọi bảng thuộc về tenant.
// dispatch_assignments là nguồn sự thật về tài nguyên (ADR-004); consolidated_trips.primary_* chỉ để hiển thị.
// Mỗi Stop của container trong chuyến có một assignment cùng bộ tài nguyên và khung giờ chuyến (decisions.md task 06).
import {
  boolean,
  decimal,
  foreignKey,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  primaryKey,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/mysql-core';
import {
  ALLOCATION_METHODS,
  ASSIGNMENT_STATUSES,
  ASSIGNMENT_TYPES,
  TRIP_MODES,
  TRIP_STATUSES,
} from '@shared/enums';
import { money, pk, timestamps, ts } from './_helpers';
import { drivers, tractors, trailers } from './fleet';
import { ref, tenantId } from './identity';
import { routes, vendors } from './master-data';
import { orderContainers, orders, orderStops } from './orders';

export const consolidatedTrips = mysqlTable(
  'consolidated_trips',
  {
    id: pk(),
    tenantId: tenantId(),
    tripCode: varchar('trip_code', { length: 50 }).notNull(),
    tripMode: mysqlEnum('trip_mode', TRIP_MODES).default('SINGLE').notNull(),
    routeId: ref('route_id')
      .notNull()
      .references(() => routes.id),
    plannedStart: ts('planned_start').notNull(),
    plannedEnd: ts('planned_end').notNull(),
    actualStart: ts('actual_start'),
    actualEnd: ts('actual_end'),
    // Tài nguyên kế hoạch chính, CHỈ để hiển thị; nguồn sự thật là dispatch_assignments (ADR-004).
    primaryDriverId: ref('primary_driver_id'),
    primaryTractorId: ref('primary_tractor_id'),
    primaryTrailerId: ref('primary_trailer_id'),
    totalCostNorm: money('total_cost_norm').default('0.00').notNull(),
    totalActualCost: money('total_actual_cost').default('0.00').notNull(),
    allocationMethod: mysqlEnum('allocation_method', ALLOCATION_METHODS)
      .default('COST_NORM_RATIO')
      .notNull(),
    allocationAdjustedBy: ref('allocation_adjusted_by'),
    allocationAdjustedAt: ts('allocation_adjusted_at'),
    costLockedAt: ts('cost_locked_at'),
    status: mysqlEnum('status', TRIP_STATUSES).default('PLANNED').notNull(),
    version: int('version').default(0).notNull(),
    ...timestamps(),
  },
  (t) => [uniqueIndex('uq_trip_code').on(t.tenantId, t.tripCode)],
);

// Chuyến chở cont nào. Khóa chính ghép (trip_id, order_container_id), không có cột id.
export const tripContainers = mysqlTable(
  'trip_containers',
  {
    tenantId: tenantId(),
    tripId: ref('trip_id')
      .notNull()
      .references(() => consolidatedTrips.id),
    orderContainerId: ref('order_container_id')
      .notNull()
      .references(() => orderContainers.id),
    orderId: ref('order_id')
      .notNull()
      .references(() => orders.id), // denormalize để báo cáo theo Order
    // Phân bổ chi phí chuyến (task 17): số hệ thống giữ lại để so với số kế toán đã sửa.
    systemRatio: decimal('system_ratio', { precision: 9, scale: 6 }),
    systemAmount: money('system_amount'),
    allocationRatio: decimal('allocation_ratio', { precision: 9, scale: 6 }),
    allocatedAmount: money('allocated_amount'),
    isManualOverride: boolean('is_manual_override').default(false).notNull(),
    overrideReason: varchar('override_reason', { length: 255 }),
  },
  (t) => [
    primaryKey({ columns: [t.tripId, t.orderContainerId] }),
    index('idx_trip_containers_oc').on(t.tenantId, t.orderContainerId),
    index('idx_trip_containers_order').on(t.tenantId, t.orderId),
  ],
);

export const dispatchAssignments = mysqlTable(
  'dispatch_assignments',
  {
    id: pk(),
    tenantId: tenantId(),
    consolidatedTripId: ref('consolidated_trip_id'), // FK đặt tên ngắn ở cuối bảng (tên tự sinh vượt 64 ký tự của MariaDB)
    stopId: ref('stop_id')
      .notNull()
      .references(() => orderStops.id),
    assignmentType: mysqlEnum('assignment_type', ASSIGNMENT_TYPES)
      .default('INTERNAL_FLEET')
      .notNull(),
    driverId: ref('driver_id').references(() => drivers.id),
    tractorId: ref('tractor_id').references(() => tractors.id),
    trailerId: ref('trailer_id').references(() => trailers.id),
    // Xe ngoài SUB_CONTRACTOR (task 09).
    subcontractorVendorId: ref('subcontractor_vendor_id').references(() => vendors.id),
    subcontractorDriverName: varchar('subcontractor_driver_name', { length: 255 }),
    subcontractorPlate: varchar('subcontractor_plate', { length: 20 }),
    agreedSubcontractCost: money('agreed_subcontract_cost'),
    plannedStart: ts('planned_start').notNull(), // dùng kiểm tra chồng lấn
    plannedEnd: ts('planned_end').notNull(),
    completionPercentage: int('completion_percentage').default(100).notNull(), // cứu hộ chia lương dọc đường
    replacesAssignmentId: ref('replaces_assignment_id'), // trỏ về assignment bị ABORTED_MIDWAY
    status: mysqlEnum('status', ASSIGNMENT_STATUSES).default('ASSIGNED').notNull(),
    dispatchedAt: ts('dispatched_at').notNull(),
    version: int('version').default(0).notNull(),
    ...timestamps(),
  },
  (t) => [
    foreignKey({
      name: 'fk_assign_trip',
      columns: [t.consolidatedTripId],
      foreignColumns: [consolidatedTrips.id],
    }),
    index('idx_assign_driver_time').on(t.tenantId, t.driverId, t.plannedStart, t.plannedEnd),
    index('idx_assign_tractor_time').on(t.tenantId, t.tractorId, t.plannedStart, t.plannedEnd),
    index('idx_assign_trailer_time').on(t.tenantId, t.trailerId, t.plannedStart, t.plannedEnd),
    // [BỔ SUNG task 06] tìm assignment theo chuyến (hủy, gán lại, bỏ qua cùng chuyến khi kiểm tra chồng lấn).
    index('idx_assign_trip').on(t.tenantId, t.consolidatedTripId),
  ],
);
