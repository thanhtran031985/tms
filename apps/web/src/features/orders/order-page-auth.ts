import { notFound, redirect } from 'next/navigation';
import type { RequestContext } from '@core/lib/context';
import { can, rolesFor } from '@core/modules/identity/permissions';
import { AppError } from '@shared/errors';
import { requireRole } from '@/server';
import type { OrderAccess } from './order-types';

// Kiểm quyền cho trang Đơn hàng (server component): chưa đăng nhập về /login, chưa chọn công ty về /select-tenant,
// không đủ quyền thì 404 (không lộ trang tồn tại).
export async function requireOrderPage(
  permission: 'order.view' | 'order.write',
): Promise<{ ctx: RequestContext; access: OrderAccess; now: number }> {
  try {
    const ctx = await requireRole(rolesFor(permission));
    return {
      ctx,
      now: Date.now(),
      access: {
        write: can(ctx.role, 'order.write'),
        manualPrice: can(ctx.role, 'order.manualPrice'),
      },
    };
  } catch (error) {
    if (error instanceof AppError) {
      if (error.code === 'UNAUTHENTICATED') redirect('/login');
      if (error.code === 'NO_TENANT_MEMBERSHIP') redirect('/select-tenant');
      if (error.code === 'FORBIDDEN') notFound();
    }
    throw error;
  }
}
