// Tenant guard (ADR-003, spec 01 Rule 1): mọi truy cập bảng có cột tenant_id trong /modules đi qua getTenantDb(ctx).
// - SELECT / UPDATE / DELETE luôn AND với eq(table.tenantId, ctx.tenantId), kể cả khi người gọi truyền điều kiện OR.
// - INSERT luôn ghi đè tenantId = ctx.tenantId (bỏ giá trị từ input) và sinh id UUIDv7 nếu bảng có cột id.
// - UPDATE không đổi được tenantId.
// ctx.tenantId chỉ lấy từ phiên đã xác thực, không bao giờ từ input của client.
import { and, eq, sql, type SQL } from 'drizzle-orm';
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

// Tùy chọn cho SELECT: sắp xếp, giới hạn dòng, khóa dòng (SELECT … FOR UPDATE, chỉ có nghĩa trong transaction).
export type SelectOptions = { orderBy?: SQL[]; limit?: number; forUpdate?: boolean };

// Tùy chọn cho transaction. lockWaitTimeoutSec: đặt innodb_lock_wait_timeout cho phiên của transaction này rồi trả về mặc định
// (điều vận chờ khóa tối đa 5 giây thay vì 50 giây mặc định, spec 03 mục 1 bước 8).
export type TransactionOptions = { lockWaitTimeoutSec?: number };

export type TenantDb = {
  readonly ctx: TenantCtx;
  select<T extends TenantTable>(
    table: T,
    where?: SQL,
    options?: SelectOptions,
  ): Promise<T['$inferSelect'][]>;
  insert<T extends TenantTable>(
    table: T,
    values: InsertValues<T> | InsertValues<T>[],
  ): Promise<T['$inferSelect'][]>;
  /** Trả số dòng bị ảnh hưởng. */
  update<T extends TenantTable>(table: T, set: UpdateValues<T>, where?: SQL): Promise<number>;
  /** Trả số dòng bị xóa. */
  delete<T extends TenantTable>(table: T, where?: SQL): Promise<number>;
  transaction<R>(fn: (tx: TenantDb) => Promise<R>, options?: TransactionOptions): Promise<R>;
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

    select(table, where, options) {
      let query = exec.select().from(table).where(guard(table, where)).$dynamic();
      if (options?.orderBy?.length) query = query.orderBy(...options.orderBy);
      if (options?.limit !== undefined) query = query.limit(options.limit);
      if (options?.forUpdate) query = query.for('update');
      return query as never;
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

    transaction(fn, options) {
      return root.transaction(async (tx) => {
        const seconds = options?.lockWaitTimeoutSec;
        if (seconds === undefined) return fn(build(ctx, tx as unknown as Executor, root));
        if (!Number.isInteger(seconds) || seconds < 1) {
          throw new RangeError('lockWaitTimeoutSec phải là số nguyên dương');
        }
        await tx.execute(sql`SET SESSION innodb_lock_wait_timeout = ${sql.raw(String(seconds))}`);
        try {
          return await fn(build(ctx, tx as unknown as Executor, root));
        } finally {
          // Kết nối quay về pool: trả giá trị mặc định để không ảnh hưởng request sau. Bỏ qua nếu kết nối đã hỏng.
          await tx
            .execute(sql`SET SESSION innodb_lock_wait_timeout = DEFAULT`)
            .catch(() => undefined);
        }
      });
    },
  };
}

export function getTenantDb(ctx: TenantCtx, options: { db?: Db } = {}): TenantDb {
  if (!ctx.tenantId) throw new Error('getTenantDb cần ctx.tenantId từ phiên đã xác thực');
  const db = options.db ?? getDb().db;
  return build({ tenantId: ctx.tenantId }, db, db);
}
