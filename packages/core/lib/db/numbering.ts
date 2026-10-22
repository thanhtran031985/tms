// Đánh số chứng từ (spec 02 mục 1): seq_key dạng 'TRIP:2026-10', 'INVOICE:2026', đếm riêng theo tenant.
// Một câu INSERT … ON DUPLICATE KEY UPDATE khóa dòng number_sequences tới khi transaction của người gọi kết thúc,
// nên hai transaction song song không bao giờ nhận cùng một số, và rollback thì số được hoàn lại.
// Cách này thay cho INSERT IGNORE + SELECT … FOR UPDATE (hai bước, dễ deadlock gap-lock khi nhiều giao dịch tạo dòng đầu tiên).
import { sql } from 'drizzle-orm';
import type { TenantDb } from './tenant-db';

const MAX_KEY_LENGTH = 50; // number_sequences.seq_key VARCHAR(50)

// Phải gọi bên trong tdb.transaction(...) cùng transaction với việc dùng số, để số và chứng từ cùng commit hoặc rollback.
export async function nextNumber(tx: TenantDb, seqKey: string): Promise<number> {
  if (!seqKey || seqKey.length > MAX_KEY_LENGTH) {
    throw new RangeError(`seq_key phải có từ 1 đến ${MAX_KEY_LENGTH} ký tự`);
  }
  const exec = tx._unsafeExecutor;
  const tenantId = tx.ctx.tenantId;

  await exec.execute(sql`
    INSERT INTO number_sequences (tenant_id, seq_key, last_value)
    VALUES (${tenantId}, ${seqKey}, LAST_INSERT_ID(1))
    ON DUPLICATE KEY UPDATE last_value = LAST_INSERT_ID(last_value + 1)
  `);
  const [rows] = (await exec.execute(sql`SELECT LAST_INSERT_ID() AS n`)) as unknown as [
    { n: number | string }[],
  ];
  const value = Number(rows[0]?.n);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error('nextNumber: không đọc được số vừa sinh');
  }
  return value;
}
