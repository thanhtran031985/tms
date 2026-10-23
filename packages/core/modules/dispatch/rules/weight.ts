// Rule 2 (spec 03 mục 2) cho chuyến một hoặc nhiều container: cộng khối lượng toàn bộ các cont rồi so với tải trọng rơ moóc và
// khối lượng cho phép của đầu kéo (cộng tự trọng rơ moóc và, nếu đã khai báo, tự trọng đầu kéo).
// Khối lượng một cont: VGM, chưa có thì khối lượng hàng + vỏ chuẩn (physical.ts). Thiếu dữ liệu thì bắt xác nhận, không bỏ qua âm thầm.
import Decimal from 'decimal.js';
import type { OrderContainerRow } from '../../orders/repo';
import type { TractorRow, TrailerRow } from '../../fleet/repo';
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

const labelOf = (c: Pick<OrderContainerRow, 'lineNo' | 'containerNo'>) =>
  c.containerNo ?? `dòng ${c.lineNo}`;

export function checkTripWeight(input: {
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
  const { containers, tractor, trailer, confirmMissingWeight } = input;
  const result = noIssues();
  // Cần rơ moóc mới có tải trọng để so; tra cứu rơ moóc chưa chọn xe thì bỏ qua như task 06.
  if (!trailer) return result;

  let total = new Decimal(0);
  let known = 0;
  for (const container of containers) {
    const weight = containerWeight(container);
    if (weight.known) {
      total = total.plus(weight.tons);
      known += 1;
    } else if (confirmMissingWeight) {
      result.warnings.push({
        code: 'WEIGHT_MISSING',
        severity: 'warn',
        resource: 'CONTAINER',
        message: `Container ${labelOf(container)} chưa có khối lượng; chưa kiểm tra được tải trọng.`,
      });
    } else {
      result.errors.push({
        code: 'WEIGHT_CONFIRMATION_REQUIRED',
        resource: 'CONTAINER',
        reason: 'WEIGHT_MISSING',
        message: `Container ${labelOf(container)} chưa có khối lượng nên chưa kiểm tra được tải trọng. Xác nhận đã biết để tiếp tục.`,
        details: { resource: 'CONTAINER', reason: 'WEIGHT_MISSING' },
      });
    }
  }
  if (known === 0 || result.errors.length > 0) return result;

  const subject =
    containers.length === 1
      ? `Container ${labelOf(containers[0]!)} nặng ${total.toString()} tấn`
      : `${containers.length} container nặng tổng ${total.toString()} tấn`;
  const exceed = (message: string, extra: Record<string, string | number>) =>
    result.errors.push({
      code: 'PAYLOAD_EXCEEDED',
      resource: 'TRAILER',
      reason: 'PAYLOAD_EXCEEDED',
      message,
      details: { resource: 'TRAILER', reason: 'PAYLOAD_EXCEEDED', weightTons: total.toString(), ...extra },
    });

  const maxPayload = new Decimal(trailer.maxPayloadTons);
  if (total.greaterThan(maxPayload)) {
    exceed(`${subject}, vượt tải trọng ${maxPayload.toString()} tấn của rơ moóc ${trailer.plateNumber}.`, {
      maxPayloadTons: maxPayload.toString(),
    });
  } else if (
    tractor &&
    trailer.tareWeightTons != null &&
    tractor.permittedGrossWeightTons != null
  ) {
    const gross = total.plus(trailer.tareWeightTons).plus(tractor.tareWeightTons ?? 0);
    const permitted = new Decimal(tractor.permittedGrossWeightTons);
    if (gross.greaterThan(permitted)) {
      exceed(
        `${subject}; cộng tự trọng xe là ${gross.toString()} tấn, vượt khối lượng cho phép ${permitted.toString()} tấn của đầu kéo ${tractor.plateNumber}.`,
        { grossTons: gross.toString(), permittedGrossTons: permitted.toString() },
      );
    }
  }
  // Đầu kéo chưa khai báo tự trọng: phép kiểm khối lượng toàn bộ chưa đủ, nói rõ để Điều vận biết.
  if (tractor && tractor.tareWeightTons == null) {
    result.warnings.push({
      code: 'TRACTOR_TARE_NOT_COUNTED',
      severity: 'info',
      resource: 'TRACTOR',
      message: 'Phép kiểm tra khối lượng chưa tính tự trọng đầu kéo (chưa khai báo).',
    });
  }
  return result;
}
