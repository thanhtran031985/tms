import { ROLES } from '@shared/enums';
import { describe, expect, it } from 'vitest';
import { PERMISSIONS, can, rolesFor, type Permission } from './permissions';

const WRITE_PERMISSIONS: Permission[] = (Object.keys(PERMISSIONS) as Permission[]).filter(
  (p) => !p.endsWith('.view') && p !== 'web.access',
);

describe('ma trận quyền', () => {
  it('mọi quyền chỉ chứa vai trò hợp lệ và có ít nhất một vai trò', () => {
    for (const [permission, roles] of Object.entries(PERMISSIONS)) {
      expect(roles.length, permission).toBeGreaterThan(0);
      for (const role of roles) expect(ROLES, permission).toContain(role);
    }
  });

  it('VIEWER không có quyền ghi nào, chỉ xem báo cáo và vào web', () => {
    for (const permission of WRITE_PERMISSIONS) {
      expect(can('VIEWER', permission), permission).toBe(false);
    }
    expect(can('VIEWER', 'report.view')).toBe(true);
    expect(can('VIEWER', 'web.access')).toBe(true);
  });

  it('DRIVER không vào web, chỉ dùng app tài xế', () => {
    expect(can('DRIVER', 'web.access')).toBe(false);
    expect(can('DRIVER', 'driverApp.use')).toBe(true);
    for (const permission of Object.keys(PERMISSIONS) as Permission[]) {
      if (permission === 'driverApp.use') continue;
      expect(can('DRIVER', permission), permission).toBe(false);
    }
  });

  it('theo PRD A4: chỉ ADMIN sửa bảng giá đang hiệu lực, chỉ KẾ TOÁN duyệt phiếu dầu và chi phí', () => {
    expect(rolesFor('pricing.editActive')).toEqual(['ADMIN']);
    expect(rolesFor('fuelVoucher.approve')).toEqual(['ACCOUNTANT']);
    expect(rolesFor('expense.approve')).toEqual(['ACCOUNTANT']);
  });

  it('điều vận ghi Order và điều xe, kế toán thì không', () => {
    expect(can('DISPATCHER', 'order.write')).toBe(true);
    expect(can('ACCOUNTANT', 'order.write')).toBe(false);
    expect(can('DISPATCHER', 'costAllocation.edit')).toBe(false);
    expect(can('DISPATCHER', 'costAllocation.view')).toBe(true);
  });

  it('danh mục: điều vận ghi, kế toán chỉ sửa thanh toán của khách, đội xe và người xem chỉ đọc', () => {
    expect(rolesFor('masterData.write')).toEqual(['OWNER', 'ADMIN', 'DISPATCHER']);
    expect(can('ACCOUNTANT', 'masterData.write')).toBe(false);
    expect(can('ACCOUNTANT', 'masterData.editBilling')).toBe(true);
    for (const role of ['FLEET_MANAGER', 'VIEWER'] as const) {
      expect(can(role, 'masterData.view')).toBe(true);
      expect(can(role, 'masterData.write')).toBe(false);
      expect(can(role, 'masterData.editBilling')).toBe(false);
    }
  });

  it('rolesFor trả mảng dùng thẳng cho requireRole', () => {
    expect(rolesFor('identity.manageUsers')).toEqual(['OWNER', 'ADMIN']);
  });
});
