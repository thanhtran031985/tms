import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppError } from '@shared/errors';
import type { RequestContext } from '../../lib/context';
import { seedIdentity } from '../../lib/db/seeds/identity';
import { SEED_TENANTS, SEED_USERS } from '../../lib/db/seeds/identity.test-data';
import { getTenantDb } from '../../lib/db/tenant-db';
import { startTestInfra, type TestInfra } from '../../test/containers';
import { createMasterDataService, type MasterDataService } from './service';

const ctxOf = (tenantId: string, userId: string): RequestContext => ({
  tenantId,
  userId,
  role: 'ADMIN',
  requestId: 'test',
  timezone: 'Asia/Ho_Chi_Minh',
});

async function expectAppError(promise: Promise<unknown>, code: string) {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(AppError);
  expect((error as AppError).code).toBe(code);
  return error as AppError;
}

describe('master-data service', () => {
  let infra: TestInfra;
  let service: MasterDataService;
  const a = ctxOf(SEED_TENANTS.phucAn.id, SEED_USERS.admin.id);
  const b = ctxOf(SEED_TENANTS.saoViet.id, SEED_USERS.admin.id);

  beforeAll(async () => {
    infra = await startTestInfra({ redis: false });
    await seedIdentity(infra.db, { password: 'mat-khau-thu-nghiem' });
    service = createMasterDataService({ tenantDb: (ctx) => getTenantDb(ctx, { db: infra.db }) });
  });

  afterAll(async () => {
    await infra?.stop();
  });

  const customer = (code: string, extra: Record<string, unknown> = {}) => ({
    code,
    name: `Khách ${code}`,
    taxCode: null,
    billingAddress: null,
    paymentTermDays: 30,
    creditLimit: null,
    ...extra,
  });

  const vendor = (code: string) => ({
    code,
    name: `NCC ${code}`,
    taxCode: null,
    type: 'GARAGE' as const,
    paymentTermDays: 30,
  });

  const location = (code: string, extra: Record<string, unknown> = {}) => ({
    code,
    type: 'WAREHOUSE' as const,
    name: `Kho ${code}`,
    address: null,
    customerId: null,
    vendorId: null,
    lat: '10.900000',
    lng: '106.750000',
    geofenceRadiusM: 300,
    zone: null,
    ...extra,
  });

  describe('trùng mã', () => {
    it('trùng mã khách trong cùng tenant trả DUPLICATE_CODE', async () => {
      await service.create(a, 'customers', customer('DUP-1'));
      const error = await expectAppError(
        service.create(a, 'customers', customer('DUP-1')),
        'DUPLICATE_CODE',
      );
      expect(error.message).toContain('DUP-1');
      expect(error.details?.field).toBe('code');
      expect(error.details?.deletedId).toBeUndefined();
    });

    it('khác tenant dùng cùng mã khách vẫn được', async () => {
      await service.create(a, 'customers', customer('CHUNG-1'));
      const created = await service.create(b, 'customers', customer('CHUNG-1'));
      expect(created.tenantId).toBe(b.tenantId);
    });

    it('hãng tàu và tuyến: trùng cùng tenant bị chặn, khác tenant được', async () => {
      const line = { code: 'HT1', name: 'Hãng', allowsStreetTurn: false };
      await service.create(a, 'shippingLines', line);
      await expectAppError(service.create(a, 'shippingLines', line), 'DUPLICATE_CODE');
      await service.create(b, 'shippingLines', line);

      const route = {
        routeCode: 'T1',
        name: 'Tuyến',
        originZone: 'A',
        destinationZone: 'B',
        standardDistanceKm: 10,
      };
      await service.create(a, 'routes', route);
      await expectAppError(service.create(a, 'routes', route), 'DUPLICATE_CODE');
      await service.create(b, 'routes', route);
    });

    it('nhà cung cấp và địa điểm có mã duy nhất theo tenant', async () => {
      await service.create(a, 'vendors', vendor('NCC1'));
      await expectAppError(service.create(a, 'vendors', vendor('NCC1')), 'DUPLICATE_CODE');
      await service.create(b, 'vendors', vendor('NCC1'));

      await service.create(a, 'locations', location('DD1'));
      await expectAppError(service.create(a, 'locations', location('DD1')), 'DUPLICATE_CODE');
      await service.create(b, 'locations', location('DD1'));
    });

    it('sửa mã sang mã đã có của bản ghi khác bị chặn, giữ mã của chính mình thì được', async () => {
      const one = await service.create(a, 'customers', customer('SUA-1'));
      await service.create(a, 'customers', customer('SUA-2'));

      await expectAppError(
        service.update(a, 'customers', one.id, customer('SUA-2')),
        'DUPLICATE_CODE',
      );
      const same = await service.update(
        a,
        'customers',
        one.id,
        customer('SUA-1', { name: 'Tên mới' }),
      );
      expect(same.name).toBe('Tên mới');
    });

    it('tạo song song cùng mã chỉ một lần thành công, các lần kia DUPLICATE_CODE', async () => {
      const results = await Promise.allSettled(
        Array.from({ length: 8 }, () => service.create(a, 'customers', customer('DUA'))),
      );
      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
      expect(fulfilled).toHaveLength(1);
      for (const r of rejected) expect((r.reason as AppError).code).toBe('DUPLICATE_CODE');
    });
  });

  describe('xóa mềm và khôi phục', () => {
    it('bản ghi đã xóa mềm không hiện trong danh sách nhưng vẫn lấy được theo id', async () => {
      const created = await service.create(a, 'customers', customer('XOA-1'));
      await service.softDelete(a, 'customers', created.id);

      const list = await service.list(a, 'customers');
      expect(list.map((r) => r.id)).not.toContain(created.id);
      expect((await service.get(a, 'customers', created.id)).deletedAt).not.toBeNull();
    });

    it('tạo lại mã đã xóa mềm trả DUPLICATE_CODE kèm deletedId; restore đưa về danh sách', async () => {
      const created = await service.create(a, 'customers', customer('XOA-2'));
      await service.softDelete(a, 'customers', created.id);

      const error = await expectAppError(
        service.create(a, 'customers', customer('XOA-2')),
        'DUPLICATE_CODE',
      );
      expect(error.details?.deletedId).toBe(created.id);

      const restored = await service.restore(a, 'customers', created.id);
      expect(restored.deletedAt).toBeNull();
      expect((await service.list(a, 'customers')).map((r) => r.id)).toContain(created.id);
    });

    it('không xóa mềm, khôi phục, sửa, xem được bản ghi của tenant khác', async () => {
      const created = await service.create(a, 'customers', customer('XOA-3'));

      await expectAppError(service.softDelete(b, 'customers', created.id), 'NOT_FOUND');
      await expectAppError(service.restore(b, 'customers', created.id), 'NOT_FOUND');
      await expectAppError(
        service.update(b, 'customers', created.id, customer('XOA-3')),
        'NOT_FOUND',
      );
      await expectAppError(service.get(b, 'customers', created.id), 'NOT_FOUND');
    });

    it('không sửa được bản ghi đã xóa mềm', async () => {
      const created = await service.create(a, 'customers', customer('XOA-4'));
      await service.softDelete(a, 'customers', created.id);
      await expectAppError(
        service.update(a, 'customers', created.id, customer('XOA-4', { name: 'Mới' })),
        'NOT_FOUND',
      );
    });
  });

  describe('địa điểm tham chiếu cùng tenant', () => {
    it('gắn khách của tenant mình thì được', async () => {
      const owner = await service.create(a, 'customers', customer('CHU-1'));
      const created = await service.create(
        a,
        'locations',
        location('KHO-1', { customerId: owner.id }),
      );
      expect(created.customerId).toBe(owner.id);
    });

    it('gắn customerId hoặc vendorId của tenant khác bị NOT_FOUND', async () => {
      const otherCustomer = await service.create(b, 'customers', customer('CHU-B'));
      const otherVendor = await service.create(b, 'vendors', vendor('NCC-B'));

      await expectAppError(
        service.create(a, 'locations', location('KHO-2', { customerId: otherCustomer.id })),
        'NOT_FOUND',
      );
      await expectAppError(
        service.create(a, 'locations', location('KHO-3', { vendorId: otherVendor.id })),
        'NOT_FOUND',
      );
    });

    it('gắn khách đã xóa mềm bị NOT_FOUND; sửa địa điểm cũng kiểm tra tham chiếu', async () => {
      const gone = await service.create(a, 'customers', customer('CHU-2'));
      await service.softDelete(a, 'customers', gone.id);
      await expectAppError(
        service.create(a, 'locations', location('KHO-4', { customerId: gone.id })),
        'NOT_FOUND',
      );

      const existing = await service.create(a, 'locations', location('KHO-5'));
      const foreign = await service.create(b, 'customers', customer('CHU-B2'));
      await expectAppError(
        service.update(a, 'locations', existing.id, location('KHO-5', { customerId: foreign.id })),
        'NOT_FOUND',
      );
    });
  });

  it('createdBy ghi người tạo; danh sách sắp theo tên', async () => {
    const created = await service.create(a, 'customers', customer('SX-1', { name: 'Zeta' }));
    expect(created.createdBy).toBe(a.userId);
    await service.create(a, 'customers', customer('SX-2', { name: 'Alpha' }));
    const names = (await service.list(a, 'customers')).map((r) => r.name);
    expect(names).toEqual([...names].sort((x, y) => x.localeCompare(y, 'vi')));
  });

  it('updateCustomerBilling chỉ đổi 4 trường thanh toán, giữ nguyên mã và tên', async () => {
    const created = await service.create(a, 'customers', customer('BILL-1'));
    const updated = await service.updateCustomerBilling(a, created.id, {
      taxCode: '0301234567',
      billingAddress: '1 Lê Lợi',
      paymentTermDays: 45,
      creditLimit: '5000000.00',
    });
    expect(updated.taxCode).toBe('0301234567');
    expect(updated.paymentTermDays).toBe(45);
    expect(updated.creditLimit).toBe('5000000.00');
    expect(updated.code).toBe('BILL-1');
    expect(updated.name).toBe('Khách BILL-1');
  });
});
