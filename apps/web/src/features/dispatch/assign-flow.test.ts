import { describe, expect, it, vi } from 'vitest';
import { performAssign, safeCall, type AssignDeps, type AssignRequest } from './assign-flow';

const TRIP = { trip: { id: 't1', version: 0 }, warnings: [] };
const base: AssignRequest = {
  card: {
    orderContainerId: 'c1',
    windowStart: '2026-10-26T01:00:00.000Z',
    windowEnd: '2026-10-26T04:30:00.000Z',
    trip: null,
  },
  driverId: 'd',
  tractorId: 'x',
  trailerId: 'r',
};

const deps = (overrides: Partial<AssignDeps> = {}) =>
  ({
    createSingleTrip: vi.fn().mockResolvedValue({ ok: true, data: TRIP }),
    assignResources: vi
      .fn()
      .mockResolvedValue({ ok: true, data: { trip: { id: 't1', version: 2 }, warnings: [] } }),
    ...overrides,
  }) satisfies AssignDeps;

describe('performAssign', () => {
  it('thẻ chưa có chuyến: tạo chuyến theo khung giờ của thẻ rồi gán với phiên bản vừa tạo', async () => {
    const d = deps();

    const outcome = await performAssign(d, base);

    expect(d.createSingleTrip).toHaveBeenCalledWith({
      orderContainerId: 'c1',
      plannedStart: '2026-10-26T01:00:00.000Z',
      plannedEnd: '2026-10-26T04:30:00.000Z',
    });
    expect(d.assignResources).toHaveBeenCalledWith({
      tripId: 't1',
      version: 0,
      driverId: 'd',
      tractorId: 'x',
      trailerId: 'r',
    });
    expect(outcome).toEqual({ ok: true, trip: { id: 't1', version: 2 }, warnings: [] });
  });

  it('thẻ đã có chuyến (sau Hoàn tác): dùng lại chuyến, không tạo chuyến mới', async () => {
    const d = deps();

    await performAssign(d, { ...base, card: { ...base.card, trip: { id: 'tt', version: 5 } } });

    expect(d.createSingleTrip).not.toHaveBeenCalled();
    expect(d.assignResources).toHaveBeenCalledWith(
      expect.objectContaining({ tripId: 'tt', version: 5 }),
    );
  });

  it('gửi cờ xác nhận thiếu khối lượng và lý do ghi đè giờ lái khi có', async () => {
    const d = deps();

    await performAssign(d, { ...base, confirmMissingWeight: true, overrideReason: 'Khách gấp' });

    expect(d.assignResources).toHaveBeenCalledWith(
      expect.objectContaining({
        confirmMissingWeight: true,
        overrideDrivingHours: { reason: 'Khách gấp' },
      }),
    );
  });

  it('gán lỗi: trả mã lỗi và details; chuyến vừa tạo được báo để làm mới thẻ', async () => {
    const d = deps({
      assignResources: vi.fn().mockResolvedValue({
        ok: false,
        code: 'RESOURCE_TIME_CONFLICT',
        message: 'trùng',
        details: { resource: 'DRIVER', conflictTripCode: 'TRIP-1' },
      }),
    });

    const outcome = await performAssign(d, base);

    expect(outcome).toEqual({
      ok: false,
      error: {
        code: 'RESOURCE_TIME_CONFLICT',
        message: 'trùng',
        details: { resource: 'DRIVER', conflictTripCode: 'TRIP-1' },
      },
      createdTrip: { id: 't1', version: 0 },
    });
  });

  it('tạo chuyến lỗi: dừng, không gọi gán', async () => {
    const d = deps({
      createSingleTrip: vi
        .fn()
        .mockResolvedValue({ ok: false, code: 'ORDER_NOT_CONFIRMED', message: 'chưa xác nhận' }),
    });

    const outcome = await performAssign(d, base);

    expect(outcome).toMatchObject({ ok: false, error: { code: 'ORDER_NOT_CONFIRMED' } });
    expect(d.assignResources).not.toHaveBeenCalled();
  });

  it('thẻ chưa có giờ Stop đầu và chưa có chuyến: báo cần nhập giờ, không gọi máy chủ', async () => {
    const d = deps();

    const outcome = await performAssign(d, {
      ...base,
      card: { ...base.card, windowStart: null, windowEnd: null },
    });

    expect(outcome).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } });
    expect(d.createSingleTrip).not.toHaveBeenCalled();
    expect(d.assignResources).not.toHaveBeenCalled();
  });
});

describe('safeCall', () => {
  it('lỗi mạng thành Failure mã NETWORK', async () => {
    const result = await safeCall(async () => {
      throw new TypeError('Failed to fetch');
    });

    expect(result).toMatchObject({ ok: false, code: 'NETWORK' });
  });

  it('kết quả bình thường đi qua nguyên vẹn', async () => {
    expect(await safeCall(async () => ({ ok: true as const, data: 1 }))).toEqual({
      ok: true,
      data: 1,
    });
  });
});
