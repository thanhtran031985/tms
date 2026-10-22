import type {
  CALC_BASES,
  CONTAINER_STATUSES,
  FEE_TARIFF_CATEGORIES,
  LOCATION_TYPES,
  ORDER_STATUSES,
  ORDER_TYPES,
  PORT_READINESS,
  ROLES,
  STOP_STATUSES,
  STOP_TYPES,
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

// Đơn hàng (task 04): chiều, trạng thái Order, trạng thái container, trạng thái cảng, loại Stop.
export const ORDER_TYPE_LABELS: Record<(typeof ORDER_TYPES)[number], string> = {
  IMPORT: 'Nhập',
  EXPORT: 'Xuất',
  DOMESTIC: 'Nội địa',
};

export const ORDER_STATUS_LABELS: Record<(typeof ORDER_STATUSES)[number], string> = {
  DRAFT: 'Nháp',
  CONFIRMED: 'Đã xác nhận',
  IN_PROGRESS: 'Đang thực hiện',
  PARTIALLY_DELIVERED: 'Giao một phần',
  DELIVERED: 'Đã giao',
  RECONCILED: 'Đã đối soát',
  INVOICED: 'Đã xuất hóa đơn',
  CANCELLED: 'Đã hủy',
};

export const CONTAINER_STATUS_LABELS: Record<(typeof CONTAINER_STATUSES)[number], string> = {
  PENDING: 'Chờ điều',
  PLANNED: 'Đã lên chuyến',
  IN_PROGRESS: 'Đang chạy',
  DELIVERED: 'Đã giao',
  COMPLETED: 'Hoàn tất',
  CANCELLED: 'Đã hủy',
};

export const PORT_READINESS_LABELS: Record<(typeof PORT_READINESS)[number], string> = {
  PENDING: 'Chờ xác nhận cảng',
  READY_EDO: 'Có EDO',
  READY_EMPTY_RELEASE: 'Có lệnh cấp rỗng',
  HOLD_CUSTOMS: 'Hải quan giữ',
  HOLD_LINE: 'Hãng tàu giữ',
};

export const STOP_TYPE_LABELS: Record<(typeof STOP_TYPES)[number], string> = {
  PICK_EMPTY: 'Lấy rỗng',
  PICK_FULL: 'Lấy hàng',
  STUFFING: 'Đóng hàng',
  UNSTUFFING: 'Dỡ hàng',
  PORT_IN: 'Hạ cảng',
  RETURN_EMPTY: 'Trả rỗng',
  DROP_TRAILER: 'Thả rơ moóc',
  HOOK_TRAILER: 'Móc rơ moóc',
  STREET_TURN: 'Street Turn',
};

export const STOP_STATUS_LABELS: Record<(typeof STOP_STATUSES)[number], string> = {
  PENDING: 'Chưa thực hiện',
  ARRIVED: 'Đã đến',
  COMPLETED: 'Hoàn thành',
  SKIPPED: 'Bỏ qua',
};
