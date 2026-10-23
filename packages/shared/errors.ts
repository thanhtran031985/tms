// Mã lỗi cố định dùng chung server và client (spec 01 Rule 5). Thông báo tiếng Việt nói chuyện gì xảy ra và làm gì tiếp.
// Mã nghiệp vụ riêng (DRIVER_NOT_AVAILABLE, TARIFF_NOT_FOUND…) do từng task thêm vào đây.
export const ERROR_MESSAGES = {
  UNAUTHENTICATED: 'Phiên đăng nhập đã hết hạn hoặc chưa đăng nhập. Hãy đăng nhập lại để tiếp tục.',
  FORBIDDEN:
    'Vai trò của bạn không có quyền thực hiện thao tác này. Liên hệ quản trị công ty nếu cần thêm quyền.',
  VALIDATION_ERROR: 'Dữ liệu nhập chưa hợp lệ. Kiểm tra các ô báo lỗi rồi thử lại.',
  INVALID_CREDENTIALS: 'Email, số điện thoại hoặc mật khẩu không đúng. Kiểm tra lại rồi thử lại.',
  ACCOUNT_LOCKED:
    'Tài khoản tạm khóa vì nhập sai mật khẩu nhiều lần liên tiếp. Thử lại sau giờ mở khóa.',
  NO_TENANT_MEMBERSHIP:
    'Tài khoản chưa được gán vào công ty nào. Liên hệ quản trị để được thêm vào công ty.',
  STALE_DATA: 'Dữ liệu đã được người khác thay đổi. Tải lại trang để xem bản mới nhất rồi thử lại.',
  NOT_FOUND:
    'Không tìm thấy dữ liệu này. Có thể dữ liệu đã bị xóa hoặc không thuộc công ty của bạn.',
  DUPLICATE_CODE: 'Mã này đã có trong công ty của bạn. Dùng mã khác hoặc mở bản ghi đã có để sửa.',
  TARIFF_NOT_FOUND:
    'Chưa có giá cho tuyến, loại container, chế độ chạy và khách này vào ngày tra giá. Nhập giá tay hoặc thêm bảng giá.',
  TARIFF_OVERLAP:
    'Đã có giá cùng khóa với khoảng hiệu lực chồng lên khoảng này. Đổi ngày hiệu lực hoặc điều chỉnh giá đang có.',
  INVALID_STATUS_TRANSITION:
    'Trạng thái hiện tại không cho phép thao tác này. Tải lại trang để xem trạng thái mới nhất.',
  PRICE_MISSING:
    'Có container chưa có giá nên chưa xác nhận được Order. Nhập giá tay kèm lý do cho các container đó rồi xác nhận lại.',
  CANCEL_FEE_REQUIRED:
    'Container đã chạy một phần nên phải nhập phí hủy lớn hơn 0 và lý do trước khi hủy.',
  // Điều vận (task 06). *_NOT_AVAILABLE: tài nguyên không tồn tại, khác công ty, ngừng dùng, đang bận hoặc vướng bảo dưỡng
  // (details.reason nói rõ); RESOURCE_TIME_CONFLICT: trùng giờ với chuyến khác.
  DRIVER_NOT_AVAILABLE:
    'Tài xế này không điều được trong khung giờ đã chọn (nghỉ phép, ngừng làm việc hoặc đang bận). Chọn tài xế khác.',
  TRACTOR_NOT_AVAILABLE:
    'Đầu kéo này không điều được trong khung giờ đã chọn (ngừng dùng, bảo dưỡng hoặc đang bận). Chọn đầu kéo khác.',
  TRAILER_NOT_AVAILABLE:
    'Rơ moóc này không điều được trong khung giờ đã chọn (ngừng dùng, bảo dưỡng hoặc đang bận). Chọn rơ moóc khác.',
  RESOURCE_TIME_CONFLICT:
    'Tài nguyên đã có chuyến khác trùng giờ. Chọn tài nguyên khác hoặc đổi giờ chuyến.',
  DOCUMENT_EXPIRED:
    'Giấy tờ đã hết hạn trước giờ kết thúc chuyến nên không được điều. Gia hạn giấy tờ hoặc chọn tài nguyên khác.',
  RESOURCE_BUSY_RETRY: 'Tài nguyên đang được người khác điều. Chờ vài giây rồi thử lại.',
  REEFER_REQUIRES_GENSET:
    'Container lạnh cần rơ moóc có máy phát điện (genset). Chọn rơ moóc khác.',
  DG_CERTIFICATE_REQUIRED:
    'Hàng nguy hiểm cần tài xế có chứng chỉ hàng nguy hiểm còn hạn. Chọn tài xế khác.',
  PORT_NOT_READY:
    'Container chưa sẵn sàng tại cảng (đang giữ hoặc chưa có lệnh giao, lệnh cấp rỗng) nên chưa điều được.',
  PAYLOAD_EXCEEDED:
    'Khối lượng container vượt tải trọng cho phép của rơ moóc hoặc đầu kéo. Chọn xe khác.',
  WEIGHT_CONFIRMATION_REQUIRED:
    'Container chưa có khối lượng nên chưa kiểm tra được tải trọng. Xác nhận đã biết để tiếp tục.',
  DRIVING_HOURS_EXCEEDED:
    'Tài xế vượt giờ lái cho phép trong ngày. Chọn tài xế khác hoặc nhờ Quản trị ghi đè kèm lý do.',
  DRIVING_HOURS_OVERRIDE_FORBIDDEN:
    'Chỉ Quản trị được ghi đè giờ lái. Chọn tài xế khác hoặc nhờ Quản trị.',
  CONTAINER_ALREADY_IN_TRIP:
    'Container này đã có chuyến đang hoạt động. Mở chuyến đó thay vì tạo chuyến mới.',
  ORDER_NOT_CONFIRMED:
    'Order chưa được xác nhận hoặc đã hủy nên chưa lập được chuyến cho container này.',
  INTERNAL_ERROR:
    'Hệ thống gặp sự cố ngoài ý muốn. Thử lại sau ít phút; nếu vẫn lỗi, báo bộ phận hỗ trợ kèm giờ xảy ra.',
} as const;

export type ErrorCode = keyof typeof ERROR_MESSAGES;

export const ERROR_CODES = Object.keys(ERROR_MESSAGES) as ErrorCode[];

// Lỗi nghiệp vụ có mã cố định. Server Action chuyển nó thành { ok: false, code, message }, không ném ra client.
export class AppError extends Error {
  readonly code: ErrorCode;
  /** Dữ kiện cho UI (vd. field, deletedId) để không phải phân tích câu thông báo. */
  readonly details?: Record<string, string | number>;

  constructor(
    code: ErrorCode,
    message: string = ERROR_MESSAGES[code],
    details?: Record<string, string | number>,
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    if (details) this.details = details;
  }
}
