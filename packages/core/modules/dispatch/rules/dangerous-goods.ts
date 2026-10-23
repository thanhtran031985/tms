// Rule 6 (spec 03 mục 2), phần ghép chuyến: hàng nguy hiểm không được ghép TWIN_20 với container của khách khác.
// Phần chứng chỉ của tài xế nằm ở physical.ts.
import type { TripMode } from '@shared/enums';
import type { OrderContainerRow, OrderRow } from '../../orders/repo';
import { noIssues, type RuleResult } from './types';

export function checkDangerousGoodsMix(input: {
  tripMode: TripMode;
  containers: Pick<
    OrderContainerRow,
    'id' | 'orderId' | 'lineNo' | 'containerNo' | 'isDangerousGoods'
  >[];
  orders: Map<string, Pick<OrderRow, 'customerId'>>;
}): RuleResult {
  const result = noIssues();
  if (input.tripMode !== 'TWIN_20') return result;
  const dangerous = input.containers.filter((c) => c.isDangerousGoods);
  if (dangerous.length === 0) return result;

  const customers = new Set(input.containers.map((c) => input.orders.get(c.orderId)?.customerId));
  if (customers.size > 1) {
    const label = dangerous.map((c) => c.containerNo ?? `dòng ${c.lineNo}`).join(', ');
    result.errors.push({
      code: 'DG_TWIN20_MIXED_CUSTOMER',
      resource: 'CONTAINER',
      reason: 'DG_TWIN20_MIXED_CUSTOMER',
      message: `Container ${label} là hàng nguy hiểm nên không được ghép TWIN_20 với container của khách hàng khác.`,
      details: { resource: 'CONTAINER', reason: 'DG_TWIN20_MIXED_CUSTOMER' },
    });
  }
  return result;
}
