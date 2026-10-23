// Chuyến mẫu task 06, dùng chung cho seed, test tích hợp và e2e. UUID cố định để seed chạy lại không sinh trùng.
// Một chuyến buổi sáng SINGLE của cont MAEU2388417 (Order IMP-2610-031, Phúc An), gán 51C-482.17 + 51R-112.23 + Phạm Quốc Huy.
// Mỗi Stop của cont một assignment cùng bộ tài nguyên và khung giờ chuyến (decisions.md task 06).
import type { consolidatedTrips, dispatchAssignments, tripContainers } from '../schema';
import { getSeedFleetData } from './fleet.test-data';
import { SEED_TENANTS } from './identity.test-data';
import { SEED_ORDER_CONTAINERS, SEED_ORDER_STOPS } from './orders.test-data';

type TripInsert = typeof consolidatedTrips.$inferInsert;
type TripContainerInsert = typeof tripContainers.$inferInsert;
type AssignmentInsert = typeof dispatchAssignments.$inferInsert;

// 9007 chuyến · 9008 assignment (9000 danh mục, 9001 bảng giá, 9002-9006 đơn hàng).
const id = (kind: 7 | 8, n: number) =>
  `0190a000-0000-7000-900${kind}-${n.toString(16).padStart(12, '0')}`;

const phucAn = SEED_TENANTS.phucAn.id;
const fleet = getSeedFleetData();
const tractor = fleet.tractors.find((t) => t.plateNumber === '51C-482.17')!;
const trailer = fleet.trailers.find((t) => t.plateNumber === '51R-112.23')!;
const driver = fleet.drivers.find((d) => d.fullName === 'Phạm Quốc Huy')!;
const container = SEED_ORDER_CONTAINERS.find(
  (c) => c.tenantId === phucAn && c.containerNo === 'MAEU2388417',
)!;
const stops = SEED_ORDER_STOPS.filter((s) => s.orderContainerId === container.id).sort(
  (a, b) => a.sequenceNo - b.sequenceNo,
);

export const SEED_TRIP_SEQ_KEY = 'TRIP:2026-10';
export const SEED_TRIP_MORNING_START = new Date('2026-10-25T01:00:00.000Z'); // 08:00 giờ Việt Nam
export const SEED_TRIP_MORNING_END = new Date('2026-10-25T05:30:00.000Z'); // 12:30

export const SEED_TRIPS: (TripInsert & { id: string; tenantId: string })[] = [
  {
    id: id(7, 1),
    tenantId: phucAn,
    tripCode: 'TRIP-2610-001',
    tripMode: 'SINGLE',
    routeId: container.routeId,
    plannedStart: SEED_TRIP_MORNING_START,
    plannedEnd: SEED_TRIP_MORNING_END,
    primaryDriverId: driver.id,
    primaryTractorId: tractor.id,
    primaryTrailerId: trailer.id,
    status: 'PLANNED',
  },
];

export const SEED_TRIP_CONTAINERS: (TripContainerInsert & { tenantId: string })[] = [
  {
    tenantId: phucAn,
    tripId: SEED_TRIPS[0]!.id,
    orderContainerId: container.id,
    orderId: container.orderId,
  },
];

export const SEED_ASSIGNMENTS: (AssignmentInsert & { id: string; tenantId: string })[] = stops.map(
  (stop, index) => ({
    id: id(8, index + 1),
    tenantId: phucAn,
    consolidatedTripId: SEED_TRIPS[0]!.id,
    stopId: stop.id!,
    assignmentType: 'INTERNAL_FLEET',
    driverId: driver.id,
    tractorId: tractor.id,
    trailerId: trailer.id,
    plannedStart: SEED_TRIP_MORNING_START,
    plannedEnd: SEED_TRIP_MORNING_END,
    status: 'ASSIGNED',
    dispatchedAt: SEED_TRIP_MORNING_START,
  }),
);

export const SEED_DISPATCH_CONTAINER_ID = container.id;
