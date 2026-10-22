import { z } from 'zod';
import { CALC_BASES, CONTAINER_TYPES, FEE_TARIFF_CATEGORIES, TRIP_MODES } from '../enums';

// Schema zod của bảng giá cước và bảng phí (task 03), dùng chung form, Server Action và import Excel.
// Tiền là chuỗi chuẩn hóa "1234.50" (DECIMAL(18,2)), ngày là chuỗi YYYY-MM-DD theo ngày của tenant.

export const isoDate = z
  .string({ error: 'Nhập ngày theo dạng năm-tháng-ngày.' })
  .trim()
  .refine((value) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, 'Nhập ngày hợp lệ theo dạng năm-tháng-ngày, ví dụ 2026-10-22.');

const optionalDate = z
  .union([isoDate, z.literal(''), z.null()])
  .optional()
  .transform((value) => value || null);

function moneyOf(label: string, { allowZero }: { allowZero: boolean }) {
  return z.union([z.string(), z.number()], { error: `Nhập ${label}.` }).transform((value, ctx) => {
    const text = String(value).trim().replace(/\s/g, '');
    if (!/^\d{1,16}(\.\d{1,2})?$/.test(text)) {
      ctx.addIssue({ code: 'custom', message: `Nhập ${label} là số không âm, tối đa 2 số lẻ.` });
      return z.NEVER;
    }
    const [whole = '0', fraction = ''] = text.split('.');
    const normalized = `${whole.replace(/^0+(?=\d)/, '')}.${fraction.padEnd(2, '0')}`;
    if (!allowZero && Number(normalized) <= 0) {
      ctx.addIssue({ code: 'custom', message: `${label} phải lớn hơn 0.` });
      return z.NEVER;
    }
    return normalized;
  });
}

const vatRate = z
  .union([z.string(), z.number()], { error: 'Nhập thuế VAT, ví dụ 8.' })
  .transform((value, ctx) => {
    const text = String(value).trim().replace(',', '.');
    const number = Number(text);
    if (text === '' || !/^\d{1,3}(\.\d{1,2})?$/.test(text) || number > 100) {
      ctx.addIssue({ code: 'custom', message: 'Thuế VAT là số từ 0 đến 100, tối đa 2 số lẻ.' });
      return z.NEVER;
    }
    return number.toFixed(2);
  });

const optionalVat = z
  .union([vatRate, z.literal(''), z.null()])
  .optional()
  .transform((value) => (value === '' || value === undefined ? null : value));

const id36 = (message: string) => z.string({ error: message }).length(36, message);
const optionalId = z
  .string()
  .length(36, 'Giá trị chọn không hợp lệ.')
  .nullish()
  .transform((value) => value ?? null);

const containerType = z.enum(CONTAINER_TYPES, { error: 'Chọn loại container.' });
const tripMode = z.enum(TRIP_MODES, { error: 'Chọn chế độ chạy.' });

const validityOrder = <T extends { validFrom: string; validTo: string | null }>(
  value: T,
  ctx: z.RefinementCtx,
) => {
  if (value.validTo !== null && value.validTo < value.validFrom) {
    ctx.addIssue({
      code: 'custom',
      path: ['validTo'],
      message: 'Ngày hết hiệu lực phải sau hoặc bằng ngày bắt đầu.',
    });
  }
};

// ---- Giá cước (thu khách)
const freightShape = {
  routeId: id36('Chọn tuyến.'),
  containerType,
  tripMode,
  customerId: optionalId,
  basePrice: moneyOf('giá cước', { allowZero: false }),
  vatRatePercent: vatRate,
  validFrom: isoDate,
  validTo: optionalDate,
};
export const freightTariffInputSchema = z.object(freightShape).superRefine(validityOrder);
export type FreightTariffInput = z.infer<typeof freightTariffInputSchema>;

// ---- Bảng phí
const feeCode = z
  .string({ error: 'Nhập mã phí.' })
  .trim()
  .min(1, 'Nhập mã phí.')
  .max(50, 'Mã phí tối đa 50 ký tự.')
  .transform((value) => value.toUpperCase())
  .refine(
    (value) => /^[A-Z][A-Z0-9_]*$/.test(value),
    'Mã phí viết hoa không dấu, gồm chữ, số, gạch dưới, ví dụ LIFT_FEE.',
  );

const feeShape = {
  routeId: optionalId, // null = áp mọi tuyến
  containerType,
  tripMode,
  customerId: optionalId,
  feeCategory: z.enum(FEE_TARIFF_CATEGORIES, { error: 'Chọn nhóm phí.' }),
  feeCode,
  feeName: z.string().trim().min(1, 'Nhập tên phí.').max(255, 'Tên phí tối đa 255 ký tự.'),
  calcBasis: z.enum(CALC_BASES, { error: 'Chọn cách tính.' }),
  amount: moneyOf('số tiền', { allowZero: true }),
  vatRatePercent: optionalVat,
  isExcluded: z.boolean().default(false),
  validFrom: isoDate,
  validTo: optionalDate,
};
export const feeTariffInputSchema = z
  .object(feeShape)
  .superRefine(validityOrder)
  .superRefine((value, ctx) => {
    if (!value.isExcluded && Number(value.amount) <= 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['amount'],
        message: 'Số tiền phải lớn hơn 0. Muốn miễn phí này cho khách, bật "Miễn phí này".',
      });
    }
  });
export type FeeTariffInput = z.infer<typeof feeTariffInputSchema>;

// ---- Điều chỉnh giá đang hiệu lực: đóng bản cũ, tạo bản mới cùng khóa với giá trị mới từ ngày hiệu lực mới.
export const freightReviseSchema = z
  .object({
    id: id36('Bản ghi không hợp lệ.'),
    basePrice: freightShape.basePrice,
    vatRatePercent: freightShape.vatRatePercent,
    validFrom: freightShape.validFrom,
    validTo: freightShape.validTo,
  })
  .superRefine(validityOrder);
export type FreightReviseInput = z.infer<typeof freightReviseSchema>;

export const feeReviseSchema = z
  .object({
    id: id36('Bản ghi không hợp lệ.'),
    feeName: feeShape.feeName,
    calcBasis: feeShape.calcBasis,
    amount: feeShape.amount,
    vatRatePercent: feeShape.vatRatePercent,
    isExcluded: feeShape.isExcluded,
    validFrom: feeShape.validFrom,
    validTo: feeShape.validTo,
  })
  .superRefine(validityOrder)
  .superRefine((value, ctx) => {
    if (!value.isExcluded && Number(value.amount) <= 0) {
      ctx.addIssue({ code: 'custom', path: ['amount'], message: 'Số tiền phải lớn hơn 0.' });
    }
  });
export type FeeReviseInput = z.infer<typeof feeReviseSchema>;

export const tariffIdSchema = z.object({ id: id36('Bản ghi không hợp lệ.') });
export const tariffCloseSchema = z.object({
  id: id36('Bản ghi không hợp lệ.'),
  validTo: isoDate,
});
export const freightUpdateSchema = z
  .object({ id: id36('Bản ghi không hợp lệ.'), ...freightShape })
  .superRefine(validityOrder);
export const feeUpdateSchema = z
  .object({ id: id36('Bản ghi không hợp lệ.'), ...feeShape })
  .superRefine(validityOrder)
  .superRefine((value, ctx) => {
    if (!value.isExcluded && Number(value.amount) <= 0) {
      ctx.addIssue({ code: 'custom', path: ['amount'], message: 'Số tiền phải lớn hơn 0.' });
    }
  });

export type TariffKind = 'freight' | 'fee';
