# 07-dispatch-kanban — Giao diện Kanban điều vận

> Giai đoạn: GĐ2 · Phụ thuộc: 06 · Nhánh git: `feat/07-dispatch-kanban`
> Nguồn: `docs/specs/07_implementation_tickets.md` TICKET-07; spec `03_dispatch_and_concurrency.md` mục 1 bước 7, 8, 9 (realtime, `RESOURCE_BUSY_RETRY`, `STALE_DATA`), mục 2 Rule 7, 8 (nhãn cảng, cut-off đỏ) và mục 5 (Giao diện Kanban); spec `01_core_architecture_and_grill_logs.md` Rule 3 (Optimistic UI), Rule 4, 5 và mục 2 (`/src/app/api/v1/stream`); spec `05_advanced_workflows_and_ai.md` mục 5 (DEM/DET theo từng container); spec `08_nonfunctional_security_ops.md` mục 1 (Kanban < 2 giây với 300 thẻ) và mục 7 (màn 1366px); PRD `docs/PRD.md` mục C2, C4, F3

## Mục tiêu
Sau task này, Điều vận mở bảng Kanban, thấy mỗi container là một thẻ (gom theo Order) nằm đúng cột trạng thái, kèm nhãn cảng, đếm ngược cut-off, DEM, DET và cảnh báo giấy tờ, bảo dưỡng. Điều vận kéo thẻ vào xe trên lịch theo giờ (hoặc chọn thẻ rồi chọn xe bằng bàn phím) và thấy kết quả ngay; nếu người khác vừa giành mất tài xế đó thì thẻ quay về chỗ cũ kèm lý do. Mọi Điều vận đang mở bảng đều thấy thay đổi của nhau gần như tức thì.

## Phạm vi
**Làm:**
- Truy vấn dữ liệu bảng điều vận theo ngày, có lọc khu vực, khách hàng, chiều hàng, ô tìm; phân trang, không tải toàn bộ đơn của tenant.
- Kanban `dnd-kit` + `useOptimistic`: 6 cột mặc định (Chờ điều → Đã lên kế hoạch → Đã điều → Đang chạy → Chờ móc rơ moóc → Hoàn thành chờ chứng từ); mỗi thẻ là một container; gom nhóm và thu gọn theo Order.
- Kéo thẻ container vào thẻ tài xế/đầu kéo trên làn thời gian theo ngày để tạo assignment; bảng gán xe khi chọn thẻ ở cột Chờ điều, mỗi xe có lý do được hoặc không được điều.
- Rollback khi action trả `ok: false`, thông báo theo mã lỗi; xử lý `STALE_DATA` và `RESOURCE_BUSY_RETRY`; thông báo kèm "Hoàn tác" sau khi gán.
- Cập nhật realtime qua SSE (`/api/v1/stream/dispatch`) đọc Redis Pub/Sub.
- Nhãn trên thẻ: `portReadinessStatus` (Có EDO, Chờ EDO, Có lệnh cấp rỗng, HOLD hải quan), đếm ngược DEM/DET/cut-off, Cont lạnh, Hàng nguy hiểm, Street Turn, chứng từ thiếu; cảnh báo xe sắp đến kỳ bảo dưỡng và giấy tờ sắp hết hạn.
- E2E Playwright hai trình duyệt.

**Không làm (thuộc task khác):**
- Thao tác ghép chuyến TWIN_20/COMBINED, Street Turn, tách chuyến trên Kanban (task 08).
- Nút "Drop Trailer", tạo Stop `HOOK_TRAILER` (cột Chờ móc rơ moóc có dữ liệu từ task 09; task này hiện cột và trạng thái trống của cột).
- Duyệt chứng từ ePOD/EIR (task 12); cột "Hoàn thành chờ chứng từ" chỉ hiển thị.
- Bản đồ đội xe (task 13, 14) và trang chủ (task 22).
- Nút "Đặt lại dữ liệu mẫu" trên preview chỉ là công cụ của bản thiết kế, không làm.

## Thiết kế
- `designs/components/Screen03-Dispatch/` (đọc README.md và preview.html; 4 trạng thái: Bình thường; Đang tải là skeleton cột và lịch xe; Trống là chưa có container cần điều hôm nay kèm nút "Tạo Order"; Lỗi giữ bảng lúc tải cuối, cảnh báo gán lúc này có thể trùng với người khác và nút "Thử lại"; cột không khớp bộ lọc ghi "Không có container nào khớp bộ lọc").
- Thành phần: `designs/components/ContainerCard/` (một thẻ một dòng `order_containers`, `<button>` có `aria-label`, `aria-pressed` khi chọn, `is-dragging` có `shadow-popover`), `designs/components/DeadlineTimeline/` (quy tắc mức hạn và cách viết "còn 2 giờ 15", "Quá 35 phút"), `designs/components/StatusChip/` (`tms-chip-sm` trên thẻ), `designs/components/FilterTabs/` (Tất cả / Xuất / Nhập có số đếm), `designs/components/Field/` (ô lọc), `designs/components/Alert/`, `designs/components/EmptyState/`, `designs/components/Button/`, `designs/components/AppShell/`.
- Mức chip: dưới 3 giờ hoặc quá hạn `crit`, trong 8 giờ `warn`, xa hơn `info`; màu luôn kèm icon và chữ. Giờ hiển thị theo múi giờ tenant. Dùng tốt trên 1366px.

## Quyết định kiến trúc
- Đọc dữ liệu: `packages/core/modules/dispatch/board.query.ts` `getDispatchBoard(ctx, { date, zone?, customerId?, direction?, q?, cursor? })` trả cột, thẻ, làn xe; một container một thẻ. Phân cột: Chờ điều = container `PENDING` của Order `CONFIRMED`/`IN_PROGRESS` chưa có chuyến hoạt động; Đã lên kế hoạch = chuyến `PLANNED`; Đã điều = `DISPATCHED`; Đang chạy = `IN_TRANSIT`; Chờ móc rơ moóc = Stop `HOOK_TRAILER` `PENDING`; Hoàn thành chờ chứng từ = chuyến `COMPLETED` mà container chưa `isEpodVerified`. Truy vấn có điều kiện `tenantId` và dùng index; mục tiêu tải lần đầu < 2 giây với 300 thẻ trong ngày.
- Mức hạn và câu chữ thời gian ở `packages/shared/deadline.ts` (dùng chung web, worker, app): nhận mốc UTC và múi giờ tenant, trả mức `crit`/`warn`/`info` và chuỗi "còn 2 giờ 15", "còn 1 ngày 16 giờ", "quá 35 phút".
- Mutation chỉ qua Server Action của task 06 (`assignResources`, `cancelAssignment`, `createSingleTrip`); component không gọi DB. Optimistic UI bằng `useOptimistic` (Rule 3): thẻ dời ngay, action trả `ok: false` thì trả thẻ về chỗ cũ và hiện `Alert` theo mã lỗi.
- Bảng thông báo theo mã lỗi ở `apps/web/src/features/dispatch/error-messages.ts`, viết tiếng Việt nói chuyện gì xảy ra và làm gì tiếp: `DRIVER_NOT_AVAILABLE`, `TRACTOR_NOT_AVAILABLE`, `TRAILER_NOT_AVAILABLE`, `RESOURCE_TIME_CONFLICT`, `DOCUMENT_EXPIRED`, `RESOURCE_BUSY_RETRY` ("đang có người gán cùng lúc, thử lại"), `STALE_DATA` (tải lại thẻ), các mã Rule 5, 6, 7 của task 06. Cảnh báo (`data.warnings`) cần xác nhận thì hiện hộp xác nhận; ghi đè giờ lái chỉ hiện cho `ADMIN`, bắt nhập lý do.
- Realtime: Route Handler `apps/web/src/app/api/v1/stream/dispatch/route.ts` bắt đầu bằng `requireRole([...])`, mở SSE, subscribe kênh `tenant:{ctx.tenantId}:dispatch`; client nhận sự kiện thì tải lại thẻ bị ảnh hưởng (theo id, so `version`), không tải lại cả bảng. Mất kết nối thì chuyển trạng thái Lỗi (giữ bảng cũ) và tự nối lại.
- Bàn phím: mọi thao tác điều vận làm được bằng bàn phím (designs/README.md): chọn thẻ bằng Enter/Space, chọn xe trong bảng gán xe, dnd-kit bật `KeyboardSensor`; thứ tự Tab theo thứ tự đọc.
- Cấu trúc web: route `apps/web/src/app/(tenant)/dispatch/page.tsx` chỉ định tuyến; view ở `apps/web/src/features/dispatch/` (`board.tsx`, `kanban-column.tsx`, `assign-panel.tsx`, `resource-lanes.tsx`, `use-dispatch-stream.ts`); `ContainerCard`, `StatusChip` trong `apps/web/src/components/ui/`.
- Quyền xem bảng: `OWNER`, `ADMIN`, `DISPATCHER`, `VIEWER`; `VIEWER` không thấy nút gán, không kéo được. Bộ lọc và ngày giữ trên URL (search params) để chia sẻ link.

## Các bước
### Bước 1 — Truy vấn bảng điều vận
- Viết test trước `packages/core/modules/dispatch/board.query.int.test.ts`: container vào đúng 6 cột theo trạng thái; Order `DRAFT` không có thẻ; container đã hủy không có thẻ; lọc theo ngày, khu vực (`locations.zone`/tuyến), khách, chiều hàng, ô tìm (số cont, mã Order, tên khách) đúng; phân trang ổn định; Tenant B không thấy thẻ của Tenant A; seed 300 thẻ trong ngày trả về dưới 2 giây.
- Viết `board.query.ts` và Server Action/loader đọc dữ liệu có `requireRole`.
**Kiểm tra:** `pnpm test --filter core -- board` xanh, test hiệu năng 300 thẻ dưới 2 giây.

### Bước 2 — Mức hạn và chữ đếm ngược
- Viết test trước `packages/shared/deadline.test.ts`: còn 2 giờ 15 là `crit`, còn 7 giờ 40 là `warn`, còn 20 giờ 40 là `info`, quá hạn 35 phút là `crit` với chữ "quá 35 phút", qua nửa đêm theo `Asia/Ho_Chi_Minh` hiện đúng ngày giờ.
- Viết `deadline.ts`.
**Kiểm tra:** `pnpm test --filter shared -- deadline` xanh.

### Bước 3 — SSE realtime theo tenant
- Viết test trước `apps/web/src/app/api/v1/stream/dispatch/route.test.ts` (Redis Testcontainers): client tenant A nhận sự kiện `dispatch.updated` của tenant A, không nhận của tenant B; chưa đăng nhập bị 401; `VIEWER` vẫn nhận được.
- Viết Route Handler và hook `use-dispatch-stream.ts` (tự nối lại, báo mất kết nối).
**Kiểm tra:** `pnpm test --filter web -- stream` xanh; mở `/api/v1/stream/dispatch` bằng `curl -N` khi đã đăng nhập thấy sự kiện xuất hiện sau khi gán một chuyến qua action.

### Bước 4 — Giao diện bảng Kanban và lịch xe (chỉ hiển thị)
- `apps/web/src/app/(tenant)/dispatch/page.tsx`, `features/dispatch/board.tsx`, `kanban-column.tsx`, `resource-lanes.tsx`, component `ContainerCard`, `StatusChip` trong `src/components/ui/`.
- Thanh đầu (H1 "Điều vận", ngày giờ), `FilterTabs` chiều hàng có số đếm, ô lọc; 6 cột có số đếm; thẻ đủ nội dung theo `ContainerCard` (số cont, loại, Order · khách, chiều · tuyến, chip, "Khung 14:30–16:20", biển số hoặc "Chưa có xe"); gom nhóm và thu gọn theo Order; lịch xe 05:00–23:00 có vạch "bây giờ"; nhãn bảo dưỡng và giấy tờ sắp hết hạn trên làn xe.
- Đủ 4 trạng thái và trạng thái cột không khớp bộ lọc.
**Kiểm tra:** mở `/dispatch` trên 1440×900 và 1366×768 so với `designs/components/Screen03-Dispatch/preview.html`, khớp bố cục, chip, chữ ở cả 4 trạng thái và chế độ Tối; cut-off sau `PORT_IN` hiện chip đỏ (Rule 8); đổi bộ lọc cập nhật số đếm từng cột.

### Bước 5 — Gán xe: chọn thẻ, kéo thả, optimistic, rollback, hoàn tác
- `assign-panel.tsx`: chọn thẻ ở cột Chờ điều mở bảng gán xe từ `listResourceAvailability` (task 06), mỗi xe kèm lý do; xe không được phép bị khóa và ghi lý do.
- Kéo thẻ vào làn tài xế/đầu kéo bằng dnd-kit (chuột và bàn phím); `useOptimistic` dời thẻ sang Đã lên kế hoạch và hiện khối chuyến trên lịch; action lỗi thì trả thẻ về và hiện `Alert` theo mã lỗi; `STALE_DATA` thì tải lại thẻ; `RESOURCE_BUSY_RETRY` thì báo thử lại; thành công hiện thông báo kèm "Hoàn tác" (gọi `cancelAssignment`); cảnh báo cần xác nhận hiện hộp xác nhận.
- Nhận sự kiện SSE thì cập nhật thẻ của người khác.
**Kiểm tra:** trên 1440×900 gán một container bằng chuột và một container chỉ bằng bàn phím đều được; tắt mạng giả lập khi gán thấy thẻ quay về và thông báo; bấm "Hoàn tác" thẻ về cột Chờ điều.

### Bước 6 — E2E hai trình duyệt
- `apps/web/e2e/dispatch-concurrency.spec.ts`: hai context Playwright đăng nhập hai Điều vận cùng tenant, cùng kéo hai container khác nhau vào cùng một tài xế trong khung giờ chồng nhau gần như đồng thời; trình duyệt thua thấy thẻ quay lại cột Chờ điều và thông báo lỗi đúng mã; trình duyệt thắng thấy thẻ ở Đã lên kế hoạch; cả hai sau vài giây thấy cùng trạng thái nhờ SSE.
- `apps/web/e2e/dispatch.spec.ts`: lọc Xuất/Nhập, mở bảng gán xe thấy xe "Đăng kiểm hết hạn, không được điều" bị khóa.
**Kiểm tra:** `pnpm e2e -- dispatch` xanh, chạy 5 lần liên tiếp không chập chờn.

### Bước 7 — Hoàn tất
- Chạy toàn bộ kiểm tra, cập nhật progress.md, đổi trạng thái dòng 07 trong `docs/tasks/README.md`, ghi vào decisions.md mọi chỗ code khác preview của Screen03.
**Kiểm tra:** `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` không lỗi; `pnpm e2e` xanh cho luồng điều vận chính; Route Handler SSE và mọi Server Action có `requireRole` và zod; đạt "Chấp nhận khi" của ticket: E2E Playwright: 2 trình duyệt cùng kéo một tài xế, trình duyệt thua thấy thẻ quay lại và thông báo lỗi.
