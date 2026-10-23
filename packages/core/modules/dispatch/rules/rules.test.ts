// Unit test cho các quy tắc điều vận dạng hàm thuần (không cần DB).
import { describe, expect, it } from 'vitest';
import type { OrderContainerRow } from '../../orders/repo';
import { checkDocuments } from './documents';
import { findDrivingHoursExcess, tenantDaysOf } from './driving-hours';
import { checkCutOff, containerWeight, standardTareTons } from './physical';
import { checkPortReadiness } from './port-readiness';
import { checkResourceState } from './resource-state';

const TZ = 'Asia/Ho_Chi_Minh';
const at = (iso: string) => new Date(iso);

describe('findDrivingHoursExcess', () => {
  const window = { start: at('2026-10-26T08:00:00Z'), end: at('2026-10-26T13:00:00Z') }; // 5 giờ

  it('không vượt: tổng đúng bằng giới hạn', () => {
    const existing = [{ start: at('2026-10-26T01:00:00Z'), end: at('2026-10-26T06:00:00Z') }];
    expect(findDrivingHoursExcess({ existing, window, timeZone: TZ, limitHours: 10 })).toBeNull();
  });

  it('vượt giới hạn: báo ngày và số giờ', () => {
    const existing = [{ start: at('2026-10-26T01:00:00Z'), end: at('2026-10-26T07:00:00Z') }];
    expect(findDrivingHoursExcess({ existing, window, timeZone: TZ, limitHours: 10 })).toEqual({
      date: '2026-10-26',
      plannedHours: 11,
      limitHours: 10,
    });
  });

  it('các dòng trùng nhau (3 assignment của cùng một chuyến) chỉ tính một lần', () => {
    const one = { start: at('2026-10-26T01:00:00Z'), end: at('2026-10-26T06:00:00Z') };
    const existing = [one, { ...one }, { ...one }];
    expect(findDrivingHoursExcess({ existing, window, timeZone: TZ, limitHours: 10 })).toBeNull();
  });

  it('chuyến qua nửa đêm giờ Việt Nam được chia theo từng ngày', () => {
    // 22:00 đến 04:00 giờ VN hôm sau: 2 giờ ngày 26, 4 giờ ngày 27.
    const night = { start: at('2026-10-26T15:00:00Z'), end: at('2026-10-26T21:00:00Z') };
    expect(tenantDaysOf(night, TZ)).toEqual(['2026-10-26', '2026-10-27']);
    expect(
      findDrivingHoursExcess({ existing: [], window: night, timeZone: TZ, limitHours: 3 }),
    ).toEqual({
      date: '2026-10-27',
      plannedHours: 4,
      limitHours: 3,
    });
  });

  it('chuyến của ngày khác không cộng dồn', () => {
    const otherDay = [{ start: at('2026-10-27T01:00:00Z'), end: at('2026-10-27T09:00:00Z') }];
    expect(
      findDrivingHoursExcess({ existing: otherDay, window, timeZone: TZ, limitHours: 10 }),
    ).toBeNull();
  });
});

describe('checkDocuments', () => {
  const base = {
    kind: 'DRIVER' as const,
    label: 'Test',
    plannedEnd: at('2026-10-26T05:00:00Z'),
    timeZone: TZ,
  };

  it('hết hạn trước ngày kết thúc: lỗi; đúng ngày kết thúc: còn hạn (cảnh báo 0 ngày)', () => {
    const expired = checkDocuments({ ...base, items: [{ name: 'GPLX', expiry: '2026-10-25' }] });
    const sameDay = checkDocuments({ ...base, items: [{ name: 'GPLX', expiry: '2026-10-26' }] });

    expect(expired.errors.map((e) => e.code)).toEqual(['DOCUMENT_EXPIRED']);
    expect(sameDay.errors).toEqual([]);
    expect(sameDay.warnings).toHaveLength(1);
  });

  it('cảnh báo khi còn dưới 15 ngày, không cảnh báo từ 15 ngày', () => {
    const near = checkDocuments({ ...base, items: [{ name: 'GPLX', expiry: '2026-11-09' }] }); // 14 ngày
    const far = checkDocuments({ ...base, items: [{ name: 'GPLX', expiry: '2026-11-10' }] }); // 15 ngày

    expect(near.warnings).toHaveLength(1);
    expect(far.warnings).toEqual([]);
  });

  it('giấy tờ chưa có ngày hết hạn thì bỏ qua', () => {
    const result = checkDocuments({ ...base, items: [{ name: 'GPLX', expiry: null }] });
    expect(result).toEqual({ errors: [], warnings: [] });
  });
});

describe('khối lượng container', () => {
  const cont = (over: Partial<OrderContainerRow>) =>
    ({ containerType: '40HC', vgmTons: null, cargoWeightTons: null, ...over }) as OrderContainerRow;

  it('VGM ưu tiên; không có thì hàng cộng vỏ chuẩn; thiếu cả hai là chưa biết', () => {
    const vgm = containerWeight(cont({ vgmTons: '20.00', cargoWeightTons: '30.00' }));
    const cargo = containerWeight(cont({ cargoWeightTons: '25.00' }));

    expect(vgm.known && vgm.tons.toString()).toBe('20');
    expect(cargo.known && cargo.tons.toString()).toBe('28.8');
    expect(containerWeight(cont({})).known).toBe(false);
  });

  it('vỏ chuẩn theo cỡ và cont lạnh', () => {
    expect(standardTareTons('20DC').toString()).toBe('2.3');
    expect(standardTareTons('45HC').toString()).toBe('3.8');
    expect(standardTareTons('40RF').toString()).toBe('5');
  });
});

describe('checkPortReadiness (Rule 7)', () => {
  const container = (portReadinessStatus: OrderContainerRow['portReadinessStatus']) => ({
    containerNo: 'MAEU2388417',
    lineNo: 1,
    portReadinessStatus,
  });

  it('Nhập cần READY_EDO, Xuất cần READY_EMPTY_RELEASE, HOLD luôn chặn', () => {
    const run = (
      orderType: 'IMPORT' | 'EXPORT',
      status: OrderContainerRow['portReadinessStatus'],
    ) =>
      checkPortReadiness({
        container: container(status),
        order: { orderType },
        firstStopLocationType: 'PORT',
      }).errors.length;

    expect(run('IMPORT', 'READY_EDO')).toBe(0);
    expect(run('IMPORT', 'READY_EMPTY_RELEASE')).toBe(1);
    expect(run('EXPORT', 'READY_EMPTY_RELEASE')).toBe(0);
    expect(run('EXPORT', 'READY_EDO')).toBe(1);
    expect(run('IMPORT', 'HOLD_CUSTOMS')).toBe(1);
    expect(run('EXPORT', 'HOLD_LINE')).toBe(1);
  });

  it('bỏ qua khi Order nội địa, Stop đầu không ở cảng/depot hoặc không gắn địa điểm', () => {
    const base = { container: container('PENDING') };
    expect(
      checkPortReadiness({
        ...base,
        order: { orderType: 'DOMESTIC' },
        firstStopLocationType: 'PORT',
      }).errors,
    ).toEqual([]);
    expect(
      checkPortReadiness({
        ...base,
        order: { orderType: 'IMPORT' },
        firstStopLocationType: 'WAREHOUSE',
      }).errors,
    ).toEqual([]);
    expect(
      checkPortReadiness({ ...base, order: { orderType: 'IMPORT' }, firstStopLocationType: null })
        .errors,
    ).toEqual([]);
  });
});

describe('checkCutOff (Rule 8)', () => {
  const stops = [{ stopType: 'PORT_IN' as const }];
  const order = { cutOffAt: at('2026-10-31T15:00:00Z') };

  it('cảnh báo đỏ khi kết thúc sau cut-off; đúng cut-off thì chưa quá', () => {
    expect(
      checkCutOff({ order, stops, plannedEnd: at('2026-10-31T15:00:01Z'), containerLabel: 'X' })
        .warnings,
    ).toHaveLength(1);
    expect(
      checkCutOff({ order, stops, plannedEnd: at('2026-10-31T15:00:00Z'), containerLabel: 'X' })
        .warnings,
    ).toEqual([]);
  });

  it('không có Stop PORT_IN hoặc không có cut-off thì không cảnh báo', () => {
    expect(
      checkCutOff({
        order,
        stops: [{ stopType: 'PICK_FULL' }],
        plannedEnd: at('2026-11-05T00:00:00Z'),
        containerLabel: 'X',
      }).warnings,
    ).toEqual([]);
    expect(
      checkCutOff({
        order: { cutOffAt: null },
        stops,
        plannedEnd: at('2026-11-05T00:00:00Z'),
        containerLabel: 'X',
      }).warnings,
    ).toEqual([]);
  });
});

describe('checkResourceState', () => {
  const now = at('2026-10-22T05:00:00Z');
  const row = (status: string, deletedAt: Date | null = null) => ({ status, deletedAt });

  it('đúng mốc 30 phút vẫn tính là sắp bắt đầu; sau 31 phút thì không', () => {
    const at30 = checkResourceState({
      kind: 'TRACTOR',
      row: row('IN_USE'),
      label: 'X',
      start: at('2026-10-22T05:30:00Z'),
      now,
    });
    const at31 = checkResourceState({
      kind: 'TRACTOR',
      row: row('IN_USE'),
      label: 'X',
      start: at('2026-10-22T05:31:00Z'),
      now,
    });

    expect(at30?.reason).toBe('BUSY');
    expect(at31).toBeNull();
  });

  it('không tồn tại và đã xóa mềm cùng một lý do NOT_FOUND', () => {
    const missing = checkResourceState({
      kind: 'TRAILER',
      row: undefined,
      label: '',
      start: now,
      now,
    });
    const deleted = checkResourceState({
      kind: 'TRAILER',
      row: row('AVAILABLE', now),
      label: '',
      start: now,
      now,
    });

    expect(missing?.reason).toBe('NOT_FOUND');
    expect(deleted?.reason).toBe('NOT_FOUND');
  });
});
