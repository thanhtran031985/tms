import { notFound, redirect } from 'next/navigation';
import { rolesFor } from '@core/modules/identity/permissions';
import { getTenantDb } from '@core/lib/db/tenant-db';
import * as documentsSvc from '@core/modules/fleet/documents.service';
import { AppError } from '@shared/errors';
import { DocumentsView } from '@/features/fleet/documents-view';
import { requireRole } from '@/server';

export default async function DocumentsPage() {
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

  const tdb = getTenantDb(ctx);
  const rows = await documentsSvc.listExpiringDocuments(ctx, tdb, { withinDays: 15 });

  return <DocumentsView initialRows={rows} />;
}
