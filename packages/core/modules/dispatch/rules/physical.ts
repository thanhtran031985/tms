// Ràng buộc vật lý áp cho chuyến một container (spec 03 mục 2, Rule 2, 5, 6, 8). Hàm thuần: nhận dữ liệu đã tải, trả lỗi và cảnh báo.
// Hàm này đánh giá từng container một; khối lượng cộng dồn của chuyến ghép nằm ở weight.ts (task 08).
import { diffCalendarDays, toTenantDate } from '../../../lib/time';
import type { OrderContainerRow, OrderRow, OrderStopRow } from '../../orders/repo';
import type { DriverRow, TractorRow, TrailerRow } from '../../fleet/repo';
import { noIssues, type RuleResult } from './types';
import { checkTripWeight } from './weight';

export { containerWeight, standardTareTons, type ContainerWeight } from './weight';

export function checkPhysical(input: {
  container: OrderContainerRow;
  driver: DriverRow | undefined;
  tractor: TractorRow | undefined;
  trailer: TrailerRow | undefined;
  plannedEnd: Date;
  timeZone: string;
  confirmMissingWeight: boolean;
  /** Đã kiểm khối lượng cộng dồn của cả chuyến (checkTripWeight) nên bỏ phần Rule 2 ở đây. */
  skipWeight?: boolean;
}): RuleResult {
  const { container, driver, tractor, trailer, plannedEnd, timeZone, confirmMissingWeight, skipWeight } =
    input;
  const result = noIssues();
  const label = container.containerNo ?? `dòng ${container.lineNo}`;

  // Rule 5: cont lạnh cần rơ moóc có máy phát điện.
  if (container.containerType.endsWith('RF') && trailer && !trailer.hasGensetPower) {
    result.errors.push({
      code: 'REEFER_REQUIRES_GENSET',
      resource: 'TRAILER',
      reason: 'REEFER_REQUIRES_GENSET',
      message: `Container lạnh ${label} cần rơ moóc có máy phát điện (genset); rơ moóc ${trailer.plateNumber} không có.`,
      details: { resource: 'TRAILER', reason: 'REEFER_REQUIRES_GENSET' },
    });
  }

  // Rule 6: hàng nguy hiểm cần tài xế có chứng chỉ còn hạn tại giờ kết thúc chuyến.
  if (container.isDangerousGoods && driver) {
    const endDate = toTenantDate(plannedEnd, timeZone);
    const valid =
      !!driver.dgCertificateExpiry && diffCalendarDays(driver.dgCertificateExpiry, endDate) >= 0;
    if (!valid) {
      result.errors.push({
        code: 'DG_CERTIFICATE_REQUIRED',
        resource: 'DRIVER',
        reason: 'DG_CERTIFICATE_REQUIRED',
        message: `Container ${label} là hàng nguy hiểm; tài xế ${driver.fullName} chưa có chứng chỉ hàng nguy hiểm còn hạn.`,
        details: { resource: 'DRIVER', reason: 'DG_CERTIFICATE_REQUIRED' },
      });
    }
  }

  // Rule 2: tải trọng của riêng container này (tra cứu từng rơ moóc). Chuyến nhiều cont dùng checkTripWeight cộng dồn
  // và truyền skipWeight để không tính hai lần.
  if (!skipWeight) {
    const weight = checkTripWeight({ containers: [container], tractor, trailer, confirmMissingWeight });
    result.errors.push(...weight.errors);
    result.warnings.push(...weight.warnings);
  }
  return result;
}

/** Rule 8: Stop PORT_IN kết thúc sau cut-off của Order thì cảnh báo đỏ (vẫn cho gán). Giờ Stop lấy theo giờ kết thúc chuyến. */
export function checkCutOff(input: {
  order: Pick<OrderRow, 'cutOffAt'>;
  stops: Pick<OrderStopRow, 'stopType'>[];
  plannedEnd: Date;
  containerLabel: string;
}): RuleResult {
  const result = noIssues();
  const { order, stops, plannedEnd, containerLabel } = input;
  if (
    order.cutOffAt &&
    stops.some((s) => s.stopType === 'PORT_IN') &&
    plannedEnd > order.cutOffAt
  ) {
    result.warnings.push({
      code: 'CUT_OFF_EXCEEDED',
      severity: 'danger',
      resource: 'CONTAINER',
      message: `Container ${containerLabel} về cảng sau giờ cut-off của Order.`,
      details: { cutOffAt: order.cutOffAt.toISOString(), plannedEnd: plannedEnd.toISOString() },
    });
  }
  return result;
}
