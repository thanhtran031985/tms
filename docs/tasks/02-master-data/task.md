# 02-master-data — Danh mục cơ bản

> Giai đoạn: GĐ1 · Phụ thuộc: 01 · Nhánh git: `feat/02-master-data`
> Nguồn: `docs/specs/07_implementation_tickets.md` TICKET-02; spec `00_system_overview_and_adrs.md` mục 1 (Location) và mục 3 (Master Data), ADR-003; spec `02_database_schema.md` mục 1 và nhóm "1. MASTER DATA" (`customers`, `shipping_lines`, `vendors`, `locations`, `routes`); spec `04_telemetry_and_fuel.md` mục 1.1 (geofence dùng `locations.lat/lng`, `geofenceRadiusM`); spec `08_nonfunctional_security_ops.md` mục 7; PRD `docs/PRD.md` mục E3

## Mục tiêu
Sau task này, Điều vận và Kế toán tự khai báo khách hàng, hãng tàu, nhà cung cấp, địa điểm (cảng, depot, kho khách, cây xăng, garage, bãi xe) có tọa độ và bán kính geofence, và tuyến đường. Các danh mục này là nền để tạo bảng giá, Order và chuyến xe ở các task sau. Mã trùng trong cùng công ty bị chặn ngay khi lưu, còn công ty khác dùng cùng mã vẫn được.

## Phạm vi
**Làm:**
- Bảng `customers`, `shipping_lines`, `vendors`, `locations`, `routes`; migration; seed.
- CRUD cho cả 5 danh mục: tạo, sửa, xem danh sách có tìm kiếm và lọc, xóa mềm (`deleted_at`).
- Unique theo tenant: `uq_customer_code`, `uq_sl_code`, `uq_route_code` (bắt đầu bằng `tenant_id`).
- Địa điểm có `type`, tọa độ `lat/lng`, `geofenceRadiusM` (mặc định 300), `zone`, liên kết khách (`customerId`) hoặc nhà cung cấp (`vendorId`) cùng tenant.
- Tuyến đường có `originZone`, `destinationZone`, `standardDistanceKm`.
- Seed: tuyến Cát Lái – Sóng Thần, cảng Cát Lái, vài depot, kho khách mẫu, vài khách và hãng tàu lấy từ dữ liệu mẫu trong designs (ONE, Maersk, Wan Hai, CMA CGM...).

**Không làm (thuộc task khác):**
- Import danh mục bằng Excel mẫu khi onboarding tenant (task 24, spec 08 mục 6).
- Bảng giá, bảng phí (task 03).
- Chọn tọa độ trên bản đồ (bản đồ có ở task 13/14); task này nhập số tọa độ.
- Sự kiện geofence vào/ra vùng (task 14).
- Hạn mức tín dụng chặn tạo Order khi vượt `creditLimit` (chưa có ticket; chỉ lưu giá trị).

## Thiết kế
- Không có màn thiết kế riêng cho danh mục. Dựng màn danh sách và form từ thành phần chung, theo bố cục AppShell của task 01.
- Thành phần: `designs/components/WorkTable/` (bảng trong khối trắng, cột cuối đúng một nút, cuộn ngang trong khối), `designs/components/Field/` (nhãn trên ô, lỗi dưới ô có icon), `designs/components/FilterTabs/` (tab "Tất cả" và tab theo loại, ví dụ loại địa điểm, có số đếm), `designs/components/EmptyState/`, `designs/components/Alert/`, `designs/components/Button/`.
- 4 trạng thái cho mỗi bảng: Đang tải (dòng xương), Trống (vì sao trống + một nút "Thêm khách hàng"...), Lỗi (giữ dữ liệu cũ, `Alert` warn có "Thử lại"), Bình thường. Mã khách, mã tuyến dùng `--font-mono`.

## Quyết định kiến trúc
- Module `packages/core/modules/master-data/` gồm `customers.service.ts`, `shipping-lines.service.ts`, `vendors.service.ts`, `locations.service.ts`, `routes.service.ts` (hoặc một `service.ts` chia mục), `repo.ts`, `schema.ts` (zod). Schema Drizzle ở `packages/core/lib/db/schema/master-data.ts`, đúng tên cột spec 02.
- Mọi truy vấn qua repo có `tenantId` (ADR-003). Trước khi ghi `locations.customerId` / `vendorId`, service kiểm tra bản ghi đó cùng tenant và chưa xóa mềm (spec 02 mục 1, Khóa ngoại); sai trả `NOT_FOUND`.
- Trùng mã: bắt lỗi unique của MariaDB và trả mã lỗi cố định `DUPLICATE_CODE` (thêm vào `packages/shared/errors.ts`) với thông báo nói mã nào đã có và cách xử lý.
- Xóa mềm: đặt `deleted_at`, ẩn khỏi danh sách và ô chọn, vẫn giữ để Order cũ hiển thị đúng. Unique index không phân biệt dòng đã xóa: tạo lại mã đã xóa mềm thì đề xuất "Khôi phục" thay vì tạo mới (ghi decisions.md nếu chọn cách khác).
- Spec 02 chưa có `deleted_at` cho `shipping_lines` dù ticket yêu cầu xóa mềm mọi danh mục: thêm cột, cập nhật spec 02, ghi decisions.md. `vendors` và `locations` không có cột mã nên không có unique theo mã; ghi rõ trong decisions.md, hỏi người dùng có cần thêm `code` không.
- Validate: `lat` trong [-90, 90], `lng` trong [-180, 180], `geofenceRadiusM` > 0, `standardDistanceKm` > 0, `paymentTermDays` ≥ 0; `creditLimit` là tiền `DECIMAL(18,2)` tính bằng decimal.js.
- Quyền (ma trận ở `modules/identity/permissions.ts`): ghi cho `OWNER`, `ADMIN`, `DISPATCHER`; Kế toán (`ACCOUNTANT`) sửa được thông tin thanh toán của khách (`taxCode`, `billingAddress`, `paymentTermDays`, `creditLimit`); `VIEWER` và `FLEET_MANAGER` chỉ đọc. Đây là đề xuất, chốt trong plan.md.
- Danh mục không thuộc nhóm bắt buộc audit (Rule 8) nhưng vẫn ghi `created_by`.

## Các bước
### Bước 1 — Schema danh mục, migration và test tenant isolation
- `packages/core/lib/db/schema/master-data.ts`: 5 bảng đúng spec 02, thêm `shipping_lines.deleted_at`; `pnpm db:generate`, review SQL.
- Viết test trước `packages/core/modules/master-data/repo.int.test.ts`: với mỗi repo, Tenant B không đọc, sửa, xóa được bản ghi của Tenant A.
- Viết `repo.ts` cho test xanh.
**Kiểm tra:** `pnpm db:migrate` chạy được trên DB trống và trên DB đã có dữ liệu của task 01; `pnpm test --filter core -- master-data.*repo` xanh, có đủ 5 test tenant isolation.

### Bước 2 — Service, zod và quy tắc trùng mã, xóa mềm, tham chiếu cùng tenant
- Viết test trước `packages/core/modules/master-data/service.int.test.ts`: tạo trùng mã khách trong cùng tenant trả `DUPLICATE_CODE`; cùng mã ở tenant khác thì được; tương tự cho hãng tàu và tuyến; bản ghi đã xóa mềm không hiện trong danh sách; địa điểm gắn `customerId` của tenant khác bị chặn; tạo lại mã đã xóa mềm được đề xuất khôi phục.
- `service.ts` (các hàm list, get, create, update, softDelete, restore), `schema.ts` (zod dùng chung web và test).
**Kiểm tra:** `pnpm test --filter core -- master-data` xanh, test trùng mã khách cùng tenant và khác tenant nằm trong bộ test.

### Bước 3 — Server Action và seed
- `apps/web/src/features/master-data/actions.ts`: mỗi action theo khuôn `requireRole` rồi zod rồi service, trả `{ ok, data } | { ok: false, code, message }`.
- Test action: `VIEWER` tạo khách bị `FORBIDDEN`; input thiếu tên bị `VALIDATION_ERROR`.
- Seed `packages/core/lib/db/seed/master-data.ts`: tuyến Cát Lái – Sóng Thần (`routeCode`, zone, km chuẩn), cảng Cát Lái, 2 depot, 3 kho khách có tọa độ thật ở TP.HCM và Bình Dương, các hãng tàu và khách hàng có trong dữ liệu mẫu của designs.
**Kiểm tra:** `pnpm test --filter web -- master-data` xanh; `pnpm db:seed` chạy hai lần không sinh trùng; `SELECT route_code FROM routes` có tuyến Cát Lái – Sóng Thần.

### Bước 4 — Màn danh sách danh mục
- Route `apps/web/src/app/(tenant)/master-data/[entity]/page.tsx` chỉ định tuyến; view ở `apps/web/src/features/master-data/` (`customer-list.tsx`, `location-list.tsx`...).
- Component chung `src/components/ui/work-table/`, `filter-tabs/`, `empty-state/`, `alert/` dựng theo designs.
- Bảng có tìm theo mã/tên, `FilterTabs` theo loại (địa điểm theo `type`, nhà cung cấp theo `type`), sắp theo tên; đủ 4 trạng thái.
**Kiểm tra:** mở `/master-data/customers` và `/master-data/locations` trên 1440×900 và 1366×768: bảng cuộn ngang trong khối, không cuộn cả trang; chuyển thử 4 trạng thái (Đang tải, Trống, Lỗi, Bình thường) thấy đúng mô tả trong `designs/components/WorkTable/README.md`.

### Bước 5 — Form tạo, sửa, xóa mềm
- Form trong ngăn kéo hoặc trang riêng (chọn trong plan.md) dùng `Field`: nhãn trên ô, lỗi `DUPLICATE_CODE` hiện ngay dưới ô mã, nút chính "Lưu khách hàng"...; xác nhận trước khi xóa; nút "Khôi phục" cho bản ghi đã xóa mềm.
- Form địa điểm: chọn loại, nhập tọa độ và bán kính, chọn khách hoặc nhà cung cấp sở hữu.
- E2E `apps/web/e2e/master-data.spec.ts`: tạo khách mới thấy trong danh sách; tạo trùng mã thấy lỗi dưới ô mã; xóa mềm rồi không thấy trong danh sách.
**Kiểm tra:** `pnpm e2e -- master-data` xanh; điều hướng toàn bộ form bằng bàn phím, viền focus 3px thấy rõ.

### Bước 6 — Hoàn tất
- Chạy toàn bộ kiểm tra, cập nhật progress.md, đổi trạng thái dòng 02 trong `docs/tasks/README.md`, cập nhật spec 02 cho `shipping_lines.deleted_at`.
**Kiểm tra:** `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` không lỗi; `pnpm e2e` xanh cho luồng tạo khách; migration chạy được trên DB trống và DB có dữ liệu; seed tối thiểu có đủ; mọi Server Action có `requireRole` và zod; mọi repo mới có test tenant isolation; đạt "Chấp nhận khi" của ticket: tạo trùng mã khách trong cùng tenant bị chặn, khác tenant thì được.
