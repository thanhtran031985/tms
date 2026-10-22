// Ma trận quyền tập trung (spec 01 Rule 4, PRD A4). Không rải rác trong component.
// Khóa theo hành động; mỗi Server Action gọi requireRole(rolesFor('<hành động>')).
// Mục PRD ghi "theo ma trận" chưa chốt (CS ghi Order, ĐV/ĐX xem báo cáo) tạm KHÔNG cấp; thêm khi PO quyết định.
import type { Role } from '../../lib/context';

export const PERMISSIONS = {
  // Cổng web: mọi vai trò trừ tài xế.
  'web.access': ['OWNER', 'ADMIN', 'DISPATCHER', 'ACCOUNTANT', 'FLEET_MANAGER', 'VIEWER'],
  'identity.manageUsers': ['OWNER', 'ADMIN'],
  'tenant.configure': ['OWNER', 'ADMIN'],
  'pricing.editActive': ['ADMIN'],
  'order.write': ['ADMIN', 'DISPATCHER'],
  'dispatch.overrideDriveHours': ['ADMIN'],
  'fuelVoucher.issue': ['ADMIN', 'DISPATCHER', 'ACCOUNTANT'],
  'fuelVoucher.approve': ['ACCOUNTANT'],
  'expense.approve': ['ACCOUNTANT'],
  'ledger.penalty': ['ACCOUNTANT'],
  'costAllocation.edit': ['ADMIN', 'ACCOUNTANT'],
  'costAllocation.view': ['ADMIN', 'DISPATCHER', 'ACCOUNTANT'],
  'accounting.manage': ['ACCOUNTANT'], // đối soát, hóa đơn, thanh toán, khóa kỳ
  'accounting.reopenPeriod': ['ADMIN'],
  'fleet.write': ['ADMIN', 'FLEET_MANAGER'],
  'fleet.view': ['ADMIN', 'DISPATCHER', 'FLEET_MANAGER'],
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
