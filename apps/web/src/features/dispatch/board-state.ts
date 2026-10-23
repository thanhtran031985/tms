// Trạng thái dữ liệu của bảng Kanban phía client: gộp thẻ mới tải (theo sự kiện SSE hoặc sau khi gán),
// nối thêm trang của một cột. Hàm thuần để test; component chỉ giữ kết quả trong state.
import type { BoardCard, BoardColumn, BoardColumnId, ResourceLane } from '@shared/dispatch-board';
import { BOARD_COLUMN_IDS } from '@shared/dispatch-board';

export type ColumnsState = Record<BoardColumnId, BoardColumn>;

const EMPTY: BoardColumn = { total: 0, cards: [], nextCursor: null };

export function toColumnsState(columns: Partial<Record<BoardColumnId, BoardColumn>>): ColumnsState {
  return Object.fromEntries(
    BOARD_COLUMN_IDS.map((id) => [id, columns[id] ?? { ...EMPTY }]),
  ) as ColumnsState;
}

// Cùng thứ tự với máy chủ (board.query): giờ bắt đầu tăng dần, chưa có giờ xếp cuối, rồi theo id.
const keyOf = (card: BoardCard): [number, string] => [
  card.windowStart ? Date.parse(card.windowStart) : Number.POSITIVE_INFINITY,
  card.orderContainerId,
];
export function compareCards(a: BoardCard, b: BoardCard): number {
  const [at, aid] = keyOf(a);
  const [bt, bid] = keyOf(b);
  if (at !== bt) return at < bt ? -1 : 1;
  return aid < bid ? -1 : aid > bid ? 1 : 0;
}

/** Thẻ `next` có mới hơn (hoặc bằng) thẻ `prev` không: so phiên bản container rồi phiên bản chuyến. */
export function isNewerOrSame(next: BoardCard, prev: BoardCard): boolean {
  if (next.version !== prev.version) return next.version > prev.version;
  return (next.trip?.version ?? -1) >= (prev.trip?.version ?? -1);
}

function locate(columns: ColumnsState, id: string) {
  for (const columnId of BOARD_COLUMN_IDS) {
    const card = columns[columnId].cards.find((c) => c.orderContainerId === id);
    if (card) return { columnId, card };
  }
  return null;
}

/**
 * Gộp thẻ vừa tải lại: thẻ cũ hơn bản đang có thì bỏ; thẻ mới thay chỗ cũ (có thể sang cột khác); `removedIds` là
 * container không còn trên bảng. Cột chưa tải hết (còn nextCursor) chỉ nhận thẻ nằm trong phần đã tải.
 */
export function mergeCards(
  columns: ColumnsState,
  cards: BoardCard[],
  removedIds: string[] = [],
): ColumnsState {
  let next: ColumnsState = { ...columns };
  const take = (id: string) => {
    const found = locate(next, id);
    if (!found) return null;
    const column = next[found.columnId];
    next = {
      ...next,
      [found.columnId]: {
        ...column,
        total: Math.max(0, column.total - 1),
        cards: column.cards.filter((c) => c.orderContainerId !== id),
      },
    };
    return found.card;
  };

  for (const id of removedIds) take(id);
  for (const card of cards) {
    const existing = locate(next, card.orderContainerId);
    if (existing && !isNewerOrSame(card, existing.card)) continue;
    take(card.orderContainerId);
    const column = next[card.column];
    const last = column.cards[column.cards.length - 1];
    const loadedFully = column.nextCursor === null;
    const insideLoaded = !!last && compareCards(card, last) <= 0;
    const cards =
      loadedFully || insideLoaded ? [...column.cards, card].sort(compareCards) : column.cards;
    next = { ...next, [card.column]: { ...column, total: column.total + 1, cards } };
  }
  return next;
}

/** Nối trang tiếp theo của một cột (không trùng thẻ đã có). */
export function appendPage(
  columns: ColumnsState,
  id: BoardColumnId,
  page: BoardColumn,
): ColumnsState {
  const column = columns[id];
  const have = new Set(column.cards.map((c) => c.orderContainerId));
  return {
    ...columns,
    [id]: {
      total: page.total,
      cards: [...column.cards, ...page.cards.filter((c) => !have.has(c.orderContainerId))],
      nextCursor: page.nextCursor,
    },
  };
}

// ---- Optimistic UI (Rule 3): thẻ dời sang Đã lên kế hoạch và khối chuyến hiện trên lịch ngay khi bấm gán.
// React tự trả về trạng thái thật khi thao tác kết thúc, nên lỗi thì thẻ quay về chỗ cũ mà không cần hoàn nguyên tay.
export type OptimisticAssign = {
  containerId: string;
  tractorId: string;
  tractorPlate: string;
  trailerPlate: string | null;
  driverName: string | null;
};

export function applyOptimisticAssign(
  columns: ColumnsState,
  assign: OptimisticAssign,
): ColumnsState {
  const card = columns.WAITING.cards.find((c) => c.orderContainerId === assign.containerId);
  if (!card) return columns;
  return mergeCards(columns, [
    {
      ...card,
      column: 'PLANNED',
      windowFromTrip: true,
      tractorPlate: assign.tractorPlate,
      trailerPlate: assign.trailerPlate,
      driverName: assign.driverName,
    },
  ]);
}

export function applyOptimisticLane(
  lanes: ResourceLane[] | null,
  assign: OptimisticAssign,
  card: Pick<BoardCard, 'containerNo' | 'windowStart' | 'windowEnd'>,
): ResourceLane[] | null {
  if (!lanes || !card.windowStart || !card.windowEnd) return lanes;
  return lanes.map((lane) =>
    lane.tractorId !== assign.tractorId
      ? lane
      : {
          ...lane,
          blocks: [
            ...lane.blocks,
            {
              id: `optimistic-${assign.containerId}`,
              kind: 'TRIP' as const,
              title: card.containerNo ?? 'Chưa có số cont',
              subtitle: [assign.driverName, assign.trailerPlate].filter(Boolean).join(' · '),
              start: card.windowStart!,
              end: card.windowEnd!,
              tone: 'info' as const,
              tripId: null,
            },
          ],
        },
  );
}
