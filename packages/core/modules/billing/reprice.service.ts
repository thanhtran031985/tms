// Tính lại giá khi khóa tra giá của container đổi, ví dụ ghép hoặc tách chuyến (task 08, spec 06 mục 4).
// Service nội bộ cho worker (job `pricing.reprice` và job quét cờ treo), không qua Server Action nên không kiểm role.
// Quy tắc: container chưa gắn hóa đơn và không giá tay thì tra lại giá cước và phụ phí nguồn TARIFF theo `appliedTripMode`,
// ghi audit REPRICE (giá cũ -> mới, tariff cũ -> mới) rồi xóa cờ. Phụ phí MANUAL và DEM/DET không đụng tới.
// Khóa theo thứ tự cùng module Order: dòng Order rồi dòng container.
import { and, eq } from 'drizzle-orm';
import { AppError } from '@shared/errors';
import { writeAudit } from '../../lib/audit';
import type { RequestContext } from '../../lib/context';
import { orderContainers, orderFees, orders, orderStops } from '../../lib/db/schema';
import type { TenantDb } from '../../lib/db/tenant-db';
import { mul, toDbString } from '../../lib/money';
import { createMasterDataRepo } from '../master-data/repo';
import { syncOrderTotals } from '../orders/order-totals';
import type { OrderContainerRow, OrderFeeRow, OrderRow } from '../orders/repo';
import { resolveFees, resolveFreight, tariffDateOf } from './pricing-engine';
import type { FeeTariffRow, FreightTariffRow } from './repo';

export type RepriceOutcome =
  | 'REPRICED'
  | 'UNCHANGED'
  | 'SKIPPED_MANUAL'
  | 'SKIPPED_INVOICED'
  | 'SKIPPED_INACTIVE'
  /** Chỉ trong kết quả quét: tính lại một container báo lỗi (vd. TARIFF_NOT_FOUND), giữ giá và giữ cờ. */
  | 'FAILED';

export type RepriceSnapshot = { amount: string; tariffId: string | null; tripMode: string };

export type RepriceResult = {
  orderContainerId: string;
  outcome: RepriceOutcome;
  before: RepriceSnapshot | null;
  after: RepriceSnapshot | null;
  /** Mã lỗi khi outcome là FAILED. */
  errorCode?: string;
};

export type RepriceServiceOptions = {
  tenantDb: (ctx: RequestContext) => TenantDb;
  now?: () => Date;
};

export type RepriceService = {
  /** Tính lại một container đã đặt cờ `repriceRequired`; chạy lại nhiều lần an toàn. */
  repriceContainer(ctx: RequestContext, input: { orderContainerId: string }): Promise<RepriceResult>;
  /** Quét mọi container còn cờ treo của tenant và tính lại từng cái. */
  repriceFlagged(ctx: RequestContext, input?: { limit?: number }): Promise<RepriceResult[]>;
};

const DEFAULT_SWEEP_LIMIT = 200;

export function createRepriceService(options: RepriceServiceOptions): RepriceService {
  const now = options.now ?? (() => new Date());

  /** Phụ phí TARIFF cần có theo bảng phí mới (bỏ COST_NORM của chuyến và phí theo ngày do job DEM/DET tính). */
  async function targetFees(
    tx: TenantDb,
    key: Parameters<typeof resolveFees>[1],
    distanceKm: number,
  ) {
    const found = await resolveFees(tx, key);
    const fees: FeeTariffRow[] = found.ok
      ? found.data.filter((f) => f.feeCategory !== 'COST_NORM' && f.calcBasis !== 'PER_DAY')
      : [];
    return fees.map((fee) => {
      const perKm = fee.calcBasis === 'PER_KM';
      return {
        fee,
        quantity: perKm ? toDbString(String(distanceKm)) : '1.00',
        amount: perKm ? toDbString(mul(fee.amount, String(distanceKm))) : fee.amount,
      };
    });
  }

  async function reprice(
    ctx: RequestContext,
    tx: TenantDb,
    orderId: string,
    containerId: string,
  ): Promise<RepriceResult> {
    const [order] = await tx.select(orders, eq(orders.id, orderId), { forUpdate: true });
    const [container] = await tx.select(orderContainers, eq(orderContainers.id, containerId), {
      forUpdate: true,
    });
    if (!order || !container) throw new AppError('NOT_FOUND');
    return repriceLocked(ctx, tx, order, container);
  }

  async function repriceLocked(
    ctx: RequestContext,
    tx: TenantDb,
    order: OrderRow,
    container: OrderContainerRow,
  ): Promise<RepriceResult> {
    const result = (outcome: RepriceOutcome, before: RepriceSnapshot | null = null, after: RepriceSnapshot | null = null): RepriceResult => ({
      orderContainerId: container.id,
      outcome,
      before,
      after,
    });
    const clearFlag = async () => {
      await tx.update(
        orderContainers,
        { repriceRequired: false, version: container.version + 1 },
        eq(orderContainers.id, container.id),
      );
    };

    if (container.status === 'CANCELLED') return result('SKIPPED_INACTIVE');
    if (!container.repriceRequired) return result('UNCHANGED');

    const fees = await tx.select(orderFees, eq(orderFees.orderContainerId, container.id));
    // Đã gắn hóa đơn phát hành: giữ giá, giữ cờ để Kế toán tạo yêu cầu điều chỉnh (task 21).
    if (fees.some((f) => f.invoiceId)) return result('SKIPPED_INVOICED');
    // Giá tay do người dùng nhập: không tự đổi; không còn gì chờ tính nên xóa cờ.
    if (container.isManualPrice) {
      await clearFlag();
      return result('SKIPPED_MANUAL');
    }

    const [firstStop] = await tx.select(
      orderStops,
      and(eq(orderStops.orderContainerId, container.id), eq(orderStops.sequenceNo, 1)),
    );
    const orderLevelDate = order.orderType === 'EXPORT' ? order.cutOffAt : order.eta;
    const key = {
      routeId: container.routeId,
      containerType: container.containerType,
      tripMode: container.appliedTripMode,
      customerId: order.customerId,
      targetDate: tariffDateOf(ctx, firstStop?.windowStart ?? orderLevelDate ?? now()),
    };
    const found = await resolveFreight(tx, key);
    if (!found.ok) throw new AppError('TARIFF_NOT_FOUND');
    const tariff: FreightTariffRow = found.data;

    const route = await createMasterDataRepo(tx).routes.get(container.routeId);
    const wanted = await targetFees(tx, key, route?.standardDistanceKm ?? 0);

    const before: RepriceSnapshot = {
      amount: container.baseFreightAmount,
      tariffId: container.freightTariffId,
      tripMode: container.appliedTripMode,
    };
    const after: RepriceSnapshot = {
      amount: tariff.basePrice,
      tariffId: tariff.id,
      tripMode: tariff.tripMode,
    };

    // Phụ phí TARIFF: cập nhật dòng cùng mã, thêm dòng mã mới; không đụng MANUAL, DEM/DET hay hoàn phí.
    let feesChanged = false;
    for (const { fee, quantity, amount } of wanted) {
      const existing = fees.find((f: OrderFeeRow) => f.source === 'TARIFF' && f.feeCode === fee.feeCode);
      if (!existing) {
        await tx.insert(orderFees, {
          orderId: order.id,
          orderContainerId: container.id,
          feeCategory: fee.feeCategory as 'REVENUE_SURCHARGE' | 'PASS_THROUGH',
          feeCode: fee.feeCode,
          source: 'TARIFF',
          sourceTariffId: fee.id,
          idempotencyKey: `CONFIRM:${container.id}:${fee.feeCode}`,
          quantity,
          amount,
          vatRatePercent: fee.vatRatePercent,
          createdBy: ctx.userId,
        });
        feesChanged = true;
      } else if (
        existing.amount !== amount ||
        existing.sourceTariffId !== fee.id ||
        existing.quantity !== quantity
      ) {
        await tx.update(
          orderFees,
          { amount, quantity, sourceTariffId: fee.id, vatRatePercent: fee.vatRatePercent },
          eq(orderFees.id, existing.id),
        );
        feesChanged = true;
      }
    }

    const priceChanged =
      before.amount !== after.amount ||
      before.tariffId !== after.tariffId ||
      before.tripMode !== after.tripMode;
    await tx.update(
      orderContainers,
      {
        baseFreightAmount: tariff.basePrice,
        freightTariffId: tariff.id,
        appliedTripMode: tariff.tripMode,
        repriceRequired: false,
        version: container.version + 1,
      },
      eq(orderContainers.id, container.id),
    );
    if (priceChanged || feesChanged) {
      await syncOrderTotals(tx, order.id);
      await writeAudit(tx, ctx, {
        entity: 'order_containers',
        entityId: container.id,
        action: 'REPRICE',
        before: {
          baseFreightAmount: before.amount,
          freightTariffId: before.tariffId,
          appliedTripMode: before.tripMode,
        },
        after: {
          baseFreightAmount: after.amount,
          freightTariffId: after.tariffId,
          appliedTripMode: after.tripMode,
        },
      });
      return result('REPRICED', before, after);
    }
    return result('UNCHANGED', before, after);
  }

  async function repriceContainer(
    ctx: RequestContext,
    input: { orderContainerId: string },
  ): Promise<RepriceResult> {
    const tdb = options.tenantDb(ctx);
    return tdb.transaction(async (tx) => {
      // Đọc thường để biết Order, rồi khóa Order trước container (cùng thứ tự với module Order).
      const [probe] = await tx.select(orderContainers, eq(orderContainers.id, input.orderContainerId));
      if (!probe) throw new AppError('NOT_FOUND');
      return reprice(ctx, tx, probe.orderId, probe.id);
    });
  }

  async function repriceFlagged(
    ctx: RequestContext,
    input: { limit?: number } = {},
  ): Promise<RepriceResult[]> {
    const flagged = await options
      .tenantDb(ctx)
      .select(orderContainers, eq(orderContainers.repriceRequired, true), {
        limit: input.limit ?? DEFAULT_SWEEP_LIMIT,
      });
    const results: RepriceResult[] = [];
    for (const container of flagged) {
      try {
        results.push(await repriceContainer(ctx, { orderContainerId: container.id }));
      } catch (error) {
        results.push({
          orderContainerId: container.id,
          outcome: 'FAILED',
          before: null,
          after: null,
          errorCode: error instanceof AppError ? error.code : 'INTERNAL_ERROR',
        });
      }
    }
    return results;
  }

  return { repriceContainer, repriceFlagged };
}

