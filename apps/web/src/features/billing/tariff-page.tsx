import { notFound, redirect } from 'next/navigation';
import { can, rolesFor } from '@core/modules/identity/permissions';
import { tariffDateOf } from '@core/modules/billing/pricing-engine';
import { AppError } from '@shared/errors';
import { requireRole } from '@/server';
import { getMasterDataService, getTariffService } from '@/server/services';
import { TariffView } from './tariff-view';
import type { FeeDto, FreightDto } from './tariff-types';

// Nạp dữ liệu đầu cho màn bảng giá (server component). Cột gửi xuống client được chọn từng trường.
export async function TariffPageContent({ kind }: { kind: 'freight' | 'fee' }) {
  let ctx;
  try {
    ctx = await requireRole(rolesFor('tariff.view'));
  } catch (error) {
    if (error instanceof AppError) {
      if (error.code === 'UNAUTHENTICATED') redirect('/login');
      if (error.code === 'NO_TENANT_MEMBERSHIP') redirect('/select-tenant');
      if (error.code === 'FORBIDDEN') notFound();
    }
    throw error;
  }

  const master = getMasterDataService();
  const tariffs = getTariffService();
  const [routes, customers, rows] = await Promise.all([
    master.list(ctx, 'routes'),
    master.list(ctx, 'customers'),
    kind === 'freight' ? tariffs.listFreight(ctx) : tariffs.listFees(ctx),
  ]);

  const common = (r: (typeof rows)[number]) => ({
    id: r.id,
    containerType: r.containerType,
    tripMode: r.tripMode,
    customerId: r.customerId,
    currency: r.currency,
    validFrom: r.validFrom,
    validTo: r.validTo,
    isActive: r.isActive,
  });
  const dtos = rows.map((r) =>
    'basePrice' in r
      ? ({
          ...common(r),
          routeId: r.routeId,
          basePrice: r.basePrice,
          vatRatePercent: r.vatRatePercent,
        } satisfies FreightDto)
      : ({
          ...common(r),
          routeId: r.routeId,
          feeCategory: r.feeCategory,
          feeCode: r.feeCode,
          feeName: r.feeName,
          calcBasis: r.calcBasis,
          amount: r.amount,
          vatRatePercent: r.vatRatePercent,
          isExcluded: r.isExcluded,
        } satisfies FeeDto),
  );

  return (
    <TariffView
      kind={kind}
      rows={dtos}
      routes={routes.map((r) => ({ id: r.id, name: r.name }))}
      customers={customers.map((c) => ({ id: c.id, name: c.name }))}
      access={{
        write: can(ctx.role, 'tariff.write'),
        editActive: can(ctx.role, 'pricing.editActive'),
      }}
      today={tariffDateOf(ctx, new Date())}
    />
  );
}
