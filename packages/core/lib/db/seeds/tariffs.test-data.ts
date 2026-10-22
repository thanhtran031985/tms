// Giá mẫu cho tuyến Cát Lái – Sóng Thần, dùng chung cho seed, test tích hợp và e2e. UUID cố định để seed chạy lại không sinh trùng.
// Giá chỉ là số mẫu, không dùng vận hành thật. VAT mẫu 8%.
import { SEED_TENANTS } from './identity.test-data';
import { SEED_CUSTOMERS, SEED_ROUTES } from './master-data.test-data';

const id = (n: number) => `0190a000-0000-7000-9001-${n.toString(16).padStart(12, '0')}`;

const phucAn = SEED_TENANTS.phucAn.id;
const saoViet = SEED_TENANTS.saoViet.id;
const routePhucAn = SEED_ROUTES[0].id; // CL-ST
const routeSaoViet = SEED_ROUTES[3].id; // CL-ST của Sao Việt
const FROM = '2026-01-01';

type Freight = {
  id: string;
  tenantId: string;
  routeId: string;
  containerType: '20DC' | '40HC';
  tripMode: 'SINGLE' | 'TWIN_20';
  customerId: string | null;
  basePrice: string;
  vatRatePercent: string;
  validFrom: string;
  validTo: string | null;
};

const freight = (
  n: number,
  f: Pick<
    Freight,
    'tenantId' | 'routeId' | 'containerType' | 'tripMode' | 'customerId' | 'basePrice'
  >,
): Freight => ({ id: id(n), vatRatePercent: '8.00', validFrom: FROM, validTo: null, ...f });

export const SEED_FREIGHT: Freight[] = [
  freight(0x1, {
    tenantId: phucAn,
    routeId: routePhucAn,
    containerType: '20DC',
    tripMode: 'SINGLE',
    customerId: null,
    basePrice: '1800000.00',
  }),
  freight(0x2, {
    tenantId: phucAn,
    routeId: routePhucAn,
    containerType: '40HC',
    tripMode: 'SINGLE',
    customerId: null,
    basePrice: '2600000.00',
  }),
  freight(0x3, {
    tenantId: phucAn,
    routeId: routePhucAn,
    containerType: '20DC',
    tripMode: 'TWIN_20',
    customerId: null,
    basePrice: '3000000.00',
  }),
  // Giá riêng của khách Thép Nam Long cho 40HC đi đơn.
  freight(0x4, {
    tenantId: phucAn,
    routeId: routePhucAn,
    containerType: '40HC',
    tripMode: 'SINGLE',
    customerId: SEED_CUSTOMERS.thepNamLong.id,
    basePrice: '2400000.00',
  }),
  freight(0x11, {
    tenantId: saoViet,
    routeId: routeSaoViet,
    containerType: '20DC',
    tripMode: 'SINGLE',
    customerId: null,
    basePrice: '1700000.00',
  }),
];

type Fee = {
  id: string;
  tenantId: string;
  routeId: string | null;
  containerType: '20DC' | '40HC';
  tripMode: 'SINGLE';
  customerId: string | null;
  feeCategory: 'COST_NORM' | 'PASS_THROUGH';
  feeCode: string;
  feeName: string;
  calcBasis: 'PER_TRIP' | 'PER_CONTAINER';
  amount: string;
  vatRatePercent: string | null;
  isExcluded: boolean;
  validFrom: string;
  validTo: string | null;
};

const fee = (
  n: number,
  f: Pick<
    Fee,
    | 'tenantId'
    | 'routeId'
    | 'containerType'
    | 'customerId'
    | 'feeCategory'
    | 'feeCode'
    | 'feeName'
    | 'calcBasis'
    | 'amount'
  > & { isExcluded?: boolean },
): Fee => ({
  id: id(n),
  tripMode: 'SINGLE',
  vatRatePercent: null,
  isExcluded: false,
  validFrom: FROM,
  validTo: null,
  ...f,
});

const SALARY = {
  feeCategory: 'COST_NORM',
  feeCode: 'DRIVER_SALARY',
  feeName: 'Lương tài xế',
  calcBasis: 'PER_TRIP',
} as const;
const TOLL = {
  feeCategory: 'COST_NORM',
  feeCode: 'TOLL_FEE',
  feeName: 'Phí cầu đường',
  calcBasis: 'PER_TRIP',
} as const;
const LIFT = {
  feeCategory: 'PASS_THROUGH',
  feeCode: 'LIFT_FEE',
  feeName: 'Phí nâng hạ',
  calcBasis: 'PER_CONTAINER',
} as const;

export const SEED_FEES: Fee[] = [
  fee(0x101, {
    ...SALARY,
    tenantId: phucAn,
    routeId: routePhucAn,
    containerType: '20DC',
    customerId: null,
    amount: '350000.00',
  }),
  fee(0x102, {
    ...SALARY,
    tenantId: phucAn,
    routeId: routePhucAn,
    containerType: '40HC',
    customerId: null,
    amount: '400000.00',
  }),
  fee(0x103, {
    ...TOLL,
    tenantId: phucAn,
    routeId: routePhucAn,
    containerType: '20DC',
    customerId: null,
    amount: '120000.00',
  }),
  fee(0x104, {
    ...TOLL,
    tenantId: phucAn,
    routeId: routePhucAn,
    containerType: '40HC',
    customerId: null,
    amount: '120000.00',
  }),
  // Phí nâng hạ theo cảng: routeId NULL áp mọi tuyến; chi hộ.
  fee(0x105, {
    ...LIFT,
    tenantId: phucAn,
    routeId: null,
    containerType: '20DC',
    customerId: null,
    amount: '600000.00',
  }),
  fee(0x106, {
    ...LIFT,
    tenantId: phucAn,
    routeId: null,
    containerType: '40HC',
    customerId: null,
    amount: '800000.00',
  }),
  // Khách Phúc Thịnh được miễn phí nâng hạ 20DC.
  fee(0x107, {
    ...LIFT,
    tenantId: phucAn,
    routeId: null,
    containerType: '20DC',
    customerId: SEED_CUSTOMERS.phucThinh.id,
    amount: '0.00',
    isExcluded: true,
  }),
  fee(0x111, {
    ...LIFT,
    tenantId: saoViet,
    routeId: null,
    containerType: '20DC',
    customerId: null,
    amount: '550000.00',
  }),
];
