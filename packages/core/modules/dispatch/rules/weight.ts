/* eslint-disable @typescript-eslint/no-unused-vars -- khung chưa cài đặt của task 08, gỡ khi cài đặt */
// Rule 2 (spec 03 mục 2) cho chuyến nhiều container: cộng khối lượng toàn bộ các cont rồi so với tải trọng rơ moóc và
// khối lượng cho phép của đầu kéo (cộng tự trọng rơ moóc và đầu kéo). CHƯA CÀI ĐẶT (task 08, bước 2).
import type { OrderContainerRow } from '../../orders/repo';
import type { TractorRow, TrailerRow } from '../../fleet/repo';
import { noIssues, type RuleResult } from './types';

export function checkTripWeight(_input: {
  containers: Pick<
    OrderContainerRow,
    'id' | 'lineNo' | 'containerNo' | 'containerType' | 'vgmTons' | 'cargoWeightTons'
  >[];
  tractor:
    | Pick<TractorRow, 'plateNumber' | 'permittedGrossWeightTons' | 'tareWeightTons'>
    | undefined;
  trailer: Pick<TrailerRow, 'plateNumber' | 'maxPayloadTons' | 'tareWeightTons'> | undefined;
  confirmMissingWeight: boolean;
}): RuleResult {
  return noIssues();
}
