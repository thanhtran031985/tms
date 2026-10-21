# 08-trip-combining — Ghép chuyến TWIN_20, COMBINED, Street Turn và tách chuyến

> Giai đoạn: GĐ2 · Phụ thuộc: 06, 07 · Nhánh git: `feat/08-trip-combining`
> Nguồn: `docs/specs/07_implementation_tickets.md` TICKET-08; spec `03_dispatch_and_concurrency.md` mục 1 (khóa và kiểm tra áp cho mọi tài nguyên của chuyến ghép), mục 2 (Rule 1 đến 8) và mục 4 (Hủy & Tách chuyến); spec `06_hierarchical_pricing_and_fees.md` mục 3 (Doanh thu tính trên từng container, `appliedTripMode`, `shareTwinDiscountWithCustomer`) và mục 4 (Tính lại giá); spec `00_system_overview_and_adrs.md` mục 1 (COMBINED khác Street Turn, Street Turn) và ADR-004, ADR-009; spec `01_core_architecture_and_grill_logs.md` mục 3 ("Tại sao Snapshot giá"); spec `02_database_schema.md` bảng `consolidated_trips`, `trip_containers`, `order_containers` (`linkedContainerId`, `streetTurnApprovalRef`, `appliedTripMode`, `repriceRequired`), `shipping_lines.allowsStreetTurn`; PRD `docs/PRD.md` mục C5, F4, F5

## Mục tiêu
Sau task này, Điều vận ghép hai cont 20ft lên một rơ moóc (TWIN_20), kết hợp chiều Nhập và chiều Xuất trong một chuyến (COMBINED), hoặc đảo vỏ cont Nhập sang đơn Xuất (Street Turn), và hệ thống chặn ngay mọi tổ hợp sai về vật lý hay thiếu chấp thuận của hãng tàu. Khi cần, Điều vận tách một container khỏi chuyến ghép hoặc hủy Order; giá cước của các container bị ảnh hưởng được đánh dấu và tính lại đúng quy tắc, có ghi lịch sử.

## Phạm vi
**Làm:**
- `createConsolidatedTrip` cho `TWIN_20` và `COMBINED` với các Rule 1 đến 8 spec 03 mục 2, khóa và kiểm tra tài nguyên theo spec 03 mục 1 cho mọi tài nguyên của chuyến.
- Street Turn: liên kết `order_containers.linkedContainerId`, kiểm tra hãng tàu, loại cont, `allowsStreetTurn`, `streetTurnApprovalRef` trước `DISPATCHED`, thứ tự thời gian, chép số cont, chuyển đồng hồ DET, Stop `RETURN_EMPTY` của cont Nhập thành `SKIPPED`, phí `STREET_TURN_FEE` theo cấu hình.
- Doanh thu khi ghép: cùng khách thì tra giá `TWIN_20`/`COMBINED`, khác khách giữ giá `SINGLE`; ghi `appliedTripMode`; cấu hình tenant `shareTwinDiscountWithCustomer`.
- Tách chuyến (un-consolidate): gỡ container khỏi `trip_containers`, đổi `tripMode` về `SINGLE` khi chỉ còn 1 cont, đặt lại phân bổ đã sửa tay về số hệ thống và báo Kế toán.
- Hủy Order và hủy container đang nằm trên chuyến (spec 03 mục 4): gỡ khỏi chuyến, hủy assignment liên quan, tính lại chuyến còn lại.
- Phát sự kiện `pricing.reprice_required` và xử lý tính lại giá theo spec 06 mục 4, ghi audit `REPRICE`.
- Thao tác "Ghép chuyến", nhập số chấp thuận Street Turn, "Tách chuyến" trên màn Điều vận.

**Không làm (thuộc task khác):**
- Hủy một assignment đơn lẻ (đã làm ở task 06, dùng lại `cancelAssignment`).
- Hủy container và hủy Order khi container chưa nằm trên chuyến nào (đã làm ở task 04; task này chỉ thêm phần liên quan chuyến).
- Ghi chi phí hủy của nhà xe ngoài vào `trip_costs` (cần bảng `trip_costs` của task 17 và assignment `SUB_CONTRACTOR` của task 09).
- Phân bổ chi phí chuyến, màn Kế toán sửa phân bổ (task 17).
- Yêu cầu điều chỉnh hóa đơn khi container đã xuất hóa đơn (task 21; task này chỉ gắn cờ và không sửa giá).
- DEM/DET chính thức theo vỏ sau Street Turn (task 18 tính phí; task này chỉ chuyển mốc theo dõi).
- Thông báo ra ngoài cho Kế toán (task 23); task này gắn cờ và ghi audit.

## Thiết kế
- `designs/components/Screen03-Dispatch/` (đọc README.md và preview.html; 4 trạng thái như task 07). Chip liên quan: "Ghép TWIN_20 được" (`ok`), "Street Turn" (`info`), Cont lạnh, Hàng nguy hiểm, cut-off; bảng gán xe ghi rõ xe 2×20 ghép TWIN_20 được.
- Thành phần: `designs/components/ContainerCard/`, `designs/components/StatusChip/`, `designs/components/Alert/` (`tms-alert-crit` cho Rule bị chặn, nói rule nào và làm gì tiếp; `tms-alert-warn` cho cảnh báo cần xác nhận như thiếu khối lượng), `designs/components/Field/` (ô số chấp thuận hãng tàu), `designs/components/EmptyState/` (ví dụ "Không có Street Turn nào chờ chấp thuận" + câu giải thích trong `designs/components/EmptyState/README.md`), `designs/components/Button/` ("Ghép chuyến", "Tách chuyến").
- Container bị tách khỏi TWIN_20 hiện cờ "Cần tính lại giá" như Screen04-Orders.

## Quyết định kiến trúc
- Module `packages/core/modules/dispatch/`: `consolidate.service.ts` (`createConsolidatedTrip`, `addContainerToTrip`), `split.service.ts` (`removeContainerFromTrip`), `street-turn.service.ts`, `rules/` mở rộng từ task 06 (`twin20.ts`, `weight.ts` cộng nhiều cont, `street-turn.ts`, `combined-sequence.ts`, `dangerous-goods.ts`). Tính lại giá ở `packages/core/modules/billing/reprice.service.ts`; job ở `apps/worker/src/jobs/reprice.ts`.
- Khóa: lấy đủ tài xế, đầu kéo, rơ moóc của chuyến theo thứ tự `drivers` → `tractors` → `trailers`, trong cùng bảng sắp `id` tăng dần; khóa các dòng `order_containers` liên quan theo `id` tăng dần sau tài nguyên; áp đủ kiểm tra spec 03 mục 1 (chồng lấn, giấy tờ, bảo dưỡng, giờ lái, timeout 5 giây, `version`).
- Rule 1: `tripMode = 'TWIN_20'` bắt buộc `trailer.canCarryTwin20 = true`; cả 2 container là cont 20ft (cùng Order hoặc 2 Order khác nhau); rơ moóc `20FT` hoặc không có chốt giữa bị chặn ngay.
- Rule 2: tổng khối lượng các cont (`vgmTons`, chưa có thì `cargoWeightTons` + vỏ cont tiêu chuẩn) ≤ `trailer.maxPayloadTons`; cộng `trailer.tareWeightTons` + đầu kéo ≤ `tractor.permittedGrossWeightTons`; thiếu dữ liệu thì cảnh báo bắt buộc xác nhận. Spec 02 chưa có khối lượng bản thân đầu kéo: chốt cách lấy trong plan.md.
- Rule 3 (Street Turn): `importOrder.shippingLineId === exportOrder.shippingLineId`, `importContainer.containerType === exportContainer.containerType`, `shippingLine.allowsStreetTurn = true`, có `streetTurnApprovalRef` trước khi chuyến sang `DISPATCHED`; Stop `UNSTUFFING` của cont Nhập kết thúc trước Stop `STUFFING` của cont Xuất. Sau khi đảo vỏ: `exportContainer.containerNo = importContainer.containerNo`; đồng hồ DET chuyển sang cont Xuất (`detFreeUntil` theo dõi trên cont Xuất); Stop `RETURN_EMPTY` của cont Nhập chuyển `SKIPPED`; ghi `STREET_TURN_FEE` (nếu hãng tàu thu) dạng `PASS_THROUGH` vào `order_fees` hoặc chi phí, theo cấu hình tenant. Liên kết lưu ở từng container (`linkedContainerId` hai chiều), không ở cấp Order.
- Rule 4 (COMBINED không Street Turn): hai vỏ khác nhau; không áp Rule 3 nhưng kiểm tra thứ tự Stop hợp lệ về vật lý: không lúc nào chở quá 1 cont 40 (trả rỗng cont Nhập trước khi lấy rỗng cont Xuất).
- Rule 5: container `*RF` cần rơ moóc `hasGensetPower = true` (hoặc máy phát rời được khai báo). Rule 6: `isDangerousGoods` cần tài xế có chứng chỉ hàng nguy hiểm và không được ghép TWIN_20 với đơn của khách khác. Rule 7: cho lưu kế hoạch, chặn lúc `DISPATCHED` nếu Stop đầu tại cảng/depot mà container `HOLD_CUSTOMS`/`HOLD_LINE` hoặc chưa `READY_EDO`/`READY_EMPTY_RELEASE`. Rule 8: hàng Xuất có `plannedEnd` của Stop `PORT_IN` sau `order.cutOffAt` thì cảnh báo đỏ trên thẻ.
- Mỗi Rule trả mã lỗi riêng, cố định trong `packages/shared/errors.ts` (đặt tên trong plan.md, ví dụ `TWIN20_TRAILER_NOT_ALLOWED`, `OVERWEIGHT`, `STREET_TURN_LINE_MISMATCH`, `STREET_TURN_NOT_APPROVED`, `INVALID_STOP_SEQUENCE`, `REEFER_NEEDS_GENSET`, `DG_NOT_ALLOWED`, `PORT_NOT_READY`); cảnh báo trả trong `data.warnings`.
- Doanh thu (spec 06 mục 3): container ghép cùng khách (cùng Order hoặc 2 Order cùng khách) tra `freight_tariffs` với `tripMode` của chuyến, nếu `shareTwinDiscountWithCustomer` (trong `tenants.settings`, mặc định `true`) bật; khác khách giữ `SINGLE`. Kết quả ghi `order_containers.appliedTripMode`. Chi phí định mức theo chuyến để task 17 làm.
- Tính lại giá (spec 06 mục 4): sự kiện làm đổi khóa tra giá (ghép, tách, đổi tuyến, đổi loại cont, đổi khách) đặt `repriceRequired = true` chỉ cho container bị ảnh hưởng, trong cùng transaction; sau commit đẩy job `pricing.reprice` (BullMQ, idempotent, retry có backoff). Job: container chưa nằm trên hóa đơn đã phát hành và không `isManualPrice` thì tính lại `baseFreightAmount` và phụ phí nguồn `TARIFF`, ghi audit `REPRICE` (giá cũ → mới, tariff cũ → mới), xóa cờ; container đã xuất hóa đơn thì giữ giá, giữ cờ để task 21 tạo yêu cầu điều chỉnh; phụ phí `MANUAL` và phí DEM/DET không bị tính lại. Có job quét định kỳ các cờ còn treo phòng trường hợp mất job.
- Tách chuyến (spec 03 mục 4): gỡ 1 container khỏi `trip_containers`, hủy assignment của Stop thuộc container đó, đổi `tripMode` về `SINGLE` nếu chỉ còn 1 cont, phát `pricing.reprice_required` cho các container bị ảnh hưởng. Nếu chuyến có dòng `trip_containers.isManualOverride = true` thì đặt lại `allocationRatio`/`allocatedAmount` bằng `systemRatio`/`systemAmount`, `isManualOverride = false`, đổi `allocationMethod` khỏi `MANUAL`, ghi audit và gắn cờ báo Kế toán. Task 17 làm sau sẽ thay phần này bằng hàm chung của module phân bổ.
- Hủy Order có container trên chuyến: hủy mọi container chưa hoàn thành; container đang trên chuyến được gỡ như tách chuyến; Order chỉ `CANCELLED` khi không còn container hoạt động (dùng lại quy tắc task 04).
- Mọi thay đổi chuyến, assignment, container, phí ghi `audit_logs` trong cùng transaction; publish `dispatch.updated` sau commit như task 06.
- Quyền: `OWNER`, `ADMIN`, `DISPATCHER` ghép, tách, nhập số chấp thuận; hủy Order theo quyền của task 04.

## Các bước
### Bước 1 — Test ma trận Rule 1 đến 8 và tách chuyến (đỏ)
- `packages/core/modules/dispatch/consolidate.rules.int.test.ts`: với mỗi Rule ít nhất 1 test bị chặn và 1 test được phép:
  - Rule 1: rơ moóc `20FT` chặn; `40FT_COMBO` có chốt giữa cho phép; một cont 40 trong TWIN_20 chặn.
  - Rule 2: tổng vượt `maxPayloadTons` chặn; vượt `permittedGrossWeightTons` chặn; trong giới hạn cho phép; thiếu khối lượng trả cảnh báo cần xác nhận.
  - Rule 3: khác hãng tàu chặn; khác loại cont chặn; hãng không cho Street Turn chặn; thiếu số chấp thuận chặn lúc `DISPATCHED`; `UNSTUFFING` kết thúc sau `STUFFING` chặn; đủ điều kiện cho phép và kiểm tra số cont, DET, Stop `SKIPPED`, phí.
  - Rule 4: COMBINED có lúc chở 2 cont 40 chặn; thứ tự trả rỗng rồi lấy rỗng cho phép.
  - Rule 5: cont `40RF` trên rơ moóc không genset chặn; có genset cho phép.
  - Rule 6: tài xế không chứng chỉ chặn; TWIN_20 cont hàng nguy hiểm với đơn khách khác chặn; cùng khách, tài xế có chứng chỉ cho phép.
  - Rule 7: cont `HOLD_CUSTOMS` lưu kế hoạch được nhưng `DISPATCHED` bị chặn; `READY_EDO` cho phép.
  - Rule 8: `PORT_IN` sau cut-off trả cảnh báo đỏ; trước cut-off không cảnh báo.
- `split.service.int.test.ts`, `reprice.service.int.test.ts`: kịch bản ở bước 4, 5.
**Kiểm tra:** `pnpm test --filter core -- consolidate` chạy và đỏ vì chưa có code; số test chặn và cho phép đủ cho 8 Rule.

### Bước 2 — Ghép TWIN_20 và chọn tripMode doanh thu
- Viết `consolidate.service.ts` (`createConsolidatedTrip`, `addContainerToTrip`) và `rules/twin20.ts`, `rules/weight.ts`, `rules/dangerous-goods.ts`; dùng lại bộ kiểm tra của task 06 cho tài nguyên, Rule 5, Rule 7, Rule 8; khóa đúng thứ tự cho mọi tài nguyên và container.
- Ghi `trip_containers` cho từng cont, `appliedTripMode` theo cùng khách hay khác khách và `shareTwinDiscountWithCustomer`, đặt `repriceRequired` cho cont bị đổi khóa tra giá, audit.
- Thêm test: 2 cont cùng khách nhận giá TWIN_20; 2 cont khác khách giữ giá SINGLE; tenant tắt `shareTwinDiscountWithCustomer` thì giữ SINGLE; 2 người ghép chéo cùng lúc không deadlock.
**Kiểm tra:** `pnpm test --filter core -- consolidate` xanh cho Rule 1, 2, 5, 6, 7, 8 và các test giá; test song song chạy 5 lần không deadlock.

### Bước 3 — COMBINED và Street Turn
- Viết `street-turn.service.ts`, `rules/street-turn.ts`, `rules/combined-sequence.ts`: liên kết `linkedContainerId` hai chiều, nhập `streetTurnApprovalRef`, kiểm tra trước `DISPATCHED`, chép `containerNo`, chuyển theo dõi DET, Stop `RETURN_EMPTY` sang `SKIPPED`, ghi `STREET_TURN_FEE` theo cấu hình; COMBINED kiểm tra thứ tự Stop.
**Kiểm tra:** `pnpm test --filter core -- consolidate` xanh toàn bộ 8 Rule; truy vấn sau Street Turn thấy cont Xuất có số cont của cont Nhập và Stop `RETURN_EMPTY` của cont Nhập là `SKIPPED`.

### Bước 4 — Tách chuyến và hủy Order có chuyến
- Viết `split.service.ts` (`removeContainerFromTrip`) và phần nối với `cancelContainer`/`cancelOrder` của task 04.
- Test: tách 1 cont khỏi TWIN_20 còn 1 cont thì chuyến về `SINGLE`, cont còn lại và cont bị tách đều `repriceRequired`; assignment của cont bị tách `CANCELLED`, không xóa; chuyến có phân bổ sửa tay thì về số hệ thống, có audit và cờ báo Kế toán; hủy Order có 1 cont trên chuyến ghép thì cont đó rời chuyến, Order chỉ `CANCELLED` khi hết cont hoạt động; gửi `version` cũ trả `STALE_DATA`.
**Kiểm tra:** `pnpm test --filter core -- split` xanh.

### Bước 5 — Tính lại giá
- Viết `packages/core/modules/billing/reprice.service.ts` và `apps/worker/src/jobs/reprice.ts` (job `pricing.reprice` và job quét cờ treo).
- Test: cont chưa xuất hóa đơn, không giá tay được tính lại `baseFreightAmount` và phụ phí `TARIFF`, có audit `REPRICE` ghi giá và tariff cũ, mới; cont `isManualPrice` giữ giá; phụ phí `MANUAL` và DEM/DET giữ nguyên; cont gắn với hóa đơn đã phát hành (giả lập `order_fees.invoiceId`) giữ giá và giữ cờ; chạy job 2 lần không tạo audit hay phí trùng; tổng trên `orders` cập nhật.
**Kiểm tra:** `pnpm test --filter core -- reprice` và `pnpm test --filter worker -- reprice` xanh.

### Bước 6 — Server Action và thao tác trên màn Điều vận
- `apps/web/src/features/dispatch/consolidate-actions.ts`: `createConsolidatedTrip`, `addContainerToTrip`, `removeContainerFromTrip`, `setStreetTurnApproval` theo khuôn `requireRole` rồi zod rồi service.
- Trên `/dispatch`: chọn 2 thẻ (chuột hoặc bàn phím) rồi "Ghép chuyến", chọn TWIN_20 hoặc COMBINED, xem kết quả từng Rule (chặn hiện `Alert` crit nói rule và cách xử lý; cảnh báo cần xác nhận); thẻ có chip TWIN_20, Street Turn; ô nhập số chấp thuận hãng tàu; "Tách chuyến" trên thẻ của chuyến ghép; danh sách Street Turn chờ chấp thuận có `EmptyState` khi trống.
- E2E `apps/web/e2e/consolidate.spec.ts`: ghép 2 cont 20 cùng khách lên xe 2×20 thành công; ghép lên rơ moóc 20FT thấy thông báo chặn đúng Rule 1; tách chuyến thấy cờ "Cần tính lại giá".
**Kiểm tra:** `pnpm e2e -- consolidate` xanh; thao tác ghép làm được hoàn toàn bằng bàn phím; mở `/dispatch` trên 1440×900 và 1366×768 không vỡ bố cục.

### Bước 7 — Hoàn tất
- Chạy toàn bộ kiểm tra, cập nhật progress.md, đổi trạng thái dòng 08 trong `docs/tasks/README.md`, cập nhật spec 03, 06 nếu có quyết định khác (khối lượng đầu kéo, cấu hình phí Street Turn, mã lỗi mới).
**Kiểm tra:** `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` không lỗi; `pnpm e2e` xanh cho ghép và tách chuyến; migration (nếu có cột cấu hình mới) chạy được trên DB trống và DB có dữ liệu; mọi Server Action có `requireRole` và zod; repo mới có test tenant isolation; đạt "Chấp nhận khi" của ticket: mỗi Rule có ít nhất 1 test chặn và 1 test cho phép.
