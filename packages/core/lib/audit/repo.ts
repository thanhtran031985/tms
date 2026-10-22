import { and, eq } from 'drizzle-orm';
import { auditPayloadSchema, type AuditPayload } from '@shared/schemas/audit';
import { auditLogs } from '../db/schema';
import type { TenantDb } from '../db/tenant-db';

export type AuditEntry = {
  actorUserId: string | null;
  entity: string;
  entityId: string;
  action: string;
  before: AuditPayload;
  after: AuditPayload;
};

// Ghi một dòng audit vào transaction của tenantDb. Dùng writeAudit (lib/audit/index.ts) trong nghiệp vụ.
export async function insertAudit(tdb: TenantDb, entry: AuditEntry): Promise<void> {
  const before = auditPayloadSchema.parse(entry.before);
  const after = auditPayloadSchema.parse(entry.after);
  await tdb.insert(auditLogs, {
    actorUserId: entry.actorUserId,
    entity: entry.entity,
    entityId: entry.entityId,
    action: entry.action,
    before,
    after,
    createdAt: new Date(),
  });
}

export async function listAuditForEntity(tdb: TenantDb, entity: string, entityId: string) {
  const rows = await tdb.select(
    auditLogs,
    and(eq(auditLogs.entity, entity), eq(auditLogs.entityId, entityId)),
  );
  return rows
    .map((row) => ({
      ...row,
      before: auditPayloadSchema.parse(row.before ?? null),
      after: auditPayloadSchema.parse(row.after ?? null),
    }))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}
