// Danh mục: slug trên URL ↔ khóa danh mục trong service, và dữ liệu hiển thị cố định (không phụ thuộc client).
import type { EntityKey } from '@shared/schemas/master-data';

export const ENTITY_SLUGS = {
  customers: 'customers',
  'shipping-lines': 'shippingLines',
  vendors: 'vendors',
  locations: 'locations',
  routes: 'routes',
} as const satisfies Record<string, EntityKey>;

export type EntitySlug = keyof typeof ENTITY_SLUGS;

export function entityOfSlug(slug: string): EntityKey | undefined {
  return (ENTITY_SLUGS as Record<string, EntityKey | undefined>)[slug];
}

export const ENTITY_TABS: { slug: EntitySlug; label: string }[] = [
  { slug: 'customers', label: 'Khách hàng' },
  { slug: 'shipping-lines', label: 'Hãng tàu' },
  { slug: 'vendors', label: 'Nhà cung cấp' },
  { slug: 'locations', label: 'Địa điểm' },
  { slug: 'routes', label: 'Tuyến' },
];

// Kiểu dữ liệu phía client: tập con cột của hàng trong DB, không kéo packages/core vào client component.
export type CustomerDto = {
  id: string;
  code: string;
  name: string;
  taxCode: string | null;
  billingAddress: string | null;
  paymentTermDays: number | null;
  creditLimit: string | null;
};
export type ShippingLineDto = {
  id: string;
  code: string;
  name: string;
  allowsStreetTurn: boolean;
};
export type VendorDto = {
  id: string;
  code: string;
  name: string;
  taxCode: string | null;
  type: 'FUEL_STATION' | 'SUB_CONTRACTOR' | 'GARAGE' | 'PORT' | 'DEPOT' | 'TIRE_SUPPLIER';
  paymentTermDays: number | null;
};
export type LocationDto = {
  id: string;
  code: string;
  type: 'PORT' | 'DEPOT' | 'WAREHOUSE' | 'FUEL_STATION' | 'GARAGE' | 'PARKING';
  name: string;
  address: string | null;
  customerId: string | null;
  vendorId: string | null;
  lat: string;
  lng: string;
  geofenceRadiusM: number;
  zone: string | null;
};
export type RouteDto = {
  id: string;
  routeCode: string;
  name: string;
  originZone: string;
  destinationZone: string;
  standardDistanceKm: number;
};

export type RefOption = { id: string; name: string };
