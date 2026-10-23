# Tiến độ 08-trip-combining

Trạng thái: ⬜ chưa làm · 🔄 đang làm · ❓ có code chưa rà soát · ⚠️ khác task.md · ❌ thiếu · ✅ xong

| Bước | Nội dung | Trạng thái | Commit |
|---|---|---|---|
| 1 | Test ma trận Rule 1 đến 8 và tách chuyến (đỏ) | ✅ | 4bfa40f |
| 2 | Ghép TWIN_20 và chọn tripMode doanh thu | ✅ | c2da49e |
| 3 | COMBINED và Street Turn | ✅ | 02c2d5a |
| 4 | Tách chuyến và hủy Order có chuyến | ✅ | 3e2e021 |
| 5 | Tính lại giá | ✅ | 6d3e3a0 |
| 6 | Server Action và thao tác trên màn Điều vận | ✅ | |
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

### Bước 3 — 23/10/2026
- `rules/street-turn.ts` (Rule 3: cùng hãng, cùng loại, hãng cho phép, UNSTUFFING kết thúc trước STUFFING bắt đầu; thiếu giờ thì cảnh báo `SEQUENCE_NOT_VERIFIED`), `rules/combined-sequence.ts` (Rule 4: hai khoảng ở trên rơ moóc chồng nhau chỉ hợp lệ khi cả hai là cont 20 feet; cặp Street Turn coi như một vỏ).
- `street-turn.service.ts`: `linkStreetTurn` (khóa hai container theo id tăng dần, liên kết hai chiều, chép số cont, chuyển `detFreeUntil` sang cont Xuất, Stop `RETURN_EMPTY` chưa làm của cont Nhập thành `SKIPPED`, audit), `setStreetTurnApproval` (ghi số chấp thuận cho cả cặp), `listStreetTurns` (có `pendingOnly`), phí `STREET_TURN_FEE` theo `settings.dispatch.streetTurnFee` (khóa idempotency theo cont Xuất, nhập lại chỉ cập nhật dòng cũ), tổng Order đồng bộ qua `orders/order-totals.ts` (`syncOrderTotals`, dùng lại ở bước 4, 5).
- `trips.service.ts`: `dispatchTrip` chặn `STREET_TURN_NOT_APPROVED` khi cont đảo vỏ chưa có số chấp thuận.
- Kiểm tra: `consolidate.rules.int.test.ts` 44/44 xanh và `rules/consolidation.test.ts` 20/20 xanh, nghĩa là cả 8 Rule đều có test chặn và test cho phép; sau Street Turn, cont Xuất mang số cont của cont Nhập và Stop `RETURN_EMPTY` của cont Nhập là `SKIPPED`. `pnpm typecheck` và eslint core sạch.

### Bước 4 — 23/10/2026
- `split.service.ts`: `removeContainerFromTrip` (khóa chuyến rồi container, chỉ chuyến PLANNED hoặc DISPATCHED, `TRIP_LAST_CONTAINER` khi tách cont cuối) và `detachContainersFromTrips` (module Order gọi trong transaction hủy). Gỡ container: hủy assignment của Stop thuộc cont đó (CANCELLED, không xóa), bỏ dòng `trip_containers`, cont về PENDING, chuyến còn 1 cont thì về SINGLE, chuyến hết cont thì CANCELLED; cont đang tính giá ghép (`appliedTripMode` khác SINGLE) chuyển về SINGLE và đặt `repriceRequired`; phân bổ Kế toán sửa tay được đặt lại về số hệ thống, `allocationMethod` khỏi MANUAL, `allocationReviewRequired = true`, audit `RESET_ALLOCATION` và `REMOVE_CONTAINER`.
- `orders/service.ts`: `cancelContainerRow` gọi `detachFromTrips` trước khi hủy (đọc lại container mới nhất), `cancelContainer` và `cancelOrder` phát `dispatch.updated` sau commit qua `publishDispatch`. Không truyền hai tùy chọn thì hủy như task 04. Container nằm trên chuyến đang chạy (IN_TRANSIT) thì chặn hủy với `INVALID_STATUS_TRANSITION`.
- Kiểm tra: `split.service.int.test.ts` 12/12 và `orders/cancel.int.test.ts` 19/19 xanh; eslint và `tsc` core sạch.

### Bước 5 — 23/10/2026
- `billing/reprice.service.ts`: `repriceContainer` (khóa Order rồi container; bỏ qua cont đã hủy; giá tay giữ giá và xóa cờ; có `order_fees.invoiceId` giữ giá và giữ cờ; còn lại tra lại giá cước theo `appliedTripMode` và phụ phí TARIFF, cập nhật dòng cùng mã hoặc thêm mã mới, không đụng MANUAL và DEM/DET; ghi audit `REPRICE` giá cũ và mới kèm tariff; đồng bộ tổng Order) và `repriceFlagged` (quét cờ treo, lỗi từng cont thành `FAILED` mà không dừng cả lượt). Chạy lại nhiều lần an toàn (hết cờ thì `UNCHANGED`). Không tìm thấy giá: `TARIFF_NOT_FOUND`, giữ giá cũ và cờ.
- `lib/redis/publish.ts`: `PricingEvent`, kênh `tenant:{id}:pricing`, `publishPricingEvent`. Dispatch phát `pricing.reprice_required` sau commit khi ghép, ghép thêm và tách chuyến (qua dependency `publishPricing`).
- Worker (`apps/worker`): queue `pricing.reprice`, `jobs/reprice.ts` (`processRepriceJob`, `subscribePricingEvents` đăng ký `tenant:*:pricing` rồi đẩy job, `scheduleRepriceSweeps` mỗi 5 phút cho từng tenant ACTIVE), nối vào `startWorker` và dừng êm. Không thêm package (worker kiểm tra sự kiện bằng tay thay vì zod).
- Giới hạn đã biết: hủy container/Order đã gỡ khỏi chuyến chỉ đặt cờ, không phát sự kiện giá; job quét sẽ nhặt trong tối đa 5 phút. Phụ phí TARIFF không còn áp dụng theo bảng phí mới không bị xóa, chỉ cập nhật và thêm.
- Kiểm tra: `reprice.service.int.test.ts` 9/9 và `apps/worker` `reprice.int.test.ts` 5/5 xanh; `consolidate.rules` và `split.service` thêm kiểm tra phát sự kiện giá, 57/57 xanh; typecheck và eslint sạch.

### Bước 6 — 23/10/2026
- Server Action (`features/dispatch/actions.ts`, đều qua `defineAction` nên có `requireRole` và zod): `createConsolidatedTrip`, `addContainerToTrip`, `removeContainerFromTrip`, `linkStreetTurn`, `setStreetTurnApproval` (quyền gán xe) và `listStreetTurns` (quyền xem). `server/services.ts` nối `publishPricing` cho điều vận, `detachFromTrips` và `publishDispatch` cho Order (hủy container hoặc Order gỡ khỏi chuyến ghép).
- Dữ liệu thẻ: `BoardCard` thêm `trip.mode`, `streetTurnApprovalRef`, `repriceRequired`; chip mới "TWIN_20/COMBINED", "Street Turn chờ chấp thuận" (cảnh báo) và "Cần tính lại giá" (icon làm mới). Bảng gán xe xét cả chuyến ghép: rơ moóc 20FT bị khóa kèm lý do Rule 1, rơ moóc có chốt giữa ghi "Ghép TWIN_20 được" (`availability.query` đọc chuyến của container).
- Giao diện: nút "Chọn để ghép" dưới thẻ Chờ điều (chọn tối đa 2, bàn phím Space hoặc Enter), thanh "Ghép chuyến" chỉ hiện khi có thẻ chọn, hộp chọn TWIN_20 hoặc COMBINED (kèm tùy chọn Đảo vỏ khi một cont Nhập một cont Xuất), lỗi quy tắc hiện `Alert` crit ngay trong hộp và nói rule nào; ghép xong tự mở bảng gán xe cho cả chuyến; nút "Tách chuyến" trên thẻ của chuyến ghép (hộp xác nhận); khối "Street Turn chờ chấp thuận" nhập số chấp thuận và phí, `EmptyState` khi trống. Thiết kế Screen03 chưa có mockup phần này nên dựng từ `Button`, `Alert`, `Field`, `ContainerCard`, `EmptyState` và token hiện có (ghi `decisions.md`).
- Kiểm tra: unit web 177+ xanh (thêm `consolidate-view.test.ts`, test chip và lỗi Rule); `e2e/consolidate.spec.ts` 5/5 xanh gồm ghép 2 cont 20 cùng khách lên xe 2×20 và gán thành công, rơ moóc 20FT bị khóa kèm lý do Rule 1, tách chuyến thấy cờ "Cần tính lại giá", ghép làm hoàn toàn bằng bàn phím, Street Turn từ ghép tới nhập số chấp thuận, 1366×768 không tràn ngang; ảnh chụp 1366 đã xem. `pnpm typecheck` và `pnpm lint` sạch.
- Lưu ý: optimistic UI của bảng gán xe vẫn chỉ dời thẻ đang chọn; thẻ còn lại của chuyến ghép cập nhật qua SSE sau vài trăm mili giây.
