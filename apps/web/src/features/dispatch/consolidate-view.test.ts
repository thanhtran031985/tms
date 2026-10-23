import { describe, expect, it } from 'vitest';
import { makeCard } from './board-fixtures';
import {
  combinedWindow,
  defaultMode,
  isPickable,
  isSplittable,
  streetTurnPair,
  togglePick,
} from './consolidate-view';

const trip = (mode: 'SINGLE' | 'TWIN_20' | 'COMBINED') => ({
  id: 't',
  code: 'TRIP-1',
  version: 1,
  status: 'PLANNED' as const,
  mode,
});

describe('togglePick', () => {
  it('chọn rồi bỏ chọn, tối đa 2 thẻ, thẻ thứ ba thay thẻ chọn sớm nhất', () => {
    expect(togglePick([], 'a')).toEqual(['a']);
    expect(togglePick(['a'], 'b')).toEqual(['a', 'b']);
    expect(togglePick(['a', 'b'], 'a')).toEqual(['b']);
    expect(togglePick(['a', 'b'], 'c')).toEqual(['b', 'c']);
  });
});

describe('isPickable / isSplittable', () => {
  it('chỉ thẻ Chờ điều chưa thuộc chuyến ghép mới chọn được để ghép', () => {
    expect(isPickable(makeCard())).toBe(true);
    expect(isPickable(makeCard({ trip: trip('SINGLE') }))).toBe(true);
    expect(isPickable(makeCard({ trip: trip('TWIN_20') }))).toBe(false);
    expect(isPickable(makeCard({ column: 'PLANNED' }))).toBe(false);
  });

  it('chỉ thẻ thuộc chuyến ghép chưa chạy mới tách được', () => {
    expect(isSplittable(makeCard({ trip: trip('TWIN_20'), column: 'WAITING' }))).toBe(true);
    expect(isSplittable(makeCard({ trip: trip('COMBINED'), column: 'DISPATCHED' }))).toBe(true);
    expect(isSplittable(makeCard({ trip: trip('SINGLE'), column: 'PLANNED' }))).toBe(false);
    expect(isSplittable(makeCard({ trip: trip('TWIN_20'), column: 'IN_TRANSIT' }))).toBe(false);
    expect(isSplittable(makeCard())).toBe(false);
  });
});

describe('defaultMode và streetTurnPair', () => {
  it('hai cont 20 feet gợi ý TWIN_20, còn lại COMBINED', () => {
    const a = makeCard({ containerType: '20DC' });
    const b = makeCard({ containerType: '20DC' });
    expect(defaultMode([a, b])).toBe('TWIN_20');
    expect(defaultMode([a, makeCard({ containerType: '40HC' })])).toBe('COMBINED');
  });

  it('cặp một Nhập một Xuất chưa liên kết thì cho đảo vỏ', () => {
    const imp = makeCard({ orderType: 'IMPORT' });
    const exp = makeCard({ orderType: 'EXPORT' });
    expect(streetTurnPair([imp, exp])).toEqual({ importCard: imp, exportCard: exp });
    expect(streetTurnPair([imp, makeCard({ orderType: 'IMPORT' })])).toBeNull();
    expect(streetTurnPair([imp, makeCard({ orderType: 'EXPORT', isStreetTurn: true })])).toBeNull();
    expect(streetTurnPair([imp])).toBeNull();
  });
});

describe('combinedWindow', () => {
  it('lấy giờ bắt đầu sớm nhất và giờ kết thúc muộn nhất của hai thẻ', () => {
    const a = makeCard({ windowStart: '2026-10-28T01:00:00.000Z', windowEnd: '2026-10-28T04:30:00.000Z' });
    const b = makeCard({ windowStart: '2026-10-28T02:00:00.000Z', windowEnd: '2026-10-28T05:30:00.000Z' });
    expect(combinedWindow([a, b])).toEqual({
      start: '2026-10-28T01:00:00.000Z',
      end: '2026-10-28T05:30:00.000Z',
    });
  });

  it('thiếu giờ của một thẻ thì không có khung giờ chung', () => {
    const a = makeCard();
    const b = makeCard({ windowStart: null, windowEnd: null });
    expect(combinedWindow([a, b])).toBeNull();
  });
});
