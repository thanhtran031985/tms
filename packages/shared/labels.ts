import type {
  CALC_BASES,
  FEE_TARIFF_CATEGORIES,
  LOCATION_TYPES,
  ROLES,
  TRIP_MODES,
  VENDOR_TYPES,
} from './enums';

// Tên vai trò hiển thị trên giao diện (PRD A3, A4).
export const ROLE_LABELS: Record<(typeof ROLES)[number], string> = {
  OWNER: 'Chủ công ty',
  ADMIN: 'Quản trị',
  DISPATCHER: 'Điều vận',
  ACCOUNTANT: 'Kế toán',
  FLEET_MANAGER: 'Quản lý đội xe',
  DRIVER: 'Tài xế',
  VIEWER: 'Chỉ xem',
};

// Tên loại nhà cung cấp và loại địa điểm hiển thị trên giao diện (PRD E3).
export const VENDOR_TYPE_LABELS: Record<(typeof VENDOR_TYPES)[number], string> = {
  FUEL_STATION: 'Cây xăng',
  SUB_CONTRACTOR: 'Nhà xe ngoài',
  GARAGE: 'Garage',
  PORT: 'Cảng',
  DEPOT: 'Depot',
  TIRE_SUPPLIER: 'Lốp',
};

export const LOCATION_TYPE_LABELS: Record<(typeof LOCATION_TYPES)[number], string> = {
  PORT: 'Cảng',
  DEPOT: 'Depot',
  WAREHOUSE: 'Kho khách',
  FUEL_STATION: 'Cây xăng',
  GARAGE: 'Garage',
  PARKING: 'Bãi đỗ',
};

// Bảng giá (task 03): chế độ chạy, nhóm phí, cách tính.
export const TRIP_MODE_LABELS: Record<(typeof TRIP_MODES)[number], string> = {
  SINGLE: 'Chạy đơn',
  TWIN_20: 'Ghép 2×20',
  COMBINED: 'Kết hợp',
};

export const FEE_CATEGORY_LABELS: Record<(typeof FEE_TARIFF_CATEGORIES)[number], string> = {
  COST_NORM: 'Định mức chi phí',
  REVENUE_SURCHARGE: 'Phụ phí thu khách',
  PASS_THROUGH: 'Chi hộ',
};

export const CALC_BASIS_LABELS: Record<(typeof CALC_BASES)[number], string> = {
  PER_TRIP: 'Theo chuyến',
  PER_CONTAINER: 'Theo container',
  PER_DAY: 'Theo ngày',
  PER_KM: 'Theo km',
};
