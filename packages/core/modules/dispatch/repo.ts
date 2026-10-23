// Repo điều vận (ADR-003): chỉ đi qua TenantDb nên mọi truy vấn tự AND tenantId.
// Chuyến, chuyến-container và assignment; nghiệp vụ nằm ở service. trip_containers khóa chính ghép nên có repo riêng.
import { and, eq, type SQL } from 'drizzle-orm';
import { consolidatedTrips, dispatchAssignments, tripContainers } from '../../lib/db/schema';
import type { SelectOptions, TenantDb } from '../../lib/db/tenant-db';

export type TripRow = typeof consolidatedTrips.$inferSelect;
export type TripContainerRow = typeof tripContainers.$inferSelect;
export type AssignmentRow = typeof dispatchAssignments.$inferSelect;

type DispatchTable = typeof consolidatedTrips | typeof dispatchAssignments;

function createTableRepo<T extends DispatchTable>(tdb: TenantDb, table: T) {
  type Row = T['$inferSelect'];
  type Insert = Parameters<TenantDb['insert']>[1];
  type Set = Parameters<TenantDb['update']>[1];

  return {
    async list(where?: SQL, options?: SelectOptions): Promise<Row[]> {
      return tdb.select(table, where, options);
    },

    async get(id: string): Promise<Row | undefined> {
      const [row] = await tdb.select(table, eq(table.id, id));
      return row;
    },

    async insert(values: Omit<T['$inferInsert'], 'tenantId' | 'id'> & { id?: string }) {
      const [row] = await tdb.insert(table, values as Insert);
      return row as Row;
    },

    async insertMany(values: (Omit<T['$inferInsert'], 'tenantId' | 'id'> & { id?: string })[]) {
      if (values.length === 0) return [] as Row[];
      return (await tdb.insert(table, values as Insert)) as Row[];
    },

    /** Trả số dòng bị ảnh hưởng (0 nếu không thuộc tenant). */
    async update(id: string, set: Partial<Omit<T['$inferInsert'], 'tenantId' | 'id'>>) {
      return tdb.update(table, set as Set, eq(table.id, id));
    },

    /** Cập nhật có điều kiện (vd. khóa lạc quan `version`). Trả số dòng bị ảnh hưởng. */
    async updateWhere(where: SQL, set: Partial<Omit<T['$inferInsert'], 'tenantId' | 'id'>>) {
      return tdb.update(table, set as Set, where);
    },
  };
}

type TripContainerInsert = Omit<typeof tripContainers.$inferInsert, 'tenantId'>;

function createTripContainerRepo(tdb: TenantDb) {
  const key = (tripId: string, orderContainerId: string) =>
    and(eq(tripContainers.tripId, tripId), eq(tripContainers.orderContainerId, orderContainerId))!;

  return {
    async list(where?: SQL, options?: SelectOptions): Promise<TripContainerRow[]> {
      return tdb.select(tripContainers, where, options);
    },

    async get(tripId: string, orderContainerId: string): Promise<TripContainerRow | undefined> {
      const [row] = await tdb.select(tripContainers, key(tripId, orderContainerId));
      return row;
    },

    async insert(values: TripContainerInsert): Promise<TripContainerRow> {
      const [row] = await tdb.insert(tripContainers, values);
      return row as TripContainerRow;
    },

    async update(
      tripId: string,
      orderContainerId: string,
      set: Partial<Omit<TripContainerInsert, 'tripId' | 'orderContainerId'>>,
    ) {
      return tdb.update(tripContainers, set, key(tripId, orderContainerId));
    },

    /** Xóa cứng, trả số dòng bị xóa (0 nếu không thuộc tenant). */
    async remove(tripId: string, orderContainerId: string) {
      return tdb.delete(tripContainers, key(tripId, orderContainerId));
    },
  };
}

export function createDispatchRepo(tdb: TenantDb) {
  return {
    trips: createTableRepo(tdb, consolidatedTrips),
    tripContainers: createTripContainerRepo(tdb),
    assignments: createTableRepo(tdb, dispatchAssignments),
  };
}

export type DispatchRepo = ReturnType<typeof createDispatchRepo>;
