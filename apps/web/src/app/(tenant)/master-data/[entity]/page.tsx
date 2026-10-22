import { notFound, redirect } from 'next/navigation';
import { can, rolesFor } from '@core/modules/identity/permissions';
import { AppError } from '@shared/errors';
import type { CatalogAccess } from '@/features/master-data/catalog-view';
import { CustomerList } from '@/features/master-data/customer-list';
import { entityOfSlug } from '@/features/master-data/entities';
import { LocationList } from '@/features/master-data/location-list';
import { RouteList } from '@/features/master-data/route-list';
import { ShippingLineList } from '@/features/master-data/shipping-line-list';
import { VendorList } from '@/features/master-data/vendor-list';
import { requireRole } from '@/server';
import { getMasterDataService } from '@/server/services';

// Chỉ định tuyến + nạp dữ liệu đầu. Cột cho client được chọn từng trường, không gửi createdBy hay mốc thời gian.
export default async function MasterDataPage({ params }: { params: Promise<{ entity: string }> }) {
  const { entity: slug } = await params;
  const entity = entityOfSlug(slug);
  if (!entity) notFound();

  let ctx;
  try {
    ctx = await requireRole(rolesFor('masterData.view'));
  } catch (error) {
    if (error instanceof AppError) {
      if (error.code === 'UNAUTHENTICATED') redirect('/login');
      if (error.code === 'NO_TENANT_MEMBERSHIP') redirect('/select-tenant');
      if (error.code === 'FORBIDDEN') notFound();
    }
    throw error;
  }

  const access: CatalogAccess = can(ctx.role, 'masterData.write')
    ? 'write'
    : entity === 'customers' && can(ctx.role, 'masterData.editBilling')
      ? 'billing'
      : 'read';
  const service = getMasterDataService();

  switch (entity) {
    case 'customers': {
      const rows = await service.list(ctx, 'customers');
      return (
        <CustomerList
          access={access}
          rows={rows.map((r) => ({
            id: r.id,
            code: r.code,
            name: r.name,
            taxCode: r.taxCode,
            billingAddress: r.billingAddress,
            paymentTermDays: r.paymentTermDays,
            creditLimit: r.creditLimit,
          }))}
        />
      );
    }
    case 'shippingLines': {
      const rows = await service.list(ctx, 'shippingLines');
      return (
        <ShippingLineList
          access={access}
          rows={rows.map((r) => ({
            id: r.id,
            code: r.code,
            name: r.name,
            allowsStreetTurn: r.allowsStreetTurn,
          }))}
        />
      );
    }
    case 'vendors': {
      const rows = await service.list(ctx, 'vendors');
      return (
        <VendorList
          access={access}
          rows={rows.map((r) => ({
            id: r.id,
            code: r.code,
            name: r.name,
            taxCode: r.taxCode,
            type: r.type,
            paymentTermDays: r.paymentTermDays,
          }))}
        />
      );
    }
    case 'locations': {
      const [rows, customers, vendors] = await Promise.all([
        service.list(ctx, 'locations'),
        service.list(ctx, 'customers'),
        service.list(ctx, 'vendors'),
      ]);
      return (
        <LocationList
          access={access}
          customers={customers.map((c) => ({ id: c.id, name: c.name }))}
          vendors={vendors.map((v) => ({ id: v.id, name: v.name }))}
          rows={rows.map((r) => ({
            id: r.id,
            code: r.code,
            type: r.type,
            name: r.name,
            address: r.address,
            customerId: r.customerId,
            vendorId: r.vendorId,
            lat: r.lat,
            lng: r.lng,
            geofenceRadiusM: r.geofenceRadiusM,
            zone: r.zone,
          }))}
        />
      );
    }
    case 'routes': {
      const rows = await service.list(ctx, 'routes');
      return (
        <RouteList
          access={access}
          rows={rows.map((r) => ({
            id: r.id,
            routeCode: r.routeCode,
            name: r.name,
            originZone: r.originZone,
            destinationZone: r.destinationZone,
            standardDistanceKm: r.standardDistanceKm,
          }))}
        />
      );
    }
  }
}
