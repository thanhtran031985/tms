# Tiến độ 08-trip-combining

Trạng thái: ⬜ chưa làm · 🔄 đang làm · ❓ có code chưa rà soát · ⚠️ khác task.md · ❌ thiếu · ✅ xong

| Bước | Nội dung | Trạng thái | Commit |
|---|---|---|---|
| 1 | Test ma trận Rule 1 đến 8 và tách chuyến (đỏ) | ✅ | 4bfa40f |
| 2 | Ghép TWIN_20 và chọn tripMode doanh thu | ✅ | |
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

### Bước 2 — 23/10/2026
- `rules/twin20.ts` (Rule 1), `rules/weight.ts` (Rule 2 cộng dồn, có tự trọng đầu kéo; `containerWeight` chuyển sang đây, `physical.ts` re-export và gọi `checkTripWeight` cho trường hợp một cont), `rules/dangerous-goods.ts` (Rule 6 khác khách), `rules/trip-shape.ts` (số container khớp chế độ, gom Rule 1, 4, 6 trước khi chọn xe).
- `assign.service.ts`: tách `applyAssignment` (đánh giá và ghi, dùng chung cho assignResources, createConsolidatedTrip, addContainerToTrip); `evaluateAssignment` nhận `tripMode` và áp Rule 1, 2 (tổng), 6 cho cả chuyến, `checkPhysical` có `skipWeight`.
- `consolidate.service.ts`: `createConsolidatedTrip` (có hoặc không `resources`) và `addContainerToTrip`; khóa chuyến, drivers, tractors, trailers rồi order_containers theo id tăng dần. `container-patch.ts` đặt `appliedTripMode` và `repriceRequired` chỉ cho cặp cùng khách khi `shareTwinDiscountWithCustomer` bật (mặc định bật), ghi audit `MARK_REPRICE`; phát `dispatch.updated` kèm cả hai container.
- Kiểm tra: `consolidate.rules.int.test.ts` 33/44 xanh, gồm Rule 1, 2, 5, 6, 7, 8, tra giá, quyền, tenant, `addContainerToTrip` và ghép chéo; 11 test còn đỏ đều thuộc Street Turn và COMBINED (bước 3). Test song song chạy 3 lượt × 5 vòng không deadlock. Test cũ của dispatch (9 file, 120 test) vẫn xanh sau khi tách `applyAssignment`. `pnpm typecheck` và eslint thư mục dispatch sạch.
- Chưa làm: `dispatchTrip` kiểm Street Turn và Rule 4 (bước 3).
