import { describe, expect, it } from 'vitest';
import { addCalendarDays, diffCalendarDays, startOfTenantDay, toTenantDate } from './index';

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

describe('startOfTenantDay', () => {
  it('00:00 giờ Việt Nam là 17:00 UTC của ngày hôm trước', () => {
    expect(startOfTenantDay('2026-10-26', 'Asia/Ho_Chi_Minh').toISOString()).toBe(
      '2026-10-25T17:00:00.000Z',
    );
  });

  it('UTC thì đầu ngày trùng 00:00 UTC', () => {
    expect(startOfTenantDay('2026-10-26', 'UTC').toISOString()).toBe('2026-10-26T00:00:00.000Z');
  });

  it('múi giờ có đổi giờ mùa hè (America/New_York, EDT = UTC-4 ngày 26/10/2026)', () => {
    expect(startOfTenantDay('2026-10-26', 'America/New_York').toISOString()).toBe(
      '2026-10-26T04:00:00.000Z',
    );
  });

  it('khớp với toTenantDate: ngay trước đó là ngày hôm trước', () => {
    const start = startOfTenantDay('2026-10-26', 'Asia/Ho_Chi_Minh');
    expect(toTenantDate(start, 'Asia/Ho_Chi_Minh')).toBe('2026-10-26');
    expect(toTenantDate(new Date(start.getTime() - 1), 'Asia/Ho_Chi_Minh')).toBe('2026-10-25');
  });
});

describe('addCalendarDays và diffCalendarDays', () => {
  it('cộng ngày qua ranh giới tháng và năm', () => {
    expect(addCalendarDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addCalendarDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addCalendarDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('đếm số ngày giữa hai ngày', () => {
    expect(diffCalendarDays('2026-11-05', '2026-10-26')).toBe(10);
    expect(diffCalendarDays('2026-10-25', '2026-10-26')).toBe(-1);
    expect(diffCalendarDays('2026-10-26', '2026-10-26')).toBe(0);
  });
});
