import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedIdentity } from '../../lib/db/seeds/identity';
import { SEED_TENANTS } from '../../lib/db/seeds/identity.test-data';
import { seedMasterData } from '../../lib/db/seeds/master-data';
import { SEED_CUSTOMERS, SEED_ROUTES } from '../../lib/db/seeds/master-data.test-data';
import { getTenantDb } from '../../lib/db/tenant-db';
import { startTestInfra, type TestInfra } from '../../test/containers';
import { createOrderRepo } from './repo';

const customerA = SEED_CUSTOMERS.thepNamLong.id;
const routeA = SEED_ROUTES[0].id; // CL-ST của Phúc An

describe('orders repo: cách ly tenant', () => {
  let infra: TestInfra;

  beforeAll(async () => {
    infra = await startTestInfra({ redis: false });
    await seedIdentity(infra.db, { password: 'mat-khau-thu-nghiem' });
    await seedMasterData(infra.db);
  });

  afterAll(async () => {
    await infra?.stop();
  });

  const repoOf = (tenantId: string) => createOrderRepo(getTenantDb({ tenantId }, { db: infra.db }));
  const repoA = () => repoOf(SEED_TENANTS.phucAn.id);
  const repoB = () => repoOf(SEED_TENANTS.saoViet.id);

  // Mẫu Stop là duy nhất theo (tuyến, thứ tự) nên mỗi lần dựng cây dùng một thứ tự riêng.
  let templateSeq = 0;
  async function createOrderTree(orderNo: string) {
    const repo = repoA();
    const order = await repo.orders.insert({
      orderNo,
      customerId: customerA,
      orderType: 'IMPORT',
      bookingOrBlNo: `BL-${orderNo}`,
      routeId: routeA,
    });
    const container = await repo.containers.insert({
      orderId: order.id,
      lineNo: 1,
      routeId: routeA,
      containerNo: 'MSKU1234565',
      containerType: '20DC',
    });
    const stop = await repo.stops.insert({
      orderId: order.id,
      orderContainerId: container.id,
      sequenceNo: 1,
      stopType: 'PICK_FULL',
      locationName: 'Cát Lái',
    });
    const fee = await repo.fees.insert({
      orderId: order.id,
      orderContainerId: container.id,
      feeCategory: 'PASS_THROUGH',
      feeCode: 'LIFT_FEE',
      source: 'TARIFF',
      amount: '600000.00',
    });
    const template = await repo.stopTemplates.insert({
      routeId: routeA,
      sequenceNo: (templateSeq += 1),
      stopType: 'PICK_EMPTY',
    });
    return { order, container, stop, fee, template };
  }

  it('orders: tenant B không đọc, không sửa, không xóa được Order của tenant A', async () => {
    const { order } = await createOrderTree('IMP-2610-901');

    expect(order.tenantId).toBe(SEED_TENANTS.phucAn.id);
    expect((await repoB().orders.list()).map((r) => r.id)).not.toContain(order.id);
    expect(await repoB().orders.get(order.id)).toBeUndefined();
    expect(await repoB().orders.update(order.id, { cargoDescription: 'x' })).toBe(0);
    expect((await repoA().orders.get(order.id))?.cargoDescription).toBeNull();
  });

  it('order_containers: tenant B không đọc, không sửa, không xóa được container của tenant A', async () => {
    const { container } = await createOrderTree('IMP-2610-902');

    expect((await repoB().containers.list()).map((r) => r.id)).not.toContain(container.id);
    expect(await repoB().containers.get(container.id)).toBeUndefined();
    expect(await repoB().containers.update(container.id, { sealNo: 'X' })).toBe(0);
    expect(await repoB().containers.remove(container.id)).toBe(0);
    expect((await repoA().containers.get(container.id))?.sealNo).toBeNull();
  });

  it('order_stops: tenant B không đọc, không sửa, không xóa được Stop của tenant A', async () => {
    const { stop } = await createOrderTree('IMP-2610-903');

    expect((await repoB().stops.list()).map((r) => r.id)).not.toContain(stop.id);
    expect(await repoB().stops.get(stop.id)).toBeUndefined();
    expect(await repoB().stops.update(stop.id, { status: 'COMPLETED' })).toBe(0);
    expect(await repoB().stops.remove(stop.id)).toBe(0);
    expect((await repoA().stops.get(stop.id))?.status).toBe('PENDING');
  });

  it('order_fees: tenant B không đọc, không sửa, không xóa được phí của tenant A', async () => {
    const { fee } = await createOrderTree('IMP-2610-904');

    expect((await repoB().fees.list()).map((r) => r.id)).not.toContain(fee.id);
    expect(await repoB().fees.get(fee.id)).toBeUndefined();
    expect(await repoB().fees.update(fee.id, { amount: '1.00' })).toBe(0);
    expect(await repoB().fees.remove(fee.id)).toBe(0);
    expect((await repoA().fees.get(fee.id))?.amount).toBe('600000.00');
  });

  it('route_stop_templates: tenant B không đọc, không sửa, không xóa được mẫu Stop của tenant A', async () => {
    const { template } = await createOrderTree('IMP-2610-905');

    expect((await repoB().stopTemplates.list()).map((r) => r.id)).not.toContain(template.id);
    expect(await repoB().stopTemplates.get(template.id)).toBeUndefined();
    expect(await repoB().stopTemplates.update(template.id, { stopType: 'STUFFING' })).toBe(0);
    expect(await repoB().stopTemplates.remove(template.id)).toBe(0);
    expect((await repoA().stopTemplates.get(template.id))?.stopType).toBe('PICK_EMPTY');
  });

  it('giá trị mặc định: Order nháp, số tiền 0.00 VND, cont chờ, SINGLE, chưa có giá tay', async () => {
    const { order, container } = await createOrderTree('IMP-2610-906');
    const savedOrder = await repoA().orders.get(order.id);
    const savedContainer = await repoA().containers.get(container.id);

    expect(savedOrder).toMatchObject({
      status: 'DRAFT',
      version: 0,
      containerCount: 0,
      totalFreightAmount: '0.00',
      currency: 'VND',
      isEpodVerified: false,
    });
    expect(savedContainer).toMatchObject({
      status: 'PENDING',
      version: 0,
      appliedTripMode: 'SINGLE',
      portReadinessStatus: 'PENDING',
      baseFreightAmount: '0.00',
      isManualPrice: false,
      freightTariffId: null,
    });
  });

  it('số Order trùng trong cùng tenant bị chặn, khác tenant thì được', async () => {
    await createOrderTree('IMP-2610-907');

    await expect(createOrderTree('IMP-2610-907')).rejects.toThrow();
    await expect(
      repoB().orders.insert({
        orderNo: 'IMP-2610-907',
        customerId: SEED_CUSTOMERS.saoVietThep.id,
        orderType: 'IMPORT',
        bookingOrBlNo: 'BL-B',
        routeId: SEED_ROUTES[3].id,
      }),
    ).resolves.toMatchObject({ tenantId: SEED_TENANTS.saoViet.id });
  });

  it('thứ tự cont và thứ tự Stop không trùng trong cùng cont', async () => {
    const { order, container } = await createOrderTree('IMP-2610-908');

    await expect(
      repoA().containers.insert({
        orderId: order.id,
        lineNo: 1,
        routeId: routeA,
        containerType: '40HC',
      }),
    ).rejects.toThrow();
    await expect(
      repoA().stops.insert({
        orderId: order.id,
        orderContainerId: container.id,
        sequenceNo: 1,
        stopType: 'UNSTUFFING',
        locationName: 'Sóng Thần',
      }),
    ).rejects.toThrow();
  });
});
