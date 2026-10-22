import { ERROR_MESSAGES } from '@shared/errors';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefineAction } from '@/server/define-action';
import { createRequireRole } from '@/server/require-role';

type TestRole = 'VIEWER' | 'DISPATCHER' | 'ACCOUNTANT' | 'ADMIN' | 'OWNER';
let currentRole: TestRole = 'ADMIN';

const fakeService = {
  listFreight: vi.fn(),
  listFees: vi.fn(),
  createFreight: vi.fn(),
  createFee: vi.fn(),
  updateFreight: vi.fn(),
  updateFee: vi.fn(),
  reviseFreight: vi.fn(),
  reviseFee: vi.fn(),
  close: vi.fn(),
  deactivate: vi.fn(),
  commitImport: vi.fn(),
};

// Thay phần nối Auth.js + DB bằng phiên giả để thử đúng khuôn defineAction của các action thật.
vi.mock('@/server', () => ({
  defineAction: createDefineAction(
    createRequireRole({
      getSession: async () => ({ userId: 'u1', tenantId: 't1' }),
      loadMembership: async () => ({
        role: currentRole,
        userActive: true,
        tenantStatus: 'ACTIVE',
        timezone: 'Asia/Ho_Chi_Minh',
      }),
      newRequestId: () => 'req-1',
    }),
    { onError: () => undefined },
  ),
}));
vi.mock('@/server/services', () => ({ getTariffService: () => fakeService }));

const actions = await import('./tariff-actions');

const ID = '0190a000-0000-7000-9001-000000000001';
const freight = {
  routeId: '0190a000-0000-7000-9000-000000000501',
  containerType: '20DC',
  tripMode: 'SINGLE',
  basePrice: '1800000',
  vatRatePercent: 8,
  validFrom: '2026-11-01',
};

beforeEach(() => {
  currentRole = 'ADMIN';
  for (const fn of Object.values(fakeService)) fn.mockReset();
});

describe('Server Action bảng giá', () => {
  it('VIEWER và DISPATCHER không tạo, sửa, đóng, nhập được giá: FORBIDDEN, service không chạy', async () => {
    for (const role of ['VIEWER', 'DISPATCHER'] as const) {
      currentRole = role;
      const results = [
        await actions.createFreightTariff(freight),
        await actions.updateFreightTariff({ id: ID, ...freight }),
        await actions.closeTariff({ kind: 'freight', id: ID, validTo: '2026-12-31' }),
        await actions.deactivateTariff({ kind: 'fee', id: ID }),
        await actions.commitTariffImport({ kind: 'freight', items: [{ rowNumber: 2, data: {} }] }),
      ];
      for (const result of results) {
        expect(result).toEqual({ ok: false, code: 'FORBIDDEN', message: ERROR_MESSAGES.FORBIDDEN });
      }
    }
    expect(fakeService.createFreight).not.toHaveBeenCalled();
    expect(fakeService.commitImport).not.toHaveBeenCalled();
  });

  it('mọi vai trò web đều đọc được danh sách giá', async () => {
    fakeService.listFreight.mockResolvedValue([]);
    currentRole = 'VIEWER';
    expect((await actions.listFreightTariffs({})).ok).toBe(true);
  });

  it('chỉ Quản trị điều chỉnh giá đang hiệu lực: Kế toán và Chủ công ty bị FORBIDDEN', async () => {
    const input = { id: ID, basePrice: '2000000', vatRatePercent: 8, validFrom: '2026-11-01' };
    for (const role of ['ACCOUNTANT', 'OWNER'] as const) {
      currentRole = role;
      expect(await actions.reviseFreightTariff(input)).toMatchObject({
        ok: false,
        code: 'FORBIDDEN',
      });
    }
    expect(fakeService.reviseFreight).not.toHaveBeenCalled();

    currentRole = 'ADMIN';
    fakeService.reviseFreight.mockResolvedValue({ closed: {}, created: {} });
    expect((await actions.reviseFreightTariff(input)).ok).toBe(true);
  });

  it('Kế toán tạo được giá; input được chuẩn hóa trước khi gọi service', async () => {
    currentRole = 'ACCOUNTANT';
    fakeService.createFreight.mockResolvedValue({ id: 'f1' });

    const result = await actions.createFreightTariff(freight);

    expect(result).toEqual({ ok: true, data: { id: 'f1' } });
    expect(fakeService.createFreight).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'ACCOUNTANT' }),
      expect.objectContaining({ basePrice: '1800000.00', vatRatePercent: '8.00', validTo: null }),
    );
  });

  it('giá bằng 0, ngày sai, thiếu tuyến: VALIDATION_ERROR theo ô, service không chạy', async () => {
    const zero = await actions.createFreightTariff({ ...freight, basePrice: '0' });
    const badDate = await actions.createFreightTariff({ ...freight, validFrom: '2026-13-40' });
    const noRoute = await actions.createFreightTariff({ ...freight, routeId: '' });

    expect(zero).toMatchObject({ ok: false, code: 'VALIDATION_ERROR' });
    expect(zero.ok === false && zero.fieldErrors?.basePrice?.[0]).toMatch(/lớn hơn 0/);
    expect(badDate.ok === false && badDate.fieldErrors?.validFrom).toBeDefined();
    expect(noRoute.ok === false && noRoute.fieldErrors?.routeId).toBeDefined();
    expect(fakeService.createFreight).not.toHaveBeenCalled();
  });

  it('commitTariffImport từ chối danh sách rỗng và quá 2000 dòng trước khi chạm service', async () => {
    const empty = await actions.commitTariffImport({ kind: 'freight', items: [] });
    const tooMany = await actions.commitTariffImport({
      kind: 'freight',
      items: Array.from({ length: 2001 }, (_, i) => ({ rowNumber: i + 2, data: {} })),
    });

    expect(empty).toMatchObject({ ok: false, code: 'VALIDATION_ERROR' });
    expect(tooMany).toMatchObject({ ok: false, code: 'VALIDATION_ERROR' });
    expect(fakeService.commitImport).not.toHaveBeenCalled();
  });

  it('TARIFF_OVERLAP của service đến client kèm details để hiện giá đang chồng', async () => {
    const { AppError } = await import('@shared/errors');
    fakeService.createFreight.mockRejectedValue(
      new AppError('TARIFF_OVERLAP', 'Đã có giá chồng.', {
        id: 'x',
        validFrom: '2026-01-01',
        validTo: '',
      }),
    );

    const result = await actions.createFreightTariff(freight);

    expect(result).toMatchObject({
      ok: false,
      code: 'TARIFF_OVERLAP',
      details: { id: 'x', validFrom: '2026-01-01' },
    });
  });
});
