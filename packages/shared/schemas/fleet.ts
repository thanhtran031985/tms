import { z } from 'zod';
import {
  DRIVER_EMPLOYMENT_TYPES,
  DRIVER_MANUAL_STATUS,
  MAINTENANCE_ORDER_STATUS,
  MAINTENANCE_ORDER_TYPES,
  TRACTOR_OWNERSHIP,
  TRACTOR_MANUAL_STATUS,
  TRAILER_MANUAL_STATUS,
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
  z
    .union([z.string(), z.number()], { error: `Nhập ${label.toLowerCase()}.` })
    .transform((value, ctx) => {
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
  z
    .union([z.string(), z.number()])
    .nullish()
    .transform((value, ctx) => {
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
const tractorBaseSchema = z.object({
  plateNumber: plateNumberOf('Biển số đầu kéo'),
  model: optionalText(100, 'Model xe'),
  fuelNormLitersPer100km: decimalString(5, 2, 'Định mức dầu cơ sở'),
  nextMaintenanceOdometer: z.number().int('Km bảo dưỡng phải là số nguyên').min(0).nullish(),
  registrationExpiry: optionalDateString,
  insuranceExpiry: optionalDateString,
  transportBadgeExpiry: optionalDateString,
  permittedGrossWeightTons: optionalDecimalString(6, 2, 'Khối lượng kéo theo cho phép'),
  gpsDeviceId: optionalId,
});
// Trường có giá trị mặc định chỉ áp dụng khi tạo; sửa một phần không được tự đặt lại về mặc định.
const tractorDefaultedFields = {
  ownership: z.enum(TRACTOR_OWNERSHIP),
  currentOdometer: z.number().int('Km phải là số nguyên').min(0, 'Km không được âm'),
  status: z.enum(TRACTOR_MANUAL_STATUS),
};
export const tractorInputSchema = tractorBaseSchema.extend({
  ownership: tractorDefaultedFields.ownership.default('OWNED'),
  currentOdometer: tractorDefaultedFields.currentOdometer.default(0),
  status: tractorDefaultedFields.status.default('AVAILABLE'),
});
export const tractorPatchSchema = tractorBaseSchema.extend(tractorDefaultedFields).partial();
export type TractorInput = z.input<typeof tractorInputSchema>;
export type TractorOutput = z.output<typeof tractorInputSchema>;

// Schema Rơ moóc (Rule 1: 20FT không được chở Twin 20)
const trailerBaseSchema = z.object({
  plateNumber: plateNumberOf('Biển số rơ moóc'),
  trailerType: z.enum(TRAILER_TYPES),
  tareWeightTons: optionalDecimalString(5, 2, 'Tự trọng'),
  maxPayloadTons: decimalString(5, 2, 'Tải trọng cho phép'),
  inspectionExpiry: optionalDateString,
  currentLocationId: optionalId,
  currentLocationNote: optionalText(255, 'Ghi chú vị trí'),
});
const trailerDefaultedFields = {
  canCarryTwin20: z.boolean(),
  hasGensetPower: z.boolean(),
  status: z.enum(TRAILER_MANUAL_STATUS),
};
export const trailerPatchSchema = trailerBaseSchema.extend(trailerDefaultedFields).partial();

export const TWIN20_ON_20FT_MESSAGE =
  'Rơ moóc 20FT không thể chở 2 cont 20 (canCarryTwin20 phải là false).';

export const trailerInputSchema = trailerBaseSchema
  .extend({
    canCarryTwin20: trailerDefaultedFields.canCarryTwin20.default(false),
    hasGensetPower: trailerDefaultedFields.hasGensetPower.default(false),
    status: trailerDefaultedFields.status.default('AVAILABLE'),
  })
  .refine((data) => !(data.trailerType === '20FT' && data.canCarryTwin20), {
    message: TWIN20_ON_20FT_MESSAGE,
    path: ['canCarryTwin20'],
  });
export type TrailerInput = z.input<typeof trailerInputSchema>;
export type TrailerOutput = z.output<typeof trailerInputSchema>;

// Schema Tài xế
const driverBaseSchema = z.object({
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
});
const driverDefaultedFields = {
  employmentType: z.enum(DRIVER_EMPLOYMENT_TYPES),
  status: z.enum(DRIVER_MANUAL_STATUS),
};
export const driverInputSchema = driverBaseSchema.extend({
  employmentType: driverDefaultedFields.employmentType.default('FULL_TIME'),
  status: driverDefaultedFields.status.default('AVAILABLE'),
});
export const driverPatchSchema = driverBaseSchema.extend(driverDefaultedFields).partial();
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

export function maskDriverPII<
  T extends { phone: string; nationalIdNo?: string | null; licenseNo?: string | null },
>(driver: T, role?: string): T {
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

// ================= KẾ HOẠCH BẢO DƯỠNG =================
export const maintenancePlanBaseSchema = z.object({
  tractorId: optionalId,
  trailerId: optionalId,
  taskCode: requiredText(50, 'Mã hạng mục bảo dưỡng'),
  intervalKm: z.number().int('Km phải là số nguyên').min(1, 'Km tối thiểu là 1').nullish(),
  intervalDays: z
    .number()
    .int('Số ngày phải là số nguyên')
    .min(1, 'Số ngày tối thiểu là 1')
    .nullish(),
  lastDoneOdometer: z.number().int('Km phải là số nguyên').min(0).nullish(),
  lastDoneAt: optionalDateString,
});

export const maintenancePlanInputSchema = maintenancePlanBaseSchema.refine(
  (data) => Boolean(data.tractorId || data.trailerId),
  {
    message: 'Phải chọn đầu kéo hoặc rơ moóc cho kế hoạch bảo dưỡng.',
    path: ['tractorId'],
  },
);

export type MaintenancePlanInput = z.input<typeof maintenancePlanInputSchema>;
export type MaintenancePlanOutput = z.output<typeof maintenancePlanInputSchema>;

// ================= LỆNH BẢO DƯỠNG =================
export const maintenanceOrderBaseSchema = z.object({
  tractorId: optionalId,
  trailerId: optionalId,
  vendorId: optionalId,
  type: z.enum(MAINTENANCE_ORDER_TYPES),
  odometerAt: z.number().int('Km phải là số nguyên').min(0).nullish(),
  plannedStart: z
    .union([z.string(), z.date()])
    .nullish()
    .transform((v) => (v ? new Date(v) : null)),
  plannedEnd: z
    .union([z.string(), z.date()])
    .nullish()
    .transform((v) => (v ? new Date(v) : null)),
  cost: optionalDecimalString(15, 2, 'Chi phí'),
  currency: z.string().trim().default('VND'),
  status: z.enum(MAINTENANCE_ORDER_STATUS).default('PLANNED'),
});

export const maintenanceOrderInputSchema = maintenanceOrderBaseSchema
  .refine((data) => Boolean(data.tractorId || data.trailerId), {
    message: 'Phải chọn đầu kéo hoặc rơ moóc cho lệnh bảo dưỡng.',
    path: ['tractorId'],
  })
  .refine(
    (data) => {
      if (data.plannedStart && data.plannedEnd) {
        return data.plannedEnd.getTime() > data.plannedStart.getTime();
      }
      return true;
    },
    {
      message: 'Thời gian kết thúc kế hoạch phải sau thời gian bắt đầu.',
      path: ['plannedEnd'],
    },
  );

export type MaintenanceOrderInput = z.input<typeof maintenanceOrderInputSchema>;
export type MaintenanceOrderOutput = z.output<typeof maintenanceOrderInputSchema>;
