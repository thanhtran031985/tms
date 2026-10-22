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

export const TRACTOR_OWNERSHIP = ['OWNED', 'LEASED'] as const;
export type TractorOwnership = (typeof TRACTOR_OWNERSHIP)[number];

export const TRACTOR_STATUS = [
  'AVAILABLE',
  'IN_USE',
  'MAINTENANCE',
  'INACTIVE',
] as const;
export type TractorStatus = (typeof TRACTOR_STATUS)[number];

export const TRAILER_TYPES = [
  '20FT',
  '40FT',
  '40FT_COMBO',
  '45FT',
] as const;
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

export const DRIVER_STATUS = [
  'AVAILABLE',
  'ON_DUTY',
  'OFF_DUTY',
  'INACTIVE',
] as const;
export type DriverStatus = (typeof DRIVER_STATUS)[number];

export const MAINTENANCE_ORDER_TYPES = [
  'SCHEDULED',
  'BREAKDOWN',
  'TIRE',
] as const;
export type MaintenanceOrderType = (typeof MAINTENANCE_ORDER_TYPES)[number];

export const MAINTENANCE_ORDER_STATUS = [
  'PLANNED',
  'IN_PROGRESS',
  'DONE',
  'CANCELLED',
] as const;
export type MaintenanceOrderStatus = (typeof MAINTENANCE_ORDER_STATUS)[number];
