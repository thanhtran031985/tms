'use client';

import { ChevronDown, ChevronRight, Merge, Unlink } from 'lucide-react';
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
import { isPickable, isSplittable } from './consolidate-view';
import { DispatchCard } from './dispatch-card';
import { DraggableCard } from './draggable-card';

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
  canAssign,
  selectedId,
  onSelect,
  pickedIds,
  onTogglePick,
  onSplit,
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
  /** Người dùng được gán xe và tách chuyến (hiện nút "Tách chuyến" ở mọi cột). */
  canAssign: boolean;
  selectedId: string | null;
  onSelect: (card: BoardCard) => void;
  /** Thẻ đã chọn để ghép chuyến (tối đa 2); chỉ có ý nghĩa khi người dùng được gán xe. */
  pickedIds: ReadonlySet<string>;
  onTogglePick: (card: BoardCard) => void;
  /** Bấm "Tách chuyến" trên thẻ của chuyến ghép. */
  onSplit: (card: BoardCard) => void;
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

  const renderCard = (card: BoardCard) => {
    const selected = selectedId === card.orderContainerId;
    const picked = pickedIds.has(card.orderContainerId);
    const canPick = selectable && isPickable(card);
    const canSplit = canAssign && isSplittable(card);
    const element = (
      <DispatchCard
        card={card}
        nowMs={nowMs}
        timeZone={timeZone}
        selectable={selectable}
        selected={selected}
        onSelect={onSelect}
      />
    );
    const actions =
      canPick || canSplit ? (
        <div className="mt-4 flex flex-col gap-4">
          {canPick ? (
            <button
              type="button"
              aria-pressed={picked}
              data-pick={card.orderContainerId}
              onClick={() => onTogglePick(card)}
              className={cn(
                'flex min-h-ctl w-full cursor-pointer items-center justify-center gap-6 rounded-control border bg-surface text-small',
                picked
                  ? 'border-primary font-semibold text-primary ring-2 ring-primary'
                  : 'border-line-strong text-ink-soft hover:text-ink',
              )}
            >
              <Merge className="size-16" aria-hidden="true" />
              {picked ? 'Bỏ chọn ghép' : 'Chọn để ghép'}
            </button>
          ) : null}
          {canSplit ? (
            <button
              type="button"
              data-split={card.orderContainerId}
              onClick={() => onSplit(card)}
              className="flex min-h-ctl w-full cursor-pointer items-center justify-center gap-6 rounded-control border border-line-strong bg-surface text-small text-ink-soft hover:text-ink"
            >
              <Unlink className="size-16" aria-hidden="true" />
              Tách chuyến
            </button>
          ) : null}
        </div>
      ) : null;
    return selectable ? (
      <DraggableCard key={card.orderContainerId} card={card} selected={selected} below={actions}>
        {element}
      </DraggableCard>
    ) : (
      <div key={card.orderContainerId}>
        {element}
        {actions}
      </div>
    );
  };

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
