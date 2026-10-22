import { describe, expect, it } from 'vitest';
import { describeAudit } from './order-history';

describe('mô tả lịch sử thay đổi của Order', () => {
  it('tạo Order nêu số container', () => {
    expect(
      describeAudit({
        action: 'CREATE',
        before: null,
        after: { orderNo: 'EXP-2610-044', containers: [{}, {}, {}] },
      }),
    ).toBe('Tạo Order EXP-2610-044 với 3 container');
  });

  it('xác nhận Order nêu số container đã chốt giá', () => {
    expect(
      describeAudit({ action: 'CONFIRM', before: null, after: { containers: [{}, {}] } }),
    ).toBe('Xác nhận Order, chốt giá 2 container');
  });

  it('giá tay nêu số tiền theo vi-VN, số container và lý do', () => {
    const text = describeAudit({
      action: 'MANUAL_PRICE',
      before: null,
      after: { containerNo: 'OOLU8842110', price: '3100000.00', reason: 'Khách báo giá qua email' },
    });
    expect(text).toBe('Nhập giá tay 3.100.000 ₫ cho OOLU8842110. Lý do: Khách báo giá qua email');
  });

  it('hủy container nêu lý do và phí hủy nếu có; cont chưa có số thì gọi theo dòng', () => {
    expect(
      describeAudit({
        action: 'CANCEL_CONTAINER',
        before: null,
        after: { lineNo: 2, reason: 'Khách hủy', cancellationFee: '450000.00' },
      }),
    ).toBe('Hủy container dòng 2. Lý do: Khách hủy. Phí hủy 450.000 ₫');
    expect(
      describeAudit({
        action: 'CANCEL_CONTAINER',
        before: null,
        after: { containerNo: 'MSKU1234565', reason: 'Đổi lịch', cancellationFee: null },
      }),
    ).toBe('Hủy MSKU1234565. Lý do: Đổi lịch');
  });

  it('đổi trạng thái dùng nhãn tiếng Việt', () => {
    expect(
      describeAudit({
        action: 'STATUS_CHANGE',
        before: { status: 'CONFIRMED' },
        after: { status: 'CANCELLED', reason: 'Khách hủy booking' },
      }),
    ).toBe('Order chuyển sang "Đã hủy". Lý do: Khách hủy booking');
  });

  it('thêm và bớt container', () => {
    expect(
      describeAudit({
        action: 'UPDATE',
        before: { change: 'ADD_CONTAINERS' },
        after: { change: 'ADD_CONTAINERS', containers: [{}, {}] },
      }),
    ).toBe('Thêm 2 container');
    expect(
      describeAudit({
        action: 'UPDATE',
        before: {
          change: 'REMOVE_CONTAINER',
          container: { lineNo: 3, containerNo: 'TCLU7002003' },
        },
        after: { change: 'REMOVE_CONTAINER' },
      }),
    ).toBe('Bớt TCLU7002003 khỏi Order');
  });

  it('hành động lạ giữ nguyên tên, không làm vỡ màn', () => {
    expect(describeAudit({ action: 'SOMETHING', before: null, after: null })).toBe('SOMETHING');
  });
});
