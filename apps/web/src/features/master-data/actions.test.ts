import { AppError, ERROR_MESSAGES } from '@shared/errors';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefineAction } from '@/server/define-action';
import { createRequireRole } from '@/server/require-role';

type TestRole = 'VIEWER' | 'DISPATCHER' | 'ACCOUNTANT' | 'FLEET_MANAGER';
let currentRole: TestRole = 'DISPATCHER';

const fakeService = {
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  updateCustomerBilling: vi.fn(),
  softDelete: vi.fn(),
  restore: vi.fn(),
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
vi.mock('@/server/services', () => ({ getMasterDataService: () => fakeService }));

const actions = await import('./actions');

const validCustomer = { code: 'kh-01', name: 'Khách mẫu' };

beforeEach(() => {
  currentRole = 'DISPATCHER';
  for (const fn of Object.values(fakeService)) fn.mockReset();
});

describe('Server Action danh mục', () => {
  it('VIEWER tạo khách → FORBIDDEN, service không chạy', async () => {
    currentRole = 'VIEWER';
    const result = await actions.createCustomer(validCustomer);
    expect(result).toEqual({ ok: false, code: 'FORBIDDEN', message: ERROR_MESSAGES.FORBIDDEN });
    expect(fakeService.create).not.toHaveBeenCalled();
  });

  it('FLEET_MANAGER và VIEWER không sửa, xóa, khôi phục được; vẫn đọc được danh sách', async () => {
    fakeService.list.mockResolvedValue([]);
    for (const role of ['FLEET_MANAGER', 'VIEWER'] as const) {
      currentRole = role;
      const id = '0190a000-0000-7000-8000-000000000001';
      expect((await actions.softDeleteCustomer({ id })).ok).toBe(false);
      expect((await actions.restoreRoute({ id })).ok).toBe(false);
      expect((await actions.updateLocation({ id })).ok).toBe(false);
      expect((await actions.listCustomers({})).ok).toBe(true);
    }
    expect(fakeService.softDelete).not.toHaveBeenCalled();
  });

  it('thiếu tên → VALIDATION_ERROR kèm lỗi theo ô, service không chạy', async () => {
    const result = await actions.createCustomer({ code: 'KH-01', name: '' });
    expect(result).toMatchObject({ ok: false, code: 'VALIDATION_ERROR' });
    expect(result.ok === false && result.fieldErrors?.name?.[0]).toMatch(/tên/);
    expect(fakeService.create).not.toHaveBeenCalled();
  });

  it('DISPATCHER tạo khách: input đã chuẩn hóa (mã viết hoa) rồi gọi service', async () => {
    fakeService.create.mockResolvedValue({ id: 'c1' });
    const result = await actions.createCustomer(validCustomer);
    expect(result).toEqual({ ok: true, data: { id: 'c1' } });
    expect(fakeService.create).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 't1', role: 'DISPATCHER' }),
      'customers',
      expect.objectContaining({ code: 'KH-01', paymentTermDays: 30 }),
    );
  });

  it('lỗi DUPLICATE_CODE của service đến client kèm details để hiện nút Khôi phục', async () => {
    fakeService.create.mockRejectedValue(
      new AppError('DUPLICATE_CODE', 'Mã "KH-01" đã có.', { field: 'code', deletedId: 'x1' }),
    );
    const result = await actions.createCustomer(validCustomer);
    expect(result).toMatchObject({
      ok: false,
      code: 'DUPLICATE_CODE',
      details: { field: 'code', deletedId: 'x1' },
    });
  });

  it('ACCOUNTANT sửa được thông tin thanh toán nhưng không sửa được tên khách', async () => {
    currentRole = 'ACCOUNTANT';
    const id = '0190a000-0000-7000-8000-000000000001';
    fakeService.updateCustomerBilling.mockResolvedValue({ id });

    const billing = await actions.updateCustomerBilling({
      id,
      taxCode: '0301234567',
      paymentTermDays: 45,
      creditLimit: '1000000',
    });
    const rename = await actions.updateCustomer({ id, ...validCustomer });

    expect(billing.ok).toBe(true);
    expect(rename).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    expect(fakeService.update).not.toHaveBeenCalled();
    // Dù client gửi thêm tên, action thanh toán không chuyển nó xuống service.
    await actions.updateCustomerBilling({ id, name: 'Đổi tên lén', paymentTermDays: 10 });
    const lastInput = fakeService.updateCustomerBilling.mock.calls.at(-1)?.[2];
    expect(lastInput).not.toHaveProperty('name');
  });

  it('địa điểm: tọa độ ngoài khoảng bị chặn trước khi chạm service', async () => {
    const result = await actions.createLocation({
      code: 'DD',
      type: 'DEPOT',
      name: 'Depot',
      lat: 91,
      lng: 106,
    });
    expect(result).toMatchObject({ ok: false, code: 'VALIDATION_ERROR' });
    expect(result.ok === false && result.fieldErrors?.lat).toBeDefined();
    expect(fakeService.create).not.toHaveBeenCalled();
  });
});
