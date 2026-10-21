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
