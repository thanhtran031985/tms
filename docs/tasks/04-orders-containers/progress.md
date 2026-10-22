# Tiến độ 04-orders-containers

Trạng thái: ⬜ chưa làm · 🔄 đang làm · ❓ có code chưa rà soát · ⚠️ khác task.md · ❌ thiếu · ✅ xong

| Bước | Nội dung | Trạng thái | Commit |
|---|---|---|---|
| 1 | Schema Order, migration, seed và tenant isolation | ✅ | |
| 2 | ISO 6346 và tách danh sách số cont | ✅ | |
| 3 | Máy trạng thái, tạo Order và sinh Stop cho từng container | ✅ | |
| 4 | Xác nhận Order: tra giá từng container, snapshot và giá tay | ✅ | |
| 5 | Thêm, bớt, hủy container và hủy Order | ✅ | |
| 6 | Màn danh sách và chi tiết Order | ✅ | |
| 7 | Màn tạo Order | ✅ | |
| 8 | Hoàn tất | ✅ | |

## Nhật ký
<!-- Sau mỗi bước: ngày, đã làm gì, kết quả Kiểm tra, việc người dùng cần làm thủ công. -->
### 22/10/2026 — Bước 1: Schema Order, migration, seed, cách ly tenant
- Viết test trước `modules/orders/repo.int.test.ts` (8 test, thấy đỏ vì chưa có `repo.ts`), rồi làm xanh.
- `lib/db/schema/orders.ts`: `orders`, `order_containers`, `order_stops`, `order_fees` đúng cột và index spec 02, thêm `route_stop_templates` (DOMESTIC theo tuyến, quyết định trong plan.md). Enum mới trong `shared/enums.ts`: `ORDER_TYPES`, `ORDER_STATUSES`, `CONTAINER_STATUSES`, `PORT_READINESS`, `STOP_STATUSES`, `ORDER_FEE_CATEGORIES`, `ORDER_FEE_SOURCES`.
- Migration `0004_orders.sql` (đã review SQL: 5 bảng, khóa duy nhất `uq_order_no`, `uq_order_container_line`, `uq_stop_seq`, `uq_order_fee_idem`, `uq_route_stop_seq`, các FK về bảng task 02).
- `modules/orders/repo.ts`: `createOrderRepo(tdb)` với `.orders`, `.containers`, `.stops`, `.fees`, `.stopTemplates` (list/get/insert/update/updateWhere/remove/removeWhere), mọi truy vấn qua `TenantDb`.
- Seed `seeds/orders.ts` + `orders.test-data.ts`: Phúc An có 5 Order (`EXP-2610-044` nháp 5 cont, trong đó 45HC chưa có giá; `IMP-2610-031` đã xác nhận 2 cont có snapshot giá và phí nâng hạ; `EXP-2610-046` đã xác nhận, 1 cont giá riêng của khách và 1 cont giá tay; `IMP-2610-029` đã hủy; `DOM-2610-001` nội địa) cùng mẫu Stop cho tuyến CL-VSIP và CL-BH; Sao Việt có 1 Order để thử cách ly. Đăng ký trong `lib/db/seed.ts`.
- Kiểm tra: test repo + seed (13 test int) xanh; `pnpm db:migrate` chạy được trên DB dev đã có dữ liệu task 03; `pnpm db:seed` chạy hai lần không báo lỗi và test seed khẳng định không sinh trùng; DB trống được migrate trong Testcontainers; typecheck core sạch; Prettier sạch. `pnpm lint` chỉ báo lỗi cũ trong `.fleet/` (worktree của agent khác, không thuộc task).
- Ghi chú: giá chỉ coi là đã chốt khi có `freightTariffId` hoặc `isManualPrice`; `baseFreightAmount = 0.00` của cont nháp chỉ là giá trị đệm, UI sẽ hiện "Chưa có giá".
- Việc người dùng cần làm thủ công: không có.

### 22/10/2026 — Bước 2: ISO 6346 và tách danh sách số cont
- Test trước `modules/orders/iso6346.test.ts` (9 test) và `container-list.test.ts` (11 test), rồi `packages/shared/iso6346.ts` (`normalizeContainerNo`, `computeCheckDigit`, `validateContainerNo`, báo số kiểm tra đúng khi sai) và `packages/shared/container-list.ts` (`parseContainerList`: tách theo xuống dòng, phẩy, chấm phẩy, tab, khoảng trắng; chữ lẫn thì lấy số; dòng giống số container nhưng sai độ dài vẫn báo lỗi chứ không bỏ qua; báo trùng trỏ về mục đầu).
- Test đặt ở `packages/core` thay vì `packages/shared` vì shared chưa có vitest (cài thêm cần hỏi); ghi decisions.
- Kiểm tra: 20 test unit xanh; seed test kiểm mọi số cont mẫu đúng check digit.

### 22/10/2026 — Bước 3: Máy trạng thái, tạo Order, sinh Stop
- Test trước: `state-machine.test.ts`, `stops.test.ts`, `service.int.test.ts` (18 test int), `features/orders/actions.test.ts` (6 test), `permissions.test.ts` mở rộng.
- `state-machine.ts` (bảng chuyển Order và container, `INVALID_STATUS_TRANSITION`), `stops.ts` (hàm thuần `buildStopPlan`: IMPORT, EXPORT, DOMESTIC theo mẫu tuyến; địa điểm theo vai trò lấy / đóng-dỡ / hạ-trả, bỏ trống thì lấy vùng của tuyến), `service.ts` (`createOrder`, `getOrder`, `getRouteStopTemplate`, `setRouteStopTemplate`), `shared/schemas/orders.ts`, mã lỗi mới (`INVALID_STATUS_TRANSITION`, `PRICE_MISSING`, `CANCEL_FEE_REQUIRED`), quyền `order.view`, `order.write` (+OWNER), `order.manualPrice`.
- orderNo `IMP|EXP|DOM-YYMM-NNN` theo múi giờ tenant, bộ đếm riêng theo tenant, chiều và tháng; tạo song song không trùng. Seed đẩy bộ đếm lên sau số mẫu nên Order mới tiếp `EXP-2610-047`.
- Server Action `createOrder`, `setRouteStopTemplate` trong `features/orders/actions.ts`.
- Kiểm tra: core orders 66 test xanh (kể cả Order IMPORT 5 cont sinh đúng 15 Stop và chuyển trạng thái sai thứ tự bị chặn); web 64 test xanh; typecheck cả workspace sạch.

### 22/10/2026 — Bước 4: Xác nhận Order, snapshot giá, giá tay
- Test trước `confirm.int.test.ts` (14 test) và `totals.test.ts` (6 test), rồi `confirmOrder`, `setManualPrice` trong `service.ts` và `totals.ts` (tổng Order tính lại từ cont và phí bằng decimal.js).
- `confirmOrder`: khóa dòng Order (`SELECT … FOR UPDATE`), kiểm `version` (`STALE_DATA`) rồi bảng chuyển trạng thái; gọi `resolveFreight` (SINGLE) và `resolveFees` cho từng cont; chốt `baseFreightAmount`, `freightTariffId`, `appliedTripMode`; phí `REVENUE_SURCHARGE` và `PASS_THROUGH` vào `order_fees` (`source TARIFF`, khóa idempotency `CONFIRM:<cont>:<mã phí>`); `COST_NORM` không ghi. Còn cont chưa có giá và chưa có giá tay thì `PRICE_MISSING` kèm `details.lines`, không ghi gì.
- Ngày tra giá: `windowStart` Stop đầu theo múi giờ tenant, rồi ETA (Nhập, Nội địa) hoặc cut-off (Xuất), cuối cùng là hôm nay. Phí `PER_KM` nhân quãng đường chuẩn của tuyến; phí `PER_DAY` chưa tính ở bước này (DEM/DET, task 18).
- `setManualPrice`: giá > 0, lý do bắt buộc (zod và service cùng chặn), `isManualPrice`, bỏ `freightTariffId`, audit `MANUAL_PRICE` kèm lý do. Hai người xác nhận cùng lúc: đúng một lần thành công, không ghi trùng phí.
- Server Action `confirmOrder`, `setManualPrice` (+3 test action).
- Kiểm tra: confirm + totals xanh; "đơn có cont không có giá không thể CONFIRMED với giá 0" và "tổng tiền Order = tổng tiền các cont" nằm trong bộ test.

### 22/10/2026 — Bước 5: Thêm, bớt, hủy container và hủy Order
- Test trước `cancel.int.test.ts` (19 test), rồi `addContainers`, `removeContainer`, `cancelContainer`, `cancelOrder` trong `service.ts` (đã tách `priceContainers`, `applyPricing`, `loadStopTemplates` dùng chung với xác nhận Order và tạo Order).
- Thêm cont vào Order đã xác nhận: tra giá và chốt ngay, sinh Stop (sao chép địa điểm, giờ hẹn từ cont đầu), thiếu giá thì `PRICE_MISSING` và không thêm gì, có giá tay thì thêm được; Order đã giao một phần quay về đang thực hiện. Bớt cont chỉ với Order nháp (xóa cont, Stop, đánh lại số dòng, giữ ít nhất 1 cont). Hủy cont: lý do bắt buộc; đã có Stop hoàn thành thì `CANCEL_FEE_REQUIRED` nếu thiếu phí > 0; phí hủy vào `order_fees` (`CANCELLATION_FEE`, tính là doanh thu); Stop chưa chạy chuyển `SKIPPED`; cont đã giao hoặc hoàn tất không hủy được. Hủy Order hủy mọi cont chưa hoàn thành (tất cả hoặc không gì), Order chỉ `CANCELLED` khi mọi cont đã hủy.
- Khóa lạc quan: mọi thao tác kiểm `version` của Order (một thao tác tăng 1 lần); `order_containers.version` cũng tăng khi cont đổi.
- Server Action `addContainers`, `removeContainer`, `cancelContainer`, `cancelOrder` (+4 test action).
- Kiểm tra: cancel xanh (kể cả "hủy 1 cont không làm hủy Order"); core orders + seed 122 test xanh; web 71 test xanh; typecheck cả workspace sạch.

### 22/10/2026 — Bước 6: Màn danh sách và chi tiết Order
- Routes `/orders` (+ `loading.tsx`, `error.tsx`), `/orders/[id]` (+ `not-found.tsx`); menu "Đơn hàng" có liên kết thật. View `order-list.tsx`, `order-detail.tsx`, `order-chips.tsx`, `order-loader.ts` (chọn từng cột gửi xuống client), `lib/deadline.ts` (mức hạn crit/warn/info) và nhãn tiếng Việt trong `packages/shared/labels.ts`.
- Danh sách theo Screen04: H1 nói số Order/container cần xử lý và hạn gần nhất, tab trạng thái có đếm, lọc (tìm, khách, hãng tàu, chiều, ngày tạo), chọn nhiều để "Xác nhận Order nháp" (báo rõ Order nào thiếu giá), dòng mở rộng hiện bảng container, đủ 4 trạng thái và "Xóa bộ lọc"; nạp lại lỗi thì giữ dữ liệu cũ kèm giờ tải lần cuối và Thử lại.
- Chi tiết: thông tin chung, tổng hợp tiền (chi hộ tách riêng, chi phí và lãi lỗ "chưa có", không hiện 0), bảng container, chi tiết container đang chọn (chuỗi Stop, giá, nhập giá tay, chi hộ, bớt/hủy cont), thêm container, hủy Order, lịch sử từ `audit_logs`, cảnh báo số cont trùng Order khác.
- Order nháp hiện giá dự kiến (`previewPrices`, không ghi gì) để "Chưa có giá" chỉ hiện cho cont thật sự không có bảng giá.
- Kiểm tra: so ảnh chụp 1440×900 với `Screen04-Orders/preview.html` (bố cục, chip, chữ); không chỗ nào hiện "0 ₫" cho cont chưa có giá (e2e kiểm bằng biểu thức chính quy trên cả màn).

### 22/10/2026 — Bước 7: Màn tạo Order
- `/orders/new`: thông tin chung, 3 ô địa điểm và giờ hẹn Stop đầu, ô dán danh sách số cont (tách bằng `parseContainerList`, báo ngay số cont sai/trùng), bảng dòng container (loại, seal, VGM, DEM, DET, lạnh, nguy hiểm, tuyến riêng). Check digit báo ngay dưới ô khi gõ, lỗi server hiện dưới đúng ô. Khối "Chuỗi Stop nội địa" trong ngăn kéo sửa tuyến (Danh mục).
- E2E `orders.spec.ts` (13 test): dán 5 số (1 sai check digit) thấy lỗi đúng dòng rồi tạo được; cont không có giá chặn xác nhận và hiện "Chưa có giá"; giá tay 0 hoặc thiếu lý do bị chặn, có lý do thì xác nhận được; hủy 1 cont Order vẫn hoạt động, hủy cả Order; thêm cont vào Order đã xác nhận; xác nhận hàng loạt; đơn Nội địa cần mẫu Stop; phân quyền và cách ly công ty; toàn bộ form dùng bằng bàn phím.
- Sửa test cũ do thêm liên kết "Đơn hàng" trên menu: `shell.spec.ts` (đếm liên kết, thứ tự Tab).

### 22/10/2026 — Bước 8: Hoàn tất
- Kiểm tra toàn bộ: `pnpm typecheck`, ESLint cho `apps` và `packages`, Prettier, `pnpm build` không lỗi; `pnpm test`: core 312 test (kể cả 91 test mới của task: repo, seed, ISO 6346, container-list, máy trạng thái, Stop, tổng tiền, tạo, xác nhận, giá dự kiến, hủy), web 89, worker 1; `pnpm e2e`: 75 test xanh (62 cũ + 13 mới).
- Migration `0004_orders.sql` chạy được trên DB trống (Testcontainers) và trên DB dev đã có dữ liệu task 03; seed chạy hai lần không sinh trùng và có Order mẫu; mọi Server Action dùng `defineAction` (requireRole → zod); mọi bảng mới có test cách ly tenant (5 bảng).
- `pnpm audit:deps`: vẫn 1 lỗ hổng mức vừa (`uuid`) có sẵn từ trước, không đổi.
- Spec 02 (bảng `route_stop_templates`, định dạng `orderNo`) và spec 06 mục 2 (nguồn `targetDate`) đã cập nhật; decisions.md ghi các quyết định và câu hỏi mở cho PO.
- Đạt "Chấp nhận khi": đơn có cont không có giá không thể `CONFIRMED` với giá 0; chuyển trạng thái sai thứ tự bị chặn; Order 5 cont sinh đúng 5 bộ Stop; tổng tiền Order = tổng tiền các cont; hủy 1 cont không làm hủy Order.
- Commit `63162e7`, đã đẩy nhánh `feat/04-orders-containers`; CI run 39765407550 xanh cả 4 job (kiểm tra, e2e, migration, audit).
