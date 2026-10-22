import { describe, expect, it } from 'vitest';
import { formatDate, formatDateTime, formatMoney, formatTime } from './format';

describe('định dạng giờ Việt Nam', () => {
  it('đổi UTC sang giờ Việt Nam (+7)', () => {
    expect(formatTime('2026-10-22T07:35:00Z')).toBe('14:35');
    expect(formatTime(new Date('2026-10-21T17:05:00Z'))).toBe('00:05');
  });

  it('ngày giờ dạng dd/MM/yyyy HH:mm', () => {
    expect(formatDateTime('2026-10-20T01:00:00Z')).toBe('20/10/2026 08:00');
  });
});

describe('định dạng ngày nghiệp vụ và tiền', () => {
  it('ngày YYYY-MM-DD sang dd/MM/yyyy, không đổi múi giờ', () => {
    expect(formatDate('2026-10-22')).toBe('22/10/2026');
    expect(formatDate('không phải ngày')).toBe('không phải ngày');
  });

  it('tiền vi-VN có dấu chấm nghìn và đơn vị; bỏ .00, giữ phần lẻ thật', () => {
    expect(formatMoney('1800000.00')).toBe('1.800.000 ₫');
    expect(formatMoney('950.50')).toBe('950,5 ₫');
    expect(formatMoney('0.00')).toBe('0 ₫');
    expect(formatMoney('1234567890.25', 'USD')).toBe('1.234.567.890,25 USD');
  });
});
