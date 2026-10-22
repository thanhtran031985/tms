// Repo bảng giá (ADR-003): chỉ đi qua TenantDb nên mọi truy vấn tự AND tenantId.
// Không xóa cứng: bản ghi ngừng dùng được đặt isActive = false hoặc đóng bằng validTo (spec 06 mục 1).
import { eq } from 'drizzle-orm';
import { feeTariffs, freightTariffs } from '../../lib/db/schema';
import type { TenantDb } from '../../lib/db/tenant-db';

export type FreightTariffRow = typeof freightTariffs.$inferSelect;
export type FeeTariffRow = typeof feeTariffs.$inferSelect;

function createTariffTableRepo<T extends typeof freightTariffs | typeof feeTariffs>(
  tdb: TenantDb,
  table: T,
) {
  type Row = T['$inferSelect'];
  type Insert = Parameters<TenantDb['insert']>[1];
  type Set = Parameters<TenantDb['update']>[1];

  return {
    async list(): Promise<Row[]> {
      return tdb.select(table);
    },

    async get(id: string): Promise<Row | undefined> {
      const [row] = await tdb.select(table, eq(table.id, id));
      return row;
    },

    async insert(values: Omit<T['$inferInsert'], 'tenantId' | 'id'> & { id?: string }) {
      const [row] = await tdb.insert(table, values as Insert);
      return row as Row;
    },

    /** Trả số dòng bị ảnh hưởng (0 nếu không thuộc tenant). */
    async update(id: string, set: Partial<Omit<T['$inferInsert'], 'tenantId' | 'id'>>) {
      return tdb.update(table, set as Set, eq(table.id, id));
    },
  };
}

export function createTariffRepo(tdb: TenantDb) {
  return {
    freight: createTariffTableRepo(tdb, freightTariffs),
    fees: createTariffTableRepo(tdb, feeTariffs),
  };
}

export type TariffRepo = ReturnType<typeof createTariffRepo>;
