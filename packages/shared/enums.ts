export const CONTAINER_TYPES = [
  '20DC',
  '40DC',
  '40HC',
  '45HC',
  '20RF',
  '40RF',
  '20OT',
  '40OT',
  '20FR',
  '40FR',
  '20TK',
] as const;
export const TRIP_MODES = ['SINGLE', 'TWIN_20', 'COMBINED'] as const;
export const ROLES = [
  'OWNER',
  'ADMIN',
  'DISPATCHER',
  'ACCOUNTANT',
  'FLEET_MANAGER',
  'DRIVER',
  'VIEWER',
] as const;
export const STOP_TYPES = [
  'PICK_EMPTY',
  'PICK_FULL',
  'STUFFING',
  'UNSTUFFING',
  'PORT_IN',
  'RETURN_EMPTY',
  'DROP_TRAILER',
  'HOOK_TRAILER',
  'STREET_TURN',
] as const;
export const FEE_CATEGORIES = [
  'COST_NORM',
  'REVENUE_SURCHARGE',
  'PASS_THROUGH',
  'ON_ROUTE_EXPENSE',
] as const;
export const VENDOR_TYPES = [
  'FUEL_STATION',
  'SUB_CONTRACTOR',
  'GARAGE',
  'PORT',
  'DEPOT',
  'TIRE_SUPPLIER',
] as const;
export const LOCATION_TYPES = [
  'PORT',
  'DEPOT',
  'WAREHOUSE',
  'FUEL_STATION',
  'GARAGE',
  'PARKING',
] as const;
export type LocationType = (typeof LOCATION_TYPES)[number];

export const TRACTOR_OWNERSHIP = ['OWNED', 'LEASED'] as const;
export type TractorOwnership = (typeof TRACTOR_OWNERSHIP)[number];

export const TRACTOR_STATUS = ['AVAILABLE', 'IN_USE', 'MAINTENANCE', 'INACTIVE'] as const;
export type TractorStatus = (typeof TRACTOR_STATUS)[number];

export const TRAILER_TYPES = ['20FT', '40FT', '40FT_COMBO', '45FT'] as const;
export type TrailerType = (typeof TRAILER_TYPES)[number];

export const TRAILER_STATUS = [
  'AVAILABLE',
  'IN_USE',
  'DROPPED',
  'MAINTENANCE',
  'INACTIVE',
] as const;
export type TrailerStatus = (typeof TRAILER_STATUS)[number];

export const DRIVER_EMPLOYMENT_TYPES = ['FULL_TIME', 'CONTRACT'] as const;
export type DriverEmploymentType = (typeof DRIVER_EMPLOYMENT_TYPES)[number];

export const DRIVER_STATUS = ['AVAILABLE', 'ON_DUTY', 'OFF_DUTY', 'INACTIVE'] as const;
export type DriverStatus = (typeof DRIVER_STATUS)[number];

export const MAINTENANCE_ORDER_TYPES = ['SCHEDULED', 'BREAKDOWN', 'TIRE'] as const;
export type MaintenanceOrderType = (typeof MAINTENANCE_ORDER_TYPES)[number];

export const MAINTENANCE_ORDER_STATUS = ['PLANNED', 'IN_PROGRESS', 'DONE', 'CANCELLED'] as const;
export type MaintenanceOrderStatus = (typeof MAINTENANCE_ORDER_STATUS)[number];
// Nhóm phí của bảng phí (spec 02, fee_tariffs): chỉ 3 giá trị; FEE_CATEGORIES (4 giá trị) dùng cho khoản phí trên Order/chuyến.
export const FEE_TARIFF_CATEGORIES = ['COST_NORM', 'REVENUE_SURCHARGE', 'PASS_THROUGH'] as const;
export const CALC_BASES = ['PER_TRIP', 'PER_CONTAINER', 'PER_DAY', 'PER_KM'] as const;

// Đơn hàng và container (spec 02 nhóm 5).
export const ORDER_TYPES = ['IMPORT', 'EXPORT', 'DOMESTIC'] as const;
export const ORDER_STATUSES = [
  'DRAFT',
  'CONFIRMED',
  'IN_PROGRESS',
  'PARTIALLY_DELIVERED',
  'DELIVERED',
  'RECONCILED',
  'INVOICED',
  'CANCELLED',
] as const;
export const CONTAINER_STATUSES = [
  'PENDING',
  'PLANNED',
  'IN_PROGRESS',
  'DELIVERED',
  'COMPLETED',
  'CANCELLED',
] as const;
export const PORT_READINESS = [
  'PENDING',
  'READY_EDO',
  'READY_EMPTY_RELEASE',
  'HOLD_CUSTOMS',
  'HOLD_LINE',
] as const;
export const STOP_STATUSES = ['PENDING', 'ARRIVED', 'COMPLETED', 'SKIPPED'] as const;
export const ORDER_FEE_CATEGORIES = ['REVENUE_SURCHARGE', 'PASS_THROUGH'] as const;
export const ORDER_FEE_SOURCES = ['TARIFF', 'DEM_DET_JOB', 'MANUAL', 'EXPENSE_REBILL'] as const;

// 6. ĐIỀU VẬN (spec 02 nhóm 6, task 06): chuyến, chuyến-container và assignment.
export const TRIP_STATUSES = [
  'PLANNED',
  'DISPATCHED',
  'IN_TRANSIT',
  'COMPLETED',
  'CANCELLED',
] as const;
export const ALLOCATION_METHODS = [
  'COST_NORM_RATIO',
  'REVENUE_RATIO',
  'EQUAL',
  'DISTANCE_RATIO',
  'MANUAL',
] as const;
export const ASSIGNMENT_TYPES = ['INTERNAL_FLEET', 'SUB_CONTRACTOR'] as const;
export const ASSIGNMENT_STATUSES = [
  'ASSIGNED',
  'IN_TRANSIT',
  'COMPLETED',
  'ABORTED_MIDWAY',
  'RESCUE_ASSIGNED',
  'CANCELLED',
] as const;
// Assignment còn hiệu lực cho kiểm tra chồng lấn (spec 03 mục 1 bước 3): mọi trạng thái trừ ba trạng thái này.
export const ASSIGNMENT_INACTIVE_STATUSES = ['CANCELLED', 'COMPLETED', 'ABORTED_MIDWAY'] as const;

export type ContainerType = (typeof CONTAINER_TYPES)[number];
export type OrderType = (typeof ORDER_TYPES)[number];
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export type ContainerStatus = (typeof CONTAINER_STATUSES)[number];
export type StopType = (typeof STOP_TYPES)[number];
export type TripMode = (typeof TRIP_MODES)[number];
export type TripStatus = (typeof TRIP_STATUSES)[number];
export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number];

// Trạng thái được phép đặt tay trên form (task 05). IN_USE, ON_DUTY, DROPPED do điều vận tự đặt (task 06, 09).
export const TRACTOR_MANUAL_STATUS = ['AVAILABLE', 'MAINTENANCE', 'INACTIVE'] as const;
export const TRAILER_MANUAL_STATUS = ['AVAILABLE', 'MAINTENANCE', 'INACTIVE'] as const;
export const DRIVER_MANUAL_STATUS = ['AVAILABLE', 'OFF_DUTY', 'INACTIVE'] as const;
