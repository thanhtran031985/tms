import { z } from 'zod';
import { CONTAINER_TYPES, ORDER_TYPES, STOP_TYPES, type OrderType } from '../enums';
import { normalizeContainerNo, validateContainerNo } from '../iso6346';
import { moneyOf } from './tariffs';

// Schema zod của Order và container (task 04), dùng chung form, Server Action và service.
// Thời điểm gửi lên là chuỗi ISO 8601 có múi giờ (client đổi giờ nhập theo múi giờ tenant); ra khỏi zod là Date hoặc null.

export const MAX_CONTAINERS_PER_ORDER = 200;

const id36 = (message: string) => z.string({ error: message }).length(36, message);
const optionalId = z
  .string()
  .length(36, 'Giá trị chọn không hợp lệ.')
  .nullish()
  .transform((value) => value ?? null);

const optionalText = (label: string, max: number) =>
  z
    .string()
    .trim()
    .max(max, `${label} tối đa ${max} ký tự.`)
    .nullish()
    .transform((value) => value || null);

const optionalDateTime = z
  .union([
    z.iso.datetime({ offset: true, error: 'Nhập ngày giờ hợp lệ.' }),
    z.literal(''),
    z.null(),
  ])
  .optional()
  .transform((value) => (value ? new Date(value) : null));

function optionalDecimal(label: string, max: number, scale: number) {
  return z
    .union([z.string(), z.number(), z.null()])
    .optional()
    .transform((value, ctx) => {
      if (value === null || value === undefined) return null;
      const text = String(value).trim().replace(',', '.');
      if (text === '') return null;
      const number = Number(text);
      if (!/^\d{1,6}(\.\d{1,2})?$/.test(text) || number > max) {
        ctx.addIssue({
          code: 'custom',
          message: `${label} là số không âm, tối đa ${max}, ${scale} số lẻ.`,
        });
        return z.NEVER;
      }
      return number.toFixed(scale);
    });
}

const containerNoField = z
  .string()
  .nullish()
  .transform((value) => {
    const text = value ? normalizeContainerNo(value) : '';
    return text === '' ? null : text;
  })
  .superRefine((value, ctx) => {
    if (value === null) return;
    const check = validateContainerNo(value);
    if (!check.ok) ctx.addIssue({ code: 'custom', message: check.error });
  });

// ---- Một dòng container
const containerShape = {
  containerNo: containerNoField,
  containerType: z.enum(CONTAINER_TYPES, { error: 'Chọn loại container.' }),
  routeId: optionalId, // null = theo tuyến của Order
  sealNo: optionalText('Số seal', 20),
  cargoWeightTons: optionalDecimal('Khối lượng hàng', 9999.99, 2),
  vgmTons: optionalDecimal('VGM', 9999.99, 2),
  isDangerousGoods: z.boolean().default(false),
  dgClass: optionalText('Loại hàng nguy hiểm', 10),
  reeferSetpointC: z
    .union([z.string(), z.number(), z.null()])
    .optional()
    .transform((value, ctx) => {
      if (value === null || value === undefined || String(value).trim() === '') return null;
      const text = String(value).trim().replace(',', '.');
      const number = Number(text);
      if (!/^-?\d{1,2}(\.\d)?$/.test(text) || number < -40 || number > 40) {
        ctx.addIssue({
          code: 'custom',
          message: 'Nhiệt độ container lạnh từ -40 đến 40 độ C, tối đa 1 số lẻ.',
        });
        return z.NEVER;
      }
      return number.toFixed(1);
    }),
  releaseRefNo: optionalText('Số lệnh cấp rỗng', 50),
  demFreeUntil: optionalDateTime,
  detFreeUntil: optionalDateTime,
};

const dangerousGoodsRule = (
  value: { isDangerousGoods: boolean; dgClass: string | null },
  ctx: z.RefinementCtx,
) => {
  if (value.isDangerousGoods && !value.dgClass) {
    ctx.addIssue({
      code: 'custom',
      path: ['dgClass'],
      message: 'Hàng nguy hiểm phải ghi loại hàng (IMDG).',
    });
  }
};

export const orderContainerInputSchema = z.object(containerShape).superRefine(dangerousGoodsRule);
export type OrderContainerInput = z.infer<typeof orderContainerInputSchema>;

/**
 * Lỗi theo dòng của danh sách container: hàng Nhập phải có số cont, không trùng số trong cùng Order.
 * Dùng chung zod (hiện lỗi dưới ô) và service (chặn gọi trực tiếp).
 */
export function containerRowIssues(
  orderType: OrderType,
  rows: readonly { containerNo: string | null }[],
  existingNumbers: readonly string[] = [],
): { index: number; message: string }[] {
  const issues: { index: number; message: string }[] = [];
  const firstAt = new Map<string, number>();
  const existing = new Set(existingNumbers);
  rows.forEach((row, index) => {
    if (row.containerNo === null) {
      if (orderType === 'IMPORT') {
        issues.push({ index, message: 'Hàng Nhập phải có số container.' });
      }
      return;
    }
    const first = firstAt.get(row.containerNo);
    if (first !== undefined) {
      issues.push({ index, message: `Trùng với dòng ${first + 1} trong Order.` });
    } else if (existing.has(row.containerNo)) {
      issues.push({ index, message: 'Số container này đã có trong Order.' });
    } else {
      firstAt.set(row.containerNo, index);
    }
  });
  return issues;
}

// ---- Tạo Order
const bookingOrBlNo = z
  .string({ error: 'Nhập số Booking hoặc B/L.' })
  .trim()
  .min(1, 'Nhập số Booking hoặc B/L.')
  .max(50, 'Số Booking/B/L tối đa 50 ký tự.')
  .transform((value) => value.toUpperCase());

export const createOrderInputSchema = z
  .object({
    customerId: id36('Chọn khách hàng.'),
    orderType: z.enum(ORDER_TYPES, { error: 'Chọn chiều Nhập, Xuất hoặc Nội địa.' }),
    bookingOrBlNo,
    shippingLineId: optionalId,
    vesselVoyage: optionalText('Tàu/chuyến', 100),
    eta: optionalDateTime,
    etd: optionalDateTime,
    cutOffAt: optionalDateTime,
    customerRef: optionalText('Số tham chiếu của khách', 100),
    routeId: id36('Chọn tuyến.'),
    cargoDescription: optionalText('Mô tả hàng', 255),
    // Địa điểm của các Stop sinh tự động (bỏ trống thì lấy tên vùng của tuyến) và giờ hẹn Stop đầu.
    pickupLocationId: optionalId,
    cargoLocationId: optionalId,
    dropLocationId: optionalId,
    firstStopAt: optionalDateTime,
    containers: z
      .array(orderContainerInputSchema)
      .min(1, 'Thêm ít nhất một container.')
      .max(MAX_CONTAINERS_PER_ORDER, `Một Order tối đa ${MAX_CONTAINERS_PER_ORDER} container.`),
  })
  .superRefine((value, ctx) => {
    for (const issue of containerRowIssues(value.orderType, value.containers)) {
      ctx.addIssue({
        code: 'custom',
        path: ['containers', issue.index, 'containerNo'],
        message: issue.message,
      });
    }
  });
export type CreateOrderInput = z.infer<typeof createOrderInputSchema>;

export const orderIdSchema = z.object({ id: id36('Order không hợp lệ.') });

// ---- Mẫu chuỗi Stop nội địa theo tuyến
export const routeStopTemplateSchema = z.object({
  routeId: id36('Chọn tuyến.'),
  stopTypes: z
    .array(z.enum(STOP_TYPES, { error: 'Chọn loại Stop.' }))
    .min(1, 'Thêm ít nhất một Stop.')
    .max(10, 'Tối đa 10 Stop cho một chuỗi.'),
});

// ---- Xác nhận Order, giá tay. `version` là version của Order đã đọc (khóa lạc quan); lệch trả STALE_DATA.
const version = z.number({ error: 'Thiếu phiên bản dữ liệu.' }).int().min(0);

export const confirmOrderSchema = z.object({
  id: id36('Order không hợp lệ.'),
  version,
});

export const manualPriceSchema = z.object({
  orderId: id36('Order không hợp lệ.'),
  containerId: id36('Container không hợp lệ.'),
  version,
  price: moneyOf('giá cước', { allowZero: false }),
  reason: z
    .string({ error: 'Nhập lý do dùng giá tay.' })
    .trim()
    .min(3, 'Nhập lý do dùng giá tay (ít nhất 3 ký tự).')
    .max(255, 'Lý do tối đa 255 ký tự.'),
});
export type ManualPriceInput = z.infer<typeof manualPriceSchema>;

// ---- Thêm, bớt, hủy container và hủy Order
const reasonField = (label: string) =>
  z
    .string({ error: `Nhập ${label}.` })
    .trim()
    .min(3, `Nhập ${label} (ít nhất 3 ký tự).`)
    .max(255, `${label[0]!.toUpperCase()}${label.slice(1)} tối đa 255 ký tự.`);

// Một dòng container thêm vào Order đã có: như lúc tạo, kèm giá tay tùy chọn khi bảng giá không có.
export const addContainerRowSchema = z
  .object({
    ...containerShape,
    manualPrice: z
      .object({
        price: moneyOf('giá cước', { allowZero: false }),
        reason: reasonField('lý do dùng giá tay'),
      })
      .nullish()
      .transform((value) => value ?? null),
  })
  .superRefine(dangerousGoodsRule);
export type AddContainerRow = z.infer<typeof addContainerRowSchema>;

export const addContainersSchema = z.object({
  id: id36('Order không hợp lệ.'),
  version,
  containers: z
    .array(addContainerRowSchema)
    .min(1, 'Thêm ít nhất một container.')
    .max(MAX_CONTAINERS_PER_ORDER, `Mỗi lần thêm tối đa ${MAX_CONTAINERS_PER_ORDER} container.`),
});
export type AddContainersInput = z.infer<typeof addContainersSchema>;

export const removeContainerSchema = z.object({
  orderId: id36('Order không hợp lệ.'),
  containerId: id36('Container không hợp lệ.'),
  version,
});

export const cancelContainerSchema = z.object({
  orderId: id36('Order không hợp lệ.'),
  containerId: id36('Container không hợp lệ.'),
  version,
  reason: reasonField('lý do hủy'),
  // Bắt buộc và lớn hơn 0 khi container đã chạy một phần (có Stop hoàn thành).
  cancellationFee: z
    .union([moneyOf('phí hủy', { allowZero: false }), z.literal(''), z.null()])
    .optional()
    .transform((value) => value || null),
});
export type CancelContainerInput = z.infer<typeof cancelContainerSchema>;

export const cancelOrderSchema = z.object({
  id: id36('Order không hợp lệ.'),
  version,
  reason: reasonField('lý do hủy'),
  /** Phí hủy theo container đã chạy một phần. */
  fees: z
    .array(
      z.object({
        containerId: id36('Container không hợp lệ.'),
        amount: moneyOf('phí hủy', { allowZero: false }),
      }),
    )
    .max(MAX_CONTAINERS_PER_ORDER)
    .default([]),
});
export type CancelOrderInput = z.infer<typeof cancelOrderSchema>;
