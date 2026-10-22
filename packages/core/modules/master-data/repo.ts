// Repo danh mục (ADR-003): chỉ đi qua TenantDb nên mọi truy vấn tự AND tenantId.
// Xóa mềm: list mặc định ẩn bản ghi có deleted_at; findByCode vẫn thấy dòng đã xóa để đề xuất khôi phục.
import { and, eq, isNull, type SQL } from 'drizzle-orm';
import type { AnyMySqlColumn } from 'drizzle-orm/mysql-core';
import { customers, locations, routes, shippingLines, vendors } from '../../lib/db/schema';
import type { TenantDb } from '../../lib/db/tenant-db';

export type CatalogTable =
  typeof customers | typeof shippingLines | typeof vendors | typeof locations | typeof routes;

export type CustomerRow = typeof customers.$inferSelect;
export type ShippingLineRow = typeof shippingLines.$inferSelect;
export type VendorRow = typeof vendors.$inferSelect;
export type LocationRow = typeof locations.$inferSelect;
export type RouteRow = typeof routes.$inferSelect;

function createCatalogRepo<T extends CatalogTable>(
  tdb: TenantDb,
  table: T,
  codeColumn: AnyMySqlColumn,
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

    /** Tìm theo mã trong tenant, kể cả dòng đã xóa mềm. */
    async findByCode(code: string): Promise<Row | undefined> {
      const [row] = await tdb.select(table, eq(codeColumn, code));
      return row;
    },

    async insert(values: Omit<T['$inferInsert'], 'tenantId' | 'id'> & { id?: string }) {
      const [row] = await tdb.insert(table, values as Insert);
      return row as Row;
    },

    /** Trả số dòng bị ảnh hưởng (0 nếu không thuộc tenant hoặc đã xóa mềm). */
    async update(id: string, set: Partial<Omit<T['$inferInsert'], 'tenantId' | 'id'>>) {
      return tdb.update(table, set as Set, and(idIs(id), isNull(table.deletedAt)));
    },

    /** Đặt hoặc bỏ dấu xóa mềm. Trả số dòng bị ảnh hưởng. */
    async setDeleted(id: string, at: Date | null) {
      return tdb.update(table, { deletedAt: at } as Set, idIs(id));
    },
  };
}

export function createMasterDataRepo(tdb: TenantDb) {
  return {
    customers: createCatalogRepo(tdb, customers, customers.code),
    shippingLines: createCatalogRepo(tdb, shippingLines, shippingLines.code),
    vendors: createCatalogRepo(tdb, vendors, vendors.code),
    locations: createCatalogRepo(tdb, locations, locations.code),
    routes: createCatalogRepo(tdb, routes, routes.routeCode),
  };
}

export type MasterDataRepo = ReturnType<typeof createMasterDataRepo>;
