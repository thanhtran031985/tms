import { and, eq } from 'drizzle-orm';
import { AppError } from '@shared/errors';
import { computeCheckDigit } from '@shared/iso6346';
import { createOrderInputSchema, manualPriceSchema } from '@shared/schemas/orders';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { listAuditForEntity } from '../../lib/audit/repo';
import type { RequestContext, Role } from '../../lib/context';
import { orderFees } from '../../lib/db/schema';
import { seedIdentity } from '../../lib/db/seeds/identity';
import { SEED_TENANTS, SEED_USERS } from '../../lib/db/seeds/identity.test-data';
import { seedMasterData } from '../../lib/db/seeds/master-data';
import { SEED_CUSTOMERS, SEED_ROUTES } from '../../lib/db/seeds/master-data.test-data';
import { seedTariffs } from '../../lib/db/seeds/tariffs';
import { getTenantDb } from '../../lib/db/tenant-db';
import { startTestInfra, type TestInfra } from '../../test/containers';
import { createTariffRepo } from '../billing/repo';
import { createMasterDataRepo } from '../master-data/repo';
import { createOrderRepo } from './repo';
import { createOrderService, type OrderService } from './service';

// "Hôm nay" cố định: 22/10/2026 giờ Việt Nam.
const NOW = new Date('2026-10-22T05:00:00.000Z');

const ctxOf = (tenantId: string, userId: string, role: Role): RequestContext => ({
  tenantId,
  userId,
  role,
  requestId: 'test',
  timezone: 'Asia/Ho_Chi_Minh',
});

async function expectAppError(promise: Promise<unknown>, code: string) {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error, `cần AppError ${code}`).toBeInstanceOf(AppError);
  expect((error as AppError).code).toBe(code);
  return error as AppError;
}

let serial = 200000;
function containerNo() {
  const body = `CNF${'U'}${String((serial += 1)).padStart(6, '0')}`;
  return `${body}${computeCheckDigit(body)}`;
}

describe('orders.service: xác nhận Order, snapshot giá, giá tay', () => {
  let infra: TestInfra;
  let service: OrderService;

  const A = SEED_TENANTS.phucAn.id;
  const dispatcher = ctxOf(A, SEED_USERS.hungDv.id, 'DISPATCHER');
  const owner = ctxOf(A, SEED_USERS.owner.id, 'OWNER');
  const accountant = ctxOf(A, SEED_USERS.accountant.id, 'ACCOUNTANT');
  const viewer = ctxOf(A, SEED_USERS.viewer.id, 'VIEWER');
  const dispatcherB = ctxOf(SEED_TENANTS.saoViet.id, SEED_USERS.hungDv.id, 'DISPATCHER');

  const clSt = SEED_ROUTES[0];
  const tdbA = () => getTenantDb({ tenantId: A }, { db: infra.db });
  const repoA = () => createOrderRepo(tdbA());
  let routeSeq = 0;

  beforeAll(async () => {
    infra = await startTestInfra({ redis: false });
    await seedIdentity(infra.db, { password: 'mat-khau-thu-nghiem' });
    await seedMasterData(infra.db);
    await seedTariffs(infra.db);
    service = createOrderService({
      tenantDb: (ctx) => getTenantDb(ctx, { db: infra.db }),
      now: () => NOW,
    });
  });

  afterAll(async () => {
    await infra?.stop();
  });

  async function newOrder(
    types: string[],
    extra: Record<string, unknown> = {},
    customerId: string = SEED_CUSTOMERS.thepNamLong.id,
  ) {
    const created = await service.createOrder(
      dispatcher,
      createOrderInputSchema.parse({
        customerId,
        orderType: 'IMPORT',
        bookingOrBlNo: `bl-${Math.random().toString(36).slice(2, 8)}`,
        routeId: clSt.id,
        containers: types.map((containerType) => ({ containerNo: containerNo(), containerType })),
        ...extra,
      }),
    );
    return created.order;
  }

  const freshDetail = async (orderId: string) => service.getOrder(dispatcher, orderId);

  it('Order 3 cont đều có giá: CONFIRMED, mỗi cont chốt giá + tariff, phụ phí vào order_fees đúng cont', async () => {
    // Thép Nam Long: 20DC giá chung 1.8M; 40HC giá riêng 2.4M; phí nâng hạ 600k (20DC) và 800k (40HC).
    const order = await newOrder(['20DC', '40HC', '40HC']);

    const confirmed = await service.confirmOrder(dispatcher, {
      id: order.id,
      version: order.version,
    });
    const detail = await freshDetail(order.id);

    expect(confirmed.order.status).toBe('CONFIRMED');
    expect(detail.order).toMatchObject({ status: 'CONFIRMED', version: order.version + 1 });
    expect(detail.containers.map((c) => c.baseFreightAmount)).toEqual([
      '1800000.00',
      '2400000.00',
      '2400000.00',
    ]);
    for (const container of detail.containers) {
      expect(container.freightTariffId).toBeTruthy();
      expect(container.appliedTripMode).toBe('SINGLE');
      expect(container.isManualPrice).toBe(false);
    }
    const tariffs = createTariffRepo(tdbA());
    const private40 = await tariffs.freight.get(detail.containers[1]!.freightTariffId!);
    expect(private40?.customerId).toBe(SEED_CUSTOMERS.thepNamLong.id);

    expect(detail.fees).toHaveLength(3);
    for (const container of detail.containers) {
      const fees = detail.fees.filter((f) => f.orderContainerId === container.id);
      expect(fees).toHaveLength(1);
      expect(fees[0]).toMatchObject({
        orderId: order.id,
        feeCategory: 'PASS_THROUGH',
        feeCode: 'LIFT_FEE',
        source: 'TARIFF',
        quantity: '1.00',
      });
      expect(fees[0]!.sourceTariffId).toBeTruthy();
    }
    expect(detail.fees.map((f) => f.amount).sort()).toEqual([
      '600000.00',
      '800000.00',
      '800000.00',
    ]);
    // Chi phí định mức (lương tài xế, cầu đường) là chi phí, không phải phí thu khách.
    expect(detail.fees.some((f) => f.feeCode === 'DRIVER_SALARY' || f.feeCode === 'TOLL_FEE')).toBe(
      false,
    );
  });

  it('tổng tiền Order bằng tổng tiền các cont: cước, phụ thu, chi hộ', async () => {
    const order = await newOrder(['20DC', '40HC', '40HC']);
    await service.confirmOrder(dispatcher, { id: order.id, version: order.version });
    const { order: saved, containers, fees } = await freshDetail(order.id);

    const sum = (values: string[]) => values.reduce((total, v) => total + Number(v), 0);
    expect(Number(saved.totalFreightAmount)).toBe(sum(containers.map((c) => c.baseFreightAmount)));
    expect(saved.totalFreightAmount).toBe('6600000.00');
    expect(saved.totalPassThroughAmount).toBe('2200000.00');
    expect(saved.totalSurchargeAmount).toBe('0.00');
    expect(Number(saved.totalPassThroughAmount)).toBe(
      sum(fees.filter((f) => f.feeCategory === 'PASS_THROUGH').map((f) => f.amount)),
    );
    expect(saved.containerCount).toBe(3);
  });

  it('khách được miễn phí (isExcluded) thì không có phí đó trong order_fees', async () => {
    const order = await newOrder(['20DC'], {}, SEED_CUSTOMERS.phucThinh.id);
    await service.confirmOrder(dispatcher, { id: order.id, version: order.version });
    const detail = await freshDetail(order.id);

    expect(detail.order.status).toBe('CONFIRMED');
    expect(detail.containers[0]!.baseFreightAmount).toBe('1800000.00');
    expect(detail.fees).toEqual([]);
  });

  it('cont không có giá: Order không CONFIRMED, không ghi gì, không cont nào bị ghi giá 0', async () => {
    // 45HC không có bảng giá nào; cont thứ 1 có giá.
    const order = await newOrder(['20DC', '45HC', '45HC']);

    const error = await expectAppError(
      service.confirmOrder(dispatcher, { id: order.id, version: order.version }),
      'PRICE_MISSING',
    );
    const detail = await freshDetail(order.id);

    expect(error.details).toMatchObject({ lines: '2,3', count: 2 });
    expect(detail.order).toMatchObject({
      status: 'DRAFT',
      version: order.version,
      totalFreightAmount: '0.00',
    });
    for (const container of detail.containers) {
      expect(container.freightTariffId).toBeNull();
      expect(container.isManualPrice).toBe(false);
      expect(container.version).toBe(0);
    }
    expect(detail.fees).toEqual([]);
    expect((await listAuditForEntity(tdbA(), 'orders', order.id)).map((a) => a.action)).toEqual([
      'CREATE',
    ]);
  });

  it('nhập giá tay có lý do rồi xác nhận được: isManualPrice, không tariff, có audit MANUAL_PRICE', async () => {
    const order = await newOrder(['20DC', '45HC']);
    const target = (await freshDetail(order.id)).containers[1]!;

    const priced = await service.setManualPrice(
      dispatcher,
      manualPriceSchema.parse({
        orderId: order.id,
        containerId: target.id,
        version: order.version,
        price: '3100000',
        reason: 'Khách thỏa thuận giá cho cont 45HC',
      }),
    );
    await service.confirmOrder(dispatcher, { id: order.id, version: priced.order.version });
    const detail = await freshDetail(order.id);

    expect(detail.order.status).toBe('CONFIRMED');
    expect(detail.containers[1]).toMatchObject({
      baseFreightAmount: '3100000.00',
      isManualPrice: true,
      freightTariffId: null,
    });
    expect(detail.containers[0]).toMatchObject({
      baseFreightAmount: '1800000.00',
      isManualPrice: false,
    });
    expect(detail.order.totalFreightAmount).toBe('4900000.00');

    const audit = await listAuditForEntity(tdbA(), 'orders', order.id);
    const manual = audit.find((a) => a.action === 'MANUAL_PRICE');
    expect(manual?.actorUserId).toBe(SEED_USERS.hungDv.id);
    expect(manual?.after).toMatchObject({
      containerId: target.id,
      lineNo: 2,
      price: '3100000.00',
      reason: 'Khách thỏa thuận giá cho cont 45HC',
    });
    expect(audit.map((a) => a.action).sort()).toEqual(['CONFIRM', 'CREATE', 'MANUAL_PRICE']);
  });

  it('giá tay 0, âm hoặc thiếu lý do bị chặn; schema zod và service cùng chặn', async () => {
    const order = await newOrder(['45HC']);
    const target = (await freshDetail(order.id)).containers[0]!;
    const base = { orderId: order.id, containerId: target.id, version: order.version };

    expect(manualPriceSchema.safeParse({ ...base, price: '0', reason: 'Thỏa thuận' }).success).toBe(
      false,
    );
    expect(
      manualPriceSchema.safeParse({ ...base, price: '-5', reason: 'Thỏa thuận' }).success,
    ).toBe(false);
    expect(manualPriceSchema.safeParse({ ...base, price: '100000', reason: '  ' }).success).toBe(
      false,
    );

    // Gọi thẳng service với dữ liệu không qua zod vẫn bị chặn.
    await expectAppError(
      service.setManualPrice(dispatcher, { ...base, price: '0.00', reason: 'Thỏa thuận' }),
      'VALIDATION_ERROR',
    );
    await expectAppError(
      service.setManualPrice(dispatcher, { ...base, price: '100000.00', reason: '' }),
      'VALIDATION_ERROR',
    );
    expect((await freshDetail(order.id)).containers[0]).toMatchObject({
      isManualPrice: false,
      baseFreightAmount: '0.00',
    });
  });

  it('phân quyền: Chỉ xem không xác nhận được; Kế toán nhập giá tay nhưng không xác nhận; Chủ công ty xác nhận nhưng không nhập giá tay', async () => {
    const order = await newOrder(['45HC']);
    const target = (await freshDetail(order.id)).containers[0]!;
    const price = {
      orderId: order.id,
      containerId: target.id,
      price: '2500000.00',
      reason: 'Báo giá riêng',
    };

    await expectAppError(
      service.confirmOrder(viewer, { id: order.id, version: order.version }),
      'FORBIDDEN',
    );
    await expectAppError(
      service.confirmOrder(accountant, { id: order.id, version: order.version }),
      'FORBIDDEN',
    );
    await expectAppError(
      service.setManualPrice(owner, { ...price, version: order.version }),
      'FORBIDDEN',
    );
    const priced = await service.setManualPrice(accountant, { ...price, version: order.version });
    await service.confirmOrder(owner, { id: order.id, version: priced.order.version });

    expect((await freshDetail(order.id)).order.status).toBe('CONFIRMED');
  });

  it('targetDate lấy ngày của Stop đầu theo múi giờ tenant, không theo UTC', async () => {
    // Tuyến riêng có hai bảng giá liên tiếp: đến 31/10 giá 1.000.000; từ 01/11 giá 1.500.000.
    const route = await createMasterDataRepo(tdbA()).routes.insert({
      routeCode: `TD-${(routeSeq += 1)}`,
      name: 'Tuyến thử targetDate',
      originZone: 'Cát Lái',
      destinationZone: 'Long An',
      standardDistanceKm: 70,
    });
    const tariffs = createTariffRepo(tdbA());
    const key = { routeId: route.id, containerType: '40DC' as const, vatRatePercent: '8.00' };
    await tariffs.freight.insert({
      ...key,
      basePrice: '1000000.00',
      validFrom: '2026-01-01',
      validTo: '2026-10-31',
    });
    await tariffs.freight.insert({ ...key, basePrice: '1500000.00', validFrom: '2026-11-01' });

    // 17:30 UTC ngày 31/10 = 00:30 ngày 01/11 giờ Việt Nam.
    const nextDay = await newOrder(['40DC'], {
      routeId: route.id,
      firstStopAt: '2026-10-31T17:30:00.000Z',
    });
    await service.confirmOrder(dispatcher, { id: nextDay.id, version: nextDay.version });
    expect((await freshDetail(nextDay.id)).containers[0]!.baseFreightAmount).toBe('1500000.00');

    // 16:30 UTC ngày 31/10 = 23:30 cùng ngày giờ Việt Nam: vẫn thuộc bảng giá cũ.
    const sameDay = await newOrder(['40DC'], {
      routeId: route.id,
      firstStopAt: '2026-10-31T16:30:00.000Z',
    });
    await service.confirmOrder(dispatcher, { id: sameDay.id, version: sameDay.version });
    expect((await freshDetail(sameDay.id)).containers[0]!.baseFreightAmount).toBe('1000000.00');
  });

  it('không có giờ hẹn Stop đầu: lấy ETA (hàng Nhập), cut-off (hàng Xuất), cuối cùng là hôm nay', async () => {
    const route = await createMasterDataRepo(tdbA()).routes.insert({
      routeCode: `TD-${(routeSeq += 1)}`,
      name: 'Tuyến thử ngày dự phòng',
      originZone: 'Cát Lái',
      destinationZone: 'Tiền Giang',
      standardDistanceKm: 80,
    });
    const tariffs = createTariffRepo(tdbA());
    const key = { routeId: route.id, containerType: '20DC' as const, vatRatePercent: '8.00' };
    await tariffs.freight.insert({
      ...key,
      basePrice: '1000000.00',
      validFrom: '2026-01-01',
      validTo: '2026-10-31',
    });
    await tariffs.freight.insert({
      ...key,
      basePrice: '1500000.00',
      validFrom: '2026-11-01',
      validTo: '2026-11-30',
    });
    await tariffs.freight.insert({ ...key, basePrice: '1900000.00', validFrom: '2026-12-01' });

    const byEta = await newOrder(['20DC'], { routeId: route.id, eta: '2026-11-10T03:00:00.000Z' });
    const byCutOff = await newOrder(['20DC'], {
      orderType: 'EXPORT',
      routeId: route.id,
      containers: [{ containerType: '20DC' }],
      cutOffAt: '2026-12-05T03:00:00.000Z',
    });
    const byToday = await newOrder(['20DC'], { routeId: route.id });

    for (const order of [byEta, byCutOff, byToday]) {
      await service.confirmOrder(dispatcher, { id: order.id, version: order.version });
    }
    expect((await freshDetail(byEta.id)).containers[0]!.baseFreightAmount).toBe('1500000.00');
    expect((await freshDetail(byCutOff.id)).containers[0]!.baseFreightAmount).toBe('1900000.00');
    expect((await freshDetail(byToday.id)).containers[0]!.baseFreightAmount).toBe('1000000.00');
  });

  it('phụ phí thu khách (REVENUE_SURCHARGE) vào totalSurchargeAmount; phí theo km nhân quãng đường tuyến; phí theo ngày chưa tính', async () => {
    const route = await createMasterDataRepo(tdbA()).routes.insert({
      routeCode: `TD-${(routeSeq += 1)}`,
      name: 'Tuyến thử phụ phí',
      originZone: 'Cát Lái',
      destinationZone: 'Đồng Nai',
      standardDistanceKm: 60,
    });
    const tariffs = createTariffRepo(tdbA());
    await tariffs.freight.insert({
      routeId: route.id,
      containerType: '20DC',
      basePrice: '1000000.00',
      vatRatePercent: '8.00',
      validFrom: '2026-01-01',
    });
    const fee = {
      routeId: route.id,
      containerType: '20DC' as const,
      feeCategory: 'REVENUE_SURCHARGE' as const,
      validFrom: '2026-01-01',
    };
    await tariffs.fees.insert({
      ...fee,
      feeCode: 'DOC_FEE',
      feeName: 'Phí chứng từ',
      calcBasis: 'PER_CONTAINER',
      amount: '100000.00',
    });
    await tariffs.fees.insert({
      ...fee,
      feeCode: 'KM_FEE',
      feeName: 'Phụ phí km',
      calcBasis: 'PER_KM',
      amount: '1000.00',
    });
    await tariffs.fees.insert({
      ...fee,
      feeCode: 'DAY_FEE',
      feeName: 'Phí lưu theo ngày',
      calcBasis: 'PER_DAY',
      amount: '50000.00',
    });

    const order = await newOrder(['20DC', '20DC'], { routeId: route.id });
    await service.confirmOrder(dispatcher, { id: order.id, version: order.version });
    const detail = await freshDetail(order.id);

    const byCode = (code: string) => detail.fees.filter((f) => f.feeCode === code);
    expect(byCode('DOC_FEE')).toHaveLength(2);
    expect(byCode('KM_FEE').map((f) => [f.quantity, f.amount])).toEqual([
      ['60.00', '60000.00'],
      ['60.00', '60000.00'],
    ]);
    expect(byCode('DAY_FEE')).toEqual([]);
    expect(detail.order.totalSurchargeAmount).toBe('320000.00'); // 2 × (100.000 + 60.000)
    expect(detail.order.totalFreightAmount).toBe('2000000.00');
    expect(
      detail.fees
        .filter((f) => f.feeCode === 'LIFT_FEE')
        .every((f) => f.feeCategory === 'PASS_THROUGH'),
    ).toBe(true);
  });

  it('phiên bản cũ trả STALE_DATA; xác nhận lại Order đã xác nhận bị chặn; không ghi trùng phí', async () => {
    const order = await newOrder(['20DC']);
    await service.confirmOrder(dispatcher, { id: order.id, version: order.version });

    await expectAppError(
      service.confirmOrder(dispatcher, { id: order.id, version: order.version }),
      'STALE_DATA',
    );
    await expectAppError(
      service.confirmOrder(dispatcher, { id: order.id, version: order.version + 1 }),
      'INVALID_STATUS_TRANSITION',
    );
    expect((await freshDetail(order.id)).fees).toHaveLength(1);
  });

  it('hai người xác nhận cùng lúc: đúng một lần thành công, phí không bị ghi hai lần', async () => {
    const order = await newOrder(['20DC', '40HC']);
    const results = await Promise.allSettled([
      service.confirmOrder(dispatcher, { id: order.id, version: order.version }),
      service.confirmOrder(owner, { id: order.id, version: order.version }),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect((rejected.reason as AppError).code).toBe('STALE_DATA');
    const fees = await repoA().fees.list(eq(orderFees.orderId, order.id));
    expect(fees).toHaveLength(2);
  });

  it('Order của công ty khác hoặc không tồn tại: NOT_FOUND', async () => {
    const order = await newOrder(['20DC']);

    await expectAppError(
      service.confirmOrder(dispatcherB, { id: order.id, version: order.version }),
      'NOT_FOUND',
    );
    await expectAppError(
      service.confirmOrder(dispatcher, { id: 'khong-ton-tai', version: 0 }),
      'NOT_FOUND',
    );
    const target = (await freshDetail(order.id)).containers[0]!;
    await expectAppError(
      service.setManualPrice(dispatcherB, {
        orderId: order.id,
        containerId: target.id,
        version: 0,
        price: '1000000.00',
        reason: 'Thử',
      }),
      'NOT_FOUND',
    );
  });

  it('chỉ nhập giá tay cho container thuộc đúng Order và chưa hủy', async () => {
    const orderA = await newOrder(['45HC']);
    const orderB = await newOrder(['45HC']);
    const contOfB = (await freshDetail(orderB.id)).containers[0]!;

    await expectAppError(
      service.setManualPrice(dispatcher, {
        orderId: orderA.id,
        containerId: contOfB.id,
        version: orderA.version,
        price: '1000000.00',
        reason: 'Nhầm Order',
      }),
      'NOT_FOUND',
    );
    expect(await repoA().fees.list(and(eq(orderFees.orderId, orderA.id)))).toEqual([]);
  });

  it('giá dự kiến của Order nháp: tra bảng giá không ghi gì; cont không có giá báo thiếu; giá tay giữ nguyên', async () => {
    const order = await newOrder(['20DC', '45HC', '40HC']);
    const detailBefore = await freshDetail(order.id);
    const manual = detailBefore.containers[1]!;

    const first = await service.previewPrices(viewer, [order.id]);
    expect(first[detailBefore.containers[0]!.id]).toMatchObject({
      found: true,
      amount: '1800000.00',
    });
    expect(first[manual.id]).toEqual({ found: false, amount: null, tariffId: null });
    expect(first[detailBefore.containers[2]!.id]).toMatchObject({
      found: true,
      amount: '2400000.00',
    });

    const priced = await service.setManualPrice(dispatcher, {
      orderId: order.id,
      containerId: manual.id,
      version: order.version,
      price: '3100000.00',
      reason: 'Khách báo giá',
    });
    const second = await service.previewPrices(viewer, [order.id]);
    expect(second[manual.id]).toEqual({ found: true, amount: '3100000.00', tariffId: null });

    // Không ghi gì: Order giữ nguyên version, không có phí, không cont nào có tariff.
    const detailAfter = await freshDetail(order.id);
    expect(detailAfter.order.version).toBe(priced.order.version);
    expect(detailAfter.fees).toEqual([]);
    expect(detailAfter.containers.filter((c) => c.freightTariffId)).toEqual([]);
  });

  it('giá dự kiến chỉ cho Order nháp của đúng công ty', async () => {
    const draft = await newOrder(['20DC']);
    const confirmed = await newOrder(['20DC']);
    await service.confirmOrder(dispatcher, { id: confirmed.id, version: confirmed.version });

    const own = await service.previewPrices(dispatcher, [draft.id, confirmed.id]);
    const draftContainer = (await freshDetail(draft.id)).containers[0]!;
    const confirmedContainer = (await freshDetail(confirmed.id)).containers[0]!;

    expect(Object.keys(own)).toEqual([draftContainer.id]);
    expect(own[confirmedContainer.id]).toBeUndefined();
    expect(await service.previewPrices(dispatcherB, [draft.id])).toEqual({});
    expect(await service.previewPrices(dispatcher, [])).toEqual({});
  });
});
