// Ràng buộc vật lý áp cho chuyến một container (spec 03 mục 2, Rule 2, 5, 6, 8). Hàm thuần: nhận dữ liệu đã tải, trả lỗi và cảnh báo.
// Ghép TWIN_20 và COMBINED (cộng khối lượng nhiều cont) thuộc task 08; hàm này đánh giá từng container một.
import Decimal from 'decimal.js';
import { diffCalendarDays, toTenantDate } from '../../../lib/time';
import type { OrderContainerRow, OrderRow, OrderStopRow } from '../../orders/repo';
import type { DriverRow, TractorRow, TrailerRow } from '../../fleet/repo';
import { noIssues, type RuleResult } from './types';

/**
 * Vỏ container chuẩn (tấn) khi chưa có VGM: cont 20 feet 2,3; cont 40 và 45 feet 3,8; cont lạnh (RF) cộng thêm máy lạnh.
 * Số xấp xỉ theo ISO, đủ để cảnh báo quá tải; có VGM thì dùng VGM, không dùng bảng này.
 */
const TARE_BY_SIZE: Record<string, string> = { '20': '2.3', '40': '3.8', '45': '3.8' };
const REEFER_EXTRA_TARE = '1.2';

export function standardTareTons(containerType: string): Decimal {
  const base = new Decimal(TARE_BY_SIZE[containerType.slice(0, 2)] ?? '3.8');
  return containerType.endsWith('RF') ? base.plus(REEFER_EXTRA_TARE) : base;
}

export type ContainerWeight =
  { known: true; tons: Decimal; source: 'VGM' | 'CARGO_PLUS_TARE' } | { known: false };

/** VGM là khối lượng đã gồm vỏ nên ưu tiên; không có thì khối lượng hàng cộng vỏ chuẩn. */
export function containerWeight(
  container: Pick<OrderContainerRow, 'vgmTons' | 'cargoWeightTons' | 'containerType'>,
): ContainerWeight {
  if (container.vgmTons != null)
    return { known: true, tons: new Decimal(container.vgmTons), source: 'VGM' };
  if (container.cargoWeightTons != null) {
    return {
      known: true,
      tons: new Decimal(container.cargoWeightTons).plus(standardTareTons(container.containerType)),
      source: 'CARGO_PLUS_TARE',
    };
  }
  return { known: false };
}

export function checkPhysical(input: {
  container: OrderContainerRow;
  driver: DriverRow | undefined;
  tractor: TractorRow | undefined;
  trailer: TrailerRow | undefined;
  plannedEnd: Date;
  timeZone: string;
  confirmMissingWeight: boolean;
}): RuleResult {
  const { container, driver, tractor, trailer, plannedEnd, timeZone, confirmMissingWeight } = input;
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

  // Rule 2: tải trọng.
  if (trailer && tractor) {
    const weight = containerWeight(container);
    if (!weight.known) {
      if (confirmMissingWeight) {
        result.warnings.push({
          code: 'WEIGHT_MISSING',
          severity: 'warn',
          resource: 'CONTAINER',
          message: `Container ${label} chưa có khối lượng; chưa kiểm tra được tải trọng.`,
        });
      } else {
        result.errors.push({
          code: 'WEIGHT_CONFIRMATION_REQUIRED',
          resource: 'CONTAINER',
          reason: 'WEIGHT_MISSING',
          message: `Container ${label} chưa có khối lượng nên chưa kiểm tra được tải trọng. Xác nhận đã biết để tiếp tục.`,
          details: { resource: 'CONTAINER', reason: 'WEIGHT_MISSING' },
        });
      }
    } else {
      const tons = weight.tons;
      const maxPayload = new Decimal(trailer.maxPayloadTons);
      const exceed = (message: string, extra: Record<string, string | number>) =>
        result.errors.push({
          code: 'PAYLOAD_EXCEEDED',
          resource: 'TRAILER',
          reason: 'PAYLOAD_EXCEEDED',
          message,
          details: {
            resource: 'TRAILER',
            reason: 'PAYLOAD_EXCEEDED',
            weightTons: tons.toString(),
            ...extra,
          },
        });

      if (tons.greaterThan(maxPayload)) {
        exceed(
          `Container ${label} nặng ${tons.toString()} tấn, vượt tải trọng ${maxPayload.toString()} tấn của rơ moóc ${trailer.plateNumber}.`,
          { maxPayloadTons: maxPayload.toString() },
        );
      } else if (trailer.tareWeightTons != null && tractor.permittedGrossWeightTons != null) {
        const gross = tons.plus(trailer.tareWeightTons);
        const permitted = new Decimal(tractor.permittedGrossWeightTons);
        if (gross.greaterThan(permitted)) {
          exceed(
            `Container ${label} cộng tự trọng rơ moóc là ${gross.toString()} tấn, vượt khối lượng cho phép ${permitted.toString()} tấn của đầu kéo ${tractor.plateNumber}.`,
            { grossTons: gross.toString(), permittedGrossTons: permitted.toString() },
          );
        }
      }
      // Bảng tractors chưa có cột tự trọng đầu kéo nên phép tính bỏ phần này; nói rõ để Điều vận biết.
      result.warnings.push({
        code: 'TRACTOR_TARE_NOT_COUNTED',
        severity: 'info',
        resource: 'TRACTOR',
        message: 'Phép kiểm tra khối lượng chưa tính tự trọng đầu kéo (chưa có dữ liệu).',
      });
    }
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
