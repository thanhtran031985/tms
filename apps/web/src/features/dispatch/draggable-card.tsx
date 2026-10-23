'use client';

import { useDraggable } from '@dnd-kit/core';
import { GripVertical } from 'lucide-react';
import type { KeyboardEventHandler, PointerEventHandler, ReactNode } from 'react';
import type { BoardCard } from '@shared/dispatch-board';
import { cn } from '@/lib/utils';

// Thẻ kéo được vào làn xe (dnd-kit). Chuột kéo cả thẻ (kéo từ 8px trở đi để cú bấm vẫn là "chọn thẻ").
// Bàn phím: bấm Enter/Space chọn thẻ rồi chọn xe ở bảng gán xe; riêng nút kéo hiện ở thẻ đang chọn dùng
// KeyboardSensor (Space nhấc thẻ, phím mũi tên đổi làn, Space thả, Esc hủy) để không tranh phím với việc chọn thẻ.
export function DraggableCard({
  card,
  selected,
  children,
}: {
  card: BoardCard;
  selected: boolean;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } = useDraggable({
    id: card.orderContainerId,
    data: { card },
  });
  return (
    <div
      ref={setNodeRef}
      // Chỉ gắn sự kiện chuột/cảm ứng lên cả thẻ; phím do nút kéo riêng nhận.
      onPointerDown={listeners?.onPointerDown as PointerEventHandler<HTMLDivElement> | undefined}
      className={cn(isDragging && 'opacity-40')}
    >
      {children}
      {selected ? (
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          onKeyDown={listeners?.onKeyDown as KeyboardEventHandler<HTMLButtonElement> | undefined}
          aria-label={`Kéo ${card.containerNo ?? 'container'} vào làn xe bằng bàn phím`}
          className="mt-4 flex min-h-ctl w-full cursor-grab items-center justify-center gap-6 rounded-control border border-dashed border-line-strong bg-surface text-small text-ink-soft hover:text-ink"
        >
          <GripVertical className="size-16" aria-hidden="true" />
          Kéo vào làn xe
        </button>
      ) : null}
    </div>
  );
}
