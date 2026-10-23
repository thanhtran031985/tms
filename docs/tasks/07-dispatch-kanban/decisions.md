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
- **Khác preview Screen03 (Bước 4)**: thanh đầu không có "Trang chủ", nút chế độ Tối và "Đặt lại dữ liệu mẫu" (AppShell đã có chế độ Tối, nút đặt lại chỉ là công cụ của bản thiết kế); thêm ô chọn Khách hàng và Khu vực vì task.md yêu cầu lọc theo khách hàng và khu vực mà preview chưa có; thêm điều khiển đổi ngày (task.md: xem theo ngày). Làn xe theo đầu kéo, không có khối "Nghỉ phép cả ngày" (không có liên kết tài xế–xe).
- **Token mới** thêm vào theme cho bảng điều vận: `--spacing-kcol`, `--spacing-board`, `--spacing-lane-label`, `--spacing-lane-grid`, `--spacing-lane-row`, `--spacing-kcol-min`.
- **Bảng gán xe khác preview (Bước 5)**: preview bấm một xe là gán ngay vì mỗi dòng xe đã gắn sẵn tài xế; dữ liệu thật không có cặp xe–tài xế–rơ moóc mặc định, nên chọn đầu kéo rồi chọn tài xế và rơ moóc (chọn sẵn phương án rảnh đầu tiên) và bấm "Gán xe". Thả thẻ vào làn xe thì mở cùng bảng với đầu kéo đã chọn, không gán ngay.
- **Kéo bàn phím**: thẻ đang chọn có thêm nút "Kéo vào làn xe" (không có trong thiết kế) vì Enter/Space của thẻ đã dành cho việc chọn thẻ; cách chính cho bàn phím vẫn là chọn thẻ rồi chọn xe trong bảng gán xe.
- **Thẻ chưa có giờ Stop đầu** và chưa có chuyến: bảng gán xe báo cần nhập giờ trong Order, chưa cho gán (chưa có khung giờ để tạo chuyến). Gán xe cho thẻ chưa có chuyến chạy `createSingleTrip` rồi `assignResources`; lỗi giữa chừng thì chuyến đã tạo vẫn nằm ở Chờ điều (thẻ mang chuyến) để gán lại, không có chuyến mồ côi.
- **Cập nhật SSE** làm mới đúng các thẻ bị ảnh hưởng và làm mới lịch xe/số đếm bằng `router.refresh()` (tối đa 2 giây một lần).
- **Gói thư viện**: `@dnd-kit/core` đã được duyệt; `@dnd-kit/utilities`, `@dnd-kit/accessibility` đi kèm làm phụ thuộc, không dùng trực tiếp.
- **Test e2e dùng dữ liệu mẫu chung**: `db:seed` không xóa chuyến do e2e tạo ra nên `dispatch.spec.ts` và `dispatch-concurrency.spec.ts` gọi `resetDispatchContainers` (SQL trực tiếp, vì web không phụ thuộc drizzle-orm) trước khi chạy; `dispatch.spec.ts` chạy tuần tự vì dùng chung cont `MAEU2388422`.
- **e2e và Redis**: server Next trong e2e cần `REDIS_URL` để SSE chạy; `playwright.config.ts` mặc định `redis://localhost:6379` (Redis của docker compose) khi môi trường chưa có.
