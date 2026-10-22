import pino, { type Logger } from 'pino';

// Log JSON có cấu trúc (spec 08 mục 4). Không log dữ liệu cá nhân: các trường nhạy cảm bị che.
export function createLogger(level = process.env.LOG_LEVEL ?? 'info'): Logger {
  return pino({
    level,
    base: { service: 'worker' },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: { level: (label) => ({ level: label }) },
    redact: {
      paths: ['*.password', '*.passwordHash', '*.token', '*.authorization', '*.phone', '*.email'],
      censor: '[che]',
    },
  });
}

export type LogContext = { tenantId?: string; userId?: string; requestId?: string };

// Logger con mang ngữ cảnh của job: các job nghiệp vụ sau này luôn gắn tenantId/userId/requestId.
export function withContext(logger: Logger, context: LogContext): Logger {
  return logger.child(context);
}
