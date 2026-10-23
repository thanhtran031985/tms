/* eslint-disable @typescript-eslint/no-unused-vars -- khung chưa cài đặt của task 08, gỡ khi cài đặt */
// Street Turn (đảo vỏ) giữa cont Nhập và cont Xuất (task 08): liên kết hai chiều, số chấp thuận của hãng tàu, phí.
// CHƯA CÀI ĐẶT (bước 3); khung hàm để test biên dịch được và đỏ vì chưa có nghiệp vụ.
import { AppError } from '@shared/errors';
import type {
  LinkStreetTurnInput,
  ListStreetTurnsInput,
  SetStreetTurnApprovalInput,
} from '@shared/schemas/dispatch';
import type { RequestContext } from '../../lib/context';
import type { OrderContainerRow, OrderFeeRow } from '../orders/repo';
import type { DispatchDeps } from './deps';

const NOT_IMPLEMENTED = 'Chưa cài đặt (task 08).';

export type StreetTurnResult = {
  importContainer: OrderContainerRow;
  exportContainer: OrderContainerRow;
  /** Phí Street Turn vừa ghi (null nếu không nhập số tiền hoặc cấu hình tenant là NONE). */
  fee: OrderFeeRow | null;
};

export type StreetTurnItem = {
  importContainerId: string;
  exportContainerId: string;
  importContainerNo: string | null;
  exportContainerNo: string | null;
  importOrderNo: string;
  exportOrderNo: string;
  shippingLineName: string | null;
  approvalRef: string | null;
};

export function createStreetTurnService(_deps: DispatchDeps) {
  async function linkStreetTurn(
    _ctx: RequestContext,
    _input: LinkStreetTurnInput,
  ): Promise<StreetTurnResult> {
    throw new AppError('INTERNAL_ERROR', NOT_IMPLEMENTED);
  }

  async function setStreetTurnApproval(
    _ctx: RequestContext,
    _input: SetStreetTurnApprovalInput,
  ): Promise<StreetTurnResult> {
    throw new AppError('INTERNAL_ERROR', NOT_IMPLEMENTED);
  }

  async function listStreetTurns(
    _ctx: RequestContext,
    _input: ListStreetTurnsInput,
  ): Promise<StreetTurnItem[]> {
    throw new AppError('INTERNAL_ERROR', NOT_IMPLEMENTED);
  }

  return { linkStreetTurn, setStreetTurnApproval, listStreetTurns };
}
