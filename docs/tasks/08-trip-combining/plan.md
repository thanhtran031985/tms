# Kế hoạch 08-trip-combining — Ghép chuyến TWIN_20, COMBINED, Street Turn và tách chuyến

## Bối cảnh
Task 06 có điều vận SINGLE (khóa bi quan, chống chồng lấn, Rule 2/5/6/7/8 cho từng container), task 07 có Kanban `/dispatch`. Task 08 thêm: ghép 2 cont thành chuyến `TWIN_20` / `COMBINED`, Street Turn (đảo vỏ), tách chuyến, hủy container/Order đang nằm trên chuyến, đánh dấu và tính lại giá (`pricing.reprice`), cùng thao tác trên Kanban. Mục tiêu "Chấp nhận khi": mỗi Rule 1–8 có ≥ 1 test chặn và ≥ 1 test cho phép.

Nhánh `feat/08-trip-combining` đã tạo từ `feat/07-dispatch-kanban` (07 chưa merge vào main); README dòng 08 đã 🔄. Không cài package mới (xem mục "Chuyển job tính lại giá" để tránh `bullmq` ở core/web).

## Hiện trạng (từ khám phá)
- Core `modules/dispatch/`: có `trips.service` (`createSingleTrip`, `dispatchTrip` chặn Rule 7), `assign.service` (`assignResources`, `cancelAssignment`), `evaluate.ts` (`lockResources` drivers→tractors→trailers, `evaluateAssignment`), `context.ts` (`loadTripContext` đã đọc mọi `trip_containers`), `rules/physical.ts` (Rule 2 theo từng cont, 5, 6 phần tài xế, 8), `rules/port-readiness.ts` (7), `deps.ts` (`lockTrip`, `updateTripWithVersion`, `emit`, `LOCK_WAIT_TIMEOUT_SECONDS`).
- Thiếu: Rule 1, Rule 3, Rule 4, Rule 2 cộng nhiều cont (+ tự trọng đầu kéo, + tự trọng rơ moóc), Rule 6 "không ghép TWIN_20 với đơn khách khác"; chưa có `consolidate/split/street-turn` service; chưa có `reprice`, sự kiện `pricing.reprice_required`, `shareTwinDiscountWithCustomer`; chưa có nơi nào đặt `repriceRequired = true`.
- Order: `cancelContainerRow` / `cancelOrder` (`orders/service.ts` ~961–1063) không biết chuyến. `priceContainers`/`applyPricing` cố định `SINGLE`.
- Schema đủ cho phần lớn việc: `consolidated_trips.tripMode`, `trip_containers` (kèm cột phân bổ), `order_containers` (`linkedContainerId`, `streetTurnApprovalRef`, `appliedTripMode`, `repriceRequired`, `detFreeUntil`), `trailers.canCarryTwin20/hasGensetPower/tareWeightTons/maxPayloadTons`, `shipping_lines.allowsStreetTurn`, `order_fees` (`feeCode` tự do, `source`, `invoiceId`).
- **Không có:** tự trọng đầu kéo; cờ "Kế toán cần xem lại" cho chuyến; cấu hình phí Street Turn / `shareTwinDiscountWithCustomer` (ở `tenants.settings` JSON nên không cần migration).
- Worker (`apps/worker`) có `bullmq`, mẫu `jobs/document-expiry.ts` + `upsertJobScheduler`; core/web không có BullMQ.

## Quyết định thiết kế (ghi decisions.md, báo cáo)
1. **Khối lượng đầu kéo (Rule 2):** thêm cột `tractors.tare_weight_tons DECIMAL(6,2) NULL` (migration `0007`, sửa spec 02, seed điền cho đầu kéo mẫu). Có giá trị thì tính `tổng cont + tự trọng rơ moóc + tự trọng đầu kéo ≤ permittedGrossWeightTons`; NULL thì giữ cảnh báo `TRACTOR_TARE_NOT_COUNTED` như task 06. Payload: `tổng khối lượng cont ≤ trailer.maxPayloadTons`.
2. **Cờ Kế toán:** thêm cột `consolidated_trips.allocation_review_required BOOLEAN DEFAULT false` (cùng migration `0007`, sửa spec 02). Tách chuyến có phân bổ sửa tay thì đặt về số hệ thống, `allocationMethod` → `COST_NORM_RATIO`, đặt cờ và ghi audit `RESET_ALLOCATION` (task 17 sẽ thay bằng hàm của module phân bổ và hiển thị cờ; thông báo ngoài là task 23).
3. **Chuyển job tính lại giá không cài thêm package:** core đặt `repriceRequired = true` trong transaction (nguồn sự thật bền vững), sau commit publish `pricing.reprice_required` lên kênh Redis `tenant:{id}:pricing` (thêm vào `lib/redis/publish.ts`). Worker có subscriber chuyển thành job BullMQ `pricing.reprice` (idempotent, retry backoff) và job quét định kỳ `pricing.reprice-sweep` (mỗi 5 phút, theo từng tenant ACTIVE) để nhặt cờ treo khi mất sự kiện. Nếu sau này muốn đẩy job thẳng từ web thì cần duyệt cài `bullmq` ở core.
4. **Tra giá khi ghép:** tra theo từng container với `tripMode` của chuyến (spec 06 mục 3), ghi `appliedTripMode` = `tripMode` của tariff trúng (fallback SINGLE của engine). Ghép cùng khách (`orders.customerId` bằng nhau) và `settings.pricing.shareTwinDiscountWithCustomer` (mặc định true) mới đặt `appliedTripMode = tripMode` + `repriceRequired = true`; khác khách hoặc tắt cấu hình giữ SINGLE, không đặt cờ. Seed hiện có TWIN_20 3.000.000 (đắt hơn SINGLE 1.800.000) mơ hồ là giá mỗi cont hay mỗi cặp; test tự chèn bảng giá của riêng mình, không sửa seed.
5. **Phí Street Turn:** `settings.dispatch.streetTurnFee = 'PASS_THROUGH' | 'REVENUE_SURCHARGE' | 'NONE'` (mặc định `PASS_THROUGH`). Số tiền do Điều vận nhập cùng số chấp thuận (`feeAmount` tùy chọn); > 0 và cấu hình ≠ NONE thì ghi `order_fees` của Order Xuất: `feeCode = 'STREET_TURN_FEE'`, `source = 'MANUAL'`, `idempotencyKey = STREET_TURN:{exportContainerId}`, rồi cập nhật tổng Order.
6. **Thứ tự Stop (Rule 3, 4):** Stop chưa có giờ kế hoạch riêng, nên so bằng `deadlineTime ?? windowStart` (kết thúc) với `windowStart` (bắt đầu). Thiếu giờ thì cho qua nhưng trả cảnh báo `SEQUENCE_NOT_VERIFIED`, đủ giờ mà sai thì chặn `INVALID_STOP_SEQUENCE`. Rule 4 (COMBINED, vỏ khác nhau): mỗi cont "ở trên rơ moóc" từ Stop lấy (PICK_FULL / PICK_EMPTY) đến Stop trả (RETURN_EMPTY / PORT_IN); hai khoảng chồng nhau chỉ hợp lệ nếu cả hai cont 20ft; cặp đã Street Turn coi như một vỏ vật lý, chỉ áp Rule 3.
7. **Mã lỗi mới** (`packages/shared/errors.ts` + `labels.ts`): `TWIN20_TRAILER_NOT_ALLOWED` (Rule 1: rơ moóc không có chốt giữa), `TWIN20_CONTAINER_NOT_20FT` (Rule 1: cont không phải 20ft), `TRIP_MODE_INVALID` (số cont không khớp chế độ), `STREET_TURN_LINE_MISMATCH`, `STREET_TURN_TYPE_MISMATCH`, `STREET_TURN_NOT_ALLOWED` (hãng không cho), `STREET_TURN_NOT_APPROVED` (thiếu số chấp thuận lúc DISPATCHED), `INVALID_STOP_SEQUENCE`, `DG_TWIN20_MIXED_CUSTOMER` (Rule 6), `TRIP_LAST_CONTAINER` (tách cont cuối). Giữ `PAYLOAD_EXCEEDED`, `REEFER_REQUIRES_GENSET`, `DG_CERTIFICATE_REQUIRED`, `PORT_NOT_READY` của task 06 (tên khác đề xuất trong task.md, ghi decisions.md và cập nhật spec 03).
8. **Quyền:** `dispatch.assign` (OWNER/ADMIN/DISPATCHER) cho ghép, tách, nhập số chấp thuận, liên kết Street Turn; xem danh sách Street Turn dùng `dispatch.view`.
9. **Thứ tự khóa thống nhất:** chuyến (nếu đã có) → drivers → tractors → trailers (id tăng dần) → `order_containers` (id tăng dần). Cùng thứ tự với `assignResources` hiện có.

## Cấu trúc mã
```
packages/core/lib/db/schema/{fleet.ts,dispatch.ts}   + tractors.tareWeightTons, consolidated_trips.allocationReviewRequired
packages/core/lib/db/migrations/0007_*.sql           (drizzle-kit generate, review SQL)
packages/core/lib/db/seeds/{fleet,dispatch}*.ts      tare đầu kéo; dữ liệu thử (idempotent, không đổi số đếm test cũ)
packages/shared/{errors.ts,labels.ts}                mã lỗi mới
packages/shared/schemas/dispatch.ts                  + createConsolidatedTripSchema, addContainerToTripSchema, removeContainerFromTripSchema,
                                                       linkStreetTurnSchema, setStreetTurnApprovalSchema, listStreetTurnsSchema; parseDispatchSettings mở rộng
packages/shared/dispatch-board.ts                    BoardCard + tripMode, tripContainerCount, containerLengthFt, linkedContainerNo,
                                                       streetTurnApprovalRef, repriceRequired, appliedTripMode
packages/core/modules/dispatch/
  rules/twin20.ts            Rule 1
  rules/weight.ts            Rule 2 cộng nhiều cont (physical.ts giữ 5, 6 tài xế, 8)
  rules/dangerous-goods.ts   Rule 6 phần "không ghép TWIN_20 khác khách"
  rules/street-turn.ts       Rule 3 (hãng, loại cont, allowsStreetTurn, thứ tự Stop, đã có số chấp thuận)
  rules/combined-sequence.ts Rule 4
  consolidate.service.ts     createConsolidatedTrip (resources tùy chọn), addContainerToTrip
  street-turn.service.ts     linkStreetTurn, setStreetTurnApproval, listStreetTurns
  split.service.ts           removeContainerFromTrip + hàm dùng chung cho hủy container/Order
  evaluate.ts / context.ts   nhận tripMode và danh sách cont: áp Rule 1, 2 (tổng), 6 (khách), 4 khi assignResources
  trips.service.ts           dispatchTrip: thêm kiểm tra Street Turn đã duyệt
  index.ts                   nối vào DispatchService
packages/core/modules/orders/service.ts              cancelContainerRow/cancelOrder gọi hàm gỡ khỏi chuyến (qua dependency tùy chọn removeFromTrip)
packages/core/modules/billing/reprice.service.ts     repriceContainer / repriceFlagged (khóa Order, tính lại, audit REPRICE)
packages/core/lib/redis/publish.ts                   PricingEvent + pricingChannel
apps/worker/src/{queues.ts,worker.ts,jobs/reprice.ts}  job pricing.reprice, subscriber, job quét
apps/web/src/features/dispatch/
  actions.ts                 + 5 action mới (giữ tên actions.ts để actions-guard.test quét; có requireRole + zod qua defineAction)
  combine-dialog.tsx, split-button, street-turn-panel.tsx, error-messages.ts mở rộng, card-chips.ts (+TWIN_20, Street Turn chờ duyệt, Cần tính lại giá)
  board.tsx / kanban-column / dispatch-card   chọn nhiều thẻ
apps/web/src/server/services.ts                       truyền removeFromTrip cho OrderService
apps/web/e2e/consolidate.spec.ts (+ dispatch-fixtures.ts mở rộng reset)
docs: spec 02 (2 cột), spec 03 (mã lỗi, Rule 4/6, đầu kéo), spec 06 (reprice qua pub/sub + sweep)
```

Tái sử dụng: `lockResources`, `evaluateAssignment`, `lockTrip`, `updateTripWithVersion`, `emit` (dispatch/deps, evaluate), `loadTripContext`, `checkPhysical`, `createSingleTrip` làm khuôn cho khóa container, `cancelAssignment` làm khuôn catch `isLockContentionError` → `RESOURCE_BUSY_RETRY`, `resolveFreight`/`resolveFees`/`tariffDateOf` (billing/pricing-engine), `computeOrderTotals`, `writeAudit`, `nextNumber`, `dispatch.test-world.ts` (`createWorld`, `newContainer`…), mẫu `jobs/document-expiry.ts`, `startTestInfra`.

## Các bước (đúng task.md; test viết trước; mỗi bước xong cập nhật progress.md + `pnpm tasks:dashboard`, commit `08-trip-combining: step N — …`)
1. **Test đỏ.** Mở rộng `dispatch.test-world.ts` (cont 20ft, nhiều khách, hãng tàu, rơ moóc canCarryTwin20 true/false, tare đầu kéo, bảng giá tự chèn). Viết `consolidate.rules.int.test.ts` (ma trận Rule 1–8 chặn + cho phép), `split.service.int.test.ts`, `reprice.service.int.test.ts`, `rules/*.test.ts` thuần. Thêm migration `0007` + mã lỗi + schema zod + `.d.ts` kiểu để test biên dịch. `pnpm test --filter core -- consolidate` đỏ vì chưa có code.
2. **Ghép TWIN_20.** `rules/twin20.ts`, `weight.ts`, `dangerous-goods.ts`; `consolidate.service.ts` (`createConsolidatedTrip` có/không `resources`, `addContainerToTrip`); `evaluate/context` áp luật theo `tripMode`; `trip_containers`, `appliedTripMode`, `repriceRequired`, audit, `dispatch.updated` kèm mọi cont (cả cont bị đổi); test giá cùng/khác khách/tắt cấu hình; test hai người ghép chéo cùng lúc 5 lần không deadlock.
3. **COMBINED và Street Turn.** `rules/street-turn.ts`, `rules/combined-sequence.ts`, `street-turn.service.ts` (liên kết hai chiều, chép `containerNo`, chuyển `detFreeUntil` sang cont Xuất, Stop `RETURN_EMPTY` của cont Nhập → `SKIPPED`, phí theo cấu hình), `dispatchTrip` chặn `STREET_TURN_NOT_APPROVED`.
4. **Tách chuyến và hủy.** `split.service.ts`; nối `cancelContainerRow`/`cancelOrder` (gỡ khỏi chuyến, hủy assignment của Stop thuộc cont đó, về SINGLE khi còn 1 cont, đặt lại phân bổ + cờ Kế toán, `STALE_DATA` khi sai `version`); `pnpm test --filter core -- split`.
5. **Tính lại giá.** `reprice.service.ts` (không đụng cont `isManualPrice`, phí `MANUAL`/DEM-DET; cont có `order_fees.invoiceId` giữ giá và giữ cờ; audit `REPRICE`; chạy 2 lần không trùng; cập nhật tổng Order bằng khóa Order + `version`), publish `pricing.reprice_required`, worker job + subscriber + sweep; `--filter core -- reprice` và `--filter worker -- reprice`.
6. **Server Action và giao diện.** 5 action mới trong `actions.ts`; `BoardCard` + `board.query.ts` thêm trường chuyến ghép; chọn 2 thẻ (Ctrl/Shift+click hoặc nút "Chọn để ghép" cạnh thẻ, bàn phím đủ) → thanh "Ghép chuyến" → hộp chọn TWIN_20 / COMBINED → tạo chuyến rồi mở bảng gán xe cho cả chuyến (liệt kê rơ moóc, ghi "ghép TWIN_20 được", lý do chặn Rule 1/2/5/6); `Alert crit` nói rule và việc cần làm; "Tách chuyến" trên thẻ của chuyến ghép; ô số chấp thuận (`Field`) và danh sách Street Turn chờ duyệt với `EmptyState`; chip TWIN_20, Street Turn, "Cần tính lại giá"; optimistic/SSE xử lý cả hai thẻ của chuyến. Thiết kế Screen03 chưa có mockup chọn nhiều/hộp ghép: dựng từ `Button`/`Alert`/`Field`/`ContainerCard`, ghi decisions.md. E2E `consolidate.spec.ts` (ghép 2 cont 20 cùng khách thành công; rơ moóc 20FT bị chặn Rule 1; tách chuyến thấy cờ), dữ liệu riêng của spec tạo qua helper SQL idempotent như `resetDispatchContainers` để không vỡ số đếm seed của test khác; chụp 1440×900 và 1366×768.
7. **Hoàn tất.** `typecheck`, `lint`, `test`, `build`, `e2e` (chạy 5 lần); migration chạy trên DB trống và DB có dữ liệu; kiểm mọi Server Action có `requireRole` + zod; test tenant isolation cho repo mới; cập nhật spec 02/03/06, README → ✅.

## Kiểm tra end-to-end
- Docker bật; `pnpm db:migrate && pnpm db:seed` hai lần không trùng.
- `pnpm test --filter core -- consolidate|split|reprice`, `--filter worker -- reprice`, `--filter web -- error-messages|actions-guard`.
- `pnpm --filter web exec playwright test consolidate` ×5; toàn bộ `pnpm e2e` (3 test `orders.spec.ts` đang đỏ từ trước, ngoài phạm vi).
- Thủ công: `/dispatch` ghép hai thẻ 20ft cùng khách lên rơ moóc 40FT_COMBO thành công, lên rơ moóc 20FT hiện Alert Rule 1; tách chuyến thấy "Cần tính lại giá" và sau khi worker chạy cờ biến mất.

## Việc người dùng cần làm
Duyệt kế hoạch (đặc biệt 2 cột mới ở mục 1–2 và cách chuyển job ở mục 3); bật Docker; chạy `pnpm --filter worker dev` (hoặc `pnpm dev`) để kiểm job tính lại; `.env` cần `REDIS_URL`.
