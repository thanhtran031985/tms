import { createDb } from '@core/lib/db/client';
import { SEED_TENANTS } from '@core/lib/db/seeds/identity.test-data';
import {
  SEED_CUSTOMERS,
  SEED_LOCATIONS,
  SEED_ROUTES,
  SEED_SHIPPING_LINES,
} from '@core/lib/db/seeds/master-data.test-data';
import { getTenantDb } from '@core/lib/db/tenant-db';
import { createFleetRepo } from '@core/modules/fleet/repo';
import { createOrderRepo } from '@core/modules/orders/repo';
import { computeCheckDigit } from '@shared/iso6346';

// Dữ liệu riêng cho e2e ghép chuyến (task 08). Mỗi lần gọi tạo Order, container và xe MỚI (mã duy nhất theo lần chạy) nên các test
// không phụ thuộc lần chạy trước; ngày điều vận riêng để không lẫn với e2e điều vận khác. Dùng repo của core qua TenantDb
// như service thật, chỉ chạy trên DB thử nghiệm.
export const CONSOLIDATE_DAY = '2026-11-12';
const FIRST_STOP_UTC = `${CONSOLIDATE_DAY}T01:00:00.000Z`; // 08:00 giờ Việt Nam
const at = (hhmm: string) => new Date(`${CONSOLIDATE_DAY}T${hhmm}:00.000Z`);
const FAR_FUTURE = '2031-01-01';
const A = SEED_TENANTS.phucAn.id;

let serial = 0;
const stamp = () => `${Date.now().toString(36)}${(serial += 1)}`.toUpperCase();

function containerNo(prefix: string) {
  const digits = String(Math.floor(100000 + Math.random() * 899999));
  const body = `${prefix}U${digits}`;
  return `${body}${computeCheckDigit(body)}`;
}

const place = (code: string) => {
  const found = SEED_LOCATIONS.find((l) => l.tenantId === A && l.code === code)!;
  return { locationId: found.id, locationName: found.name };
};
const CHAIN = {
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
type StopTimes = Partial<Record<string, { start?: Date; end?: Date }>>;

export type ConsolidateScenario = {
  /** Token có trong số Order để lọc bảng điều vận (ô tìm). */
  token: string;
  containers: { id: string; containerNo: string | null }[];
  exportContainerNo: string | null;
  resources: { tractor: string; driverId: string; comboTrailerId: string; shortTrailerId: string };
};

async function withDb<T>(run: (db: ReturnType<typeof createDb>['db']) => Promise<T>): Promise<T> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('E2E cần DATABASE_URL (xem .env.example).');
  const { db, pool } = createDb(url);
  try {
    return await run(db);
  } finally {
    await pool.end();
  }
}

async function createResources(db: ReturnType<typeof createDb>['db'], token: string) {
  const fleet = createFleetRepo(getTenantDb({ tenantId: A }, { db }));
  const plate = token.slice(-5);
  const tractor = await fleet.tractors.insert({
    plateNumber: `51C-${plate}`,
    fuelNormLitersPer100km: '35.00',
    registrationExpiry: FAR_FUTURE,
    insuranceExpiry: FAR_FUTURE,
    transportBadgeExpiry: FAR_FUTURE,
    permittedGrossWeightTons: '48.00',
    status: 'AVAILABLE',
  });
  const driver = await fleet.drivers.insert({
    fullName: `Tài xế E2E ${token}`,
    phone: `09${String(Math.floor(10000000 + Math.random() * 89999999))}`,
    licenseNo: `GPLX-${token}`,
    licenseExpiry: FAR_FUTURE,
    status: 'AVAILABLE',
  });
  const combo = await fleet.trailers.insert({
    plateNumber: `51R-C${plate}`,
    trailerType: '40FT_COMBO',
    canCarryTwin20: true,
    maxPayloadTons: '30.00',
    tareWeightTons: '4.00',
    inspectionExpiry: FAR_FUTURE,
    status: 'AVAILABLE',
  });
  const short = await fleet.trailers.insert({
    plateNumber: `51R-S${plate}`,
    trailerType: '20FT',
    canCarryTwin20: false,
    maxPayloadTons: '30.00',
    tareWeightTons: '3.00',
    inspectionExpiry: FAR_FUTURE,
    status: 'AVAILABLE',
  });
  return {
    tractor: tractor.plateNumber,
    driverId: driver.id,
    comboTrailerId: combo.id,
    shortTrailerId: short.id,
  };
}

async function createOrder(
  db: ReturnType<typeof createDb>['db'],
  options: {
    token: string;
    suffix: string;
    kind: 'IMPORT' | 'EXPORT';
    customerId: string;
    lineCode: string;
    containers: { type: '20DC' | '40HC'; withNo: boolean }[];
    times?: StopTimes;
  },
) {
  const orders = createOrderRepo(getTenantDb({ tenantId: A }, { db }));
  const line = SEED_SHIPPING_LINES.find((l) => l.tenantId === A && l.code === options.lineCode)!;
  const route = SEED_ROUTES[0]!;
  const order = await orders.orders.insert({
    orderNo: `${options.token}-${options.suffix}`,
    customerId: options.customerId,
    orderType: options.kind,
    bookingOrBlNo: `BK${options.token}${options.suffix}`,
    shippingLineId: line.id,
    routeId: route.id,
    status: 'CONFIRMED',
  });
  const made: { id: string; containerNo: string | null }[] = [];
  for (const [index, spec] of options.containers.entries()) {
    const no = spec.withNo ? containerNo(options.kind === 'IMPORT' ? 'E2I' : 'E2E') : null;
    const container = await orders.containers.insert({
      orderId: order.id,
      lineNo: index + 1,
      routeId: route.id,
      containerNo: no,
      containerType: spec.type,
      cargoWeightTons: '8.00',
      portReadinessStatus: options.kind === 'IMPORT' ? 'READY_EDO' : 'READY_EMPTY_RELEASE',
      status: 'PENDING',
    });
    await orders.stops.insertMany(
      CHAIN[options.kind].map(([stopType, code], sequenceNo) => {
        const custom = options.times?.[stopType];
        return {
          orderId: order.id,
          orderContainerId: container.id,
          sequenceNo: sequenceNo + 1,
          stopType,
          ...place(code),
          windowStart: custom?.start ?? (sequenceNo === 0 ? new Date(FIRST_STOP_UTC) : null),
          deadlineTime: custom?.end ?? null,
        };
      }),
    );
    made.push({ id: container.id, containerNo: no });
  }
  return made;
}

/** Hai cont 20DC cùng khách (VSIP), cùng Order Nhập hãng MSK, giờ lấy đầu 08:00; kèm đầu kéo, tài xế, rơ moóc 40FT_COMBO và 20FT. */
export async function seedTwinScenario(): Promise<ConsolidateScenario> {
  const token = `E2E08-${stamp()}`;
  return withDb(async (db) => {
    const containers = await createOrder(db, {
      token,
      suffix: 'T',
      kind: 'IMPORT',
      customerId: SEED_CUSTOMERS.vsip.id,
      lineCode: 'MSK',
      containers: [
        { type: '20DC', withNo: true },
        { type: '20DC', withNo: true },
      ],
    });
    return {
      token,
      containers,
      exportContainerNo: null,
      resources: await createResources(db, token),
    };
  });
}

/** Một cont Nhập 40HC và một cont Xuất 40HC (chưa có số) cùng hãng MSK, cho Street Turn (rút hàng xong trước khi đóng hàng). */
export async function seedStreetTurnScenario(): Promise<ConsolidateScenario> {
  const token = `E2E08-${stamp()}`;
  return withDb(async (db) => {
    const imported = await createOrder(db, {
      token,
      suffix: 'I',
      kind: 'IMPORT',
      customerId: SEED_CUSTOMERS.vsip.id,
      lineCode: 'MSK',
      containers: [{ type: '40HC', withNo: true }],
      times: { UNSTUFFING: { start: at('02:00'), end: at('03:00') } },
    });
    const exported = await createOrder(db, {
      token,
      suffix: 'X',
      kind: 'EXPORT',
      customerId: SEED_CUSTOMERS.thepNamLong.id,
      lineCode: 'MSK',
      containers: [{ type: '40HC', withNo: false }],
      times: { PICK_EMPTY: { start: at('03:30') }, STUFFING: { start: at('04:00'), end: at('05:00') } },
    });
    return {
      token,
      containers: [...imported, ...exported],
      exportContainerNo: exported[0]?.containerNo ?? null,
      resources: await createResources(db, token),
    };
  });
}

/** Trước mỗi lần chạy: hủy các Order e2e cũ để danh sách Street Turn chờ chấp thuận không còn cặp treo từ lần trước. */
export async function cleanupConsolidateData(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('E2E cần DATABASE_URL (xem .env.example).');
  const { pool } = createDb(url);
  try {
    await pool.query(
      "UPDATE order_containers SET status = 'CANCELLED', linked_container_id = NULL WHERE order_id IN (SELECT id FROM orders WHERE order_no LIKE 'E2E08-%')",
    );
    await pool.query(
      "UPDATE consolidated_trips SET status = 'CANCELLED' WHERE id IN (SELECT trip_id FROM trip_containers WHERE order_container_id IN (SELECT id FROM order_containers WHERE order_id IN (SELECT id FROM orders WHERE order_no LIKE 'E2E08-%')))",
    );
  } finally {
    await pool.end();
  }
}
