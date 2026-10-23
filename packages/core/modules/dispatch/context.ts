// Dữ liệu container, Order và Stop của một chuyến, tải bằng đọc thường SAU khi đã khóa tài nguyên (xem evaluate.ts).
import { asc, eq, inArray } from 'drizzle-orm';
import type { LocationType } from '@shared/enums';
import {
  locations,
  orderContainers,
  orders,
  orderStops,
  tripContainers,
} from '../../lib/db/schema';
import type { TenantDb } from '../../lib/db/tenant-db';
import type { OrderContainerRow, OrderRow, OrderStopRow } from '../orders/repo';

export type TripContext = {
  orderContainerIds: string[];
  containers: OrderContainerRow[];
  orders: Map<string, OrderRow>;
  /** Theo container rồi sequenceNo; bỏ Stop đã SKIPPED. */
  stops: OrderStopRow[];
  /** Loại địa điểm của từng Stop có locationId, để áp Rule 7. */
  locationTypes: Map<string, LocationType>;
};

export async function loadTripContext(tx: TenantDb, tripId: string): Promise<TripContext> {
  const links = await tx.select(tripContainers, eq(tripContainers.tripId, tripId));
  const orderContainerIds = links.map((l) => l.orderContainerId);
  if (orderContainerIds.length === 0) {
    return {
      orderContainerIds,
      containers: [],
      orders: new Map(),
      stops: [],
      locationTypes: new Map(),
    };
  }

  const containers = await tx.select(
    orderContainers,
    inArray(orderContainers.id, orderContainerIds),
  );
  const orderRows = await tx.select(
    orders,
    inArray(orders.id, [...new Set(containers.map((c) => c.orderId))]),
  );
  const stops = (
    await tx.select(orderStops, inArray(orderStops.orderContainerId, orderContainerIds), {
      orderBy: [asc(orderStops.orderContainerId), asc(orderStops.sequenceNo)],
    })
  ).filter((s) => s.status !== 'SKIPPED');

  const locationIds = [
    ...new Set(stops.map((s) => s.locationId).filter((id): id is string => !!id)),
  ];
  const locationRows = locationIds.length
    ? await tx.select(locations, inArray(locations.id, locationIds))
    : [];

  return {
    orderContainerIds,
    containers,
    orders: new Map(orderRows.map((o) => [o.id, o])),
    stops,
    locationTypes: new Map(locationRows.map((l) => [l.id, l.type])),
  };
}
