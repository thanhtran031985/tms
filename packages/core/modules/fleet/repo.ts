// Repo đội xe, tài xế, bảo dưỡng (spec 02, ADR-003): mọi truy vấn qua TenantDb.
import { and, eq, isNull, type SQL } from 'drizzle-orm';
import type { AnyMySqlColumn } from 'drizzle-orm/mysql-core';
import {
  drivers,
  maintenanceOrders,
  maintenancePlans,
  tractors,
  trailers,
} from '../../lib/db/schema';
import type { TenantDb } from '../../lib/db/tenant-db';

export type TractorRow = typeof tractors.$inferSelect;
export type TrailerRow = typeof trailers.$inferSelect;
export type DriverRow = typeof drivers.$inferSelect;
export type MaintenancePlanRow = typeof maintenancePlans.$inferSelect;
export type MaintenanceOrderRow = typeof maintenanceOrders.$inferSelect;

type SoftDeletableTable = typeof tractors | typeof trailers | typeof drivers;

function createSoftDeleteRepo<T extends SoftDeletableTable>(
  tdb: TenantDb,
  table: T,
  plateOrKeyColumn?: AnyMySqlColumn,
) {
  type Row = T['$inferSelect'];
  type Insert = Parameters<TenantDb['insert']>[1];
  type Set = Parameters<TenantDb['update']>[1];
  const idIs = (id: string): SQL => eq(table.id, id);

  return {
    async list(options: { includeDeleted?: boolean } = {}): Promise<Row[]> {
      return tdb.select(table, options.includeDeleted ? undefined : isNull(table.deletedAt));
    },

    async get(id: string): Promise<Row | undefined> {
      const [row] = await tdb.select(table, idIs(id));
      return row;
    },

    async findByPlate(plateNumber: string): Promise<Row | undefined> {
      if (!plateOrKeyColumn) return undefined;
      const [row] = await tdb.select(table, eq(plateOrKeyColumn, plateNumber));
      return row;
    },

    async insert(values: Omit<T['$inferInsert'], 'tenantId' | 'id'> & { id?: string }) {
      const [row] = await tdb.insert(table, values as Insert);
      return row as Row;
    },

    async update(id: string, set: Partial<Omit<T['$inferInsert'], 'tenantId' | 'id'>>) {
      return tdb.update(table, set as Set, and(idIs(id), isNull(table.deletedAt)));
    },

    async setDeleted(id: string, at: Date | null) {
      return tdb.update(table, { deletedAt: at } as Set, idIs(id));
    },
  };
}

function createGenericRepo<T extends typeof maintenancePlans | typeof maintenanceOrders>(
  tdb: TenantDb,
  table: T,
) {
  type Row = T['$inferSelect'];
  type Insert = Parameters<TenantDb['insert']>[1];
  type Set = Parameters<TenantDb['update']>[1];
  const idIs = (id: string): SQL => eq(table.id, id);

  return {
    async list(): Promise<Row[]> {
      return tdb.select(table);
    },

    async get(id: string): Promise<Row | undefined> {
      const [row] = await tdb.select(table, idIs(id));
      return row;
    },

    async insert(values: Omit<T['$inferInsert'], 'tenantId' | 'id'> & { id?: string }) {
      const [row] = await tdb.insert(table, values as Insert);
      return row as Row;
    },

    async update(id: string, set: Partial<Omit<T['$inferInsert'], 'tenantId' | 'id'>>) {
      return tdb.update(table, set as Set, idIs(id));
    },
  };
}

export function createFleetRepo(tdb: TenantDb) {
  return {
    tractors: createSoftDeleteRepo(tdb, tractors, tractors.plateNumber),
    trailers: createSoftDeleteRepo(tdb, trailers, trailers.plateNumber),
    drivers: createSoftDeleteRepo(tdb, drivers, drivers.phone),
    maintenancePlans: createGenericRepo(tdb, maintenancePlans),
    maintenanceOrders: createGenericRepo(tdb, maintenanceOrders),
  };
}

export type FleetRepo = ReturnType<typeof createFleetRepo>;
