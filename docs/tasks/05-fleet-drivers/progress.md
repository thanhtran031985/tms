# Tiến độ 05-fleet-drivers

Trạng thái: ⬜ chưa làm · 🔄 đang làm · ❓ có code chưa rà soát · ⚠️ khác task.md · ❌ thiếu · ✅ xong

| Bước | Nội dung | Trạng thái | Commit |
|---|---|---|---|
| 1 | Schema đội xe, migration và tenant isolation | ✅ | `0c667d1` |
| 2 | Service đầu kéo, rơ moóc, tài xế và che dữ liệu cá nhân | ✅ | `688a22f` |
| 3 | Rà hạn giấy tờ và seed | ✅ | `c912398` |
| 4 | Kế hoạch và lệnh bảo dưỡng | ✅ | `08311a8` |
| 5 | Job hằng ngày cảnh báo giấy tờ | ✅ | `db054e6` |
| 6 | Màn đội xe, tài xế và giấy tờ | ✅ | `278e886` |
| 7 | Hoàn tất | ✅ | `8487803` |

## Nhật ký
<!-- Sau mỗi bước: ngày, đã làm gì, kết quả Kiểm tra, việc người dùng cần làm thủ công. -->

### Bước 1 — Schema đội xe, migration và tenant isolation (22/10/2026)
- Tạo schema `schema/fleet.ts` (5 bảng: `tractors`, `trailers`, `drivers`, `maintenance_plans`, `maintenance_orders`), bổ sung 2 cột chứng chỉ hàng nguy hiểm `dg_certificate_no` và `dg_certificate_expiry` cho `drivers`.
- Enum mới trong `shared/enums.ts`: `TRACTOR_OWNERSHIP`, `TRACTOR_STATUS`, `TRAILER_TYPES`, `TRAILER_STATUS`, `DRIVER_EMPLOYMENT_TYPES`, `DRIVER_STATUS`, `MAINTENANCE_ORDER_TYPES`, `MAINTENANCE_ORDER_STATUS`.
- Sinh migration `0003_fleet.sql` và cập nhật journal.
- Tạo `modules/fleet/repo.ts` hỗ trợ soft-delete và unique key tra cứu theo tenant.
- Kiểm tra: 12 test cách ly tenant trong `modules/fleet/repo.int.test.ts` xanh; `db:migrate` chạy thành công trên MariaDB dev (port 3307); typecheck và lint xanh 100%.

### Bước 2 — Service đầu kéo, rơ moóc, tài xế và che dữ liệu cá nhân (22/10/2026)
- Viết schema validation Zod & hàm che PII (maskPhone, maskNationalId, maskLicense, maskDriverPII) tại `packages/shared/schemas/fleet.ts`. Cấm 20FT chọn canCarryTwin20.
- Viết `packages/core/modules/fleet/fleet.service.ts`: CRUD đầu kéo, rơ moóc, tài xế, che PII theo role (DISPATCHER thấy số che, FLEET_MANAGER/ADMIN thấy đầy đủ), chống trùng biển số xe trong cùng tenant.
- Cập nhật quyền `fleet.view` và `fleet.write` trong `packages/core/modules/identity/permissions.ts`.
- Viết Server Actions tại `apps/web/src/features/fleet/actions.ts` theo khuôn `defineAction`.
- Kiểm tra: 7 test trong `fleet.service.int.test.ts` xanh (tổng cộng 19/19 fleet tests xanh); typecheck và eslint xanh 100%.

### Bước 3 — Rà hạn giấy tờ và seed (22/10/2026)
- Viết test trước `packages/core/modules/fleet/documents.service.int.test.ts` kiểm thử rà soát toàn bộ các loại giấy tờ (đăng kiểm, bảo hiểm TNDS, phù hiệu vận tải, kiểm định rơ moóc, GPLX, chứng chỉ hàng nguy hiểm); kiểm tra mốc hôm nay, ngày mai, ngày thứ 15, ngày thứ 16, hôm qua; kiểm tra ranh giới ngày theo múi giờ tenant (23:30 vs 00:30).
- Viết `packages/core/modules/fleet/documents.service.ts` (`listExpiringDocuments`).
- Tạo seed data `packages/core/lib/db/seeds/fleet.test-data.ts` và seeder `packages/core/lib/db/seeds/fleet.ts` với ngày hết hạn tính tương đối theo ngày chạy seed (51C-482.17, 51C-228.40 hết hạn đăng kiểm, rơ moóc 20FT, 40FT, 40FT_COMBO có chốt giữa và genset, tài xế Trần Văn Lộc GPLX còn 2 ngày, v.v.).
- Tích hợp `seedFleet` vào `seed.ts` và viết test `packages/core/lib/db/seeds/fleet.int.test.ts` (4 test).
- Thêm Server Action `listExpiringDocuments` trong `apps/web/src/features/fleet/actions.ts`.
- Kiểm tra: 26/26 tests xanh; `pnpm db:seed` thành công; typecheck và lint xanh 100%.

### Bước 4 — Kế hoạch và lệnh bảo dưỡng (22/10/2026)
- Viết test trước `packages/core/modules/fleet/maintenance.service.int.test.ts`: kiểm thử tìm khoảng thời gian bảo dưỡng chồng lấn (`planned_start < :end AND planned_end > :start`), bỏ qua các lệnh đã `DONE`/`CANCELLED`; chuyển lệnh `IN_PROGRESS` tự động chuyển xe sang `MAINTENANCE` và `DONE` trả về `AVAILABLE`; kiểm thử xe đến kỳ bảo dưỡng theo km và theo ngày.
- Bổ sung schema Zod `maintenancePlanInputSchema` và `maintenanceOrderInputSchema` tại `packages/shared/schemas/fleet.ts`.
- Viết `packages/core/modules/fleet/maintenance.service.ts`: `createMaintenancePlan`, `listMaintenancePlans`, `createMaintenanceOrder`, `updateMaintenanceOrderStatus`, `findMaintenanceOverlap`, `listMaintenanceDue`.
- Bổ sung Server Actions tương ứng tại `apps/web/src/features/fleet/actions.ts`.
- Kiểm tra: 30/30 tests xanh; typecheck và lint xanh 100%.

### Bước 5 — Job hằng ngày cảnh báo giấy tờ (22/10/2026)
- Viết test trước `apps/worker/src/jobs/document-expiry.int.test.ts` (Testcontainers MariaDB + Redis): chạy 2 lần cùng ngày chỉ phát 1 sự kiện (idempotent qua key `DOC_EXPIRY:{tenantId}:{yyyy-mm-dd}`); tenant khác múi giờ tính đúng ngày địa phương; lỗi DB ném lỗi để BullMQ retry; log JSON có `tenantId`, không log PII (SĐT, số GPLX).
- Viết `apps/worker/src/jobs/document-expiry.ts` (`processDocumentExpiryJob`), phát sự kiện `fleet.documents_expiring` qua Redis pub/sub.
- Đăng ký hàng đợi `fleet.document-expiry` và worker vào `apps/worker/src/worker.ts`.
- Kiểm tra: 4/4 test worker xanh; typecheck và lint xanh 100%.

### Bước 6 — Màn đội xe, tài xế và giấy tờ (22/10/2026)
- Thêm link "Đội xe & Tài xế" (`/fleet/tractors`, match `/fleet`) vào `NAV_ITEMS` trong `apps/web/src/components/ui/app-shell/nav-menu.tsx`.
- Tạo component `StatusChip` với đủ tone (`crit`, `warn`, `ok`, `off`, `info`, `neutral`) và icon đi kèm, hỗ trợ kích thước `sm`/`md`.
- Dựng bố cục phân hệ `FleetLayout` và tab điều hướng `FleetTabs` (`/fleet/tractors`, `/fleet/trailers`, `/fleet/drivers`, `/fleet/documents`).
- Tạo các màn hình:
  - `TractorList`: danh sách đầu kéo với biển số `font-mono`, hạn đăng kiểm/bảo hiểm/phù hiệu, lọc theo trạng thái (`AVAILABLE`, `IN_USE`, `MAINTENANCE`, `INACTIVE`), Drawer tạo/sửa đầu kéo.
  - `TrailerList`: danh sách rơ moóc, nhãn tính năng `Twin 20` và `Genset`, tải trọng, hạn kiểm định, lọc theo loại moóc (`20FT`, `40FT`, `40FT_COMBO`, `45FT`), Drawer tạo/sửa.
  - `DriverList`: danh sách tài xế, che PII (SĐT, CCCD, GPLX) tự động theo vai trò người dùng qua service, Drawer tạo/sửa tài xế (có khai báo chứng chỉ hàng nguy hiểm).
  - `DocumentsView`: theo dõi hạn giấy tờ tập trung, Alert tổng hợp số lượng quá hạn/sắp hết hạn, tab đếm "Tất cả", "Đã hết hạn", "Sắp hết hạn 15 ngày", tìm kiếm tức thì.
- Viết Playwright E2E test `apps/web/e2e/fleet.spec.ts` (5 kịch bản):
  - Mở theo dõi giấy tờ thấy cảnh báo đúng dữ liệu seed (51C-228.40 hết hạn đăng kiểm và sắp hết hạn bảo hiểm, 51R-556.78 hết hạn kiểm định, Lê Minh Tuấn hết hạn GPLX, Trần Văn Lộc GPLX còn 2 ngày, Nguyễn Hoàng Nam chứng chỉ DG còn 12 ngày).
  - Kiểm tra giao diện responsive 1440×900 và 1366×768, cuộn ngang bảng trong khối, chip luôn có icon và chữ.
  - Đăng nhập `DISPATCHER` (`hung.dv@phucan.vn`) thấy SĐT/CCCD/GPLX tài xế đã bị che (`090xx xxx 456`, `079xxxxxx234`, `GPLxxxxxx233`), không có nút thêm tài xế.
  - Đăng nhập `FLEET_MANAGER` (`doixe@phucan.vn`) thấy đầy đủ PII và có nút thêm tài xế.
  - Kiểm tra danh sách đầu kéo và rơ moóc hiển thị đầy đủ biển số font-mono và chip trạng thái.
- Cập nhật số đếm menu trong `apps/web/e2e/shell.spec.ts` (10 mục, 3 link hoạt động).
- Kiểm tra: `pnpm typecheck`, `pnpm lint`, `pnpm build`, `playwright test e2e/fleet.spec.ts` (5/5 passed), `playwright test e2e/shell.spec.ts` (11/11 passed) xanh 100%.

### Bước 7 — Hoàn tất (22/10/2026)
- Rà soát toàn diện và chạy bộ kiểm thử: `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm test` (30/30 unit/integration tests xanh), `pnpm e2e` xanh 100%.
- Cập nhật tài liệu:
  - `docs/specs/02_database_schema.md`: bổ sung 2 cột `dg_certificate_no` và `dg_certificate_expiry` cho bảng `drivers`.
  - `docs/tasks/05-fleet-drivers/decisions.md`: ghi nhận đầy đủ 7 quyết định kiến trúc và nghiệp vụ (chứng chỉ hàng nguy hiểm, quy tắc moóc 20FT, khoảng hạn 15 ngày theo múi giờ tenant, che PII theo vai trò, job worker idempotent, logic chồng lấn bảo dưỡng chặn điều xe).
  - `docs/tasks/README.md`: đánh dấu hoàn tất task 05 (`✅`).
  - `docs/tasks/05-fleet-drivers/progress.md`: cập nhật hoàn thành toàn bộ 7 bước.
- Chạy `tasks:dashboard` kiểm tra trạng thái bảng task.


