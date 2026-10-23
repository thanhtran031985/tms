import { notFound, redirect } from 'next/navigation';
import type { RequestContext } from '@core/lib/context';
import { can, rolesFor } from '@core/modules/identity/permissions';
import { AppError } from '@shared/errors';
import { requireRole } from '@/server';
import type { BoardAccess } from './board';

// Kiểm quyền cho trang Điều vận (server component): chưa đăng nhập về /login, chưa chọn công ty về /select-tenant,
// không đủ quyền xem thì 404 (không lộ trang tồn tại). Quyền thao tác (gán xe) quyết định nút và kéo thả hiện ra.
export async function requireDispatchPage(): Promise<{
  ctx: RequestContext;
  access: BoardAccess;
  now: number;
}> {
  try {
    const ctx = await requireRole(rolesFor('dispatch.view'));
    return {
      ctx,
      now: Date.now(),
      access: {
        assign: can(ctx.role, 'dispatch.assign'),
        overrideHours: can(ctx.role, 'dispatch.overrideDriveHours'),
        createOrder: can(ctx.role, 'order.write'),
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
