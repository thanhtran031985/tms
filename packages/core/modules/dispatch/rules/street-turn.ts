// Rule 3 (spec 03 mục 2): điều kiện đảo vỏ Street Turn giữa cont Nhập và cont Xuất: cùng hãng tàu, cùng loại cont, hãng cho phép
// Street Turn, Stop UNSTUFFING của cont Nhập kết thúc trước Stop STUFFING của cont Xuất. Hàm thuần.
import type { OrderContainerRow, OrderRow, OrderStopRow } from '../../orders/repo';
import { noIssues, type RuleError, type RuleResult } from './types';

export type StreetTurnSide = {
  container: Pick<OrderContainerRow, 'id' | 'lineNo' | 'containerNo' | 'containerType'>;
  order: Pick<OrderRow, 'shippingLineId'>;
  stops: Pick<OrderStopRow, 'stopType' | 'windowStart' | 'deadlineTime'>[];
};

const labelOf = (c: Pick<OrderContainerRow, 'lineNo' | 'containerNo'>) =>
  c.containerNo ?? `dòng ${c.lineNo}`;

const error = (code: RuleError['code'], message: string): RuleError => ({
  code,
  resource: 'CONTAINER',
  reason: code,
  message,
  details: { resource: 'CONTAINER', reason: code },
});

export function checkStreetTurnPair(input: {
  importSide: StreetTurnSide;
  exportSide: StreetTurnSide;
  /** Hãng tàu của Order Nhập; undefined nếu Order không ghi hãng tàu. */
  shippingLine: { allowsStreetTurn: boolean } | undefined;
}): RuleResult {
  const { importSide, exportSide, shippingLine } = input;
  const result = noIssues();
  const imp = labelOf(importSide.container);
  const exp = labelOf(exportSide.container);

  if (importSide.order.shippingLineId !== exportSide.order.shippingLineId) {
    result.errors.push(
      error(
        'STREET_TURN_LINE_MISMATCH',
        `Container ${imp} (Nhập) và ${exp} (Xuất) thuộc hai hãng tàu khác nhau nên không đảo vỏ được.`,
      ),
    );
  }
  if (importSide.container.containerType !== exportSide.container.containerType) {
    result.errors.push(
      error(
        'STREET_TURN_TYPE_MISMATCH',
        `Container ${imp} là ${importSide.container.containerType}, còn ${exp} là ${exportSide.container.containerType}; chỉ đảo vỏ giữa hai cont cùng loại.`,
      ),
    );
  }
  if (!shippingLine?.allowsStreetTurn) {
    result.errors.push(
      error(
        'STREET_TURN_NOT_ALLOWED',
        'Hãng tàu của Order này không cho Street Turn. Trả rỗng cont Nhập về cảng và lấy rỗng cho cont Xuất như bình thường.',
      ),
    );
  }

  // Thứ tự thời gian: rút hàng Nhập (UNSTUFFING) kết thúc trước khi đóng hàng Xuất (STUFFING) bắt đầu.
  const unstuffing = importSide.stops.find((s) => s.stopType === 'UNSTUFFING');
  const stuffing = exportSide.stops.find((s) => s.stopType === 'STUFFING');
  const unstuffingEnd = unstuffing ? (unstuffing.deadlineTime ?? unstuffing.windowStart) : null;
  const stuffingStart = stuffing ? (stuffing.windowStart ?? stuffing.deadlineTime) : null;
  if (!unstuffingEnd || !stuffingStart) {
    result.warnings.push({
      code: 'SEQUENCE_NOT_VERIFIED',
      severity: 'warn',
      resource: 'CONTAINER',
      message: `Chưa đủ giờ hẹn của Stop rút hàng ${imp} và đóng hàng ${exp} nên chưa kiểm tra được thứ tự.`,
    });
  } else if (unstuffingEnd > stuffingStart) {
    result.errors.push(
      error(
        'INVALID_STOP_SEQUENCE',
        `Rút hàng ${imp} kết thúc lúc ${unstuffingEnd.toISOString()} sau giờ đóng hàng ${exp} bắt đầu ${stuffingStart.toISOString()}. Đổi giờ hẹn để rút hàng Nhập xong trước.`,
      ),
    );
  }
  return result;
}
