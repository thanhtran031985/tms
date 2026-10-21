# 05-fleet-drivers — Đội xe, tài xế và giấy tờ

> Giai đoạn: GĐ2 · Phụ thuộc: 02 · Nhánh git: `feat/05-fleet-drivers`
> Nguồn: `docs/specs/07_implementation_tickets.md` TICKET-05; spec `00_system_overview_and_adrs.md` mục 3 (Fleet & Maintenance) và ADR-007, ADR-008; spec `02_database_schema.md` mục 1 (Bảo mật PII) và nhóm "2. ĐỘI XE, TÀI XẾ, BẢO DƯỠNG" (`tractors`, `trailers`, `drivers`, `maintenance_plans`, `maintenance_orders`); spec `03_dispatch_and_concurrency.md` mục 1 bước 3 (giấy tờ còn hạn tại `plannedEnd`, cảnh báo 15 ngày, bảo dưỡng chồng lấn) và mục 2 Rule 1, 2, 5, 6 (thuộc tính rơ moóc, tải trọng, chứng chỉ hàng nguy hiểm); spec `08_nonfunctional_security_ops.md` mục 2 (Dữ liệu cá nhân); PRD `docs/PRD.md` mục E5

## Mục tiêu
Sau task này, Quản lý đội xe khai báo đầu kéo, rơ moóc và tài xế cùng hạn giấy tờ (đăng kiểm, bảo hiểm, phù hiệu, GPLX, kiểm định rơ moóc) và lịch bảo dưỡng. Mỗi ngày hệ thống tự rà và đưa ra danh sách giấy tờ sắp hết hạn trong 15 ngày để gia hạn kịp, trước khi việc điều xe bị chặn. Lệnh bảo dưỡng đã lên kế hoạch giữ chỗ để Điều vận không gán xe đó vào khoảng thời gian sửa.

## Phạm vi
**Làm:**
- Bảng `tractors`, `trailers`, `drivers`, `maintenance_plans`, `maintenance_orders`; migration; seed.
- CRUD đầu kéo, rơ moóc, tài xế, kế hoạch bảo dưỡng, lệnh bảo dưỡng; xóa mềm cho xe, rơ moóc, tài xế.
- Hạn giấy tờ: đăng kiểm (`registrationExpiry`), bảo hiểm (`insuranceExpiry`), phù hiệu (`transportBadgeExpiry`), GPLX (`licenseExpiry`), kiểm định rơ moóc (`inspectionExpiry`), chứng chỉ chở hàng nguy hiểm của tài xế (Rule 6, cột mới).
- Danh sách "giấy tờ sắp hết hạn 15 ngày" và "đã hết hạn" theo ngày của múi giờ tenant.
- Job hằng ngày trong worker cảnh báo giấy tờ sắp hết hạn, idempotent.
- Kế hoạch bảo dưỡng theo km và theo ngày; danh sách xe sắp đến kỳ bảo dưỡng; hàm tìm lệnh bảo dưỡng chồng lấn khoảng thời gian để task 06 dùng.
- Màn danh sách và form đội xe, tài xế, tab giấy tờ sắp hết hạn.

**Không làm (thuộc task khác):**
- Chặn gán xe khi giấy tờ hết hạn tại `plannedEnd`, chặn khi có bảo dưỡng chồng lấn (task 06; task này chỉ cung cấp dữ liệu và hàm tra).
- Gửi cảnh báo ra email, Zalo/SMS và chuông trong app (task 23); task này phát sự kiện và lưu kết quả rà.
- Lốp xe (`tires`): có trong spec 02 nhưng chưa có ticket nào.
- Thiết bị GPS (`gps_devices`) và odometer từ GPS (task 13); định mức dầu `fuel_norms` (task 15).
- Lệnh bảo dưỡng tự sinh khi xe hỏng giữa đường (task 09).
- Tài khoản đăng nhập app cho tài xế (`drivers.userId`, task 10).

## Thiết kế
- Không có màn thiết kế riêng cho đội xe. Dựng từ thành phần chung theo bố cục AppShell.
- Thành phần: `designs/components/WorkTable/` (bảng đầu kéo, rơ moóc, tài xế; cột đầu là `StatusChip`; cột hạn có giờ đậm và dòng phụ "còn X ngày"), `designs/components/StatusChip/` (`crit` cho đã hết hạn hoặc GPLX/đăng kiểm sắp hết hạn sẽ chặn điều xe, `warn` cho sắp hết hạn, `ok` hợp lệ, `off` cho `INACTIVE` hoặc tài xế nghỉ), `designs/components/Alert/`, `designs/components/FilterTabs/` (Tất cả, Sắp hết hạn, Đã hết hạn, Đang bảo dưỡng), `designs/components/Field/`, `designs/components/EmptyState/` (ví dụ "Không có giấy tờ nào hết hạn trong 15 ngày tới" dạng `is-ok`).
- 4 trạng thái cho mỗi bảng. Biển số (dạng `51C-482.17`) dùng `--font-mono`, không cắt ngắn.

## Quyết định kiến trúc
- Module `packages/core/modules/fleet/`: `tractors.service.ts`, `trailers.service.ts`, `drivers.service.ts`, `documents.service.ts` (rà hạn giấy tờ), `maintenance.service.ts`, `repo.ts`, `schema.ts`. Schema Drizzle ở `packages/core/lib/db/schema/fleet.ts` đúng tên cột spec 02.
- Unique theo tenant: `uq_tractor_plate`, `uq_trailer_plate` (biển số chuẩn hóa chữ hoa trước khi lưu); trùng trả `DUPLICATE_CODE`.
- Chứng chỉ hàng nguy hiểm: spec 03 Rule 6 yêu cầu "thêm vào danh mục giấy tờ tài xế" nhưng spec 02 chưa có cột. Thêm `drivers.dg_certificate_no VARCHAR(30) NULL` và `drivers.dg_certificate_expiry DATE NULL`, cập nhật spec 02, ghi decisions.md.
- Rơ moóc: `trailerType = '20FT'` thì `canCarryTwin20` phải `false` (Rule 1); `maxPayloadTons` bắt buộc; `tareWeightTons`, `hasGensetPower` dùng cho Rule 2 và Rule 5 ở task 06/08.
- Hạn giấy tờ là kiểu `DATE`; "sắp hết hạn" = ngày hết hạn nằm trong [hôm nay, hôm nay + 15 ngày] theo `toTenantDate(ctx, now)`; "đã hết hạn" = trước hôm nay. Khoảng 15 ngày khớp mức cảnh báo ở spec 03 mục 1.
- Dữ liệu cá nhân (spec 02 mục 1, spec 08 mục 2): `nationalIdNo`, `licenseNo`, `phone` của tài xế chỉ trả về cho role có quyền (`OWNER`, `ADMIN`, `FLEET_MANAGER`); role khác nhận giá trị che (ví dụ `09xx xxx 123`). Xuất file có các trường này phải ghi `audit_logs`.
- Job `fleet.document-expiry` trong `apps/worker`: mỗi tenant một lịch chạy theo múi giờ tenant; idempotent theo khóa `DOC_EXPIRY:{tenantId}:{yyyy-mm-dd}`; phát sự kiện `fleet.documents_expiring` (kèm danh sách) để task 23 gửi thông báo; retry có backoff (ADR-007).
- Bảo dưỡng: `maintenance_orders` `PLANNED`/`IN_PROGRESS` có `plannedStart`, `plannedEnd` là khoảng chặn điều xe; hàm `findMaintenanceOverlap(ctx, { tractorId?, trailerId?, start, end })` dùng điều kiện `planned_start < :end AND planned_end > :start` như spec 03 mục 1. "Sắp đến kỳ bảo dưỡng" tính từ `maintenance_plans` (`intervalKm`, `intervalDays`, `lastDoneOdometer`, `lastDoneAt`) và `tractors.currentOdometer`.
- `status` của xe và tài xế (`AVAILABLE`, `IN_USE`/`ON_DUTY`, `MAINTENANCE`, `OFF_DUTY`, `INACTIVE`) chỉ phản ánh hiện tại; task này cho sửa tay `INACTIVE`, `OFF_DUTY` (nghỉ phép), `MAINTENANCE` (khi lệnh bảo dưỡng `IN_PROGRESS`), không tự đặt `IN_USE`/`ON_DUTY` (spec 03 mục 1 bước 6).
- Quyền: ghi cho `OWNER`, `ADMIN`, `FLEET_MANAGER`; `DISPATCHER` xem (không thấy PII đầy đủ); `VIEWER` xem.

## Các bước
### Bước 1 — Schema đội xe, migration và tenant isolation
- `packages/core/lib/db/schema/fleet.ts`: 5 bảng đúng spec 02, thêm 2 cột chứng chỉ hàng nguy hiểm; `pnpm db:generate`, review SQL.
- Viết test trước `packages/core/modules/fleet/repo.int.test.ts`: 5 repo, Tenant B không đọc, sửa, xóa được dữ liệu Tenant A.
**Kiểm tra:** `pnpm db:migrate` chạy được trên DB trống và DB đã có dữ liệu của task 04; `pnpm test --filter core -- fleet.*repo` xanh.

### Bước 2 — Service đầu kéo, rơ moóc, tài xế và che dữ liệu cá nhân
- Viết test trước `fleet.service.int.test.ts`: trùng biển số cùng tenant bị `DUPLICATE_CODE`, khác tenant được; rơ moóc `20FT` khai `canCarryTwin20 = true` bị `VALIDATION_ERROR`; `DISPATCHER` đọc tài xế nhận số CCCD, GPLX, SĐT đã che, `FLEET_MANAGER` nhận đầy đủ; xóa mềm ẩn khỏi danh sách.
- Viết các service, `schema.ts`, Server Action `apps/web/src/features/fleet/actions.ts` (khuôn `requireRole` rồi zod rồi service).
**Kiểm tra:** `pnpm test --filter core -- fleet.service` xanh.

### Bước 3 — Rà hạn giấy tờ và seed
- Viết test trước `documents.service.int.test.ts` với đồng hồ cố định: giấy tờ hết hạn hôm nay, ngày mai, đúng ngày thứ 15, ngày thứ 16, hôm qua; kết quả "sắp hết hạn 15 ngày" và "đã hết hạn" đúng từng loại giấy tờ (đăng kiểm, bảo hiểm, phù hiệu, GPLX, kiểm định rơ moóc, chứng chỉ hàng nguy hiểm); ranh giới ngày tính theo múi giờ tenant (23:30 giờ VN).
- Viết `documents.service.ts` (`listExpiringDocuments(ctx, { withinDays: 15 })`).
- Seed `packages/core/lib/db/seed/fleet.ts`: các xe và tài xế trong dữ liệu mẫu designs (51C-482.17 Trần Văn Lộc GPLX còn 2 ngày, 51C-228.40 đăng kiểm hết hạn...), rơ moóc 20FT, 40FT, 40FT_COMBO có chốt giữa, rơ moóc có genset; ngày hết hạn tính tương đối theo ngày chạy seed để danh sách luôn đúng.
**Kiểm tra:** `pnpm test --filter core -- documents` xanh; `pnpm db:seed` rồi gọi `listExpiringDocuments` ra đúng danh sách giấy tờ seed nằm trong 15 ngày.

### Bước 4 — Kế hoạch và lệnh bảo dưỡng
- Viết test trước `maintenance.service.int.test.ts`: lệnh bảo dưỡng `PLANNED` 8:00 đến 17:00 chồng với khoảng 16:00 đến 18:00, không chồng với 17:00 đến 19:00; lệnh `DONE` hoặc `CANCELLED` không tính; xe đến kỳ theo km và theo ngày; chuyển lệnh sang `IN_PROGRESS` đặt xe `MAINTENANCE`, `DONE` trả xe `AVAILABLE`.
- Viết `maintenance.service.ts` (`createMaintenanceOrder`, `updateStatus`, `findMaintenanceOverlap`, `listMaintenanceDue`), Server Action tương ứng.
**Kiểm tra:** `pnpm test --filter core -- maintenance` xanh.

### Bước 5 — Job hằng ngày cảnh báo giấy tờ
- Viết test trước `apps/worker/src/jobs/document-expiry.int.test.ts` (Testcontainers MariaDB + Redis): chạy job 2 lần cùng ngày chỉ phát 1 sự kiện mỗi tenant; tenant ở múi giờ khác chạy theo giờ của tenant đó; lỗi DB thì job retry.
- Viết `apps/worker/src/jobs/document-expiry.ts`, đăng ký lịch theo tenant.
**Kiểm tra:** `pnpm test --filter worker -- document-expiry` xanh; `pnpm dev` thấy log JSON của job có `tenantId`, không có SĐT hay số GPLX trong log.

### Bước 6 — Màn đội xe, tài xế và giấy tờ
- Route `apps/web/src/app/(tenant)/fleet/tractors/page.tsx`, `fleet/trailers/page.tsx`, `fleet/drivers/page.tsx`, `fleet/documents/page.tsx`; view ở `apps/web/src/features/fleet/`.
- Bảng có chip trạng thái và cột hạn giấy tờ gần nhất; tab "Sắp hết hạn" và "Đã hết hạn" có số đếm; form tạo, sửa dùng `Field`; tài xế hiện PII đã che theo role.
- Đủ 4 trạng thái mỗi bảng.
- E2E `apps/web/e2e/fleet.spec.ts`: mở tab giấy tờ sắp hết hạn thấy đúng các dòng seed; đăng nhập `DISPATCHER` thấy SĐT tài xế đã che.
**Kiểm tra:** mở `/fleet/documents` trên 1440×900 và 1366×768, bảng cuộn ngang trong khối; chip luôn có icon và chữ; `pnpm e2e -- fleet` xanh.

### Bước 7 — Hoàn tất
- Chạy toàn bộ kiểm tra, cập nhật progress.md, đổi trạng thái dòng 05 trong `docs/tasks/README.md`, cập nhật spec 02 cho cột chứng chỉ hàng nguy hiểm.
**Kiểm tra:** `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` không lỗi; `pnpm e2e` xanh cho màn giấy tờ; migration chạy được trên DB trống và DB có dữ liệu; seed có đủ xe, rơ moóc, tài xế; mọi Server Action có `requireRole` và zod; mọi repo mới có test tenant isolation; đạt "Chấp nhận khi" của ticket: danh sách "giấy tờ sắp hết hạn 15 ngày" đúng với dữ liệu seed.
