import { ERROR_MESSAGES } from '@shared/errors';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefineAction } from '@/server/define-action';
import { createRequireRole } from '@/server/require-role';

type TestRole = 'VIEWER' | 'DISPATCHER' | 'ACCOUNTANT' | 'ADMIN' | 'OWNER';
let currentRole: TestRole = 'DISPATCHER';

const fakeService = {
  createOrder: vi.fn(),
  setRouteStopTemplate: vi.fn(),
  confirmOrder: vi.fn(),
  setManualPrice: vi.fn(),
  addContainers: vi.fn(),
  removeContainer: vi.fn(),
  cancelContainer: vi.fn(),
  cancelOrder: vi.fn(),
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
vi.mock('@/server/services', () => ({ getOrderService: () => fakeService }));
const loadOrderList = vi.fn();
vi.mock('./order-loader', () => ({
  loadOrderList: (...args: unknown[]) => loadOrderList(...args),
}));

const actions = await import('./actions');

const ID = '0190a000-0000-7000-9002-000000000001';
const order = {
  customerId: ID,
  orderType: 'IMPORT',
  bookingOrBlNo: ' maeu238841907 ',
  routeId: ID,
  containers: [{ containerNo: 'msku 123456 5', containerType: '20DC' }],
};

beforeEach(() => {
  currentRole = 'DISPATCHER';
  for (const fn of Object.values(fakeService)) fn.mockReset();
});

describe('Server Action Order', () => {
  it('Kế toán và Chỉ xem không tạo được Order: FORBIDDEN, service không chạy', async () => {
    for (const role of ['ACCOUNTANT', 'VIEWER'] as const) {
      currentRole = role;
      expect(await actions.createOrder(order)).toEqual({
        ok: false,
        code: 'FORBIDDEN',
        message: ERROR_MESSAGES.FORBIDDEN,
      });
    }
    expect(fakeService.createOrder).not.toHaveBeenCalled();
  });

  it('Điều vận, Quản trị, Chủ công ty tạo được; input được chuẩn hóa trước khi gọi service', async () => {
    fakeService.createOrder.mockResolvedValue({
      order: { id: 'o1', orderNo: 'IMP-2610-001', containerCount: 1 },
      warnings: [{ containerNo: 'MSKU1234565', orderId: 'o0', orderNo: 'IMP-2610-000' }],
    });
    for (const role of ['DISPATCHER', 'ADMIN', 'OWNER'] as const) {
      currentRole = role;
      const result = await actions.createOrder(order);
      expect(result).toEqual({
        ok: true,
        data: {
          id: 'o1',
          orderNo: 'IMP-2610-001',
          containerCount: 1,
          warnings: [{ containerNo: 'MSKU1234565', orderId: 'o0', orderNo: 'IMP-2610-000' }],
        },
      });
    }
    expect(fakeService.createOrder).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'OWNER' }),
      expect.objectContaining({
        bookingOrBlNo: 'MAEU238841907',
        eta: null,
        containers: [expect.objectContaining({ containerNo: 'MSKU1234565', sealNo: null })],
      }),
    );
  });

  it('sai check digit, trùng số, hàng Nhập thiếu số: VALIDATION_ERROR theo dòng, service không chạy', async () => {
    const wrongDigit = await actions.createOrder({
      ...order,
      containers: [{ containerNo: 'MSKU1234566', containerType: '20DC' }],
    });
    const duplicated = await actions.createOrder({
      ...order,
      containers: [
        { containerNo: 'MSKU1234565', containerType: '20DC' },
        { containerNo: 'msku1234565', containerType: '20DC' },
      ],
    });
    const missing = await actions.createOrder({
      ...order,
      containers: [{ containerNo: '', containerType: '20DC' }],
    });
    const noContainers = await actions.createOrder({ ...order, containers: [] });

    expect(
      wrongDigit.ok === false && wrongDigit.fieldErrors?.['containers.0.containerNo']?.[0],
    ).toMatch(/số kiểm tra/i);
    expect(
      duplicated.ok === false && duplicated.fieldErrors?.['containers.1.containerNo']?.[0],
    ).toMatch(/Trùng với dòng 1/);
    expect(missing.ok === false && missing.fieldErrors?.['containers.0.containerNo']?.[0]).toMatch(
      /Hàng Nhập phải có số container/,
    );
    expect(noContainers.ok === false && noContainers.fieldErrors?.containers).toBeDefined();
    expect(fakeService.createOrder).not.toHaveBeenCalled();
  });

  it('thiếu khách, tuyến, Booking/B/L hoặc loại cont sai: lỗi ở đúng ô', async () => {
    const result = await actions.createOrder({
      orderType: 'IMPORT',
      bookingOrBlNo: '  ',
      containers: [{ containerNo: null, containerType: '30XX' }],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors).toHaveProperty('customerId');
      expect(result.fieldErrors).toHaveProperty('routeId');
      expect(result.fieldErrors).toHaveProperty('bookingOrBlNo');
      expect(result.fieldErrors).toHaveProperty('containers.0.containerType');
    }
  });

  it('mẫu Stop nội địa: Điều vận ghi được, Kế toán không; chuỗi rỗng bị từ chối', async () => {
    fakeService.setRouteStopTemplate.mockResolvedValue({ stopTypes: ['PICK_EMPTY'] });
    expect(
      await actions.setRouteStopTemplate({ routeId: ID, stopTypes: ['PICK_EMPTY'] }),
    ).toMatchObject({
      ok: true,
    });
    expect(await actions.setRouteStopTemplate({ routeId: ID, stopTypes: [] })).toMatchObject({
      ok: false,
      code: 'VALIDATION_ERROR',
    });
    currentRole = 'ACCOUNTANT';
    expect(
      await actions.setRouteStopTemplate({ routeId: ID, stopTypes: ['PICK_EMPTY'] }),
    ).toMatchObject({
      ok: false,
      code: 'FORBIDDEN',
    });
  });

  it('lỗi nghiệp vụ của service đến client kèm field để hiện dưới ô', async () => {
    const { AppError } = await import('@shared/errors');
    fakeService.createOrder.mockRejectedValue(
      new AppError('VALIDATION_ERROR', 'Không tìm thấy khách hàng này.', { field: 'customerId' }),
    );

    expect(await actions.createOrder(order)).toMatchObject({
      ok: false,
      code: 'VALIDATION_ERROR',
      details: { field: 'customerId' },
    });
  });

  it('xác nhận Order: Chủ công ty, Quản trị, Điều vận được; Kế toán, Chỉ xem bị FORBIDDEN', async () => {
    fakeService.confirmOrder.mockResolvedValue({
      order: { id: ID, status: 'CONFIRMED', version: 1 },
    });
    for (const role of ['ACCOUNTANT', 'VIEWER'] as const) {
      currentRole = role;
      expect(await actions.confirmOrder({ id: ID, version: 0 })).toMatchObject({
        ok: false,
        code: 'FORBIDDEN',
      });
    }
    expect(fakeService.confirmOrder).not.toHaveBeenCalled();
    currentRole = 'OWNER';
    expect(await actions.confirmOrder({ id: ID, version: 0 })).toEqual({
      ok: true,
      data: { id: ID, status: 'CONFIRMED', version: 1 },
    });
  });

  it('cont thiếu giá: PRICE_MISSING đến client kèm các dòng thiếu để hiện "Chưa có giá"', async () => {
    const { AppError } = await import('@shared/errors');
    fakeService.confirmOrder.mockRejectedValue(
      new AppError('PRICE_MISSING', undefined, { lines: '2,3', count: 2 }),
    );

    expect(await actions.confirmOrder({ id: ID, version: 0 })).toMatchObject({
      ok: false,
      code: 'PRICE_MISSING',
      details: { lines: '2,3', count: 2 },
    });
  });

  it('giá tay: Điều vận, Kế toán, Quản trị được; Chủ công ty không; giá 0 và thiếu lý do bị zod chặn', async () => {
    fakeService.setManualPrice.mockResolvedValue({
      order: { version: 3 },
      container: { id: ID, baseFreightAmount: '2500000.00' },
    });
    const input = {
      orderId: ID,
      containerId: ID,
      version: 2,
      price: '2.500.000',
      reason: 'Báo giá riêng',
    };

    currentRole = 'OWNER';
    expect(await actions.setManualPrice({ ...input, price: '2500000' })).toMatchObject({
      ok: false,
      code: 'FORBIDDEN',
    });
    currentRole = 'ACCOUNTANT';
    expect(await actions.setManualPrice({ ...input, price: '2500000' })).toMatchObject({
      ok: true,
    });
    expect(fakeService.setManualPrice).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'ACCOUNTANT' }),
      expect.objectContaining({ price: '2500000.00', reason: 'Báo giá riêng' }),
    );

    fakeService.setManualPrice.mockClear();
    const zero = await actions.setManualPrice({ ...input, price: '0' });
    const noReason = await actions.setManualPrice({ ...input, price: '1000000', reason: ' ' });
    expect(zero.ok === false && zero.fieldErrors?.price?.[0]).toMatch(/lớn hơn 0/);
    expect(noReason.ok === false && noReason.fieldErrors?.reason).toBeDefined();
    expect(fakeService.setManualPrice).not.toHaveBeenCalled();
  });

  it('thêm, bớt, hủy container và hủy Order: Kế toán, Chỉ xem bị FORBIDDEN, service không chạy', async () => {
    for (const role of ['ACCOUNTANT', 'VIEWER'] as const) {
      currentRole = role;
      const results = [
        await actions.addContainers({
          id: ID,
          version: 0,
          containers: [{ containerType: '20DC' }],
        }),
        await actions.removeContainer({ orderId: ID, containerId: ID, version: 0 }),
        await actions.cancelContainer({
          orderId: ID,
          containerId: ID,
          version: 0,
          reason: 'Khách hủy',
        }),
        await actions.cancelOrder({ id: ID, version: 0, reason: 'Khách hủy' }),
      ];
      for (const result of results) expect(result).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    }
    for (const fn of [
      'addContainers',
      'removeContainer',
      'cancelContainer',
      'cancelOrder',
    ] as const) {
      expect(fakeService[fn]).not.toHaveBeenCalled();
    }
  });

  it('hủy container: lý do bắt buộc, phí hủy phải lớn hơn 0 khi có nhập; kết quả cho biết Order có bị hủy không', async () => {
    fakeService.cancelContainer.mockResolvedValue({
      order: { version: 4, status: 'CONFIRMED' },
      orderCancelled: false,
    });
    const base = { orderId: ID, containerId: ID, version: 3 };

    const noReason = await actions.cancelContainer({ ...base, reason: '  ' });
    const zeroFee = await actions.cancelContainer({
      ...base,
      reason: 'Khách hủy',
      cancellationFee: '0',
    });
    expect(noReason.ok === false && noReason.fieldErrors?.reason).toBeDefined();
    expect(zeroFee.ok === false && zeroFee.fieldErrors?.cancellationFee).toBeDefined();
    expect(fakeService.cancelContainer).not.toHaveBeenCalled();

    const result = await actions.cancelContainer({
      ...base,
      reason: 'Khách hủy',
      cancellationFee: '450000',
    });
    expect(result).toEqual({
      ok: true,
      data: { orderVersion: 4, orderStatus: 'CONFIRMED', orderCancelled: false },
    });
    expect(fakeService.cancelContainer).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ cancellationFee: '450000.00' }),
    );
  });

  it('CANCEL_FEE_REQUIRED và STALE_DATA của service đến client đúng mã', async () => {
    const { AppError } = await import('@shared/errors');
    fakeService.cancelContainer.mockRejectedValueOnce(
      new AppError('CANCEL_FEE_REQUIRED', undefined, { lines: '2' }),
    );
    fakeService.cancelOrder.mockRejectedValueOnce(new AppError('STALE_DATA'));

    expect(
      await actions.cancelContainer({
        orderId: ID,
        containerId: ID,
        version: 1,
        reason: 'Khách hủy',
      }),
    ).toMatchObject({ ok: false, code: 'CANCEL_FEE_REQUIRED', details: { lines: '2' } });
    expect(await actions.cancelOrder({ id: ID, version: 1, reason: 'Khách hủy' })).toMatchObject({
      ok: false,
      code: 'STALE_DATA',
    });
  });

  it('thêm container: số cont được chuẩn hóa và kiểm check digit; giá tay cần lý do', async () => {
    fakeService.addContainers.mockResolvedValue({
      order: { version: 2 },
      containers: [{}],
      warnings: [],
    });

    const bad = await actions.addContainers({
      id: ID,
      version: 1,
      containers: [{ containerNo: 'MSKU1234566', containerType: '20DC' }],
    });
    const noReason = await actions.addContainers({
      id: ID,
      version: 1,
      containers: [{ containerType: '45HC', manualPrice: { price: '3000000', reason: '' } }],
    });
    expect(bad.ok === false && bad.fieldErrors?.['containers.0.containerNo']).toBeDefined();
    expect(
      noReason.ok === false && noReason.fieldErrors?.['containers.0.manualPrice.reason'],
    ).toBeDefined();
    expect(fakeService.addContainers).not.toHaveBeenCalled();

    const good = await actions.addContainers({
      id: ID,
      version: 1,
      containers: [{ containerNo: 'msku 123456 5', containerType: '20DC' }],
    });
    expect(good).toEqual({ ok: true, data: { orderVersion: 2, addedCount: 1, warnings: [] } });
    expect(fakeService.addContainers).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        containers: [expect.objectContaining({ containerNo: 'MSKU1234565', manualPrice: null })],
      }),
    );
  });

  it('danh sách Order: mọi vai trò web xem được, kể cả Chỉ xem', async () => {
    loadOrderList.mockResolvedValue([]);
    for (const role of ['VIEWER', 'ACCOUNTANT', 'DISPATCHER'] as const) {
      currentRole = role;
      expect(await actions.listOrders({})).toEqual({ ok: true, data: [] });
    }
  });
});
