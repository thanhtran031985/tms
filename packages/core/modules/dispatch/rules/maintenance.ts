// Lệnh bảo dưỡng PLANNED/IN_PROGRESS chồng giờ chặn đầu kéo và rơ moóc (spec 03 mục 1 bước 3). Dùng findMaintenanceOverlap của task 05.
import type { RequestContext } from '../../../lib/context';
import type { TenantDb } from '../../../lib/db/tenant-db';
import { findMaintenanceOverlap } from '../../fleet/maintenance.service';
import { NOT_AVAILABLE_CODE, RESOURCE_NOUN, type RuleError, type TimeWindow } from './types';

type VehicleKind = 'TRACTOR' | 'TRAILER';

export async function checkMaintenance(
  ctx: RequestContext,
  tdb: TenantDb,
  input: { kind: VehicleKind; resourceId: string; label: string; window: TimeWindow },
): Promise<RuleError | null> {
  const { kind, resourceId, label, window } = input;
  // findMaintenanceOverlap lọc theo tractorId HOẶC trailerId; chỉ truyền một id nên kết quả đúng loại tài nguyên.
  const orders = await findMaintenanceOverlap(ctx, tdb, {
    ...(kind === 'TRACTOR' ? { tractorId: resourceId } : { trailerId: resourceId }),
    start: window.start,
    end: window.end,
  });
  const first = orders[0];
  if (!first) return null;
  return {
    code: NOT_AVAILABLE_CODE[kind],
    resource: kind,
    reason: 'MAINTENANCE',
    message: `${RESOURCE_NOUN[kind]} ${label} có lệnh bảo dưỡng trùng khung giờ chuyến.`,
    details: { resource: kind, reason: 'MAINTENANCE', maintenanceOrderId: first.id },
  };
}
