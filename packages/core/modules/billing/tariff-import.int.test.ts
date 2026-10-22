import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppError } from '@shared/errors';
import type { FreightTariffInput } from '@shared/schemas/tariffs';
import type { RequestContext, Role } from '../../lib/context';
import { listAuditForEntity } from '../../lib/audit/repo';
import { seedIdentity } from '../../lib/db/seeds/identity';
import { SEED_TENANTS, SEED_USERS } from '../../lib/db/seeds/identity.test-data';
import { seedMasterData } from '../../lib/db/seeds/master-data';
import { getTenantDb } from '../../lib/db/tenant-db';
import { startTestInfra, type TestInfra } from '../../test/containers';
import { createTariffService, type TariffService } from './tariffs.service';
import { IMPORT_FIELDS } from './tariff-import-parse';

const NOW = new Date('2026-10-22T05:00:00.000Z');
const ctxOf = (userId: string, role: Role): RequestContext => ({
  tenantId: SEED_TENANTS.phucAn.id,
  userId,
  role,
  requestId: 'test',
  timezone: 'Asia/Ho_Chi_Minh',
});

const FREIGHT_HEADER = IMPORT_FIELDS.freight.map((f) => f.header);
const FEE_HEADER = IMPORT_FIELDS.fee.map((f) => f.header);

// Dòng giá cước theo thứ tự cột của file mẫu.
const freightRow = (
  o: Partial<
    Record<'route' | 'type' | 'mode' | 'customer' | 'price' | 'vat' | 'from' | 'to', unknown>
  > = {},
) => [
  o.route ?? 'CL-ST',
  o.type ?? '20DC',
  o.mode ?? 'SINGLE',
  o.customer ?? '',
  o.price ?? 1_800_000,
  o.vat ?? 8,
  o.from ?? '2027-01-01',
  o.to ?? '',
];

async function expectAppError(promise: Promise<unknown>, code: string) {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(AppError);
  expect((error as AppError).code).toBe(code);
  return error as AppError;
}

describe('import bảng giá từ Excel', () => {
  let infra: TestInfra;
  let service: TariffService;
  const admin = ctxOf(SEED_USERS.admin.id, 'ADMIN');
  const accountant = ctxOf(SEED_USERS.accountant.id, 'ACCOUNTANT');
  const dispatcher = ctxOf(SEED_USERS.hungDv.id, 'DISPATCHER');

  beforeAll(async () => {
    infra = await startTestInfra({ redis: false });
    await seedIdentity(infra.db, { password: 'mat-khau-thu-nghiem' });
    await seedMasterData(infra.db);
    service = createTariffService({
      tenantDb: (ctx) => getTenantDb(ctx, { db: infra.db }),
      now: () => NOW,
    });
  });

  afterAll(async () => {
    await infra?.stop();
  });

  const preview = (rows: unknown[][], header: string[] = FREIGHT_HEADER) =>
    service.previewImport(admin, 'freight', [header, ...rows]);

  describe('xem trước', () => {
    it('dòng hợp lệ có data đã chuẩn hóa; số dòng tính theo file Excel (dòng tiêu đề là 1)', async () => {
      const result = await preview([
        freightRow(),
        freightRow({ type: '40HC', price: '2.600.000 đ' }),
      ]);

      expect(result.fileErrors).toEqual([]);
      expect(result.counts).toEqual({ total: 2, valid: 2, error: 0 });
      expect(result.rows.map((r) => r.rowNumber)).toEqual([2, 3]);
      expect(result.rows[1]?.data).toMatchObject({
        containerType: '40HC',
        basePrice: '2600000.00',
        vatRatePercent: '8.00',
        validFrom: '2027-01-01',
        validTo: null,
        customerId: null,
      });
    });

    it('báo lỗi đúng dòng, đúng cột, tiếng Việt: sai loại cont, thiếu giá, ngày sai, mã tuyến và mã khách không có', async () => {
      const result = await preview([
        freightRow({ type: '30XX' }),
        freightRow({ type: '40HC', price: '' }),
        freightRow({ type: '45HC', from: '31/02/2027' }),
        freightRow({ type: '20RF', route: 'KHONG-CO' }),
        freightRow({ type: '40RF', customer: 'KH-LA' }),
        freightRow({ type: '20OT' }), // dòng hợp lệ để chắc chắn lỗi không lan sang
      ]);

      const byRow = Object.fromEntries(result.rows.map((r) => [r.rowNumber, r.errors.join(' | ')]));
      expect(byRow[2]).toContain('Loại cont');
      expect(byRow[3]).toContain('Giá cước');
      expect(byRow[4]).toContain('Hiệu lực từ');
      expect(byRow[5]).toContain('không có tuyến "KHONG-CO"');
      expect(byRow[6]).toContain('không có khách hàng "KH-LA"');
      expect(byRow[7]).toBe('');
      expect(result.counts).toEqual({ total: 6, valid: 1, error: 5 });
    });

    it('hai dòng chồng hiệu lực nhau trong file: dòng đứng sau bị báo, kèm số dòng đứng trước', async () => {
      const result = await preview([
        freightRow({ type: '45HC', from: '2027-01-01', to: '2027-06-30' }),
        freightRow({ type: '45HC', from: '2027-06-01', to: '' }),
        freightRow({ type: '45HC', from: '2027-07-01', to: '' }),
      ]);

      expect(result.rows[0]?.errors).toEqual([]);
      expect(result.rows[1]?.errors.join(' ')).toContain('dòng 2 trong file');
      expect(result.rows[2]?.errors).toEqual([]); // khoảng còn lại không chồng dòng hợp lệ nào
    });

    it('dòng chồng với giá đang có trong hệ thống bị báo kèm khoảng hiệu lực của giá đó', async () => {
      await service.createFreight(admin, {
        routeId: (await findRoute('CL-BH'))!,
        containerType: '20DC',
        tripMode: 'SINGLE',
        customerId: null,
        basePrice: '1000000.00',
        vatRatePercent: '8.00',
        validFrom: '2027-01-01',
        validTo: '2027-12-31',
      });

      const result = await preview([freightRow({ route: 'CL-BH', from: '2027-06-01' })]);

      expect(result.rows[0]?.errors.join(' ')).toContain(
        'giá đang có từ 01/01/2027 đến 31/12/2027',
      );
      expect(result.counts.valid).toBe(0);
    });

    it('thiếu cột bắt buộc: lỗi cả file, không có dòng nào', async () => {
      const result = await service.previewImport(admin, 'freight', [
        ['Mã tuyến', 'Loại cont'],
        ['CL-ST', '20DC'],
      ]);

      expect(result.rows).toEqual([]);
      expect(result.fileErrors[0]).toContain('Thiếu cột bắt buộc');
      expect(result.fileErrors[0]).toContain('Giá cước');
    });

    it('nhận tiêu đề không dấu, số theo kiểu Việt Nam, ngày dd/mm/yyyy, ô ngày kiểu Date và số serial Excel', async () => {
      const header = [
        'ma tuyen',
        'loai cont',
        'che do chay',
        'ma khach',
        'gia cuoc',
        'vat',
        'hieu luc tu',
        'hieu luc den',
      ];
      const result = await service.previewImport(admin, 'freight', [
        header,
        [
          'cl-vsip',
          '20dc',
          'twin_20',
          'thepnl',
          '3.000.000',
          '8,5',
          '01/03/2028',
          new Date('2028-12-31T00:00:00Z'),
        ],
        ['CL-VSIP', '40HC', '', '', '2600000,5', 10, 46813, ''], // 46813 = 2028-03-01
      ]);

      expect(result.rows[0]?.errors).toEqual([]);
      expect(result.rows[0]?.data).toMatchObject({
        containerType: '20DC',
        tripMode: 'TWIN_20',
        basePrice: '3000000.00',
        vatRatePercent: '8.50',
        validFrom: '2028-03-01',
        validTo: '2028-12-31',
      });
      expect(result.rows[0]?.data).toHaveProperty('customerId');
      expect(result.rows[1]?.errors).toEqual([]);
      expect(result.rows[1]?.data).toMatchObject({
        basePrice: '2600000.50',
        validFrom: '2028-03-01',
      });
    });

    it('bỏ qua dòng trống cuối bảng; file quá 2000 dòng bị từ chối cả file', async () => {
      const result = await preview([freightRow(), [], ['', '', '', '', '', '', '', '']]);
      expect(result.counts.total).toBe(1);

      const huge = await preview(
        Array.from({ length: 2001 }, (_, i) =>
          freightRow({ from: `2030-01-${String((i % 28) + 1).padStart(2, '0')}` }),
        ),
      );
      expect(huge.rows).toEqual([]);
      expect(huge.fileErrors[0]).toContain('2000');
    });

    it('bảng phí: nhóm phí, cách tính, miễn phí và tuyến để trống (mọi tuyến)', async () => {
      const result = await service.previewImport(admin, 'fee', [
        FEE_HEADER,
        [
          '',
          '20DC',
          'SINGLE',
          '',
          'PASS_THROUGH',
          'GATE_FEE',
          'Phí cổng',
          'PER_CONTAINER',
          150000,
          '',
          '',
          '2027-01-01',
          '',
        ],
        [
          '',
          '20DC',
          'SINGLE',
          'PHUCTHINH',
          'PASS_THROUGH',
          'GATE_FEE',
          'Phí cổng',
          'PER_CONTAINER',
          '',
          '',
          'x',
          '2027-01-01',
          '',
        ],
        [
          'CL-ST',
          '20DC',
          'SINGLE',
          '',
          'KHAC',
          'GATE_FEE2',
          'Phí',
          'PER_TRIP',
          100,
          '',
          '',
          '2027-01-01',
          '',
        ],
      ]);

      expect(result.rows[0]?.errors).toEqual([]);
      expect(result.rows[0]?.data).toMatchObject({
        routeId: null,
        feeCode: 'GATE_FEE',
        amount: '150000.00',
        isExcluded: false,
      });
      expect(result.rows[1]?.errors).toEqual([]);
      expect(result.rows[1]?.data).toMatchObject({ isExcluded: true, amount: '0.00' });
      expect(result.rows[2]?.errors.join(' ')).toContain('Nhóm phí');
    });

    it('Điều vận không xem trước được (không có quyền tariff.write)', async () => {
      await expectAppError(
        service.previewImport(dispatcher, 'freight', [FREIGHT_HEADER]),
        'FORBIDDEN',
      );
    });

    it('xem trước 200 dòng dưới 3 giây', async () => {
      const rows = Array.from({ length: 200 }, (_, i) =>
        freightRow({
          route: ['CL-ST', 'CL-BH', 'CL-VSIP'][i % 3],
          type: [
            '20DC',
            '40DC',
            '40HC',
            '45HC',
            '20RF',
            '40RF',
            '20OT',
            '40OT',
            '20FR',
            '40FR',
            '20TK',
          ][i % 11],
          from: `${2040 + Math.floor(i / 33)}-01-01`,
        }),
      );
      const started = performance.now();
      const result = await preview(rows);
      const elapsed = performance.now() - started;

      expect(result.counts.total).toBe(200);
      expect(elapsed).toBeLessThan(3000);
    });
  });

  describe('xác nhận (ghi)', () => {
    const toItems = (rows: Awaited<ReturnType<typeof preview>>['rows']) =>
      rows.map((r) => ({ rowNumber: r.rowNumber, data: r.data }));

    it('file sạch: ghi đủ dòng trong một transaction, mỗi dòng có audit IMPORT', async () => {
      const result = await preview([
        freightRow({ type: '20TK', from: '2031-01-01' }),
        freightRow({ type: '40FR', from: '2031-01-01', customer: 'THEPNL' }),
      ]);
      expect(result.counts.error).toBe(0);

      const { inserted } = await service.commitImport(accountant, 'freight', toItems(result.rows));

      expect(inserted).toBe(2);
      const saved = (await service.listFreight(admin)).filter((r) => r.validFrom === '2031-01-01');
      expect(saved).toHaveLength(2);
      for (const row of saved) {
        const audit = await listAuditForEntity(
          getTenantDb({ tenantId: SEED_TENANTS.phucAn.id }, { db: infra.db }),
          'freight_tariffs',
          row.id,
        );
        expect(audit.map((a) => a.action)).toEqual(['IMPORT']);
        expect(audit[0]?.after).toMatchObject({ basePrice: '1800000.00' });
      }
    });

    it('một dòng chồng khi ghi thì cả lô bị hoàn tác (không lưu dòng nào), thông báo nêu số dòng', async () => {
      const route = (await findRoute('CL-ST'))!;
      await service.createFreight(admin, {
        routeId: route,
        containerType: '20OT',
        tripMode: 'SINGLE',
        customerId: null,
        basePrice: '1.00',
        vatRatePercent: '8.00',
        validFrom: '2032-01-01',
        validTo: '2032-12-31',
      });
      // Xem trước khi giá trên chưa có: cả hai dòng đều sạch.
      const before = await service.listFreight(admin);
      const items = [
        {
          rowNumber: 2,
          data: freightData(route, { containerType: '40OT', validFrom: '2032-05-01' }),
        },
        {
          rowNumber: 3,
          data: freightData(route, { containerType: '20OT', validFrom: '2032-06-01' }),
        },
      ];

      const error = await expectAppError(
        service.commitImport(admin, 'freight', items),
        'TARIFF_OVERLAP',
      );

      expect(error.message).toContain('Dòng 3');
      expect((await service.listFreight(admin)).length).toBe(before.length);
    });

    it('xác nhận kiểm tra lại dữ liệu từ client: giá âm hoặc sai kiểu bị từ chối', async () => {
      const route = (await findRoute('CL-ST'))!;
      await expectAppError(
        service.commitImport(admin, 'freight', [
          { rowNumber: 2, data: { ...freightData(route), basePrice: '-5' } },
        ]),
        'VALIDATION_ERROR',
      );
      await expectAppError(service.commitImport(admin, 'freight', []), 'VALIDATION_ERROR');
    });

    it('tuyến hoặc khách của công ty khác bị từ chối khi ghi', async () => {
      await expectAppError(
        service.commitImport(admin, 'freight', [
          { rowNumber: 2, data: freightData('0190a000-0000-7000-9000-000000000511') },
        ]),
        'NOT_FOUND',
      );
    });

    it('Điều vận và Chỉ xem không ghi được', async () => {
      const route = (await findRoute('CL-ST'))!;
      await expectAppError(
        service.commitImport(dispatcher, 'freight', [{ rowNumber: 2, data: freightData(route) }]),
        'FORBIDDEN',
      );
    });

    it('hai lần nhập song song cùng khóa chồng nhau: chỉ một lần thành công', async () => {
      const route = (await findRoute('CL-ST'))!;
      const items = (price: string) => [
        {
          rowNumber: 2,
          data: freightData(route, {
            containerType: '20FR',
            validFrom: '2033-01-01',
            basePrice: price,
          }),
        },
      ];

      const results = await Promise.allSettled([
        service.commitImport(admin, 'freight', items('1.00')),
        service.commitImport(accountant, 'freight', items('2.00')),
      ]);

      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(
        ((results.find((r) => r.status === 'rejected') as PromiseRejectedResult).reason as AppError)
          .code,
      ).toBe('TARIFF_OVERLAP');
    });
  });

  async function findRoute(code: string) {
    const rows = await getTenantDb({ tenantId: SEED_TENANTS.phucAn.id }, { db: infra.db }).select(
      (await import('../../lib/db/schema')).routes,
    );
    return rows.find((r) => r.routeCode === code)?.id;
  }

  function freightData(routeId: string, o: Partial<FreightTariffInput> = {}): FreightTariffInput {
    return {
      routeId,
      containerType: '20DC',
      tripMode: 'SINGLE',
      customerId: null,
      basePrice: '1800000.00',
      vatRatePercent: '8.00',
      validFrom: '2034-01-01',
      validTo: null,
      ...o,
    };
  }
});
