// Thẻ mẫu cho test của view bảng điều vận.
import type { BoardCard } from '@shared/dispatch-board';

export function makeCard(overrides: Partial<BoardCard> = {}): BoardCard {
  return {
    orderContainerId: '0190a000-0000-7000-9003-000000000001',
    version: 0,
    containerNo: 'OOLU8842105',
    containerType: '40HC',
    orderId: '0190a000-0000-7000-9002-000000000001',
    orderNo: 'EXP-2610-044',
    orderType: 'EXPORT',
    customerId: '0190a000-0000-7000-8000-000000000101',
    customerName: 'May mặc Phúc Thịnh',
    routeName: 'VSIP 1 → Cát Lái',
    zones: ['Cát Lái'],
    cutOffAt: null,
    demFreeUntil: null,
    detFreeUntil: null,
    portReadiness: 'READY_EMPTY_RELEASE',
    isReefer: false,
    isDangerousGoods: false,
    isStreetTurn: false,
    streetTurnApprovalRef: null,
    repriceRequired: false,
    missing: [],
    column: 'WAITING',
    windowStart: '2026-10-17T07:30:00.000Z', // 14:30 giờ Việt Nam
    windowEnd: '2026-10-17T09:20:00.000Z', // 16:20
    windowFromTrip: false,
    trip: null,
    tractorPlate: null,
    trailerPlate: null,
    driverName: null,
    ...overrides,
  };
}
