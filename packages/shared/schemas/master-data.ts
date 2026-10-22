import { z } from 'zod';
import { LOCATION_TYPES, VENDOR_TYPES } from '../enums';

// Schema zod của 5 danh mục (task 02), dùng chung server và client. Thông báo tiếng Việt, nói rõ cần sửa gì.

const codeOf = (max: number, label = 'Mã') =>
  z
    .string()
    .trim()
    .min(1, `Nhập ${label.toLowerCase()}.`)
    .max(max, `${label} tối đa ${max} ký tự.`)
    .transform((value) => value.toUpperCase())
    .refine(
      (value) => /^[A-Z0-9][A-Z0-9._-]*$/.test(value),
      `${label} chỉ gồm chữ không dấu, số, dấu chấm, gạch ngang, gạch dưới.`,
    );

const requiredText = (max: number, label: string) =>
  z.string().trim().min(1, `Nhập ${label}.`).max(max, `${label} tối đa ${max} ký tự.`);

// Ô tùy chọn: bỏ trống hoặc khoảng trắng thì lưu NULL.
const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} tối đa ${max} ký tự.`)
    .nullish()
    .transform((value) => value || null);

const optionalId = z
  .string()
  .length(36, 'Giá trị chọn không hợp lệ.')
  .nullish()
  .transform((value) => value ?? null);

const paymentTermDays = z
  .number({ error: 'Nhập số ngày, ví dụ 30.' })
  .int('Số ngày phải là số nguyên.')
  .min(0, 'Số ngày không được âm.')
  .max(3650, 'Số ngày tối đa 3650.');

// Tiền VND: chuỗi số không âm tối đa 2 số lẻ, chuẩn hóa thành "1234.50" để lưu DECIMAL(18,2).
const optionalMoney = z
  .union([z.string(), z.number()])
  .nullish()
  .transform((value, ctx) => {
    if (value === null || value === undefined) return null;
    const text = String(value).trim().replace(/\s/g, '');
    if (text === '') return null;
    if (!/^\d{1,16}(\.\d{1,2})?$/.test(text)) {
      ctx.addIssue({ code: 'custom', message: 'Nhập số tiền không âm, tối đa 2 số lẻ.' });
      return z.NEVER;
    }
    const [whole = '0', fraction = ''] = text.split('.');
    return `${whole.replace(/^0+(?=\d)/, '')}.${fraction.padEnd(2, '0')}`;
  });

// Tọa độ lưu DECIMAL(9,6): nhận số hoặc chuỗi, kiểm khoảng, chuẩn hóa 6 số lẻ.
const coordinate = (label: string, min: number, max: number) =>
  z.union([z.string(), z.number()], { error: `Nhập ${label}.` }).transform((value, ctx) => {
    const text = String(value).trim().replace(',', '.');
    const number = Number(text);
    if (text === '' || !/^-?\d+(\.\d+)?$/.test(text) || !Number.isFinite(number)) {
      ctx.addIssue({ code: 'custom', message: `Nhập ${label} bằng số, ví dụ 10.7627.` });
      return z.NEVER;
    }
    if (number < min || number > max) {
      ctx.addIssue({ code: 'custom', message: `${label} phải trong khoảng ${min} đến ${max}.` });
      return z.NEVER;
    }
    return number.toFixed(6);
  });

export const customerInputSchema = z.object({
  code: codeOf(50, 'Mã khách hàng'),
  name: requiredText(255, 'tên khách hàng'),
  taxCode: optionalText(20, 'Mã số thuế'),
  billingAddress: optionalText(500, 'Địa chỉ hóa đơn'),
  paymentTermDays: paymentTermDays.default(30),
  creditLimit: optionalMoney,
});
export type CustomerInput = z.infer<typeof customerInputSchema>;

// Kế toán chỉ sửa các trường thanh toán của khách (ma trận quyền task 02).
export const customerBillingSchema = customerInputSchema.pick({
  taxCode: true,
  billingAddress: true,
  paymentTermDays: true,
  creditLimit: true,
});
export type CustomerBillingInput = z.infer<typeof customerBillingSchema>;

export const shippingLineInputSchema = z.object({
  code: codeOf(20, 'Mã hãng tàu'),
  name: requiredText(255, 'tên hãng tàu'),
  allowsStreetTurn: z.boolean().default(false),
});
export type ShippingLineInput = z.infer<typeof shippingLineInputSchema>;

export const vendorInputSchema = z.object({
  code: codeOf(50, 'Mã nhà cung cấp'),
  name: requiredText(255, 'tên nhà cung cấp'),
  taxCode: optionalText(20, 'Mã số thuế'),
  type: z.enum(VENDOR_TYPES, { error: 'Chọn loại nhà cung cấp.' }),
  paymentTermDays: paymentTermDays.default(30),
});
export type VendorInput = z.infer<typeof vendorInputSchema>;

export const locationInputSchema = z.object({
  code: codeOf(50, 'Mã địa điểm'),
  type: z.enum(LOCATION_TYPES, { error: 'Chọn loại địa điểm.' }),
  name: requiredText(255, 'tên địa điểm'),
  address: optionalText(500, 'Địa chỉ'),
  customerId: optionalId,
  vendorId: optionalId,
  lat: coordinate('Vĩ độ', -90, 90),
  lng: coordinate('Kinh độ', -180, 180),
  geofenceRadiusM: z
    .number({ error: 'Nhập bán kính bằng số mét, ví dụ 300.' })
    .int('Bán kính phải là số nguyên mét.')
    .min(1, 'Bán kính phải lớn hơn 0.')
    .max(100_000, 'Bán kính tối đa 100000 mét.')
    .default(300),
  zone: optionalText(100, 'Khu vực'),
});
export type LocationInput = z.infer<typeof locationInputSchema>;

export const routeInputSchema = z.object({
  routeCode: codeOf(50, 'Mã tuyến'),
  name: requiredText(255, 'tên tuyến'),
  originZone: requiredText(100, 'khu vực đi'),
  destinationZone: requiredText(100, 'khu vực đến'),
  standardDistanceKm: z
    .number({ error: 'Nhập km chuẩn bằng số.' })
    .int('Km chuẩn phải là số nguyên.')
    .min(1, 'Km chuẩn phải lớn hơn 0.')
    .max(100_000, 'Km chuẩn tối đa 100000.'),
});
export type RouteInput = z.infer<typeof routeInputSchema>;

export const ENTITY_KEYS = [
  'customers',
  'shippingLines',
  'vendors',
  'locations',
  'routes',
] as const;
export type EntityKey = (typeof ENTITY_KEYS)[number];

export const idInputSchema = z.object({ id: z.string().length(36, 'Bản ghi không hợp lệ.') });
export type IdInput = z.infer<typeof idInputSchema>;
