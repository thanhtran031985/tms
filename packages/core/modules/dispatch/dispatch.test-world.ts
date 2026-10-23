// Dữ liệu dựng sẵn cho test tích hợp điều vận (task 06): hạ tầng Testcontainers, seed nền, service và các hàm tạo
// tài nguyên, container, chuyến mới có biển số/số cont riêng để mỗi test độc lập nhau.
import { AppError } from '@shared/errors';
import { computeCheckDigit } from '@shared/iso6346';
import type { StopType } from '@shared/enums';
import { expect } from 'vitest';
import type { RequestContext, Role } from '../../lib/context';
import { seedFleet } from '../../lib/db/seeds/fleet';
import { seedIdentity } from '../../lib/db/seeds/identity';
import { SEED_TENANTS, SEED_USERS } from '../../lib/db/seeds/identity.test-data';
import { seedMasterData } from '../../lib/db/seeds/master-data';
import {
  SEED_CUSTOMERS,
  SEED_LOCATIONS,
  SEED_ROUTES,
  SEED_SHIPPING_LINES,
} from '../../lib/db/seeds/master-data.test-data';
import { seedOrders } from '../../lib/db/seeds/orders';
import { SEED_ORDERS } from '../../lib/db/seeds/orders.test-data';
import { seedTariffs } from '../../lib/db/seeds/tariffs';
import { getTenantDb } from '../../lib/db/tenant-db';
import { publishDispatchEvent, type DispatchEvent } from '../../lib/redis/publish';
import { startTestInfra, type TestInfra } from '../../test/containers';
import { createTariffRepo } from '../billing/repo';
import { createFleetRepo } from '../fleet/repo';
import { createOrderRepo, type OrderRow } from '../orders/repo';
import { createOrderService } from '../orders/service';
import { createDispatchService, type DispatchService } from './index';
import { createDispatchRepo } from './repo';
import { detachContainersFromTrips } from './split.service';

export const A = SEED_TENANTS.phucAn.id;
export const B = SEED_TENANTS.saoViet.id;

/** "Bây giờ" cố định: 22/10/2026 12:00 giờ Việt Nam. Chuyến mẫu ở 26/10 nên cách xa hơn 30 phút. */
export const NOW = new Date('2026-10-22T05:00:00.000Z');
/** Giờ UTC trong ngày 26/10/2026 (08:00 giờ Việt Nam = 01:00 UTC). */
export const at = (hhmm: string, day = '2026-10-26') => new Date(`${day}T${hhmm}:00.000Z`);
export const FAR_FUTURE_DATE = '2030-01-01';

export const ctxOf = (tenantId: string, userId: string, role: Role): RequestContext => ({
  tenantId,
  userId,
  role,
  requestId: 'test',
  timezone: 'Asia/Ho_Chi_Minh',
});

export const dispatcher = ctxOf(A, SEED_USERS.hungDv.id, 'DISPATCHER');
export const dispatcher2 = ctxOf(A, SEED_USERS.owner.id, 'DISPATCHER'); // người dùng khác cùng vai trò, cho test hai Điều vận
export const admin = ctxOf(A, SEED_USERS.admin.id, 'ADMIN');
export const viewer = ctxOf(A, SEED_USERS.viewer.id, 'VIEWER');
export const dispatcherB = ctxOf(B, SEED_USERS.hungDv.id, 'DISPATCHER');

export async function expectAppError(promise: Promise<unknown>, code: string) {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error, `cần AppError ${code}, nhận ${String(error)}`).toBeInstanceOf(AppError);
  expect((error as AppError).code).toBe(code);
  return error as AppError;
}

let serial = 0;
const next = () => (serial += 1);

function validContainerNo(prefix = 'DSP') {
  const body = `${prefix}U${String(500000 + next()).padStart(6, '0')}`;
  return `${body}${computeCheckDigit(body)}`;
}

const place = (code: string, tenantId = A) => {
  const found = SEED_LOCATIONS.find((l) => l.tenantId === tenantId && l.code === code)!;
  return { locationId: found.id, locationName: found.name };
};
const CHAINS = {
  IMPORT: [
    ['PICK_FULL', 'CATLAI'],
    ['UNSTUFFING', 'KHO-PT'],
    ['RETURN_EMPTY', 'DEPOT-PL'],
  ],
  EXPORT: [
    ['PICK_EMPTY', 'DEPOT-PL'],
    ['STUFFING', 'KHO-NL'],
    ['PORT_IN', 'CATLAI'],
  ],
} as const;

const ORDER_OF = {
  IMPORT: SEED_ORDERS.find((o) => o.orderNo === 'IMP-2610-031')!,
  EXPORT: SEED_ORDERS.find((o) => o.orderNo === 'EXP-2610-046')!,
};

/** Hãng tàu mẫu của tenant A: MSK và CMA cho Street Turn, ONE và WHL không cho (seed master-data). */
export const LINE = Object.fromEntries(
  SEED_SHIPPING_LINES.filter((l) => l.tenantId === A).map((l) => [l.code, l.id]),
) as Record<'ONE' | 'MSK' | 'WHL' | 'CMA', string>;
export const CUSTOMER = {
  vsip: SEED_CUSTOMERS.vsip.id,
  thepNamLong: SEED_CUSTOMERS.thepNamLong.id,
  phucThinh: SEED_CUSTOMERS.phucThinh.id,
};

/** Mốc giờ của từng loại Stop (windowStart / deadlineTime) để thử thứ tự Stop của Rule 3 và Rule 4. */
export type StopTimes = Partial<
  Record<StopType, { start?: Date | null; end?: Date | null }>
>;

export type ContainerOptions = {
  kind?: 'IMPORT' | 'EXPORT';
  /** Order dựng bằng newOrder; bỏ trống thì dùng Order mẫu IMP-2610-031 / EXP-2610-046. */
  order?: OrderRow;
  containerType?: '20DC' | '40DC' | '40HC' | '20RF' | '40RF';
  /** null = chưa có số cont (hàng Xuất). */
  containerNo?: string | null;
  cargoWeightTons?: string | null;
  vgmTons?: string | null;
  isDangerousGoods?: boolean;
  portReadinessStatus?:
    'PENDING' | 'READY_EDO' | 'READY_EMPTY_RELEASE' | 'HOLD_CUSTOMS' | 'HOLD_LINE';
  status?: 'PENDING' | 'PLANNED';
  stopTimes?: StopTimes;
};

export type OrderOptions = {
  kind?: 'IMPORT' | 'EXPORT';
  customerId?: string;
  shippingLineId?: string | null;
  cutOffAt?: Date | null;
  status?: 'DRAFT' | 'CONFIRMED' | 'CANCELLED';
};

export type World = Awaited<ReturnType<typeof createWorld>>;

export async function createWorld(options: { redis?: boolean } = {}) {
  const infra: TestInfra = await startTestInfra({ redis: options.redis ?? false });
  await seedIdentity(infra.db, { password: 'mat-khau-thu-nghiem' });
  await seedMasterData(infra.db);
  await seedFleet(infra.db, NOW);
  await seedTariffs(infra.db);
  await seedOrders(infra.db);

  const tdb = (tenantId: string) => getTenantDb({ tenantId }, { db: infra.db });
  const repo = (tenantId = A) => createDispatchRepo(tdb(tenantId));
  const fleet = (tenantId = A) => createFleetRepo(tdb(tenantId));
  const orders = (tenantId = A) => createOrderRepo(tdb(tenantId));

  const published: DispatchEvent[] = [];
  /** Cấu hình tenant (tenants.settings) mà service đọc; đổi bằng setSettings, nhớ trả về {} sau test. */
  let settings: unknown = {};
  const setSettings = (value: unknown) => {
    settings = value;
  };
  const publish = async (event: DispatchEvent) => {
    published.push(event);
    if (options.redis) await publishDispatchEvent(infra.redis, event);
  };
  const service: DispatchService = createDispatchService({
    tenantDb: (ctx) => tdb(ctx.tenantId),
    now: () => NOW,
    loadSettings: async () => settings,
    publish,
  });
  /** Service Order nối với điều vận: hủy container/Order gỡ container khỏi chuyến (task 08). */
  const orderService = createOrderService({
    tenantDb: (ctx) => tdb(ctx.tenantId),
    now: () => NOW,
    detachFromTrips: detachContainersFromTrips,
    publishDispatch: async (events) => {
      for (const event of events) await publish(event);
    },
  });
  const tariffs = (tenantId = A) => createTariffRepo(tdb(tenantId));

  // ---- Tài nguyên mới: giấy tờ còn hạn tới 2030, trạng thái rảnh.
  const newDriver = (
    tenantId = A,
    overrides: Partial<Parameters<ReturnType<typeof fleet>['drivers']['insert']>[0]> = {},
  ) =>
    fleet(tenantId).drivers.insert({
      fullName: `Tài xế thử ${next()}`,
      phone: `09${String(10000000 + next()).slice(0, 8)}`,
      licenseNo: `GPLX-T${next()}`,
      licenseExpiry: FAR_FUTURE_DATE,
      status: 'AVAILABLE',
      ...overrides,
    });
  const newTractor = (
    tenantId = A,
    overrides: Partial<Parameters<ReturnType<typeof fleet>['tractors']['insert']>[0]> = {},
  ) =>
    fleet(tenantId).tractors.insert({
      plateNumber: `51C-T${String(next()).padStart(4, '0')}`,
      fuelNormLitersPer100km: '35.00',
      registrationExpiry: FAR_FUTURE_DATE,
      insuranceExpiry: FAR_FUTURE_DATE,
      transportBadgeExpiry: FAR_FUTURE_DATE,
      permittedGrossWeightTons: '40.00',
      status: 'AVAILABLE',
      ...overrides,
    });
  const newTrailer = (
    tenantId = A,
    overrides: Partial<Parameters<ReturnType<typeof fleet>['trailers']['insert']>[0]> = {},
  ) =>
    fleet(tenantId).trailers.insert({
      plateNumber: `51R-T${String(next()).padStart(4, '0')}`,
      trailerType: '40FT',
      maxPayloadTons: '28.00',
      tareWeightTons: '4.00',
      inspectionExpiry: FAR_FUTURE_DATE,
      status: 'AVAILABLE',
      ...overrides,
    });

  /** Order mới đã xác nhận (mặc định) cho khách và hãng tàu tùy chọn, để thử ghép cùng khách, khác khách, Street Turn. */
  async function newOrder(options: OrderOptions = {}): Promise<OrderRow> {
    const kind = options.kind ?? 'IMPORT';
    const seed = ORDER_OF[kind];
    return orders().orders.insert({
      orderNo: `T08-${kind === 'IMPORT' ? 'IMP' : 'EXP'}-${next()}`,
      customerId: options.customerId ?? seed.customerId,
      orderType: kind,
      bookingOrBlNo: `BK${next()}`,
      shippingLineId: options.shippingLineId === undefined ? LINE.MSK : options.shippingLineId,
      routeId: seed.routeId,
      cutOffAt: options.cutOffAt ?? null,
      status: options.status ?? 'CONFIRMED',
    });
  }

  /**
   * Container mới với 3 Stop chuẩn, mặc định đã ở PLANNED (cho test task 06). Thuộc Order mẫu IMP-2610-031 (Nhập) hoặc
   * EXP-2610-046 (Xuất), hoặc Order dựng bằng newOrder. Test ghép chuyến truyền status 'PENDING'.
   */
  async function newContainer(options: ContainerOptions = {}) {
    const kind = options.order ? (options.order.orderType as 'IMPORT' | 'EXPORT') : (options.kind ?? 'IMPORT');
    const order = options.order ?? ORDER_OF[kind];
    const route = SEED_ROUTES.find((r) => r.id === order.routeId)!;
    const lineNo = 1000 + next();
    const container = await orders().containers.insert({
      orderId: order.id,
      lineNo,
      routeId: route.id,
      containerNo: options.containerNo === undefined ? validContainerNo() : options.containerNo,
      containerType: options.containerType ?? '40HC',
      cargoWeightTons: options.cargoWeightTons === undefined ? '10.00' : options.cargoWeightTons,
      vgmTons: options.vgmTons ?? null,
      isDangerousGoods: options.isDangerousGoods ?? false,
      portReadinessStatus:
        options.portReadinessStatus ?? (kind === 'IMPORT' ? 'READY_EDO' : 'READY_EMPTY_RELEASE'),
      status: options.status ?? 'PLANNED',
    });
    const stops = await orders().stops.insertMany(
      CHAINS[kind].map(([stopType, code], index) => ({
        orderId: order.id,
        orderContainerId: container.id,
        sequenceNo: index + 1,
        stopType,
        ...place(code),
        windowStart: options.stopTimes?.[stopType]?.start ?? null,
        deadlineTime: options.stopTimes?.[stopType]?.end ?? null,
      })),
    );
    return { container, stops, order };
  }

  /** Hai container 20DC chưa lập chuyến (PENDING) của cùng Order, sẵn sàng ghép TWIN_20. */
  async function newTwinPair(options: ContainerOptions = {}) {
    const base = { containerType: '20DC', status: 'PENDING', ...options } as const;
    const a = await newContainer(base);
    const b = await newContainer(base);
    const pair: [typeof a, typeof b] = [a, b];
    return pair;
  }

  /** Chuyến SINGLE chưa gán tài nguyên cho một container mới (hoặc container đã có). */
  async function newTrip(
    window: { start: Date; end: Date },
    options: ContainerOptions & { containerId?: string } = {},
  ) {
    const made = options.containerId ? undefined : await newContainer(options);
    const containerId = options.containerId ?? made!.container.id;
    const orderContainer = (await orders().containers.get(containerId))!;
    const trip = await repo().trips.insert({
      tripCode: `TRIP-T-${next()}`,
      routeId: orderContainer.routeId,
      plannedStart: window.start,
      plannedEnd: window.end,
    });
    await repo().tripContainers.insert({
      tripId: trip.id,
      orderContainerId: containerId,
      orderId: orderContainer.orderId,
    });
    return { trip: (await repo().trips.get(trip.id))!, containerId, order: made?.order };
  }

  /**
   * Chuyến TWIN_20 mới của hai cont 20DC (cùng khách, hoặc khác khách nếu otherCustomer), qua createConsolidatedTrip.
   * `assigned` gán luôn xe 40FT_COMBO có chốt giữa.
   */
  async function newTwinTrip(options: { otherCustomer?: boolean; assigned?: boolean } = {}) {
    const otherOrder = options.otherCustomer
      ? await newOrder({ customerId: CUSTOMER.phucThinh })
      : undefined;
    const a = await newContainer({ containerType: '20DC', status: 'PENDING' });
    const b = await newContainer({
      containerType: '20DC',
      status: 'PENDING',
      ...(otherOrder ? { order: otherOrder } : {}),
    });
    const [driver, tractor, trailer] = await Promise.all([
      newDriver(),
      newTractor(),
      newTrailer(A, { trailerType: '40FT_COMBO', canCarryTwin20: true }),
    ]);
    const resources = { driverId: driver.id, tractorId: tractor.id, trailerId: trailer.id };
    const result = await service.createConsolidatedTrip(dispatcher, {
      tripMode: 'TWIN_20',
      orderContainerIds: [a.container.id, b.container.id],
      plannedStart: at('08:00'),
      plannedEnd: at('12:00'),
      resources: options.assigned === false ? null : resources,
    });
    return { a, b, trip: result.trip, result, resources };
  }

  /** Gán qua service; trả kết quả hoặc ném AppError. */
  async function assign(
    ctx: RequestContext,
    tripId: string,
    resources: { driverId: string; tractorId: string; trailerId: string },
    extra: Partial<Parameters<DispatchService['assignResources']>[1]> = {},
  ) {
    const trip = (await repo().trips.get(tripId))!;
    return service.assignResources(ctx, { tripId, version: trip.version, ...resources, ...extra });
  }

  /** Bộ ba tài nguyên mới, mặc định hợp lệ. */
  async function newResources() {
    const [driver, tractor, trailer] = await Promise.all([newDriver(), newTractor(), newTrailer()]);
    return {
      driver,
      tractor,
      trailer,
      ids: { driverId: driver.id, tractorId: tractor.id, trailerId: trailer.id },
    };
  }

  return {
    infra,
    service,
    orderService,
    published,
    setSettings,
    tdb,
    repo,
    fleet,
    orders,
    tariffs,
    newOrder,
    newTwinPair,
    newTwinTrip,
    newDriver,
    newTractor,
    newTrailer,
    newContainer,
    newTrip,
    newResources,
    assign,
    stop: () => infra.stop(),
  };
}
