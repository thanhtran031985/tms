import { z } from 'zod';
import {
  DRIVER_EMPLOYMENT_TYPES,
  DRIVER_STATUS,
  TRACTOR_OWNERSHIP,
  TRACTOR_STATUS,
  TRAILER_STATUS,
  TRAILER_TYPES,
} from '../enums';

// Helper chung
const plateNumberOf = (label = 'Biển số') =>
  z
    .string()
    .trim()
    .min(1, `Nhập ${label.toLowerCase()}.`)
    .max(20, `${label} tối đa 20 ký tự.`)
    .transform((value) => value.toUpperCase())
    .refine(
      (value) => /^[0-9]{2}[A-Z0-9.-]{3,15}$/.test(value),
      `${label} không đúng định dạng (vd: 51C-482.17).`,
    );

const requiredText = (max: number, label: string) =>
  z.string().trim().min(1, `Nhập ${label}.`).max(max, `${label} tối đa ${max} ký tự.`);

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

const optionalDateString = z
  .union([z.string(), z.date()])
  .nullish()
  .transform((value) => {
    if (!value) return null;
    if (value instanceof Date) {
      return value.toISOString().slice(0, 10);
    }
    const str = String(value).trim();
    if (!str) return null;
    return str.slice(0, 10);
  });

const decimalString = (precision: number, scale: number, label: string) =>
  z.union([z.string(), z.number()], { error: `Nhập ${label.toLowerCase()}.` }).transform((value, ctx) => {
    const text = String(value).trim().replace(/\s/g, '');
    if (!text || Number.isNaN(Number(text))) {
      ctx.addIssue({ code: 'custom', message: `${label} phải là số hợp lệ.` });
      return z.NEVER;
    }
    const num = Number(text);
    if (num < 0) {
      ctx.addIssue({ code: 'custom', message: `${label} không được âm.` });
      return z.NEVER;
    }
    const [whole = '0', fraction = ''] = text.split('.');
    if (whole.length > precision - scale) {
      ctx.addIssue({ code: 'custom', message: `${label} vượt quá giới hạn cho phép.` });
      return z.NEVER;
    }
    return `${whole}.${fraction.padEnd(scale, '0').slice(0, scale)}`;
  });

const optionalDecimalString = (precision: number, scale: number, label: string) =>
  z.union([z.string(), z.number()]).nullish().transform((value, ctx) => {
    if (value === null || value === undefined) return null;
    const text = String(value).trim().replace(/\s/g, '');
    if (!text) return null;
    if (Number.isNaN(Number(text))) {
      ctx.addIssue({ code: 'custom', message: `${label} phải là số hợp lệ.` });
      return z.NEVER;
    }
    const num = Number(text);
    if (num < 0) {
      ctx.addIssue({ code: 'custom', message: `${label} không được âm.` });
      return z.NEVER;
    }
    const [whole = '0', fraction = ''] = text.split('.');
    if (whole.length > precision - scale) {
      ctx.addIssue({ code: 'custom', message: `${label} vượt quá giới hạn cho phép.` });
      return z.NEVER;
    }
    return `${whole}.${fraction.padEnd(scale, '0').slice(0, scale)}`;
  });

// Schema Đầu kéo
export const tractorInputSchema = z.object({
  plateNumber: plateNumberOf('Biển số đầu kéo'),
  model: optionalText(100, 'Model xe'),
  ownership: z.enum(TRACTOR_OWNERSHIP).default('OWNED'),
  fuelNormLitersPer100km: decimalString(5, 2, 'Định mức dầu cơ sở'),
  currentOdometer: z.number().int('Km phải là số nguyên').min(0, 'Km không được âm').default(0),
  nextMaintenanceOdometer: z.number().int('Km bảo dưỡng phải là số nguyên').min(0).nullish(),
  registrationExpiry: optionalDateString,
  insuranceExpiry: optionalDateString,
  transportBadgeExpiry: optionalDateString,
  permittedGrossWeightTons: optionalDecimalString(6, 2, 'Khối lượng kéo theo cho phép'),
  gpsDeviceId: optionalId,
  status: z.enum(TRACTOR_STATUS).default('AVAILABLE'),
});
export type TractorInput = z.input<typeof tractorInputSchema>;
export type TractorOutput = z.output<typeof tractorInputSchema>;

// Schema Rơ moóc (Rule 1: 20FT không được chở Twin 20)
export const trailerBaseSchema = z.object({
  plateNumber: plateNumberOf('Biển số rơ moóc'),
  trailerType: z.enum(TRAILER_TYPES),
  canCarryTwin20: z.boolean().default(false),
  hasGensetPower: z.boolean().default(false),
  tareWeightTons: optionalDecimalString(5, 2, 'Tự trọng'),
  maxPayloadTons: decimalString(5, 2, 'Tải trọng cho phép'),
  inspectionExpiry: optionalDateString,
  currentLocationId: optionalId,
  currentLocationNote: optionalText(255, 'Ghi chú vị trí'),
  status: z.enum(TRAILER_STATUS).default('AVAILABLE'),
});

export const trailerInputSchema = trailerBaseSchema.refine(
  (data) => !(data.trailerType === '20FT' && data.canCarryTwin20),
  {
    message: 'Rơ moóc 20FT không thể chở 2 cont 20 (canCarryTwin20 phải là false).',
    path: ['canCarryTwin20'],
  },
);
export type TrailerInput = z.input<typeof trailerInputSchema>;
export type TrailerOutput = z.output<typeof trailerInputSchema>;

// Schema Tài xế
export const driverInputSchema = z.object({
  fullName: requiredText(255, 'Họ và tên tài xế'),
  phone: z
    .string()
    .trim()
    .regex(/^[0-9+]{9,15}$/, 'Số điện thoại không đúng định dạng.'),
  nationalIdNo: optionalText(20, 'Số CCCD'),
  licenseNo: optionalText(20, 'Số GPLX'),
  licenseClass: optionalText(10, 'Hạng GPLX'),
  licenseExpiry: optionalDateString,
  dgCertificateNo: optionalText(30, 'Số chứng chỉ hàng nguy hiểm'),
  dgCertificateExpiry: optionalDateString,
  employmentType: z.enum(DRIVER_EMPLOYMENT_TYPES).default('FULL_TIME'),
  status: z.enum(DRIVER_STATUS).default('AVAILABLE'),
});
export type DriverInput = z.input<typeof driverInputSchema>;
export type DriverOutput = z.output<typeof driverInputSchema>;

// Helpers che thông tin cá nhân (PII)
export function maskPhone(phone: string): string {
  const cleaned = phone.trim();
  if (cleaned.length < 6) return cleaned;
  const start = cleaned.slice(0, 3);
  const end = cleaned.slice(-3);
  return `${start}xx xxx ${end}`;
}

export function maskNationalId(id: string): string {
  const cleaned = id.trim();
  if (cleaned.length < 6) return cleaned;
  return `${cleaned.slice(0, 3)}xxxxxx${cleaned.slice(-3)}`;
}

export function maskLicense(no: string): string {
  const cleaned = no.trim();
  if (cleaned.length < 6) return cleaned;
  return `${cleaned.slice(0, 3)}xxxxxx${cleaned.slice(-3)}`;
}

export function maskDriverPII<T extends { phone: string; nationalIdNo?: string | null; licenseNo?: string | null }>(
  driver: T,
  role?: string,
): T {
  const privilegedRoles = ['OWNER', 'ADMIN', 'FLEET_MANAGER'];
  if (role && privilegedRoles.includes(role)) {
    return driver;
  }
  return {
    ...driver,
    phone: maskPhone(driver.phone),
    nationalIdNo: driver.nationalIdNo ? maskNationalId(driver.nationalIdNo) : null,
    licenseNo: driver.licenseNo ? maskLicense(driver.licenseNo) : null,
  };
}
