// Rule 4 (spec 03 mục 2): chuyến COMBINED dùng hai vỏ khác nhau phải có thứ tự Stop hợp lệ về vật lý, rơ moóc không chở quá
// một cont 40/45 feet cùng lúc (trả rỗng cont Nhập trước khi lấy rỗng cont Xuất). Hàm thuần.
// Mỗi cont "nằm trên rơ moóc" từ Stop đầu đến Stop cuối của nó (Nhập: PICK_FULL -> RETURN_EMPTY, Xuất: PICK_EMPTY -> PORT_IN);
// hai khoảng chồng nhau chỉ hợp lệ khi cả hai là cont 20 feet. Cặp Street Turn coi như một vỏ vật lý (chỉ áp Rule 3).
import type { OrderContainerRow, OrderStopRow } from '../../orders/repo';
import { noIssues, type RuleResult } from './types';

type Stop = Pick<
  OrderStopRow,
  'orderContainerId' | 'sequenceNo' | 'stopType' | 'windowStart' | 'deadlineTime'
>;
const labelOf = (c: Pick<OrderContainerRow, 'lineNo' | 'containerNo'>) =>
  c.containerNo ?? `dòng ${c.lineNo}`;

export function checkCombinedSequence(input: {
  containers: Pick<
    OrderContainerRow,
    'id' | 'lineNo' | 'containerNo' | 'containerType' | 'linkedContainerId'
  >[];
  /** Mọi Stop chưa SKIPPED của các container, đã sắp theo container rồi sequenceNo. */
  stops: Stop[];
}): RuleResult {
  const result = noIssues();
  const { containers } = input;
  if (containers.length !== 2) return result;
  const [a, b] = containers as [(typeof containers)[number], (typeof containers)[number]];

  if (a.linkedContainerId === b.id || b.linkedContainerId === a.id) return result;
  if (a.containerType.startsWith('20') && b.containerType.startsWith('20')) return result;

  const intervalOf = (containerId: string) => {
    const stops = input.stops
      .filter((s) => s.orderContainerId === containerId)
      .sort((x, y) => x.sequenceNo - y.sequenceNo);
    const first = stops[0];
    const last = stops[stops.length - 1];
    const timeOf = (s: Stop | undefined) => (s ? (s.windowStart ?? s.deadlineTime) : null);
    const start = timeOf(first);
    const end = timeOf(last);
    return start && end && first !== last ? { start, end } : null;
  };
  const intervalA = intervalOf(a.id);
  const intervalB = intervalOf(b.id);
  if (!intervalA || !intervalB) {
    result.warnings.push({
      code: 'SEQUENCE_NOT_VERIFIED',
      severity: 'warn',
      resource: 'CONTAINER',
      message: `Chưa đủ giờ hẹn của Stop đầu và cuối của ${labelOf(a)} và ${labelOf(b)} nên chưa kiểm tra được thứ tự lấy và trả cont.`,
    });
    return result;
  }
  if (intervalA.start < intervalB.end && intervalB.start < intervalA.end) {
    result.errors.push({
      code: 'INVALID_STOP_SEQUENCE',
      resource: 'TRIP',
      reason: 'INVALID_STOP_SEQUENCE',
      message: `Rơ moóc phải chở cả ${labelOf(a)} và ${labelOf(b)} cùng lúc nhưng không chở được 2 cont 40 hoặc 45 feet. Đổi giờ để trả rỗng cont Nhập xong rồi mới lấy rỗng cont Xuất.`,
      details: { resource: 'TRIP', reason: 'INVALID_STOP_SEQUENCE' },
    });
  }
  return result;
}
