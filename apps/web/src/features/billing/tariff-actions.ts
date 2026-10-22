'use server';

// Server Action của bảng giá (task 03). Mỗi action dựng bằng defineAction: requireRole → zod → service → Result.
// Service kiểm lại quyền theo vai trò (sửa/đóng giá ĐANG hiệu lực chỉ có pricing.editActive) và chặn chồng lấn trong transaction.
import { rolesFor } from '@core/modules/identity/permissions';
import { ok } from '@shared/result';
import {
  feeReviseSchema,
  feeTariffInputSchema,
  feeUpdateSchema,
  freightReviseSchema,
  freightTariffInputSchema,
  freightUpdateSchema,
  tariffCloseSchema,
  tariffIdSchema,
} from '@shared/schemas/tariffs';
import { z } from 'zod';
import { defineAction } from '@/server';
import { getTariffService } from '@/server/services';

const VIEW = rolesFor('tariff.view');
const WRITE = rolesFor('tariff.write');
const REVISE = rolesFor('pricing.editActive');

const noInput = z.object({});
const kindSchema = z.enum(['freight', 'fee']);
const svc = () => getTariffService();

// ---- Giá cước
export const listFreightTariffs = defineAction(VIEW, noInput, async (ctx) =>
  ok(await svc().listFreight(ctx)),
);
export const createFreightTariff = defineAction(
  WRITE,
  freightTariffInputSchema,
  async (ctx, input) => ok(await svc().createFreight(ctx, input)),
);
export const updateFreightTariff = defineAction(
  WRITE,
  freightUpdateSchema,
  async (ctx, { id, ...input }) => ok(await svc().updateFreight(ctx, id, input)),
);
export const reviseFreightTariff = defineAction(REVISE, freightReviseSchema, async (ctx, input) =>
  ok(await svc().reviseFreight(ctx, input)),
);

// ---- Bảng phí
export const listFeeTariffs = defineAction(VIEW, noInput, async (ctx) =>
  ok(await svc().listFees(ctx)),
);
export const createFeeTariff = defineAction(WRITE, feeTariffInputSchema, async (ctx, input) =>
  ok(await svc().createFee(ctx, input)),
);
export const updateFeeTariff = defineAction(WRITE, feeUpdateSchema, async (ctx, { id, ...input }) =>
  ok(await svc().updateFee(ctx, id, input)),
);
export const reviseFeeTariff = defineAction(REVISE, feeReviseSchema, async (ctx, input) =>
  ok(await svc().reviseFee(ctx, input)),
);

// ---- Dùng cho cả hai bảng
export const closeTariff = defineAction(
  WRITE,
  tariffCloseSchema.extend({ kind: kindSchema }),
  async (ctx, { kind, id, validTo }) => ok(await svc().close(ctx, kind, id, validTo)),
);
export const deactivateTariff = defineAction(
  WRITE,
  tariffIdSchema.extend({ kind: kindSchema }),
  async (ctx, { kind, id }) => ok(await svc().deactivate(ctx, kind, id)),
);

// ---- Import: xác nhận ghi các dòng đã xem trước. Service kiểm tra lại toàn bộ dữ liệu từ client.
export const commitTariffImport = defineAction(
  WRITE,
  z.object({
    kind: kindSchema,
    items: z
      .array(z.object({ rowNumber: z.number().int().min(1), data: z.unknown() }))
      .min(1, 'Không có dòng nào để nhập.')
      .max(2000, 'Tối đa 2000 dòng mỗi lần nhập.'),
  }),
  async (ctx, { kind, items }) => ok(await svc().commitImport(ctx, kind, items)),
);
