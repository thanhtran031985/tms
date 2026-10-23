/* eslint-disable @typescript-eslint/no-unused-vars -- khung chưa cài đặt của task 08, gỡ khi cài đặt */
// Tính lại giá khi khóa tra giá của container đổi, ví dụ ghép hoặc tách chuyến (task 08, spec 06 mục 4).
// Service nội bộ cho worker (job `pricing.reprice` và job quét cờ treo), không qua Server Action nên không kiểm role.
// CHƯA CÀI ĐẶT (bước 5); khung hàm để test biên dịch được và đỏ vì chưa có nghiệp vụ.
import { AppError } from '@shared/errors';
import type { RequestContext } from '../../lib/context';
import type { TenantDb } from '../../lib/db/tenant-db';

const NOT_IMPLEMENTED = 'Chưa cài đặt (task 08).';

export type RepriceOutcome =
  | 'REPRICED'
  | 'UNCHANGED'
  | 'SKIPPED_MANUAL'
  | 'SKIPPED_INVOICED'
  | 'SKIPPED_INACTIVE'
  /** Chỉ trong kết quả quét: tính lại một container báo lỗi (vd. TARIFF_NOT_FOUND), giữ giá và giữ cờ. */
  | 'FAILED';

export type RepriceSnapshot = { amount: string; tariffId: string | null; tripMode: string };

export type RepriceResult = {
  orderContainerId: string;
  outcome: RepriceOutcome;
  before: RepriceSnapshot | null;
  after: RepriceSnapshot | null;
  /** Mã lỗi khi outcome là FAILED. */
  errorCode?: string;
};

export type RepriceServiceOptions = {
  tenantDb: (ctx: RequestContext) => TenantDb;
  now?: () => Date;
};

export type RepriceService = {
  /** Tính lại một container đã đặt cờ `repriceRequired`; chạy lại nhiều lần an toàn. */
  repriceContainer(ctx: RequestContext, input: { orderContainerId: string }): Promise<RepriceResult>;
  /** Quét mọi container còn cờ treo của tenant và tính lại từng cái. */
  repriceFlagged(ctx: RequestContext, input?: { limit?: number }): Promise<RepriceResult[]>;
};

export function createRepriceService(_options: RepriceServiceOptions): RepriceService {
  return {
    async repriceContainer() {
      throw new AppError('INTERNAL_ERROR', NOT_IMPLEMENTED);
    },
    async repriceFlagged() {
      throw new AppError('INTERNAL_ERROR', NOT_IMPLEMENTED);
    },
  };
}
