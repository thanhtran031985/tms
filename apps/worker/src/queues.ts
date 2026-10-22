import type { DefaultJobOptions } from 'bullmq';

export const QUEUE_NAMES = {
  heartbeat: 'system.heartbeat',
  documentExpiry: 'fleet.document-expiry',
} as const;

// Mặc định cho mọi job (ADR-007): thử lại có backoff mũ, giữ job lỗi để tra cứu và làm dead-letter sau này.
export const defaultJobOptions: DefaultJobOptions = {
  attempts: 5,
  backoff: { type: 'exponential', delay: 1_000 },
  removeOnComplete: { count: 100 },
  removeOnFail: false,
};
