# Tiến độ 02-master-data

Trạng thái: ⬜ chưa làm · 🔄 đang làm · ❓ có code chưa rà soát · ⚠️ khác task.md · ❌ thiếu · ✅ xong

| Bước | Nội dung | Trạng thái | Commit |
|---|---|---|---|
| 1 | Schema danh mục, migration và test tenant isolation | ✅ | |
| 2 | Service, zod và quy tắc trùng mã, xóa mềm, tham chiếu cùng tenant | ✅ | |
| 3 | Server Action và seed | ✅ | |
| 4 | Màn danh sách danh mục | ✅ | |
| 5 | Form tạo, sửa, xóa mềm | ✅ | |
| 6 | Hoàn tất | ✅ | |

## Nhật ký
<!-- Sau mỗi bước: ngày, đã làm gì, kết quả Kiểm tra, việc người dùng cần làm thủ công. -->

### Bước 1 — Schema, migration, repo, cách ly tenant (22/10/2026)
- `schema/master-data.ts` (5 bảng; thêm `shipping_lines.deleted_at`, `vendors.code`, `locations.code`), `0002_master_data.sql` đã review (utf8mb4, `datetime(3)`, mọi unique bắt đầu bằng `tenant_id`), `modules/master-data/repo.ts` qua TenantDb.
- Kiểm tra: `repo.int.test.ts` 12 test xanh (mỗi danh mục: tenant B không đọc, không sửa, không xóa mềm được; cùng mã ở hai tenant; xóa mềm).

### Bước 2 — Service, zod, quy tắc (22/10/2026)
- `shared/schemas/master-data.ts` (zod), `DUPLICATE_CODE` + `AppError.details` (define-action chuyển `details` sang Result), `service.ts` (list/get/create/update/softDelete/restore/updateCustomerBilling).
- Kiểm tra: `pnpm test --filter core -- master-data` 34 test xanh, gồm trùng mã cùng tenant/khác tenant cho cả 5 danh mục, đua 8 lần tạo cùng mã chỉ 1 thành công, khôi phục mã đã xóa, tham chiếu tenant khác bị `NOT_FOUND`.

### Bước 3 — Quyền, Server Action, seed (22/10/2026)
- `permissions.ts`: `masterData.view` (mọi vai trò web), `masterData.write` (OWNER, ADMIN, DISPATCHER), `masterData.editBilling` (+ACCOUNTANT). `features/master-data/actions.ts`: 26 action (list/create/update/softDelete/restore × 5 danh mục + `updateCustomerBilling`), dựng bằng `defineAction`. `getMasterDataService()` ở `server/services.ts`.
- Seed `seeds/master-data.ts` (+ `.test-data.ts`): Phúc An 4 khách, 4 hãng tàu, 3 nhà cung cấp, 9 địa điểm, 3 tuyến; Sao Việt có mã THEPNL, CATLAI, CL-ST trùng với Phúc An. Tọa độ là giá trị gần đúng cho dữ liệu mẫu.
- Kiểm tra: `pnpm test --filter web` xanh (VIEWER/FLEET_MANAGER bị FORBIDDEN, thiếu tên VALIDATION_ERROR, Kế toán sửa thanh toán nhưng không đổi tên); seed test xanh; `pnpm db:seed` hai lần trên DB dev (cổng 3307) không trùng, `routes` có CL-ST Cát Lái – Sóng Thần.

### Bước 4 — Màn danh sách (22/10/2026)
- Thành phần mới `work-table`, `filter-tabs`, `drawer` (ngăn kéo + hộp xác nhận), `SelectField`, `SwitchField`; `CatalogView` + 5 `*-list.tsx`; route `/master-data/[entity]` (+ `loading.tsx`, `error.tsx`, `not-found.tsx`); mục menu "Danh mục".
- Kiểm tra: e2e xác nhận bảng cuộn ngang trong khối, trang không tràn ở 1440×900, 1366×768 và 600px; tab loại có số đếm; lọc và tìm không dấu; trạng thái trống/không kết quả; công ty khác không thấy dữ liệu của nhau. Đã xem ảnh chụp 1440×900.
- Sửa lỗi phát hiện: AppShell tràn ngang ở màn hẹp (cột lưới `auto`); `sr-only` trong bảng đẩy `scrollWidth` (thêm `relative` ở khung cuộn).

### Bước 5 — Form (22/10/2026)
- Ngăn kéo phải với `Field`, lỗi `DUPLICATE_CODE` dưới ô Mã kèm "Khôi phục bản ghi đã xóa", xác nhận xóa mềm, công tắc đảo vỏ, địa điểm chọn khách/nhà cung cấp sở hữu; Kế toán chỉ mở ô thanh toán; Chỉ xem khóa toàn bộ ô và không có nút Lưu.
- Kiểm tra: `pnpm e2e` 42 test xanh (18 test mới ở `master-data.spec.ts`: tạo, thiếu tên, trùng mã, sửa, xóa mềm + khôi phục, tọa độ sai, bàn phím + Esc trả focus + viền 3px, quyền Chỉ xem và Kế toán).

### Bước 6 — Hoàn tất (22/10/2026)
- `pnpm typecheck`, `lint`, `format:check`, `build` sạch; `pnpm test` 161 test xanh (core 115, web 45, worker 1); `pnpm e2e` 42 xanh. Migration `0002` chạy trên DB trống (Testcontainers) và DB dev đã có dữ liệu task 01; `pnpm db:seed` hai lần không trùng. Spec 02, PRD E3, decisions.md đã cập nhật.
- Việc người dùng cần làm: xác nhận ma trận quyền danh mục (Kế toán chỉ sửa thanh toán của khách; Điều vận ghi được); xem lại tọa độ seed (gần đúng); sửa `DATABASE_URL` trong `.env` sang cổng 3307.
