# Tiến độ 08-trip-combining

Trạng thái: ⬜ chưa làm · 🔄 đang làm · ❓ có code chưa rà soát · ⚠️ khác task.md · ❌ thiếu · ✅ xong

| Bước | Nội dung | Trạng thái | Commit |
|---|---|---|---|
| 1 | Test ma trận Rule 1 đến 8 và tách chuyến (đỏ) | ✅ | |
| 2 | Ghép TWIN_20 và chọn tripMode doanh thu | ⬜ | |
| 3 | COMBINED và Street Turn | ⬜ | |
| 4 | Tách chuyến và hủy Order có chuyến | ⬜ | |
| 5 | Tính lại giá | ⬜ | |
| 6 | Server Action và thao tác trên màn Điều vận | ⬜ | |
| 7 | Hoàn tất | ⬜ | |

## Nhật ký
<!-- Sau mỗi bước: ngày, đã làm gì, kết quả Kiểm tra, việc người dùng cần làm thủ công. -->
### Bước 1 — 23/10/2026
- Kế hoạch được duyệt, lưu nguyên văn vào `plan.md`; nhánh `feat/08-trip-combining` tạo từ `feat/07-dispatch-kanban`.
- Schema và migration `0007_trip_combining`: `tractors.tare_weight_tons`, `consolidated_trips.allocation_review_required` (sửa spec 02). Chạy được trên DB trống trong test; chưa thử trên DB có dữ liệu (hai cột nullable hoặc có mặc định).
- Mã lỗi mới trong `packages/shared/errors.ts`; zod schema `createConsolidatedTripSchema`, `addContainerToTripSchema`, `removeContainerFromTripSchema`, `linkStreetTurnSchema`, `setStreetTurnApprovalSchema`, `listStreetTurnsSchema`; `parseDispatchSettings` thêm `streetTurnFee`, `parsePricingSettings` mới (`shareTwinDiscountWithCustomer`).
- Khung hàm chưa cài đặt (có `eslint-disable` tạm, gỡ khi cài đặt): `rules/{twin20,weight,dangerous-goods,street-turn,combined-sequence}.ts`, `consolidate.service.ts`, `street-turn.service.ts`, `split.service.ts` (kèm `detachContainersFromTrips`), `billing/reprice.service.ts`; nối vào `DispatchService`; `OrderServiceOptions` nhận `detachFromTrips`, `publishDispatch`.
- Test mới (đỏ): `consolidate.rules.int.test.ts` (48 test: Rule 1 đến 8, tra giá khi ghép, quyền và tenant, `addContainerToTrip`, ghép chéo 5 lần), `split.service.int.test.ts` (12 test), `billing/reprice.service.int.test.ts` (9 test), `rules/consolidation.test.ts` (20 test thuần, 13 đỏ, 7 xanh vì là trường hợp "cho phép" của khung hàm). `dispatch.test-world.ts` thêm `newOrder`, `newTwinPair`, `newTwinTrip`, `stopTimes`, `setSettings`, `orderService`, `tariffs`.
- Kiểm tra: `pnpm --filter core exec vitest run --project int consolidate.rules split.service reprice.service` chạy và đỏ 65/65 vì `INTERNAL_ERROR "Chưa cài đặt (task 08)"` hoặc sai mã lỗi; mỗi Rule 1 đến 8 có ít nhất 1 test chặn và 1 test cho phép. `pnpm typecheck` và `pnpm lint` sạch.
- Quyết định phát sinh: xem `decisions.md` mục 1 đến 10.
- Việc người dùng cần làm: duyệt thêm 2 cột mới ở migration `0007` (tự trọng đầu kéo, cờ Kế toán) nếu không đồng ý thì báo để đổi cách làm.
