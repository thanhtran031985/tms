// Luồng gán xe cho một thẻ container (task 07): tạo chuyến SINGLE nếu thẻ chưa có chuyến, rồi gán tài xế + đầu kéo + rơ moóc.
// Hàm thuần nhận các Server Action qua `deps` để test được; component bọc lỗi mạng thành mã NETWORK.
import type { Failure, Result } from '@shared/result';

export type TripSummaryDto = {
  trip: { id: string; version: number };
  warnings: { code: string; severity: 'info' | 'warn' | 'danger'; message: string }[];
};

export type AssignDeps = {
  createSingleTrip: (input: {
    orderContainerId: string;
    plannedStart: string;
    plannedEnd: string;
  }) => Promise<Result<TripSummaryDto>>;
  assignResources: (input: {
    tripId: string;
    version: number;
    driverId: string;
    tractorId: string;
    trailerId: string;
    confirmMissingWeight?: boolean;
    overrideDrivingHours?: { reason: string };
  }) => Promise<Result<TripSummaryDto>>;
};

export type AssignRequest = {
  card: {
    orderContainerId: string;
    windowStart: string | null;
    windowEnd: string | null;
    trip: { id: string; version: number } | null;
  };
  driverId: string;
  tractorId: string;
  trailerId: string;
  confirmMissingWeight?: boolean;
  overrideReason?: string;
};

export type AssignOutcome =
  | { ok: true; trip: { id: string; version: number }; warnings: TripSummaryDto['warnings'] }
  | {
      ok: false;
      error: Pick<Failure, 'code' | 'message' | 'details'>;
      /** Chuyến đã tạo trước khi lỗi (thẻ sẽ quay về Chờ điều nhưng mang chuyến này). */
      createdTrip?: { id: string; version: number };
    };

export async function performAssign(
  deps: AssignDeps,
  request: AssignRequest,
): Promise<AssignOutcome> {
  const { card } = request;
  let trip = card.trip;
  let createdTrip: { id: string; version: number } | undefined;

  if (!trip) {
    if (!card.windowStart || !card.windowEnd) {
      return {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message:
            'Container chưa có giờ lấy hoặc trả hàng ở Stop đầu nên chưa có khung giờ chuyến. Nhập giờ trong Order trước.',
        },
      };
    }
    const created = await deps.createSingleTrip({
      orderContainerId: card.orderContainerId,
      plannedStart: card.windowStart,
      plannedEnd: card.windowEnd,
    });
    if (!created.ok) return { ok: false, error: toError(created) };
    trip = { id: created.data.trip.id, version: created.data.trip.version };
    createdTrip = trip;
  }

  const assigned = await deps.assignResources({
    tripId: trip.id,
    version: trip.version,
    driverId: request.driverId,
    tractorId: request.tractorId,
    trailerId: request.trailerId,
    ...(request.confirmMissingWeight ? { confirmMissingWeight: true } : {}),
    ...(request.overrideReason ? { overrideDrivingHours: { reason: request.overrideReason } } : {}),
  });
  if (!assigned.ok) {
    return { ok: false, error: toError(assigned), ...(createdTrip ? { createdTrip } : {}) };
  }
  return {
    ok: true,
    trip: { id: assigned.data.trip.id, version: assigned.data.trip.version },
    warnings: assigned.data.warnings,
  };
}

function toError(failure: Failure): Pick<Failure, 'code' | 'message' | 'details'> {
  return {
    code: failure.code,
    message: failure.message,
    ...(failure.details ? { details: failure.details } : {}),
  };
}

/** Bọc lời gọi Server Action: lỗi mạng hoặc lỗi bất ngờ thành Failure có mã NETWORK, không ném ra giao diện. */
export async function safeCall<T>(call: () => Promise<Result<T>>): Promise<Result<T>> {
  try {
    return await call();
  } catch {
    return {
      ok: false,
      code: 'NETWORK' as Failure['code'],
      message: 'Không kết nối được máy chủ.',
    };
  }
}
