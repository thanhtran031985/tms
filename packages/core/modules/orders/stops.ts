// Sinh chuỗi Stop chuẩn cho từng container (TICKET-04). Hàm thuần: không đụng DB, service gọi rồi ghi order_stops.
//   IMPORT:   PICK_FULL → UNSTUFFING → RETURN_EMPTY
//   EXPORT:   PICK_EMPTY → STUFFING → PORT_IN
//   DOMESTIC: theo mẫu của tuyến (route_stop_templates)
import type { OrderType, StopType } from '@shared/enums';

export const STANDARD_STOP_CHAINS: Record<'IMPORT' | 'EXPORT', readonly StopType[]> = {
  IMPORT: ['PICK_FULL', 'UNSTUFFING', 'RETURN_EMPTY'],
  EXPORT: ['PICK_EMPTY', 'STUFFING', 'PORT_IN'],
};

export type LocationRole = 'pickup' | 'cargo' | 'drop';
export type PlaceRef = { id: string; name: string };
export type StopPlaces = Partial<Record<LocationRole, PlaceRef | null>>;

/** Điểm lấy (cảng, depot cấp rỗng), điểm đóng/dỡ hàng (kho khách), điểm hạ/trả (cảng nhập, depot trả vỏ). */
export function locationRoleOf(stopType: StopType): LocationRole {
  switch (stopType) {
    case 'PICK_EMPTY':
    case 'PICK_FULL':
      return 'pickup';
    case 'RETURN_EMPTY':
    case 'PORT_IN':
      return 'drop';
    default:
      return 'cargo';
  }
}

export type PlannedStop = {
  sequenceNo: number;
  stopType: StopType;
  locationId: string | null;
  locationName: string;
};

export type StopPlanInput = {
  orderType: OrderType;
  /** Vùng đi và đến của tuyến, dùng làm tên địa điểm khi người dùng chưa chọn địa điểm. */
  zones: { originZone: string; destinationZone: string };
  /** Mẫu Stop của tuyến, bắt buộc với DOMESTIC. */
  template?: readonly StopType[];
  places?: StopPlaces;
};

export function buildStopPlan({
  orderType,
  zones,
  template,
  places,
}: StopPlanInput): PlannedStop[] {
  let chain: readonly StopType[];
  if (orderType === 'DOMESTIC') {
    if (!template || template.length === 0) {
      throw new Error('Đơn nội địa cần mẫu chuỗi Stop của tuyến.');
    }
    chain = template;
  } else {
    chain = STANDARD_STOP_CHAINS[orderType];
  }

  const fallback: Record<LocationRole, string> = {
    pickup: zones.originZone,
    cargo: zones.destinationZone,
    drop: zones.originZone,
  };
  return chain.map((stopType, index) => {
    const role = locationRoleOf(stopType);
    const chosen = places?.[role] ?? null;
    return {
      sequenceNo: index + 1,
      stopType,
      locationId: chosen?.id ?? null,
      locationName: chosen?.name ?? fallback[role],
    };
  });
}
