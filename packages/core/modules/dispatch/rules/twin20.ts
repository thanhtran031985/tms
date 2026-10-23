// Rule 1 (spec 03 mục 2): chuyến TWIN_20 cần rơ moóc có chốt khóa giữa và đúng 2 container 20 feet.
// Hàm thuần: nhận dữ liệu đã tải, trả lỗi và cảnh báo.
import type { TripMode } from '@shared/enums';
import type { OrderContainerRow } from '../../orders/repo';
import type { TrailerRow } from '../../fleet/repo';
import { noIssues, type RuleResult } from './types';

const labelOf = (c: Pick<OrderContainerRow, 'lineNo' | 'containerNo'>) =>
  c.containerNo ?? `dòng ${c.lineNo}`;

export function checkTwin20(input: {
  tripMode: TripMode;
  containers: Pick<OrderContainerRow, 'id' | 'lineNo' | 'containerNo' | 'containerType'>[];
  trailer: Pick<TrailerRow, 'plateNumber' | 'trailerType' | 'canCarryTwin20'> | undefined;
}): RuleResult {
  const result = noIssues();
  if (input.tripMode !== 'TWIN_20') return result;

  const oversized = input.containers.filter((c) => !c.containerType.startsWith('20'));
  if (oversized.length > 0) {
    result.errors.push({
      code: 'TWIN20_CONTAINER_NOT_20FT',
      resource: 'CONTAINER',
      reason: 'TWIN20_CONTAINER_NOT_20FT',
      message: `Chuyến TWIN_20 chỉ ghép được container 20 feet; ${oversized.map(labelOf).join(', ')} không phải cont 20 feet.`,
      details: { resource: 'CONTAINER', reason: 'TWIN20_CONTAINER_NOT_20FT' },
    });
  }

  // Rơ moóc 20FT hoặc khung không có chốt khóa giữa không chở được 2 cont 20 feet (spec 03 mục 2, Rule 1).
  const { trailer } = input;
  if (trailer && (trailer.trailerType === '20FT' || !trailer.canCarryTwin20)) {
    result.errors.push({
      code: 'TWIN20_TRAILER_NOT_ALLOWED',
      resource: 'TRAILER',
      reason: 'TWIN20_TRAILER_NOT_ALLOWED',
      message: `Rơ moóc ${trailer.plateNumber} (${trailer.trailerType}) không có chốt khóa giữa nên không chở được 2 cont 20 feet. Chọn rơ moóc 40 hoặc 45 feet có chốt giữa.`,
      details: { resource: 'TRAILER', reason: 'TWIN20_TRAILER_NOT_ALLOWED' },
    });
  }
  return result;
}
