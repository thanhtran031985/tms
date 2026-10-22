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
// Nhóm phí của bảng phí (spec 02, fee_tariffs): chỉ 3 giá trị; FEE_CATEGORIES (4 giá trị) dùng cho khoản phí trên Order/chuyến.
export const FEE_TARIFF_CATEGORIES = ['COST_NORM', 'REVENUE_SURCHARGE', 'PASS_THROUGH'] as const;
export const CALC_BASES = ['PER_TRIP', 'PER_CONTAINER', 'PER_DAY', 'PER_KM'] as const;

export type ContainerType = (typeof CONTAINER_TYPES)[number];
export type TripMode = (typeof TRIP_MODES)[number];
