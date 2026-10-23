// Tồn tại, cùng tenant, chưa ngừng dùng, chưa xóa mềm, và trạng thái khi chuyến sắp bắt đầu (spec 03 mục 1 bước 3).
import { NOT_AVAILABLE_CODE, RESOURCE_NOUN, type ResourceKind, type RuleError } from './types';

/** Chuyến bắt đầu trong vòng ngần này phút thì tài nguyên phải đang AVAILABLE (spec 03 mục 1 bước 3). */
export const SOON_WINDOW_MINUTES = 30;

type ResourceRow = { status: string; deletedAt: Date | null };

const BUSY_STATUS_TEXT: Record<string, string> = {
  ON_DUTY: 'đang chạy chuyến',
  IN_USE: 'đang chạy chuyến',
  DROPPED: 'đang để lại ở điểm khác',
  MAINTENANCE: 'đang bảo dưỡng',
};

/**
 * `row` là bản ghi đọc qua TenantDb nên khác tenant cũng là undefined, không phân biệt với không tồn tại (không lộ dữ liệu tenant khác).
 * Tài xế OFF_DUTY (nghỉ phép) luôn bị chặn; trạng thái bận của các tài nguyên khác chỉ xét khi chuyến sắp bắt đầu.
 */
export function checkResourceState(input: {
  kind: ResourceKind;
  row: ResourceRow | undefined;
  label: string;
  start: Date;
  now: Date;
}): RuleError | null {
  const { kind, row, label, start, now } = input;
  const noun = RESOURCE_NOUN[kind];
  const fail = (
    reason: string,
    message: string,
    details: Record<string, string | number> = {},
  ): RuleError => ({
    code: NOT_AVAILABLE_CODE[kind],
    resource: kind,
    reason,
    message,
    details: { resource: kind, reason, ...details },
  });

  if (!row || row.deletedAt) {
    return fail('NOT_FOUND', `${noun} không tồn tại hoặc không thuộc công ty của bạn.`);
  }
  if (row.status === 'INACTIVE') {
    return fail('INACTIVE', `${noun} ${label} đã ngừng sử dụng.`);
  }
  if (kind === 'DRIVER' && row.status === 'OFF_DUTY') {
    return fail('OFF_DUTY', `${noun} ${label} đang nghỉ phép, không điều được.`);
  }
  const startsSoon = start.getTime() <= now.getTime() + SOON_WINDOW_MINUTES * 60_000;
  if (startsSoon && row.status !== 'AVAILABLE') {
    const text = BUSY_STATUS_TEXT[row.status] ?? 'không sẵn sàng';
    return fail(
      'BUSY',
      `${noun} ${label} ${text}, mà chuyến bắt đầu trong vòng ${SOON_WINDOW_MINUTES} phút.`,
      { status: row.status },
    );
  }
  return null;
}
