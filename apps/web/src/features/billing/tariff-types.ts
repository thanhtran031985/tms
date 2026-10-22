// Kiểu dữ liệu phía client của bảng giá: tập con cột của hàng trong DB, không kéo packages/core vào client component.
import type { ContainerType, TripMode } from '@shared/enums';

type Common = {
  id: string;
  routeId: string | null;
  containerType: ContainerType;
  tripMode: TripMode;
  customerId: string | null;
  currency: string;
  vatRatePercent: string | null;
  validFrom: string;
  validTo: string | null;
  isActive: boolean;
};

export type FreightDto = Common & { routeId: string; basePrice: string; vatRatePercent: string };

export type FeeDto = Common & {
  feeCategory: 'COST_NORM' | 'REVENUE_SURCHARGE' | 'PASS_THROUGH';
  feeCode: string;
  feeName: string;
  calcBasis: 'PER_TRIP' | 'PER_CONTAINER' | 'PER_DAY' | 'PER_KM';
  amount: string;
  isExcluded: boolean;
};

export type TariffDto = FreightDto | FeeDto;
export type RefOption = { id: string; name: string };

/** Quyền của người xem trang, tính ở server từ ma trận quyền. */
export type TariffAccess = { write: boolean; editActive: boolean };

export type TariffStatus = 'active' | 'upcoming' | 'expired' | 'inactive';

export function statusOf(
  row: Pick<Common, 'validFrom' | 'validTo' | 'isActive'>,
  today: string,
): TariffStatus {
  if (!row.isActive) return 'inactive';
  if (row.validFrom > today) return 'upcoming';
  if (row.validTo !== null && row.validTo < today) return 'expired';
  return 'active';
}

// Kết quả xem trước import (JSON từ /api/billing/tariff-import).
export type ImportRowDto = {
  rowNumber: number;
  errors: string[];
  /** Có khi dòng hợp lệ; gửi lại nguyên vẹn khi xác nhận (server kiểm tra lại toàn bộ). */
  data?: unknown;
  view: {
    route: string;
    containerType: string;
    tripMode: string;
    customer: string;
    feeCode: string;
    amount: string;
    validFrom: string;
    validTo: string;
  };
};

export type ImportPreviewDto = {
  kind: 'freight' | 'fee';
  fileErrors: string[];
  rows: ImportRowDto[];
  counts: { total: number; valid: number; error: number };
};
