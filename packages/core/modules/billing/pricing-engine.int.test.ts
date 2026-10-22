import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ContainerType } from '@shared/enums';
import type { Failure } from '@shared/result';
import { seedIdentity } from '../../lib/db/seeds/identity';
import { SEED_TENANTS } from '../../lib/db/seeds/identity.test-data';
import { getTenantDb } from '../../lib/db/tenant-db';
import { startTestInfra, type TestInfra } from '../../test/containers';
import { createMasterDataRepo } from '../master-data/repo';
import {
  freightConditions,
  freightOrder,
  type LookupKey,
  resolveFees,
  resolveFreight,
  tariffDateOf,
} from './pricing-engine';
import { createTariffRepo } from './repo';
import { freightTariffs } from '../../lib/db/schema';

// Bảng test bắt buộc của spec 06 mục 2, mỗi dòng một test, cộng các trường hợp biên. Mỗi test dùng một tuyến riêng
// để dữ liệu của test này không lẫn sang test khác.
describe('Pricing Engine', () => {
  let infra: TestInfra;
  const A = { tenantId: SEED_TENANTS.phucAn.id };
  const B = { tenantId: SEED_TENANTS.saoViet.id };
  let custA: string;
  let custB: string;
  let routeSeq = 0;

  const tdbA = () => getTenantDb(A, { db: infra.db });
  const tariffs = () => createTariffRepo(tdbA());

  beforeAll(async () => {
    infra = await startTestInfra({ redis: false });
    await seedIdentity(infra.db, { password: 'mat-khau-thu-nghiem' });
    const master = createMasterDataRepo(tdbA());
    custA = (await master.customers.insert({ code: 'KH-A', name: 'Khách A' })).id;
    custB = (await master.customers.insert({ code: 'KH-B', name: 'Khách B' })).id;
  });

  afterAll(async () => {
    await infra?.stop();
  });

  async function newRoute() {
    routeSeq += 1;
    const master = createMasterDataRepo(tdbA());
    const row = await master.routes.insert({
      routeCode: `R${routeSeq}`,
      name: `Tuyến ${routeSeq}`,
      originZone: 'A',
      destinationZone: 'B',
      standardDistanceKm: 10,
    });
    return row.id;
  }

  type FreightOverrides = Partial<{
    containerType: ContainerType;
    tripMode: 'SINGLE' | 'TWIN_20' | 'COMBINED';
    customerId: string | null;
    basePrice: string;
    validFrom: string;
    validTo: string | null;
    isActive: boolean;
  }>;
  const freight = (routeId: string, o: FreightOverrides = {}) =>
    tariffs().freight.insert({
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

  const key = (routeId: string, o: Partial<Omit<LookupKey, 'routeId'>> = {}): LookupKey => ({
    routeId,
    containerType: '20DC',
    tripMode: 'SINGLE',
    customerId: custA,
    targetDate: '2026-10-22',
    ...o,
  });

  const priceOf = async (k: LookupKey) => {
    const result = await resolveFreight(tdbA(), k);
    return result.ok ? result.data.basePrice : (result as Failure).code;
  };

  describe('bảng test bắt buộc spec 06', () => {
    it('có giá riêng TWIN_20 của khách A, tra TWIN_20 cho khách A: Priority 0', async () => {
      const route = await newRoute();
      await freight(route, { tripMode: 'SINGLE', basePrice: '1000000.00' });
      await freight(route, { tripMode: 'SINGLE', customerId: custA, basePrice: '1100000.00' });
      await freight(route, { tripMode: 'TWIN_20', basePrice: '1500000.00' });
      await freight(route, { tripMode: 'TWIN_20', customerId: custA, basePrice: '1400000.00' });

      expect(await priceOf(key(route, { tripMode: 'TWIN_20' }))).toBe('1400000.00');
    });

    it('chỉ có giá riêng TWIN_20 của khách B, tra cho khách A: KHÔNG lấy giá của B', async () => {
      const route = await newRoute();
      await freight(route, { tripMode: 'TWIN_20', customerId: custB, basePrice: '999.00' });

      expect(await priceOf(key(route, { tripMode: 'TWIN_20' }))).toBe('TARIFF_NOT_FOUND');

      await freight(route, { tripMode: 'SINGLE', basePrice: '1000000.00' });
      expect(await priceOf(key(route, { tripMode: 'TWIN_20' }))).toBe('1000000.00');
      // Chính khách B thì thấy giá riêng của mình.
      expect(await priceOf(key(route, { tripMode: 'TWIN_20', customerId: custB }))).toBe('999.00');
    });

    it('bản ghi validTo = NULL được chọn', async () => {
      const route = await newRoute();
      await freight(route, { validFrom: '2020-01-01', validTo: null, basePrice: '1230000.00' });

      expect(await priceOf(key(route, { targetDate: '2035-06-30' }))).toBe('1230000.00');
    });

    it('hai bản ghi cùng khóa, khác validFrom: lấy validFrom mới nhất ≤ ngày tra', async () => {
      const route = await newRoute();
      // Cố ý đặt hai bản chồng nhau trực tiếp qua repo (service sẽ chặn), để thử riêng việc sắp xếp của engine.
      await freight(route, { validFrom: '2026-01-01', basePrice: '1000000.00' });
      await freight(route, { validFrom: '2026-06-01', basePrice: '1100000.00' });
      await freight(route, { validFrom: '2026-12-01', basePrice: '1200000.00' });

      expect(await priceOf(key(route, { targetDate: '2026-07-15' }))).toBe('1100000.00');
      expect(await priceOf(key(route, { targetDate: '2026-12-01' }))).toBe('1200000.00');
      expect(await priceOf(key(route, { targetDate: '2026-02-01' }))).toBe('1000000.00');
    });

    it('không có bản ghi nào: TARIFF_NOT_FOUND và không bao giờ trả 0', async () => {
      const route = await newRoute();
      const result = await resolveFreight(tdbA(), key(route));

      expect(result.ok).toBe(false);
      expect((result as Failure).code).toBe('TARIFF_NOT_FOUND');
      expect(result).not.toHaveProperty('data');
    });

    it('ngày tra sát nửa đêm giờ VN: dùng ngày theo múi giờ tenant, không theo UTC', async () => {
      const route = await newRoute();
      await freight(route, { validFrom: '2026-10-22', basePrice: '1777000.00' });
      // 00:30 ngày 22/10 giờ VN = 17:30 ngày 21/10 UTC.
      const instant = new Date('2026-10-21T17:30:00.000Z');

      const tenantDate = tariffDateOf({ timezone: 'Asia/Ho_Chi_Minh' }, instant);
      expect(tenantDate).toBe('2026-10-22');
      expect(await priceOf(key(route, { targetDate: tenantDate }))).toBe('1777000.00');
      // Nếu cắt theo UTC thì rơi về ngày 21 và không thấy giá.
      expect(await priceOf(key(route, { targetDate: instant.toISOString().slice(0, 10) }))).toBe(
        'TARIFF_NOT_FOUND',
      );
    });

    it('khách A có isExcluded cho LIFT_FEE: không có LIFT_FEE trong kết quả', async () => {
      const route = await newRoute();
      const fee = {
        routeId: null,
        containerType: '20DC' as const,
        tripMode: 'SINGLE' as const,
        feeCategory: 'PASS_THROUGH' as const,
        feeCode: 'LIFT_FEE',
        feeName: 'Phí nâng hạ',
        calcBasis: 'PER_CONTAINER' as const,
        validFrom: '2026-01-01',
      };
      await tariffs().fees.insert({ ...fee, amount: '600000.00' });
      await tariffs().fees.insert({ ...fee, customerId: custA, amount: '0.00', isExcluded: true });
      await tariffs().fees.insert({
        ...fee,
        routeId: route,
        feeCode: 'TOLL_FEE',
        feeName: 'Cầu đường',
        feeCategory: 'COST_NORM',
        calcBasis: 'PER_TRIP',
        amount: '120000.00',
      });

      const forA = await resolveFees(tdbA(), key(route));
      const forB = await resolveFees(tdbA(), key(route, { customerId: custB }));

      expect(forA.ok && forA.data.map((f) => f.feeCode)).toEqual(['TOLL_FEE']);
      expect(forB.ok && forB.data.map((f) => f.feeCode).sort()).toEqual(['LIFT_FEE', 'TOLL_FEE']);
    });
  });

  describe('4 mức ưu tiên và các điều kiện lọc', () => {
    it('Priority 1: chỉ có giá chung TWIN_20 → tra TWIN_20 cho khách A lấy giá chung TWIN_20', async () => {
      const route = await newRoute();
      await freight(route, { tripMode: 'TWIN_20', basePrice: '1500000.00' });
      expect(await priceOf(key(route, { tripMode: 'TWIN_20' }))).toBe('1500000.00');
    });

    it('Priority 2: khách A có giá riêng SINGLE → TWIN_20 không có ưu đãi thì lấy giá riêng đi đơn, thắng giá chung SINGLE', async () => {
      const route = await newRoute();
      await freight(route, { tripMode: 'SINGLE', basePrice: '1000000.00' });
      await freight(route, { tripMode: 'SINGLE', customerId: custA, basePrice: '950000.00' });
      expect(await priceOf(key(route, { tripMode: 'TWIN_20' }))).toBe('950000.00');
    });

    it('Priority 3: chỉ có giá chung SINGLE', async () => {
      const route = await newRoute();
      await freight(route, { tripMode: 'SINGLE', basePrice: '1000000.00' });
      expect(await priceOf(key(route, { tripMode: 'COMBINED' }))).toBe('1000000.00');
    });

    it('tra SINGLE không bao giờ lấy bản ghi TWIN_20 hoặc COMBINED', async () => {
      const route = await newRoute();
      await freight(route, { tripMode: 'TWIN_20', basePrice: '1.00' });
      await freight(route, { tripMode: 'COMBINED', customerId: custA, basePrice: '2.00' });
      expect(await priceOf(key(route, { tripMode: 'SINGLE' }))).toBe('TARIFF_NOT_FOUND');
    });

    it('customerId = NULL (giá chung): không lấy giá riêng của khách nào', async () => {
      const route = await newRoute();
      await freight(route, { customerId: custA, basePrice: '1.00' });
      expect(await priceOf(key(route, { customerId: null }))).toBe('TARIFF_NOT_FOUND');
      await freight(route, { basePrice: '1000000.00' });
      expect(await priceOf(key(route, { customerId: null }))).toBe('1000000.00');
    });

    it('khác tuyến hoặc khác loại cont: không lấy', async () => {
      const route = await newRoute();
      const other = await newRoute();
      await freight(other, { basePrice: '1.00' });
      await freight(route, { containerType: '40HC', basePrice: '2.00' });
      expect(await priceOf(key(route))).toBe('TARIFF_NOT_FOUND');
    });

    it('isActive = false không được chọn', async () => {
      const route = await newRoute();
      await freight(route, { isActive: false, basePrice: '1.00' });
      expect(await priceOf(key(route))).toBe('TARIFF_NOT_FOUND');
    });

    it('ngày biên: validFrom và validTo đều tính (bao gồm), ngoài khoảng thì không', async () => {
      const route = await newRoute();
      await freight(route, {
        validFrom: '2026-03-01',
        validTo: '2026-03-31',
        basePrice: '1000000.00',
      });

      expect(await priceOf(key(route, { targetDate: '2026-03-01' }))).toBe('1000000.00');
      expect(await priceOf(key(route, { targetDate: '2026-03-31' }))).toBe('1000000.00');
      expect(await priceOf(key(route, { targetDate: '2026-02-28' }))).toBe('TARIFF_NOT_FOUND');
      expect(await priceOf(key(route, { targetDate: '2026-04-01' }))).toBe('TARIFF_NOT_FOUND');
    });

    it('kết quả kèm tariffId để snapshot truy vết', async () => {
      const route = await newRoute();
      const created = await freight(route, { basePrice: '1000000.00' });
      const result = await resolveFreight(tdbA(), key(route));
      expect(result.ok && result.data.id).toBe(created.id);
    });

    it('tenant B không tra được giá của tenant A', async () => {
      const route = await newRoute();
      await freight(route, { basePrice: '1000000.00' });
      const result = await resolveFreight(getTenantDb(B, { db: infra.db }), key(route));
      expect((result as Failure).code).toBe('TARIFF_NOT_FOUND');
    });
  });

  describe('bảng phí', () => {
    // Phí routeId = NULL áp cho mọi tuyến nên mỗi test dùng một loại cont riêng để không lẫn sang test khác.
    const TYPES = ['40DC', '40HC', '45HC', '20RF', '40RF', '20OT', '40OT', '20FR'] as const;
    let next = 0;
    async function setup() {
      const containerType = TYPES[next++]!;
      const route = await newRoute();
      const add = (o: Record<string, unknown>) =>
        tariffs().fees.insert({
          containerType,
          tripMode: 'SINGLE',
          validFrom: '2026-01-01',
          routeId: null,
          feeCategory: 'COST_NORM',
          feeCode: 'TOLL_FEE',
          feeName: 'Cầu đường',
          calcBasis: 'PER_TRIP',
          amount: '100000.00',
          ...o,
        } as never);
      const k = (o: Parameters<typeof key>[1] = {}) => key(route, { containerType, ...o });
      return { route, add, k };
    }

    it('phí có routeId cụ thể thắng phí routeId = NULL cùng mức priority', async () => {
      const { route, add, k } = await setup();
      await add({ feeCode: 'LIFT_FEE', amount: '600000.00' });
      await add({ feeCode: 'LIFT_FEE', routeId: route, amount: '700000.00' });

      const result = await resolveFees(tdbA(), k());
      expect(result.ok && result.data.map((f) => [f.feeCode, f.amount])).toEqual([
        ['LIFT_FEE', '700000.00'],
      ]);
    });

    it('mức priority cao hơn thắng routeId cụ thể: phí riêng khách (routeId NULL) thắng phí chung có routeId', async () => {
      const { route, add, k } = await setup();
      await add({ routeId: route, amount: '100000.00' });
      await add({ customerId: custA, amount: '80000.00' });

      const result = await resolveFees(tdbA(), k());
      expect(result.ok && result.data[0]?.amount).toBe('80000.00');
    });

    it('khách A chỉ có ngoại lệ một mã phí: các mã khác lấy từ bảng chung', async () => {
      const { route, add, k } = await setup();
      await add({
        routeId: route,
        feeCode: 'DRIVER_SALARY',
        feeName: 'Lương',
        amount: '350000.00',
      });
      await add({ routeId: route, feeCode: 'TOLL_FEE', amount: '120000.00' });
      await add({ routeId: route, feeCode: 'TOLL_FEE', customerId: custA, amount: '90000.00' });

      const result = await resolveFees(tdbA(), k());
      const byCode = Object.fromEntries(
        (result.ok ? result.data : []).map((f) => [f.feeCode, f.amount]),
      );
      expect(byCode).toEqual({ DRIVER_SALARY: '350000.00', TOLL_FEE: '90000.00' });
    });

    it('lọc theo nhóm phí', async () => {
      const { route, add, k } = await setup();
      await add({ routeId: route, feeCode: 'DRIVER_SALARY', amount: '350000.00' });
      await add({
        routeId: route,
        feeCategory: 'PASS_THROUGH',
        feeCode: 'LIFT_FEE',
        amount: '600000.00',
      });

      const norms = await resolveFees(tdbA(), k(), { category: 'COST_NORM' });
      expect(norms.ok && norms.data.map((f) => f.feeCode)).toEqual(['DRIVER_SALARY']);
    });

    it('không có phí nào: TARIFF_NOT_FOUND; có nhưng tất cả bị miễn: ok với danh sách rỗng', async () => {
      const { add, k } = await setup();
      expect(((await resolveFees(tdbA(), k())) as Failure).code).toBe('TARIFF_NOT_FOUND');

      await add({ feeCode: 'LIFT_FEE', customerId: custA, amount: '0.00', isExcluded: true });
      expect(await resolveFees(tdbA(), k())).toEqual({ ok: true, data: [] });
    });

    it('phí isActive = false và phí hết hạn không được chọn; không lấy phí riêng của khách khác', async () => {
      const { route, add, k } = await setup();
      await add({ routeId: route, isActive: false });
      await add({ routeId: route, validTo: '2026-02-01' });
      await add({ routeId: route, customerId: custB, amount: '1.00' });

      expect(((await resolveFees(tdbA(), k())) as Failure).code).toBe('TARIFF_NOT_FOUND');
    });

    it('phí theo chế độ chạy: TWIN_20 thắng SINGLE; không có TWIN_20 thì dùng SINGLE', async () => {
      const { route, add, k } = await setup();
      await add({ routeId: route, amount: '120000.00' });
      await add({ routeId: route, tripMode: 'TWIN_20', amount: '150000.00' });

      const twin = await resolveFees(tdbA(), k({ tripMode: 'TWIN_20' }));
      const single = await resolveFees(tdbA(), k());
      expect(twin.ok && twin.data[0]?.amount).toBe('150000.00');
      expect(single.ok && single.data[0]?.amount).toBe('120000.00');
    });
  });

  it('câu truy vấn tra giá cước dùng index idx_freight_4d (EXPLAIN)', async () => {
    const route = await newRoute();
    // Thêm dữ liệu để bộ tối ưu của MariaDB không chọn quét toàn bảng trên bảng gần như rỗng.
    for (let i = 0; i < 60; i++) {
      await freight(route, {
        validFrom: `2025-${String((i % 12) + 1).padStart(2, '0')}-01`,
        containerType: i % 2 ? '40HC' : '20DC',
        isActive: false,
      });
    }
    await infra.pool.query('ANALYZE TABLE freight_tariffs');
    const k = key(route);
    const query = infra.db
      .select()
      .from(freightTariffs)
      .where(and(eq(freightTariffs.tenantId, A.tenantId), freightConditions(k)))
      .orderBy(...freightOrder(k))
      .limit(1)
      .toSQL();

    const [rows] = await infra.pool.query(`EXPLAIN ${query.sql}`, query.params);
    const plan = (rows as { key: string | null; possible_keys: string | null }[])[0]!;
    expect(plan.possible_keys).toContain('idx_freight_4d');
    expect(plan.key).toBe('idx_freight_4d');
  });
});
