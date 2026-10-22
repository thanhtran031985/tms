import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppError } from '@shared/errors';
import type { FeeTariffInput, FreightTariffInput } from '@shared/schemas/tariffs';
import type { RequestContext, Role } from '../../lib/context';
import { listAuditForEntity } from '../../lib/audit/repo';
import { seedIdentity } from '../../lib/db/seeds/identity';
import { SEED_TENANTS, SEED_USERS } from '../../lib/db/seeds/identity.test-data';
import { getTenantDb } from '../../lib/db/tenant-db';
import { startTestInfra, type TestInfra } from '../../test/containers';
import { createMasterDataRepo } from '../master-data/repo';
import { createTariffService, type TariffService } from './tariffs.service';

// "Hôm nay" cố định: 22/10/2026 giờ Việt Nam.
const NOW = new Date('2026-10-22T05:00:00.000Z');

const ctxOf = (tenantId: string, userId: string, role: Role): RequestContext => ({
  tenantId,
  userId,
  role,
  requestId: 'test',
  timezone: 'Asia/Ho_Chi_Minh',
});

// Audit cùng một mili giây không có thứ tự ổn định: so sánh theo tập hành động đã sắp xếp.
const actionsOf = (audit: { action: string }[]) => audit.map((a) => a.action).sort();

async function expectAppError(promise: Promise<unknown>, code: string) {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error, `cần AppError ${code}`).toBeInstanceOf(AppError);
  expect((error as AppError).code).toBe(code);
  return error as AppError;
}

describe('tariffs.service', () => {
  let infra: TestInfra;
  let service: TariffService;
  let custA: string;
  let custB: string;
  let routeSeq = 0;

  const A = SEED_TENANTS.phucAn.id;
  const admin = ctxOf(A, SEED_USERS.admin.id, 'ADMIN');
  const accountant = ctxOf(A, SEED_USERS.accountant.id, 'ACCOUNTANT');
  const dispatcher = ctxOf(A, SEED_USERS.hungDv.id, 'DISPATCHER');
  const viewer = ctxOf(A, SEED_USERS.viewer.id, 'VIEWER');
  const otherTenantAdmin = ctxOf(SEED_TENANTS.saoViet.id, SEED_USERS.admin.id, 'ADMIN');

  const tdbA = () => getTenantDb({ tenantId: A }, { db: infra.db });

  beforeAll(async () => {
    infra = await startTestInfra({ redis: false });
    await seedIdentity(infra.db, { password: 'mat-khau-thu-nghiem' });
    service = createTariffService({
      tenantDb: (ctx) => getTenantDb(ctx, { db: infra.db }),
      now: () => NOW,
    });
    const master = createMasterDataRepo(tdbA());
    custA = (await master.customers.insert({ code: 'KH-A', name: 'Khách A' })).id;
    custB = (await master.customers.insert({ code: 'KH-B', name: 'Khách B' })).id;
  });

  afterAll(async () => {
    await infra?.stop();
  });

  async function newRoute() {
    routeSeq += 1;
    const row = await createMasterDataRepo(tdbA()).routes.insert({
      routeCode: `R${routeSeq}`,
      name: `Tuyến ${routeSeq}`,
      originZone: 'A',
      destinationZone: 'B',
      standardDistanceKm: 10,
    });
    return row.id;
  }

  const freightInput = (
    routeId: string,
    o: Partial<FreightTariffInput> = {},
  ): FreightTariffInput => ({
    routeId,
    containerType: '20DC',
    tripMode: 'SINGLE',
    customerId: null,
    basePrice: '1000000.00',
    vatRatePercent: '8.00',
    validFrom: '2026-01-01',
    validTo: null,
    ...o,
  });

  const feeInput = (o: Partial<FeeTariffInput> = {}): FeeTariffInput => ({
    routeId: null,
    containerType: '20DC',
    tripMode: 'SINGLE',
    customerId: null,
    feeCategory: 'COST_NORM',
    feeCode: 'TOLL_FEE',
    feeName: 'Phí cầu đường',
    calcBasis: 'PER_TRIP',
    amount: '120000.00',
    vatRatePercent: null,
    isExcluded: false,
    validFrom: '2026-01-01',
    validTo: null,
    ...o,
  });

  describe('chặn chồng lấn hiệu lực', () => {
    it('tạo giá cước chồng hiệu lực cùng khóa trả TARIFF_OVERLAP kèm giá đang chồng', async () => {
      const route = await newRoute();
      const first = await service.createFreight(
        admin,
        freightInput(route, { validTo: '2026-12-31' }),
      );

      const error = await expectAppError(
        service.createFreight(
          admin,
          freightInput(route, { validFrom: '2026-12-31', validTo: null }),
        ),
        'TARIFF_OVERLAP',
      );
      expect(error.details).toMatchObject({
        id: first.id,
        validFrom: '2026-01-01',
        validTo: '2026-12-31',
      });
      expect(error.message).toContain('01/01/2026');
    });

    it('hai khoảng liền kề không chồng; bản vô thời hạn chồng mọi khoảng sau nó', async () => {
      const route = await newRoute();
      await service.createFreight(
        admin,
        freightInput(route, { validFrom: '2026-01-01', validTo: '2026-06-30' }),
      );
      await service.createFreight(
        admin,
        freightInput(route, { validFrom: '2026-07-01', validTo: null }),
      );

      await expectAppError(
        service.createFreight(
          admin,
          freightInput(route, { validFrom: '2030-01-01', validTo: '2030-12-31' }),
        ),
        'TARIFF_OVERLAP',
      );
    });

    it('khác khóa thì không chồng: khách, loại cont, chế độ chạy, tuyến', async () => {
      const route = await newRoute();
      const other = await newRoute();
      await service.createFreight(admin, freightInput(route));

      await service.createFreight(admin, freightInput(route, { customerId: custA }));
      await service.createFreight(admin, freightInput(route, { customerId: custB }));
      await service.createFreight(admin, freightInput(route, { containerType: '40HC' }));
      await service.createFreight(admin, freightInput(route, { tripMode: 'TWIN_20' }));
      await service.createFreight(admin, freightInput(other));
    });

    it('bảng phí: cùng mã phí chồng nhau bị chặn, khác mã phí hoặc khác tuyến (kể cả NULL) thì không', async () => {
      const route = await newRoute();
      await service.createFee(admin, feeInput({ routeId: route }));

      await expectAppError(
        service.createFee(admin, feeInput({ routeId: route })),
        'TARIFF_OVERLAP',
      );
      await service.createFee(
        admin,
        feeInput({ routeId: route, feeCode: 'DRIVER_SALARY', feeName: 'Lương' }),
      );
      await service.createFee(
        admin,
        feeInput({ routeId: null, feeCode: 'TOLL_FEE', containerType: '40HC' }),
      );
      await service.createFee(
        admin,
        feeInput({ routeId: null, customerId: custA, containerType: '40HC' }),
      );
      // routeId NULL và routeId cụ thể là hai khóa khác nhau (cụ thể thắng khi tra giá).
      await service.createFee(admin, feeInput({ routeId: null, containerType: '45HC' }));
      await service.createFee(admin, feeInput({ routeId: route, containerType: '45HC' }));
      await expectAppError(
        service.createFee(admin, feeInput({ routeId: null, containerType: '45HC' })),
        'TARIFF_OVERLAP',
      );
    });

    it('bản ghi isActive = false không còn chặn', async () => {
      const route = await newRoute();
      const old = await service.createFreight(
        admin,
        freightInput(route, { validFrom: '2027-01-01' }),
      );
      await service.deactivate(admin, 'freight', old.id);

      await service.createFreight(admin, freightInput(route, { validFrom: '2027-01-01' }));
    });

    for (let run = 1; run <= 5; run++) {
      it(`hai giao dịch song song tạo giá chồng nhau chỉ một thành công (lần ${run}/5)`, async () => {
        const route = await newRoute();
        const results = await Promise.allSettled([
          service.createFreight(
            admin,
            freightInput(route, {
              validFrom: '2026-01-01',
              validTo: '2026-12-31',
              basePrice: '1.00',
            }),
          ),
          service.createFreight(
            accountant,
            freightInput(route, { validFrom: '2026-06-01', validTo: null, basePrice: '2.00' }),
          ),
        ]);

        const ok = results.filter((r) => r.status === 'fulfilled');
        const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
        expect(ok).toHaveLength(1);
        expect((rejected[0]!.reason as AppError).code).toBe('TARIFF_OVERLAP');
        const rows = (await service.listFreight(admin)).filter((r) => r.routeId === route);
        expect(rows).toHaveLength(1);
      });
    }

    it('nhiều giao dịch song song cùng một khóa không lọt bản chồng (8 người, cùng khóa phí)', async () => {
      const route = await newRoute();
      const results = await Promise.allSettled(
        Array.from({ length: 8 }, () => service.createFee(admin, feeInput({ routeId: route }))),
      );
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    });
  });

  describe('sửa và điều chỉnh giá', () => {
    it('điều chỉnh giá đang hiệu lực: đóng bản cũ ngày hôm trước và tạo bản mới, có audit CLOSE và CREATE', async () => {
      const route = await newRoute();
      const old = await service.createFreight(
        admin,
        freightInput(route, { basePrice: '1000000.00' }),
      );

      const { closed, created } = await service.reviseFreight(admin, {
        id: old.id,
        basePrice: '1200000.00',
        vatRatePercent: '10.00',
        validFrom: '2026-11-01',
        validTo: null,
      });

      expect(closed.validTo).toBe('2026-10-31');
      expect(closed.basePrice).toBe('1000000.00'); // bản cũ giữ nguyên giá để snapshot truy vết
      expect(created).toMatchObject({
        routeId: route,
        basePrice: '1200000.00',
        vatRatePercent: '10.00',
        validFrom: '2026-11-01',
        validTo: null,
      });
      const oldAudit = await listAuditForEntity(tdbA(), 'freight_tariffs', old.id);
      expect(actionsOf(oldAudit)).toEqual(['CLOSE', 'CREATE']);
      const close = oldAudit.find((a) => a.action === 'CLOSE');
      expect(close?.before).toMatchObject({ validTo: null });
      expect(close?.after).toMatchObject({ validTo: '2026-10-31' });
      const newAudit = await listAuditForEntity(tdbA(), 'freight_tariffs', created.id);
      expect(actionsOf(newAudit)).toEqual(['CREATE']);
    });

    it('chỉ Quản trị điều chỉnh giá đang hiệu lực: Kế toán, Chủ công ty, Điều vận bị FORBIDDEN, dữ liệu không đổi', async () => {
      const route = await newRoute();
      const old = await service.createFreight(admin, freightInput(route));
      const input = {
        id: old.id,
        basePrice: '9.00',
        vatRatePercent: '8.00',
        validFrom: '2026-11-01',
        validTo: null,
      };

      for (const ctx of [accountant, dispatcher, viewer, ctxOf(A, SEED_USERS.owner.id, 'OWNER')]) {
        await expectAppError(service.reviseFreight(ctx, input), 'FORBIDDEN');
      }
      const rows = (await service.listFreight(admin)).filter((r) => r.routeId === route);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.validTo).toBeNull();
    });

    it('điều chỉnh với ngày hiệu lực trong quá khứ hoặc trước ngày bắt đầu của giá cũ bị từ chối', async () => {
      const route = await newRoute();
      const old = await service.createFreight(admin, freightInput(route));
      const base = { id: old.id, basePrice: '9.00', vatRatePercent: '8.00', validTo: null };

      await expectAppError(
        service.reviseFreight(admin, { ...base, validFrom: '2026-10-01' }),
        'VALIDATION_ERROR',
      );
      await expectAppError(
        service.reviseFreight(admin, { ...base, validFrom: '2025-01-01' }),
        'VALIDATION_ERROR',
      );
    });

    it('điều chỉnh giá chưa hiệu lực không hợp lệ (dùng Sửa); điều chỉnh giá đã hết hạn cũng vậy', async () => {
      const route = await newRoute();
      const future = await service.createFreight(
        admin,
        freightInput(route, { validFrom: '2027-01-01' }),
      );
      const expired = await service.createFreight(
        admin,
        freightInput(route, {
          containerType: '40HC',
          validFrom: '2025-01-01',
          validTo: '2025-12-31',
        }),
      );
      const base = {
        basePrice: '9.00',
        vatRatePercent: '8.00',
        validFrom: '2026-11-01',
        validTo: null,
      };

      await expectAppError(
        service.reviseFreight(admin, { id: future.id, ...base }),
        'VALIDATION_ERROR',
      );
      await expectAppError(
        service.reviseFreight(admin, { id: expired.id, ...base }),
        'VALIDATION_ERROR',
      );
    });

    it('điều chỉnh mà bản mới chồng giá khác thì hoàn tác cả bản đóng (rollback)', async () => {
      const route = await newRoute();
      const old = await service.createFreight(
        admin,
        freightInput(route, { validFrom: '2026-01-01', validTo: '2026-12-31' }),
      );
      await service.createFreight(
        admin,
        freightInput(route, { validFrom: '2027-03-01', validTo: null }),
      );

      // Bản mới 2026-11-01 → vô thời hạn sẽ đè lên bản bắt đầu 2027-03-01.
      await expectAppError(
        service.reviseFreight(admin, {
          id: old.id,
          basePrice: '9.00',
          vatRatePercent: '8.00',
          validFrom: '2026-11-01',
          validTo: null,
        }),
        'TARIFF_OVERLAP',
      );

      const stillOld = (await service.listFreight(admin)).find((r) => r.id === old.id);
      expect(stillOld?.validTo).toBe('2026-12-31');
      const audit = await listAuditForEntity(tdbA(), 'freight_tariffs', old.id);
      expect(actionsOf(audit)).toEqual(['CREATE']);
    });

    it('bản chưa hiệu lực sửa trực tiếp được (cả Kế toán), có audit UPDATE trước/sau', async () => {
      const route = await newRoute();
      const future = await service.createFreight(
        accountant,
        freightInput(route, { validFrom: '2027-01-01', basePrice: '1000000.00' }),
      );

      const updated = await service.updateFreight(
        accountant,
        future.id,
        freightInput(route, { validFrom: '2027-02-01', basePrice: '1100000.00' }),
      );

      expect(updated).toMatchObject({ basePrice: '1100000.00', validFrom: '2027-02-01' });
      const audit = await listAuditForEntity(tdbA(), 'freight_tariffs', future.id);
      expect(actionsOf(audit)).toEqual(['CREATE', 'UPDATE']);
      const change = audit.find((a) => a.action === 'UPDATE');
      expect(change?.before).toMatchObject({ basePrice: '1000000.00', validFrom: '2027-01-01' });
      expect(change?.after).toMatchObject({ basePrice: '1100000.00', validFrom: '2027-02-01' });
    });

    it('bản đã hiệu lực không sửa trực tiếp: Kế toán bị FORBIDDEN, Quản trị bị bảo dùng Điều chỉnh giá', async () => {
      const route = await newRoute();
      const live = await service.createFreight(admin, freightInput(route));

      await expectAppError(
        service.updateFreight(accountant, live.id, freightInput(route, { basePrice: '1.00' })),
        'FORBIDDEN',
      );
      const error = await expectAppError(
        service.updateFreight(admin, live.id, freightInput(route, { basePrice: '1.00' })),
        'VALIDATION_ERROR',
      );
      expect(error.message).toContain('Điều chỉnh giá');
      expect((await service.listFreight(admin)).find((r) => r.id === live.id)?.basePrice).toBe(
        '1000000.00',
      );
    });

    it('sửa bản chưa hiệu lực sang khoảng chồng giá khác bị TARIFF_OVERLAP; giữ nguyên khóa của chính mình thì không tự chồng', async () => {
      const route = await newRoute();
      await service.createFreight(
        admin,
        freightInput(route, { validFrom: '2026-01-01', validTo: '2027-02-28' }),
      );
      const future = await service.createFreight(
        admin,
        freightInput(route, { validFrom: '2027-03-01' }),
      );

      await expectAppError(
        service.updateFreight(admin, future.id, freightInput(route, { validFrom: '2027-02-15' })),
        'TARIFF_OVERLAP',
      );
      const same = await service.updateFreight(
        admin,
        future.id,
        freightInput(route, { validFrom: '2027-03-01', basePrice: '5.00' }),
      );
      expect(same.basePrice).toBe('5.00');
    });

    it('đóng giá đang hiệu lực: chỉ Quản trị; ngày đóng không trong quá khứ và phải sớm hơn ngày hết hạn hiện tại', async () => {
      const route = await newRoute();
      const live = await service.createFreight(
        admin,
        freightInput(route, { validTo: '2026-12-31' }),
      );

      await expectAppError(
        service.close(accountant, 'freight', live.id, '2026-11-30'),
        'FORBIDDEN',
      );
      await expectAppError(
        service.close(admin, 'freight', live.id, '2026-10-01'),
        'VALIDATION_ERROR',
      );
      await expectAppError(
        service.close(admin, 'freight', live.id, '2027-01-31'),
        'VALIDATION_ERROR',
      );

      const closed = await service.close(admin, 'freight', live.id, '2026-11-30');
      expect(closed.validTo).toBe('2026-11-30');
      const audit = await listAuditForEntity(tdbA(), 'freight_tariffs', live.id);
      expect(actionsOf(audit)).toEqual(['CLOSE', 'CREATE']);
    });

    it('xóa (isActive = false) bản chưa hiệu lực: Kế toán làm được, bản đã hiệu lực thì chỉ đóng bằng Quản trị', async () => {
      const route = await newRoute();
      const future = await service.createFreight(
        admin,
        freightInput(route, { validFrom: '2027-06-01' }),
      );
      const live = await service.createFreight(
        admin,
        freightInput(route, { containerType: '40HC' }),
      );

      const off = await service.deactivate(accountant, 'freight', future.id);
      expect(off.isActive).toBe(false);
      await expectAppError(service.deactivate(admin, 'freight', live.id), 'VALIDATION_ERROR');
    });

    it('bảng phí: điều chỉnh và đóng hoạt động như giá cước, có audit trên fee_tariffs', async () => {
      const route = await newRoute();
      const live = await service.createFee(admin, feeInput({ routeId: route }));

      const { closed, created } = await service.reviseFee(admin, {
        id: live.id,
        feeName: 'Phí cầu đường mới',
        calcBasis: 'PER_TRIP',
        amount: '150000.00',
        vatRatePercent: null,
        isExcluded: false,
        validFrom: '2026-12-01',
        validTo: null,
      });

      expect(closed.validTo).toBe('2026-11-30');
      expect(created).toMatchObject({ feeCode: 'TOLL_FEE', amount: '150000.00', routeId: route });
      const audit = await listAuditForEntity(tdbA(), 'fee_tariffs', live.id);
      expect(actionsOf(audit)).toEqual(['CLOSE', 'CREATE']);
    });
  });

  describe('quyền và cách ly tenant', () => {
    it('Điều vận và Chỉ xem không tạo được giá', async () => {
      const route = await newRoute();
      await expectAppError(service.createFreight(dispatcher, freightInput(route)), 'FORBIDDEN');
      await expectAppError(service.createFee(viewer, feeInput({ routeId: route })), 'FORBIDDEN');
      expect((await service.listFreight(viewer)).filter((r) => r.routeId === route)).toEqual([]);
    });

    it('tenant khác không thấy, không sửa, không đóng được giá của công ty mình', async () => {
      const route = await newRoute();
      const live = await service.createFreight(admin, freightInput(route));
      const future = await service.createFreight(
        admin,
        freightInput(route, { containerType: '40HC', validFrom: '2027-01-01' }),
      );

      expect((await service.listFreight(otherTenantAdmin)).map((r) => r.id)).not.toContain(live.id);
      await expectAppError(
        service.reviseFreight(otherTenantAdmin, {
          id: live.id,
          basePrice: '1.00',
          vatRatePercent: '8.00',
          validFrom: '2026-11-01',
          validTo: null,
        }),
        'NOT_FOUND',
      );
      await expectAppError(
        service.close(otherTenantAdmin, 'freight', live.id, '2026-12-01'),
        'NOT_FOUND',
      );
      await expectAppError(service.deactivate(otherTenantAdmin, 'freight', future.id), 'NOT_FOUND');
    });

    it('tạo giá với tuyến hoặc khách của công ty khác bị NOT_FOUND', async () => {
      const route = await newRoute();
      const otherRoute = (
        await createMasterDataRepo(
          getTenantDb({ tenantId: SEED_TENANTS.saoViet.id }, { db: infra.db }),
        ).routes.insert({
          routeCode: 'XT',
          name: 'Tuyến công ty khác',
          originZone: 'A',
          destinationZone: 'B',
          standardDistanceKm: 5,
        })
      ).id;

      await expectAppError(service.createFreight(admin, freightInput(otherRoute)), 'NOT_FOUND');
      await expectAppError(
        service.createFee(admin, feeInput({ routeId: otherRoute })),
        'NOT_FOUND',
      );
      await expectAppError(
        service.createFreight(admin, freightInput(route, { customerId: otherRoute })),
        'NOT_FOUND',
      );
    });
  });
});
