import { notFound, redirect } from 'next/navigation';
import { can, rolesFor } from '@core/modules/identity/permissions';
import { getTenantDb } from '@core/lib/db/tenant-db';
import * as fleetSvc from '@core/modules/fleet/fleet.service';
import { AppError } from '@shared/errors';
import { TractorList } from '@/features/fleet/tractor-list';
import type { FleetAccess } from '@/features/fleet/types';
import { requireRole } from '@/server';

export default async function TractorsPage() {
  let ctx;
  try {
    ctx = await requireRole(rolesFor('fleet.view'));
  } catch (error) {
    if (error instanceof AppError) {
      if (error.code === 'UNAUTHENTICATED') redirect('/login');
      if (error.code === 'NO_TENANT_MEMBERSHIP') redirect('/select-tenant');
      if (error.code === 'FORBIDDEN') notFound();
    }
    throw error;
  }

  const access: FleetAccess = can(ctx.role, 'fleet.write') ? 'write' : 'read';
  const tdb = getTenantDb(ctx);
  const rows = await fleetSvc.listTractors(ctx, tdb);

  return <TractorList initialRows={rows} access={access} />;
}
