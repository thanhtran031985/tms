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
