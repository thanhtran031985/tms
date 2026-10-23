import type { DriverRow, TractorRow, TrailerRow } from '@core/modules/fleet/repo';
import type { ExpiringDocumentItem } from '@core/modules/fleet/documents.service';

export type TractorDto = TractorRow;
export type TrailerDto = TrailerRow;
export type DriverDto = DriverRow;
export type ExpiringDocDto = ExpiringDocumentItem;

export type FleetAccess = 'write' | 'read';

// Trạng thái do điều vận tự đặt (task 06, 09): form không cho sửa tay và không gửi lên khi lưu.
export const SYSTEM_STATUS_LABELS: Record<string, string> = {
  IN_USE: 'Đang chạy',
  ON_DUTY: 'Đang làm việc',
  DROPPED: 'Đang hạ bãi',
};
export const isSystemStatus = (status: string | undefined | null): boolean =>
  !!status && status in SYSTEM_STATUS_LABELS;
