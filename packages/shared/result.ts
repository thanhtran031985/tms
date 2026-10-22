import { ERROR_MESSAGES, type ErrorCode } from './errors';

// Kết quả Server Action / service (spec 01 Rule 5): không ném lỗi nghiệp vụ ra client.
// - fieldErrors: chỉ có khi VALIDATION_ERROR, để form hiện lỗi dưới từng ô.
// - details: dữ kiện để UI hiển thị (vd. attemptsLeft, lockedUntil dạng ISO) mà không phải phân tích câu thông báo.
export type Success<T> = { ok: true; data: T };
export type Failure = {
  ok: false;
  code: ErrorCode;
  message: string;
  fieldErrors?: Record<string, string[]>;
  details?: Record<string, string | number>;
};
export type Result<T> = Success<T> | Failure;

export function ok<T>(data: T): Success<T> {
  return { ok: true, data };
}

export function fail(
  code: ErrorCode,
  message: string = ERROR_MESSAGES[code],
  extra: { fieldErrors?: Record<string, string[]>; details?: Record<string, string | number> } = {},
): Failure {
  const failure: Failure = { ok: false, code, message };
  if (extra.fieldErrors) failure.fieldErrors = extra.fieldErrors;
  if (extra.details) failure.details = extra.details;
  return failure;
}
