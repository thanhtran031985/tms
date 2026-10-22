import { validateContainerNo } from '@shared/iso6346';
import { createOrderInputSchema } from '@shared/schemas/orders';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createOrderRepo } from '../../../modules/orders/repo';
import { createOrderService } from '../../../modules/orders/service';
import { startTestInfra, type TestInfra } from '../../../test/containers';
import { getTenantDb } from '../tenant-db';
import { seedIdentity } from './identity';
import { SEED_TENANTS, SEED_USERS } from './identity.test-data';
import { seedMasterData } from './master-data';
import { SEED_CUSTOMERS, SEED_ROUTES } from './master-data.test-data';
import { seedOrders } from './orders';
import { seedTariffs } from './tariffs';

describe('seed Order', () => {
  let infra: TestInfra;

  beforeAll(async () => {
    infra = await startTestInfra({ redis: false });
    await seedIdentity(infra.db, { password: 'mat-khau-thu-nghiem' });
    await seedMasterData(infra.db);
    await seedTariffs(infra.db);
    await seedOrders(infra.db);
    await seedOrders(infra.db); // chạy lại lần hai không sinh trùng
  });

  afterAll(async () => {
    await infra?.stop();
  });

  const repoOf = (tenantId: string) => createOrderRepo(getTenantDb({ tenantId }, { db: infra.db }));
  const repoA = () => repoOf(SEED_TENANTS.phucAn.id);

  it('chạy hai lần không sinh bản ghi trùng', async () => {
    const a = repoA();
    const b = repoOf(SEED_TENANTS.saoViet.id);
    expect(await a.orders.list()).toHaveLength(5);
    expect(await a.containers.list()).toHaveLength(11);
    expect(await a.stops.list()).toHaveLength(11 * 3 + 1); // 11 cont × 3 Stop, riêng cont nội địa có 4 Stop
    expect(await a.fees.list()).toHaveLength(4);
    expect(await a.stopTemplates.list()).toHaveLength(8);
    expect(await b.orders.list()).toHaveLength(1);
    expect(await b.containers.list()).toHaveLength(1);
  });

  it('EXP-2610-044: nháp, 5 cont, mỗi cont một bộ Stop xuất khẩu, có cont chưa có giá', async () => {
    const all = await repoA().orders.list();
    const exp = all.find((o) => o.orderNo === 'EXP-2610-044')!;
    const containers = (await repoA().containers.list()).filter((c) => c.orderId === exp.id);
    const stops = (await repoA().stops.list()).filter((s) => s.orderId === exp.id);

    expect(exp).toMatchObject({ status: 'DRAFT', containerCount: 5, orderType: 'EXPORT' });
    expect(containers).toHaveLength(5);
    expect(stops).toHaveLength(15);
    expect(
      stops
        .filter((s) => s.orderContainerId === containers[0]!.id)
        .sort((x, y) => x.sequenceNo - y.sequenceNo)
        .map((s) => s.stopType),
    ).toEqual(['PICK_EMPTY', 'STUFFING', 'PORT_IN']);
    const unpriced = containers.filter((c) => !c.freightTariffId && !c.isManualPrice);
    expect(unpriced.map((c) => c.containerType)).toContain('45HC');
  });

  it('tổng Order bằng tổng các cont chưa hủy; Order đã hủy không còn cont hoạt động', async () => {
    const orders = await repoA().orders.list();
    const containers = await repoA().containers.list();
    for (const order of orders) {
      const live = containers.filter((c) => c.orderId === order.id && c.status !== 'CANCELLED');
      const freight = live.reduce((sum, c) => sum + Number(c.baseFreightAmount), 0);
      expect(order.containerCount, order.orderNo).toBe(live.length);
      expect(Number(order.totalFreightAmount), order.orderNo).toBe(freight);
    }
    const cancelled = orders.find((o) => o.status === 'CANCELLED')!;
    expect(cancelled.containerCount).toBe(0);
  });

  it('bộ đếm orderNo đi sau số mẫu: Order mới không trùng EXP-2610-044', async () => {
    const service = createOrderService({
      tenantDb: (ctx) => getTenantDb(ctx, { db: infra.db }),
      now: () => new Date('2026-10-22T05:00:00.000Z'),
    });
    const created = await service.createOrder(
      {
        tenantId: SEED_TENANTS.phucAn.id,
        userId: SEED_USERS.hungDv.id,
        role: 'DISPATCHER',
        requestId: 'seed-test',
        timezone: 'Asia/Ho_Chi_Minh',
      },
      createOrderInputSchema.parse({
        customerId: SEED_CUSTOMERS.vsip.id,
        orderType: 'EXPORT',
        bookingOrBlNo: 'seed-check',
        routeId: SEED_ROUTES[0].id,
        containers: [{ containerType: '20DC' }],
      }),
    );

    expect(created.order.orderNo).toBe('EXP-2610-047');
  });

  it('mọi số container mẫu đều đúng check digit ISO 6346', async () => {
    const numbers = (await repoA().containers.list())
      .map((c) => c.containerNo)
      .filter((no): no is string => no !== null);
    expect(numbers.length).toBeGreaterThan(0);
    for (const no of numbers) expect(validateContainerNo(no).ok, no).toBe(true);
  });

  it('có cont giá tay (không có bảng giá nguồn) và cont theo giá riêng của khách', async () => {
    const containers = await repoA().containers.list();
    const manual = containers.filter((c) => c.isManualPrice);
    expect(manual).toHaveLength(1);
    expect(manual[0]).toMatchObject({ baseFreightAmount: '2100000.00', freightTariffId: null });
    expect(containers.filter((c) => c.freightTariffId)).toHaveLength(3);
  });

  it('đơn DOMESTIC sinh Stop theo mẫu của tuyến', async () => {
    const orders = await repoA().orders.list();
    const dom = orders.find((o) => o.orderType === 'DOMESTIC')!;
    const templates = (await repoA().stopTemplates.list())
      .filter((t) => t.routeId === dom.routeId)
      .sort((x, y) => x.sequenceNo - y.sequenceNo)
      .map((t) => t.stopType);
    const stops = (await repoA().stops.list())
      .filter((s) => s.orderId === dom.id)
      .sort((x, y) => x.sequenceNo - y.sequenceNo)
      .map((s) => s.stopType);

    expect(stops).toEqual(templates);
  });
});
