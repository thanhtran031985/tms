/* eslint-disable @typescript-eslint/no-unused-vars -- khung chưa cài đặt của task 08, gỡ khi cài đặt */
// Rule 1 (spec 03 mục 2): chuyến TWIN_20 cần rơ moóc có chốt khóa giữa và đúng 2 container 20 feet.
// Hàm thuần: nhận dữ liệu đã tải, trả lỗi và cảnh báo. CHƯA CÀI ĐẶT (task 08, bước 2).
import type { TripMode } from '@shared/enums';
import type { OrderContainerRow } from '../../orders/repo';
import type { TrailerRow } from '../../fleet/repo';
import { noIssues, type RuleResult } from './types';

export function checkTwin20(_input: {
  tripMode: TripMode;
  containers: Pick<OrderContainerRow, 'id' | 'lineNo' | 'containerNo' | 'containerType'>[];
  trailer: Pick<TrailerRow, 'plateNumber' | 'trailerType' | 'canCarryTwin20'> | undefined;
}): RuleResult {
  return noIssues();
}
