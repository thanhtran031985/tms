import { z } from 'zod';

// audit_logs.before / after là cột JSON: luôn là đối tượng hoặc null (ADR-002: parse và validate ở repo).
export const auditPayloadSchema = z.record(z.string(), z.unknown()).nullable();
export type AuditPayload = z.infer<typeof auditPayloadSchema>;
