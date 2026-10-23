'use client';

import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import {
  BOARD_COLUMN_LABELS,
  type BoardCard,
  type BoardColumn,
  type BoardColumnId,
} from '@shared/dispatch-board';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { buildColumnItems } from './board-view';
import { DispatchCard } from './dispatch-card';

const EMPTY_TEXT: Record<BoardColumnId, string> = {
  WAITING: 'Không còn container nào chờ điều.',
  PLANNED: 'Chưa có container nào được lên kế hoạch.',
  DISPATCHED: 'Chưa có chuyến nào được điều.',
  IN_TRANSIT: 'Chưa có chuyến nào đang chạy.',
  AWAITING_HOOK: 'Chưa có container chờ móc rơ moóc. Cột này có dữ liệu khi dùng Drop & Hook.',
  AWAITING_DOCS: 'Chưa có chuyến nào chờ chứng từ.',
};

// Một cột Kanban: tiêu đề + số đếm, thẻ gom theo Order (thu gọn được), nút tải thêm khi còn trang sau.
export function KanbanColumn({
  id,
  column,
  nowMs,
  timeZone,
  selectable,
  selectedId,
  onSelect,
  filtered,
  loadingMore,
  onLoadMore,
}: {
  id: BoardColumnId;
  column: BoardColumn;
  nowMs: number;
  timeZone: string;
  /** Thẻ trong cột này chọn được để gán xe (cột Chờ điều, người dùng có quyền gán). */
  selectable: boolean;
  selectedId: string | null;
  onSelect: (card: BoardCard) => void;
  /** Đang có bộ lọc: cột trống ghi "không khớp bộ lọc". */
  filtered: boolean;
  loadingMore: boolean;
  onLoadMore: (id: BoardColumnId) => void;
}) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const items = buildColumnItems(column.cards);
  const remaining = column.total - column.cards.length;
  const headingId = `col-${id}`;

  const toggle = (orderId: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (!next.delete(orderId)) next.add(orderId);
      return next;
    });

  const renderCard = (card: BoardCard) => (
    <DispatchCard
      key={card.orderContainerId}
      card={card}
      nowMs={nowMs}
      timeZone={timeZone}
      selectable={selectable}
      selected={selectedId === card.orderContainerId}
      onSelect={onSelect}
    />
  );

  return (
    <section
      aria-labelledby={headingId}
      data-column={id}
      className="flex min-h-kcol-min flex-col gap-8 rounded-card bg-surface-2 p-10"
    >
      <h2 className="m-0 flex items-center justify-between px-4 py-2 text-body-sm font-semibold">
        <span id={headingId}>{BOARD_COLUMN_LABELS[id]}</span>
        <span
          data-count
          className="min-w-24 rounded-pill bg-surface px-8 text-center text-caption font-bold"
          aria-label={`${column.total} container`}
        >
          {column.total}
        </span>
      </h2>

      {items.length === 0 ? (
        <p className="m-0 px-8 py-16 text-center text-small text-ink-soft">
          {filtered ? 'Không có container nào khớp bộ lọc.' : EMPTY_TEXT[id]}
        </p>
      ) : (
        items.map((item) => {
          if (item.kind === 'card') return renderCard(item.card);
          const { group } = item;
          const open = !collapsed.has(group.orderId);
          const Chevron = open ? ChevronDown : ChevronRight;
          return (
            <div
              key={group.orderId}
              className="flex flex-col gap-8"
              data-order-group={group.orderId}
            >
              <button
                type="button"
                aria-expanded={open}
                onClick={() => toggle(group.orderId)}
                className="flex min-h-ctl w-full cursor-pointer items-start gap-6 py-4 rounded-control border border-transparent bg-transparent px-4 text-left text-small text-ink hover:bg-surface"
              >
                <Chevron className="size-16 flex-none text-ink-soft" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block font-mono">{group.orderNo}</span>
                  <span className="block text-caption font-normal text-ink-soft">
                    {group.customerName}
                  </span>
                </span>
                <span className="rounded-pill bg-surface px-8 text-caption font-bold">
                  {group.cards.length} cont
                </span>
              </button>
              {open ? group.cards.map(renderCard) : null}
            </div>
          );
        })
      )}

      {remaining > 0 && column.nextCursor ? (
        <Button
          variant="secondary"
          size="sm"
          loading={loadingMore}
          onClick={() => onLoadMore(id)}
          className={cn('w-full')}
        >
          Tải thêm {remaining} container
        </Button>
      ) : null}
    </section>
  );
}
