import { describe, expect, it } from 'vitest';
import { computeOrderTotals } from './totals';

const cont = (id: string, base: string, status = 'PENDING') =>
  ({ id, baseFreightAmount: base, status }) as never;
const fee = (
  orderContainerId: string | null,
  feeCategory: 'REVENUE_SURCHARGE' | 'PASS_THROUGH',
  amount: string,
  feeCode = 'X',
) => ({ orderContainerId, feeCategory, feeCode, amount }) as never;

describe('tổng tiền Order', () => {
  it('cộng cước của các cont chưa hủy, đếm số cont', () => {
    const totals = computeOrderTotals(
      [cont('a', '1800000.00'), cont('b', '2400000.50'), cont('c', '9000000.00', 'CANCELLED')],
      [],
    );
    expect(totals).toEqual({
      containerCount: 2,
      totalFreightAmount: '4200000.50',
      totalSurchargeAmount: '0.00',
      totalPassThroughAmount: '0.00',
    });
  });

  it('chi hộ tách riêng khỏi phụ thu và không vào cước', () => {
    const totals = computeOrderTotals(
      [cont('a', '1000000.00')],
      [fee('a', 'PASS_THROUGH', '600000.00'), fee('a', 'REVENUE_SURCHARGE', '100000.00')],
    );
    expect(totals.totalFreightAmount).toBe('1000000.00');
    expect(totals.totalSurchargeAmount).toBe('100000.00');
    expect(totals.totalPassThroughAmount).toBe('600000.00');
  });

  it('phí của cont đã hủy bị loại, trừ phí hủy (CANCELLATION_FEE) vẫn tính là doanh thu', () => {
    const totals = computeOrderTotals(
      [cont('a', '1000000.00'), cont('b', '2000000.00', 'CANCELLED')],
      [
        fee('b', 'PASS_THROUGH', '800000.00'),
        fee('b', 'REVENUE_SURCHARGE', '70000.00', 'DOC_FEE'),
        fee('b', 'REVENUE_SURCHARGE', '300000.00', 'CANCELLATION_FEE'),
      ],
    );
    expect(totals.totalFreightAmount).toBe('1000000.00');
    expect(totals.totalPassThroughAmount).toBe('0.00');
    expect(totals.totalSurchargeAmount).toBe('300000.00');
  });

  it('phí cấp Order (không gắn cont) luôn được tính', () => {
    const totals = computeOrderTotals(
      [cont('a', '1000000.00')],
      [fee(null, 'REVENUE_SURCHARGE', '50000.00'), fee(null, 'PASS_THROUGH', '20000.00')],
    );
    expect(totals.totalSurchargeAmount).toBe('50000.00');
    expect(totals.totalPassThroughAmount).toBe('20000.00');
  });

  it('không dùng số thực: cộng tiền lẻ chính xác', () => {
    const totals = computeOrderTotals(
      [cont('a', '0.10'), cont('b', '0.20'), cont('c', '0.30')],
      [],
    );
    expect(totals.totalFreightAmount).toBe('0.60');
  });

  it('Order không còn cont hoạt động: mọi tổng bằng 0', () => {
    const totals = computeOrderTotals([cont('a', '1000000.00', 'CANCELLED')], []);
    expect(totals).toEqual({
      containerCount: 0,
      totalFreightAmount: '0.00',
      totalSurchargeAmount: '0.00',
      totalPassThroughAmount: '0.00',
    });
  });
});
