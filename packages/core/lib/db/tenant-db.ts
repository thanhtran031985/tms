// Tenant guard (ADR-003, spec 01 Rule 1): mọi truy cập bảng có cột tenant_id trong /modules đi qua getTenantDb(ctx).
// - SELECT / UPDATE / DELETE luôn AND với eq(table.tenantId, ctx.tenantId), kể cả khi người gọi truyền điều kiện OR.
// - INSERT luôn ghi đè tenantId = ctx.tenantId (bỏ giá trị từ input) và sinh id UUIDv7 nếu bảng có cột id.
// - UPDATE không đổi được tenantId.
// ctx.tenantId chỉ lấy từ phiên đã xác thực, không bao giờ từ input của client.
import { and, eq, type SQL } from 'drizzle-orm';
import type { AnyMySqlColumn, AnyMySqlTable } from 'drizzle-orm/mysql-core';
import { uuidv7 } from '../id';
import { getDb, type Db } from './client';

export type TenantCtx = { tenantId: string };

// Bảng thuộc về tenant: bắt buộc có cột tenantId.
export type TenantTable = AnyMySqlTable & { tenantId: AnyMySqlColumn };

// Kiểu thực thi dùng chung cho Db và transaction của Drizzle.
type Executor = Pick<Db, 'select' | 'insert' | 'update' | 'delete' | 'execute'>;

// id tùy chọn: bỏ trống thì getTenantDb sinh UUIDv7.
type InsertValues<T extends TenantTable> = Omit<T['$inferInsert'], 'tenantId' | 'id'> & {
  id?: string;
};
type UpdateValues<T extends TenantTable> = Partial<Omit<T['$inferInsert'], 'tenantId' | 'id'>>;

export type TenantDb = {
  readonly ctx: TenantCtx;
  select<T extends TenantTable>(table: T, where?: SQL): Promise<T['$inferSelect'][]>;
  insert<T extends TenantTable>(
    table: T,
    values: InsertValues<T> | InsertValues<T>[],
  ): Promise<T['$inferSelect'][]>;
  /** Trả số dòng bị ảnh hưởng. */
  update<T extends TenantTable>(table: T, set: UpdateValues<T>, where?: SQL): Promise<number>;
  /** Trả số dòng bị xóa. */
  delete<T extends TenantTable>(table: T, where?: SQL): Promise<number>;
  transaction<R>(fn: (tx: TenantDb) => Promise<R>): Promise<R>;
  /**
   * Cửa thoát cho hạ tầng trong lib/ (numbering, audit). Cấm dùng trong modules/** (luật ESLint).
   * Câu lệnh chạy qua đây KHÔNG được tự động thêm điều kiện tenant.
   */
  readonly _unsafeExecutor: Executor;
};

function affectedRows(result: unknown): number {
  // mysql2 trả [ResultSetHeader, fields]
  const header = (Array.isArray(result) ? result[0] : result) as { affectedRows?: number };
  return header?.affectedRows ?? 0;
}

function build(ctx: TenantCtx, exec: Executor, root: Db): TenantDb {
  const guard = (table: TenantTable, where?: SQL) => and(eq(table.tenantId, ctx.tenantId), where);

  return {
    ctx,
    _unsafeExecutor: exec,

    select(table, where) {
      return exec.select().from(table).where(guard(table, where)) as never;
    },

    async insert(table, values) {
      const hasId = 'id' in table;
      const rows = (Array.isArray(values) ? values : [values]).map((value) => {
        const row: Record<string, unknown> = { ...(value as Record<string, unknown>) };
        row.tenantId = ctx.tenantId; // ghi đè mọi tenantId từ input
        if (hasId && !row.id) row.id = uuidv7();
        return row;
      });
      await exec.insert(table).values(rows as never);
      return rows as never;
    },

    async update(table, set, where) {
      const values: Record<string, unknown> = { ...(set as Record<string, unknown>) };
      delete values.tenantId;
      delete values.id;
      if (Object.keys(values).length === 0) return 0;
      const result = await exec
        .update(table)
        .set(values as never)
        .where(guard(table, where));
      return affectedRows(result);
    },

    async delete(table, where) {
      const result = await exec.delete(table).where(guard(table, where));
      return affectedRows(result);
    },

    transaction(fn) {
      return root.transaction((tx) => fn(build(ctx, tx as unknown as Executor, root)));
    },
  };
}

export function getTenantDb(ctx: TenantCtx, options: { db?: Db } = {}): TenantDb {
  if (!ctx.tenantId) throw new Error('getTenantDb cần ctx.tenantId từ phiên đã xác thực');
  const db = options.db ?? getDb().db;
  return build({ tenantId: ctx.tenantId }, db, db);
}
