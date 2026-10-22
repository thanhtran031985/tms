# Tiến độ 05-fleet-drivers

Trạng thái: ⬜ chưa làm · 🔄 đang làm · ❓ có code chưa rà soát · ⚠️ khác task.md · ❌ thiếu · ✅ xong

| Bước | Nội dung | Trạng thái | Commit |
|---|---|---|---|
| 1 | Schema đội xe, migration và tenant isolation | ✅ | `0c667d1` |
| 2 | Service đầu kéo, rơ moóc, tài xế và che dữ liệu cá nhân | ✅ | `688a22f` |
| 3 | Rà hạn giấy tờ và seed | ✅ | `c912398` |
| 4 | Kế hoạch và lệnh bảo dưỡng | ✅ | `08311a8` |
| 5 | Job hằng ngày cảnh báo giấy tờ | ✅ | |
| 6 | Màn đội xe, tài xế và giấy tờ | 🔄 | |
| 7 | Hoàn tất | ⬜ | |

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
