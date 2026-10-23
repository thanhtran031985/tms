// Tính lại giá sau khi ghép hoặc tách chuyến (task 08, bước 1; spec 06 mục 4). Đỏ vì chưa có reprice.service.
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { listAuditForEntity } from '../../lib/audit/repo';
import { orderFees } from '../../lib/db/schema';
import { SEED_FREIGHT } from '../../lib/db/seeds/tariffs.test-data';
import { SEED_ROUTES } from '../../lib/db/seeds/master-data.test-data';
import {
  A,
  CUSTOMER,
  NOW,
  createWorld,
  dispatcherB,
  expectAppError,
  dispatcher,
  type World,
} from '../dispatch/dispatch.test-world';
import { createRepriceService, type RepriceService } from './reprice.service';

let w: World;
let reprice: RepriceService;
let vsipTwin: { id: string };
let handSingle: { id: string };
let handTwin: { id: string };
const SINGLE_20DC = SEED_FREIGHT.find(
  (f) => f.tenantId === A && f.containerType === '20DC' && f.tripMode === 'SINGLE' && f.customerId === null,
)!.id;
const ROUTE = SEED_ROUTES[0]!.id;
const INVOICE_ID = '0190a000-0000-7000-9999-000000000001';

beforeAll(async () => {
  w = await createWorld();
  reprice = createRepriceService({ tenantDb: (ctx) => w.tdb(ctx.tenantId), now: () => NOW });
  const base = { routeId: ROUTE, currency: 'VND', validFrom: '2026-01-01', validTo: null } as const;
  // Giá riêng của VSIP khi ghép TWIN_20 thấp hơn giá SINGLE chung, nên tra giá mới phải trúng bản ghi này (priority 0).
  vsipTwin = await w.tariffs().freight.insert({
    ...base,
    containerType: '20DC',
    tripMode: 'TWIN_20',
    customerId: CUSTOMER.vsip,
    basePrice: '1500000.00',
    vatRatePercent: '8.00',
  });
  const fee = { ...base, containerType: '20DC', feeCategory: 'REVENUE_SURCHARGE', feeCode: 'HAND_FEE', feeName: 'Phí thử', calcBasis: 'PER_TRIP' } as const;
  handSingle = await w.tariffs().fees.insert({ ...fee, tripMode: 'SINGLE', customerId: null, amount: '100000.00' });
  handTwin = await w.tariffs().fees.insert({ ...fee, tripMode: 'TWIN_20', customerId: CUSTOMER.vsip, amount: '80000.00' });
});
afterAll(async () => {
  await w?.stop();
});

/** Cont 20DC của VSIP đã tính giá SINGLE nhưng đã bị đánh dấu cần tính lại theo TWIN_20, kèm phí TARIFF, MANUAL, DEM/DET. */
async function flaggedContainer(over: { isManualPrice?: boolean; status?: 'PENDING' | 'CANCELLED' } = {}) {
  const order = await w.newOrder({ customerId: CUSTOMER.vsip });
  const made = await w.newContainer({ order, containerType: '20DC', status: 'PENDING' });
  const id = made.container.id;
  await w.orders().containers.update(id, {
    baseFreightAmount: '1800000.00',
    freightTariffId: SINGLE_20DC,
    appliedTripMode: 'TWIN_20',
    repriceRequired: true,
    isManualPrice: over.isManualPrice ?? false,
    ...(over.status === 'CANCELLED' ? { status: 'CANCELLED' as const } : {}),
  });
  await w.orders().orders.update(order.id, { totalFreightAmount: '1800000.00', containerCount: 1 });
  const fee = (feeCode: string, source: 'TARIFF' | 'MANUAL' | 'DEM_DET_JOB', amount: string, tariffId?: string) =>
    w.orders().fees.insert({
      orderId: order.id,
      orderContainerId: id,
      feeCategory: 'REVENUE_SURCHARGE',
      feeCode,
      source,
      ...(tariffId ? { sourceTariffId: tariffId } : {}),
      idempotencyKey: `T08:${id}:${feeCode}`,
      amount,
    });
  await fee('HAND_FEE', 'TARIFF', '100000.00', handSingle.id);
  await fee('MANUAL_EXTRA', 'MANUAL', '250000.00');
  const demDet = await fee('DEM_FEE', 'DEM_DET_JOB', '900000.00');
  return { order, id, demDetFeeId: demDet.id };
}

const containerRow = async (id: string) => (await w.orders().containers.get(id))!;
const feesOf = async (containerId: string) =>
  w.orders().fees.list(eq(orderFees.orderContainerId, containerId));
const feeOf = async (containerId: string, code: string) => (await feesOf(containerId)).find((f) => f.feeCode === code);

describe('repriceContainer', () => {
  it('tính lại giá cước và phụ phí TARIFF theo chế độ chạy mới, ghi audit REPRICE, xóa cờ, cập nhật tổng Order', async () => {
    const { order, id } = await flaggedContainer();
    const result = await reprice.repriceContainer(dispatcher, { orderContainerId: id });

    expect(result.outcome).toBe('REPRICED');
    expect(result.before).toMatchObject({ amount: '1800000.00', tariffId: SINGLE_20DC });
    expect(result.after).toMatchObject({ amount: '1500000.00', tariffId: vsipTwin.id, tripMode: 'TWIN_20' });

    const row = await containerRow(id);
    expect(row.baseFreightAmount).toBe('1500000.00');
    expect(row.freightTariffId).toBe(vsipTwin.id);
    expect(row.appliedTripMode).toBe('TWIN_20');
    expect(row.repriceRequired).toBe(false);

    const hand = await feeOf(id, 'HAND_FEE');
    expect(hand?.amount).toBe('80000.00');
    expect(hand?.sourceTariffId).toBe(handTwin.id);

    expect((await w.orders().orders.get(order.id))!.totalFreightAmount).toBe('1500000.00');

    const audits = (await listAuditForEntity(w.tdb(A), 'order_containers', id)).filter((a) => a.action === 'REPRICE');
    expect(audits).toHaveLength(1);
    expect(audits[0]!.before).toMatchObject({ baseFreightAmount: '1800000.00', freightTariffId: SINGLE_20DC });
    expect(audits[0]!.after).toMatchObject({ baseFreightAmount: '1500000.00', freightTariffId: vsipTwin.id });
  });

  it('không đụng phụ phí nhập tay (MANUAL) và phí DEM/DET', async () => {
    const { id } = await flaggedContainer();
    await reprice.repriceContainer(dispatcher, { orderContainerId: id });
    expect((await feeOf(id, 'MANUAL_EXTRA'))?.amount).toBe('250000.00');
    expect((await feeOf(id, 'DEM_FEE'))?.amount).toBe('900000.00');
  });

  it('cont giá tay giữ nguyên giá, không audit REPRICE, cờ được xóa', async () => {
    const { id } = await flaggedContainer({ isManualPrice: true });
    const result = await reprice.repriceContainer(dispatcher, { orderContainerId: id });
    expect(result.outcome).toBe('SKIPPED_MANUAL');
    const row = await containerRow(id);
    expect(row.baseFreightAmount).toBe('1800000.00');
    expect(row.repriceRequired).toBe(false);
    const audits = await listAuditForEntity(w.tdb(A), 'order_containers', id);
    expect(audits.filter((a) => a.action === 'REPRICE')).toHaveLength(0);
  });

  it('cont đã gắn hóa đơn phát hành giữ giá và giữ cờ để Kế toán xử lý (task 21)', async () => {
    const { id, demDetFeeId } = await flaggedContainer();
    await w.orders().fees.update(demDetFeeId, { invoiceId: INVOICE_ID });
    const result = await reprice.repriceContainer(dispatcher, { orderContainerId: id });
    expect(result.outcome).toBe('SKIPPED_INVOICED');
    const row = await containerRow(id);
    expect(row.baseFreightAmount).toBe('1800000.00');
    expect(row.repriceRequired).toBe(true);
    expect((await feeOf(id, 'HAND_FEE'))?.amount).toBe('100000.00');
  });

  it('chạy hai lần không sinh audit hay phí trùng', async () => {
    const { id } = await flaggedContainer();
    await reprice.repriceContainer(dispatcher, { orderContainerId: id });
    const again = await reprice.repriceContainer(dispatcher, { orderContainerId: id });
    expect(again.outcome).toBe('UNCHANGED');
    const audits = await listAuditForEntity(w.tdb(A), 'order_containers', id);
    expect(audits.filter((a) => a.action === 'REPRICE')).toHaveLength(1);
    expect((await feesOf(id)).filter((f) => f.feeCode === 'HAND_FEE')).toHaveLength(1);
  });

  it('không tìm thấy giá thì báo TARIFF_NOT_FOUND, giữ giá cũ và giữ cờ (không bao giờ ghi 0)', async () => {
    const { id } = await flaggedContainer();
    await w.orders().containers.update(id, { containerType: '45HC' });
    await expectAppError(reprice.repriceContainer(dispatcher, { orderContainerId: id }), 'TARIFF_NOT_FOUND');
    const row = await containerRow(id);
    expect(row.baseFreightAmount).toBe('1800000.00');
    expect(row.repriceRequired).toBe(true);
  });

  it('container đã hủy bị bỏ qua', async () => {
    const { id } = await flaggedContainer({ status: 'CANCELLED' });
    const result = await reprice.repriceContainer(dispatcher, { orderContainerId: id });
    expect(result.outcome).toBe('SKIPPED_INACTIVE');
    expect((await containerRow(id)).baseFreightAmount).toBe('1800000.00');
  });

  it('tenant khác không tính lại được container của tenant này', async () => {
    const { id } = await flaggedContainer();
    await expectAppError(reprice.repriceContainer(dispatcherB, { orderContainerId: id }), 'NOT_FOUND');
  });
});

describe('repriceFlagged: quét cờ treo', () => {
  it('tính lại mọi container còn cờ của tenant, bỏ qua cont không cờ, báo lỗi từng cont mà không dừng cả lượt', async () => {
    const ok1 = await flaggedContainer();
    const ok2 = await flaggedContainer();
    const noTariff = await flaggedContainer();
    await w.orders().containers.update(noTariff.id, { containerType: '45HC' });
    const unflagged = await flaggedContainer();
    await w.orders().containers.update(unflagged.id, { repriceRequired: false });

    const results = await reprice.repriceFlagged(dispatcher);
    const byId = new Map(results.map((r) => [r.orderContainerId, r]));
    expect(byId.get(ok1.id)?.outcome).toBe('REPRICED');
    expect(byId.get(ok2.id)?.outcome).toBe('REPRICED');
    expect(byId.get(noTariff.id)).toMatchObject({ outcome: 'FAILED', errorCode: 'TARIFF_NOT_FOUND' });
    expect(byId.has(unflagged.id)).toBe(false);
    expect((await containerRow(ok1.id)).repriceRequired).toBe(false);
  });
});
