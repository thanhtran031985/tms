import type { ROLES } from './enums';

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
