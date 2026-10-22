# Quyết định 03-pricing-engine

## Đã chốt
<!-- Quyết định đã chốt trước khi làm (nếu có), kèm ngày. -->
- Pricing Engine tra giá cho từng `order_containers` và snapshot vào `order_containers.baseFreightAmount`, `orders.totalFreightAmount` là tổng; hệ quả của quyết định 1 Order nhiều container (16/10/2026, PO; spec 06 mục 3 "[SỬA]").
- Không tìm thấy giá thì trả `TARIFF_NOT_FOUND` và bắt nhập giá tay, không bao giờ mặc định 0 (ADR-005; spec không ghi ngày chốt).
- Giao diện theo Design System "TMS Container" phiên bản token 2, hướng xanh dương thiết kế lại theo ui-ux-pro-max (21/10/2026, `docs/DESIGN_SYSTEM.md`); chỉ dùng token, không tự đặt mã màu.

## Phát sinh khi làm
<!-- Chỗ làm khác task.md, spec hoặc thiết kế: lý do, ai đồng ý, đã sửa spec chưa. -->

### 22/10/2026 — quyết định khi làm task 03
- **Quyền:** thêm `tariff.view` (mọi vai trò web) và `tariff.write` (OWNER, ADMIN, ACCOUNTANT: tạo giá mới, sửa giá chưa hiệu lực, import). Sửa/đóng giá ĐANG hiệu lực dùng `pricing.editActive` đã có = chỉ ADMIN theo PRD A4 và test task 01. `task.md` ghi "ADMIN (và OWNER)": giữ ADMIN-only theo PRD A4, **chờ PO xác nhận** (đổi một dòng ở `permissions.ts` nếu muốn thêm OWNER). Service cũng kiểm vai trò, không chỉ action.
- **`TenantDb.select` mở rộng** `{ orderBy, limit, forUpdate }` để engine có đúng một câu có `ORDER BY priorityExpr, validFrom DESC LIMIT 1` và để kiểm tra chồng lấn dùng `SELECT … FOR UPDATE`, không cần `_unsafeExecutor` (bị cấm trong modules). Vẫn tự AND `tenantId`.
- **Chặn chồng lấn:** `SELECT … FOR UPDATE` đơn thuần không khóa được khoảng trống khi chưa có dòng nào, nên mỗi lần ghi trước hết khóa một dòng mutex theo khóa 4D bằng `nextNumber(tx, 'TL:<F|E>:<sha1>')` rồi mới `SELECT … FOR UPDATE` các bản cùng khóa. Dùng chính cơ chế đã chứng minh ở task 01; bảng `number_sequences` có thêm các dòng khóa này (tiền tố `TL:`). Test 5 lần song song + 8 giao dịch cùng khóa luôn chỉ một thành công.
- **Khóa 4D của bảng phí:** `routeId` NULL (mọi tuyến) và `routeId` cụ thể là hai khóa khác nhau (cụ thể thắng khi tra giá), nên cùng mã phí có thể đồng thời có bản "mọi tuyến" và bản theo tuyến.
- **Quy tắc sửa giá:** bản `validFrom` ≤ hôm nay (giờ tenant) không sửa trực tiếp; Quản trị "điều chỉnh giá" = đóng bản cũ `validTo = ngày hiệu lực mới − 1` + tạo bản mới cùng khóa, ngày hiệu lực mới không được trong quá khứ và phải sau ngày bắt đầu của bản cũ (không viết lại lịch sử đã dùng); đóng giá cũng chỉ cho ngày ≥ hôm nay. "Xóa" giá chưa hiệu lực = `isActive=false` (hiện chip "Đã ngừng"), giá đã hiệu lực chỉ đóng.
- **Fee không có ứng viên:** `resolveFees` trả `TARIFF_NOT_FOUND` khi không có bản ghi nào khớp, trả `ok` với danh sách rỗng khi có ứng viên nhưng tất cả bị `isExcluded`. `resolveFreight` luôn `TARIFF_NOT_FOUND` nếu không thấy, không bao giờ 0. `basePrice` > 0; `amount` > 0 trừ khi `isExcluded`.
- **Tra giá nhận `customerId = null`** để tra định mức chi phí chung (chuyến ghép hai khách, spec 06 mục 3).
- **Import:** `core` không phụ thuộc thư viện Excel (web đọc file thành ma trận); thư viện `read-excel-file` + `write-excel-file` (nhỏ, MIT; không dùng `xlsx` trên npm vì bản đó bị bỏ và có lỗ hổng đã biết, không dùng `exceljs` vì nhiều phụ thuộc cũ). Người dùng đã giao toàn quyền cho task nên cài không hỏi riêng. Cột theo mã nghiệp vụ (mã tuyến, mã khách) thay vì UUID.
- **Lọc ở client, không phân trang** (như task 02): đủ cho vài trăm dòng giá mỗi công ty.
- **Spec không sai.** Chưa phải sửa spec 02/06.
