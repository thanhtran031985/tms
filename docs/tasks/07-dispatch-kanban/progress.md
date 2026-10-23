# Tiến độ 07-dispatch-kanban

Trạng thái: ⬜ chưa làm · 🔄 đang làm · ❓ có code chưa rà soát · ⚠️ khác task.md · ❌ thiếu · ✅ xong

| Bước | Nội dung | Trạng thái | Commit |
|---|---|---|---|
| 1 | Truy vấn bảng điều vận | ✅ | |
| 2 | Mức hạn và chữ đếm ngược | ✅ | |
| 3 | SSE realtime theo tenant | ✅ | |
| 4 | Giao diện bảng Kanban và lịch xe (chỉ hiển thị) | ✅ | |
| 5 | Gán xe: chọn thẻ, kéo thả, optimistic, rollback, hoàn tác | ⬜ | |
| 6 | E2E hai trình duyệt | ⬜ | |
| 7 | Hoàn tất | ⬜ | |

## Nhật ký
<!-- Sau mỗi bước: ngày, đã làm gì, kết quả Kiểm tra, việc người dùng cần làm thủ công. -->

### 23/10/2026 — Bước 1: truy vấn bảng điều vận ✅
- Plan mode xong, kế hoạch lưu ở plan.md. Người dùng duyệt cài `@dnd-kit/core` (chỉ gói này, cài ở Bước 5) và cho toàn quyền: làm lần lượt các bước, commit sau mỗi bước.
- Đã làm: kiểu dùng chung `packages/shared/dispatch-board.ts`; zod `getDispatchBoardSchema`, `loadBoardCardsSchema`; `modules/dispatch/board.query.ts` (`getDispatchBoard`: 6 cột, lọc ngày/khu vực/khách/chiều/ô tìm, số đếm theo chiều, phân trang cursor, làn xe; `getBoardCards` cho SSE) nối vào `DispatchService`; Server Action `loadDispatchBoard`, `loadBoardCards` (quyền xem, zod, không làm mới trang); seed bổ sung nhãn cảng/DEM/DET cho cont mẫu.
- Kiểm tra: `board.int.test.ts` 23 test xanh (phân cột, Order nháp/hủy, ngày theo giờ Việt Nam, lọc, phân trang không trùng/sót kể cả khi chèn thẻ giữa hai trang, tách tenant, quyền); tải bảng 300 thẻ = 136 ms (mục tiêu < 2 giây); `actions.test.ts` 10 xanh; seed test 5 xanh; `pnpm typecheck` và `pnpm lint` sạch.
- Việc người dùng cần làm: không có.

### 23/10/2026 — Bước 2: mức hạn và chữ đếm ngược ✅
- Đã làm: `packages/shared/deadline.ts` có `deadlineStatus(mốc, now, múi giờ, {hold})` trả `level`, `text` ("còn 2 giờ 15", "còn 1 ngày 16 giờ", "quá 35 phút") và `absolute` (giờ tuyệt đối theo múi giờ tenant, thêm ngày/tháng khi khác ngày); `deadlineLevel` và `formatRemaining` (cách viết cũ của danh sách Order) chuyển sang đây, `apps/web/src/lib/deadline.ts` re-export nên các màn Order không đổi.
- Package `shared` chưa có chạy test: thêm script `test` và devDependency `vitest ^5.0.5` (đúng phiên bản core và web đang dùng, không tải gói mới; lockfile chỉ thêm liên kết).
- Kiểm tra: `pnpm test --filter shared -- deadline` 14 test xanh (2 giờ 15 crit, 7 giờ 40 warn, 20 giờ 40 info, quá 35 phút crit, qua nửa đêm giờ Việt Nam, HOLD, ranh giới 3 giờ và 8 giờ); test cũ của web 7 xanh; `pnpm typecheck`, `pnpm lint` sạch.
- Việc người dùng cần làm: không có.

### 23/10/2026 — Bước 3: SSE realtime theo tenant ✅
- Đã làm: `features/dispatch/stream-handler.ts` (`createDispatchStreamHandler`: `requireRole(dispatch.view)` rồi đăng ký kênh `tenant:{tenantId}:dispatch` bằng kết nối Redis riêng, đẩy `event: dispatch.updated`, nhịp tim 15 giây, hủy đăng ký khi client ngắt; bỏ thông điệp hỏng hoặc mang tenantId khác); `app/api/v1/stream/dispatch/route.ts` mỏng (GET); `proxy.ts` trả JSON 401 cho `/api/v1/*` chưa đăng nhập thay vì chuyển hướng 307; hook `use-dispatch-stream.ts` (EventSource, tự nối lại có chờ tăng dần, trạng thái `connecting/open/lost`, gọi `onReconnect` để tải lại sau khi nối lại).
- Kiểm tra: `pnpm test --filter web -- stream` 9 test xanh, gồm 7 test route với Redis thật (tenant A nhận của A không nhận của B, VIEWER nhận được, 401/403, bỏ sự kiện sai tenant, nhịp tim, ngắt kết nối thì NUMSUB về mức cũ, lỗi lạ không bị nuốt); `pnpm typecheck`, `pnpm lint` sạch. Phần `curl -N` đăng nhập thật và 401 qua proxy kiểm trong E2E ở Bước 6.
- Việc người dùng cần làm: không có.

### 23/10/2026 — Bước 4: giao diện bảng Kanban và lịch xe ✅
- Đã làm: trang `/dispatch` (`page.tsx`, `loading.tsx`, `error.tsx`) và `features/dispatch/`: `board.tsx` (đầu trang H1 + ngày/đổi ngày, `FilterTabs` Tất cả/Xuất/Nhập có số đếm, ô tìm, ô chọn khách và khu vực, bộ lọc nằm trên URL), `kanban-column.tsx` (6 cột, gom và thu gọn theo Order, "Tải thêm"), `dispatch-card.tsx` + `components/ui/container-card.tsx` (thẻ theo ContainerCard), `card-chips.ts` + `card-chip-list.tsx` (chip cut-off/DEM/DET/cảng/Cont lạnh/Hàng nguy hiểm/Street Turn/thiếu chứng từ, Rule 8 chip đỏ), `resource-lanes.tsx` (lịch xe 05:00–23:00, vạch "bây giờ", nhãn bảo dưỡng và giấy tờ), `board-skeleton.tsx` (đang tải), `board-state.ts` (gộp thẻ theo SSE, nối trang), `board-loader.ts`, `dispatch-page-auth.ts`; menu "Điều vận" thành liên kết thật. Bảng đã nối SSE: nhận sự kiện thì tải lại đúng các thẻ bị ảnh hưởng và gộp vào bảng, làm mới lịch xe (tối đa 2 giây một lần); mất kết nối hiện Alert "Không tải được thay đổi mới từ HH:mm…" kèm Thử lại, giữ bảng cũ.
- Token mới thêm vào theme (`globals.css`): `--spacing-kcol` (210px), `--spacing-board` (1320px), `--spacing-lane-label` (240px), `--spacing-lane-grid` (1100px), `--spacing-lane-row` (72px), `--spacing-kcol-min` (200px); thiết kế dùng số px này nhưng token chưa có.
- Kiểm tra: web unit 146 test xanh (thêm `board-view`, `card-chips`, `board-state`); `e2e/dispatch.spec.ts` 5 test xanh (6 cột đúng chữ, thẻ đúng cột và đúng nhãn, khối chuyến trên làn 51C-482.17, 1366×768 không tràn ngang, lọc Xuất/Nhập/ô tìm cập nhật số đếm và URL, cột trống ghi "Không có container nào khớp bộ lọc.", API chưa đăng nhập 401 và trang chuyển về đăng nhập, menu); đã xem ảnh chụp 1440 và 1366 đối chiếu `Screen03-Dispatch`; `shell.spec` cập nhật số liên kết menu (6 liên kết, 5 chưa có trang) và số lần Tab, xanh. `pnpm typecheck` và `pnpm lint` sạch.
- Chưa kiểm bằng mắt: chế độ Tối (chỉ dùng token nên tự đổi theo) và trạng thái Lỗi/Trống thật trên trình duyệt (trạng thái Lỗi dựng từ SSE mất kết nối, kiểm trong Bước 6).
- Lưu ý với người dùng: server Next cần `REDIS_URL` trong môi trường (`.env.example` đã có biến này); chạy e2e thiếu biến này thì SSE báo lỗi 500. Ba test cũ của `orders.spec.ts` đang đỏ từ trước (tiêu đề H1 "Quản lý Đơn hàng" không còn khớp mẫu mong đợi và hai test liên quan), không thuộc task này.

### 23/10/2026 — Bước 5: gán xe (chọn thẻ, kéo thả, optimistic, rollback, hoàn tác) ✅
- Cài `@dnd-kit/core` (đã được người dùng duyệt ở Plan mode; kéo theo `@dnd-kit/accessibility` và `@dnd-kit/utilities` là phụ thuộc của chính gói này).
- Đã làm: `assign-panel.tsx` (bảng gán xe từ `listResourceAvailability`: đầu kéo kèm lý do, xe không được phép bị khóa và ghi lý do; chọn đầu kéo rồi chọn tài xế, rơ moóc đã chọn sẵn phương án rảnh đầu tiên; focus chuyển vào bảng khi chọn thẻ), `resource-reasons.ts`, `error-messages.ts` (câu theo mã lỗi: trùng giờ, không điều được, giấy tờ, Rule 5/6/7, tải trọng, `RESOURCE_BUSY_RETRY`, `STALE_DATA`, mạng...), `assign-flow.ts` (`performAssign`: tạo chuyến SINGLE nếu thẻ chưa có chuyến rồi gán; `safeCall` bọc lỗi mạng), `confirm-dialog.tsx` (hộp xác nhận thiếu khối lượng và ghi đè giờ lái có ô lý do, chỉ ADMIN), `board.tsx` (`useOptimistic`: thẻ sang Đã lên kế hoạch và khối chuyến hiện trên lịch ngay; lỗi thì thẻ quay về; thông báo thành công 8 giây kèm "Hoàn tác" gọi `cancelAssignment`; `STALE_DATA` tải lại thẻ), `draggable-card.tsx` + `lane-dnd.ts` (chuột kéo cả thẻ từ 8px; bàn phím: thẻ đang chọn có nút "Kéo vào làn xe", Space nhấc, mũi tên xuống/lên đổi làn, Space thả; thông báo cho trình đọc màn hình bằng tiếng Việt), làn xe nhận thả (`resource-lanes.tsx`), `SelectField` cho phép ô chọn bị khóa. Người chỉ xem không chọn và không kéo được thẻ.
- Kiểm tra: web unit 150+ test xanh (`assign-flow`, `error-messages` và lý do, `board-state` optimistic); `e2e/dispatch.spec.ts` 12 test xanh, chạy 3 lần liên tiếp không chập chờn: bảng gán xe khóa "Đăng kiểm hết hạn, không được điều" và "Trùng giờ với chuyến khác", gán bằng chuột (có hộp xác nhận thiếu khối lượng) rồi Hoàn tác thẻ về Chờ điều, gán chỉ bằng bàn phím, mất mạng thì thẻ quay về kèm thông báo, kéo chuột vào làn mở bảng với đầu kéo đã chọn, kéo bằng bàn phím vào làn xe không điều được hiện lý do, người chỉ xem; `pnpm typecheck`, `pnpm lint`, `prettier --check` sạch.
- Việc người dùng cần làm: không có.
