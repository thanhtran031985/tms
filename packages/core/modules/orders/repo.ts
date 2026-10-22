// Repo đơn hàng (ADR-003): chỉ đi qua TenantDb nên mọi truy vấn tự AND tenantId.
// Order, container, Stop, phí và mẫu Stop; nghiệp vụ nằm ở service. Xóa cứng chỉ dành cho việc bớt cont/Stop của Order nháp.
import { eq, type SQL } from 'drizzle-orm';
import {
  orderContainers,
  orderFees,
  orders,
  orderStops,
  routeStopTemplates,
} from '../../lib/db/schema';
import type { SelectOptions, TenantDb } from '../../lib/db/tenant-db';

export type OrderRow = typeof orders.$inferSelect;
export type OrderContainerRow = typeof orderContainers.$inferSelect;
export type OrderStopRow = typeof orderStops.$inferSelect;
export type OrderFeeRow = typeof orderFees.$inferSelect;
export type RouteStopTemplateRow = typeof routeStopTemplates.$inferSelect;

type OrderTable =
  | typeof orders
  | typeof orderContainers
  | typeof orderStops
  | typeof orderFees
  | typeof routeStopTemplates;

function createTableRepo<T extends OrderTable>(tdb: TenantDb, table: T) {
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

    /** Thêm nhiều dòng một câu lệnh (vd. Stop của cả Order). */
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

    /** Xóa cứng, trả số dòng bị xóa (0 nếu không thuộc tenant). */
    async remove(id: string) {
      return tdb.delete(table, eq(table.id, id));
    },

    async removeWhere(where: SQL) {
      return tdb.delete(table, where);
    },
  };
}

export function createOrderRepo(tdb: TenantDb) {
  return {
    orders: createTableRepo(tdb, orders),
    containers: createTableRepo(tdb, orderContainers),
    stops: createTableRepo(tdb, orderStops),
    fees: createTableRepo(tdb, orderFees),
    stopTemplates: createTableRepo(tdb, routeStopTemplates),
  };
}

export type OrderRepo = ReturnType<typeof createOrderRepo>;
