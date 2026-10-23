// Kéo thả thẻ container vào làn xe (dnd-kit): chọn làn dưới con trỏ, và đi làn này sang làn khác bằng phím mũi tên.
import {
  pointerWithin,
  type CollisionDetection,
  type KeyboardCoordinateGetter,
} from '@dnd-kit/core';

/**
 * Chuột: làn dưới con trỏ là đích thả (thẻ cao hơn một làn nên không dùng giao hình chữ nhật).
 * Bàn phím không có tọa độ con trỏ nên lấy làn chứa tâm thẻ; chưa dời tới làn nào thì chưa có đích (thả ngay không gán gì).
 */
export const laneCollisionDetection: CollisionDetection = (args) => {
  const underPointer = pointerWithin(args);
  if (underPointer.length > 0 || args.pointerCoordinates) return underPointer;
  const { collisionRect, droppableContainers, droppableRects } = args;
  const x = collisionRect.left + collisionRect.width / 2;
  const y = collisionRect.top + collisionRect.height / 2;
  return droppableContainers.flatMap((container) => {
    const rect = droppableRects.get(container.id);
    const inside =
      rect &&
      x >= rect.left &&
      x <= rect.left + rect.width &&
      y >= rect.top &&
      y <= rect.top + rect.height;
    return inside ? [{ id: container.id, data: { droppableContainer: container, value: 1 } }] : [];
  });
};

/**
 * Bàn phím: mũi tên xuống/lên dời thẻ sang làn kế tiếp/trước đó (lần đầu nhảy tới làn đầu/cuối), đặt tâm thẻ vào
 * tâm làn. Phím khác không làm gì (mũi tên trái/phải không có nghĩa trên lịch theo làn).
 */
export const laneKeyboardCoordinates: KeyboardCoordinateGetter = (event, { context }) => {
  const down = event.code === 'ArrowDown';
  const up = event.code === 'ArrowUp';
  if (!down && !up) return undefined;
  event.preventDefault();

  const { droppableRects, droppableContainers, collisionRect } = context;
  if (!collisionRect) return undefined;
  const lanes = droppableContainers
    .getEnabled()
    .flatMap((container) => {
      const rect = droppableRects.get(container.id);
      return rect ? [{ rect }] : [];
    })
    .sort((a, b) => a.rect.top - b.rect.top);
  if (lanes.length === 0) return undefined;

  const centerY = collisionRect.top + collisionRect.height / 2;
  const currentIndex = lanes.findIndex(
    ({ rect }) => centerY >= rect.top && centerY <= rect.top + rect.height,
  );
  const nextIndex =
    currentIndex < 0
      ? down
        ? 0
        : lanes.length - 1
      : Math.min(lanes.length - 1, Math.max(0, currentIndex + (down ? 1 : -1)));
  const { rect } = lanes[nextIndex]!;
  return {
    x: rect.left + rect.width / 2 - collisionRect.width / 2,
    y: rect.top + rect.height / 2 - collisionRect.height / 2,
  };
};
