# Tiến độ 07-dispatch-kanban

Trạng thái: ⬜ chưa làm · 🔄 đang làm · ❓ có code chưa rà soát · ⚠️ khác task.md · ❌ thiếu · ✅ xong

| Bước | Nội dung | Trạng thái | Commit |
|---|---|---|---|
| 1 | Truy vấn bảng điều vận | ✅ | |
| 2 | Mức hạn và chữ đếm ngược | ⬜ | |
| 3 | SSE realtime theo tenant | ⬜ | |
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
