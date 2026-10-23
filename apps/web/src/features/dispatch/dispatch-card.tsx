'use client';

import type { BoardCard } from '@shared/dispatch-board';
import { ContainerCard } from '@/components/ui/container-card';
import { CardChipList } from './card-chip-list';
import { cardChips } from './card-chips';
import { DIRECTION_LABELS, windowLabel } from './board-view';

// Thẻ container trên Kanban: ghép dữ liệu BoardCard vào ContainerCard (nhãn, khung giờ, biển số).
export function DispatchCard({
  card,
  nowMs,
  timeZone,
  selectable,
  selected,
  onSelect,
  dragging = false,
}: {
  card: BoardCard;
  nowMs: number;
  timeZone: string;
  /** Thẻ ở cột Chờ điều và người dùng được gán xe: bấm để chọn. */
  selectable: boolean;
  selected: boolean;
  onSelect: (card: BoardCard) => void;
  /** Bản sao đang bay theo con trỏ khi kéo (DragOverlay): có bóng nổi. */
  dragging?: boolean;
}) {
  const label = [
    card.containerNo ?? 'Chưa có số cont',
    card.containerType,
    card.customerName,
    ...(selectable ? ['chọn để gán xe'] : []),
  ].join(', ');
  return (
    <ContainerCard
      aria-label={label}
      containerNo={card.containerNo}
      containerType={card.containerType}
      orderNo={card.orderNo}
      customerName={card.customerName}
      directionLabel={DIRECTION_LABELS[card.orderType]}
      routeName={card.routeName}
      chips={<CardChipList chips={cardChips(card, nowMs, timeZone)} />}
      windowLabel={windowLabel(card, timeZone)}
      plateLabel={card.tractorPlate}
      selected={selectable ? selected : undefined}
      onClick={selectable ? () => onSelect(card) : undefined}
      dragging={dragging}
      disabled={!selectable}
      data-container-id={card.orderContainerId}
    />
  );
}
