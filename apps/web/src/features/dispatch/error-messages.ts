// Thông báo lỗi của thao tác điều vận theo mã lỗi (task 07): nói chuyện gì xảy ra và làm gì tiếp.
// `kind` cho giao diện biết cần làm gì thêm: hỏi xác nhận, hỏi lý do ghi đè giờ lái, hay tải lại thẻ.
export type DispatchErrorInput = {
  code: string;
  message: string;
  details?: Record<string, string | number> | undefined;
};

export type DispatchErrorView = {
  kind: 'message' | 'confirm-weight' | 'override-hours' | 'stale';
  text: string;
};

const NOUN: Record<string, string> = { DRIVER: 'Tài xế', TRACTOR: 'Đầu kéo', TRAILER: 'Rơ moóc' };
const OTHER: Record<string, string> = {
  DRIVER_NOT_AVAILABLE: 'Chọn tài xế khác.',
  TRACTOR_NOT_AVAILABLE: 'Chọn đầu kéo khác.',
  TRAILER_NOT_AVAILABLE: 'Chọn rơ moóc khác.',
};
const NOT_AVAILABLE_NOUN: Record<string, string> = {
  DRIVER_NOT_AVAILABLE: 'Tài xế',
  TRACTOR_NOT_AVAILABLE: 'Đầu kéo',
  TRAILER_NOT_AVAILABLE: 'Rơ moóc',
};
const NOT_AVAILABLE_REASON: Record<string, string> = {
  OFF_DUTY: 'đang nghỉ phép, không điều được',
  INACTIVE: 'đã ngừng sử dụng',
  MAINTENANCE: 'đang bảo dưỡng trong khung giờ này',
  NOT_FOUND: 'không còn trong danh sách',
};

const message = (text: string): DispatchErrorView => ({ kind: 'message', text });

// Rule ghép chuyến, Street Turn (task 08): nói rule nào chặn; câu chữ nói cách xử lý lấy từ máy chủ (ERROR_MESSAGES).
const RULE_PREFIX: Record<string, string> = {
  TRIP_MODE_INVALID: 'Chế độ ghép chưa hợp lệ',
  TWIN20_TRAILER_NOT_ALLOWED: 'Rule 1 (rơ moóc cho TWIN_20)',
  TWIN20_CONTAINER_NOT_20FT: 'Rule 1 (cont 20 feet cho TWIN_20)',
  DG_TWIN20_MIXED_CUSTOMER: 'Rule 6 (hàng nguy hiểm)',
  STREET_TURN_LINE_MISMATCH: 'Rule 3 (Street Turn)',
  STREET_TURN_TYPE_MISMATCH: 'Rule 3 (Street Turn)',
  STREET_TURN_NOT_ALLOWED: 'Rule 3 (Street Turn)',
  STREET_TURN_NOT_APPROVED: 'Rule 3 (Street Turn)',
  INVALID_STOP_SEQUENCE: 'Rule 3, 4 (thứ tự Stop)',
  TRIP_LAST_CONTAINER: 'Tách chuyến',
};

export function describeDispatchError(
  error: DispatchErrorInput,
  options: { canOverrideHours?: boolean } = {},
): DispatchErrorView {
  const { code, details } = error;
  switch (code) {
    case 'DRIVER_NOT_AVAILABLE':
    case 'TRACTOR_NOT_AVAILABLE':
    case 'TRAILER_NOT_AVAILABLE': {
      const reason = NOT_AVAILABLE_REASON[String(details?.reason ?? '')];
      return message(
        reason
          ? `${NOT_AVAILABLE_NOUN[code]} ${reason}. ${OTHER[code]}`
          : `${error.message} ${OTHER[code]}`,
      );
    }
    case 'RESOURCE_TIME_CONFLICT': {
      const noun = NOUN[String(details?.resource ?? '')] ?? 'Tài nguyên';
      const trip = details?.conflictTripCode ? ` (${details.conflictTripCode})` : '';
      return message(
        `${noun} đã có chuyến trùng giờ${trip}. Chọn xe hoặc tài xế khác, hoặc đổi khung giờ của thẻ.`,
      );
    }
    case 'DOCUMENT_EXPIRED':
      return message(`${error.message} Chọn xe khác hoặc báo Quản lý đội xe gia hạn giấy tờ.`);
    case 'RESOURCE_BUSY_RETRY':
      return message(
        'Đang có người gán cùng lúc. Chờ vài giây rồi thử lại; thẻ đã quay về vị trí cũ.',
      );
    case 'STALE_DATA':
      return {
        kind: 'stale',
        text: 'Chuyến vừa được người khác thay đổi. Đã tải lại thẻ, kiểm tra rồi gán lại.',
      };
    case 'REEFER_REQUIRES_GENSET':
      return message('Cont lạnh cần rơ moóc có genset. Chọn rơ moóc có genset.');
    case 'DG_CERTIFICATE_REQUIRED':
      return message('Hàng nguy hiểm cần tài xế có chứng chỉ còn hạn. Chọn tài xế khác.');
    case 'PORT_NOT_READY':
      return message(
        'Cảng chưa sẵn sàng: chưa có EDO hoặc lệnh cấp rỗng, hoặc container đang bị giữ. Chờ cảng xác nhận rồi điều.',
      );
    case 'PAYLOAD_EXCEEDED':
      return message(`${error.message} Chọn rơ moóc có tải trọng lớn hơn.`);
    case 'WEIGHT_CONFIRMATION_REQUIRED':
      return {
        kind: 'confirm-weight',
        text: 'Container chưa có khối lượng nên chưa kiểm được tải trọng. Xác nhận nếu vẫn muốn gán.',
      };
    case 'DRIVING_HOURS_EXCEEDED':
      return options.canOverrideHours
        ? {
            kind: 'override-hours',
            text: `${error.message} Quản trị được ghi đè giờ lái, bắt buộc nhập lý do.`,
          }
        : message(`${error.message} Chọn tài xế khác hoặc nhờ Quản trị ghi đè.`);
    case 'DRIVING_HOURS_OVERRIDE_FORBIDDEN':
      return message('Chỉ Quản trị được ghi đè giờ lái. Chọn tài xế khác.');
    case 'CONTAINER_ALREADY_IN_TRIP':
      return message(
        'Container đã nằm trong một chuyến khác. Tải lại bảng để xem chuyến hiện tại.',
      );
    case 'ORDER_NOT_CONFIRMED':
      return message('Order chưa được xác nhận nên chưa điều được. Xác nhận Order trước.');
    case 'FORBIDDEN':
      return message('Bạn không có quyền gán xe.');
    case 'UNAUTHENTICATED':
      return message('Phiên đăng nhập đã hết hạn. Đăng nhập lại rồi gán xe.');
    case 'NETWORK':
      return message(
        'Mất kết nối mạng nên chưa gán được. Thẻ đã quay về vị trí cũ; kiểm tra mạng rồi gán lại.',
      );
    default: {
      const prefix = RULE_PREFIX[code];
      return message(prefix ? `${prefix}: ${error.message}` : error.message);
    }
  }
}
