import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestInfra, type TestInfra } from '../../test/containers';
import { seedIdentity } from '../../lib/db/seeds/identity';
import { SEED_TENANTS } from '../../lib/db/seeds/identity.test-data';
import { getTenantDb } from '../../lib/db/tenant-db';
import type { RequestContext } from '../../lib/context';
import { createTractor, createTrailer, createDriver } from './fleet.service';
import { listExpiringDocuments } from './documents.service';

describe('documents.service (rà soát hạn giấy tờ đội xe & tài xế)', () => {
  let infra: TestInfra;

  beforeAll(async () => {
    infra = await startTestInfra();
    await seedIdentity(infra.db, { password: 'test-password' });
  }, 120_000);

  afterAll(async () => {
    await infra?.stop();
  });

  const tenantA = SEED_TENANTS.phucAn.id;
  const ctxA = (timezone = 'Asia/Ho_Chi_Minh'): RequestContext => ({
    tenantId: tenantA,
    userId: '00000000-0000-0000-0000-000000000001',
    role: 'FLEET_MANAGER',
    timezone,
    requestId: 'req-doc-test',
  });
  const tdbA = () => getTenantDb(ctxA());

  const runId = Math.random().toString(36).slice(2, 6).toUpperCase();

  it('rà soát đúng từng loại giấy tờ: đăng kiểm, bảo hiểm, phù hiệu, kiểm định rơ moóc, GPLX, chứng chỉ hàng nguy hiểm', async () => {
    // Cố định mốc thời gian: 2026-10-20
    const refDate = new Date('2026-10-20T08:00:00.000Z');

    // 1. Đầu kéo có: đăng kiểm hết hạn hôm qua (2026-10-19), bảo hiểm hết hạn ngày 15 (2026-11-04), phù hiệu 6 tháng sau (2027-04-01)
    const tractor = await createTractor(ctxA(), tdbA(), {
      plateNumber: `51C-${runId}.01`,
      fuelNormLitersPer100km: '34.00',
      registrationExpiry: '2026-10-19', // -1 ngày: đã hết hạn
      insuranceExpiry: '2026-11-04',    // +15 ngày: sắp hết hạn (ngày thứ 15)
      transportBadgeExpiry: '2027-04-01', // xa: không tính
    });

    // 2. Rơ moóc có: kiểm định hết hạn hôm nay (2026-10-20)
    const trailer = await createTrailer(ctxA(), tdbA(), {
      plateNumber: `51R-${runId}.01`,
      trailerType: '40FT',
      maxPayloadTons: '30.00',
      inspectionExpiry: '2026-10-20',   // 0 ngày: hôm nay
    });

    // 3. Tài xế có: GPLX hết hạn ngày mai (2026-10-21), chứng chỉ DG hết hạn ngày thứ 16 (2026-11-05)
    const driver = await createDriver(ctxA(), tdbA(), {
      fullName: 'Tài Xế Hạn Giấy Tờ',
      phone: '0901112233',
      licenseNo: 'GPLX-EXP-01',
      licenseExpiry: '2026-10-21',       // +1 ngày: ngày mai
      dgCertificateNo: 'DG-EXP-01',
      dgCertificateExpiry: '2026-11-05', // +16 ngày: ngoài khoảng 15 ngày
    });

    // Gọi listExpiringDocuments với mốc thời gian refDate
    const items = await listExpiringDocuments(ctxA(), tdbA(), {
      withinDays: 15,
      referenceDate: refDate,
    });

    // Phải tìm thấy 3 giấy tờ trong diện cảnh báo (1 đã hết hạn, 1 hôm nay, 1 ngày mai, 1 ngày 15)
    // Chứng chỉ DG ngày thứ 16 và phù hiệu 2027 không được nằm trong danh sách 15 ngày
    const tractorReg = items.find(
      (i) => i.targetId === tractor.id && i.documentType === 'REGISTRATION',
    );
    expect(tractorReg).toBeDefined();
    expect(tractorReg?.daysRemaining).toBe(-1);
    expect(tractorReg?.isExpired).toBe(true);
    expect(tractorReg?.isExpiringSoon).toBe(false);

    const tractorIns = items.find(
      (i) => i.targetId === tractor.id && i.documentType === 'INSURANCE',
    );
    expect(tractorIns).toBeDefined();
    expect(tractorIns?.daysRemaining).toBe(15);
    expect(tractorIns?.isExpired).toBe(false);
    expect(tractorIns?.isExpiringSoon).toBe(true);

    const trailerInsp = items.find(
      (i) => i.targetId === trailer.id && i.documentType === 'TRAILER_INSPECTION',
    );
    expect(trailerInsp).toBeDefined();
    expect(trailerInsp?.daysRemaining).toBe(0);
    expect(trailerInsp?.isExpired).toBe(false);
    expect(trailerInsp?.isExpiringSoon).toBe(true);

    const driverLic = items.find(
      (i) => i.targetId === driver.id && i.documentType === 'DRIVER_LICENSE',
    );
    expect(driverLic).toBeDefined();
    expect(driverLic?.daysRemaining).toBe(1);
    expect(driverLic?.isExpired).toBe(false);
    expect(driverLic?.isExpiringSoon).toBe(true);

    // Chứng chỉ hàng nguy hiểm ngày 16 không nằm trong list 15 ngày
    const driverDg = items.find(
      (i) => i.targetId === driver.id && i.documentType === 'DG_CERTIFICATE',
    );
    expect(driverDg).toBeUndefined();

    // Phù hiệu 2027 không nằm trong list
    const tractorBadge = items.find(
      (i) => i.targetId === tractor.id && i.documentType === 'TRANSPORT_BADGE',
    );
    expect(tractorBadge).toBeUndefined();
  });

  it('tách bạch bộ lọc SẮP HẾT HẠN và ĐÃ HẾT HẠN', async () => {
    const refDate = new Date('2026-10-20T08:00:00.000Z');

    const expiredOnly = await listExpiringDocuments(ctxA(), tdbA(), {
      withinDays: 15,
      referenceDate: refDate,
      filter: 'EXPIRED',
    });
    expect(expiredOnly.length).toBeGreaterThan(0);
    for (const item of expiredOnly) {
      expect(item.daysRemaining).toBeLessThan(0);
      expect(item.isExpired).toBe(true);
    }

    const expiringSoonOnly = await listExpiringDocuments(ctxA(), tdbA(), {
      withinDays: 15,
      referenceDate: refDate,
      filter: 'EXPIRING_SOON',
    });
    expect(expiringSoonOnly.length).toBeGreaterThan(0);
    for (const item of expiringSoonOnly) {
      expect(item.daysRemaining).toBeGreaterThanOrEqual(0);
      expect(item.daysRemaining).toBeLessThanOrEqual(15);
      expect(item.isExpiringSoon).toBe(true);
    }
  });

  it('ranh giới ngày tính theo múi giờ tenant (23:30 giờ VN vs 00:30 hôm sau)', async () => {
    // Tạo 1 xe có đăng kiểm vào ngày 2026-10-21
    const t = await createTractor(ctxA(), tdbA(), {
      plateNumber: `51C-${runId}.99`,
      fuelNormLitersPer100km: '32.00',
      registrationExpiry: '2026-10-21',
    });

    // Mốc 1: 2026-10-20 16:30:00 UTC = 2026-10-20 23:30:00 VN -> còn 1 ngày
    const ref23h30 = new Date('2026-10-20T16:30:00.000Z');
    const res1 = await listExpiringDocuments(ctxA('Asia/Ho_Chi_Minh'), tdbA(), {
      withinDays: 15,
      referenceDate: ref23h30,
    });
    const item1 = res1.find((i) => i.targetId === t.id && i.documentType === 'REGISTRATION');
    expect(item1?.daysRemaining).toBe(1);

    // Mốc 2: 2026-10-20 17:30:00 UTC = 2026-10-21 00:30:00 VN -> sang ngày mới, còn 0 ngày (hôm nay)
    const ref00h30 = new Date('2026-10-20T17:30:00.000Z');
    const res2 = await listExpiringDocuments(ctxA('Asia/Ho_Chi_Minh'), tdbA(), {
      withinDays: 15,
      referenceDate: ref00h30,
    });
    const item2 = res2.find((i) => i.targetId === t.id && i.documentType === 'REGISTRATION');
    expect(item2?.daysRemaining).toBe(0);
  });
});
