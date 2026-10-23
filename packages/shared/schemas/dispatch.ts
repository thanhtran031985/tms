import { z } from 'zod';

// Schema zod của điều vận (task 06), dùng chung Server Action và service.
// Thời điểm gửi lên là chuỗi ISO 8601 có múi giờ (client đổi giờ nhập theo múi giờ tenant); ra khỏi zod là Date.

const id36 = (message: string) => z.string({ error: message }).length(36, message);
const dateTime = (message: string) =>
  z.iso.datetime({ offset: true, error: message }).transform((value) => new Date(value));
// `version` là version của chuyến đã đọc (khóa lạc quan); lệch trả STALE_DATA.
const version = z.number({ error: 'Thiếu phiên bản dữ liệu.' }).int().min(0);

const tripWindow = {
  plannedStart: dateTime('Nhập giờ bắt đầu hợp lệ.'),
  plannedEnd: dateTime('Nhập giờ kết thúc hợp lệ.'),
};
const endAfterStart = (value: { plannedStart: Date; plannedEnd: Date }) =>
  value.plannedEnd > value.plannedStart;
const END_AFTER_START = { message: 'Giờ kết thúc phải sau giờ bắt đầu.', path: ['plannedEnd'] };

export const createSingleTripSchema = z
  .object({
    orderContainerId: id36('Chọn container cần điều.'),
    ...tripWindow,
    /** Bỏ trống thì lấy tuyến của container. */
    routeId: id36('Tuyến không hợp lệ.').nullish(),
  })
  .refine(endAfterStart, END_AFTER_START);
export type CreateSingleTripInput = z.infer<typeof createSingleTripSchema>;

export const updateTripTimesSchema = z
  .object({ tripId: id36('Chuyến không hợp lệ.'), version, ...tripWindow })
  .refine(endAfterStart, END_AFTER_START);
export type UpdateTripTimesInput = z.infer<typeof updateTripTimesSchema>;

export const assignResourcesSchema = z.object({
  tripId: id36('Chuyến không hợp lệ.'),
  version,
  driverId: id36('Chọn tài xế.'),
  tractorId: id36('Chọn đầu kéo.'),
  trailerId: id36('Chọn rơ moóc.'),
  /** Chỉ ADMIN được gửi; vượt giờ lái cho phép mà có lý do thì gán được và ghi audit. */
  overrideDrivingHours: z
    .object({
      reason: z
        .string({ error: 'Nhập lý do ghi đè giờ lái.' })
        .trim()
        .min(1, 'Nhập lý do ghi đè giờ lái.')
        .max(255, 'Lý do tối đa 255 ký tự.'),
    })
    .nullish(),
  /** Xác nhận đã biết container thiếu khối lượng (Rule 2); không có cờ này thì thiếu khối lượng bị chặn. */
  confirmMissingWeight: z.boolean().nullish(),
});
export type AssignResourcesInput = z.infer<typeof assignResourcesSchema>;

export const dispatchTripSchema = z.object({ tripId: id36('Chuyến không hợp lệ.'), version });
export type DispatchTripInput = z.infer<typeof dispatchTripSchema>;

export const cancelAssignmentSchema = z.object({ tripId: id36('Chuyến không hợp lệ.'), version });
export type CancelAssignmentInput = z.infer<typeof cancelAssignmentSchema>;

export const listResourceAvailabilitySchema = z
  .object({
    orderContainerId: id36('Chọn container cần điều.'),
    start: dateTime('Nhập giờ bắt đầu hợp lệ.'),
    end: dateTime('Nhập giờ kết thúc hợp lệ.'),
  })
  .refine((value) => value.end > value.start, {
    message: 'Giờ kết thúc phải sau giờ bắt đầu.',
    path: ['end'],
  });
export type ListResourceAvailabilityInput = z.infer<typeof listResourceAvailabilitySchema>;

// ---- Cảnh báo trả trong `data.warnings` để giao diện hiện đúng lý do (Screen03-Dispatch).
export const WARNING_SEVERITIES = ['info', 'warn', 'danger'] as const;
export const DISPATCH_RESOURCES = ['DRIVER', 'TRACTOR', 'TRAILER', 'CONTAINER', 'TRIP'] as const;
export type DispatchWarning = {
  code: string;
  severity: (typeof WARNING_SEVERITIES)[number];
  resource: (typeof DISPATCH_RESOURCES)[number];
  message: string;
  details?: Record<string, string | number>;
};

// ---- Cấu hình điều vận của tenant, đọc từ tenants.settings (json, chưa tin cậy nên parse bằng zod).
export const DEFAULT_MAX_DRIVING_HOURS_PER_DAY = 10;
/** Cách ghi phí Street Turn do hãng tàu thu (task 08): chi hộ, phụ phí thu khách, hoặc không ghi. */
export const STREET_TURN_FEE_MODES = ['PASS_THROUGH', 'REVENUE_SURCHARGE', 'NONE'] as const;
export type StreetTurnFeeMode = (typeof STREET_TURN_FEE_MODES)[number];
const DEFAULT_DISPATCH_SETTINGS = {
  maxDrivingHoursPerDay: DEFAULT_MAX_DRIVING_HOURS_PER_DAY,
  streetTurnFee: 'PASS_THROUGH' as StreetTurnFeeMode,
};
const tenantDispatchSettingsSchema = z.object({
  dispatch: z
    .object({
      maxDrivingHoursPerDay: z.number().positive().max(24).catch(DEFAULT_MAX_DRIVING_HOURS_PER_DAY),
      streetTurnFee: z.enum(STREET_TURN_FEE_MODES).catch(DEFAULT_DISPATCH_SETTINGS.streetTurnFee),
    })
    .catch(DEFAULT_DISPATCH_SETTINGS),
});
export type TenantDispatchSettings = z.infer<typeof tenantDispatchSettingsSchema>['dispatch'];

/** Giá trị sai kiểu hoặc thiếu thì rơi về mặc định (10 giờ/ngày, phí Street Turn ghi chi hộ). */
export function parseDispatchSettings(raw: unknown): TenantDispatchSettings {
  const parsed = tenantDispatchSettingsSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data.dispatch : DEFAULT_DISPATCH_SETTINGS;
}

// ---- Cấu hình giá của tenant (task 08): có áp giá ghép cho cặp cont cùng khách hay không (spec 06 mục 3).
const tenantPricingSettingsSchema = z.object({
  pricing: z
    .object({ shareTwinDiscountWithCustomer: z.boolean().catch(true) })
    .catch({ shareTwinDiscountWithCustomer: true }),
});
export type TenantPricingSettings = z.infer<typeof tenantPricingSettingsSchema>['pricing'];

/** Thiếu hoặc sai kiểu thì mặc định bật (spec 06 mục 3). */
export function parsePricingSettings(raw: unknown): TenantPricingSettings {
  const parsed = tenantPricingSettingsSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data.pricing : { shareTwinDiscountWithCustomer: true };
}

// ---- Bảng điều vận Kanban (task 07).
const calendarDate = z
  .string({ error: 'Chọn ngày hợp lệ.' })
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Chọn ngày hợp lệ.');

export const getDispatchBoardSchema = z.object({
  /** Ngày dương lịch YYYY-MM-DD theo múi giờ tenant. */
  date: calendarDate,
  zone: z.string().trim().min(1).max(100).nullish(),
  customerId: id36('Khách hàng không hợp lệ.').nullish(),
  direction: z.enum(['IMPORT', 'EXPORT']).nullish(),
  q: z.string().trim().max(100, 'Từ khóa tối đa 100 ký tự.').nullish(),
  /** Tải thêm một cột: gửi kèm `cursor` lấy từ lần trước. Bỏ trống thì tải cả bảng. */
  column: z
    .enum(['WAITING', 'PLANNED', 'DISPATCHED', 'IN_TRANSIT', 'AWAITING_HOOK', 'AWAITING_DOCS'])
    .nullish(),
  cursor: z.string().max(200).nullish(),
});
export type GetDispatchBoardInput = z.infer<typeof getDispatchBoardSchema>;

export const loadBoardCardsSchema = z.object({
  date: calendarDate,
  orderContainerIds: z
    .array(id36('Container không hợp lệ.'))
    .min(1, 'Chọn ít nhất một container.')
    .max(100, 'Tối đa 100 container mỗi lần.'),
});
export type LoadBoardCardsInput = z.infer<typeof loadBoardCardsSchema>;

// ---- Ghép chuyến, tách chuyến và Street Turn (task 08).
export const CONSOLIDATED_TRIP_MODES = ['TWIN_20', 'COMBINED'] as const;
export type ConsolidatedTripMode = (typeof CONSOLIDATED_TRIP_MODES)[number];

const resourceIds = z.object({
  driverId: id36('Chọn tài xế.'),
  tractorId: id36('Chọn đầu kéo.'),
  trailerId: id36('Chọn rơ moóc.'),
});
const moneyAmount = z
  .string({ error: 'Nhập số tiền hợp lệ.' })
  .regex(/^\d{1,16}(\.\d{1,2})?$/, 'Nhập số tiền hợp lệ.');
const approvalRef = z
  .string({ error: 'Nhập số chấp thuận của hãng tàu.' })
  .trim()
  .min(1, 'Nhập số chấp thuận của hãng tàu.')
  .max(50, 'Số chấp thuận tối đa 50 ký tự.');
const consolidatedMode = z.enum(CONSOLIDATED_TRIP_MODES, {
  error: 'Chọn chế độ ghép TWIN_20 hoặc COMBINED.',
});

export const createConsolidatedTripSchema = z
  .object({
    tripMode: consolidatedMode,
    orderContainerIds: z
      .array(id36('Container không hợp lệ.'))
      .length(2, 'Chọn đúng 2 container để ghép.'),
    ...tripWindow,
    routeId: id36('Tuyến không hợp lệ.').nullish(),
    /** Có thì gán luôn trong cùng transaction (khóa và kiểm tra mọi tài nguyên); bỏ trống thì chỉ lập chuyến. */
    resources: resourceIds.nullish(),
    overrideDrivingHours: assignResourcesSchema.shape.overrideDrivingHours,
    confirmMissingWeight: z.boolean().nullish(),
  })
  .refine(endAfterStart, END_AFTER_START);
export type CreateConsolidatedTripInput = z.infer<typeof createConsolidatedTripSchema>;

export const addContainerToTripSchema = z.object({
  tripId: id36('Chuyến không hợp lệ.'),
  version,
  orderContainerId: id36('Chọn container cần ghép thêm.'),
  tripMode: consolidatedMode,
  confirmMissingWeight: z.boolean().nullish(),
});
export type AddContainerToTripInput = z.infer<typeof addContainerToTripSchema>;

export const removeContainerFromTripSchema = z.object({
  tripId: id36('Chuyến không hợp lệ.'),
  version,
  orderContainerId: id36('Chọn container cần tách.'),
  reason: z.string().trim().max(255, 'Lý do tối đa 255 ký tự.').nullish(),
});
export type RemoveContainerFromTripInput = z.infer<typeof removeContainerFromTripSchema>;

export const linkStreetTurnSchema = z.object({
  importContainerId: id36('Chọn container Nhập.'),
  exportContainerId: id36('Chọn container Xuất.'),
  /** Đã có số chấp thuận thì nhập luôn; chưa có thì bổ sung sau bằng setStreetTurnApproval. */
  approvalRef: approvalRef.nullish(),
  feeAmount: moneyAmount.nullish(),
});
export type LinkStreetTurnInput = z.infer<typeof linkStreetTurnSchema>;

export const setStreetTurnApprovalSchema = z.object({
  /** Một trong hai container của cặp Street Turn; số chấp thuận ghi cho cả hai. */
  orderContainerId: id36('Chọn container.'),
  approvalRef,
  feeAmount: moneyAmount.nullish(),
});
export type SetStreetTurnApprovalInput = z.infer<typeof setStreetTurnApprovalSchema>;

export const listStreetTurnsSchema = z.object({ pendingOnly: z.boolean().nullish() });
export type ListStreetTurnsInput = z.infer<typeof listStreetTurnsSchema>;
