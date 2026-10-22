import { notFound, redirect } from 'next/navigation';
import { rolesFor } from '@core/modules/identity/permissions';
import { AppError } from '@shared/errors';
import { TariffImport } from '@/features/billing/tariff-import';
import { requireRole } from '@/server';

// Chỉ vai trò có quyền ghi giá mới thấy màn import (Chủ công ty, Quản trị, Kế toán).
export default async function TariffImportPage() {
  try {
    await requireRole(rolesFor('tariff.write'));
  } catch (error) {
    if (error instanceof AppError) {
      if (error.code === 'UNAUTHENTICATED') redirect('/login');
      if (error.code === 'NO_TENANT_MEMBERSHIP') redirect('/select-tenant');
      if (error.code === 'FORBIDDEN') notFound();
    }
    throw error;
  }
  return <TariffImport />;
}
