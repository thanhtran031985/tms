// Bảng điều vận Kanban (task 07): mỗi container một thẻ, chia 6 cột theo trạng thái chuyến, kèm lịch xe trong ngày.
// Chỉ đọc thường, không khóa dòng nào. TenantDb chỉ chọn trên một bảng nên dữ liệu được gom bằng vài truy vấn
// `inArray` rồi ghép trong bộ nhớ (như availability.query). Lọc và phân trang theo cursor làm sau khi ghép.
import { and, eq, gte, inArray, isNull, lt } from 'drizzle-orm';
import {
  BOARD_COLUMN_IDS,
  BOARD_PAGE_SIZE,
  DEFAULT_TRIP_HOURS,
  type BoardCard,
  type BoardCardsResult,
  type BoardColumn,
  type BoardColumnId,
  type DispatchBoard,
  type LaneBadge,
  type LaneBlock,
  type ResourceLane,
} from '@shared/dispatch-board';
import { AppError } from '@shared/errors';
import type { GetDispatchBoardInput, LoadBoardCardsInput } from '@shared/schemas/dispatch';
import type { RequestContext } from '../../lib/context';
import {
  consolidatedTrips,
  customers,
  dispatchAssignments,
  drivers,
  locations,
  maintenanceOrders,
  orderContainers,
  orders,
  orderStops,
  routes,
  tractors,
  trailers,
  tripContainers,
} from '../../lib/db/schema';
import type { TenantDb } from '../../lib/db/tenant-db';
import { addCalendarDays, diffCalendarDays, startOfTenantDay, toTenantDate } from '../../lib/time';
import {
  ACTIVE_TRIP_STATUSES,
  authorize,
  invalid,
  isActiveAssignment,
  type DispatchDeps,
} from './deps';
import { documentsOf, DOCUMENT_WARNING_DAYS } from './rules/documents';

type Row<T extends { $inferSelect: unknown }> = T['$inferSelect'];
type TripRow = Row<typeof consolidatedTrips>;
type ContainerRow = Row<typeof orderContainers>;
type AssignmentRow = Row<typeof dispatchAssignments>;

const CHUNK = 500; // số phần tử tối đa mỗi mệnh đề IN
const BOARD_TRIP_STATUSES = [...ACTIVE_TRIP_STATUSES, 'COMPLETED'] as const;
const WAITING_ORDER_STATUSES = ['CONFIRMED', 'IN_PROGRESS'] as const;
const HOUR = 3_600_000;
const MAINTENANCE_SOON_KM = 1000;

const iso = (value: Date | null | undefined) => (value ? value.toISOString() : null);

async function selectIn<T extends Parameters<TenantDb['select']>[0]>(
  tdb: TenantDb,
  table: T,
  column: Parameters<typeof inArray>[0],
  ids: string[],
  extra?: Parameters<TenantDb['select']>[1],
): Promise<T['$inferSelect'][]> {
  const unique = [...new Set(ids)];
  const out: T['$inferSelect'][] = [];
  for (let i = 0; i < unique.length; i += CHUNK) {
    out.push(...(await tdb.select(table, and(inArray(column, unique.slice(i, i + CHUNK)), extra))));
  }
  return out;
}

// So khớp ô tìm: bỏ dấu tiếng Việt, không phân biệt hoa thường.
const fold = (text: string) =>
  text.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd');

type Scope =
  | { kind: 'day'; dayStart: Date; dayEnd: Date }
  | { kind: 'ids'; dayStart: Date; dayEnd: Date; ids: string[] };

type Collected = {
  cards: BoardCard[];
  trips: TripRow[]; // chuyến giao với ngày (cho làn xe)
  assignmentsByTrip: Map<string, AssignmentRow[]>;
  containersByTrip: Map<string, ContainerRow[]>;
};

function encodeCursor(card: BoardCard): string {
  const ms = card.windowStart ? Date.parse(card.windowStart) : null;
  return Buffer.from(JSON.stringify([ms, card.orderContainerId])).toString('base64url');
}

function decodeCursor(cursor: string): [number | null, string] {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (
      Array.isArray(parsed) &&
      parsed.length === 2 &&
      (parsed[0] === null || typeof parsed[0] === 'number') &&
      typeof parsed[1] === 'string'
    ) {
      return [parsed[0], parsed[1]];
    }
  } catch {
    // rơi xuống lỗi bên dưới
  }
  throw invalid('cursor', 'Con trỏ phân trang không hợp lệ. Tải lại bảng.');
}

// Thứ tự thẻ trong cột: giờ bắt đầu tăng dần, chưa có giờ xếp cuối, rồi theo id cho ổn định.
const sortKey = (card: BoardCard): [number, string] => [
  card.windowStart ? Date.parse(card.windowStart) : Number.POSITIVE_INFINITY,
  card.orderContainerId,
];
function compareCards(a: BoardCard, b: BoardCard): number {
  const [at, aid] = sortKey(a);
  const [bt, bid] = sortKey(b);
  if (at !== bt) return at < bt ? -1 : 1;
  return aid < bid ? -1 : aid > bid ? 1 : 0;
}

export function createBoardQuery(deps: DispatchDeps) {
  function dayWindow(ctx: RequestContext, date: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
      throw invalid('date', 'Chọn ngày hợp lệ.');
    }
    return {
      dayStart: startOfTenantDay(date, ctx.timezone),
      dayEnd: startOfTenantDay(addCalendarDays(date, 1), ctx.timezone),
    };
  }

  async function collect(ctx: RequestContext, tdb: TenantDb, scope: Scope): Promise<Collected> {
    const { dayStart, dayEnd } = scope;

    // 1. Chuyến và container ứng viên.
    let trips: TripRow[];
    let links: Row<typeof tripContainers>[];
    let containers: ContainerRow[];
    if (scope.kind === 'day') {
      trips = await tdb.select(
        consolidatedTrips,
        and(
          inArray(consolidatedTrips.status, [...BOARD_TRIP_STATUSES]),
          lt(consolidatedTrips.plannedStart, dayEnd),
          gte(consolidatedTrips.plannedEnd, dayStart),
        ),
      );
      links = await selectIn(
        tdb,
        tripContainers,
        tripContainers.tripId,
        trips.map((t) => t.id),
      );
      const waitingOrders = await tdb.select(
        orders,
        inArray(orders.status, [...WAITING_ORDER_STATUSES]),
      );
      const waiting = await selectIn(
        tdb,
        orderContainers,
        orderContainers.orderId,
        waitingOrders.map((o) => o.id),
        eq(orderContainers.status, 'PENDING'),
      );
      const known = new Set(waiting.map((c) => c.id));
      const linked = await selectIn(
        tdb,
        orderContainers,
        orderContainers.id,
        links.map((l) => l.orderContainerId).filter((id) => !known.has(id)),
      );
      containers = [...waiting, ...linked];
    } else {
      containers = await selectIn(tdb, orderContainers, orderContainers.id, scope.ids);
      links = await selectIn(
        tdb,
        tripContainers,
        tripContainers.orderContainerId,
        containers.map((c) => c.id),
      );
      trips = await selectIn(
        tdb,
        consolidatedTrips,
        consolidatedTrips.id,
        links.map((l) => l.tripId),
        inArray(consolidatedTrips.status, [...BOARD_TRIP_STATUSES]),
      );
    }
    containers = containers.filter((c) => c.status !== 'CANCELLED');

    // 2. Order (bỏ nháp, đã hủy), khách, Stop, địa điểm, tuyến.
    const orderRows = await selectIn(
      tdb,
      orders,
      orders.id,
      containers.map((c) => c.orderId),
    );
    const orderById = new Map(
      orderRows
        .filter((o) => o.status !== 'DRAFT' && o.status !== 'CANCELLED')
        .map((o) => [o.id, o]),
    );
    containers = containers.filter((c) => orderById.has(c.orderId));
    const [customerRows, stopRows, routeRows] = await Promise.all([
      selectIn(
        tdb,
        customers,
        customers.id,
        [...orderById.values()].map((o) => o.customerId),
      ),
      selectIn(
        tdb,
        orderStops,
        orderStops.orderContainerId,
        containers.map((c) => c.id),
      ),
      selectIn(
        tdb,
        routes,
        routes.id,
        containers.map((c) => c.routeId),
      ),
    ]);
    const locationRows = await selectIn(
      tdb,
      locations,
      locations.id,
      stopRows.map((s) => s.locationId).filter((id): id is string => !!id),
    );
    const customerById = new Map(customerRows.map((c) => [c.id, c.name]));
    const routeById = new Map(routeRows.map((r) => [r.id, r]));
    const zoneByLocation = new Map(locationRows.map((l) => [l.id, l.zone]));
    const stopsByContainer = new Map<string, typeof stopRows>();
    for (const stop of stopRows) {
      const list = stopsByContainer.get(stop.orderContainerId) ?? [];
      list.push(stop);
      stopsByContainer.set(stop.orderContainerId, list);
    }

    // 3. Mỗi container một chuyến để hiển thị: ưu tiên chuyến đang hoạt động, không thì chuyến hoàn thành gần nhất.
    const tripById = new Map(trips.map((t) => [t.id, t]));
    const tripOfContainer = new Map<string, TripRow>();
    for (const link of links) {
      const trip = tripById.get(link.tripId);
      if (!trip) continue;
      const current = tripOfContainer.get(link.orderContainerId);
      const active = (t: TripRow) => (ACTIVE_TRIP_STATUSES as readonly string[]).includes(t.status);
      if (
        !current ||
        (active(trip) && !active(current)) ||
        (active(trip) === active(current) && trip.plannedStart > current.plannedStart)
      ) {
        tripOfContainer.set(link.orderContainerId, trip);
      }
    }

    // 4. Assignment đang hoạt động và tài nguyên của các chuyến đó (ngày: mọi chuyến giao với ngày cho làn xe).
    const assignments = (
      await selectIn(
        tdb,
        dispatchAssignments,
        dispatchAssignments.consolidatedTripId,
        trips.map((t) => t.id),
      )
    ).filter(isActiveAssignment);
    const assignmentsByTrip = new Map<string, AssignmentRow[]>();
    for (const a of assignments) {
      if (!a.consolidatedTripId) continue;
      const list = assignmentsByTrip.get(a.consolidatedTripId) ?? [];
      list.push(a);
      assignmentsByTrip.set(a.consolidatedTripId, list);
    }
    const [driverRows, tractorRows, trailerRows] = await Promise.all([
      selectIn(
        tdb,
        drivers,
        drivers.id,
        assignments.map((a) => a.driverId).filter((x): x is string => !!x),
      ),
      selectIn(
        tdb,
        tractors,
        tractors.id,
        assignments.map((a) => a.tractorId).filter((x): x is string => !!x),
      ),
      selectIn(
        tdb,
        trailers,
        trailers.id,
        assignments.map((a) => a.trailerId).filter((x): x is string => !!x),
      ),
    ]);
    const driverById = new Map(driverRows.map((d) => [d.id, d.fullName]));
    const tractorById = new Map(tractorRows.map((t) => [t.id, t.plateNumber]));
    const trailerById = new Map(trailerRows.map((t) => [t.id, t.plateNumber]));

    // 5. Dựng thẻ.
    const cards: BoardCard[] = [];
    for (const container of containers) {
      const order = orderById.get(container.orderId)!;
      const stops = (stopsByContainer.get(container.id) ?? []).sort(
        (a, b) => a.sequenceNo - b.sequenceNo,
      );
      const trip = tripOfContainer.get(container.id);
      const tripAssignments = trip ? (assignmentsByTrip.get(trip.id) ?? []) : [];
      const first = tripAssignments[0];

      let column: BoardColumnId | null = null;
      if (!trip) {
        column = container.status === 'PENDING' ? 'WAITING' : null;
      } else if (trip.status === 'PLANNED') {
        column = first ? 'PLANNED' : 'WAITING'; // chuyến chưa còn xe (sau Hoàn tác) quay về Chờ điều
      } else if (trip.status === 'DISPATCHED') {
        column = 'DISPATCHED';
      } else if (trip.status === 'IN_TRANSIT') {
        column = 'IN_TRANSIT';
      } else if (trip.status === 'COMPLETED') {
        column = container.isEpodVerified ? null : 'AWAITING_DOCS';
      }
      if (!column) continue;

      const firstStart = stops[0]?.windowStart ?? null;
      const windowStart = trip ? trip.plannedStart : firstStart;
      const windowEnd = trip
        ? trip.plannedEnd
        : firstStart
          ? new Date(firstStart.getTime() + DEFAULT_TRIP_HOURS * HOUR)
          : null;

      // Hiển thị trong ngày: chuyến phải giao với ngày; Chờ điều chưa có chuyến thì tồn từ trước hoặc chưa có giờ vẫn hiện.
      const visible = trip
        ? trip.plannedStart < dayEnd && trip.plannedEnd >= dayStart
        : !firstStart || firstStart < dayEnd;
      if (!visible) continue;

      const route = routeById.get(container.routeId);
      const zones = new Set<string>();
      for (const stop of stops) {
        const zone = stop.locationId ? zoneByLocation.get(stop.locationId) : null;
        if (zone) zones.add(zone);
      }
      if (route) {
        zones.add(route.originZone);
        zones.add(route.destinationZone);
      }

      cards.push({
        orderContainerId: container.id,
        version: container.version,
        containerNo: container.containerNo,
        containerType: container.containerType,
        orderId: order.id,
        orderNo: order.orderNo,
        orderType: order.orderType,
        customerId: order.customerId,
        customerName: customerById.get(order.customerId) ?? 'Khách không còn',
        routeName: route?.name ?? '',
        zones: [...zones],
        cutOffAt: iso(order.cutOffAt),
        demFreeUntil: iso(container.demFreeUntil),
        detFreeUntil: iso(container.detFreeUntil),
        portReadiness: container.portReadinessStatus,
        isReefer: container.containerType.endsWith('RF'),
        isDangerousGoods: container.isDangerousGoods,
        isStreetTurn: container.linkedContainerId !== null,
        streetTurnApprovalRef: container.streetTurnApprovalRef,
        repriceRequired: container.repriceRequired,
        missing: missingOf(container),
        column,
        windowStart: iso(windowStart),
        windowEnd: iso(windowEnd),
        windowFromTrip: !!trip,
        trip: trip
          ? {
              id: trip.id,
              code: trip.tripCode,
              version: trip.version,
              status: trip.status,
              mode: trip.tripMode,
            }
          : null,
        tractorPlate: first?.tractorId ? (tractorById.get(first.tractorId) ?? null) : null,
        trailerPlate: first?.trailerId ? (trailerById.get(first.trailerId) ?? null) : null,
        driverName: first?.driverId ? (driverById.get(first.driverId) ?? null) : null,
      });
    }

    const containersByTrip = new Map<string, ContainerRow[]>();
    const containerById = new Map(containers.map((c) => [c.id, c]));
    for (const link of links) {
      const container = containerById.get(link.orderContainerId);
      if (!container) continue;
      const list = containersByTrip.get(link.tripId) ?? [];
      list.push(container);
      containersByTrip.set(link.tripId, list);
    }
    return { cards, trips, assignmentsByTrip, containersByTrip };
  }

  async function buildLanes(
    ctx: RequestContext,
    tdb: TenantDb,
    data: Collected,
    dayStart: Date,
    dayEnd: Date,
  ): Promise<ResourceLane[]> {
    const today = toTenantDate(deps.now(), ctx.timezone);
    const [tractorRows, maintenance] = await Promise.all([
      tdb.select(tractors, isNull(tractors.deletedAt)),
      tdb.select(
        maintenanceOrders,
        and(
          inArray(maintenanceOrders.status, ['PLANNED', 'IN_PROGRESS']),
          lt(maintenanceOrders.plannedStart, dayEnd),
          gte(maintenanceOrders.plannedEnd, dayStart),
        ),
      ),
    ]);

    const blocksByTractor = new Map<string, LaneBlock[]>();
    const driverIdsByTractor = new Map<string, Set<string>>();
    const push = (tractorId: string, block: LaneBlock) => {
      const list = blocksByTractor.get(tractorId) ?? [];
      list.push(block);
      blocksByTractor.set(tractorId, list);
    };
    const driverIds = new Set<string>();
    const trailerIds = new Set<string>();
    for (const list of data.assignmentsByTrip.values()) {
      for (const a of list) {
        if (a.driverId) driverIds.add(a.driverId);
        if (a.trailerId) trailerIds.add(a.trailerId);
      }
    }
    const [driverRows, trailerRows] = await Promise.all([
      selectIn(tdb, drivers, drivers.id, [...driverIds]),
      selectIn(tdb, trailers, trailers.id, [...trailerIds]),
    ]);
    const driverById = new Map(driverRows.map((d) => [d.id, d]));
    const trailerById = new Map(trailerRows.map((t) => [t.id, t.plateNumber]));

    for (const trip of data.trips) {
      const list = data.assignmentsByTrip.get(trip.id);
      const first = list?.[0];
      if (!first?.tractorId || trip.status === 'CANCELLED') continue;
      const containersOfTrip = data.containersByTrip.get(trip.id) ?? [];
      const title =
        containersOfTrip.map((c) => c.containerNo ?? 'Chưa có số cont').join(', ') || trip.tripCode;
      const driverName = first.driverId ? driverById.get(first.driverId)?.fullName : null;
      const trailerPlate = first.trailerId ? trailerById.get(first.trailerId) : null;
      push(first.tractorId, {
        id: trip.id,
        kind: 'TRIP',
        title,
        subtitle: [driverName, trailerPlate].filter(Boolean).join(' · '),
        start: trip.plannedStart.toISOString(),
        end: trip.plannedEnd.toISOString(),
        tone: trip.status === 'PLANNED' ? 'info' : trip.status === 'COMPLETED' ? 'ok' : 'primary',
        tripId: trip.id,
      });
      if (first.driverId) {
        const set = driverIdsByTractor.get(first.tractorId) ?? new Set<string>();
        set.add(first.driverId);
        driverIdsByTractor.set(first.tractorId, set);
      }
    }
    for (const m of maintenance) {
      if (!m.tractorId || !m.plannedStart || !m.plannedEnd) continue;
      push(m.tractorId, {
        id: m.id,
        kind: 'MAINTENANCE',
        title:
          m.type === 'BREAKDOWN'
            ? 'Sửa chữa'
            : m.type === 'TIRE'
              ? 'Thay lốp'
              : 'Bảo dưỡng định kỳ',
        subtitle: 'Xe không được điều trong khung này',
        start: m.plannedStart.toISOString(),
        end: m.plannedEnd.toISOString(),
        tone: 'warn',
        tripId: null,
      });
    }

    const vnDate = (d: string) => d.split('-').reverse().slice(0, 2).join('/');
    const documentBadges = (
      kind: 'TRACTOR' | 'DRIVER',
      row: Parameters<typeof documentsOf>[1],
    ): LaneBadge[] => {
      const badges: LaneBadge[] = [];
      for (const { name, expiry } of documentsOf(kind, row)) {
        if (!expiry) continue;
        const days = diffCalendarDays(expiry, today);
        if (days < 0) badges.push({ label: `${name} hết hạn ${vnDate(expiry)}`, tone: 'crit' });
        else if (days < DOCUMENT_WARNING_DAYS)
          badges.push({ label: `${name} còn ${days} ngày`, tone: 'warn' });
      }
      return badges;
    };

    return tractorRows
      .filter((t) => t.status !== 'INACTIVE' || blocksByTractor.has(t.id))
      .map((t): ResourceLane => {
        const badges = documentBadges('TRACTOR', t);
        if (t.nextMaintenanceOdometer !== null) {
          const left = t.nextMaintenanceOdometer - t.currentOdometer;
          if (left <= 0) badges.push({ label: 'Đã đến kỳ bảo dưỡng', tone: 'crit' });
          else if (left <= MAINTENANCE_SOON_KM) {
            badges.push({ label: `Sắp đến kỳ bảo dưỡng (còn ${left} km)`, tone: 'warn' });
          }
        }
        for (const driverId of driverIdsByTractor.get(t.id) ?? []) {
          badges.push(...documentBadges('DRIVER', driverById.get(driverId)));
        }
        return {
          tractorId: t.id,
          plateNumber: t.plateNumber,
          status: t.status,
          badges,
          blocks: (blocksByTractor.get(t.id) ?? []).sort((a, b) => a.start.localeCompare(b.start)),
        };
      })
      .sort((a, b) => a.plateNumber.localeCompare(b.plateNumber, 'vi'));
  }

  async function getDispatchBoard(
    ctx: RequestContext,
    input: GetDispatchBoardInput,
  ): Promise<DispatchBoard> {
    authorize(ctx, 'dispatch.view');
    const { dayStart, dayEnd } = dayWindow(ctx, input.date);
    const tdb = deps.tenantDb(ctx);
    const data = await collect(ctx, tdb, { kind: 'day', dayStart, dayEnd });

    // Bộ lọc trừ chiều hàng → số đếm; rồi áp chiều hàng → cột.
    const needle = input.q ? fold(input.q) : null;
    const base = data.cards.filter(
      (c) =>
        (!input.customerId || c.customerId === input.customerId) &&
        (!input.zone || c.zones.includes(input.zone)) &&
        (!needle || fold(`${c.containerNo ?? ''} ${c.orderNo} ${c.customerName}`).includes(needle)),
    );
    const directionCounts = {
      ALL: base.length,
      EXPORT: base.filter((c) => c.orderType === 'EXPORT').length,
      IMPORT: base.filter((c) => c.orderType === 'IMPORT').length,
    };
    const filtered = input.direction ? base.filter((c) => c.orderType === input.direction) : base;

    const columns: DispatchBoard['columns'] = {};
    const wanted = input.column ? [input.column] : BOARD_COLUMN_IDS;
    const after = input.cursor ? decodeCursor(input.cursor) : null;
    for (const id of wanted) {
      const sorted = filtered.filter((c) => c.column === id).sort(compareCards);
      const rest = after
        ? sorted.filter((c) => {
            const [ms, cid] = sortKey(c);
            const [afterMs, afterId] = [after[0] ?? Number.POSITIVE_INFINITY, after[1]];
            return ms > afterMs || (ms === afterMs && cid > afterId);
          })
        : sorted;
      const page = rest.slice(0, BOARD_PAGE_SIZE);
      const column: BoardColumn = {
        total: sorted.length,
        cards: page,
        nextCursor: rest.length > page.length ? encodeCursor(page[page.length - 1]!) : null,
      };
      columns[id] = column;
    }

    return {
      date: input.date,
      dayStart: dayStart.toISOString(),
      dayEnd: dayEnd.toISOString(),
      directionCounts,
      columns,
      lanes: input.column ? null : await buildLanes(ctx, tdb, data, dayStart, dayEnd),
    };
  }

  async function getBoardCards(
    ctx: RequestContext,
    input: LoadBoardCardsInput,
  ): Promise<BoardCardsResult> {
    authorize(ctx, 'dispatch.view');
    const { dayStart, dayEnd } = dayWindow(ctx, input.date);
    if (input.orderContainerIds.length > 100) throw new AppError('VALIDATION_ERROR');
    const tdb = deps.tenantDb(ctx);
    const data = await collect(ctx, tdb, {
      kind: 'ids',
      dayStart,
      dayEnd,
      ids: input.orderContainerIds,
    });
    const present = new Set(data.cards.map((c) => c.orderContainerId));
    return {
      cards: data.cards,
      removedIds: input.orderContainerIds.filter((id) => !present.has(id)),
    };
  }

  return { getDispatchBoard, getBoardCards };
}

function missingOf(container: ContainerRow): BoardCard['missing'] {
  const missing: BoardCard['missing'] = [];
  if (!container.containerNo) missing.push('CONTAINER_NO');
  if (container.cargoWeightTons === null && container.vgmTons === null) missing.push('WEIGHT');
  return missing;
}
