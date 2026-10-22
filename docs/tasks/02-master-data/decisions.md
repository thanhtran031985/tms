# Quyết định 02-master-data

## Đã chốt
<!-- Quyết định đã chốt trước khi làm (nếu có), kèm ngày. -->
- Cấu trúc mã nguồn: `apps/web/src/features/<module>` chứa view và Server Action, `apps/web/src/app` chỉ định tuyến, `apps/web/src/components/ui` chứa component dựng theo `designs/`; `designs/` chỉ đọc; mỗi ticket một thư mục trong `docs/tasks/` (21/10/2026, spec 01 mục 2 "[BỔ SUNG 21/10]").
- Giao diện theo Design System "TMS Container" phiên bản token 2, hướng xanh dương thiết kế lại theo ui-ux-pro-max (21/10/2026, `docs/DESIGN_SYSTEM.md`); chỉ dùng token, không tự đặt mã màu.

## Phát sinh khi làm
<!-- Chỗ làm khác task.md, spec hoặc thiết kế: lý do, ai đồng ý, đã sửa spec chưa. -->

### 22/10/2026 — quyết định khi làm task 02
- **Thêm cột `code` cho `vendors` và `locations`** (varchar 50, NOT NULL, unique `uq_vendor_code`, `uq_location_code` theo tenant). Người dùng đồng ý ở Plan mode. Đã sửa spec 02 và PRD E3. Mã địa điểm (CATLAI, DEPOT-PL) giúp chọn nhanh ở Order và Stop.
- **Thêm `shipping_lines.deleted_at`** theo task.md (ticket yêu cầu xóa mềm mọi danh mục). Đã sửa spec 02.
- **Tạo lại mã đã xóa mềm:** unique index không phân biệt dòng đã xóa. Service tra mã trước (kể cả dòng đã xóa): trả `DUPLICATE_CODE` kèm `details.deletedId`, form hiện nút "Khôi phục bản ghi đã xóa" dưới ô Mã thay vì tạo mới. Vẫn bắt lỗi unique (errno 1062) khi hai người lưu cùng mã cùng lúc; test đua 8 lần chỉ 1 thành công.
- **`AppError.details`** (mới) mang dữ kiện cho UI; `defineAction` chuyển nó vào `Result.details`. Mã lỗi mới `DUPLICATE_CODE`.
- **Quyền** (ma trận ở `permissions.ts`): `masterData.view` mọi vai trò web; `masterData.write` OWNER, ADMIN, DISPATCHER; `masterData.editBilling` thêm ACCOUNTANT, chỉ dùng cho action `updateCustomerBilling` (schema chỉ 4 trường: MST, địa chỉ hóa đơn, hạn thanh toán, hạn mức). FLEET_MANAGER và VIEWER chỉ đọc. Là đề xuất theo task.md, chờ PO xác nhận.
- **Không phân trang, lọc/tìm ở client:** `TenantDb.select` chưa có orderBy/limit; danh mục một công ty cỡ vài trăm dòng. Trang tải cả danh sách, tìm bỏ dấu và lọc theo loại ở client. Nếu một tenant có hàng nghìn dòng thì thêm phân trang phía server ở task sau.
- **Form trong ngăn kéo phải** (theo PRD Screen11) dựng bằng `<dialog>` native (khóa nền, Esc, trả focus), không cài thư viện. Xác nhận xóa dùng `ConfirmDialog` cùng cách dựng.
- **Một khung `CatalogView` cho 5 danh mục**; mỗi danh mục có `*-list.tsx` (cột, form, action). Client dùng kiểu DTO ở `features/master-data/entities.ts`, không import `packages/core`.
- **Mục menu "Danh mục"** thêm vào thanh bên (`/master-data/customers`, sáng khi ở `/master-data/*`). `shell.spec.ts` cập nhật: 2 liên kết thật.
- **Sửa lỗi AppShell ở màn hẹp:** cột lưới mặc định `auto` làm trang tràn ngang khi nội dung có bảng rộng; đặt `grid-cols-[minmax(0,1fr)]`.
- **Seed** nằm ở `lib/db/seeds/master-data.ts` (task.md ghi `seed/` nhưng task 01 đã dùng `seeds/`). Tọa độ là giá trị gần đúng cho dữ liệu mẫu. Sao Việt dùng chung mã THEPNL, CATLAI, CL-ST, ONE, MSK, CX-THUDUC với Phúc An để chứng minh hai công ty dùng cùng mã được.
- **Token thêm:** `--container-table: 860px` (bề rộng tối thiểu bảng WorkTable). Các token còn lại có sẵn.
- **`creditLimit` chuẩn hóa bằng chuỗi** (không có phép tính nên không cần decimal.js ở tầng zod); lưu DECIMAL(18,2).
- **Ngoài phạm vi, giữ nguyên:** hạn mức tín dụng chỉ lưu, chưa chặn Order; chọn tọa độ trên bản đồ (task 13/14); import Excel (task 24).
