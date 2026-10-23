import { AppError, ERROR_MESSAGES } from '@shared/errors';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefineAction } from '@/server/define-action';
import { createRequireRole } from '@/server/require-role';

type TestRole = 'VIEWER' | 'DISPATCHER' | 'ACCOUNTANT' | 'ADMIN' | 'OWNER' | 'FLEET_MANAGER';
let currentRole: TestRole = 'DISPATCHER';

const fakeService = {
  createSingleTrip: vi.fn(),
  updateTripTimes: vi.fn(),
  assignResources: vi.fn(),
  dispatchTrip: vi.fn(),
  cancelAssignment: vi.fn(),
  listResourceAvailability: vi.fn(),
  getDispatchBoard: vi.fn(),
  getBoardCards: vi.fn(),
};
const revalidatePath = vi.fn();

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
vi.mock('@/server/services', () => ({ getDispatchService: () => fakeService }));
vi.mock('next/cache', () => ({ revalidatePath: (path: string) => revalidatePath(path) }));

const actions = await import('./actions');

const ID = '0190a000-0000-7000-9007-000000000001';
const DRIVER = '0190b000-0000-7000-8000-000000000041';
const TRACTOR = '0190b000-0000-7000-8000-000000000001';
const TRAILER = '0190b000-0000-7000-8000-000000000021';
const assignInput = {
  tripId: ID,
  version: 0,
  driverId: DRIVER,
  tractorId: TRACTOR,
  trailerId: TRAILER,
};

const now = new Date('2026-10-26T01:00:00.000Z');
const tripRow = {
  id: ID,
  tripCode: 'TRIP-2610-001',
  status: 'PLANNED',
  version: 1,
  plannedStart: now,
  plannedEnd: new Date('2026-10-26T05:00:00.000Z'),
  primaryDriverId: DRIVER,
  primaryTractorId: TRACTOR,
  primaryTrailerId: TRAILER,
  tenantId: 't1',
};
const assignmentRow = {
  id: 'a1',
  stopId: 's1',
  status: 'ASSIGNED',
  driverId: DRIVER,
  tractorId: TRACTOR,
  trailerId: TRAILER,
  tenantId: 't1',
};

beforeEach(() => {
  currentRole = 'DISPATCHER';
  revalidatePath.mockReset();
  for (const fn of Object.values(fakeService)) fn.mockReset();
});

describe('Server Action điều vận', () => {
  it('Chỉ xem, Kế toán, Quản lý đội xe gọi assignResources: FORBIDDEN, service không chạy', async () => {
    for (const role of ['VIEWER', 'ACCOUNTANT', 'FLEET_MANAGER'] as const) {
      currentRole = role;
      expect(await actions.assignResources(assignInput)).toEqual({
        ok: false,
        code: 'FORBIDDEN',
        message: ERROR_MESSAGES.FORBIDDEN,
      });
    }
    expect(fakeService.assignResources).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('mọi action ghi đều từ chối VIEWER', async () => {
    currentRole = 'VIEWER';
    const calls = [
      actions.createSingleTrip({
        orderContainerId: ID,
        plannedStart: now.toISOString(),
        plannedEnd: '2026-10-26T05:00:00.000Z',
      }),
      actions.updateTripTimes({
        tripId: ID,
        version: 0,
        plannedStart: now.toISOString(),
        plannedEnd: '2026-10-26T05:00:00.000Z',
      }),
      actions.dispatchTrip({ tripId: ID, version: 0 }),
      actions.cancelAssignment({ tripId: ID, version: 0 }),
    ];
    for (const result of await Promise.all(calls)) {
      expect(result).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    }
    expect(Object.values(fakeService).every((fn) => fn.mock.calls.length === 0)).toBe(true);
  });

  it('Điều vận, Quản trị, Chủ công ty gán được; trả tóm tắt chuyến + cảnh báo và làm mới /dispatch', async () => {
    fakeService.assignResources.mockResolvedValue({
      trip: tripRow,
      assignments: [assignmentRow],
      warnings: [
        {
          code: 'DOCUMENT_EXPIRING',
          severity: 'warn',
          resource: 'DRIVER',
          message: 'GPLX còn 2 ngày',
        },
      ],
    });
    for (const role of ['DISPATCHER', 'ADMIN', 'OWNER'] as const) {
      currentRole = role;
      const result = await actions.assignResources(assignInput);
      expect(result).toEqual({
        ok: true,
        data: {
          trip: expect.objectContaining({
            id: ID,
            status: 'PLANNED',
            version: 1,
            primaryDriverId: DRIVER,
          }),
          assignments: [
            {
              id: 'a1',
              stopId: 's1',
              status: 'ASSIGNED',
              driverId: DRIVER,
              tractorId: TRACTOR,
              trailerId: TRAILER,
            },
          ],
          warnings: [expect.objectContaining({ code: 'DOCUMENT_EXPIRING' })],
        },
      });
    }
    expect(revalidatePath).toHaveBeenCalledTimes(3);
    expect(revalidatePath).toHaveBeenCalledWith('/dispatch');
    // Không lộ tenantId của dòng DB ra client.
    const result = await actions.assignResources(assignInput);
    expect(JSON.stringify(result)).not.toContain('tenantId');
  });

  it('input sai không chạm service: VALIDATION_ERROR kèm fieldErrors, không làm mới trang', async () => {
    const result = await actions.assignResources({ ...assignInput, driverId: 'ngắn', version: -1 });

    expect(result).toMatchObject({
      ok: false,
      code: 'VALIDATION_ERROR',
      fieldErrors: { driverId: expect.any(Array), version: expect.any(Array) },
    });
    expect(fakeService.assignResources).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('giờ gửi dạng ISO được đổi thành Date; giờ kết thúc không sau giờ bắt đầu bị chặn', async () => {
    fakeService.createSingleTrip.mockResolvedValue({
      trip: tripRow,
      assignments: [],
      warnings: [],
    });

    await actions.createSingleTrip({
      orderContainerId: ID,
      plannedStart: '2026-10-26T08:00:00+07:00',
      plannedEnd: '2026-10-26T12:00:00+07:00',
    });
    const bad = await actions.createSingleTrip({
      orderContainerId: ID,
      plannedStart: '2026-10-26T08:00:00+07:00',
      plannedEnd: '2026-10-26T08:00:00+07:00',
    });

    expect(fakeService.createSingleTrip).toHaveBeenCalledTimes(1);
    expect(fakeService.createSingleTrip).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'DISPATCHER' }),
      expect.objectContaining({
        orderContainerId: ID,
        plannedStart: new Date('2026-10-26T01:00:00.000Z'),
        plannedEnd: new Date('2026-10-26T05:00:00.000Z'),
      }),
    );
    expect(bad).toMatchObject({ ok: false, code: 'VALIDATION_ERROR' });
  });

  it('ghi đè giờ lái được chuyển nguyên sang service (service tự kiểm quyền ADMIN)', async () => {
    fakeService.assignResources.mockResolvedValue({ trip: tripRow, assignments: [], warnings: [] });
    currentRole = 'ADMIN';

    await actions.assignResources({
      ...assignInput,
      overrideDrivingHours: { reason: ' Khách gấp ' },
      confirmMissingWeight: true,
    });

    expect(fakeService.assignResources).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        overrideDrivingHours: { reason: 'Khách gấp' },
        confirmMissingWeight: true,
      }),
    );
  });

  it('AppError của service thành Result có mã, thông báo và details; không làm mới trang', async () => {
    fakeService.assignResources.mockRejectedValue(
      new AppError('RESOURCE_TIME_CONFLICT', undefined, {
        resource: 'DRIVER',
        conflictTripCode: 'TRIP-2610-001',
      }),
    );

    const result = await actions.assignResources(assignInput);

    expect(result).toEqual({
      ok: false,
      code: 'RESOURCE_TIME_CONFLICT',
      message: ERROR_MESSAGES.RESOURCE_TIME_CONFLICT,
      details: { resource: 'DRIVER', conflictTripCode: 'TRIP-2610-001' },
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('lỗi bất ngờ thành INTERNAL_ERROR, không ném ra client', async () => {
    fakeService.dispatchTrip.mockRejectedValue(new Error('mất kết nối'));

    expect(await actions.dispatchTrip({ tripId: ID, version: 0 })).toMatchObject({
      ok: false,
      code: 'INTERNAL_ERROR',
    });
  });

  it('listResourceAvailability: Chỉ xem và Quản lý đội xe xem được, Kế toán thì không; không làm mới trang', async () => {
    fakeService.listResourceAvailability.mockResolvedValue({
      drivers: [],
      tractors: [],
      trailers: [],
    });
    const input = {
      orderContainerId: ID,
      start: '2026-10-26T01:00:00.000Z',
      end: '2026-10-26T05:00:00.000Z',
    };

    for (const role of ['VIEWER', 'FLEET_MANAGER', 'DISPATCHER'] as const) {
      currentRole = role;
      expect(await actions.listResourceAvailability(input)).toEqual({
        ok: true,
        data: { drivers: [], tractors: [], trailers: [] },
      });
    }
    currentRole = 'ACCOUNTANT';
    expect(await actions.listResourceAvailability(input)).toMatchObject({
      ok: false,
      code: 'FORBIDDEN',
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('loadDispatchBoard / loadBoardCards: người chỉ xem đọc được, Kế toán thì không; input sai không chạm service', async () => {
    fakeService.getDispatchBoard.mockResolvedValue({
      date: '2026-10-26',
      columns: {},
      lanes: null,
    });
    fakeService.getBoardCards.mockResolvedValue({ cards: [], removedIds: [ID] });

    for (const role of ['VIEWER', 'DISPATCHER', 'FLEET_MANAGER'] as const) {
      currentRole = role;
      expect(
        await actions.loadDispatchBoard({ date: '2026-10-26', direction: 'EXPORT' }),
      ).toMatchObject({
        ok: true,
      });
      expect(await actions.loadBoardCards({ date: '2026-10-26', orderContainerIds: [ID] })).toEqual(
        {
          ok: true,
          data: { cards: [], removedIds: [ID] },
        },
      );
    }
    expect(fakeService.getDispatchBoard).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'FLEET_MANAGER' }),
      expect.objectContaining({ date: '2026-10-26', direction: 'EXPORT' }),
    );
    currentRole = 'ACCOUNTANT';
    expect(await actions.loadDispatchBoard({ date: '2026-10-26' })).toMatchObject({
      ok: false,
      code: 'FORBIDDEN',
    });
    currentRole = 'VIEWER';
    expect(await actions.loadDispatchBoard({ date: '26/10/2026' })).toMatchObject({
      ok: false,
      code: 'VALIDATION_ERROR',
    });
    expect(
      await actions.loadBoardCards({ date: '2026-10-26', orderContainerIds: [] }),
    ).toMatchObject({
      ok: false,
      code: 'VALIDATION_ERROR',
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
