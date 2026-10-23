/* eslint-disable @typescript-eslint/no-unused-vars -- khung chưa cài đặt của task 08, gỡ khi cài đặt */
// Rule 4 (spec 03 mục 2): chuyến COMBINED dùng hai vỏ khác nhau phải có thứ tự Stop hợp lệ về vật lý, rơ moóc không chở quá
// một cont 40/45 feet cùng lúc (trả rỗng cont Nhập trước khi lấy rỗng cont Xuất). CHƯA CÀI ĐẶT (task 08, bước 3).
import type { OrderContainerRow, OrderStopRow } from '../../orders/repo';
import { noIssues, type RuleResult } from './types';

export function checkCombinedSequence(_input: {
  containers: Pick<
    OrderContainerRow,
    'id' | 'lineNo' | 'containerNo' | 'containerType' | 'linkedContainerId'
  >[];
  /** Mọi Stop chưa SKIPPED của các container, đã sắp theo container rồi sequenceNo. */
  stops: Pick<
    OrderStopRow,
    'orderContainerId' | 'sequenceNo' | 'stopType' | 'windowStart' | 'deadlineTime'
  >[];
}): RuleResult {
  return noIssues();
}
