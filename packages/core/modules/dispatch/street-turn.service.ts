// Street Turn (đảo vỏ) giữa cont Nhập và cont Xuất (task 08, spec 03 mục 2 Rule 3): liên kết hai chiều, số chấp thuận của hãng tàu,
// chuyển số cont và đồng hồ DET sang cont Xuất, bỏ Stop trả rỗng của cont Nhập, ghi phí Street Turn theo cấu hình tenant.
// Khóa hai dòng container theo id tăng dần; mọi thay đổi ghi audit trong cùng transaction.
import { and, eq, inArray, isNotNull, ne } from 'drizzle-orm';
import { AppError } from '@shared/errors';
import {
  parseDispatchSettings,
  type LinkStreetTurnInput,
  type ListStreetTurnsInput,
  type SetStreetTurnApprovalInput,
  type StreetTurnFeeMode,
} from '@shared/schemas/dispatch';
import { writeAudit } from '../../lib/audit';
import type { RequestContext } from '../../lib/context';
import { isLockContentionError } from '../../lib/db/errors';
import { orderContainers, orderFees, orders, orderStops, shippingLines } from '../../lib/db/schema';
import type { TenantDb } from '../../lib/db/tenant-db';
import { toDbString, toMoney } from '../../lib/money';
import { syncOrderTotals } from '../orders/order-totals';
import type { OrderContainerRow, OrderFeeRow, OrderRow } from '../orders/repo';
import {
  authorize,
  emit,
  invalid,
  LOCK_WAIT_TIMEOUT_SECONDS,
  snapshot,
  type DispatchDeps,
} from './deps';
import { checkStreetTurnPair } from './rules/street-turn';

export type StreetTurnResult = {
  importContainer: OrderContainerRow;
  exportContainer: OrderContainerRow;
  /** Phí Street Turn vừa ghi (null nếu không nhập số tiền hoặc cấu hình tenant là NONE). */
  fee: OrderFeeRow | null;
};

export type StreetTurnItem = {
  importContainerId: string;
  exportContainerId: string;
  importContainerNo: string | null;
  exportContainerNo: string | null;
  importOrderNo: string;
  exportOrderNo: string;
  shippingLineName: string | null;
  approvalRef: string | null;
};

const STREET_TURN_FEE_CODE = 'STREET_TURN_FEE';
const CLOSED_STATUSES = ['CANCELLED', 'COMPLETED'] as const;

/** Khóa các dòng container theo id tăng dần; thiếu hoặc khác tenant: NOT_FOUND. */
async function lockContainerPair(tx: TenantDb, ids: string[]): Promise<Map<string, OrderContainerRow>> {
  const rows = new Map<string, OrderContainerRow>();
  for (const id of [...new Set(ids)].sort()) {
    const [row] = await tx.select(orderContainers, eq(orderContainers.id, id), { forUpdate: true });
    if (!row) throw new AppError('NOT_FOUND');
    rows.set(id, row);
  }
  return rows;
}

/**
 * Ghi phí Street Turn lên Order Xuất: chi hộ hoặc phụ thu theo cấu hình tenant, mã SUY NHẤT theo container Xuất nên nhập lại số
 * tiền chỉ cập nhật dòng cũ (chưa xuất hóa đơn). Cấu hình NONE hoặc không có số tiền: không ghi.
 */
async function writeStreetTurnFee(
  tx: TenantDb,
  ctx: RequestContext,
  input: { exportContainer: OrderContainerRow; exportOrder: OrderRow; amount: string | null | undefined; mode: StreetTurnFeeMode },
): Promise<OrderFeeRow | null> {
  const { exportContainer, exportOrder, amount, mode } = input;
  if (mode === 'NONE' || !amount || Number(amount) <= 0) return null;

  const idempotencyKey = `STREET_TURN:${exportContainer.id}`;
  const dbAmount = toDbString(toMoney(amount));
  const [existing] = await tx.select(orderFees, eq(orderFees.idempotencyKey, idempotencyKey));
  if (existing) {
    if (existing.invoiceId) return existing;
    await tx.update(orderFees, { amount: dbAmount, feeCategory: mode }, eq(orderFees.id, existing.id));
  } else {
    await tx.insert(orderFees, {
      orderId: exportOrder.id,
      orderContainerId: exportContainer.id,
      feeCategory: mode,
      feeCode: STREET_TURN_FEE_CODE,
      source: 'MANUAL',
      idempotencyKey,
      amount: dbAmount,
    });
  }
  await syncOrderTotals(tx, exportOrder.id);
  const [fee] = await tx.select(orderFees, eq(orderFees.idempotencyKey, idempotencyKey));
  await writeAudit(tx, ctx, {
    entity: 'order_fees',
    entityId: fee!.id,
    action: existing ? 'UPDATE' : 'CREATE',
    before: existing ? snapshot(existing) : null,
    after: snapshot(fee!),
  });
  return fee ?? null;
}


export function createStreetTurnService(deps: DispatchDeps) {
  async function run<T>(ctx: RequestContext, work: (tx: TenantDb) => Promise<T>): Promise<T> {
    try {
      return await deps
        .tenantDb(ctx)
        .transaction(work, { lockWaitTimeoutSec: LOCK_WAIT_TIMEOUT_SECONDS });
    } catch (error) {
      if (isLockContentionError(error)) throw new AppError('RESOURCE_BUSY_RETRY');
      throw error;
    }
  }

  async function linkStreetTurn(
    ctx: RequestContext,
    input: LinkStreetTurnInput,
  ): Promise<StreetTurnResult> {
    authorize(ctx, 'dispatch.assign');
    if (input.importContainerId === input.exportContainerId) {
      throw invalid('exportContainerId', 'Chọn hai container khác nhau để đảo vỏ.');
    }
    const settings = parseDispatchSettings(await deps.loadSettings(ctx));

    const result = await run(ctx, async (tx) => {
      const rows = await lockContainerPair(tx, [input.importContainerId, input.exportContainerId]);
      const importRow = rows.get(input.importContainerId)!;
      const exportRow = rows.get(input.exportContainerId)!;

      const orderRows = await tx.select(
        orders,
        inArray(orders.id, [importRow.orderId, exportRow.orderId]),
      );
      const importOrder = orderRows.find((o) => o.id === importRow.orderId);
      const exportOrder = orderRows.find((o) => o.id === exportRow.orderId);
      if (!importOrder || !exportOrder) throw new AppError('NOT_FOUND');
      if (importOrder.orderType !== 'IMPORT') {
        throw invalid('importContainerId', 'Container Nhập phải thuộc Order Nhập.');
      }
      if (exportOrder.orderType !== 'EXPORT') {
        throw invalid('exportContainerId', 'Container Xuất phải thuộc Order Xuất.');
      }
      for (const row of [importRow, exportRow]) {
        if ((CLOSED_STATUSES as readonly string[]).includes(row.status)) {
          throw new AppError('INVALID_STATUS_TRANSITION');
        }
        if (row.linkedContainerId) {
          throw invalid('orderContainerId', 'Container này đã được liên kết Street Turn với container khác.');
        }
      }

      const stops = (
        await tx.select(orderStops, inArray(orderStops.orderContainerId, [importRow.id, exportRow.id]))
      ).filter((s) => s.status !== 'SKIPPED');
      const [line] = importOrder.shippingLineId
        ? await tx.select(shippingLines, eq(shippingLines.id, importOrder.shippingLineId))
        : [];
      const checked = checkStreetTurnPair({
        importSide: {
          container: importRow,
          order: importOrder,
          stops: stops.filter((s) => s.orderContainerId === importRow.id),
        },
        exportSide: {
          container: exportRow,
          order: exportOrder,
          stops: stops.filter((s) => s.orderContainerId === exportRow.id),
        },
        shippingLine: line,
      });
      const blocking = checked.errors[0];
      if (blocking) throw new AppError(blocking.code, blocking.message, blocking.details);

      // Hai chiều: liên kết, chép số cont, đồng hồ DET sang cont Xuất, số chấp thuận (nếu đã có).
      const approvalRef = input.approvalRef ?? null;
      const importSet = {
        linkedContainerId: exportRow.id,
        detFreeUntil: null,
        ...(approvalRef ? { streetTurnApprovalRef: approvalRef } : {}),
        version: importRow.version + 1,
      };
      const exportSet = {
        linkedContainerId: importRow.id,
        containerNo: importRow.containerNo ?? exportRow.containerNo,
        detFreeUntil: importRow.detFreeUntil ?? exportRow.detFreeUntil,
        ...(approvalRef ? { streetTurnApprovalRef: approvalRef } : {}),
        version: exportRow.version + 1,
      };
      await tx.update(orderContainers, importSet, eq(orderContainers.id, importRow.id));
      await tx.update(orderContainers, exportSet, eq(orderContainers.id, exportRow.id));
      for (const [before, set] of [
        [importRow, importSet],
        [exportRow, exportSet],
      ] as const) {
        await writeAudit(tx, ctx, {
          entity: 'order_containers',
          entityId: before.id,
          action: 'STREET_TURN_LINK',
          before: snapshot(before),
          after: { ...snapshot(before), ...set },
        });
      }

      // Cont Nhập không còn trả rỗng: Stop RETURN_EMPTY chưa làm chuyển SKIPPED.
      const skipped = stops.filter(
        (s) =>
          s.orderContainerId === importRow.id && s.stopType === 'RETURN_EMPTY' && s.status === 'PENDING',
      );
      for (const stop of skipped) {
        await tx.update(orderStops, { status: 'SKIPPED' }, eq(orderStops.id, stop.id));
        await writeAudit(tx, ctx, {
          entity: 'order_stops',
          entityId: stop.id,
          action: 'SKIP',
          before: { status: stop.status },
          after: { status: 'SKIPPED', reason: 'STREET_TURN' },
        });
      }

      const fee = approvalRef
        ? await writeStreetTurnFee(tx, ctx, {
            exportContainer: exportRow,
            exportOrder,
            amount: input.feeAmount,
            mode: settings.streetTurnFee,
          })
        : null;

      const [importAfter] = await tx.select(orderContainers, eq(orderContainers.id, importRow.id));
      const [exportAfter] = await tx.select(orderContainers, eq(orderContainers.id, exportRow.id));
      return { importContainer: importAfter!, exportContainer: exportAfter!, fee };
    });

    await emit(deps, {
      type: 'dispatch.updated',
      tenantId: ctx.tenantId,
      tripId: '',
      version: 0,
      orderContainerIds: [result.importContainer.id, result.exportContainer.id],
    });
    return result;
  }

  async function setStreetTurnApproval(
    ctx: RequestContext,
    input: SetStreetTurnApprovalInput,
  ): Promise<StreetTurnResult> {
    authorize(ctx, 'dispatch.assign');
    const settings = parseDispatchSettings(await deps.loadSettings(ctx));

    const result = await run(ctx, async (tx) => {
      const [probe] = await tx.select(orderContainers, eq(orderContainers.id, input.orderContainerId));
      if (!probe) throw new AppError('NOT_FOUND');
      if (!probe.linkedContainerId) {
        throw invalid('orderContainerId', 'Container này chưa liên kết Street Turn.');
      }
      const rows = await lockContainerPair(tx, [probe.id, probe.linkedContainerId]);
      const orderRows = await tx.select(
        orders,
        inArray(orders.id, [...rows.values()].map((r) => r.orderId)),
      );
      const isImport = (row: OrderContainerRow) =>
        orderRows.find((o) => o.id === row.orderId)?.orderType === 'IMPORT';
      const all = [...rows.values()];
      const importRow = all.find(isImport);
      const exportRow = all.find((r) => !isImport(r));
      if (!importRow || !exportRow) throw invalid('orderContainerId', 'Cặp Street Turn không hợp lệ.');

      for (const row of [importRow, exportRow]) {
        await tx.update(
          orderContainers,
          { streetTurnApprovalRef: input.approvalRef, version: row.version + 1 },
          eq(orderContainers.id, row.id),
        );
        await writeAudit(tx, ctx, {
          entity: 'order_containers',
          entityId: row.id,
          action: 'STREET_TURN_APPROVAL',
          before: { streetTurnApprovalRef: row.streetTurnApprovalRef },
          after: { streetTurnApprovalRef: input.approvalRef },
        });
      }
      const exportOrder = orderRows.find((o) => o.id === exportRow.orderId)!;
      const fee = await writeStreetTurnFee(tx, ctx, {
        exportContainer: exportRow,
        exportOrder,
        amount: input.feeAmount,
        mode: settings.streetTurnFee,
      });
      const [importAfter] = await tx.select(orderContainers, eq(orderContainers.id, importRow.id));
      const [exportAfter] = await tx.select(orderContainers, eq(orderContainers.id, exportRow.id));
      return { importContainer: importAfter!, exportContainer: exportAfter!, fee };
    });

    await emit(deps, {
      type: 'dispatch.updated',
      tenantId: ctx.tenantId,
      tripId: '',
      version: 0,
      orderContainerIds: [result.importContainer.id, result.exportContainer.id],
    });
    return result;
  }

  async function listStreetTurns(
    ctx: RequestContext,
    input: ListStreetTurnsInput,
  ): Promise<StreetTurnItem[]> {
    authorize(ctx, 'dispatch.view');
    const tdb = deps.tenantDb(ctx);
    const linked = await tdb.select(
      orderContainers,
      and(isNotNull(orderContainers.linkedContainerId), ne(orderContainers.status, 'CANCELLED')),
    );
    const byId = new Map(linked.map((c) => [c.id, c]));
    const orderRows = linked.length
      ? await tdb.select(orders, inArray(orders.id, [...new Set(linked.map((c) => c.orderId))]))
      : [];
    const orderById = new Map(orderRows.map((o) => [o.id, o]));
    const lineIds = [...new Set(orderRows.map((o) => o.shippingLineId).filter((x): x is string => !!x))];
    const lineRows = lineIds.length
      ? await tdb.select(shippingLines, inArray(shippingLines.id, lineIds))
      : [];
    const lineName = new Map(lineRows.map((l) => [l.id, l.name]));

    const items: StreetTurnItem[] = [];
    for (const imp of linked) {
      const impOrder = orderById.get(imp.orderId);
      const exp = imp.linkedContainerId ? byId.get(imp.linkedContainerId) : undefined;
      const expOrder = exp ? orderById.get(exp.orderId) : undefined;
      if (impOrder?.orderType !== 'IMPORT' || !exp || !expOrder) continue;
      if (input.pendingOnly && imp.streetTurnApprovalRef) continue;
      items.push({
        importContainerId: imp.id,
        exportContainerId: exp.id,
        importContainerNo: imp.containerNo,
        exportContainerNo: exp.containerNo,
        importOrderNo: impOrder.orderNo,
        exportOrderNo: expOrder.orderNo,
        shippingLineName: impOrder.shippingLineId ? (lineName.get(impOrder.shippingLineId) ?? null) : null,
        approvalRef: imp.streetTurnApprovalRef,
      });
    }
    return items.sort((a, b) => (a.importContainerNo ?? '').localeCompare(b.importContainerNo ?? ''));
  }

  return { linkStreetTurn, setStreetTurnApproval, listStreetTurns };
}

