// Logic thuần của thao tác ghép chuyến trên Kanban (task 08): chọn tối đa 2 thẻ, gợi ý chế độ ghép, khung giờ chung,
// điều kiện đảo vỏ Street Turn. Tách khỏi component để test bằng Vitest (web không chạy jsdom).
import type { BoardCard } from '@shared/dispatch-board';
import type { ConsolidatedTripMode } from '@shared/schemas/dispatch';

export const MAX_PICKED = 2;

/** Bật hoặc tắt chọn một thẻ để ghép; chọn thẻ thứ ba thì bỏ thẻ chọn sớm nhất. */
export function togglePick(picked: readonly string[], id: string): string[] {
  if (picked.includes(id)) return picked.filter((x) => x !== id);
  return [...picked, id].slice(-MAX_PICKED);
}

/** Thẻ đã nằm trong chuyến ghép thì không chọn để ghép lần nữa (muốn đổi phải tách chuyến). */
export function isPickable(card: BoardCard): boolean {
  return card.column === 'WAITING' && (!card.trip || card.trip.mode === 'SINGLE');
}

/** Thẻ thuộc chuyến ghép chưa chạy: có nút "Tách chuyến". */
export function isSplittable(card: BoardCard): boolean {
  return (
    card.trip !== null &&
    card.trip.mode !== 'SINGLE' &&
    (card.column === 'WAITING' || card.column === 'PLANNED' || card.column === 'DISPATCHED')
  );
}

const is20ft = (card: BoardCard) => card.containerType.startsWith('20');

/** Hai cont 20 feet gợi ý TWIN_20, còn lại (một Nhập một Xuất) gợi ý COMBINED. */
export function defaultMode(cards: readonly BoardCard[]): ConsolidatedTripMode {
  return cards.length === 2 && cards.every(is20ft) ? 'TWIN_20' : 'COMBINED';
}

/** Cặp một Nhập một Xuất chưa liên kết thì cho chọn đảo vỏ (Street Turn). */
export function streetTurnPair(
  cards: readonly BoardCard[],
): { importCard: BoardCard; exportCard: BoardCard } | null {
  if (cards.length !== 2) return null;
  const importCard = cards.find((c) => c.orderType === 'IMPORT');
  const exportCard = cards.find((c) => c.orderType === 'EXPORT');
  if (!importCard || !exportCard || importCard.isStreetTurn || exportCard.isStreetTurn) return null;
  return { importCard, exportCard };
}

/** Khung giờ chuyến ghép = từ giờ bắt đầu sớm nhất đến giờ kết thúc muộn nhất của hai thẻ; thiếu giờ thì null. */
export function combinedWindow(
  cards: readonly BoardCard[],
): { start: string; end: string } | null {
  const starts = cards.map((c) => c.windowStart);
  const ends = cards.map((c) => c.windowEnd);
  if (starts.some((s) => !s) || ends.some((e) => !e)) return null;
  const earliest = Math.min(...starts.map((s) => Date.parse(s!)));
  const latest = Math.max(...ends.map((e) => Date.parse(e!)));
  return { start: new Date(earliest).toISOString(), end: new Date(latest).toISOString() };
}

export const MODE_LABELS: Record<ConsolidatedTripMode, { title: string; hint: string }> = {
  TWIN_20: {
    title: 'TWIN_20',
    hint: 'Hai cont 20 feet cùng nằm trên một rơ moóc có chốt khóa giữa.',
  },
  COMBINED: {
    title: 'COMBINED',
    hint: 'Một cont Nhập và một cont Xuất trong cùng một chuyến.',
  },
};
