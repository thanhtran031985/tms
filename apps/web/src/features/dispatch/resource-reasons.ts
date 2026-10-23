// Lý do một đầu kéo, tài xế hoặc rơ moóc được hoặc không được điều, viết cho bảng gán xe (Screen03-Dispatch).
// Dữ liệu đến từ listResourceAvailability; câu chữ ở đây ngắn, một dòng, chữ + icon do component thêm.
import type { AvailabilityReason, ResourceAvailability } from '@shared/dispatch-board';

const detail = (reason: AvailabilityReason, key: string) => {
  const value = reason.details?.[key];
  return value === undefined ? undefined : String(value);
};

const NOT_AVAILABLE_TEXT: Record<string, string> = {
  OFF_DUTY: 'Tài xế nghỉ phép hôm nay',
  INACTIVE: 'Ngừng sử dụng, không được điều',
  MAINTENANCE: 'Đang bảo dưỡng trong khung giờ này',
  NOT_FOUND: 'Không còn trong danh sách',
};

/** Một dòng lý do, tiếng Việt, theo mã lý do của dịch vụ điều vận. */
export function reasonText(reason: AvailabilityReason): string {
  switch (reason.code) {
    case 'AVAILABLE':
      return 'Rảnh trong khung giờ này';
    case 'DOCUMENT_EXPIRED':
      return `${detail(reason, 'document') ?? 'Giấy tờ'} hết hạn, không được điều`;
    case 'DOCUMENT_EXPIRING':
      return `Được điều · ${detail(reason, 'document') ?? 'Giấy tờ'} còn ${detail(reason, 'daysRemaining') ?? '?'} ngày`;
    case 'RESOURCE_TIME_CONFLICT':
      return 'Trùng giờ với chuyến khác';
    case 'DRIVER_NOT_AVAILABLE':
    case 'TRACTOR_NOT_AVAILABLE':
    case 'TRAILER_NOT_AVAILABLE': {
      const key = detail(reason, 'reason') ?? '';
      return NOT_AVAILABLE_TEXT[key] ?? 'Chưa sẵn sàng, không được điều';
    }
    case 'DRIVING_HOURS_EXCEEDED':
      return 'Vượt giờ lái tối đa trong ngày';
    case 'REEFER_REQUIRES_GENSET':
      return 'Cont lạnh cần rơ moóc có genset';
    case 'DG_CERTIFICATE_REQUIRED':
      return 'Thiếu chứng chỉ hàng nguy hiểm còn hạn';
    case 'PAYLOAD_EXCEEDED':
      return 'Vượt tải trọng cho phép';
    case 'TWIN20_TRAILER_NOT_ALLOWED':
      return 'Không có chốt khóa giữa, không ghép TWIN_20 được';
    case 'TWIN20_OK':
      return 'Ghép TWIN_20 được';
    case 'WEIGHT_MISSING':
      return 'Được điều · chưa có khối lượng cont';
    default:
      return reason.message;
  }
}

const SEVERITY_RANK = { danger: 0, warn: 1, info: 2 } as const;

/** Lý do nổi bật nhất để hiện trên nút: lỗi chặn trước, rồi cảnh báo, rồi thông tin. */
export function primaryReason(resource: ResourceAvailability): AvailabilityReason {
  const sorted = [...resource.reasons].sort(
    (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity],
  );
  return sorted[0] ?? { code: 'AVAILABLE', severity: 'info', message: 'Rảnh trong khung giờ này' };
}

// Mã thông tin phụ không đáng hiện khi đã có lý do khác.
const QUIET_CODES = new Set(['TRACTOR_TARE_NOT_COUNTED']);

/** Toàn bộ lý do (bỏ thông tin phụ), dùng làm chú giải khi rê chuột. */
export function allReasonTexts(resource: ResourceAvailability): string[] {
  const reasons = resource.reasons.filter((r) => !QUIET_CODES.has(r.code));
  return (reasons.length > 0 ? reasons : resource.reasons).map(reasonText);
}

/** Tone của dòng lý do: chặn là crit, cảnh báo là warn, còn lại là ok. */
export function reasonTone(reason: AvailabilityReason): 'crit' | 'warn' | 'ok' {
  return reason.severity === 'danger' ? 'crit' : reason.severity === 'warn' ? 'warn' : 'ok';
}

/** Phương án rảnh đầu tiên (ưu tiên `preferId` nếu còn rảnh) để chọn sẵn trong ô chọn. */
export function pickDefault(list: ResourceAvailability[], preferId?: string | null): string {
  const preferred = preferId ? list.find((r) => r.id === preferId && r.available) : undefined;
  return (preferred ?? list.find((r) => r.available))?.id ?? '';
}
