import { describe, expect, it } from 'vitest';
import { toTenantDate } from './index';

describe('toTenantDate', () => {
  it('23:30 UTC ra ngày hôm sau theo Asia/Ho_Chi_Minh', () => {
    expect(toTenantDate(new Date('2026-10-21T23:30:00.000Z'), 'Asia/Ho_Chi_Minh')).toBe(
      '2026-10-22',
    );
  });

  it('16:59:59.999 UTC vẫn là cùng ngày, 17:00 UTC sang ngày mới', () => {
    expect(toTenantDate(new Date('2026-10-21T16:59:59.999Z'), 'Asia/Ho_Chi_Minh')).toBe(
      '2026-10-21',
    );
    expect(toTenantDate(new Date('2026-10-21T17:00:00.000Z'), 'Asia/Ho_Chi_Minh')).toBe(
      '2026-10-22',
    );
  });

  it('mặc định dùng giờ Việt Nam', () => {
    expect(toTenantDate(new Date('2026-12-31T20:00:00.000Z'))).toBe('2027-01-01');
  });

  it('theo múi giờ khác của tenant', () => {
    expect(toTenantDate(new Date('2026-10-21T23:30:00.000Z'), 'UTC')).toBe('2026-10-21');
  });

  it('thời điểm không hợp lệ báo lỗi', () => {
    expect(() => toTenantDate(new Date('không phải ngày'))).toThrow();
  });
});
