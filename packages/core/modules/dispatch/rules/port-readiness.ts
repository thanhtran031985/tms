// Rule 7 (spec 03 mục 2): cho lưu kế hoạch dù cont chưa sẵn sàng, chặn lúc chuyển DISPATCHED nếu Stop đầu ở cảng/depot mà
// cont đang bị giữ (HOLD_CUSTOMS, HOLD_LINE) hoặc chưa có lệnh (Nhập cần READY_EDO, Xuất cần READY_EMPTY_RELEASE).
import type { LocationType } from '@shared/enums';
import type { OrderContainerRow, OrderRow } from '../../orders/repo';
import { noIssues, type RuleResult } from './types';

const REQUIRED_STATUS = { IMPORT: 'READY_EDO', EXPORT: 'READY_EMPTY_RELEASE' } as const;

const READINESS_TEXT: Record<string, string> = {
  PENDING: 'chưa có lệnh',
  READY_EDO: 'đã có lệnh giao hàng (EDO)',
  READY_EMPTY_RELEASE: 'đã có lệnh cấp rỗng',
  HOLD_CUSTOMS: 'đang bị Hải quan giữ',
  HOLD_LINE: 'đang bị hãng tàu giữ',
};

export function checkPortReadiness(input: {
  container: Pick<OrderContainerRow, 'containerNo' | 'lineNo' | 'portReadinessStatus'>;
  order: Pick<OrderRow, 'orderType'>;
  /** Loại địa điểm của Stop đầu tiên; null nếu Stop không gắn địa điểm. */
  firstStopLocationType: LocationType | null;
}): RuleResult {
  const result = noIssues();
  const { container, order, firstStopLocationType } = input;
  if (order.orderType === 'DOMESTIC') return result;
  if (firstStopLocationType !== 'PORT' && firstStopLocationType !== 'DEPOT') return result;

  const required = REQUIRED_STATUS[order.orderType];
  const status = container.portReadinessStatus;
  if (status !== required) {
    const label = container.containerNo ?? `dòng ${container.lineNo}`;
    result.errors.push({
      code: 'PORT_NOT_READY',
      resource: 'CONTAINER',
      reason: status,
      message: `Container ${label} ${READINESS_TEXT[status] ?? status}; cần ${READINESS_TEXT[required]} mới điều được.`,
      details: { resource: 'CONTAINER', reason: status, required },
    });
  }
  return result;
}
