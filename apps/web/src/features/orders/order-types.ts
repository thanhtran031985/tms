// Kiểu dữ liệu gửi xuống client cho màn Đơn hàng (task 04). Thời điểm là chuỗi ISO UTC; tiền là chuỗi DECIMAL.
// Cột gửi xuống được chọn từng trường: không đẩy cả dòng DB (tenantId, createdBy…) ra trình duyệt.
import type {
  ContainerStatus,
  ContainerType,
  OrderStatus,
  OrderType,
  StopType,
} from '@shared/enums';

export type PriceState = 'set' | 'preview' | 'missing' | 'none';

export type ContainerDto = {
  id: string;
  lineNo: number;
  containerNo: string | null;
  containerType: ContainerType;
  sealNo: string | null;
  status: ContainerStatus;
  portReadiness: 'PENDING' | 'READY_EDO' | 'READY_EMPTY_RELEASE' | 'HOLD_CUSTOMS' | 'HOLD_LINE';
  demFreeUntil: string | null;
  detFreeUntil: string | null;
  baseFreightAmount: string;
  /**
   * set: đã chốt (theo bảng giá hoặc giá tay); preview: Order nháp, giá dự kiến tra từ bảng giá; missing: chưa có giá
   * (phải nhập giá tay); none: container đã hủy. 0.00 của cont chưa chốt chỉ là giá trị đệm, không bao giờ hiển thị.
   */
  priceState: PriceState;
  /** Số tiền ứng với set hoặc preview; null khi missing hoặc none. */
  priceAmount: string | null;
  isManualPrice: boolean;
  repriceRequired: boolean;
  isEpodVerified: boolean;
  routeId: string;
  cancelReason: string | null;
};

export type OrderListItemDto = {
  id: string;
  orderNo: string;
  orderType: OrderType;
  bookingOrBlNo: string;
  customerId: string;
  customerName: string;
  shippingLineId: string | null;
  shippingLineName: string | null;
  vesselVoyage: string | null;
  cutOffAt: string | null;
  eta: string | null;
  status: OrderStatus;
  version: number;
  containerCount: number;
  totalFreightAmount: string;
  totalSurchargeAmount: string;
  totalPassThroughAmount: string;
  currency: string;
  createdAt: string;
  containers: ContainerDto[];
};

export type StopDto = {
  id: string;
  orderContainerId: string;
  sequenceNo: number;
  stopType: StopType;
  locationName: string;
  windowStart: string | null;
  status: 'PENDING' | 'ARRIVED' | 'COMPLETED' | 'SKIPPED';
};

export type FeeDto = {
  id: string;
  orderContainerId: string | null;
  feeCategory: 'REVENUE_SURCHARGE' | 'PASS_THROUGH';
  feeCode: string;
  quantity: string;
  amount: string;
  source: 'TARIFF' | 'DEM_DET_JOB' | 'MANUAL' | 'EXPENSE_REBILL';
};

export type HistoryDto = { id: string; at: string; who: string; what: string };

export type OrderDetailDto = {
  order: OrderListItemDto & {
    routeName: string;
    cargoDescription: string | null;
    customerRef: string | null;
    cancelReason: string | null;
  };
  stops: StopDto[];
  fees: FeeDto[];
  history: HistoryDto[];
  /** Số container đang hoạt động ở Order khác. */
  warnings: { containerNo: string; orderId: string; orderNo: string }[];
};

export type OrderAccess = { write: boolean; manualPrice: boolean };

// ---- Quy tắc hiển thị dùng chung danh sách và chi tiết

export const isActiveContainer = (c: Pick<ContainerDto, 'status'>) => c.status !== 'CANCELLED';

/** Cont còn việc phải làm: chưa giao, chưa hủy. */
export const needsAction = (c: Pick<ContainerDto, 'status'>) =>
  c.status === 'PENDING' || c.status === 'PLANNED' || c.status === 'IN_PROGRESS';

export const isDeliveredContainer = (c: Pick<ContainerDto, 'status'>) =>
  c.status === 'DELIVERED' || c.status === 'COMPLETED';

/** Order còn việc: chưa giao xong, chưa hủy. */
export const OPEN_STATUSES: readonly OrderStatus[] = [
  'DRAFT',
  'CONFIRMED',
  'IN_PROGRESS',
  'PARTIALLY_DELIVERED',
];

export type OrderTab = 'all' | 'draft' | 'open' | 'delivered' | 'billed' | 'cancelled';

export function tabOfStatus(status: OrderStatus): Exclude<OrderTab, 'all'> {
  switch (status) {
    case 'DRAFT':
      return 'draft';
    case 'CONFIRMED':
    case 'IN_PROGRESS':
    case 'PARTIALLY_DELIVERED':
      return 'open';
    case 'DELIVERED':
      return 'delivered';
    case 'RECONCILED':
    case 'INVOICED':
      return 'billed';
    case 'CANCELLED':
      return 'cancelled';
  }
}

/** Cont chưa có giá (không có bảng giá và chưa nhập giá tay), không tính cont đã hủy. */
export const unpricedContainers = (containers: ContainerDto[]) =>
  containers.filter((c) => c.priceState === 'missing');

/** Cont đã có số tiền để hiển thị: giá chốt hoặc giá dự kiến. */
export const hasAmount = (c: Pick<ContainerDto, 'priceState'>) =>
  c.priceState === 'set' || c.priceState === 'preview';

/**
 * Tổng cước hiển thị của Order. Order nháp chưa có tổng (giá chốt khi xác nhận) nên cộng giá dự kiến của các cont;
 * Order đã xác nhận dùng tổng đã chốt.
 */
export function orderFreight(
  order: Pick<OrderListItemDto, 'status' | 'containers' | 'totalFreightAmount'>,
) {
  if (order.status !== 'DRAFT') return order.totalFreightAmount;
  return order.containers
    .reduce((sum, c) => sum + (hasAmount(c) ? Number(c.priceAmount) : 0), 0)
    .toFixed(2);
}
