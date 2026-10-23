// Ràng buộc theo hình dạng chuyến ghép, không cần tài nguyên: số container khớp chế độ, Rule 1 (cont 20 feet), Rule 6 (hàng nguy hiểm
// không ghép khác khách), Rule 4 (thứ tự Stop của COMBINED). Chạy khi lập chuyến và khi ghép thêm container, trước khi chọn xe.
import type { TripMode } from '@shared/enums';
import type { OrderContainerRow, OrderRow, OrderStopRow } from '../../orders/repo';
import { checkCombinedSequence } from './combined-sequence';
import { checkDangerousGoodsMix } from './dangerous-goods';
import { checkTwin20 } from './twin20';
import { mergeResults, noIssues, type RuleResult } from './types';

export function checkTripShape(input: {
  tripMode: TripMode;
  containers: OrderContainerRow[];
  orders: Map<string, OrderRow>;
  /** Stop chưa SKIPPED của các container, theo container rồi sequenceNo. */
  stops: OrderStopRow[];
}): RuleResult {
  const { tripMode, containers, orders, stops } = input;

  const directions = containers.map((c) => orders.get(c.orderId)?.orderType);
  const validShape =
    tripMode === 'SINGLE'
      ? containers.length === 1
      : containers.length === 2 &&
        new Set(containers.map((c) => c.id)).size === 2 &&
        (tripMode === 'TWIN_20' ||
          (directions.includes('IMPORT') && directions.includes('EXPORT')));
  if (!validShape) {
    const result = noIssues();
    result.errors.push({
      code: 'TRIP_MODE_INVALID',
      resource: 'TRIP',
      reason: 'TRIP_MODE_INVALID',
      message:
        tripMode === 'COMBINED'
          ? 'Chuyến COMBINED cần đúng 1 container Nhập và 1 container Xuất.'
          : 'Chuyến TWIN_20 cần đúng 2 container 20 feet khác nhau.',
      details: { resource: 'TRIP', reason: 'TRIP_MODE_INVALID' },
    });
    return result;
  }

  return mergeResults(
    checkTwin20({ tripMode, containers, trailer: undefined }),
    checkDangerousGoodsMix({ tripMode, containers, orders }),
    tripMode === 'COMBINED' ? checkCombinedSequence({ containers, stops }) : noIssues(),
  );
}
