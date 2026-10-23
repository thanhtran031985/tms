// Kết quả chung của các quy tắc điều vận (spec 03 mục 1, 2). Mỗi quy tắc là một hàm riêng, trả về lỗi chặn và cảnh báo;
// assignResources ném lỗi đầu tiên, listResourceAvailability gom tất cả thành lý do cho bảng gán xe.
import type { ErrorCode } from '@shared/errors';
import type { DispatchWarning } from '@shared/schemas/dispatch';

export type ResourceKind = 'DRIVER' | 'TRACTOR' | 'TRAILER';

/** Lỗi chặn gán: `code` là mã lỗi cố định, `reason` là lý do máy đọc được, `message` là câu tiếng Việt nói rõ nguyên nhân. */
export type RuleError = {
  code: ErrorCode;
  resource: DispatchWarning['resource'];
  reason: string;
  message: string;
  details?: Record<string, string | number>;
};

export type RuleResult = { errors: RuleError[]; warnings: DispatchWarning[] };

export const noIssues = (): RuleResult => ({ errors: [], warnings: [] });

export function mergeResults(...results: RuleResult[]): RuleResult {
  return {
    errors: results.flatMap((r) => r.errors),
    warnings: results.flatMap((r) => r.warnings),
  };
}

export const NOT_AVAILABLE_CODE = {
  DRIVER: 'DRIVER_NOT_AVAILABLE',
  TRACTOR: 'TRACTOR_NOT_AVAILABLE',
  TRAILER: 'TRAILER_NOT_AVAILABLE',
} as const satisfies Record<ResourceKind, ErrorCode>;

export const RESOURCE_NOUN = {
  DRIVER: 'Tài xế',
  TRACTOR: 'Đầu kéo',
  TRAILER: 'Rơ moóc',
} as const satisfies Record<ResourceKind, string>;

/** Khung giờ kế hoạch của chuyến, dùng chung cho mọi quy tắc theo thời gian. */
export type TimeWindow = { start: Date; end: Date };
