import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppError } from '@shared/errors';
import { startTestInfra, type TestInfra } from '../../test/containers';
import { seedIdentity } from '../../lib/db/seeds/identity';
import { SEED_TENANTS } from '../../lib/db/seeds/identity.test-data';
import { getTenantDb } from '../../lib/db/tenant-db';
import {
  createDriver,
  createTractor,
  createTrailer,
  getDriver,
  listDrivers,
  listTractors,
  softDeleteDriver,
  softDeleteTractor,
  updateDriver,
  updateTractor,
  updateTrailer,
} from './fleet.service';

describe('fleet.service (đầu kéo, rơ moóc, tài xế)', () => {
  let infra: TestInfra;

  beforeAll(async () => {
    infra = await startTestInfra({ redis: false });
    await seedIdentity(infra.db, { password: 'mat-khau-thu-nghiem' });
  });

  afterAll(async () => {
    await infra?.stop();
  });

  const ctxA = (
    role: 'OWNER' | 'ADMIN' | 'FLEET_MANAGER' | 'DISPATCHER' | 'VIEWER' = 'FLEET_MANAGER',
  ) => ({
    tenantId: SEED_TENANTS.phucAn.id,
    userId: '018f0000-0000-7000-8000-000000000001',
    requestId: 'req-test-a',
    role,
    timezone: 'Asia/Ho_Chi_Minh',
  });

  const ctxB = (
    role: 'OWNER' | 'ADMIN' | 'FLEET_MANAGER' | 'DISPATCHER' | 'VIEWER' = 'FLEET_MANAGER',
  ) => ({
    tenantId: SEED_TENANTS.saoViet.id,
    userId: '018f0000-0000-7000-8000-000000000002',
    requestId: 'req-test-b',
    role,
    timezone: 'Asia/Ho_Chi_Minh',
  });

  const tdbA = () => getTenantDb(ctxA(), { db: infra.db });
  const tdbB = () => getTenantDb(ctxB(), { db: infra.db });

  describe('Đầu kéo (tractors)', () => {
    it('tạo đầu kéo thành công và chuẩn hóa biển số thành chữ hoa', async () => {
      const result = await createTractor(ctxA(), tdbA(), {
        plateNumber: '51c-482.17',
        model: 'Hino 700',
        ownership: 'OWNED',
        fuelNormLitersPer100km: '38.00',
        currentOdometer: 120000,
        registrationExpiry: '2026-12-31',
        status: 'AVAILABLE',
      });

      expect(result.plateNumber).toBe('51C-482.17');
      expect(result.model).toBe('Hino 700');
    });

    it('trùng biển số xe cùng tenant bị DUPLICATE_CODE, khác tenant thì được', async () => {
      await createTractor(ctxA(), tdbA(), {
        plateNumber: '51C-888.88',
        fuelNormLitersPer100km: '35.00',
        status: 'AVAILABLE',
      });

      // Cùng tenant tạo lại -> báo lỗi DUPLICATE_CODE
      await expect(
        createTractor(ctxA(), tdbA(), {
          plateNumber: '51c-888.88',
          fuelNormLitersPer100km: '36.00',
          status: 'AVAILABLE',
        }),
      ).rejects.toThrow(AppError);

      try {
        await createTractor(ctxA(), tdbA(), {
          plateNumber: '51C-888.88',
          fuelNormLitersPer100km: '36.00',
          status: 'AVAILABLE',
        });
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        expect((err as AppError).code).toBe('DUPLICATE_CODE');
      }

      // Tenant B tạo cùng biển số đó -> thành công
      const tractorB = await createTractor(ctxB(), tdbB(), {
        plateNumber: '51C-888.88',
        fuelNormLitersPer100km: '36.00',
        status: 'AVAILABLE',
      });
      expect(tractorB.plateNumber).toBe('51C-888.88');
    });

    it('sửa một phần chỉ đổi các trường được gửi, không reset trường còn lại về mặc định', async () => {
      const created = await createTractor(ctxA(), tdbA(), {
        plateNumber: '51C-PAT.01',
        model: 'Howo A7',
        ownership: 'LEASED',
        fuelNormLitersPer100km: '41.50',
        currentOdometer: 98000,
        registrationExpiry: '2027-01-15',
        status: 'MAINTENANCE',
      });
      const updated = await updateTractor(ctxA(), tdbA(), created.id, {
        insuranceExpiry: '2027-03-01',
      });
      expect(updated.insuranceExpiry).toBe('2027-03-01');
      expect(updated.model).toBe('Howo A7');
      expect(updated.ownership).toBe('LEASED');
      expect(updated.fuelNormLitersPer100km).toBe('41.50');
      expect(updated.currentOdometer).toBe(98000);
      expect(updated.registrationExpiry).toBe('2027-01-15');
      expect(updated.status).toBe('MAINTENANCE');

      const trailer = await createTrailer(ctxA(), tdbA(), {
        plateNumber: '51R-PAT.01',
        trailerType: '40FT_COMBO',
        canCarryTwin20: true,
        hasGensetPower: true,
        tareWeightTons: '6.20',
        maxPayloadTons: '30.00',
        status: 'INACTIVE',
      });
      const trailerUpdated = await updateTrailer(ctxA(), tdbA(), trailer.id, {
        inspectionExpiry: '2027-02-02',
      });
      expect(trailerUpdated.canCarryTwin20).toBe(true);
      expect(trailerUpdated.hasGensetPower).toBe(true);
      expect(trailerUpdated.tareWeightTons).toBe('6.20');
      expect(trailerUpdated.maxPayloadTons).toBe('30.00');
      expect(trailerUpdated.status).toBe('INACTIVE');

      const driver = await createDriver(ctxA(), tdbA(), {
        fullName: 'Nguyễn Văn Sửa',
        phone: '0901000002',
        nationalIdNo: '079000000111',
        licenseNo: 'B2-998877',
        employmentType: 'CONTRACT',
        status: 'OFF_DUTY',
      });
      const driverUpdated = await updateDriver(ctxA(), tdbA(), driver.id, {
        licenseExpiry: '2028-05-05',
      });
      expect(driverUpdated.employmentType).toBe('CONTRACT');
      expect(driverUpdated.status).toBe('OFF_DUTY');
      expect(driverUpdated.nationalIdNo).toBe('079000000111');
      expect(driverUpdated.licenseNo).toBe('B2-998877');
    });

    it('xóa mềm đầu kéo thì ẩn khỏi danh sách mặc định', async () => {
      const created = await createTractor(ctxA(), tdbA(), {
        plateNumber: '51C-DEL.99',
        fuelNormLitersPer100km: '35.00',
        status: 'AVAILABLE',
      });

      await softDeleteTractor(ctxA(), tdbA(), created.id);

      const list = await listTractors(ctxA(), tdbA());
      expect(list.map((t) => t.id)).not.toContain(created.id);

      const all = await listTractors(ctxA(), tdbA(), { includeDeleted: true });
      expect(all.map((t) => t.id)).toContain(created.id);
    });
  });

  describe('Rơ moóc (trailers)', () => {
    it('rơ moóc 20FT khai canCarryTwin20 = true bị VALIDATION_ERROR', async () => {
      await expect(
        createTrailer(ctxA(), tdbA(), {
          plateNumber: '51R-202.20',
          trailerType: '20FT',
          canCarryTwin20: true,
          maxPayloadTons: '25.00',
          status: 'AVAILABLE',
        }),
      ).rejects.toThrow();
    });

    it('sửa rơ moóc vẫn chặn 20FT chở Twin 20 (VALIDATION_ERROR)', async () => {
      const combo = await createTrailer(ctxA(), tdbA(), {
        plateNumber: '51R-505.50',
        trailerType: '40FT_COMBO',
        canCarryTwin20: true,
        maxPayloadTons: '28.00',
      });
      // Đổi loại sang 20FT mà vẫn giữ canCarryTwin20 = true.
      await expect(
        updateTrailer(ctxA(), tdbA(), combo.id, { trailerType: '20FT' }),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

      const small = await createTrailer(ctxA(), tdbA(), {
        plateNumber: '51R-606.60',
        trailerType: '20FT',
        maxPayloadTons: '21.00',
      });
      // Bật canCarryTwin20 trên rơ moóc đã là 20FT.
      await expect(
        updateTrailer(ctxA(), tdbA(), small.id, { canCarryTwin20: true }),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
      // Đổi 20FT sang 40FT_COMBO và bật Twin 20 cùng lúc là hợp lệ.
      const ok = await updateTrailer(ctxA(), tdbA(), small.id, {
        trailerType: '40FT_COMBO',
        canCarryTwin20: true,
      });
      expect(ok.canCarryTwin20).toBe(true);
    });

    it('không cho đặt tay trạng thái IN_USE, DROPPED, ON_DUTY (hệ thống tự đặt khi điều xe)', async () => {
      await expect(
        createTractor(ctxA(), tdbA(), {
          plateNumber: '51C-707.70',
          fuelNormLitersPer100km: '35.00',
          status: 'IN_USE' as never,
        }),
      ).rejects.toThrow();
      await expect(
        createDriver(ctxA(), tdbA(), {
          fullName: 'Tài xế thử',
          phone: '0901000001',
          status: 'ON_DUTY' as never,
        }),
      ).rejects.toThrow();
      await expect(
        createTrailer(ctxA(), tdbA(), {
          plateNumber: '51R-808.80',
          trailerType: '40FT',
          maxPayloadTons: '28.00',
          status: 'DROPPED' as never,
        }),
      ).rejects.toThrow();
    });

    it('tạo rơ moóc 40FT_COMBO có canCarryTwin20 thành công', async () => {
      const trailer = await createTrailer(ctxA(), tdbA(), {
        plateNumber: '51R-404.40',
        trailerType: '40FT_COMBO',
        canCarryTwin20: true,
        hasGensetPower: true,
        maxPayloadTons: '32.00',
        status: 'AVAILABLE',
      });

      expect(trailer.canCarryTwin20).toBe(true);
      expect(trailer.hasGensetPower).toBe(true);
    });
  });

  describe('Tài xế (drivers) & Che dữ liệu cá nhân (PII)', () => {
    it('DISPATCHER đọc tài xế nhận số CCCD, GPLX, SĐT đã che, FLEET_MANAGER nhận đầy đủ', async () => {
      const created = await createDriver(ctxA('FLEET_MANAGER'), tdbA(), {
        fullName: 'Nguyễn Văn Tài Xế',
        phone: '0903123456',
        nationalIdNo: '079085001234',
        licenseNo: 'GPLX12345678',
        licenseClass: 'FC',
        licenseExpiry: '2028-10-20',
        dgCertificateNo: 'DG-999',
        dgCertificateExpiry: '2027-10-20',
        employmentType: 'FULL_TIME',
        status: 'AVAILABLE',
      });

      // Đọc bởi FLEET_MANAGER (có quyền)
      const fmView = await getDriver(ctxA('FLEET_MANAGER'), tdbA(), created.id);
      expect(fmView?.phone).toBe('0903123456');
      expect(fmView?.nationalIdNo).toBe('079085001234');
      expect(fmView?.licenseNo).toBe('GPLX12345678');

      // Đọc bởi DISPATCHER (che PI)
      const dispView = await getDriver(ctxA('DISPATCHER'), tdbA(), created.id);
      expect(dispView?.phone).toBe('090xx xxx 456');
      expect(dispView?.nationalIdNo).toBe('079xxxxxx234');
      expect(dispView?.licenseNo).toBe('GPLxxxxxx678');

      // Danh sách đọc bởi DISPATCHER cũng che PII
      const dispList = await listDrivers(ctxA('DISPATCHER'), tdbA());
      const driverInList = dispList.find((d) => d.id === created.id);
      expect(driverInList?.phone).toBe('090xx xxx 456');
    });

    it('xóa mềm tài xế', async () => {
      const created = await createDriver(ctxA('FLEET_MANAGER'), tdbA(), {
        fullName: 'Trần Xóa Mềm',
        phone: '0909888777',
        licenseNo: 'GPLX999',
        status: 'AVAILABLE',
      });

      await softDeleteDriver(ctxA('FLEET_MANAGER'), tdbA(), created.id);

      const list = await listDrivers(ctxA('FLEET_MANAGER'), tdbA());
      expect(list.map((d) => d.id)).not.toContain(created.id);
    });
  });
});
