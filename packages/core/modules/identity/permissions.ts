// Ma trận quyền tập trung (spec 01 Rule 4, PRD A4). Không rải rác trong component.
// Khóa theo hành động; mỗi Server Action gọi requireRole(rolesFor('<hành động>')).
// Mục PRD ghi "theo ma trận" chưa chốt (CS ghi Order, ĐV/ĐX xem báo cáo) tạm KHÔNG cấp; thêm khi PO quyết định.
import type { Role } from '../../lib/context';

export const PERMISSIONS = {
  // Cổng web: mọi vai trò trừ tài xế.
  'web.access': ['OWNER', 'ADMIN', 'DISPATCHER', 'ACCOUNTANT', 'FLEET_MANAGER', 'VIEWER'],
  // Danh mục cơ bản (task 02): xem cho mọi vai trò web; ghi cho quản trị và điều vận;
  // Kế toán chỉ sửa thông tin thanh toán của khách (MST, địa chỉ hóa đơn, hạn thanh toán, hạn mức).
  'masterData.view': ['OWNER', 'ADMIN', 'DISPATCHER', 'ACCOUNTANT', 'FLEET_MANAGER', 'VIEWER'],
  'masterData.write': ['OWNER', 'ADMIN', 'DISPATCHER'],
  'masterData.editBilling': ['OWNER', 'ADMIN', 'DISPATCHER', 'ACCOUNTANT'],
  // Bảng giá (task 03): xem cho mọi vai trò web; tạo giá mới, sửa bản chưa hiệu lực, import cho Chủ công ty, Quản trị, Kế toán.
  // Sửa hoặc đóng giá ĐANG hiệu lực chỉ có pricing.editActive (PRD A4: Quản trị).
  'tariff.view': ['OWNER', 'ADMIN', 'DISPATCHER', 'ACCOUNTANT', 'FLEET_MANAGER', 'VIEWER'],
  'tariff.write': ['OWNER', 'ADMIN', 'ACCOUNTANT'],
  'identity.manageUsers': ['OWNER', 'ADMIN'],
  'tenant.configure': ['OWNER', 'ADMIN'],
  'pricing.editActive': ['ADMIN'],
  // Đơn hàng (task 04): xem cho mọi vai trò web; tạo, sửa, xác nhận, hủy theo task.md gồm cả Chủ công ty (PRD A4 ghi "theo ma trận",
  // chờ PO xác nhận). Giá tay cho container không có bảng giá: Điều vận, Kế toán, Quản trị.
  'order.view': ['OWNER', 'ADMIN', 'DISPATCHER', 'ACCOUNTANT', 'FLEET_MANAGER', 'VIEWER'],
  'order.write': ['OWNER', 'ADMIN', 'DISPATCHER'],
  'order.manualPrice': ['ADMIN', 'DISPATCHER', 'ACCOUNTANT'],
  // Điều vận (task 06): lập chuyến, gán tài nguyên, điều, hủy assignment; xem để hiện bảng gán xe. Ghi đè giờ lái chỉ Quản trị.
  'dispatch.view': ['OWNER', 'ADMIN', 'DISPATCHER', 'FLEET_MANAGER', 'VIEWER'],
  'dispatch.assign': ['OWNER', 'ADMIN', 'DISPATCHER'],
  'dispatch.overrideDriveHours': ['ADMIN'],
  'fuelVoucher.issue': ['ADMIN', 'DISPATCHER', 'ACCOUNTANT'],
  'fuelVoucher.approve': ['ACCOUNTANT'],
  'expense.approve': ['ACCOUNTANT'],
  'ledger.penalty': ['ACCOUNTANT'],
  'costAllocation.edit': ['ADMIN', 'ACCOUNTANT'],
  'costAllocation.view': ['ADMIN', 'DISPATCHER', 'ACCOUNTANT'],
  'accounting.manage': ['ACCOUNTANT'], // đối soát, hóa đơn, thanh toán, khóa kỳ
  'accounting.reopenPeriod': ['ADMIN'],
  'fleet.write': ['OWNER', 'ADMIN', 'FLEET_MANAGER'],
  'fleet.view': ['OWNER', 'ADMIN', 'DISPATCHER', 'FLEET_MANAGER', 'VIEWER'],
  'report.view': ['OWNER', 'ADMIN', 'ACCOUNTANT', 'VIEWER'],
  // App tài xế: chỉ lệnh của chính mình, không dùng web.
  'driverApp.use': ['DRIVER'],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function rolesFor(permission: Permission): readonly Role[] {
  return PERMISSIONS[permission];
}

export function can(role: Role, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly Role[]).includes(role);
}
