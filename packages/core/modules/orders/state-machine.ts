// Máy trạng thái Order và container (spec 02 enum `status`). Bảng chuyển hợp lệ khai báo ở một chỗ.
// Task 04 chỉ thực thi DRAFT → CONFIRMED và các lần hủy; các chuyển còn lại do task điều vận, ePOD, hóa đơn kích hoạt.
// CANCELLED chỉ đến được khi không còn container nào đang hoạt động: điều kiện này kiểm ở service (cần dữ liệu container).
import type { ContainerStatus, OrderStatus } from '@shared/enums';
import { AppError } from '@shared/errors';

export const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  DRAFT: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['PARTIALLY_DELIVERED', 'DELIVERED', 'CANCELLED'],
  // Thêm container mới vào Order đã giao một phần thì Order quay lại đang thực hiện.
  PARTIALLY_DELIVERED: ['IN_PROGRESS', 'DELIVERED'],
  DELIVERED: ['RECONCILED'],
  RECONCILED: ['INVOICED'],
  INVOICED: [],
  CANCELLED: [],
};

export const CONTAINER_TRANSITIONS: Record<ContainerStatus, readonly ContainerStatus[]> = {
  PENDING: ['PLANNED', 'CANCELLED'],
  // Gỡ container khỏi chuyến đưa nó về PENDING (task 06, 08).
  PLANNED: ['PENDING', 'IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['DELIVERED', 'CANCELLED'],
  DELIVERED: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
};

export function canTransitionOrder(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from].includes(to);
}

export function assertOrderTransition(from: OrderStatus, to: OrderStatus): void {
  if (!canTransitionOrder(from, to)) throw new AppError('INVALID_STATUS_TRANSITION');
}

export function canTransitionContainer(from: ContainerStatus, to: ContainerStatus): boolean {
  return CONTAINER_TRANSITIONS[from].includes(to);
}

export function assertContainerTransition(from: ContainerStatus, to: ContainerStatus): void {
  if (!canTransitionContainer(from, to)) throw new AppError('INVALID_STATUS_TRANSITION');
}

/** Container đã giao (DELIVERED), hoàn tất hoặc đã hủy thì không hủy được (Screen04). */
export function canCancelContainerFrom(status: ContainerStatus): boolean {
  return canTransitionContainer(status, 'CANCELLED');
}
