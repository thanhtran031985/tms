/* eslint-disable @typescript-eslint/no-unused-vars -- khung chưa cài đặt của task 08, gỡ khi cài đặt */
// Rule 6 (spec 03 mục 2), phần ghép chuyến: hàng nguy hiểm không được ghép TWIN_20 với container của khách khác.
// Phần chứng chỉ của tài xế nằm ở physical.ts. CHƯA CÀI ĐẶT (task 08, bước 2).
import type { TripMode } from '@shared/enums';
import type { OrderContainerRow, OrderRow } from '../../orders/repo';
import { noIssues, type RuleResult } from './types';

export function checkDangerousGoodsMix(_input: {
  tripMode: TripMode;
  containers: Pick<
    OrderContainerRow,
    'id' | 'orderId' | 'lineNo' | 'containerNo' | 'isDangerousGoods'
  >[];
  orders: Map<string, Pick<OrderRow, 'customerId'>>;
}): RuleResult {
  return noIssues();
}
