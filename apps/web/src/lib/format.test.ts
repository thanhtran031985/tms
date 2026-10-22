import { describe, expect, it } from 'vitest';
import {
  formatDate,
  formatDateTime,
  formatMoney,
  formatShortDateTime,
  formatTime,
  vnDay,
  vnLocalToIso,
} from './format';

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

describe('định dạng ngày giờ cho màn Đơn hàng', () => {
  it('ngày giờ gọn dd/MM HH:mm theo giờ Việt Nam', () => {
    expect(formatShortDateTime('2026-10-17T09:35:00Z')).toBe('17/10 16:35');
  });

  it('ngày dương lịch Việt Nam, không phải ngày UTC', () => {
    expect(vnDay('2026-10-31T17:30:00Z')).toBe('2026-11-01');
    expect(vnDay('2026-10-31T16:30:00Z')).toBe('2026-10-31');
  });

  it('ô datetime-local (giờ Việt Nam) đổi sang ISO UTC; sai định dạng thì null', () => {
    expect(vnLocalToIso('2026-10-28T10:00')).toBe('2026-10-28T03:00:00.000Z');
    expect(vnLocalToIso('2026-11-01T00:30')).toBe('2026-10-31T17:30:00.000Z');
    expect(vnLocalToIso('')).toBeNull();
    expect(vnLocalToIso('28/10/2026 10:00')).toBeNull();
  });
});
