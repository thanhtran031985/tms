# Tiến độ 07-dispatch-kanban

Trạng thái: ⬜ chưa làm · 🔄 đang làm · ❓ có code chưa rà soát · ⚠️ khác task.md · ❌ thiếu · ✅ xong

| Bước | Nội dung | Trạng thái | Commit |
|---|---|---|---|
| 1 | Truy vấn bảng điều vận | ✅ | |
| 2 | Mức hạn và chữ đếm ngược | ✅ | |
| 3 | SSE realtime theo tenant | ✅ | |
| 4 | Giao diện bảng Kanban và lịch xe (chỉ hiển thị) | ⬜ | |
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
