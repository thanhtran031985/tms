// Nghiệp vụ điều vận SINGLE (task 06, TICKET-06): lập chuyến, gán tài xế + đầu kéo + rơ moóc, điều, hủy gán.
// Mọi truy cập DB đi qua TenantDb (ADR-003); mọi thay đổi ghi audit_logs trong cùng transaction (Rule 8).
// Service ném AppError cho lỗi nghiệp vụ; Server Action chuyển thành Result.
import type { BoardCardsResult, DispatchBoard } from '@shared/dispatch-board';
import type {
  AddContainerToTripInput,
  AssignResourcesInput,
  CancelAssignmentInput,
  CreateConsolidatedTripInput,
  CreateSingleTripInput,
  DispatchTripInput,
  DispatchWarning,
  GetDispatchBoardInput,
  LinkStreetTurnInput,
  ListResourceAvailabilityInput,
  ListStreetTurnsInput,
  LoadBoardCardsInput,
  RemoveContainerFromTripInput,
  SetStreetTurnApprovalInput,
  UpdateTripTimesInput,
} from '@shared/schemas/dispatch';
import type { RequestContext } from '../../lib/context';
import type { DispatchEvent, PricingEvent } from '../../lib/redis/publish';
import type { TenantDb } from '../../lib/db/tenant-db';
import type { DispatchDeps } from './deps';
import type { AssignmentRow, TripRow } from './repo';
import { createAssignService } from './assign.service';
import { createAvailabilityQuery } from './availability.query';
import { createBoardQuery } from './board.query';
import { createConsolidateService } from './consolidate.service';
import { createSplitService, type RemoveContainerResult } from './split.service';
import {
  createStreetTurnService,
  type StreetTurnItem,
  type StreetTurnResult,
} from './street-turn.service';
import { createTripService } from './trips.service';

export type { RemoveContainerResult, StreetTurnItem, StreetTurnResult };

export type { DispatchEvent };

export type DispatchServiceOptions = {
  tenantDb: (ctx: RequestContext) => TenantDb;
  /** Thời điểm hiện tại; thay được trong test để cố định "hôm nay". */
  now?: () => Date;
  /** Đọc `tenants.settings` thô của tenant (parse bằng parseDispatchSettings); bỏ trống thì dùng mặc định. */
  loadSettings?: (ctx: RequestContext) => Promise<unknown>;
  /** Phát sự kiện sau khi transaction commit (Redis Pub/Sub); lỗi publish không làm hỏng thao tác đã commit. */
  publish?: (event: DispatchEvent) => Promise<void>;
  /** Báo worker tính lại giá sau khi ghép hoặc tách chuyến (task 08). */
  publishPricing?: (event: PricingEvent) => Promise<void>;
};

export type TripResult = {
  trip: TripRow;
  assignments: AssignmentRow[];
  warnings: DispatchWarning[];
};

/** Lý do một tài nguyên được hoặc không được điều trong khung giờ (bảng gán xe Screen03). */
export type AvailabilityReason = {
  code: string;
  severity: DispatchWarning['severity'];
  message: string;
  details?: Record<string, string | number>;
};

export type ResourceAvailability = {
  id: string;
  /** Biển số hoặc họ tên. */
  label: string;
  /** false nếu có ít nhất một lý do chặn (severity danger). */
  available: boolean;
  reasons: AvailabilityReason[];
};

export type AvailabilityResult = {
  drivers: ResourceAvailability[];
  tractors: ResourceAvailability[];
  trailers: ResourceAvailability[];
};

export type DispatchService = {
  createSingleTrip(ctx: RequestContext, input: CreateSingleTripInput): Promise<TripResult>;
  updateTripTimes(ctx: RequestContext, input: UpdateTripTimesInput): Promise<TripResult>;
  assignResources(ctx: RequestContext, input: AssignResourcesInput): Promise<TripResult>;
  dispatchTrip(ctx: RequestContext, input: DispatchTripInput): Promise<TripResult>;
  cancelAssignment(ctx: RequestContext, input: CancelAssignmentInput): Promise<TripResult>;
  listResourceAvailability(
    ctx: RequestContext,
    input: ListResourceAvailabilityInput,
  ): Promise<AvailabilityResult>;
  /** Bảng Kanban theo ngày: 6 cột thẻ container (phân trang theo cursor) và làn xe (task 07). */
  getDispatchBoard(ctx: RequestContext, input: GetDispatchBoardInput): Promise<DispatchBoard>;
  /** Thẻ mới nhất của vài container (cập nhật theo sự kiện SSE); container ngoài bảng trả trong removedIds. */
  getBoardCards(ctx: RequestContext, input: LoadBoardCardsInput): Promise<BoardCardsResult>;
  /** Lập chuyến TWIN_20 hoặc COMBINED cho 2 container, gán luôn tài nguyên nếu có `resources` (task 08). */
  createConsolidatedTrip(
    ctx: RequestContext,
    input: CreateConsolidatedTripInput,
  ): Promise<TripResult>;
  /** Ghép thêm container vào chuyến đơn chưa điều (SINGLE thành TWIN_20 hoặc COMBINED). */
  addContainerToTrip(ctx: RequestContext, input: AddContainerToTripInput): Promise<TripResult>;
  /** Tách một container khỏi chuyến ghép (spec 03 mục 4). */
  removeContainerFromTrip(
    ctx: RequestContext,
    input: RemoveContainerFromTripInput,
  ): Promise<RemoveContainerResult>;
  /** Liên kết Street Turn giữa cont Nhập và cont Xuất (Rule 3). */
  linkStreetTurn(ctx: RequestContext, input: LinkStreetTurnInput): Promise<StreetTurnResult>;
  /** Nhập số chấp thuận của hãng tàu (và phí nếu có) cho cặp Street Turn. */
  setStreetTurnApproval(
    ctx: RequestContext,
    input: SetStreetTurnApprovalInput,
  ): Promise<StreetTurnResult>;
  /** Các cặp Street Turn đang hoạt động; `pendingOnly` chỉ lấy cặp chưa có số chấp thuận. */
  listStreetTurns(ctx: RequestContext, input: ListStreetTurnsInput): Promise<StreetTurnItem[]>;
};

export function createDispatchService(options: DispatchServiceOptions): DispatchService {
  const deps: DispatchDeps = {
    tenantDb: options.tenantDb,
    now: options.now ?? (() => new Date()),
    loadSettings: options.loadSettings ?? (async () => ({})),
    publish: options.publish ?? (async () => {}),
    ...(options.publishPricing ? { publishPricing: options.publishPricing } : {}),
  };
  const trips = createTripService(deps);
  const assign = createAssignService(deps);
  const availability = createAvailabilityQuery(deps);
  const board = createBoardQuery(deps);
  const consolidate = createConsolidateService(deps);
  const split = createSplitService(deps);
  const streetTurn = createStreetTurnService(deps);
  return {
    createConsolidatedTrip: consolidate.createConsolidatedTrip,
    addContainerToTrip: consolidate.addContainerToTrip,
    removeContainerFromTrip: split.removeContainerFromTrip,
    linkStreetTurn: streetTurn.linkStreetTurn,
    setStreetTurnApproval: streetTurn.setStreetTurnApproval,
    listStreetTurns: streetTurn.listStreetTurns,
    createSingleTrip: trips.createSingleTrip,
    updateTripTimes: trips.updateTripTimes,
    assignResources: assign.assignResources,
    dispatchTrip: trips.dispatchTrip,
    cancelAssignment: assign.cancelAssignment,
    listResourceAvailability: availability.listResourceAvailability,
    getDispatchBoard: board.getDispatchBoard,
    getBoardCards: board.getBoardCards,
  };
}
