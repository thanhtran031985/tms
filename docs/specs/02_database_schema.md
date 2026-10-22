# Database Schema Toàn diện (Drizzle ORM - MariaDB)
AI Developer: Sử dụng chính xác thiết kế Schema dưới đây. **[SỬA]** Schema được tách theo module trong `packages/core/lib/db/schema/*.ts` và re-export từ `schema/index.ts` (một file `schema.ts` duy nhất sẽ quá dài).

## 1. Quy ước chung [BỔ SUNG]
- **Khóa chính:** `CHAR(36)` UUIDv7, sinh ở tầng ứng dụng.
- **Tenant:** Mọi bảng nghiệp vụ có `tenant_id NOT NULL` + FK tới `tenants`. Mọi index/unique nghiệp vụ bắt đầu bằng `tenant_id`.
- **Khóa ngoại:** Khai báo `.references()` cho mọi cột `*_id` (trừ bảng partition `gps_logs`, vì MariaDB không hỗ trợ FK trên bảng partition). Service phải kiểm tra bản ghi được tham chiếu **cùng tenant** trước khi ghi.
- **Thời gian:** `DATETIME(3)` lưu UTC (ADR-008). Không dùng `timestamp()`.
- **Tiền:** `DECIMAL(18,2)` + `currency CHAR(3)` ở bảng có tiền.
- **Cột chuẩn:** `created_at`, `updated_at`, `created_by`; bảng danh mục có thêm `deleted_at` (xóa mềm). Bảng tài chính bất biến (ledger) KHÔNG có `updated_at`/`deleted_at`.
- **Khóa lạc quan:** Bảng bị nhiều người sửa (`orders`, `consolidated_trips`, `dispatch_assignments`) có cột `version INT`; `UPDATE ... WHERE version = :v` để phát hiện ghi đè.
- **Enum [SỬA]:** Không chia sẻ một instance `mysqlEnum(...)` giữa nhiều bảng (builder của Drizzle bị `.notNull()/.default()` làm thay đổi, gây rò rỉ cấu hình giữa các bảng). Khai báo mảng giá trị `as const` trong `packages/shared/enums.ts` và gọi `mysqlEnum()` mới cho từng cột.
- **Số Order [BỔ SUNG task 04]:** `orderNo` dạng `{IMP|EXP|DOM}-{YYMM}-{NNN}` (vd. `EXP-2610-044`): chiều Nhập, Xuất, Nội địa + năm tháng theo múi giờ tenant lúc tạo + số thứ tự ≥ 3 chữ số, đếm riêng theo tenant, chiều và tháng (`seq_key = 'ORD:EXP:2610'`).
- **Đánh số chứng từ:** `tripCode`, `voucherCode`, `invoiceNo`... sinh từ bảng `number_sequences` trong cùng transaction, unique theo tenant. **[SỬA task 01]** Dùng một câu `INSERT ... ON DUPLICATE KEY UPDATE last_value = LAST_INSERT_ID(last_value + 1)` rồi đọc `LAST_INSERT_ID()` (hàm `nextNumber` ở `packages/core/lib/db/numbering.ts`) thay cho `INSERT IGNORE` + `SELECT ... FOR UPDATE`: cùng khóa dòng tới khi commit, rollback hoàn số, nhưng không deadlock khi nhiều giao dịch cùng tạo dòng đầu tiên.
- **Charset [BỔ SUNG task 01]:** migration `0000_db_charset` đặt mặc định DB là `utf8mb4` / `utf8mb4_unicode_ci` (MariaDB 11.4 mặc định `utf8mb4_uca1400_ai_ci`).
- **Bảo mật PII:** Số CCCD, số GPLX, số điện thoại tài xế là dữ liệu cá nhân; chỉ hiển thị cho role có quyền, ghi audit khi xuất file.

## 2. Schema
```typescript
// packages/shared/enums.ts
export const CONTAINER_TYPES = ['20DC', '40DC', '40HC', '45HC', '20RF', '40RF', '20OT', '40OT', '20FR', '40FR', '20TK'] as const;
export const TRIP_MODES = ['SINGLE', 'TWIN_20', 'COMBINED'] as const;
export const ROLES = ['OWNER', 'ADMIN', 'DISPATCHER', 'ACCOUNTANT', 'FLEET_MANAGER', 'DRIVER', 'VIEWER'] as const;
export const STOP_TYPES = ['PICK_EMPTY', 'PICK_FULL', 'STUFFING', 'UNSTUFFING', 'PORT_IN', 'RETURN_EMPTY', 'DROP_TRAILER', 'HOOK_TRAILER', 'STREET_TURN'] as const;
export const FEE_CATEGORIES = ['COST_NORM', 'REVENUE_SURCHARGE', 'PASS_THROUGH', 'ON_ROUTE_EXPENSE'] as const;
```

```typescript
// packages/core/lib/db/schema/_helpers.ts
import { char, datetime, decimal } from 'drizzle-orm/mysql-core';
import { sql } from 'drizzle-orm';

export const pk = () => char('id', { length: 36 }).primaryKey();
export const ts = (name: string) => datetime(name, { mode: 'date', fsp: 3 });
export const money = (name: string) => decimal(name, { precision: 18, scale: 2 });
export const currency = () => char('currency', { length: 3 }).default('VND').notNull();
export const timestamps = () => ({
  createdAt: ts('created_at').notNull().default(sql`CURRENT_TIMESTAMP(3)`),
  updatedAt: ts('updated_at').notNull().default(sql`CURRENT_TIMESTAMP(3)`).$onUpdate(() => new Date()),
  createdBy: char('created_by', { length: 36 }),
});
```

```typescript
// packages/core/lib/db/schema/*.ts (gộp lại để đọc)
import { mysqlTable, char, varchar, int, decimal, date, json, mysqlEnum, boolean, index, uniqueIndex, primaryKey, text, bigint } from 'drizzle-orm/mysql-core';
import { pk, ts, money, currency, timestamps } from './_helpers';
import { CONTAINER_TYPES, TRIP_MODES, ROLES, STOP_TYPES, FEE_CATEGORIES } from '@shared/enums';

const tenantId = () => char('tenant_id', { length: 36 }).notNull().references(() => tenants.id);
const ref = (name: string) => char(name, { length: 36 });

// ============ 0. SAAS, IDENTITY, AUDIT [BỔ SUNG] ============
export const tenants = mysqlTable('tenants', {
  id: pk(),
  name: varchar('name', { length: 255 }).notNull(),
  taxCode: varchar('tax_code', { length: 20 }),
  timezone: varchar('timezone', { length: 64 }).default('Asia/Ho_Chi_Minh').notNull(),
  plan: mysqlEnum('plan', ['TRIAL', 'STANDARD', 'PRO']).default('TRIAL').notNull(),
  status: mysqlEnum('status', ['ACTIVE', 'SUSPENDED', 'CLOSED']).default('ACTIVE').notNull(),
  settings: json('settings'), // { costAllocationMethod, numberingFormats, demDetCronHour, ... } – validate bằng zod
  ...timestamps(),
});

export const users = mysqlTable('users', {
  id: pk(),
  email: varchar('email', { length: 255 }),
  phone: varchar('phone', { length: 20 }),
  fullName: varchar('full_name', { length: 255 }).notNull(),
  passwordHash: varchar('password_hash', { length: 255 }),
  isActive: boolean('is_active').default(true).notNull(),
  failedLoginCount: int('failed_login_count').default(0).notNull(), // [BỔ SUNG task 01] sai mật khẩu liên tiếp; 5 lần thì khóa 15 phút
  lockedUntil: ts('locked_until'),                                  // [BỔ SUNG task 01] đang khóa tạm tới thời điểm này (UTC)
  ...timestamps(),
}, (t) => ({ emailUq: uniqueIndex('uq_users_email').on(t.email), phoneUq: uniqueIndex('uq_users_phone').on(t.phone) }));

export const tenantMemberships = mysqlTable('tenant_memberships', {
  id: pk(),
  tenantId: tenantId(),
  userId: ref('user_id').notNull().references(() => users.id),
  role: mysqlEnum('role', ROLES).notNull(),
  lastLoginAt: ts('last_login_at'), // [BỔ SUNG task 01] lần đăng nhập gần nhất vào công ty này; TenantPicker sắp xếp theo cột này
  ...timestamps(),
}, (t) => ({ uq: uniqueIndex('uq_membership').on(t.tenantId, t.userId) }));

export const auditLogs = mysqlTable('audit_logs', {
  id: pk(),
  tenantId: tenantId(),
  actorUserId: ref('actor_user_id'),
  entity: varchar('entity', { length: 50 }).notNull(),   // 'orders', 'fee_tariffs', ...
  entityId: ref('entity_id').notNull(),
  action: varchar('action', { length: 50 }).notNull(),   // CREATE, UPDATE, STATUS_CHANGE, REPRICE, ...
  before: json('before'),
  after: json('after'),
  createdAt: ts('created_at').notNull(),
}, (t) => ({ entityIdx: index('idx_audit_entity').on(t.tenantId, t.entity, t.entityId) }));

export const numberSequences = mysqlTable('number_sequences', {
  tenantId: tenantId(),
  seqKey: varchar('seq_key', { length: 50 }).notNull(), // 'TRIP:2026-10', 'FUEL_VOUCHER:2026', 'INVOICE:2026', 'ORD:EXP:2610'
  lastValue: int('last_value').default(0).notNull(),
}, (t) => ({ pk: primaryKey({ columns: [t.tenantId, t.seqKey] }) }));

export const attachments = mysqlTable('attachments', {
  id: pk(),
  tenantId: tenantId(),
  ownerType: varchar('owner_type', { length: 30 }).notNull(), // ORDER_STOP, ORDER_CONTAINER, FUEL_TX, EXPENSE, INCIDENT
  ownerId: ref('owner_id').notNull(),
  kind: mysqlEnum('kind', ['EIR', 'EPOD', 'SEAL_PHOTO', 'PUMP_METER', 'ODOMETER', 'RECEIPT', 'DAMAGE', 'OTHER']).notNull(),
  storageKey: varchar('storage_key', { length: 500 }).notNull(), // tenants/{tenantId}/...
  sha256: char('sha256', { length: 64 }).notNull(),             // chống nộp lại cùng 1 ảnh
  capturedAt: ts('captured_at'),   // EXIF
  capturedLat: decimal('captured_lat', { precision: 9, scale: 6 }),
  capturedLng: decimal('captured_lng', { precision: 9, scale: 6 }),
  ocrResult: json('ocr_result'),   // { fields, confidence, model, promptVersion }
  ocrStatus: mysqlEnum('ocr_status', ['NONE', 'PENDING', 'MATCHED', 'MISMATCH', 'LOW_CONFIDENCE', 'FAILED']).default('NONE').notNull(),
  ...timestamps(),
}, (t) => ({ ownerIdx: index('idx_attach_owner').on(t.tenantId, t.ownerType, t.ownerId), hashIdx: index('idx_attach_hash').on(t.tenantId, t.sha256) }));

// ============ 1. MASTER DATA ============
export const customers = mysqlTable('customers', {
  id: pk(),
  tenantId: tenantId(),
  code: varchar('code', { length: 50 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  taxCode: varchar('tax_code', { length: 20 }),            // [BỔ SUNG] cho hóa đơn điện tử
  billingAddress: varchar('billing_address', { length: 500 }),
  paymentTermDays: int('payment_term_days').default(30),
  creditLimit: money('credit_limit'),
  ...timestamps(),
  deletedAt: ts('deleted_at'),
}, (t) => ({ codeUq: uniqueIndex('uq_customer_code').on(t.tenantId, t.code) }));

export const shippingLines = mysqlTable('shipping_lines', {   // [BỔ SUNG] thay cho varchar tự do
  id: pk(),
  tenantId: tenantId(),
  code: varchar('code', { length: 20 }).notNull(),         // MSK, ONE, CMA, ...
  name: varchar('name', { length: 255 }).notNull(),
  allowsStreetTurn: boolean('allows_street_turn').default(false).notNull(),
  ...timestamps(),
  deletedAt: ts('deleted_at'),                             // [BỔ SUNG task 02] mọi danh mục xóa mềm
}, (t) => ({ codeUq: uniqueIndex('uq_sl_code').on(t.tenantId, t.code) }));

export const vendors = mysqlTable('vendors', {
  id: pk(),
  tenantId: tenantId(),
  code: varchar('code', { length: 50 }).notNull(),         // [BỔ SUNG task 02] unique theo tenant: uq_vendor_code
  name: varchar('name', { length: 255 }).notNull(),
  taxCode: varchar('tax_code', { length: 20 }),
  type: mysqlEnum('type', ['FUEL_STATION', 'SUB_CONTRACTOR', 'GARAGE', 'PORT', 'DEPOT', 'TIRE_SUPPLIER']).notNull(),
  paymentTermDays: int('payment_term_days').default(30),
  ...timestamps(),
  deletedAt: ts('deleted_at'),
}, (t) => ({ codeUq: uniqueIndex('uq_vendor_code').on(t.tenantId, t.code) }));

export const locations = mysqlTable('locations', {             // [BỔ SUNG] bắt buộc cho geofence
  id: pk(),
  tenantId: tenantId(),
  code: varchar('code', { length: 50 }).notNull(),         // [BỔ SUNG task 02] unique theo tenant: uq_location_code
  type: mysqlEnum('type', ['PORT', 'DEPOT', 'WAREHOUSE', 'FUEL_STATION', 'GARAGE', 'PARKING']).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  address: varchar('address', { length: 500 }),
  customerId: ref('customer_id').references(() => customers.id), // kho của khách nào
  vendorId: ref('vendor_id').references(() => vendors.id),
  lat: decimal('lat', { precision: 9, scale: 6 }).notNull(),
  lng: decimal('lng', { precision: 9, scale: 6 }).notNull(),
  geofenceRadiusM: int('geofence_radius_m').default(300).notNull(),
  zone: varchar('zone', { length: 100 }),                  // dùng để suy ra route
  ...timestamps(),
  deletedAt: ts('deleted_at'),
}, (t) => ({ codeUq: uniqueIndex('uq_location_code').on(t.tenantId, t.code) }));

export const routes = mysqlTable('routes', {
  id: pk(),
  tenantId: tenantId(),
  routeCode: varchar('route_code', { length: 50 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  originZone: varchar('origin_zone', { length: 100 }).notNull(),
  destinationZone: varchar('destination_zone', { length: 100 }).notNull(),
  standardDistanceKm: int('standard_distance_km').notNull(),
  ...timestamps(),
  deletedAt: ts('deleted_at'),
}, (t) => ({ codeUq: uniqueIndex('uq_route_code').on(t.tenantId, t.routeCode) }));

// ============ 2. ĐỘI XE, TÀI XẾ, BẢO DƯỠNG ============
export const tractors = mysqlTable('tractors', {
  id: pk(),
  tenantId: tenantId(),
  plateNumber: varchar('plate_number', { length: 20 }).notNull(),
  model: varchar('model', { length: 100 }),
  ownership: mysqlEnum('ownership', ['OWNED', 'LEASED']).default('OWNED').notNull(),
  fuelNormLitersPer100km: decimal('fuel_norm_liters_per_100km', { precision: 5, scale: 2 }).notNull(), // định mức cơ sở, chi tiết ở fuel_norms
  currentOdometer: int('current_odometer').default(0).notNull(),
  odometerUpdatedAt: ts('odometer_updated_at'),
  nextMaintenanceOdometer: int('next_maintenance_odometer'),
  registrationExpiry: date('registration_expiry'),   // [BỔ SUNG] hạn đăng kiểm
  insuranceExpiry: date('insurance_expiry'),         // [BỔ SUNG]
  transportBadgeExpiry: date('transport_badge_expiry'), // [BỔ SUNG] phù hiệu xe container
  permittedGrossWeightTons: decimal('permitted_gross_weight_tons', { precision: 6, scale: 2 }), // khối lượng toàn bộ cho phép kéo theo (giấy kiểm định)
  gpsDeviceId: ref('gps_device_id'),
  status: mysqlEnum('status', ['AVAILABLE', 'IN_USE', 'MAINTENANCE', 'INACTIVE']).default('AVAILABLE').notNull(),
  version: int('version').default(0).notNull(),
  ...timestamps(),
  deletedAt: ts('deleted_at'),
}, (t) => ({ plateUq: uniqueIndex('uq_tractor_plate').on(t.tenantId, t.plateNumber) }));

export const trailers = mysqlTable('trailers', {
  id: pk(),
  tenantId: tenantId(),
  plateNumber: varchar('plate_number', { length: 20 }).notNull(),
  trailerType: mysqlEnum('trailer_type', ['20FT', '40FT', '40FT_COMBO', '45FT']).notNull(), // [SỬA] bỏ REFRIGERATED (lạnh là thuộc tính container); 40FT_COMBO = khung chở được 2x20
  canCarryTwin20: boolean('can_carry_twin_20').default(false).notNull(), // [BỔ SUNG] có chốt giữa cho 2 cont 20
  hasGensetPower: boolean('has_genset_power').default(false).notNull(), // [BỔ SUNG] chạy cont lạnh
  tareWeightTons: decimal('tare_weight_tons', { precision: 5, scale: 2 }),
  maxPayloadTons: decimal('max_payload_tons', { precision: 5, scale: 2 }).notNull(),
  inspectionExpiry: date('inspection_expiry'),
  currentLocationId: ref('current_location_id').references(() => locations.id), // [SỬA] thay varchar
  currentLocationNote: varchar('current_location_note', { length: 255 }),
  status: mysqlEnum('status', ['AVAILABLE', 'IN_USE', 'DROPPED', 'MAINTENANCE', 'INACTIVE']).default('AVAILABLE').notNull(),
  version: int('version').default(0).notNull(),
  ...timestamps(),
  deletedAt: ts('deleted_at'),
}, (t) => ({ plateUq: uniqueIndex('uq_trailer_plate').on(t.tenantId, t.plateNumber) }));

export const drivers = mysqlTable('drivers', {
  id: pk(),
  tenantId: tenantId(),
  userId: ref('user_id').references(() => users.id),   // [BỔ SUNG] tài khoản đăng nhập app
  fullName: varchar('full_name', { length: 255 }).notNull(),
  phone: varchar('phone', { length: 20 }).notNull(),
  nationalIdNo: varchar('national_id_no', { length: 20 }),
  licenseNo: varchar('license_no', { length: 20 }),
  licenseClass: varchar('license_class', { length: 10 }), // hạng GPLX được kéo rơ moóc theo quy định hiện hành
  licenseExpiry: date('license_expiry'),
  employmentType: mysqlEnum('employment_type', ['FULL_TIME', 'CONTRACT']).default('FULL_TIME').notNull(),
  status: mysqlEnum('status', ['AVAILABLE', 'ON_DUTY', 'OFF_DUTY', 'INACTIVE']).default('AVAILABLE').notNull(),
  version: int('version').default(0).notNull(),
  ...timestamps(),
  deletedAt: ts('deleted_at'),
});

export const maintenancePlans = mysqlTable('maintenance_plans', {   // [BỔ SUNG]
  id: pk(),
  tenantId: tenantId(),
  tractorId: ref('tractor_id').references(() => tractors.id),
  trailerId: ref('trailer_id').references(() => trailers.id),
  taskCode: varchar('task_code', { length: 50 }).notNull(), // OIL_CHANGE, BRAKE, TIRE_ROTATION...
  intervalKm: int('interval_km'),
  intervalDays: int('interval_days'),
  lastDoneOdometer: int('last_done_odometer'),
  lastDoneAt: date('last_done_at'),
  ...timestamps(),
});

export const maintenanceOrders = mysqlTable('maintenance_orders', {  // [BỔ SUNG]
  id: pk(),
  tenantId: tenantId(),
  tractorId: ref('tractor_id').references(() => tractors.id),
  trailerId: ref('trailer_id').references(() => trailers.id),
  vendorId: ref('vendor_id').references(() => vendors.id), // garage
  type: mysqlEnum('type', ['SCHEDULED', 'BREAKDOWN', 'TIRE']).notNull(),
  odometerAt: int('odometer_at'),
  plannedStart: ts('planned_start'),
  plannedEnd: ts('planned_end'),   // dùng để chặn điều xe trong khoảng này
  cost: money('cost'),
  currency: currency(),
  status: mysqlEnum('status', ['PLANNED', 'IN_PROGRESS', 'DONE', 'CANCELLED']).default('PLANNED').notNull(),
  ...timestamps(),
});

export const tires = mysqlTable('tires', {   // [BỔ SUNG] tối giản
  id: pk(),
  tenantId: tenantId(),
  serialNo: varchar('serial_no', { length: 50 }).notNull(),
  mountedOnTractorId: ref('mounted_on_tractor_id').references(() => tractors.id),
  mountedOnTrailerId: ref('mounted_on_trailer_id').references(() => trailers.id),
  position: varchar('position', { length: 20 }),
  mountedOdometer: int('mounted_odometer'),
  status: mysqlEnum('status', ['IN_STOCK', 'MOUNTED', 'RETREAD', 'SCRAPPED']).default('IN_STOCK').notNull(),
  ...timestamps(),
}, (t) => ({ serialUq: uniqueIndex('uq_tire_serial').on(t.tenantId, t.serialNo) }));

// ============ 3. GPS [BỔ SUNG – bản gốc nhắc gps_logs nhưng chưa có schema] ============
export const gpsDevices = mysqlTable('gps_devices', {
  id: pk(),
  tenantId: tenantId(),
  provider: varchar('provider', { length: 50 }).notNull(),  // nhà cung cấp hộp đen hoặc 'DIRECT'
  externalId: varchar('external_id', { length: 64 }).notNull(), // IMEI / mã thiết bị bên cung cấp
  apiKeyHash: varchar('api_key_hash', { length: 255 }),
  tractorId: ref('tractor_id').references(() => tractors.id),
  isActive: boolean('is_active').default(true).notNull(),
  ...timestamps(),
}, (t) => ({ extUq: uniqueIndex('uq_gps_device').on(t.provider, t.externalId) }));

// gps_logs: tạo bằng migration SQL thủ công vì cần PARTITION BY RANGE (Drizzle chỉ dùng để query).
// PK phải chứa cột partition: PRIMARY KEY (tenant_id, tractor_id, recorded_at). Không FK.
export const gpsLogs = mysqlTable('gps_logs', {
  tenantId: char('tenant_id', { length: 36 }).notNull(),
  tractorId: char('tractor_id', { length: 36 }).notNull(),
  recordedAt: ts('recorded_at').notNull(),       // thời gian thiết bị (UTC)
  receivedAt: ts('received_at').notNull(),       // thời gian server nhận
  lat: decimal('lat', { precision: 9, scale: 6 }).notNull(),
  lng: decimal('lng', { precision: 9, scale: 6 }).notNull(),
  speedKmh: int('speed_kmh'),
  heading: int('heading'),
  ignitionOn: boolean('ignition_on'),
  deviceOdometerKm: int('device_odometer_km'),
}, (t) => ({ pk: primaryKey({ columns: [t.tenantId, t.tractorId, t.recordedAt] }) }));

// ============ 4. BẢNG GIÁ, BẢNG PHÍ 4 CHIỀU & ĐỊNH MỨC DẦU ============
export const freightTariffs = mysqlTable('freight_tariffs', {
  id: pk(),
  tenantId: tenantId(),
  routeId: ref('route_id').notNull().references(() => routes.id),
  containerType: mysqlEnum('container_type', CONTAINER_TYPES).notNull(),
  tripMode: mysqlEnum('trip_mode', TRIP_MODES).default('SINGLE').notNull(),
  customerId: ref('customer_id').references(() => customers.id), // NULL = Giá chung
  basePrice: money('base_price').notNull(),
  currency: currency(),
  vatRatePercent: decimal('vat_rate_percent', { precision: 5, scale: 2 }).notNull(), // [BỔ SUNG]
  validFrom: date('valid_from').notNull(),
  validTo: date('valid_to'),           // NULL = vô thời hạn
  isActive: boolean('is_active').default(true).notNull(),
  ...timestamps(),
}, (t) => ({
  lookupIdx: index('idx_freight_4d').on(t.tenantId, t.routeId, t.containerType, t.tripMode, t.customerId, t.validFrom),
}));

export const feeTariffs = mysqlTable('fee_tariffs', {
  id: pk(),
  tenantId: tenantId(),
  routeId: ref('route_id').references(() => routes.id),  // [SỬA] cho phép NULL = áp mọi tuyến (VD phí nâng hạ theo cảng)
  containerType: mysqlEnum('container_type', CONTAINER_TYPES).notNull(),
  tripMode: mysqlEnum('trip_mode', TRIP_MODES).default('SINGLE').notNull(),
  customerId: ref('customer_id').references(() => customers.id), // NULL = Phí chung
  feeCategory: mysqlEnum('fee_category', ['COST_NORM', 'REVENUE_SURCHARGE', 'PASS_THROUGH']).notNull(),
  feeCode: varchar('fee_code', { length: 50 }).notNull(), // DRIVER_SALARY, TOLL_FEE, LIFT_FEE, STREET_TURN_FEE...
  feeName: varchar('fee_name', { length: 255 }).notNull(),
  calcBasis: mysqlEnum('calc_basis', ['PER_TRIP', 'PER_CONTAINER', 'PER_DAY', 'PER_KM']).default('PER_TRIP').notNull(), // [BỔ SUNG]
  amount: money('amount').notNull(),
  currency: currency(),
  vatRatePercent: decimal('vat_rate_percent', { precision: 5, scale: 2 }),
  isExcluded: boolean('is_excluded').default(false).notNull(), // [BỔ SUNG] khách riêng được MIỄN mã phí này
  validFrom: date('valid_from').notNull(),
  validTo: date('valid_to'),
  isActive: boolean('is_active').default(true).notNull(),
  ...timestamps(),
  // [SỬA] Bỏ fuelNormAdjustmentPercent khỏi bảng phí – chuyển sang fuel_norms.
}, (t) => ({
  feeLookupIdx: index('idx_fee_4d').on(t.tenantId, t.routeId, t.containerType, t.tripMode, t.customerId, t.feeCode, t.validFrom),
}));

export const demDetTariffs = mysqlTable('dem_det_tariffs', {   // [BỔ SUNG] biểu phí lũy tiến theo ngày
  id: pk(),
  tenantId: tenantId(),
  shippingLineId: ref('shipping_line_id').references(() => shippingLines.id),
  chargeType: mysqlEnum('charge_type', ['DEM', 'DET', 'STORAGE']).notNull(),
  containerType: mysqlEnum('container_type', CONTAINER_TYPES).notNull(),
  fromDay: int('from_day').notNull(),   // ngày thứ N sau free time
  toDay: int('to_day'),
  ratePerDay: money('rate_per_day').notNull(),
  currency: currency(),
  validFrom: date('valid_from').notNull(),
  validTo: date('valid_to'),
  ...timestamps(),
});

export const fuelNorms = mysqlTable('fuel_norms', {   // [BỔ SUNG] định mức theo trạng thái tải
  id: pk(),
  tenantId: tenantId(),
  tractorId: ref('tractor_id').references(() => tractors.id), // NULL = áp theo model
  tractorModel: varchar('tractor_model', { length: 100 }),
  loadState: mysqlEnum('load_state', ['EMPTY_RUN', 'LOADED_20', 'LOADED_40', 'TWIN_20']).notNull(),
  litersPer100km: decimal('liters_per_100km', { precision: 5, scale: 2 }).notNull(),
  validFrom: date('valid_from').notNull(),
  validTo: date('valid_to'),
  ...timestamps(),
});

// ============ 5. ĐƠN HÀNG (NHIỀU CONTAINER), CHẶNG & CHUYẾN ============
// [SỬA theo PO 16/10] 1 Order = 1 Booking/B/L của khách và chứa NHIỀU container.
// Phần chung nằm ở `orders`; mọi thứ gắn với từng vỏ cont nằm ở `order_containers`.
export const orders = mysqlTable('orders', {
  id: pk(),
  tenantId: tenantId(),
  orderNo: varchar('order_no', { length: 30 }).notNull(),
  customerId: ref('customer_id').notNull().references(() => customers.id),
  orderType: mysqlEnum('order_type', ['IMPORT', 'EXPORT', 'DOMESTIC']).notNull(),
  bookingOrBlNo: varchar('booking_or_bl_no', { length: 50 }).notNull(),
  shippingLineId: ref('shipping_line_id').references(() => shippingLines.id), // [SỬA] thay varchar tự do
  vesselVoyage: varchar('vessel_voyage', { length: 100 }),
  eta: ts('eta'),
  etd: ts('etd'),
  cutOffAt: ts('cut_off_at'),   // [BỔ SUNG] hàng Xuất
  customerRef: varchar('customer_ref', { length: 100 }),
  routeId: ref('route_id').notNull().references(() => routes.id), // tuyến mặc định, container có thể ghi đè
  cargoDescription: varchar('cargo_description', { length: 255 }),
  // Tổng hợp từ order_containers (cập nhật trong cùng transaction khi container thay đổi)
  containerCount: int('container_count').default(0).notNull(),
  totalFreightAmount: money('total_freight_amount').default('0.00').notNull(),
  totalSurchargeAmount: money('total_surcharge_amount').default('0.00').notNull(),
  totalPassThroughAmount: money('total_pass_through_amount').default('0.00').notNull(),
  totalAllocatedCostAmount: money('total_allocated_cost_amount').default('0.00').notNull(),
  currency: currency(),
  isEpodVerified: boolean('is_epod_verified').default(false).notNull(), // = mọi container chưa hủy đều đã xác nhận ePOD
  status: mysqlEnum('status', ['DRAFT', 'CONFIRMED', 'IN_PROGRESS', 'PARTIALLY_DELIVERED', 'DELIVERED', 'RECONCILED', 'INVOICED', 'CANCELLED']).default('DRAFT').notNull(), // [SỬA]
  cancelReason: varchar('cancel_reason', { length: 255 }),
  version: int('version').default(0).notNull(),
  ...timestamps(),
}, (t) => ({
  noUq: uniqueIndex('uq_order_no').on(t.tenantId, t.orderNo),
  bkIdx: index('idx_order_booking').on(t.tenantId, t.bookingOrBlNo),
  statusIdx: index('idx_order_status').on(t.tenantId, t.status),
}));

export const orderContainers = mysqlTable('order_containers', {   // [BỔ SUNG] từng vỏ cont của Order
  id: pk(),
  tenantId: tenantId(),
  orderId: ref('order_id').notNull().references(() => orders.id),
  lineNo: int('line_no').notNull(),                         // thứ tự cont trong Order: 1, 2, 3...
  routeId: ref('route_id').notNull().references(() => routes.id), // copy từ Order, cho phép ghi đè (VD cont giao kho khác)
  containerNo: varchar('container_no', { length: 11 }),     // ISO 6346, kiểm tra check digit; hàng Xuất có thể chưa có
  sealNo: varchar('seal_no', { length: 20 }),
  containerType: mysqlEnum('container_type', CONTAINER_TYPES).notNull(),
  cargoWeightTons: decimal('cargo_weight_tons', { precision: 6, scale: 2 }),
  vgmTons: decimal('vgm_tons', { precision: 6, scale: 2 }),          // [BỔ SUNG] tổng khối lượng cont đã đóng hàng
  isDangerousGoods: boolean('is_dangerous_goods').default(false).notNull(),
  dgClass: varchar('dg_class', { length: 10 }),
  reeferSetpointC: decimal('reefer_setpoint_c', { precision: 4, scale: 1 }),
  releaseRefNo: varchar('release_ref_no', { length: 50 }),   // số EDO / lệnh cấp rỗng
  portReadinessStatus: mysqlEnum('port_readiness', ['PENDING', 'READY_EDO', 'READY_EMPTY_RELEASE', 'HOLD_CUSTOMS', 'HOLD_LINE']).default('PENDING').notNull(), // theo từng cont (hải quan có thể giữ riêng 1 cont)
  appliedTripMode: mysqlEnum('applied_trip_mode', TRIP_MODES).default('SINGLE').notNull(),
  linkedContainerId: ref('linked_container_id'), // [SỬA] Street Turn liên kết cont Nhập ↔ cont Xuất (thay linkedOrderId)
  streetTurnApprovalRef: varchar('street_turn_approval_ref', { length: 50 }),
  demFreeUntil: ts('dem_free_until'),    // [SỬA] tách khỏi freeTimeEnd, tính theo từng cont
  detFreeUntil: ts('det_free_until'),
  storageFreeUntil: ts('storage_free_until'),
  baseFreightAmount: money('base_freight_amount').default('0.00').notNull(), // giá cước snapshot của cont này
  freightTariffId: ref('freight_tariff_id'),      // truy vết snapshot
  isManualPrice: boolean('is_manual_price').default(false).notNull(),
  repriceRequired: boolean('reprice_required').default(false).notNull(), // xem file 06 mục 4
  allocatedCostAmount: money('allocated_cost_amount').default('0.00').notNull(),
  isEpodVerified: boolean('is_epod_verified').default(false).notNull(),
  epodVerifiedBy: ref('epod_verified_by'),
  epodVerifiedAt: ts('epod_verified_at'),
  status: mysqlEnum('status', ['PENDING', 'PLANNED', 'IN_PROGRESS', 'DELIVERED', 'COMPLETED', 'CANCELLED']).default('PENDING').notNull(),
  cancelReason: varchar('cancel_reason', { length: 255 }),
  version: int('version').default(0).notNull(),
  ...timestamps(),
}, (t) => ({
  lineUq: uniqueIndex('uq_order_container_line').on(t.orderId, t.lineNo),
  orderIdx: index('idx_oc_order').on(t.tenantId, t.orderId),
  contIdx: index('idx_oc_container_no').on(t.tenantId, t.containerNo),
  detIdx: index('idx_oc_det').on(t.tenantId, t.detFreeUntil),
}));

export const consolidatedTrips = mysqlTable('consolidated_trips', {
  id: pk(),
  tenantId: tenantId(),
  tripCode: varchar('trip_code', { length: 50 }).notNull(),
  tripMode: mysqlEnum('trip_mode', TRIP_MODES).default('SINGLE').notNull(),
  routeId: ref('route_id').notNull().references(() => routes.id),
  plannedStart: ts('planned_start').notNull(),   // [BỔ SUNG]
  plannedEnd: ts('planned_end').notNull(),
  actualStart: ts('actual_start'),
  actualEnd: ts('actual_end'),
  // Tài nguyên kế hoạch chính – CHỈ để hiển thị, nguồn sự thật là dispatch_assignments (ADR-004)
  primaryDriverId: ref('primary_driver_id'),
  primaryTractorId: ref('primary_tractor_id'),
  primaryTrailerId: ref('primary_trailer_id'),
  totalCostNorm: money('total_cost_norm').default('0.00').notNull(),   // [SỬA] gộp tất cả COST_NORM, chi tiết ở trip_costs
  totalActualCost: money('total_actual_cost').default('0.00').notNull(),
  allocationMethod: mysqlEnum('allocation_method', ['COST_NORM_RATIO', 'REVENUE_RATIO', 'EQUAL', 'DISTANCE_RATIO', 'MANUAL']).default('COST_NORM_RATIO').notNull(), // [SỬA] MANUAL = kế toán đã sửa tay
  allocationAdjustedBy: ref('allocation_adjusted_by'),
  allocationAdjustedAt: ts('allocation_adjusted_at'),
  costLockedAt: ts('cost_locked_at'),
  status: mysqlEnum('status', ['PLANNED', 'DISPATCHED', 'IN_TRANSIT', 'COMPLETED', 'CANCELLED']).default('PLANNED').notNull(),
  version: int('version').default(0).notNull(),
  ...timestamps(),
}, (t) => ({ codeUq: uniqueIndex('uq_trip_code').on(t.tenantId, t.tripCode) }));

export const tripContainers = mysqlTable('trip_containers', {   // [SỬA] thay trip_orders: chuyến chở cont nào
  tenantId: tenantId(),
  tripId: ref('trip_id').notNull().references(() => consolidatedTrips.id),
  orderContainerId: ref('order_container_id').notNull().references(() => orderContainers.id),
  orderId: ref('order_id').notNull().references(() => orders.id),   // denormalize để báo cáo theo Order
  systemRatio: decimal('system_ratio', { precision: 9, scale: 6 }),      // tỷ lệ hệ thống tính theo định mức
  systemAmount: money('system_amount'),                                 // số hệ thống đề xuất (giữ lại để so sánh)
  allocationRatio: decimal('allocation_ratio', { precision: 9, scale: 6 }), // tỷ lệ đang áp dụng
  allocatedAmount: money('allocated_amount'),                           // số đang áp dụng (= system hoặc do kế toán sửa)
  isManualOverride: boolean('is_manual_override').default(false).notNull(),
  overrideReason: varchar('override_reason', { length: 255 }),
}, (t) => ({
  pk: primaryKey({ columns: [t.tripId, t.orderContainerId] }),
  ocIdx: index('idx_trip_containers_oc').on(t.tenantId, t.orderContainerId),
  orderIdx: index('idx_trip_containers_order').on(t.tenantId, t.orderId),
}));

// [BỔ SUNG task 04] Chuỗi Stop chuẩn của đơn DOMESTIC theo tuyến (spec chưa có nơi lưu "cấu hình theo tuyến").
// Đơn IMPORT/EXPORT dùng chuỗi chuẩn trong code (packages/core/modules/orders/stops.ts); tuyến chưa có mẫu thì không tạo được đơn DOMESTIC.
export const routeStopTemplates = mysqlTable('route_stop_templates', {
  id: pk(),
  tenantId: tenantId(),
  routeId: ref('route_id').notNull().references(() => routes.id),
  sequenceNo: int('sequence_no').notNull(),
  stopType: mysqlEnum('stop_type', STOP_TYPES).notNull(),
  ...timestamps(),
}, (t) => ({ seqUq: uniqueIndex('uq_route_stop_seq').on(t.routeId, t.sequenceNo) }));

export const orderStops = mysqlTable('order_stops', {
  id: pk(),
  tenantId: tenantId(),
  orderId: ref('order_id').notNull().references(() => orders.id),
  orderContainerId: ref('order_container_id').notNull().references(() => orderContainers.id), // [SỬA] chặng thuộc từng cont
  sequenceNo: int('sequence_no').notNull(),
  stopType: mysqlEnum('stop_type', STOP_TYPES).notNull(),
  locationId: ref('location_id').references(() => locations.id),   // [SỬA] thay locationName tự do
  locationName: varchar('location_name', { length: 255 }).notNull(),   // giữ làm snapshot hiển thị
  windowStart: ts('window_start'),   // [BỔ SUNG] khung giờ khách hẹn
  deadlineTime: ts('deadline_time'),
  arrivedAt: ts('arrived_at'),       // [BỔ SUNG] tách các mốc thời gian
  departedAt: ts('departed_at'),
  occurredAt: ts('occurred_at'), // Thời gian thực tế tại thiết bị (Offline-safe) của lần hoàn tất
  syncedAt: ts('synced_at'),     // Thời gian đồng bộ lên Server
  timeSource: mysqlEnum('time_source', ['DEVICE', 'GEOFENCE', 'MANUAL']),   // [BỔ SUNG]
  requiresProof: boolean('requires_proof').default(false).notNull(),        // [BỔ SUNG] stop nào bắt buộc chứng từ
  isAiVerified: boolean('is_ai_verified').default(false).notNull(),
  isHumanVerified: boolean('is_human_verified').default(false).notNull(),   // [BỔ SUNG]
  // [SỬA] Ảnh chứng từ chuyển sang bảng attachments (owner_type = 'ORDER_STOP')
  status: mysqlEnum('status', ['PENDING', 'ARRIVED', 'COMPLETED', 'SKIPPED']).default('PENDING').notNull(),
  ...timestamps(),
}, (t) => ({ seqUq: uniqueIndex('uq_stop_seq').on(t.orderContainerId, t.sequenceNo) }));

export const dispatchAssignments = mysqlTable('dispatch_assignments', {
  id: pk(),
  tenantId: tenantId(),
  consolidatedTripId: ref('consolidated_trip_id').references(() => consolidatedTrips.id),
  stopId: ref('stop_id').notNull().references(() => orderStops.id),
  assignmentType: mysqlEnum('assignment_type', ['INTERNAL_FLEET', 'SUB_CONTRACTOR']).default('INTERNAL_FLEET').notNull(),
  driverId: ref('driver_id').references(() => drivers.id),
  tractorId: ref('tractor_id').references(() => tractors.id),
  trailerId: ref('trailer_id').references(() => trailers.id),
  subcontractorVendorId: ref('subcontractor_vendor_id').references(() => vendors.id),
  subcontractorDriverName: varchar('subcontractor_driver_name', { length: 255 }),  // [BỔ SUNG] cần cho cổng cảng
  subcontractorPlate: varchar('subcontractor_plate', { length: 20 }),
  agreedSubcontractCost: money('agreed_subcontract_cost'),
  plannedStart: ts('planned_start').notNull(),   // [BỔ SUNG] dùng kiểm tra chồng lấn
  plannedEnd: ts('planned_end').notNull(),
  completionPercentage: int('completion_percentage').default(100).notNull(), // Dùng khi cứu hộ chia lương dọc đường
  replacesAssignmentId: ref('replaces_assignment_id'),   // [BỔ SUNG] trỏ về assignment bị ABORTED
  status: mysqlEnum('status', ['ASSIGNED', 'IN_TRANSIT', 'COMPLETED', 'ABORTED_MIDWAY', 'RESCUE_ASSIGNED', 'CANCELLED']).default('ASSIGNED').notNull(),
  dispatchedAt: ts('dispatched_at').notNull(),
  version: int('version').default(0).notNull(),
  ...timestamps(),
}, (t) => ({
  driverTimeIdx: index('idx_assign_driver_time').on(t.tenantId, t.driverId, t.plannedStart, t.plannedEnd),
  tractorTimeIdx: index('idx_assign_tractor_time').on(t.tenantId, t.tractorId, t.plannedStart, t.plannedEnd),
  trailerTimeIdx: index('idx_assign_trailer_time').on(t.tenantId, t.trailerId, t.plannedStart, t.plannedEnd),
}));

export const incidents = mysqlTable('incidents', {   // [BỔ SUNG] sự cố: hỏng xe, tai nạn, hư hỏng cont, bị phạt
  id: pk(),
  tenantId: tenantId(),
  type: mysqlEnum('type', ['BREAKDOWN', 'ACCIDENT', 'CONTAINER_DAMAGE', 'TRAFFIC_FINE', 'CARGO_CLAIM', 'OTHER']).notNull(),
  assignmentId: ref('assignment_id').references(() => dispatchAssignments.id),
  orderId: ref('order_id').references(() => orders.id),
  orderContainerId: ref('order_container_id').references(() => orderContainers.id), // [SỬA] cont cụ thể (nếu có)
  driverId: ref('driver_id').references(() => drivers.id),
  tractorId: ref('tractor_id').references(() => tractors.id),
  occurredAt: ts('occurred_at').notNull(),
  lat: decimal('lat', { precision: 9, scale: 6 }),
  lng: decimal('lng', { precision: 9, scale: 6 }),
  description: text('description'),
  costAmount: money('cost_amount'),
  chargeTo: mysqlEnum('charge_to', ['COMPANY', 'DRIVER', 'CUSTOMER', 'INSURANCE']),
  status: mysqlEnum('status', ['OPEN', 'RESOLVED']).default('OPEN').notNull(),
  ...timestamps(),
});

// ============ 6. PHÍ, CHI PHÍ, DẦU ============
export const orderFees = mysqlTable('order_fees', {
  id: pk(),
  tenantId: tenantId(),
  orderId: ref('order_id').notNull().references(() => orders.id),
  orderContainerId: ref('order_container_id').references(() => orderContainers.id), // [SỬA] NULL = phí cấp Order (VD phí chứng từ cả lô), có giá trị = phí của 1 cont
  feeCategory: mysqlEnum('fee_category', ['REVENUE_SURCHARGE', 'PASS_THROUGH']).notNull(), // [SỬA] chỉ phí thu khách; chi phí chuyển sang trip_costs
  feeCode: varchar('fee_code', { length: 50 }).notNull(),
  source: mysqlEnum('source', ['TARIFF', 'DEM_DET_JOB', 'MANUAL', 'EXPENSE_REBILL']).notNull(), // [BỔ SUNG]
  sourceTariffId: ref('source_tariff_id'),
  sourceRefId: ref('source_ref_id'),     // VD trip_expenses.id khi chi hộ
  idempotencyKey: varchar('idempotency_key', { length: 100 }),   // VD 'DET:{orderContainerId}:{yyyy-mm-dd}'
  quantity: decimal('quantity', { precision: 10, scale: 2 }).default('1').notNull(),
  amount: money('amount').notNull(),
  currency: currency(),
  vatRatePercent: decimal('vat_rate_percent', { precision: 5, scale: 2 }),
  isApproved: boolean('is_approved').default(false).notNull(),
  approvedBy: ref('approved_by'),
  invoiceId: ref('invoice_id'),
  reversalOfId: ref('reversal_of_id'),   // ADR-009
  ...timestamps(),
}, (t) => ({ idemUq: uniqueIndex('uq_order_fee_idem').on(t.tenantId, t.idempotencyKey) }));

export const tripCosts = mysqlTable('trip_costs', {   // [BỔ SUNG] chi phí theo chuyến (định mức + thực tế)
  id: pk(),
  tenantId: tenantId(),
  tripId: ref('trip_id').notNull().references(() => consolidatedTrips.id),
  costType: mysqlEnum('cost_type', ['NORM', 'ACTUAL']).notNull(),
  feeCode: varchar('fee_code', { length: 50 }).notNull(),   // DRIVER_SALARY, TOLL_FEE, FUEL, SUBCONTRACT, RESCUE...
  amount: money('amount').notNull(),
  currency: currency(),
  sourceTariffId: ref('source_tariff_id'),
  sourceRefId: ref('source_ref_id'),
  ...timestamps(),
});

export const tripExpenses = mysqlTable('trip_expenses', {   // [BỔ SUNG] chi phí dọc đường tài xế khai
  id: pk(),
  tenantId: tenantId(),
  clientEventId: char('client_event_id', { length: 36 }).notNull(),
  tripId: ref('trip_id').references(() => consolidatedTrips.id),
  orderId: ref('order_id').references(() => orders.id),
  orderContainerId: ref('order_container_id').references(() => orderContainers.id),
  driverId: ref('driver_id').notNull().references(() => drivers.id),
  expenseCode: varchar('expense_code', { length: 50 }).notNull(),   // LIFT_ON, LIFT_OFF, TOLL_CASH, PARKING, CONTAINER_DEPOSIT, REPAIR...
  amount: money('amount').notNull(),
  currency: currency(),
  paidBy: mysqlEnum('paid_by', ['DRIVER_CASH', 'COMPANY_CARD', 'ADVANCE']).notNull(),
  isRebillable: boolean('is_rebillable').default(false).notNull(),  // chi hộ → sinh order_fees PASS_THROUGH
  hasVatInvoice: boolean('has_vat_invoice').default(false).notNull(),
  status: mysqlEnum('status', ['SUBMITTED', 'APPROVED', 'REJECTED']).default('SUBMITTED').notNull(),
  approvedBy: ref('approved_by'),
  rejectReason: varchar('reject_reason', { length: 255 }),
  ...timestamps(),
}, (t) => ({ ceUq: uniqueIndex('uq_expense_client_event').on(t.tenantId, t.clientEventId) }));

export const fuelTransactions = mysqlTable('fuel_transactions', {
  id: pk(),
  tenantId: tenantId(),
  tractorId: ref('tractor_id').notNull().references(() => tractors.id),
  driverId: ref('driver_id').notNull().references(() => drivers.id),
  vendorId: ref('vendor_id').notNull().references(() => vendors.id), // Cây xăng hợp đồng
  consolidatedTripId: ref('consolidated_trip_id').references(() => consolidatedTrips.id),
  voucherCode: varchar('voucher_code', { length: 50 }).notNull(),
  maxVolumeLiters: decimal('max_volume_liters', { precision: 10, scale: 2 }).notNull(), // [BỔ SUNG] hạn mức phiếu
  voucherExpiresAt: ts('voucher_expires_at').notNull(),
  // [SỬA] Các cột thực tế cho phép NULL khi phiếu mới phát hành
  volumeLiters: decimal('volume_liters', { precision: 10, scale: 2 }),
  pricePerLiter: decimal('price_per_liter', { precision: 10, scale: 2 }), // Snapshot giá tại lúc bơm
  totalAmount: money('total_amount'),
  currency: currency(),
  odometerReading: int('odometer_reading'),
  isFullTank: boolean('is_full_tank').default(true).notNull(),   // [BỔ SUNG] cần cho thuật toán full-to-full
  fueledAt: ts('fueled_at'),
  clientEventId: char('client_event_id', { length: 36 }),
  calculatedConsumptionPer100Km: decimal('calc_consumption_per_100km', { precision: 6, scale: 2 }),
  allowedConsumptionPer100Km: decimal('allowed_consumption_per_100km', { precision: 6, scale: 2 }),
  gpsDistanceKm: decimal('gps_distance_km', { precision: 10, scale: 2 }),   // [BỔ SUNG] đối chiếu chéo
  isOverNormWarning: boolean('is_over_norm_warning').default(false).notNull(),
  anomalyFlags: json('anomaly_flags'), // ['ODOMETER_ROLLBACK','OVER_TANK_CAPACITY','GPS_DISTANCE_MISMATCH',...]
  // [SỬA] Ảnh chuyển sang attachments (owner_type = 'FUEL_TX')
  status: mysqlEnum('status', ['VOUCHER_ISSUED', 'FUELED', 'APPROVED', 'RECONCILED', 'VOIDED', 'EXPIRED']).default('VOUCHER_ISSUED').notNull(),
  vendorStatementRef: varchar('vendor_statement_ref', { length: 50 }),
  ...timestamps(),
}, (t) => ({
  voucherUq: uniqueIndex('uq_fuel_voucher').on(t.tenantId, t.voucherCode),
  tractorTimeIdx: index('idx_fuel_tractor_time').on(t.tenantId, t.tractorId, t.fueledAt),
}));

// ============ 7. TÀI CHÍNH: SỔ CÁI TÀI XẾ, KỲ, HÓA ĐƠN, CÔNG NỢ [BỔ SUNG] ============
export const accountingPeriods = mysqlTable('accounting_periods', {
  id: pk(),
  tenantId: tenantId(),
  period: char('period', { length: 7 }).notNull(),  // '2026-10'
  status: mysqlEnum('status', ['OPEN', 'CLOSED']).default('OPEN').notNull(),
  closedBy: ref('closed_by'),
  closedAt: ts('closed_at'),
}, (t) => ({ uq: uniqueIndex('uq_period').on(t.tenantId, t.period) }));

export const payrollPeriods = mysqlTable('payroll_periods', {
  id: pk(),
  tenantId: tenantId(),
  periodStart: date('period_start').notNull(),
  periodEnd: date('period_end').notNull(),
  status: mysqlEnum('status', ['OPEN', 'CALCULATED', 'APPROVED', 'PAID']).default('OPEN').notNull(),
  ...timestamps(),
});

export const driverLedger = mysqlTable('driver_ledger', {
  id: pk(),
  tenantId: tenantId(),
  driverId: ref('driver_id').notNull().references(() => drivers.id),
  payrollPeriodId: ref('payroll_period_id').references(() => payrollPeriods.id),  // [BỔ SUNG]
  transactionType: mysqlEnum('transaction_type', ['TRIP_SALARY', 'ALLOWANCE', 'CASH_ADVANCE', 'ADVANCE_SETTLEMENT', 'ON_ROUTE_REIMBURSEMENT', 'PENALTY', 'PAYOUT', 'REVERSAL']).notNull(),
  amount: money('amount').notNull(), // Dương (+) công ty nợ tài xế, Âm (-) tài xế nợ công ty
  currency: currency(),
  referenceType: varchar('reference_type', { length: 30 }),   // [BỔ SUNG] ASSIGNMENT, TRIP_EXPENSE, INCIDENT, PAYOUT...
  referenceId: ref('reference_id'),
  reversalOfId: ref('reversal_of_id'),
  note: varchar('note', { length: 255 }),
  createdAt: ts('created_at').notNull(),
  createdBy: ref('created_by'),
  // Không có updatedAt: bảng append-only (ADR-009)
}, (t) => ({ driverIdx: index('idx_ledger_driver').on(t.tenantId, t.driverId, t.createdAt) }));

export const invoices = mysqlTable('invoices', {
  id: pk(),
  tenantId: tenantId(),
  customerId: ref('customer_id').notNull().references(() => customers.id),
  invoiceNo: varchar('invoice_no', { length: 30 }),
  einvoiceProvider: varchar('einvoice_provider', { length: 30 }),
  einvoiceLookupCode: varchar('einvoice_lookup_code', { length: 100 }),
  issueDate: date('issue_date'),
  dueDate: date('due_date'),
  subtotal: money('subtotal').notNull(),
  vatAmount: money('vat_amount').notNull(),
  total: money('total').notNull(),
  currency: currency(),
  status: mysqlEnum('status', ['DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'CANCELLED', 'ADJUSTED']).default('DRAFT').notNull(),
  ...timestamps(),
});

export const invoiceLines = mysqlTable('invoice_lines', {
  id: pk(),
  tenantId: tenantId(),
  invoiceId: ref('invoice_id').notNull().references(() => invoices.id),
  orderId: ref('order_id').references(() => orders.id),
  orderContainerId: ref('order_container_id').references(() => orderContainers.id),
  orderFeeId: ref('order_fee_id').references(() => orderFees.id),
  description: varchar('description', { length: 255 }).notNull(),
  amount: money('amount').notNull(),
  vatRatePercent: decimal('vat_rate_percent', { precision: 5, scale: 2 }),
});

export const vendorBills = mysqlTable('vendor_bills', {   // AP: cây xăng, nhà xe ngoài, garage
  id: pk(),
  tenantId: tenantId(),
  vendorId: ref('vendor_id').notNull().references(() => vendors.id),
  billNo: varchar('bill_no', { length: 50 }),
  periodFrom: date('period_from'),
  periodTo: date('period_to'),
  total: money('total').notNull(),
  currency: currency(),
  status: mysqlEnum('status', ['DRAFT', 'MATCHED', 'APPROVED', 'PAID']).default('DRAFT').notNull(),
  ...timestamps(),
});

export const payments = mysqlTable('payments', {
  id: pk(),
  tenantId: tenantId(),
  direction: mysqlEnum('direction', ['RECEIVE', 'PAY']).notNull(),
  counterpartyType: mysqlEnum('counterparty_type', ['CUSTOMER', 'VENDOR', 'DRIVER']).notNull(),
  counterpartyId: ref('counterparty_id').notNull(),
  invoiceId: ref('invoice_id'),
  vendorBillId: ref('vendor_bill_id'),
  amount: money('amount').notNull(),
  currency: currency(),
  paidAt: ts('paid_at').notNull(),
  method: mysqlEnum('method', ['BANK_TRANSFER', 'CASH']).notNull(),
  bankRef: varchar('bank_ref', { length: 100 }),
  ...timestamps(),
});
```

## 3. Migration riêng cho gps_logs [BỔ SUNG]
```sql
CREATE TABLE gps_logs (
  tenant_id CHAR(36) NOT NULL,
  tractor_id CHAR(36) NOT NULL,
  recorded_at DATETIME(3) NOT NULL,
  received_at DATETIME(3) NOT NULL,
  lat DECIMAL(9,6) NOT NULL,
  lng DECIMAL(9,6) NOT NULL,
  speed_kmh SMALLINT NULL,
  heading SMALLINT NULL,
  ignition_on BOOLEAN NULL,
  device_odometer_km INT NULL,
  PRIMARY KEY (tenant_id, tractor_id, recorded_at)
)
PARTITION BY RANGE COLUMNS (recorded_at) (
  PARTITION p2026_10 VALUES LESS THAN ('2026-11-01'),
  PARTITION p2026_11 VALUES LESS THAN ('2026-12-01'),
  PARTITION pmax VALUES LESS THAN (MAXVALUE)
);
-- Job hàng tháng: REORGANIZE pmax để tạo partition tháng tới; DROP partition quá hạn lưu trữ.
```
`INSERT IGNORE` theo PK để chống trùng khi worker retry.
