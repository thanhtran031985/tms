/* eslint-disable @typescript-eslint/no-unused-vars -- khung chưa cài đặt của task 08, gỡ khi cài đặt */
// Rule 3 (spec 03 mục 2): điều kiện đảo vỏ Street Turn giữa cont Nhập và cont Xuất: cùng hãng tàu, cùng loại cont, hãng cho phép
// Street Turn, Stop UNSTUFFING của cont Nhập kết thúc trước Stop STUFFING của cont Xuất. CHƯA CÀI ĐẶT (task 08, bước 3).
import type { OrderContainerRow, OrderRow, OrderStopRow } from '../../orders/repo';
import { noIssues, type RuleResult } from './types';

export type StreetTurnSide = {
  container: Pick<OrderContainerRow, 'id' | 'lineNo' | 'containerNo' | 'containerType'>;
  order: Pick<OrderRow, 'shippingLineId'>;
  stops: Pick<OrderStopRow, 'stopType' | 'windowStart' | 'deadlineTime'>[];
};

export function checkStreetTurnPair(_input: {
  importSide: StreetTurnSide;
  exportSide: StreetTurnSide;
  /** Hãng tàu của Order Nhập; undefined nếu Order không ghi hãng tàu. */
  shippingLine: { allowsStreetTurn: boolean } | undefined;
}): RuleResult {
  return noIssues();
}
