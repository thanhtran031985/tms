// Quy tắc hết hạn phiên (Auth.js JWT): tích "Ghi nhớ 30 ngày" thì 30 ngày, không tích thì 12 giờ.
// Cookie JWT sống tối đa 30 ngày; hết hạn logic được kiểm tra ở callback jwt và ở proxy.
export const REMEMBER_MS = 30 * 24 * 60 * 60 * 1000;
export const SHORT_SESSION_MS = 12 * 60 * 60 * 1000;
export const COOKIE_MAX_AGE_SECONDS = REMEMBER_MS / 1000;

export function sessionExpiry(rememberMe: boolean, now: number = Date.now()): number {
  return now + (rememberMe ? REMEMBER_MS : SHORT_SESSION_MS);
}

export function isExpired(expiresAt: number | undefined, now: number = Date.now()): boolean {
  return typeof expiresAt !== 'number' || now >= expiresAt;
}
