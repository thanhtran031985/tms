import { describe, expect, it } from 'vitest';
import { feeTariffInputSchema, freightTariffInputSchema, isoDate } from '@shared/schemas/tariffs';

const ROUTE = '0190a000-0000-7000-9000-000000000501';
const freight = {
  routeId: ROUTE,
  containerType: '20DC',
  tripMode: 'SINGLE',
  customerId: null,
  basePrice: '1800000',
  vatRatePercent: 8,
  validFrom: '2026-10-22',
  validTo: '',
};
const fee = {
  routeId: null,
  containerType: '20DC',
  tripMode: 'SINGLE',
  feeCategory: 'PASS_THROUGH',
  feeCode: 'lift_fee',
  feeName: 'Phí nâng hạ',
  calcBasis: 'PER_CONTAINER',
  amount: '600000',
  validFrom: '2026-10-22',
};

describe('zod bảng giá', () => {
  it('giá cước: chuẩn hóa tiền 2 số lẻ, VAT 2 số lẻ, validTo rỗng là NULL', () => {
    const ok = freightTariffInputSchema.parse(freight);
    expect(ok.basePrice).toBe('1800000.00');
    expect(ok.vatRatePercent).toBe('8.00');
    expect(ok.validTo).toBeNull();
    expect(ok.customerId).toBeNull();
  });

  it('giá cước không bao giờ bằng 0 hoặc âm, VAT trong 0–100', () => {
    const parse = (extra: Record<string, unknown>) =>
      freightTariffInputSchema.safeParse({ ...freight, ...extra });
    expect(parse({ basePrice: '0' }).success).toBe(false);
    expect(parse({ basePrice: '0.00' }).success).toBe(false);
    expect(parse({ basePrice: '-5' }).success).toBe(false);
    expect(parse({ basePrice: '1.234' }).success).toBe(false);
    expect(parse({ vatRatePercent: 101 }).success).toBe(false);
    expect(parse({ vatRatePercent: 0 }).success).toBe(true);
  });

  it('ngày hợp lệ theo lịch và hết hiệu lực không trước ngày bắt đầu', () => {
    expect(isoDate.safeParse('2026-02-30').success).toBe(false);
    expect(isoDate.safeParse('22/10/2026').success).toBe(false);
    const result = freightTariffInputSchema.safeParse({ ...freight, validTo: '2026-10-21' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['validTo']);
  });

  it('bảng phí: mã phí viết hoa, số tiền > 0 trừ khi miễn phí', () => {
    expect(feeTariffInputSchema.parse(fee).feeCode).toBe('LIFT_FEE');
    expect(feeTariffInputSchema.safeParse({ ...fee, amount: '0' }).success).toBe(false);
    const excluded = feeTariffInputSchema.parse({ ...fee, amount: '0', isExcluded: true });
    expect(excluded.amount).toBe('0.00');
    expect(feeTariffInputSchema.safeParse({ ...fee, feeCode: 'lift fee' }).success).toBe(false);
    expect(
      feeTariffInputSchema.safeParse({ ...fee, feeCategory: 'ON_ROUTE_EXPENSE' }).success,
    ).toBe(false);
  });
});
