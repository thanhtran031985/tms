import { describe, expect, it } from 'vitest';
import { formatDateTime, formatTime } from './format';

describe('định dạng giờ Việt Nam', () => {
  it('đổi UTC sang giờ Việt Nam (+7)', () => {
    expect(formatTime('2026-10-22T07:35:00Z')).toBe('14:35');
    expect(formatTime(new Date('2026-10-21T17:05:00Z'))).toBe('00:05');
  });

  it('ngày giờ dạng dd/MM/yyyy HH:mm', () => {
    expect(formatDateTime('2026-10-20T01:00:00Z')).toBe('20/10/2026 08:00');
  });
});
