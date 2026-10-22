import type { ROLES } from '@shared/enums';

export type Role = (typeof ROLES)[number];

// Ngữ cảnh của một request đã xác thực. tenantId, userId, role đều lấy từ phiên + DB, không bao giờ từ input của client.
export type RequestContext = {
  tenantId: string;
  userId: string;
  role: Role;
  requestId: string;
  timezone: string;
};
