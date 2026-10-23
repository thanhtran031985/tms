// Kiểu dữ liệu bảng điều vận Kanban (task 07). Dùng chung service (board.query), Server Action, SSE và giao diện.
// Thời điểm là chuỗi ISO 8601 UTC để đi qua Server Action/JSON mà không mất kiểu.
import type { OrderType, PORT_READINESS, TripStatus } from './enums';

export type PortReadiness = (typeof PORT_READINESS)[number];

export const BOARD_COLUMN_IDS = [
  'WAITING',
  'PLANNED',
  'DISPATCHED',
  'IN_TRANSIT',
  'AWAITING_HOOK',
  'AWAITING_DOCS',
] as const;
export type BoardColumnId = (typeof BOARD_COLUMN_IDS)[number];

export const BOARD_COLUMN_LABELS: Record<BoardColumnId, string> = {
  WAITING: 'Chờ điều',
  PLANNED: 'Đã lên kế hoạch',
  DISPATCHED: 'Đã điều',
  IN_TRANSIT: 'Đang chạy',
  AWAITING_HOOK: 'Chờ móc rơ moóc',
  AWAITING_DOCS: 'Hoàn thành chờ chứng từ',
};

/** Số thẻ tối đa mỗi cột mỗi lần tải (phần còn lại lấy bằng cursor). */
export const BOARD_PAGE_SIZE = 100;
/** Container chưa có chuyến: khung giờ gợi ý = giờ Stop đầu + ngần này giờ (routes chưa có thời lượng chuẩn). */
export const DEFAULT_TRIP_HOURS = 3.5;

export type BoardDirection = 'IMPORT' | 'EXPORT';

export type BoardCardTrip = { id: string; code: string; version: number; status: TripStatus };

export type BoardCard = {
  orderContainerId: string;
  /** Phiên bản dòng container; so khi nhận sự kiện SSE để biết dữ liệu nào mới hơn. */
  version: number;
  containerNo: string | null;
  containerType: string;
  orderId: string;
  orderNo: string;
  orderType: OrderType;
  customerId: string;
  customerName: string;
  routeName: string;
  zones: string[];
  cutOffAt: string | null;
  demFreeUntil: string | null;
  detFreeUntil: string | null;
  portReadiness: PortReadiness;
  isReefer: boolean;
  isDangerousGoods: boolean;
  isStreetTurn: boolean;
  /** Thiếu thông tin điều vận cần: số container, khối lượng. */
  missing: ('CONTAINER_NO' | 'WEIGHT')[];
  column: BoardColumnId;
  /** Khung giờ: của chuyến nếu đã có chuyến, nếu không là khung gợi ý từ Stop đầu (null nếu Stop đầu chưa có giờ). */
  windowStart: string | null;
  windowEnd: string | null;
  windowFromTrip: boolean;
  trip: BoardCardTrip | null;
  tractorPlate: string | null;
  trailerPlate: string | null;
  driverName: string | null;
};

export type BoardColumn = { total: number; cards: BoardCard[]; nextCursor: string | null };

export type LaneBlock = {
  id: string;
  kind: 'TRIP' | 'MAINTENANCE';
  title: string;
  subtitle: string;
  start: string;
  end: string;
  tone: 'info' | 'primary' | 'ok' | 'warn';
  tripId: string | null;
};
export type LaneBadge = { label: string; tone: 'warn' | 'crit' };
export type ResourceLane = {
  tractorId: string;
  plateNumber: string;
  status: string;
  badges: LaneBadge[];
  blocks: LaneBlock[];
};

export type DispatchBoard = {
  date: string;
  dayStart: string;
  dayEnd: string;
  /** Số container theo chiều hàng, sau khi áp bộ lọc khác nhưng chưa áp chiều hàng. */
  directionCounts: { ALL: number; EXPORT: number; IMPORT: number };
  /** Khi gọi kèm `column` chỉ cột đó có mặt. */
  columns: Partial<Record<BoardColumnId, BoardColumn>>;
  /** Chỉ có khi tải cả bảng (không kèm `column`). */
  lanes: ResourceLane[] | null;
};

export type BoardCardsResult = { cards: BoardCard[]; removedIds: string[] };

/** Sự kiện SSE `dispatch.updated` (cùng dạng với DispatchEvent phát từ core); client dùng kiểu này, không import core. */
export type DispatchStreamEvent = {
  type: 'dispatch.updated';
  tenantId: string;
  tripId: string;
  version: number;
  orderContainerIds: string[];
};

// ---- Tra cứu tài nguyên gán được (bảng gán xe), cùng dạng với kết quả listResourceAvailability của core.
export type AvailabilityReason = {
  code: string;
  severity: 'info' | 'warn' | 'danger';
  message: string;
  details?: Record<string, string | number>;
};
export type ResourceAvailability = {
  id: string;
  label: string;
  available: boolean;
  reasons: AvailabilityReason[];
};
export type AvailabilityResult = {
  drivers: ResourceAvailability[];
  tractors: ResourceAvailability[];
  trailers: ResourceAvailability[];
};
