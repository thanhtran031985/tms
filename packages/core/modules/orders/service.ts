// Nghiệp vụ Order nhiều container (task 04, TICKET-04): 1 Order = 1 Booking/B/L, container là đơn vị điều vận và tính giá.
// Mọi truy cập DB đi qua TenantDb (ADR-003); mọi thay đổi ghi audit_logs trong cùng transaction (Rule 8).
// Service ném AppError cho lỗi nghiệp vụ; Server Action chuyển thành Result.
import { and, asc, desc, eq, inArray, notInArray } from 'drizzle-orm';
import type { OrderType, StopType } from '@shared/enums';
import { AppError } from '@shared/errors';
import {
  containerRowIssues,
  type CreateOrderInput,
  type AddContainersInput,
  type CancelContainerInput,
  type CancelOrderInput,
  type ManualPriceInput,
} from '@shared/schemas/orders';
import { writeAudit } from '../../lib/audit';
import { listAuditForEntity } from '../../lib/audit/repo';
import type { RequestContext } from '../../lib/context';
import { nextNumber } from '../../lib/db/numbering';
import {
  orderContainers,
  orderFees,
  orders as ordersTable,
  orderStops,
  routeStopTemplates,
} from '../../lib/db/schema';
import type { TenantDb } from '../../lib/db/tenant-db';
import { mul, toDbString, toMoney } from '../../lib/money';
import { toTenantDate } from '../../lib/time';
import type { FeeTariffRow, FreightTariffRow } from '../billing/repo';
import { resolveFees, resolveFreight, tariffDateOf } from '../billing/pricing-engine';
import type { DispatchEvent } from '../../lib/redis/publish';
import type { DetachFromTrips } from '../dispatch/split.service';
import { can } from '../identity/permissions';
import { createMasterDataRepo } from '../master-data/repo';
import {
  createOrderRepo,
  type OrderContainerRow,
  type OrderFeeRow,
  type OrderRow,
  type OrderStopRow,
} from './repo';
import { assertOrderTransition, canCancelContainerFrom } from './state-machine';
import { buildStopPlan, locationRoleOf, type PlaceRef, type StopPlaces } from './stops';
import { CANCELLATION_FEE_CODE, computeOrderTotals } from './totals';

const ORDER_NO_PREFIX = { IMPORT: 'IMP', EXPORT: 'EXP', DOMESTIC: 'DOM' } as const;
const INACTIVE_CONTAINER_STATUSES = ['CANCELLED', 'COMPLETED'] as const;

export type OrderDetail = {
  order: OrderRow;
  /** Theo lineNo. */
  containers: OrderContainerRow[];
  /** Theo thứ tự container rồi sequenceNo. */
  stops: OrderStopRow[];
  fees: OrderFeeRow[];
};

/** Số container đang hoạt động ở Order khác: cảnh báo, không chặn. */
export type DuplicateWarning = { containerNo: string; orderId: string; orderNo: string };

/** Giá dự kiến của một container trong Order nháp; found=false là chưa có bảng giá (phải nhập giá tay). */
export type PricePreview = { found: boolean; amount: string | null; tariffId: string | null };

export type OrderServiceOptions = {
  tenantDb: (ctx: RequestContext) => TenantDb;
  /** Thời điểm hiện tại; thay được trong test để cố định "hôm nay". */
  now?: () => Date;
  /**
   * Gỡ container khỏi chuyến hoạt động khi hủy container hoặc Order (task 08, spec 03 mục 4). Chạy trong transaction hủy;
   * không truyền thì hủy như task 04 (không biết chuyến).
   */
  detachFromTrips?: DetachFromTrips;
  /** Phát các sự kiện `dispatch.updated` do detachFromTrips trả về, SAU khi commit. */
  publishDispatch?: (events: DispatchEvent[]) => Promise<void>;
};

function invalid(field: string, message: string): AppError {
  return new AppError('VALIDATION_ERROR', message, { field });
}

// Ảnh chụp bản ghi cho audit: bỏ mốc thời gian kỹ thuật, giữ nguyên giá trị nghiệp vụ.
function snapshot(row: object): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...row };
  delete copy.createdAt;
  delete copy.updatedAt;
  return copy;
}

function totalsOf(order: OrderRow) {
  return {
    containerCount: order.containerCount,
    totalFreightAmount: order.totalFreightAmount,
    totalSurchargeAmount: order.totalSurchargeAmount,
    totalPassThroughAmount: order.totalPassThroughAmount,
  };
}

export function createOrderService(options: OrderServiceOptions) {
  const now = options.now ?? (() => new Date());

  function authorize(ctx: RequestContext, permission: Parameters<typeof can>[1]) {
    if (!can(ctx.role, permission)) throw new AppError('FORBIDDEN');
  }

  /** Khách, tuyến, hãng tàu, địa điểm phải thuộc tenant và chưa xóa mềm. Trả tuyến và địa điểm đã đọc. */
  async function loadReferences(tx: TenantDb, input: CreateOrderInput) {
    const master = createMasterDataRepo(tx);

    const customer = await master.customers.get(input.customerId);
    if (!customer || customer.deletedAt)
      throw invalid('customerId', 'Không tìm thấy khách hàng này.');

    if (input.shippingLineId) {
      const line = await master.shippingLines.get(input.shippingLineId);
      if (!line || line.deletedAt) throw invalid('shippingLineId', 'Không tìm thấy hãng tàu này.');
    }

    const routes = new Map<string, NonNullable<Awaited<ReturnType<typeof master.routes.get>>>>();
    const routeIds = new Set([
      input.routeId,
      ...input.containers.map((c) => c.routeId ?? input.routeId),
    ]);
    for (const routeId of routeIds) {
      const route = await master.routes.get(routeId);
      const field = routeId === input.routeId ? 'routeId' : 'containers';
      if (!route || route.deletedAt) throw invalid(field, 'Không tìm thấy tuyến này.');
      routes.set(routeId, route);
    }

    const places: StopPlaces = {};
    const pick = async (role: keyof StopPlaces, id: string | null, field: string) => {
      if (!id) return;
      const location = await master.locations.get(id);
      if (!location || location.deletedAt) throw invalid(field, 'Không tìm thấy địa điểm này.');
      places[role] = { id: location.id, name: location.name } satisfies PlaceRef;
    };
    await pick('pickup', input.pickupLocationId, 'pickupLocationId');
    await pick('cargo', input.cargoLocationId, 'cargoLocationId');
    await pick('drop', input.dropLocationId, 'dropLocationId');

    return { routes, places };
  }

  async function findDuplicateWarnings(
    tx: TenantDb,
    numbers: string[],
  ): Promise<DuplicateWarning[]> {
    if (numbers.length === 0) return [];
    const repo = createOrderRepo(tx);
    const rows = await repo.containers.list(
      and(
        inArray(orderContainers.containerNo, numbers),
        notInArray(orderContainers.status, [...INACTIVE_CONTAINER_STATUSES]),
      ),
    );
    if (rows.length === 0) return [];
    const found = await repo.orders.list(
      inArray(ordersTable.id, [...new Set(rows.map((r) => r.orderId))]),
    );
    const orderNoOf = new Map(found.map((o) => [o.id, o.orderNo]));
    return rows.map((row) => ({
      containerNo: row.containerNo!,
      orderId: row.orderId,
      orderNo: orderNoOf.get(row.orderId) ?? '',
    }));
  }

  type RouteRow = NonNullable<
    Awaited<ReturnType<ReturnType<typeof createMasterDataRepo>['routes']['get']>>
  >;

  /** Mẫu Stop nội địa của từng tuyến được dùng; tuyến nào chưa cấu hình thì chặn cả lần ghi. */
  async function loadStopTemplates(
    tx: TenantDb,
    orderType: OrderType,
    orderRouteId: string,
    routes: Map<string, RouteRow>,
  ) {
    const templates = new Map<string, StopType[]>();
    if (orderType !== 'DOMESTIC') return templates;
    const repo = createOrderRepo(tx);
    for (const [routeId, route] of routes) {
      const rows = await repo.stopTemplates.list(eq(routeStopTemplates.routeId, routeId), {
        orderBy: [asc(routeStopTemplates.sequenceNo)],
      });
      if (rows.length === 0) {
        throw invalid(
          routeId === orderRouteId ? 'routeId' : 'containers',
          `Tuyến ${route.routeCode} chưa cấu hình chuỗi Stop nội địa. Cấu hình ở Danh mục, mục Tuyến.`,
        );
      }
      templates.set(
        routeId,
        rows.map((r) => r.stopType),
      );
    }
    return templates;
  }

  async function createOrder(ctx: RequestContext, input: CreateOrderInput) {
    authorize(ctx, 'order.write');
    for (const issue of containerRowIssues(input.orderType, input.containers)) {
      throw invalid(`containers.${issue.index}.containerNo`, issue.message);
    }

    return options.tenantDb(ctx).transaction(async (tx) => {
      const repo = createOrderRepo(tx);
      const { routes, places } = await loadReferences(tx, input);

      const templates = await loadStopTemplates(tx, input.orderType, input.routeId, routes);

      const warnings = await findDuplicateWarnings(
        tx,
        input.containers.flatMap((c) => (c.containerNo ? [c.containerNo] : [])),
      );

      // orderNo: chiều + năm tháng (múi giờ tenant) + số thứ tự riêng theo tenant, chiều và tháng.
      const today = toTenantDate(now(), ctx.timezone);
      const yymm = `${today.slice(2, 4)}${today.slice(5, 7)}`;
      const prefix = ORDER_NO_PREFIX[input.orderType];
      const sequence = await nextNumber(tx, `ORD:${prefix}:${yymm}`);
      const orderNo = `${prefix}-${yymm}-${String(sequence).padStart(3, '0')}`;

      const order = await repo.orders.insert({
        orderNo,
        customerId: input.customerId,
        orderType: input.orderType,
        bookingOrBlNo: input.bookingOrBlNo,
        shippingLineId: input.shippingLineId,
        vesselVoyage: input.vesselVoyage,
        eta: input.eta,
        etd: input.etd,
        cutOffAt: input.cutOffAt,
        customerRef: input.customerRef,
        routeId: input.routeId,
        cargoDescription: input.cargoDescription,
        containerCount: input.containers.length,
        status: 'DRAFT',
        createdBy: ctx.userId,
      });

      const containers = await repo.containers.insertMany(
        input.containers.map((c, index) => ({
          orderId: order.id,
          lineNo: index + 1,
          routeId: c.routeId ?? input.routeId,
          containerNo: c.containerNo,
          sealNo: c.sealNo,
          containerType: c.containerType,
          cargoWeightTons: c.cargoWeightTons,
          vgmTons: c.vgmTons,
          isDangerousGoods: c.isDangerousGoods,
          dgClass: c.isDangerousGoods ? c.dgClass : null,
          reeferSetpointC: c.reeferSetpointC,
          releaseRefNo: c.releaseRefNo,
          demFreeUntil: c.demFreeUntil,
          detFreeUntil: c.detFreeUntil,
          createdBy: ctx.userId,
        })),
      );

      const stopRows = containers.flatMap((container) => {
        const route = routes.get(container.routeId)!;
        const plan = buildStopPlan({
          orderType: input.orderType,
          zones: route,
          template: templates.get(container.routeId),
          places,
        });
        return plan.map((stop) => ({
          orderId: order.id,
          orderContainerId: container.id,
          sequenceNo: stop.sequenceNo,
          stopType: stop.stopType,
          locationId: stop.locationId,
          locationName: stop.locationName,
          windowStart: stop.sequenceNo === 1 ? input.firstStopAt : null,
          createdBy: ctx.userId,
        }));
      });
      await repo.stops.insertMany(stopRows);

      await writeAudit(tx, ctx, {
        entity: 'orders',
        entityId: order.id,
        action: 'CREATE',
        before: null,
        after: {
          ...snapshot(order),
          containers: containers.map((c) => ({
            id: c.id,
            lineNo: c.lineNo,
            containerNo: c.containerNo,
            containerType: c.containerType,
            routeId: c.routeId,
          })),
        },
      });

      // insert chỉ trả lại giá trị đã truyền, thiếu các mặc định của DB (version, status…): đọc lại bản đã lưu.
      return {
        order: (await repo.orders.get(order.id))!,
        containers: await repo.containers.list(eq(orderContainers.orderId, order.id), {
          orderBy: [asc(orderContainers.lineNo)],
        }),
        warnings,
      };
    });
  }

  async function getOrder(ctx: RequestContext, orderId: string): Promise<OrderDetail> {
    authorize(ctx, 'order.view');
    const repo = createOrderRepo(options.tenantDb(ctx));
    const order = await repo.orders.get(orderId);
    if (!order) throw new AppError('NOT_FOUND');

    const [containers, stops, fees] = await Promise.all([
      repo.containers.list(eq(orderContainers.orderId, orderId), {
        orderBy: [asc(orderContainers.lineNo)],
      }),
      repo.stops.list(eq(orderStops.orderId, orderId)),
      repo.fees.list(eq(orderFees.orderId, orderId), {
        orderBy: [asc(orderFees.createdAt)],
      }),
    ]);
    const lineOf = new Map(containers.map((c) => [c.id, c.lineNo]));
    stops.sort(
      (a, b) =>
        (lineOf.get(a.orderContainerId) ?? 0) - (lineOf.get(b.orderContainerId) ?? 0) ||
        a.sequenceNo - b.sequenceNo,
    );
    return { order, containers, stops, fees };
  }

  /** Danh sách Order của tenant (mới nhất trước) kèm container, cho màn danh sách. Lọc và đếm làm ở client. */
  async function listOrders(
    ctx: RequestContext,
  ): Promise<{ order: OrderRow; containers: OrderContainerRow[] }[]> {
    authorize(ctx, 'order.view');
    const repo = createOrderRepo(options.tenantDb(ctx));
    const [orders, containers] = await Promise.all([
      repo.orders.list(undefined, {
        orderBy: [desc(ordersTable.createdAt), desc(ordersTable.orderNo)],
      }),
      repo.containers.list(undefined, { orderBy: [asc(orderContainers.lineNo)] }),
    ]);
    const byOrder = new Map<string, OrderContainerRow[]>();
    for (const container of containers) {
      const list = byOrder.get(container.orderId) ?? [];
      list.push(container);
      byOrder.set(container.orderId, list);
    }
    return orders.map((order) => ({ order, containers: byOrder.get(order.id) ?? [] }));
  }

  /**
   * Giá dự kiến cho container của Order NHÁP (chưa chốt giá): tra Pricing Engine nhưng không ghi gì, để màn hình hiện giá dự kiến
   * hoặc "Chưa có giá" trước khi xác nhận. Order đã xác nhận đã có giá chốt nên không nằm trong kết quả.
   */
  async function previewPrices(
    ctx: RequestContext,
    orderIds: string[],
  ): Promise<Record<string, PricePreview>> {
    authorize(ctx, 'order.view');
    if (orderIds.length === 0) return {};
    const tdb = options.tenantDb(ctx);
    const repo = createOrderRepo(tdb);
    const drafts = await repo.orders.list(
      and(inArray(ordersTable.id, orderIds), eq(ordersTable.status, 'DRAFT')),
    );
    if (drafts.length === 0) return {};
    const ids = drafts.map((o) => o.id);
    const [containers, firstStops] = await Promise.all([
      repo.containers.list(inArray(orderContainers.orderId, ids)),
      repo.stops.list(and(inArray(orderStops.orderId, ids), eq(orderStops.sequenceNo, 1))),
    ]);
    const windowOf = new Map(firstStops.map((s) => [s.orderContainerId, s.windowStart]));
    const orderOf = new Map(drafts.map((o) => [o.id, o]));

    const memo = new Map<string, Promise<PricePreview>>();
    const result: Record<string, PricePreview> = {};
    for (const container of containers) {
      if (container.status === 'CANCELLED') continue;
      if (container.isManualPrice) {
        result[container.id] = { found: true, amount: container.baseFreightAmount, tariffId: null };
        continue;
      }
      const order = orderOf.get(container.orderId)!;
      const key = {
        routeId: container.routeId,
        containerType: container.containerType,
        tripMode: 'SINGLE' as const,
        customerId: order.customerId,
        targetDate: tariffDateOf(
          ctx,
          windowOf.get(container.id) ??
            (order.orderType === 'EXPORT' ? order.cutOffAt : order.eta) ??
            now(),
        ),
      };
      const memoKey = JSON.stringify(key);
      let lookup = memo.get(memoKey);
      if (!lookup) {
        lookup = resolveFreight(tdb, key).then((found) =>
          found.ok
            ? { found: true, amount: found.data.basePrice, tariffId: found.data.id }
            : { found: false, amount: null, tariffId: null },
        );
        memo.set(memoKey, lookup);
      }
      result[container.id] = await lookup;
    }
    return result;
  }

  /** Lịch sử thay đổi của Order từ audit_logs (mới nhất trước). */
  async function getOrderHistory(ctx: RequestContext, orderId: string) {
    authorize(ctx, 'order.view');
    const tdb = options.tenantDb(ctx);
    if (!(await createOrderRepo(tdb).orders.get(orderId))) throw new AppError('NOT_FOUND');
    return listAuditForEntity(tdb, 'orders', orderId);
  }

  /** Chuỗi Stop nội địa của một tuyến; rỗng nếu chưa cấu hình. */
  async function getRouteStopTemplate(
    ctx: RequestContext,
    routeId: string,
  ): Promise<OrderStopRow['stopType'][]> {
    authorize(ctx, 'masterData.view');
    const repo = createOrderRepo(options.tenantDb(ctx));
    const rows = await repo.stopTemplates.list(eq(routeStopTemplates.routeId, routeId), {
      orderBy: [asc(routeStopTemplates.sequenceNo)],
    });
    return rows.map((row) => row.stopType);
  }

  /** Mẫu Stop nội địa của mọi tuyến đã cấu hình: tuyến → chuỗi Stop theo thứ tự. */
  async function listRouteStopTemplates(
    ctx: RequestContext,
  ): Promise<Record<string, OrderStopRow['stopType'][]>> {
    authorize(ctx, 'masterData.view');
    const repo = createOrderRepo(options.tenantDb(ctx));
    const rows = await repo.stopTemplates.list(undefined, {
      orderBy: [asc(routeStopTemplates.routeId), asc(routeStopTemplates.sequenceNo)],
    });
    const byRoute: Record<string, OrderStopRow['stopType'][]> = {};
    for (const row of rows) (byRoute[row.routeId] ??= []).push(row.stopType);
    return byRoute;
  }

  /** Cảnh báo số container đang hoạt động ở Order khác (Order này không tính). */
  async function getContainerWarnings(
    ctx: RequestContext,
    orderId: string,
  ): Promise<DuplicateWarning[]> {
    authorize(ctx, 'order.view');
    const tdb = options.tenantDb(ctx);
    const repo = createOrderRepo(tdb);
    if (!(await repo.orders.get(orderId))) throw new AppError('NOT_FOUND');
    const own = await repo.containers.list(eq(orderContainers.orderId, orderId));
    const numbers = own.flatMap((c) =>
      c.status !== 'CANCELLED' && c.containerNo ? [c.containerNo] : [],
    );
    return (await findDuplicateWarnings(tdb, numbers)).filter((w) => w.orderId !== orderId);
  }

  /** Thay chuỗi Stop nội địa của tuyến. Order đã tạo giữ nguyên Stop của chúng. */
  async function setRouteStopTemplate(
    ctx: RequestContext,
    routeId: string,
    stopTypes: readonly OrderStopRow['stopType'][],
  ): Promise<{ stopTypes: OrderStopRow['stopType'][] }> {
    authorize(ctx, 'masterData.write');
    if (stopTypes.length === 0) throw invalid('stopTypes', 'Chuỗi Stop phải có ít nhất một Stop.');

    return options.tenantDb(ctx).transaction(async (tx) => {
      const route = await createMasterDataRepo(tx).routes.get(routeId);
      if (!route || route.deletedAt) throw invalid('routeId', 'Không tìm thấy tuyến này.');

      const repo = createOrderRepo(tx);
      const before = (
        await repo.stopTemplates.list(eq(routeStopTemplates.routeId, routeId), {
          orderBy: [asc(routeStopTemplates.sequenceNo)],
        })
      ).map((row) => row.stopType);
      await repo.stopTemplates.removeWhere(eq(routeStopTemplates.routeId, routeId));
      await repo.stopTemplates.insertMany(
        stopTypes.map((stopType, index) => ({
          routeId,
          sequenceNo: index + 1,
          stopType,
          createdBy: ctx.userId,
        })),
      );
      await writeAudit(tx, ctx, {
        entity: 'route_stop_templates',
        entityId: routeId,
        action: 'UPDATE',
        before: { stopTypes: before },
        after: { stopTypes: [...stopTypes] },
      });
      return { stopTypes: [...stopTypes] };
    });
  }

  /** Khóa dòng Order (SELECT … FOR UPDATE) rồi kiểm version: lệch thì STALE_DATA. */
  async function lockOrder(tx: TenantDb, orderId: string, version: number): Promise<OrderRow> {
    const [row] = await tx.select(ordersTable, eq(ordersTable.id, orderId), { forUpdate: true });
    if (!row) throw new AppError('NOT_FOUND');
    if (row.version !== version) throw new AppError('STALE_DATA');
    return row;
  }

  /** Tính lại tổng từ container và phí, ghi vào Order cùng version mới. Trả Order sau khi ghi. */
  async function saveTotals(
    tx: TenantDb,
    order: OrderRow,
    extra: Partial<Pick<OrderRow, 'status' | 'cancelReason'>> = {},
  ): Promise<OrderRow> {
    const repo = createOrderRepo(tx);
    const [containers, fees] = await Promise.all([
      repo.containers.list(eq(orderContainers.orderId, order.id)),
      repo.fees.list(eq(orderFees.orderId, order.id)),
    ]);
    const totals = computeOrderTotals(containers, fees);
    const changed = await repo.orders.updateWhere(
      and(eq(ordersTable.id, order.id), eq(ordersTable.version, order.version))!,
      { ...totals, ...extra, version: order.version + 1 },
    );
    if (changed !== 1) throw new AppError('STALE_DATA');
    return (await repo.orders.get(order.id))!;
  }

  type PricedContainer = {
    container: OrderContainerRow;
    /** Không có khi container đã có giá tay: giữ giá tay, chỉ tra phụ phí. */
    tariff?: FreightTariffRow;
    fees: FeeTariffRow[];
    distanceKm: number;
  };

  /**
   * Tra giá cước (SINGLE) và phụ phí thu khách cho từng container bằng Pricing Engine. Còn container chưa có giá và chưa có giá tay
   * thì PRICE_MISSING kèm các dòng thiếu (ADR-005, không bao giờ để 0). Ngày tra giá: ngày của Stop đầu theo kế hoạch; chưa hẹn thì
   * ETA (Nhập, Nội địa) hoặc cut-off (Xuất); cuối cùng là hôm nay, tất cả theo múi giờ tenant.
   */
  async function priceContainers(
    tx: TenantDb,
    ctx: RequestContext,
    order: OrderRow,
    containers: OrderContainerRow[],
  ): Promise<PricedContainer[]> {
    const repo = createOrderRepo(tx);
    const master = createMasterDataRepo(tx);
    const firstStops = new Map(
      (
        await repo.stops.list(and(eq(orderStops.orderId, order.id), eq(orderStops.sequenceNo, 1)))
      ).map((s) => [s.orderContainerId, s.windowStart]),
    );
    const orderLevelDate = order.orderType === 'EXPORT' ? order.cutOffAt : order.eta;

    const priced: PricedContainer[] = [];
    const missing: number[] = [];
    for (const container of containers) {
      const key = {
        routeId: container.routeId,
        containerType: container.containerType,
        tripMode: 'SINGLE' as const,
        customerId: order.customerId,
        targetDate: tariffDateOf(ctx, firstStops.get(container.id) ?? orderLevelDate ?? now()),
      };
      let tariff: FreightTariffRow | undefined;
      if (!container.isManualPrice) {
        const found = await resolveFreight(tx, key);
        if (!found.ok) {
          missing.push(container.lineNo);
          continue;
        }
        tariff = found.data;
      }
      // Chỉ phí thu khách vào order_fees; chi phí định mức (COST_NORM) thuộc chuyến.
      const feeResult = await resolveFees(tx, key);
      const fees = feeResult.ok ? feeResult.data.filter((f) => f.feeCategory !== 'COST_NORM') : [];
      const route = await master.routes.get(container.routeId);
      priced.push({ container, tariff, fees, distanceKm: route?.standardDistanceKm ?? 0 });
    }
    if (missing.length > 0) {
      throw new AppError('PRICE_MISSING', undefined, {
        lines: missing.join(','),
        count: missing.length,
      });
    }
    return priced;
  }

  /** Chốt giá (snapshot) vào container và ghi phụ phí thu khách vào order_fees. */
  async function applyPricing(
    tx: TenantDb,
    ctx: RequestContext,
    order: OrderRow,
    priced: PricedContainer[],
  ) {
    const repo = createOrderRepo(tx);
    for (const { container, tariff, fees, distanceKm } of priced) {
      await repo.containers.update(container.id, {
        ...(tariff
          ? {
              baseFreightAmount: tariff.basePrice,
              freightTariffId: tariff.id,
              appliedTripMode: 'SINGLE' as const,
              isManualPrice: false,
            }
          : {}),
        version: container.version + 1,
      });
      const rows = fees.flatMap((fee) => {
        // Phí theo ngày (DEM/DET, lưu bãi) cần số ngày thực tế nên do job riêng tính (task 18).
        if (fee.calcBasis === 'PER_DAY') return [];
        const perKm = fee.calcBasis === 'PER_KM';
        return [
          {
            orderId: order.id,
            orderContainerId: container.id,
            feeCategory: fee.feeCategory as 'REVENUE_SURCHARGE' | 'PASS_THROUGH',
            feeCode: fee.feeCode,
            source: 'TARIFF' as const,
            sourceTariffId: fee.id,
            idempotencyKey: `CONFIRM:${container.id}:${fee.feeCode}`,
            quantity: perKm ? toDbString(String(distanceKm)) : '1.00',
            amount: perKm ? toDbString(mul(fee.amount, String(distanceKm))) : fee.amount,
            vatRatePercent: fee.vatRatePercent,
            createdBy: ctx.userId,
          },
        ];
      });
      await repo.fees.insertMany(rows);
    }
  }

  /**
   * Xác nhận Order nháp: tra giá riêng từng container (Pricing Engine, SINGLE), chốt giá và phụ phí thu khách (snapshot).
   * Tất cả hoặc không gì: còn container chưa có giá và chưa có giá tay thì PRICE_MISSING, không ghi gì (ADR-005, không bao giờ 0).
   */
  async function confirmOrder(ctx: RequestContext, input: { id: string; version: number }) {
    authorize(ctx, 'order.write');

    return options.tenantDb(ctx).transaction(async (tx) => {
      const order = await lockOrder(tx, input.id, input.version);
      assertOrderTransition(order.status, 'CONFIRMED');

      const repo = createOrderRepo(tx);
      const containers = (
        await repo.containers.list(eq(orderContainers.orderId, order.id), {
          orderBy: [asc(orderContainers.lineNo)],
        })
      ).filter((c) => c.status !== 'CANCELLED');
      if (containers.length === 0) {
        throw invalid('containers', 'Order chưa có container nào để xác nhận.');
      }
      const priced = await priceContainers(tx, ctx, order, containers);
      await applyPricing(tx, ctx, order, priced);

      const updated = await saveTotals(tx, order, { status: 'CONFIRMED' });
      const after = await repo.containers.list(eq(orderContainers.orderId, order.id), {
        orderBy: [asc(orderContainers.lineNo)],
      });
      const savedFees = await repo.fees.list(eq(orderFees.orderId, order.id));
      await writeAudit(tx, ctx, {
        entity: 'orders',
        entityId: order.id,
        action: 'CONFIRM',
        before: { status: order.status, version: order.version, ...totalsOf(order) },
        after: {
          status: updated.status,
          version: updated.version,
          ...totalsOf(updated),
          containers: after
            .filter((c) => c.status !== 'CANCELLED')
            .map((c) => ({
              id: c.id,
              lineNo: c.lineNo,
              baseFreightAmount: c.baseFreightAmount,
              freightTariffId: c.freightTariffId,
              isManualPrice: c.isManualPrice,
            })),
          feeCount: savedFees.length,
        },
      });
      return { order: updated, containers: after, fees: savedFees };
    });
  }

  /** Giá tay cho container không có bảng giá: lớn hơn 0, lý do bắt buộc, ghi audit MANUAL_PRICE. */
  async function setManualPrice(ctx: RequestContext, input: ManualPriceInput) {
    authorize(ctx, 'order.manualPrice');
    const reason = input.reason.trim();
    if (!toMoney(input.price).greaterThan(0)) {
      throw invalid('price', 'Giá tay phải lớn hơn 0.');
    }
    if (reason.length < 3) throw invalid('reason', 'Nhập lý do dùng giá tay.');
    const price = toDbString(input.price);

    return options.tenantDb(ctx).transaction(async (tx) => {
      const order = await lockOrder(tx, input.orderId, input.version);
      if (['CANCELLED', 'DELIVERED', 'RECONCILED', 'INVOICED'].includes(order.status)) {
        throw new AppError('INVALID_STATUS_TRANSITION');
      }
      const repo = createOrderRepo(tx);
      const container = await repo.containers.get(input.containerId);
      if (!container || container.orderId !== order.id) throw new AppError('NOT_FOUND');
      if (['CANCELLED', 'DELIVERED', 'COMPLETED'].includes(container.status)) {
        throw new AppError('INVALID_STATUS_TRANSITION');
      }

      await repo.containers.update(container.id, {
        baseFreightAmount: price,
        isManualPrice: true,
        freightTariffId: null,
        version: container.version + 1,
      });
      const updated = await saveTotals(tx, order);
      await writeAudit(tx, ctx, {
        entity: 'orders',
        entityId: order.id,
        action: 'MANUAL_PRICE',
        before: {
          containerId: container.id,
          price: container.baseFreightAmount,
          isManualPrice: container.isManualPrice,
          freightTariffId: container.freightTariffId,
        },
        after: {
          containerId: container.id,
          lineNo: container.lineNo,
          containerNo: container.containerNo,
          price,
          reason,
        },
      });
      return { order: updated, container: (await repo.containers.get(container.id))! };
    });
  }

  // Order còn nhận thêm, bớt, hủy container: chưa giao xong, chưa đối soát, chưa hủy.
  const OPEN_ORDER_STATUSES = ['DRAFT', 'CONFIRMED', 'IN_PROGRESS', 'PARTIALLY_DELIVERED'];

  function assertOpen(order: OrderRow) {
    if (!OPEN_ORDER_STATUSES.includes(order.status)) {
      throw new AppError('INVALID_STATUS_TRANSITION');
    }
  }

  async function containerOfOrder(tx: TenantDb, order: OrderRow, containerId: string) {
    const container = await createOrderRepo(tx).containers.get(containerId);
    if (!container || container.orderId !== order.id) throw new AppError('NOT_FOUND');
    return container;
  }

  /**
   * Thêm container vào Order đã có. Order đã xác nhận thì cont mới được tra giá và chốt ngay (thiếu giá và không có giá tay:
   * PRICE_MISSING, không thêm gì). Stop sinh theo loại đơn, sao chép địa điểm và giờ hẹn từ container đầu tiên của Order.
   */
  async function addContainers(ctx: RequestContext, input: AddContainersInput) {
    authorize(ctx, 'order.write');

    return options.tenantDb(ctx).transaction(async (tx) => {
      const order = await lockOrder(tx, input.id, input.version);
      assertOpen(order);
      const repo = createOrderRepo(tx);
      const master = createMasterDataRepo(tx);

      const existing = await repo.containers.list(eq(orderContainers.orderId, order.id), {
        orderBy: [asc(orderContainers.lineNo)],
      });
      const liveNumbers = existing.flatMap((c) =>
        c.status !== 'CANCELLED' && c.containerNo ? [c.containerNo] : [],
      );
      for (const issue of containerRowIssues(order.orderType, input.containers, liveNumbers)) {
        throw invalid(`containers.${issue.index}.containerNo`, issue.message);
      }

      const routes = new Map<string, RouteRow>();
      for (const [index, row] of input.containers.entries()) {
        const routeId = row.routeId ?? order.routeId;
        if (routes.has(routeId)) continue;
        const route = await master.routes.get(routeId);
        if (!route || route.deletedAt) {
          throw invalid(`containers.${index}.routeId`, 'Không tìm thấy tuyến này.');
        }
        routes.set(routeId, route);
      }
      const templates = await loadStopTemplates(tx, order.orderType, order.routeId, routes);

      // Địa điểm và giờ hẹn lấy theo container đầu tiên của Order (cùng một Booking/B/L, cùng điểm lấy và giao).
      const allStops = await repo.stops.list(eq(orderStops.orderId, order.id));
      const modelId = existing[0]?.id;
      const modelStops = allStops
        .filter((s) => s.orderContainerId === modelId)
        .sort((a, b) => a.sequenceNo - b.sequenceNo);
      const places: StopPlaces = {};
      for (const stop of modelStops) {
        if (stop.locationId) {
          places[locationRoleOf(stop.stopType)] = { id: stop.locationId, name: stop.locationName };
        }
      }
      const firstStopAt = modelStops[0]?.windowStart ?? null;

      const warnings = await findDuplicateWarnings(
        tx,
        input.containers.flatMap((c) => (c.containerNo ? [c.containerNo] : [])),
      );

      const lastLine = existing.reduce((max, c) => Math.max(max, c.lineNo), 0);
      const inserted = await repo.containers.insertMany(
        input.containers.map((c, index) => ({
          orderId: order.id,
          lineNo: lastLine + index + 1,
          routeId: c.routeId ?? order.routeId,
          containerNo: c.containerNo,
          sealNo: c.sealNo,
          containerType: c.containerType,
          cargoWeightTons: c.cargoWeightTons,
          vgmTons: c.vgmTons,
          isDangerousGoods: c.isDangerousGoods,
          dgClass: c.isDangerousGoods ? c.dgClass : null,
          reeferSetpointC: c.reeferSetpointC,
          releaseRefNo: c.releaseRefNo,
          demFreeUntil: c.demFreeUntil,
          detFreeUntil: c.detFreeUntil,
          ...(c.manualPrice
            ? { baseFreightAmount: toDbString(c.manualPrice.price), isManualPrice: true }
            : {}),
          createdBy: ctx.userId,
        })),
      );
      const newIds = inserted.map((c) => c.id);
      const insertedRows = await repo.containers.list(inArray(orderContainers.id, newIds), {
        orderBy: [asc(orderContainers.lineNo)],
      });

      await repo.stops.insertMany(
        insertedRows.flatMap((container) =>
          buildStopPlan({
            orderType: order.orderType,
            zones: routes.get(container.routeId)!,
            template: templates.get(container.routeId),
            places,
          }).map((stop) => ({
            orderId: order.id,
            orderContainerId: container.id,
            sequenceNo: stop.sequenceNo,
            stopType: stop.stopType,
            locationId: stop.locationId,
            locationName: stop.locationName,
            windowStart: stop.sequenceNo === 1 ? firstStopAt : null,
            createdBy: ctx.userId,
          })),
        ),
      );

      // Order nháp chốt giá lúc xác nhận; đã xác nhận thì cont mới phải có giá ngay.
      if (order.status !== 'DRAFT') {
        await applyPricing(tx, ctx, order, await priceContainers(tx, ctx, order, insertedRows));
      }

      const reopened = order.status === 'PARTIALLY_DELIVERED';
      if (reopened) assertOrderTransition(order.status, 'IN_PROGRESS');
      const updated = await saveTotals(tx, order, reopened ? { status: 'IN_PROGRESS' } : {});

      const saved = await repo.containers.list(inArray(orderContainers.id, newIds), {
        orderBy: [asc(orderContainers.lineNo)],
      });
      await writeAudit(tx, ctx, {
        entity: 'orders',
        entityId: order.id,
        action: 'UPDATE',
        before: { change: 'ADD_CONTAINERS', version: order.version, ...totalsOf(order) },
        after: {
          change: 'ADD_CONTAINERS',
          version: updated.version,
          status: updated.status,
          ...totalsOf(updated),
          containers: saved.map((c) => ({
            id: c.id,
            lineNo: c.lineNo,
            containerNo: c.containerNo,
            containerType: c.containerType,
            baseFreightAmount: c.baseFreightAmount,
            isManualPrice: c.isManualPrice,
          })),
        },
      });
      for (const [index, row] of input.containers.entries()) {
        if (!row.manualPrice) continue;
        const container = saved[index]!;
        await writeAudit(tx, ctx, {
          entity: 'orders',
          entityId: order.id,
          action: 'MANUAL_PRICE',
          before: null,
          after: {
            containerId: container.id,
            lineNo: container.lineNo,
            containerNo: container.containerNo,
            price: container.baseFreightAmount,
            reason: row.manualPrice.reason,
          },
        });
      }
      return { order: updated, containers: saved, warnings };
    });
  }

  /** Bớt container khỏi Order nháp (xóa cont và Stop của nó, đánh lại số dòng). Order đã xác nhận thì hủy container thay vì bớt. */
  async function removeContainer(
    ctx: RequestContext,
    input: { orderId: string; containerId: string; version: number },
  ) {
    authorize(ctx, 'order.write');

    return options.tenantDb(ctx).transaction(async (tx) => {
      const order = await lockOrder(tx, input.orderId, input.version);
      if (order.status !== 'DRAFT') throw new AppError('INVALID_STATUS_TRANSITION');
      const repo = createOrderRepo(tx);
      const container = await containerOfOrder(tx, order, input.containerId);
      if (container.status !== 'PENDING') throw new AppError('INVALID_STATUS_TRANSITION');

      const all = await repo.containers.list(eq(orderContainers.orderId, order.id), {
        orderBy: [asc(orderContainers.lineNo)],
      });
      if (all.filter((c) => c.status !== 'CANCELLED').length <= 1) {
        throw invalid(
          'containerId',
          'Order phải còn ít nhất một container. Muốn bỏ cả Order thì hủy Order.',
        );
      }

      await repo.stops.removeWhere(eq(orderStops.orderContainerId, container.id));
      await repo.fees.removeWhere(eq(orderFees.orderContainerId, container.id));
      await repo.containers.remove(container.id);
      for (const later of all.filter((c) => c.lineNo > container.lineNo)) {
        await repo.containers.update(later.id, { lineNo: later.lineNo - 1 });
      }
      const updated = await saveTotals(tx, order);
      await writeAudit(tx, ctx, {
        entity: 'orders',
        entityId: order.id,
        action: 'UPDATE',
        before: {
          change: 'REMOVE_CONTAINER',
          version: order.version,
          ...totalsOf(order),
          container: {
            id: container.id,
            lineNo: container.lineNo,
            containerNo: container.containerNo,
            containerType: container.containerType,
          },
        },
        after: { change: 'REMOVE_CONTAINER', version: updated.version, ...totalsOf(updated) },
      });
      return { order: updated };
    });
  }

  /**
   * Hủy một container (spec 03 mục 4): chưa có Stop hoàn thành thì hủy tự do kèm lý do; đã chạy một phần thì bắt buộc phí hủy > 0.
   * Stop chưa chạy được bỏ qua; phí hủy vào doanh thu. Không đụng tới container khác của Order.
   */
  async function cancelContainerRow(
    tx: TenantDb,
    ctx: RequestContext,
    order: OrderRow,
    container: OrderContainerRow,
    { reason, fee }: { reason: string; fee: string | null },
  ) {
    if (!canCancelContainerFrom(container.status)) throw new AppError('INVALID_STATUS_TRANSITION');
    const repo = createOrderRepo(tx);
    const stops = await repo.stops.list(eq(orderStops.orderContainerId, container.id));
    const started = stops.some((s) => s.status === 'COMPLETED');
    if (started && !(fee && toMoney(fee).greaterThan(0))) {
      throw new AppError('CANCEL_FEE_REQUIRED', undefined, { lines: String(container.lineNo) });
    }

    await repo.stops.updateWhere(
      and(
        eq(orderStops.orderContainerId, container.id),
        inArray(orderStops.status, ['PENDING', 'ARRIVED']),
      )!,
      { status: 'SKIPPED' },
    );
    await repo.containers.update(container.id, {
      status: 'CANCELLED',
      cancelReason: reason,
      version: container.version + 1,
    });
    if (fee) {
      await repo.fees.insert({
        orderId: order.id,
        orderContainerId: container.id,
        feeCategory: 'REVENUE_SURCHARGE',
        feeCode: CANCELLATION_FEE_CODE,
        source: 'MANUAL',
        idempotencyKey: `CANCEL:${container.id}`,
        quantity: '1.00',
        amount: toDbString(fee),
        createdBy: ctx.userId,
      });
    }
    await writeAudit(tx, ctx, {
      entity: 'orders',
      entityId: order.id,
      action: 'CANCEL_CONTAINER',
      before: { containerId: container.id, status: container.status },
      after: {
        containerId: container.id,
        lineNo: container.lineNo,
        containerNo: container.containerNo,
        status: 'CANCELLED',
        reason,
        cancellationFee: fee ? toDbString(fee) : null,
      },
    });
  }

  /** Sau khi hủy container: mọi container đã hủy thì Order CANCELLED, ngược lại giữ nguyên trạng thái. */
  async function settleOrderAfterCancel(
    tx: TenantDb,
    ctx: RequestContext,
    order: OrderRow,
    reason: string,
  ) {
    const repo = createOrderRepo(tx);
    const containers = await repo.containers.list(eq(orderContainers.orderId, order.id));
    const allCancelled = containers.every((c) => c.status === 'CANCELLED');
    if (allCancelled) assertOrderTransition(order.status, 'CANCELLED');
    const updated = await saveTotals(
      tx,
      order,
      allCancelled ? { status: 'CANCELLED', cancelReason: reason } : {},
    );
    if (allCancelled) {
      await writeAudit(tx, ctx, {
        entity: 'orders',
        entityId: order.id,
        action: 'STATUS_CHANGE',
        before: { status: order.status },
        after: { status: 'CANCELLED', reason },
      });
    }
    return { order: updated, orderCancelled: allCancelled };
  }

  async function cancelContainer(ctx: RequestContext, input: CancelContainerInput) {
    authorize(ctx, 'order.write');
    const reason = input.reason.trim();
    if (reason.length < 3) throw invalid('reason', 'Nhập lý do hủy.');

    return options.tenantDb(ctx).transaction(async (tx) => {
      const order = await lockOrder(tx, input.orderId, input.version);
      assertOpen(order);
      const container = await containerOfOrder(tx, order, input.containerId);
      await cancelContainerRow(tx, ctx, order, container, { reason, fee: input.cancellationFee });
      return settleOrderAfterCancel(tx, ctx, order, reason);
    });
  }

  /**
   * Hủy Order = hủy mọi container chưa hoàn thành. Order chỉ CANCELLED khi mọi container đã hủy; còn container đã giao thì
   * Order giữ trạng thái. Tất cả hoặc không gì: thiếu phí hủy của một container thì không hủy cái nào.
   */
  async function cancelOrder(ctx: RequestContext, input: CancelOrderInput) {
    authorize(ctx, 'order.write');
    const reason = input.reason.trim();
    if (reason.length < 3) throw invalid('reason', 'Nhập lý do hủy.');

    return options.tenantDb(ctx).transaction(async (tx) => {
      const order = await lockOrder(tx, input.id, input.version);
      assertOpen(order);
      const repo = createOrderRepo(tx);
      const containers = await repo.containers.list(eq(orderContainers.orderId, order.id), {
        orderBy: [asc(orderContainers.lineNo)],
      });
      const feeOf = new Map(input.fees.map((f) => [f.containerId, f.amount]));
      for (const containerId of feeOf.keys()) {
        if (!containers.some((c) => c.id === containerId)) {
          throw invalid('fees', 'Phí hủy gắn với container không thuộc Order này.');
        }
      }

      const cancellable = containers.filter((c) => canCancelContainerFrom(c.status));
      if (cancellable.length === 0) throw new AppError('INVALID_STATUS_TRANSITION');
      for (const container of cancellable) {
        await cancelContainerRow(tx, ctx, order, container, {
          reason,
          fee: feeOf.get(container.id) ?? null,
        });
      }
      const settled = await settleOrderAfterCancel(tx, ctx, order, reason);
      return { ...settled, cancelledCount: cancellable.length };
    });
  }

  return {
    createOrder,
    getOrder,
    listOrders,
    getOrderHistory,
    previewPrices,
    getRouteStopTemplate,
    listRouteStopTemplates,
    getContainerWarnings,
    setRouteStopTemplate,
    confirmOrder,
    setManualPrice,
    addContainers,
    removeContainer,
    cancelContainer,
    cancelOrder,
  };
}

export type OrderService = ReturnType<typeof createOrderService>;
