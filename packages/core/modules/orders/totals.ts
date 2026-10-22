// Tổng tiền của Order, tính lại từ container và phí mỗi khi một trong hai đổi (cùng transaction). Hàm thuần, dùng decimal.js.
//   containerCount, totalFreightAmount: container chưa hủy
//   totalSurchargeAmount: phụ thu của container chưa hủy + phí hủy (CANCELLATION_FEE) của container đã hủy + phụ thu cấp Order
//   totalPassThroughAmount: chi hộ của container chưa hủy + chi hộ cấp Order (chi hộ không phải doanh thu)
import { add, toDbString, toMoney, type Money } from '../../lib/money';
import type { OrderContainerRow, OrderFeeRow } from './repo';

export const CANCELLATION_FEE_CODE = 'CANCELLATION_FEE';

export type OrderTotals = {
  containerCount: number;
  totalFreightAmount: string;
  totalSurchargeAmount: string;
  totalPassThroughAmount: string;
};

const sum = (values: string[]) =>
  toDbString(values.reduce<Money>((total, v) => add(total, v), toMoney('0')));

export function computeOrderTotals(
  containers: Pick<OrderContainerRow, 'id' | 'status' | 'baseFreightAmount'>[],
  fees: Pick<OrderFeeRow, 'orderContainerId' | 'feeCategory' | 'feeCode' | 'amount'>[],
): OrderTotals {
  const live = containers.filter((c) => c.status !== 'CANCELLED');
  const liveIds = new Set(live.map((c) => c.id));
  const countsAsLive = (fee: Pick<OrderFeeRow, 'orderContainerId'>) =>
    fee.orderContainerId === null || liveIds.has(fee.orderContainerId);

  return {
    containerCount: live.length,
    totalFreightAmount: sum(live.map((c) => c.baseFreightAmount)),
    totalSurchargeAmount: sum(
      fees
        .filter(
          (f) =>
            f.feeCategory === 'REVENUE_SURCHARGE' &&
            (countsAsLive(f) || f.feeCode === CANCELLATION_FEE_CODE),
        )
        .map((f) => f.amount),
    ),
    totalPassThroughAmount: sum(
      fees.filter((f) => f.feeCategory === 'PASS_THROUGH' && countsAsLive(f)).map((f) => f.amount),
    ),
  };
}
