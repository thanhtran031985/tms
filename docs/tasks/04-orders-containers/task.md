# 04-orders-containers — Order nhiều container và tự sinh Stop

> Giai đoạn: GĐ1 · Phụ thuộc: 02, 03 · Nhánh git: `feat/04-orders-containers`
> Nguồn: `docs/specs/07_implementation_tickets.md` TICKET-04; spec `00_system_overview_and_adrs.md` mục 1 (Order, Order Container, Stop, Chi hộ) và ADR-004, ADR-005, ADR-008, ADR-009; spec `01_core_architecture_and_grill_logs.md` mục 3 ("Tại sao Snapshot giá", "1 Order chứa nhiều container"); spec `02_database_schema.md` nhóm "5. ĐƠN HÀNG" (`orders`, `order_containers`, `order_stops`) và `order_fees`; spec `03_dispatch_and_concurrency.md` mục 4 (Hủy container / hủy Order); spec `06_hierarchical_pricing_and_fees.md` mục 2 (`targetDate`) và mục 3 (Doanh thu tính trên từng container); spec `05_advanced_workflows_and_ai.md` mục 4 (ISO 6346); PRD `docs/PRD.md` mục C3, F1

## Mục tiêu
Sau task này, Điều vận tạo một Order theo một số Booking hoặc B/L và dán vào danh sách nhiều số container; hệ thống kiểm tra check digit từng số ngay khi gõ, tự sinh chuỗi Stop chuẩn cho từng container. Khi xác nhận Order, mỗi container được tra giá riêng và chốt giá; container chưa có giá thì phải nhập giá tay chứ không bao giờ thành 0. Sau khi tạo vẫn thêm, bớt hoặc hủy được từng container mà không hủy cả Order.

## Phạm vi
**Làm:**
- Bảng `orders`, `order_containers`, `order_stops`, `order_fees`; migration; seed Order mẫu.
- Tạo 1 Order (theo Booking/B/L) kèm danh sách N container: nhập tay hoặc dán/import danh sách số cont; kiểm tra check digit ISO 6346; báo số cont trùng.
- Thêm, bớt, hủy từng container sau khi tạo; hủy Order là hủy mọi container chưa hoàn thành (spec 03 mục 4).
- Khi `CONFIRMED`: gọi Pricing Engine cho từng container, snapshot `baseFreightAmount` + `freightTariffId` và phụ phí thu khách vào `order_fees`; cập nhật tổng trên `orders`. Container không có giá thì bắt nhập giá tay (`isManualPrice`).
- Tự sinh Stop tiêu chuẩn cho từng container theo loại đơn: IMPORT `PICK_FULL` → `UNSTUFFING` → `RETURN_EMPTY`; EXPORT `PICK_EMPTY` → `STUFFING` → `PORT_IN`; DOMESTIC cấu hình theo tuyến.
- Máy trạng thái Order (enum `status` trong spec 02) và trạng thái container, có bảng chuyển trạng thái hợp lệ và test.
- Màn Đơn hàng và container (Screen04-Orders): danh sách, tạo Order, chi tiết Order.

**Không làm (thuộc task khác):**
- Tạo chuyến, gán xe, chuyển container sang `PLANNED`/`IN_PROGRESS` (task 06).
- Gỡ container đang nằm trên chuyến khi hủy, hủy assignment liên quan, tính lại giá khi ghép/tách chuyến và cờ `repriceRequired` (task 08).
- Chuyển Order sang `RECONCILED` theo `isEpodVerified` và màn chứng từ EIR/ePOD của container (task 12).
- Chi hộ từ chi phí dọc đường `EXPENSE_REBILL` (task 16), phí DEM/DET tự động (task 18), hóa đơn (task 21).
- Chi phí phân bổ và lãi lỗ trên chi tiết Order (task 17, 22): task này hiện "Chưa có chi phí", không hiện 0.
- Xuất Excel danh sách Order có trên thiết kế (task 22).

## Thiết kế
- `designs/components/Screen04-Orders/` (đọc README.md và preview.html; 4 trạng thái: Bình thường; Đang tải là dòng xương thay cho bảng; Trống nói lý do kèm một hành động "Tạo Order đầu tiên" hoặc "Thêm container"; Lỗi giữ dữ liệu cũ kèm giờ tải lần cuối và nút "Thử lại"; lọc không ra kết quả có nút "Xóa bộ lọc").
- Thành phần: `designs/components/WorkTable/` (bảng Order có dòng mở rộng hiện bảng container), `designs/components/StatusChip/` (trạng thái Order, trạng thái cont, mức hạn), `designs/components/ContainerCard/` (quy tắc hiển thị số cont, loại cont, chip), `designs/components/DeadlineTimeline/` (mức hạn cut-off, DEM, DET: `crit` dưới 3 giờ hoặc HOLD, `warn` trong 8 giờ, `info` xa hơn), `designs/components/Field/`, `designs/components/FilterTabs/`, `designs/components/Alert/`, `designs/components/EmptyState/`, `designs/components/Button/`.
- Quy tắc hiển thị từ Screen04: không có giá ghi "Chưa có giá" kèm nhập giá tay có lý do bắt buộc, không bao giờ hiện 0 ₫; chi hộ không cộng vào doanh thu; cont đã giao không hủy được; cont đã lấy rỗng phải nhập phí hủy lớn hơn 0; số cont, mã Order, số Booking/B/L dùng `--font-mono`.
- Thiết kế dùng loại cont `20GP`/`40GP`, còn spec 02 dùng `20DC`/`40DC`: code theo enum spec 02, nhãn hiển thị theo quyết định ghi trong decisions.md.

## Quyết định kiến trúc
- Module `packages/core/modules/orders/`: `service.ts` (tạo, sửa, xác nhận, hủy), `state-machine.ts`, `stops.ts` (sinh Stop), `repo.ts`, `schema.ts`. Schema Drizzle ở `packages/core/lib/db/schema/orders.ts`, đúng tên cột spec 02 (`bookingOrBlNo`, `lineNo`, `containerNo`, `portReadinessStatus`, `demFreeUntil`, `detFreeUntil`, `baseFreightAmount`, `freightTariffId`, `isManualPrice`...).
- 1 Order = 1 Booking/B/L có nhiều container; container là đơn vị điều vận, tính giá, DEM/DET, ePOD (quyết định PO, spec 01 mục 3). Stop gắn `orderContainerId`; `orders` chỉ giữ thông tin chung và tổng hợp (`containerCount`, `totalFreightAmount`, `totalSurchargeAmount`, `totalPassThroughAmount`) cập nhật trong cùng transaction mỗi khi container hoặc phí đổi.
- `orderNo` sinh bằng `nextNumber(ctx, key)` trong cùng transaction (spec 02 mục 1). Định dạng theo dữ liệu mẫu của thiết kế (`EXP-2610-044`, `IMP-2610-031`: chiều + năm tháng + số thứ tự); chốt trong plan.md.
- Kiểm tra check digit ISO 6346 ở `packages/shared/iso6346.ts` (dùng lại cho OCR ở task 12): chuẩn hóa bỏ khoảng trắng, chữ hoa; `containerNo` được phép rỗng với hàng Xuất chưa lấy rỗng. Trùng số cont trong cùng Order bị chặn; trùng với container đang hoạt động ở Order khác trong tenant thì cảnh báo.
- Máy trạng thái Order: `DRAFT` → `CONFIRMED` → `IN_PROGRESS` → `PARTIALLY_DELIVERED` → `DELIVERED` → `RECONCILED` → `INVOICED`; `CANCELLED` chỉ khi không còn container nào đang hoạt động. Bảng chuyển hợp lệ khai báo một chỗ; chuyển sai trả `INVALID_STATUS_TRANSITION` (mã mới). Điều kiện riêng của các bước sau (ePOD cho `RECONCILED`, hóa đơn cho `INVOICED`) để task 12, 21 gắn thêm. Trạng thái container: `PENDING` → `PLANNED` → `IN_PROGRESS` → `DELIVERED` → `COMPLETED`, và `CANCELLED`.
- Xác nhận Order: với từng container, `targetDate` = ngày (theo múi giờ tenant) của Stop đầu tiên theo kế hoạch (spec 06 mục 2); gọi `resolveFreight` với `tripMode = 'SINGLE'`, `routeId` của container, `containerType`, `customerId` của Order; ghi `baseFreightAmount`, `freightTariffId`, `appliedTripMode = 'SINGLE'`. Gọi `resolveFees` lấy các mã `REVENUE_SURCHARGE` và `PASS_THROUGH` ghi vào `order_fees` (`source = 'TARIFF'`, `sourceTariffId`, `orderContainerId`); phí `COST_NORM` không ghi vào `order_fees`.
- Container trả `TARIFF_NOT_FOUND` thì Order không chuyển `CONFIRMED`; người dùng nhập giá tay (`isManualPrice = true`) kèm lý do ghi vào `audit_logs`. Giá 0 hoặc âm bị chặn. Không bao giờ để 0 (ADR-005).
- Hủy container (spec 03 mục 4): chưa có Stop nào `COMPLETED` thì hủy tự do kèm lý do; đã chạy một phần thì bắt buộc nhập phí hủy `CANCELLATION_FEE` > 0 (ghi `order_fees`) và lý do; container `DELIVERED`/`COMPLETED` không hủy được (theo Screen04). Hủy container không làm hủy Order; tổng Order tính lại.
- Khóa lạc quan: `orders.version`, `order_containers.version`; action gửi `version` đã đọc, lệch trả `STALE_DATA`.
- Audit trong cùng transaction cho mọi thay đổi Order và Fee (Rule 8): `CREATE`, `UPDATE`, `STATUS_CHANGE`, `CONFIRM`, `MANUAL_PRICE`, `CANCEL_CONTAINER`.
- Quyền: tạo, sửa, xác nhận, hủy cho `OWNER`, `ADMIN`, `DISPATCHER`; nhập giá tay cho `DISPATCHER`, `ACCOUNTANT`, `ADMIN` (thiết kế ghi giá tay chờ Kế toán duyệt, xem decisions.md); `VIEWER` chỉ xem.
- Tiền dùng decimal.js, `DECIMAL(18,2)` + `currency`; thời gian `DATETIME(3)` UTC, hiển thị theo múi giờ tenant.

## Các bước
### Bước 1 — Schema Order, migration, seed và tenant isolation
- `packages/core/lib/db/schema/orders.ts`: `orders`, `order_containers`, `order_stops`, `order_fees` đúng spec 02 (index `uq_order_no`, `uq_order_container_line`, `uq_stop_seq`, `uq_order_fee_idem`); `pnpm db:generate`, review SQL.
- Viết test trước `packages/core/modules/orders/repo.int.test.ts`: 4 repo, Tenant B không đọc, sửa, xóa được dữ liệu Tenant A.
- Seed: vài Order lấy từ dữ liệu mẫu Screen04 (ví dụ `EXP-2610-044` có 5 cont, `IMP-2610-031` có 2 cont), có cont chưa có giá.
**Kiểm tra:** `pnpm db:migrate` chạy được trên DB trống và DB đã có dữ liệu của task 03; `pnpm db:seed` chạy hai lần không trùng; `pnpm test --filter core -- orders.*repo` xanh.

### Bước 2 — ISO 6346 và tách danh sách số cont
- Viết test trước `packages/shared/iso6346.test.ts` và `packages/shared/container-list.test.ts`: số đúng check digit (ví dụ `MSKU1234565`), sai check digit, chữ thường và khoảng trắng được chuẩn hóa, tách danh sách dán từ Excel hoặc email (xuống dòng, dấu phẩy, tab, chữ lẫn), báo trùng trong danh sách.
- Viết `iso6346.ts`, `container-list.ts`.
**Kiểm tra:** `pnpm test --filter shared -- iso6346` và `-- container-list` xanh.

### Bước 3 — Máy trạng thái, tạo Order và sinh Stop cho từng container
- Viết test trước `packages/core/modules/orders/state-machine.test.ts`: mọi cặp chuyển hợp lệ được, chuyển sai thứ tự (ví dụ `DRAFT` → `DELIVERED`) trả `INVALID_STATUS_TRANSITION`.
- Viết test trước `service.int.test.ts`: tạo Order IMPORT 5 cont sinh đúng 5 bộ Stop `PICK_FULL` → `UNSTUFFING` → `RETURN_EMPTY` (15 Stop, `sequenceNo` 1..3 mỗi cont); EXPORT sinh `PICK_EMPTY` → `STUFFING` → `PORT_IN`; `containerCount` = 5; `orderNo` không trùng; có `audit_logs`.
- Viết `state-machine.ts`, `stops.ts`, `service.ts` (createOrder), `schema.ts`; Server Action `createOrder` trong `apps/web/src/features/orders/actions.ts` (khuôn `requireRole` rồi zod rồi service).
- DOMESTIC: spec chưa có nơi lưu "cấu hình theo tuyến"; chốt cách làm trong plan.md trước khi code phần này.
**Kiểm tra:** `pnpm test --filter core -- orders` xanh; test "Order 5 cont sinh đúng 5 bộ Stop" và "chuyển trạng thái sai thứ tự bị chặn" có trong bộ test.

### Bước 4 — Xác nhận Order: tra giá từng container, snapshot và giá tay
- Viết test trước `confirm.int.test.ts`: Order 3 cont đều có giá thì `CONFIRMED`, mỗi cont có `baseFreightAmount` + `freightTariffId`, phụ phí vào `order_fees` đúng `orderContainerId`, `totalFreightAmount` = tổng các cont; một cont không có giá thì Order không `CONFIRMED` và không cont nào bị ghi 0; nhập giá tay có lý do thì xác nhận được, `isManualPrice = true`, có audit `MANUAL_PRICE`; giá tay 0 bị chặn; `targetDate` lấy ngày Stop đầu theo múi giờ tenant.
- Viết `service.ts` (`confirmOrder`, `setManualPrice`), Server Action tương ứng.
**Kiểm tra:** `pnpm test --filter core -- confirm` xanh; test "đơn có cont không có giá không thể `CONFIRMED` với giá 0" và "tổng tiền Order = tổng tiền các cont" có trong bộ test.

### Bước 5 — Thêm, bớt, hủy container và hủy Order
- Viết test trước: thêm cont vào Order đã `CONFIRMED` thì cont mới được tra giá và sinh Stop; bớt cont ở Order `DRAFT` xóa cont và Stop; hủy 1 cont chưa có Stop `COMPLETED` không cần phí, Order vẫn hoạt động, tổng tính lại; hủy cont đã có Stop `COMPLETED` mà thiếu phí hủy hoặc lý do bị chặn; cont `DELIVERED` không hủy được; hủy Order hủy mọi cont chưa hoàn thành và Order chỉ `CANCELLED` khi không còn cont hoạt động; gửi `version` cũ trả `STALE_DATA`.
- Viết `service.ts` (`addContainers`, `removeContainer`, `cancelContainer`, `cancelOrder`), Server Action tương ứng.
**Kiểm tra:** `pnpm test --filter core -- cancel` xanh; test "hủy 1 cont không làm hủy Order" có trong bộ test.

### Bước 6 — Màn danh sách và chi tiết Order
- Route `apps/web/src/app/(tenant)/orders/page.tsx`, `orders/[id]/page.tsx`; view `apps/web/src/features/orders/order-list.tsx`, `order-detail.tsx`.
- Danh sách: H1 nói số Order/container cần xử lý và hạn gần nhất; tab trạng thái có số đếm; lọc theo tìm kiếm, khách, hãng tàu, chiều, ngày tạo; chọn nhiều để "Xác nhận Order nháp"; dòng mở rộng hiện bảng container (số cont, loại, trạng thái cont, cảng/bãi, hạn DEM, hạn DET, cước, xe, ePOD) với chip mức hạn.
- Chi tiết: thông tin chung, tổng doanh thu, bảng container, chi tiết cont đang chọn (chuỗi Stop, giá hoặc "Chưa có giá" + nhập giá tay, chi hộ, hủy cont kèm lý do và phí), lịch sử thay đổi từ `audit_logs`.
- Đủ 4 trạng thái và trạng thái "lọc không ra kết quả".
**Kiểm tra:** mở `/orders` và `/orders/<id>` trên 1440×900 so với `designs/components/Screen04-Orders/preview.html`, khớp bố cục, chip, chữ ở cả 4 trạng thái; không chỗ nào hiện "0 ₫" cho cont chưa có giá.

### Bước 7 — Màn tạo Order
- View `apps/web/src/features/orders/order-create.tsx`: thông tin chung (khách, hãng tàu, chiều, Booking/B/L, tàu/chuyến, cut-off, tuyến), ô dán danh sách số cont, bảng dòng cont (loại, VGM, seal, DEM, DET, lạnh, nguy hiểm, tuyến riêng); check digit báo ngay khi gõ, lỗi dưới ô; báo số cont trùng.
- E2E `apps/web/e2e/orders.spec.ts`: dán 5 số cont (1 số sai check digit) thấy lỗi đúng dòng; sửa xong tạo Order; xác nhận Order có 1 cont chưa có giá thì bị chặn và thấy "Chưa có giá"; nhập giá tay có lý do rồi xác nhận được; hủy 1 cont, Order vẫn hoạt động.
**Kiểm tra:** `pnpm e2e -- orders` xanh; toàn bộ form dùng được bằng bàn phím.

### Bước 8 — Hoàn tất
- Chạy toàn bộ kiểm tra, cập nhật progress.md, đổi trạng thái dòng 04 trong `docs/tasks/README.md`, cập nhật spec nếu có quyết định khác (định dạng `orderNo`, DOMESTIC, nhãn loại cont).
**Kiểm tra:** `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` không lỗi; `pnpm e2e` xanh cho luồng tạo, xác nhận, hủy cont; migration chạy được trên DB trống và DB có dữ liệu; seed có Order mẫu; mọi Server Action có `requireRole` và zod; mọi repo mới có test tenant isolation; đạt "Chấp nhận khi" của ticket: đơn có cont không có giá không thể `CONFIRMED` với giá 0; chuyển trạng thái sai thứ tự bị chặn; Order 5 cont sinh đúng 5 bộ Stop; tổng tiền Order = tổng tiền các cont; hủy 1 cont không làm hủy Order.
