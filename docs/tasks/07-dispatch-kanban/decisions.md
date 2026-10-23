# Quyết định 07-dispatch-kanban

## Đã chốt
<!-- Quyết định đã chốt trước khi làm (nếu có), kèm ngày. -->
- 1 Order = 1 Booking/B/L chứa nhiều container (`order_containers`); container là đơn vị điều vận, tính giá, DEM/DET, ePOD và nhận chi phí phân bổ (16/10/2026, PO; spec 01 mục 3 "[SỬA theo PO 16/10]", spec 02 nhóm 5).
- Mỗi thẻ trên Kanban là một container, thẻ cùng Order gom nhóm được (spec 03 mục 5 "[SỬA]", theo quyết định 16/10/2026 ở trên).
- Giao diện theo Design System "TMS Container" phiên bản token 2, hướng xanh dương thiết kế lại theo ui-ux-pro-max (21/10/2026, `docs/DESIGN_SYSTEM.md`); chỉ dùng token, không tự đặt mã màu.

## Phát sinh khi làm
<!-- Chỗ làm khác task.md, spec hoặc thiết kế: lý do, ai đồng ý, đã sửa spec chưa. -->

### Chốt ở Plan mode (23/10/2026)
- Cài `@dnd-kit/core` (người dùng đồng ý); không cài `@dnd-kit/utilities`, tự viết transform.
- Người dùng cho toàn quyền: làm hết các bước, commit sau mỗi bước, chỉ dừng khi thật sự mơ hồ.

### Suy ra khi làm Bước 1 (không dừng, báo trong báo cáo)
- **Phân cột**: Chờ điều = container `PENDING` của Order `CONFIRMED`/`IN_PROGRESS` mà Stop đầu chưa có giờ hoặc giờ không sau hết ngày xem (tồn từ ngày trước vẫn hiện), cộng container có chuyến `PLANNED` mà không còn assignment hoạt động (sau Hoàn tác, thẻ mang `trip` để gán lại dùng chuyến cũ). Các cột chuyến lấy chuyến giao với ngày xem. Chờ móc rơ moóc chưa truy vấn (task 09).
- **Khung giờ gợi ý** của thẻ chưa có chuyến = giờ Stop đầu + 3,5 giờ (`DEFAULT_TRIP_HOURS`), vì `routes` chưa có thời lượng chuẩn; thẻ chưa có giờ Stop đầu thì không có khung.
- **Nhãn thiếu chứng từ**: schema không có cờ nên suy ra từ `containerNo` trống và cả `cargoWeightTons` lẫn `vgmTons` trống. Cont lạnh = loại kết thúc bằng `RF`; Street Turn = `linkedContainerId` khác null.
- **Phân trang**: tối đa 100 thẻ mỗi cột (`BOARD_PAGE_SIZE`), cursor = (giờ bắt đầu, id) mã hóa base64url; thẻ chưa có giờ xếp cuối. Lọc và phân trang làm trong bộ nhớ sau khi ghép vì `TenantDb` chỉ chọn một bảng; 300 thẻ mất 136 ms nên chưa cần thêm index.
- **Làn xe** theo đầu kéo (không có cặp xe–tài xế–rơ moóc mặc định); khối chuyến gom theo chuyến, thêm khối bảo dưỡng từ `maintenance_orders`; nhãn giấy tờ đầu kéo và GPLX tài xế trong chuyến ≤ 15 ngày hoặc đã hết hạn; "sắp đến kỳ bảo dưỡng" khi còn ≤ 1000 km đến `nextMaintenanceOdometer`. Chưa có khối "tài xế nghỉ phép" trên làn vì không có liên kết tài xế–xe; bảng gán xe vẫn chặn tài xế `OFF_DUTY`.
- **Chữ đếm ngược**: thẻ Kanban dùng `deadlineStatus` (có ngày + giờ khi từ 1 ngày trở lên, "quá" viết thường); danh sách Order giữ `formatRemaining` cũ để không đổi chữ đang chạy. Package `shared` được thêm chạy test bằng vitest (cùng phiên bản đã có trong workspace).
- **Quyền xem** dùng `dispatch.view` (gồm cả Quản lý đội xe; task.md chỉ ghi OWNER/ADMIN/DISPATCHER/VIEWER).
