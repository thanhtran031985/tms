import { describe, expect, it } from 'vitest';
import type { BoardCard, BoardColumn } from '@shared/dispatch-board';
import { makeCard } from './board-fixtures';
import { appendPage, mergeCards, toColumnsState } from './board-state';

const card = (id: string, overrides: Partial<BoardCard> = {}) =>
  makeCard({ orderContainerId: id, ...overrides });
const column = (
  cards: BoardCard[],
  total = cards.length,
  nextCursor: string | null = null,
): BoardColumn => ({
  total,
  cards,
  nextCursor,
});
const ids = (c: BoardColumn) => c.cards.map((x) => x.orderContainerId);
const T = (hhmm: string) => `2026-10-26T${hhmm}:00.000Z`;

describe('mergeCards', () => {
  it('thẻ đổi cột (gán xe xong): rời Chờ điều, vào Đã lên kế hoạch, tổng mỗi cột đổi theo', () => {
    const state = toColumnsState({
      WAITING: column([card('a'), card('b')]),
      PLANNED: column([]),
    });

    const next = mergeCards(state, [
      card('a', {
        column: 'PLANNED',
        version: 1,
        trip: { id: 't', code: 'T1', version: 1, status: 'PLANNED' },
      }),
    ]);

    expect(ids(next.WAITING)).toEqual(['b']);
    expect(next.WAITING.total).toBe(1);
    expect(ids(next.PLANNED)).toEqual(['a']);
    expect(next.PLANNED.total).toBe(1);
  });

  it('thẻ cũ hơn bản đang có thì bỏ qua (sự kiện đến muộn)', () => {
    const state = toColumnsState({
      PLANNED: column([card('a', { column: 'PLANNED', version: 3 })]),
    });

    const next = mergeCards(state, [card('a', { column: 'WAITING', version: 2 })]);

    expect(next).toEqual(state);
  });

  it('cùng phiên bản container nhưng chuyến mới hơn thì thay', () => {
    const trip = (version: number) => ({ id: 't', code: 'T', version, status: 'PLANNED' as const });
    const state = toColumnsState({
      PLANNED: column([card('a', { column: 'PLANNED', trip: trip(1), tractorPlate: 'cũ' })]),
    });

    const next = mergeCards(state, [
      card('a', { column: 'PLANNED', trip: trip(2), tractorPlate: 'mới' }),
    ]);

    expect(next.PLANNED.cards[0]!.tractorPlate).toBe('mới');
  });

  it('removedIds xóa thẻ khỏi bất kỳ cột nào', () => {
    const state = toColumnsState({ WAITING: column([card('a'), card('b')]) });

    const next = mergeCards(state, [], ['a', 'không-có']);

    expect(ids(next.WAITING)).toEqual(['b']);
    expect(next.WAITING.total).toBe(1);
  });

  it('chèn theo thứ tự giờ bắt đầu', () => {
    const state = toColumnsState({
      WAITING: column([
        card('a', { windowStart: T('01:00') }),
        card('c', { windowStart: T('05:00') }),
      ]),
    });

    const next = mergeCards(state, [card('b', { windowStart: T('03:00') })]);

    expect(ids(next.WAITING)).toEqual(['a', 'b', 'c']);
  });

  it('cột chưa tải hết: thẻ nằm sau phần đã tải chỉ tăng tổng, không chen vào danh sách', () => {
    const state = toColumnsState({
      WAITING: column([card('a', { windowStart: T('01:00') })], 50, 'con-tro'),
    });

    const later = mergeCards(state, [card('z', { windowStart: T('23:00') })]);
    const earlier = mergeCards(state, [card('0', { windowStart: T('00:30') })]);

    expect(ids(later.WAITING)).toEqual(['a']);
    expect(later.WAITING.total).toBe(51);
    expect(ids(earlier.WAITING)).toEqual(['0', 'a']);
  });
});

describe('appendPage', () => {
  it('nối trang tiếp theo, bỏ thẻ trùng, lấy tổng và cursor mới', () => {
    const state = toColumnsState({
      WAITING: column([card('a'), card('b')], 4, 'cursor-1'),
    });

    const next = appendPage(state, 'WAITING', column([card('b'), card('c'), card('d')], 4, null));

    expect(ids(next.WAITING)).toEqual(['a', 'b', 'c', 'd']);
    expect(next.WAITING.nextCursor).toBeNull();
    expect(next.WAITING.total).toBe(4);
  });
});

describe('toColumnsState', () => {
  it('đủ 6 cột kể cả cột máy chủ không trả', () => {
    const state = toColumnsState({ WAITING: column([card('a')]) });

    expect(Object.keys(state)).toHaveLength(6);
    expect(state.AWAITING_HOOK).toEqual({ total: 0, cards: [], nextCursor: null });
  });
});
