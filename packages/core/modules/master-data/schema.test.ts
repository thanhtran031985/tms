import { describe, expect, it } from 'vitest';
import {
  customerInputSchema,
  locationInputSchema,
  routeInputSchema,
  vendorInputSchema,
} from '@shared/schemas/master-data';

const location = { code: 'cl', type: 'PORT', name: 'Cảng Cát Lái', lat: 10.7627, lng: '106.7894' };
const customer = { code: 'A', name: 'A' };

describe('zod danh mục', () => {
  it('mã viết hoa, cắt khoảng trắng, chặn ký tự lạ', () => {
    const ok = customerInputSchema.parse({ code: '  kh-01 ', name: 'Khách' });
    expect(ok.code).toBe('KH-01');
    expect(customerInputSchema.safeParse({ code: 'KH 01', name: 'Khách' }).success).toBe(false);
    expect(customerInputSchema.safeParse({ code: 'KHÁCH', name: 'Khách' }).success).toBe(false);
  });

  it('thiếu tên báo lỗi dưới ô tên', () => {
    const result = customerInputSchema.safeParse({ code: 'KH', name: '   ' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['name']);
  });

  it('khách: hạn thanh toán mặc định 30, không âm, hạn mức chuẩn hóa 2 số lẻ', () => {
    const parse = (extra: Record<string, unknown>) =>
      customerInputSchema.safeParse({ ...customer, ...extra });
    const ok = customerInputSchema.parse({ ...customer, creditLimit: '1500000' });
    expect(ok.paymentTermDays).toBe(30);
    expect(ok.creditLimit).toBe('1500000.00');
    expect(customerInputSchema.parse({ ...customer, creditLimit: '12.5' }).creditLimit).toBe(
      '12.50',
    );
    expect(customerInputSchema.parse({ ...customer, creditLimit: '' }).creditLimit).toBeNull();
    expect(parse({ paymentTermDays: -1 }).success).toBe(false);
    expect(parse({ creditLimit: '-5' }).success).toBe(false);
    expect(parse({ creditLimit: '1.234' }).success).toBe(false);
  });

  it('địa điểm: tọa độ chuẩn hóa 6 số lẻ, bán kính mặc định 300', () => {
    const ok = locationInputSchema.parse(location);
    expect(ok.lat).toBe('10.762700');
    expect(ok.lng).toBe('106.789400');
    expect(ok.geofenceRadiusM).toBe(300);
    expect(ok.customerId).toBeNull();
  });

  it('địa điểm: lat ngoài [-90, 90], lng ngoài [-180, 180], bán kính ≤ 0 bị chặn', () => {
    const parse = (extra: Record<string, unknown>) =>
      locationInputSchema.safeParse({ ...location, ...extra });
    expect(parse({ lat: 90.0001 }).success).toBe(false);
    expect(parse({ lat: -91 }).success).toBe(false);
    expect(parse({ lng: 180.5 }).success).toBe(false);
    expect(parse({ lat: 90, lng: -180 }).success).toBe(true);
    expect(parse({ lat: 'abc' }).success).toBe(false);
    expect(parse({ geofenceRadiusM: 0 }).success).toBe(false);
  });

  it('tuyến: km chuẩn là số nguyên > 0', () => {
    const route = {
      routeCode: 'cl-st',
      name: 'Cát Lái – Sóng Thần',
      originZone: 'Cát Lái',
      destinationZone: 'Sóng Thần',
    };
    expect(routeInputSchema.parse({ ...route, standardDistanceKm: 28 }).routeCode).toBe('CL-ST');
    expect(routeInputSchema.safeParse({ ...route, standardDistanceKm: 0 }).success).toBe(false);
    expect(routeInputSchema.safeParse({ ...route, standardDistanceKm: 2.5 }).success).toBe(false);
  });

  it('nhà cung cấp: loại phải thuộc danh sách', () => {
    expect(vendorInputSchema.safeParse({ code: 'V', name: 'V', type: 'KHAC' }).success).toBe(false);
    expect(vendorInputSchema.parse({ code: 'V', name: 'V', type: 'GARAGE' }).paymentTermDays).toBe(
      30,
    );
  });
});
