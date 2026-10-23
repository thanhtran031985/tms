/* eslint-disable @typescript-eslint/no-unused-vars -- khung chưa cài đặt của task 08, gỡ khi cài đặt */
// Ghép chuyến TWIN_20 và COMBINED (task 08): lập chuyến cho 2 container, ghép thêm container vào chuyến đơn.
// CHƯA CÀI ĐẶT (bước 2); khung hàm để test biên dịch được và đỏ vì chưa có nghiệp vụ.
import { AppError } from '@shared/errors';
import type {
  AddContainerToTripInput,
  CreateConsolidatedTripInput,
} from '@shared/schemas/dispatch';
import type { RequestContext } from '../../lib/context';
import type { DispatchDeps } from './deps';
import type { TripResult } from './index';

const NOT_IMPLEMENTED = 'Chưa cài đặt (task 08).';

export function createConsolidateService(_deps: DispatchDeps) {
  async function createConsolidatedTrip(
    _ctx: RequestContext,
    _input: CreateConsolidatedTripInput,
  ): Promise<TripResult> {
    throw new AppError('INTERNAL_ERROR', NOT_IMPLEMENTED);
  }

  async function addContainerToTrip(
    _ctx: RequestContext,
    _input: AddContainerToTripInput,
  ): Promise<TripResult> {
    throw new AppError('INTERNAL_ERROR', NOT_IMPLEMENTED);
  }

  return { createConsolidatedTrip, addContainerToTrip };
}
