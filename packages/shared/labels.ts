import type { LOCATION_TYPES, ROLES, VENDOR_TYPES } from './enums';

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
