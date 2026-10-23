// Nghiệp vụ điều vận SINGLE (task 06, TICKET-06): lập chuyến, gán tài xế + đầu kéo + rơ moóc, điều, hủy gán.
// Mọi truy cập DB đi qua TenantDb (ADR-003); mọi thay đổi ghi audit_logs trong cùng transaction (Rule 8).
// Service ném AppError cho lỗi nghiệp vụ; Server Action chuyển thành Result.
// Đang cài dần: tạo chuyến và sửa giờ (bước 3); gán, điều, hủy gán, tra tài nguyên gán được (bước 4 đến 6).
import type {
  AssignResourcesInput,
  CancelAssignmentInput,
  CreateSingleTripInput,
  DispatchTripInput,
  DispatchWarning,
  ListResourceAvailabilityInput,
  UpdateTripTimesInput,
} from '@shared/schemas/dispatch';
import type { RequestContext } from '../../lib/context';
import type { TenantDb } from '../../lib/db/tenant-db';
import type { DispatchDeps } from './deps';
import type { AssignmentRow, TripRow } from './repo';
import { createTripService } from './trips.service';

export type DispatchEvent = {
  tenantId: string;
  /** Loại thay đổi, để Kanban biết cần tải lại gì. */
  type: 'dispatch.updated';
  tripId: string;
  version: number;
  orderContainerIds: string[];
};

export type DispatchServiceOptions = {
  tenantDb: (ctx: RequestContext) => TenantDb;
  /** Thời điểm hiện tại; thay được trong test để cố định "hôm nay". */
  now?: () => Date;
  /** Đọc `tenants.settings` thô của tenant (parse bằng parseDispatchSettings); bỏ trống thì dùng mặc định. */
  loadSettings?: (ctx: RequestContext) => Promise<unknown>;
  /** Phát sự kiện sau khi transaction commit (Redis Pub/Sub); lỗi publish không làm hỏng thao tác đã commit. */
  publish?: (event: DispatchEvent) => Promise<void>;
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
};

const notImplemented = (name: string) => async (): Promise<never> => {
  throw new Error(`dispatch.${name} chưa được cài đặt`);
};

export function createDispatchService(options: DispatchServiceOptions): DispatchService {
  const deps: DispatchDeps = {
    tenantDb: options.tenantDb,
    now: options.now ?? (() => new Date()),
    loadSettings: options.loadSettings ?? (async () => ({})),
    publish: options.publish ?? (async () => {}),
  };
  const trips = createTripService(deps);
  return {
    createSingleTrip: trips.createSingleTrip,
    updateTripTimes: trips.updateTripTimes,
    assignResources: notImplemented('assignResources'),
    dispatchTrip: notImplemented('dispatchTrip'),
    cancelAssignment: notImplemented('cancelAssignment'),
    listResourceAvailability: notImplemented('listResourceAvailability'),
  };
}
