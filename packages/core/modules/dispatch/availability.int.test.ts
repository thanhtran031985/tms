// listResourceAvailability: mọi tài xế/đầu kéo/rơ moóc kèm lý do được hoặc không được điều, không khóa dòng nào (bảng gán xe Screen03).
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SEED_USERS } from '../../lib/db/seeds/identity.test-data';
import type { ResourceAvailability } from './index';
import {
  A,
  at,
  B,
  createWorld,
  ctxOf,
  dispatcher,
  dispatcherB,
  expectAppError,
  NOW,
  type World,
} from './dispatch.test-world';

const WINDOW = { start: at('01:00'), end: at('05:00') };
const accountant = ctxOf(A, SEED_USERS.accountant.id, 'ACCOUNTANT');

describe('listResourceAvailability', () => {
  let w: World;

  beforeAll(async () => {
    w = await createWorld();
  });

  afterAll(async () => {
    await w?.stop();
  });

  const list = (orderContainerId: string, ctx = dispatcher) =>
    w.service.listResourceAvailability(ctx, {
      orderContainerId,
      start: WINDOW.start,
      end: WINDOW.end,
    });
  const find = (items: ResourceAvailability[], id: string) => items.find((i) => i.id === id)!;
  const codes = (item: ResourceAvailability) => item.reasons.map((r) => r.code);

  it('tài nguyên rảnh: available và lý do AVAILABLE ("Rảnh trong khung giờ này")', async () => {
    const r = await w.newResources();
    const { container } = await w.newContainer({ status: 'PENDING' });

    const result = await list(container.id);

    for (const [items, id] of [
      [result.drivers, r.driver.id],
      [result.tractors, r.tractor.id],
      [result.trailers, r.trailer.id],
    ] as const) {
      expect(find(items, id)).toMatchObject({
        available: true,
        reasons: [expect.objectContaining({ code: 'AVAILABLE', severity: 'info' })],
      });
    }
    expect(find(result.drivers, r.driver.id).label).toBe(r.driver.fullName);
    expect(find(result.tractors, r.tractor.id).label).toBe(r.tractor.plateNumber);
  });

  it('trùng giờ, nghỉ phép, ngừng dùng, bảo dưỡng: không available kèm mã lỗi và lý do', async () => {
    const busy = await w.newResources();
    const other = await w.newTrip(WINDOW);
    await w.assign(dispatcher, other.trip.id, busy.ids);
    const off = await w.newDriver(A, { status: 'OFF_DUTY' });
    const inactive = await w.newTractor(A, { status: 'INACTIVE' });
    const inMaintenance = await w.newTrailer();
    await w.fleet().maintenanceOrders.insert({
      trailerId: inMaintenance.id,
      type: 'TIRE',
      plannedStart: at('00:00'),
      plannedEnd: at('03:00'),
      status: 'PLANNED',
    });
    const { container } = await w.newContainer({ status: 'PENDING' });

    const result = await list(container.id);

    expect(find(result.drivers, busy.driver.id)).toMatchObject({ available: false });
    expect(codes(find(result.drivers, busy.driver.id))).toContain('RESOURCE_TIME_CONFLICT');
    expect(find(result.tractors, busy.tractor.id).reasons[0]).toMatchObject({
      severity: 'danger',
      details: expect.objectContaining({ resource: 'TRACTOR', reason: 'TIME_CONFLICT' }),
    });
    expect(find(result.drivers, off.id)).toMatchObject({ available: false });
    expect(find(result.drivers, off.id).reasons[0]!.details).toMatchObject({ reason: 'OFF_DUTY' });
    expect(find(result.tractors, inactive.id)).toMatchObject({ available: false });
    expect(find(result.trailers, inMaintenance.id).reasons[0]!.details).toMatchObject({
      reason: 'MAINTENANCE',
    });
  });

  it('giấy tờ hết hạn chặn, sắp hết hạn vẫn available kèm cảnh báo số ngày', async () => {
    const expired = await w.newTractor(A, { registrationExpiry: '2026-10-01' });
    const expiring = await w.newDriver(A, { licenseExpiry: '2026-10-28' });
    const { container } = await w.newContainer({ status: 'PENDING' });

    const result = await list(container.id);

    expect(find(result.tractors, expired.id)).toMatchObject({ available: false });
    expect(codes(find(result.tractors, expired.id))).toContain('DOCUMENT_EXPIRED');
    const warned = find(result.drivers, expiring.id);
    expect(warned.available).toBe(true);
    expect(warned.reasons).toContainEqual(
      expect.objectContaining({
        code: 'DOCUMENT_EXPIRING',
        severity: 'warn',
        message: expect.stringContaining('2 ngày'),
      }),
    );
  });

  it('cont lạnh: rơ moóc không genset không available, có genset thì available', async () => {
    const plain = await w.newTrailer();
    const genset = await w.newTrailer(A, { hasGensetPower: true });
    const { container } = await w.newContainer({ containerType: '40RF', status: 'PENDING' });

    const result = await list(container.id);

    expect(find(result.trailers, plain.id)).toMatchObject({ available: false });
    expect(codes(find(result.trailers, plain.id))).toContain('REEFER_REQUIRES_GENSET');
    expect(find(result.trailers, genset.id).available).toBe(true);
  });

  it('hàng nguy hiểm: tài xế không có chứng chỉ không available', async () => {
    const noCert = await w.newDriver();
    const withCert = await w.newDriver(A, {
      dgCertificateNo: 'DG-9',
      dgCertificateExpiry: '2030-01-01',
    });
    const { container } = await w.newContainer({ isDangerousGoods: true, status: 'PENDING' });

    const result = await list(container.id);

    expect(codes(find(result.drivers, noCert.id))).toContain('DG_CERTIFICATE_REQUIRED');
    expect(find(result.drivers, withCert.id).available).toBe(true);
  });

  it('khối lượng vượt tải trọng rơ moóc: rơ moóc đó không available', async () => {
    const small = await w.newTrailer(A, { maxPayloadTons: '20.00' });
    const big = await w.newTrailer(A, { maxPayloadTons: '30.00' });
    const { container } = await w.newContainer({ vgmTons: '25.00', status: 'PENDING' });

    const result = await list(container.id);

    expect(codes(find(result.trailers, small.id))).toContain('PAYLOAD_EXCEEDED');
    expect(find(result.trailers, big.id).available).toBe(true);
  });

  it('tài xế đã đủ 10 giờ trong ngày: không available (DRIVING_HOURS_EXCEEDED)', async () => {
    const driver = await w.newDriver();
    const other = await w.newResources();
    const long = await w.newTrip({ start: at('06:00'), end: at('15:30') });
    await w.assign(dispatcher, long.trip.id, { ...other.ids, driverId: driver.id });
    const { container } = await w.newContainer({ status: 'PENDING' });

    const result = await list(container.id);

    expect(codes(find(result.drivers, driver.id))).toContain('DRIVING_HOURS_EXCEEDED');
  });

  it('chuyến hiện tại của chính container không tính là trùng giờ với tài nguyên đang được gán cho nó', async () => {
    const r = await w.newResources();
    const { trip, containerId } = await w.newTrip(WINDOW);
    await w.assign(dispatcher, trip.id, r.ids);

    const result = await list(containerId);

    expect(find(result.drivers, r.driver.id).available).toBe(true);
    expect(find(result.tractors, r.tractor.id).available).toBe(true);
  });

  it('không lộ tài nguyên của tenant khác và không có tài nguyên đã xóa mềm', async () => {
    const otherTenant = await w.newDriver(B);
    const deleted = await w.newTractor();
    await w.fleet().tractors.setDeleted(deleted.id, new Date());
    const { container } = await w.newContainer({ status: 'PENDING' });

    const result = await list(container.id);

    expect(result.drivers.map((d) => d.id)).not.toContain(otherTenant.id);
    expect(result.tractors.map((t) => t.id)).not.toContain(deleted.id);
    await expectAppError(list(container.id, dispatcherB), 'NOT_FOUND');
  });

  it('không khóa dòng nào: trả ngay dù một giao dịch khác đang giữ khóa tài xế', async () => {
    const r = await w.newResources();
    const { container } = await w.newContainer({ status: 'PENDING' });
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    let locked!: () => void;
    const acquired = new Promise<void>((resolve) => (locked = resolve));
    const holder = w.infra.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM drivers WHERE id = ${r.driver.id} FOR UPDATE`);
      locked();
      await held;
    });
    await acquired;

    const started = Date.now();
    try {
      const result = await list(container.id);
      expect(find(result.drivers, r.driver.id).available).toBe(true);
      expect(Date.now() - started).toBeLessThan(3000);
    } finally {
      release();
      await holder;
    }
  });

  it('vai trò không có quyền xem điều vận (Kế toán): FORBIDDEN', async () => {
    const { container } = await w.newContainer({ status: 'PENDING' });

    await expectAppError(list(container.id, accountant), 'FORBIDDEN');
    expect(NOW).toBeInstanceOf(Date);
  });
});
