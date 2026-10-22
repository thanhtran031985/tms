// Order mẫu theo dữ liệu mẫu Screen04, dùng chung cho seed, test tích hợp và e2e. UUID cố định để seed chạy lại không sinh trùng.
// Số cont đều có check digit ISO 6346 đúng. Giá lấy từ bảng giá mẫu task 03 (tariffs.test-data); chỉ là số mẫu, không dùng vận hành.
// Cont "chưa có giá" (45HC, không có bảng giá nào) có baseFreightAmount 0.00 là giá trị đệm của DRAFT: giá chỉ coi là đã chốt
// khi có freightTariffId hoặc isManualPrice.
import type { orderContainers, orderFees, orders, orderStops, routeStopTemplates } from '../schema';
import { SEED_TENANTS } from './identity.test-data';
import {
  SEED_CUSTOMERS,
  SEED_LOCATIONS,
  SEED_ROUTES,
  SEED_SHIPPING_LINES,
} from './master-data.test-data';

type OrderInsert = typeof orders.$inferInsert;
type ContainerInsert = typeof orderContainers.$inferInsert;
type StopInsert = typeof orderStops.$inferInsert;
type FeeInsert = typeof orderFees.$inferInsert;
type TemplateInsert = typeof routeStopTemplates.$inferInsert;

// 9002 Order · 9003 container · 9004 Stop · 9005 phí · 9006 mẫu Stop (9000 danh mục, 9001 bảng giá).
const id = (kind: 2 | 3 | 4 | 5 | 6, n: number) =>
  `0190a000-0000-7000-900${kind}-${n.toString(16).padStart(12, '0')}`;

const phucAn = SEED_TENANTS.phucAn.id;
const saoViet = SEED_TENANTS.saoViet.id;
const [clSt, clBh, clVsip, clStSaoViet] = SEED_ROUTES;
const line = (code: string) =>
  SEED_SHIPPING_LINES.find((l) => l.tenantId === phucAn && l.code === code)!.id;
const place = (code: string, tenantId = phucAn) => {
  const found = SEED_LOCATIONS.find((l) => l.tenantId === tenantId && l.code === code)!;
  return { locationId: found.id, locationName: found.name };
};

// Id bảng giá mẫu (tariffs.test-data.ts): cước 0x1 = 20DC chung, 0x2 = 40HC chung, 0x4 = 40HC riêng Thép Nam Long;
// phí 0x105 = nâng hạ 20DC, 0x106 = nâng hạ 40HC (chi hộ).
const tariffId = (n: number) => `0190a000-0000-7000-9001-${n.toString(16).padStart(12, '0')}`;

type Chain = readonly [StopInsert['stopType'], ReturnType<typeof place>][];
type ContSpec = {
  containerNo: string | null;
  containerType: ContainerInsert['containerType'];
  price?: { amount: string; tariffId: string | null; manual?: boolean };
  liftFee?: { amount: string; tariffId: string };
  status?: ContainerInsert['status'];
};
type OrderSpec = {
  n: number; // số Order trong bộ mẫu, sinh ra id Order và nền id container
  tenantId: string;
  order: Omit<OrderInsert, 'id' | 'tenantId' | 'containerCount'>;
  chain: Chain;
  firstStopAt?: Date;
  containers: ContSpec[];
};

const IMPORT_CHAIN = (pick: string, cargo: string): Chain => [
  ['PICK_FULL', place(pick)],
  ['UNSTUFFING', place(cargo)],
  ['RETURN_EMPTY', place('DEPOT-PL')],
];
const EXPORT_CHAIN = (cargo: string): Chain => [
  ['PICK_EMPTY', place('DEPOT-PL')],
  ['STUFFING', place(cargo)],
  ['PORT_IN', place('CATLAI')],
];

const SPECS: OrderSpec[] = [
  {
    // Nháp, 5 cont, cont thứ 5 (45HC) không có bảng giá nào.
    n: 1,
    tenantId: phucAn,
    order: {
      orderNo: 'EXP-2610-044',
      customerId: SEED_CUSTOMERS.phucThinh.id,
      orderType: 'EXPORT',
      bookingOrBlNo: 'ONEYSGNG04412',
      shippingLineId: line('ONE'),
      vesselVoyage: 'ONE HARMONY 042S',
      cutOffAt: new Date('2026-10-30T09:35:00.000Z'),
      routeId: clSt.id,
      cargoDescription: 'May mặc xuất khẩu',
      status: 'DRAFT',
    },
    chain: EXPORT_CHAIN('KHO-PT'),
    containers: [
      { containerNo: 'ONEU5001120', containerType: '20DC' },
      { containerNo: 'ONEU5001238', containerType: '20DC' },
      { containerNo: 'ONEU5001346', containerType: '40HC' },
      { containerNo: 'ONEU5001454', containerType: '40HC' },
      { containerNo: 'ONEU5001562', containerType: '45HC' },
    ],
  },
  {
    // Đã xác nhận, 2 cont đều có giá theo bảng giá chung, kèm phí nâng hạ chi hộ.
    n: 2,
    tenantId: phucAn,
    order: {
      orderNo: 'IMP-2610-031',
      customerId: SEED_CUSTOMERS.vsip.id,
      orderType: 'IMPORT',
      bookingOrBlNo: 'MAEU238841907',
      shippingLineId: line('MSK'),
      vesselVoyage: 'MAERSK SEMBAWANG 241N',
      eta: new Date('2026-10-24T03:00:00.000Z'),
      routeId: clSt.id,
      status: 'CONFIRMED',
    },
    chain: IMPORT_CHAIN('CATLAI', 'KHO-PT'),
    firstStopAt: new Date('2026-10-25T01:00:00.000Z'),
    containers: [
      {
        containerNo: 'MAEU2388417',
        containerType: '20DC',
        price: { amount: '1800000.00', tariffId: tariffId(0x1) },
        liftFee: { amount: '600000.00', tariffId: tariffId(0x105) },
      },
      {
        containerNo: 'MAEU2388422',
        containerType: '40HC',
        price: { amount: '2600000.00', tariffId: tariffId(0x2) },
        liftFee: { amount: '800000.00', tariffId: tariffId(0x106) },
      },
    ],
  },
  {
    // Đã xác nhận: cont 1 theo giá riêng của khách, cont 2 do Điều vận nhập giá tay.
    n: 3,
    tenantId: phucAn,
    order: {
      orderNo: 'EXP-2610-046',
      customerId: SEED_CUSTOMERS.thepNamLong.id,
      orderType: 'EXPORT',
      bookingOrBlNo: 'WHLC316A0482',
      shippingLineId: line('WHL'),
      vesselVoyage: 'WAN HAI 316 W158',
      cutOffAt: new Date('2026-10-31T15:00:00.000Z'),
      routeId: clSt.id,
      status: 'CONFIRMED',
    },
    chain: EXPORT_CHAIN('KHO-NL'),
    firstStopAt: new Date('2026-10-28T01:00:00.000Z'),
    containers: [
      {
        containerNo: null,
        containerType: '40HC',
        price: { amount: '2400000.00', tariffId: tariffId(0x4) },
        liftFee: { amount: '800000.00', tariffId: tariffId(0x106) },
      },
      {
        containerNo: null,
        containerType: '40HC',
        price: { amount: '2100000.00', tariffId: null, manual: true },
        liftFee: { amount: '800000.00', tariffId: tariffId(0x106) },
      },
    ],
  },
  {
    // Đã hủy: khách hủy lô trước khi chạy.
    n: 4,
    tenantId: phucAn,
    order: {
      orderNo: 'IMP-2610-029',
      customerId: SEED_CUSTOMERS.hoaSen.id,
      orderType: 'IMPORT',
      bookingOrBlNo: 'CMDUSGN1170342',
      shippingLineId: line('CMA'),
      vesselVoyage: 'CMA CGM TAGE 0QB3HN1',
      routeId: clSt.id,
      status: 'CANCELLED',
      cancelReason: 'Khách hủy lô hàng',
    },
    chain: IMPORT_CHAIN('CATLAI', 'KHO-PT'),
    containers: [{ containerNo: 'CMAU1170346', containerType: '20DC', status: 'CANCELLED' }],
  },
  {
    // Nội địa: Stop theo mẫu của tuyến CL-VSIP (STOP_TEMPLATES bên dưới).
    n: 5,
    tenantId: phucAn,
    order: {
      orderNo: 'DOM-2610-001',
      customerId: SEED_CUSTOMERS.vsip.id,
      orderType: 'DOMESTIC',
      bookingOrBlNo: 'VSIP-NB-0001',
      routeId: clVsip.id,
      cargoDescription: 'Hàng điện tử nội địa',
      status: 'DRAFT',
    },
    chain: [
      ['PICK_EMPTY', place('DEPOT-PL')],
      ['STUFFING', place('CATLAI')],
      ['UNSTUFFING', place('KHO-VSIP')],
      ['RETURN_EMPTY', place('DEPOT-PL')],
    ],
    containers: [{ containerNo: null, containerType: '20DC' }],
  },
  {
    // Tenant Sao Việt, để thử cách ly dữ liệu.
    n: 11,
    tenantId: saoViet,
    order: {
      orderNo: 'IMP-2610-001',
      customerId: SEED_CUSTOMERS.saoVietDet.id,
      orderType: 'IMPORT',
      bookingOrBlNo: 'ONEYSGN9900001',
      shippingLineId: SEED_SHIPPING_LINES.find((l) => l.tenantId === saoViet && l.code === 'ONE')!
        .id,
      routeId: clStSaoViet.id,
      status: 'DRAFT',
    },
    chain: [
      ['PICK_FULL', place('CATLAI', saoViet)],
      ['UNSTUFFING', place('KHO-DETMK', saoViet)],
      ['RETURN_EMPTY', place('CATLAI', saoViet)],
    ],
    containers: [{ containerNo: 'TCLU7002003', containerType: '20DC' }],
  },
];

const contId = (spec: OrderSpec, index: number) => id(3, spec.n * 16 + index + 1);

function build() {
  const orderRows: (OrderInsert & { id: string; tenantId: string })[] = [];
  const containerRows: (ContainerInsert & { id: string; tenantId: string })[] = [];
  const stopRows: (StopInsert & { id: string; tenantId: string })[] = [];
  const feeRows: (FeeInsert & { id: string; tenantId: string })[] = [];

  for (const spec of SPECS) {
    const orderId = id(2, spec.n);
    const live = spec.containers.filter((c) => (c.status ?? 'PENDING') !== 'CANCELLED');
    const sum = (pick: (c: ContSpec) => string | undefined) =>
      live.reduce((total, c) => total + Number(pick(c) ?? 0), 0).toFixed(2);

    orderRows.push({
      ...spec.order,
      id: orderId,
      tenantId: spec.tenantId,
      containerCount: live.length,
      totalFreightAmount: sum((c) => c.price?.amount),
      totalPassThroughAmount: sum((c) => c.liftFee?.amount),
    });

    spec.containers.forEach((c, index) => {
      const containerId = contId(spec, index);
      const cancelled = c.status === 'CANCELLED';
      containerRows.push({
        id: containerId,
        tenantId: spec.tenantId,
        orderId,
        lineNo: index + 1,
        routeId: spec.order.routeId,
        containerNo: c.containerNo,
        containerType: c.containerType,
        baseFreightAmount: c.price?.amount ?? '0.00',
        freightTariffId: c.price?.tariffId ?? null,
        isManualPrice: c.price?.manual ?? false,
        status: c.status ?? 'PENDING',
        cancelReason: cancelled ? 'Khách hủy lô hàng' : null,
      });

      spec.chain.forEach(([stopType, where], stopIndex) => {
        stopRows.push({
          id: id(4, (spec.n * 16 + index + 1) * 16 + stopIndex + 1),
          tenantId: spec.tenantId,
          orderId,
          orderContainerId: containerId,
          sequenceNo: stopIndex + 1,
          stopType,
          ...where,
          windowStart: stopIndex === 0 ? (spec.firstStopAt ?? null) : null,
          status: cancelled ? 'SKIPPED' : 'PENDING',
        });
      });

      if (c.liftFee) {
        feeRows.push({
          id: id(5, spec.n * 16 + index + 1),
          tenantId: spec.tenantId,
          orderId,
          orderContainerId: containerId,
          feeCategory: 'PASS_THROUGH',
          feeCode: 'LIFT_FEE',
          source: 'TARIFF',
          sourceTariffId: c.liftFee.tariffId,
          amount: c.liftFee.amount,
        });
      }
    });
  }
  return { orderRows, containerRows, stopRows, feeRows };
}

const built = build();
export const SEED_ORDERS = built.orderRows;
export const SEED_ORDER_CONTAINERS = built.containerRows;
export const SEED_ORDER_STOPS = built.stopRows;
export const SEED_ORDER_FEES = built.feeRows;

// Chuỗi Stop nội địa của hai tuyến Phúc An (đơn DOMESTIC sinh Stop theo mẫu này).
const DOMESTIC_CHAIN = ['PICK_EMPTY', 'STUFFING', 'UNSTUFFING', 'RETURN_EMPTY'] as const;
export const SEED_STOP_TEMPLATES: (TemplateInsert & { id: string; tenantId: string })[] = [
  clVsip,
  clBh,
].flatMap((route, routeIndex) =>
  DOMESTIC_CHAIN.map((stopType, index) => ({
    id: id(6, routeIndex * 16 + index + 1),
    tenantId: phucAn,
    routeId: route.id,
    sequenceNo: index + 1,
    stopType,
  })),
);
