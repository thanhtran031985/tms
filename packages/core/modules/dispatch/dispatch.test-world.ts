// Dữ liệu dựng sẵn cho test tích hợp điều vận (task 06): hạ tầng Testcontainers, seed nền, service và các hàm tạo
// tài nguyên, container, chuyến mới có biển số/số cont riêng để mỗi test độc lập nhau.
import { AppError } from '@shared/errors';
import { computeCheckDigit } from '@shared/iso6346';
import { expect } from 'vitest';
import type { RequestContext, Role } from '../../lib/context';
import { seedFleet } from '../../lib/db/seeds/fleet';
import { seedIdentity } from '../../lib/db/seeds/identity';
import { SEED_TENANTS, SEED_USERS } from '../../lib/db/seeds/identity.test-data';
import { seedMasterData } from '../../lib/db/seeds/master-data';
import { SEED_LOCATIONS, SEED_ROUTES } from '../../lib/db/seeds/master-data.test-data';
import { seedOrders } from '../../lib/db/seeds/orders';
import { SEED_ORDERS } from '../../lib/db/seeds/orders.test-data';
import { seedTariffs } from '../../lib/db/seeds/tariffs';
import { getTenantDb } from '../../lib/db/tenant-db';
import { startTestInfra, type TestInfra } from '../../test/containers';
import { createFleetRepo } from '../fleet/repo';
import { createOrderRepo } from '../orders/repo';
import { createDispatchService, type DispatchService } from './index';
import { createDispatchRepo } from './repo';

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

export type ContainerOptions = {
  kind?: 'IMPORT' | 'EXPORT';
  containerType?: '20DC' | '40DC' | '40HC' | '20RF' | '40RF';
  cargoWeightTons?: string | null;
  vgmTons?: string | null;
  isDangerousGoods?: boolean;
  portReadinessStatus?:
    'PENDING' | 'READY_EDO' | 'READY_EMPTY_RELEASE' | 'HOLD_CUSTOMS' | 'HOLD_LINE';
  status?: 'PENDING' | 'PLANNED';
};

export type World = Awaited<ReturnType<typeof createWorld>>;

export async function createWorld() {
  const infra: TestInfra = await startTestInfra({ redis: false });
  await seedIdentity(infra.db, { password: 'mat-khau-thu-nghiem' });
  await seedMasterData(infra.db);
  await seedFleet(infra.db, NOW);
  await seedTariffs(infra.db);
  await seedOrders(infra.db);

  const tdb = (tenantId: string) => getTenantDb({ tenantId }, { db: infra.db });
  const repo = (tenantId = A) => createDispatchRepo(tdb(tenantId));
  const fleet = (tenantId = A) => createFleetRepo(tdb(tenantId));
  const orders = (tenantId = A) => createOrderRepo(tdb(tenantId));

  const published: unknown[] = [];
  const service: DispatchService = createDispatchService({
    tenantDb: (ctx) => tdb(ctx.tenantId),
    now: () => NOW,
    loadSettings: async () => ({}),
    publish: async (event) => {
      published.push(event);
    },
  });

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

  /** Container mới của Order IMP-2610-031 (Nhập) hoặc EXP-2610-046 (Xuất) với 3 Stop chuẩn, đã ở PLANNED. */
  async function newContainer(options: ContainerOptions = {}) {
    const kind = options.kind ?? 'IMPORT';
    const order = ORDER_OF[kind];
    const route = SEED_ROUTES.find((r) => r.id === order.routeId)!;
    const lineNo = 1000 + next();
    const container = await orders().containers.insert({
      orderId: order.id,
      lineNo,
      routeId: route.id,
      containerNo: validContainerNo(),
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
      })),
    );
    return { container, stops, order };
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
    published,
    tdb,
    repo,
    fleet,
    orders,
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
