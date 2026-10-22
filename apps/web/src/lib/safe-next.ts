// Chỉ nhận đường dẫn nội bộ làm đích quay lại sau đăng nhập (chống open redirect).
export function safeNext(value: string | null | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) {
    return '/';
  }
  if (value === '/login' || value.startsWith('/login?') || value.startsWith('/select-tenant')) {
    return '/';
  }
  return value;
}
