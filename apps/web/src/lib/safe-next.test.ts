import { describe, expect, it } from 'vitest';
import { safeNext } from './safe-next';

describe('safeNext', () => {
  it('giữ đường dẫn nội bộ kể cả có query', () => {
    expect(safeNext('/dispatch')).toBe('/dispatch');
    expect(safeNext('/orders?status=OPEN&page=2')).toBe('/orders?status=OPEN&page=2');
  });

  it('chặn địa chỉ ngoài, giao thức, đường dẫn tương đối và trống', () => {
    for (const bad of [
      'https://evil.example',
      '//evil.example',
      '/\\evil.example',
      'dispatch',
      '',
      null,
      undefined,
    ]) {
      expect(safeNext(bad), String(bad)).toBe('/');
    }
  });

  it('không quay lại chính màn đăng nhập hoặc chọn công ty', () => {
    expect(safeNext('/login')).toBe('/');
    expect(safeNext('/login?next=/x')).toBe('/');
    expect(safeNext('/select-tenant')).toBe('/');
  });
});
