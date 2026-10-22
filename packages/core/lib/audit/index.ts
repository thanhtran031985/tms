import type { AuditPayload } from '@shared/schemas/audit';
import type { RequestContext } from '../context';
import type { TenantDb } from '../db/tenant-db';
import { insertAudit } from './repo';

export type AuditInput = {
  entity: string;
  entityId: string;
  action: string;
  before: AuditPayload;
  after: AuditPayload;
};

// Ghi audit CÙNG transaction với thay đổi (Rule 8): truyền tx của tdb.transaction(...); lỗi thì cả hai rollback.
export async function writeAudit(
  tx: TenantDb,
  ctx: RequestContext,
  input: AuditInput,
): Promise<void> {
  if (tx.ctx.tenantId !== ctx.tenantId) {
    throw new Error('writeAudit: ctx và tenantDb thuộc hai tenant khác nhau');
  }
  await insertAudit(tx, { actorUserId: ctx.userId, ...input });
}
