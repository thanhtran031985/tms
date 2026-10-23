# Phân hệ Điều vận, Chống Đụng độ & Ràng buộc Vật lý

## 1. Xử lý Concurrency với Pessimistic Locking (Backend Rules)
Nhiều Điều vận viên (Dispatchers) cùng kéo thả trên một bảng Kanban. Để ngăn chặn 2 người gán cùng 1 Tài xế, Đầu kéo **hoặc Rơ moóc [SỬA]** cho 2 chuyến chồng lấn thời gian:

1. Bắt buộc bọc toàn bộ logic trong `await db.transaction(async (tx) => { ... })`.
2. **[SỬA] Khóa theo thứ tự cố định để tránh deadlock:** luôn khóa theo thứ tự `drivers` → `tractors` → `trailers`, và trong cùng một bảng thì sắp theo `id` tăng dần (khi ghép chuyến có nhiều tài nguyên).
   ```typescript
   const [driver] = await tx.select().from(drivers)
     .where(and(eq(drivers.id, driverId), eq(drivers.tenantId, ctx.tenantId)))
     .for('update');
   ```
3. **[SỬA] Điều kiện gán không chỉ dựa vào `status`.** Sau khi khóa dòng tài nguyên, kiểm tra:
   - Tài nguyên tồn tại, cùng tenant, không `INACTIVE`, không bị xóa mềm.
   - **Không có assignment chồng lấn thời gian** (status không thuộc `CANCELLED`, `COMPLETED`, `ABORTED_MIDWAY`):
     ```sql
     planned_start < :newEnd AND planned_end > :newStart
     ```
     Kiểm tra cho cả `driverId`, `tractorId`, `trailerId`.
   - Không có `maintenance_orders` (PLANNED/IN_PROGRESS) chồng lấn khoảng thời gian.
   - **[BỔ SUNG] Giấy tờ còn hạn tại `plannedEnd`:** GPLX tài xế, đăng kiểm/bảo hiểm/phù hiệu đầu kéo, kiểm định rơ moóc. Hết hạn → chặn với mã lỗi `DOCUMENT_EXPIRED`. Sắp hết hạn trong 15 ngày → cho gán nhưng cảnh báo.
   - **[BỔ SUNG] Thời gian lái xe:** Tổng thời gian kế hoạch của tài xế trong ngày không vượt giới hạn giờ lái theo quy định hiện hành (cấu hình theo tenant, mặc định 10 giờ/ngày, liên tục không quá 4 giờ). Vượt → cảnh báo, chỉ role `ADMIN` mới được ghi đè (ghi audit lý do).
   - Nếu chuyến bắt đầu ngay (`plannedStart <= now + 30 phút`) thì thêm điều kiện `status = 'AVAILABLE'`.
4. Nếu vi phạm, trả `{ ok: false, code: 'DRIVER_NOT_AVAILABLE' | 'TRACTOR_NOT_AVAILABLE' | 'TRAILER_NOT_AVAILABLE' | 'RESOURCE_TIME_CONFLICT' | 'DOCUMENT_EXPIRED' }` và rollback (Rule 5 file 01).
5. Lưu `dispatch_assignments`, đồng bộ cột `primary*` của `consolidated_trips`, tăng `version`, ghi `audit_logs`.
6. **[SỬA]** `status` của Tài xế/Đầu kéo chỉ chuyển sang `ON_DUTY` / `IN_USE` khi chuyến thực sự bắt đầu (tài xế bấm "Bắt đầu chuyến" hoặc geofence rời bãi), không chuyển ngay lúc lên kế hoạch.
7. Sau commit: `revalidatePath('/dispatch')` và **[BỔ SUNG]** publish sự kiện `dispatch.updated` lên Redis Pub/Sub để các Điều vận viên khác đang mở Kanban nhận cập nhật qua SSE.
8. **[BỔ SUNG] Timeout khóa:** đặt `innodb_lock_wait_timeout` ngắn (ví dụ 5 giây) cho transaction điều vận; khi timeout trả lỗi `RESOURCE_BUSY_RETRY` để UI rollback optimistic và báo người dùng thử lại.
9. **[BỔ SUNG] Khóa lạc quan cho thao tác sửa chuyến:** client gửi kèm `version` đã đọc; `UPDATE ... WHERE id = ? AND version = ?` không ảnh hưởng dòng nào → trả `STALE_DATA` và UI tải lại thẻ.

### Ghi chú cài đặt (task 06, chốt 23/10/2026)
- **Assignment theo Stop:** mỗi Stop của container trong chuyến có một dòng `dispatch_assignments` cùng bộ tài nguyên và cùng khung giờ chuyến (`stopId` NOT NULL). Kiểm tra chồng lấn bỏ qua các dòng cùng `consolidatedTripId`. Lương (task 20) phải gom theo chuyến; Drop & Hook (task 09) tách chặng từ các dòng này. Gán lại chuyến: hủy dòng cũ (`CANCELLED`) rồi tạo dòng mới trong cùng transaction. Stop chưa có giờ kế hoạch riêng nên mọi dòng dùng `plannedStart/plannedEnd` của chuyến; Rule 8 so `plannedEnd` của chuyến với `order.cutOffAt`.
- **Mã lỗi:** `*_NOT_AVAILABLE` = không tồn tại / khác tenant / `INACTIVE` / xóa mềm / tài xế `OFF_DUTY` (luôn chặn) / status không `AVAILABLE` khi chuyến bắt đầu trong 30 phút / bảo dưỡng chồng lấn (`details.reason`); `RESOURCE_TIME_CONFLICT` = chồng lấn assignment (`details.conflictTripCode`). Mã mới: `REEFER_REQUIRES_GENSET` (Rule 5), `DG_CERTIFICATE_REQUIRED` (Rule 6), `PORT_NOT_READY` (Rule 7), `PAYLOAD_EXCEEDED` và `WEIGHT_CONFIRMATION_REQUIRED` (Rule 2; xác nhận bằng cờ `confirmMissingWeight`), `DRIVING_HOURS_EXCEEDED`, `DRIVING_HOURS_OVERRIDE_FORBIDDEN`, `CONTAINER_ALREADY_IN_TRIP`, `ORDER_NOT_CONFIRMED`. Lỗi MariaDB 1205 (hết giờ chờ khóa) và 1213 (deadlock) đều trả `RESOURCE_BUSY_RETRY`.
- **Giờ lái:** chỉ áp giới hạn tổng giờ kế hoạch mỗi ngày dương lịch theo múi giờ tenant (`tenants.settings.dispatch.maxDrivingHoursPerDay`, mặc định 10; chuyến qua nửa đêm chia theo ngày). Mốc "liên tục 4 giờ" cần dữ liệu GPS nên để task 13/14. Vượt giờ trả `DRIVING_HOURS_EXCEEDED`; `ADMIN` gửi lại kèm `overrideDrivingHours.reason` thì gán được, audit ghi lý do; role khác gửi cờ này nhận `DRIVING_HOURS_OVERRIDE_FORBIDDEN`.
- **Rule 2:** bảng `tractors` chưa có cột tự trọng đầu kéo nên phép kiểm tra bỏ phần này và trả cảnh báo `TRACTOR_TARE_NOT_COUNTED`. Không có VGM thì dùng khối lượng hàng + vỏ chuẩn (20ft 2,3 t; 40/45ft 3,8 t; cont lạnh +1,2 t).
- **Rule 7:** `HOLD_CUSTOMS`/`HOLD_LINE` luôn chặn; Order Nhập cần `READY_EDO`, Order Xuất cần `READY_EMPTY_RELEASE`, Order nội địa bỏ qua; chỉ áp khi Stop đầu ở địa điểm loại `PORT`/`DEPOT`. Chặn ở `dispatchTrip` (PLANNED → DISPATCHED); `dispatchTrip` chỉ đổi trạng thái chuyến, container giữ `PLANNED`.
- **Sự kiện:** `dispatch.updated` phát sau commit lên kênh Redis `tenant:{tenantId}:dispatch` với `{ type, tenantId, tripId, version, orderContainerIds }`.

## 2. Ràng buộc Vật lý đối với Ghép Cont (TWIN_20) & Kết hợp 2 chiều (COMBINED)
Khi tạo hoặc gán tài nguyên vào consolidated_trips, Service phải kiểm tra các Hard Rules sau:

- **Rule 1 (Rơ moóc cho TWIN_20) [SỬA]:** Nếu `tripMode === 'TWIN_20'`, bắt buộc `trailer.canCarryTwin20 === true` (khung 40ft/45ft có chốt khóa giữa). Rơ moóc `20FT` hoặc khung không có chốt giữa → chặn và trả lỗi ngay. Cả 2 container phải là cont 20ft (có thể cùng 1 Order hoặc thuộc 2 Order khác nhau).
- **Rule 2 (Tải trọng) [SỬA]:** Dùng khối lượng toàn bộ của container (`vgmTons`, nếu chưa có thì `cargoWeightTons` + vỏ cont tiêu chuẩn) chứ không chỉ khối lượng hàng:
  - Tổng khối lượng các cont ≤ `trailer.maxPayloadTons`.
  - Tổng khối lượng cont + `trailer.tareWeightTons` + đầu kéo ≤ `tractor.permittedGrossWeightTons` (khối lượng toàn bộ cho phép theo giấy kiểm định).
  - Thiếu dữ liệu khối lượng → cảnh báo bắt buộc xác nhận, không âm thầm bỏ qua.
- **Rule 3 (Đảo vỏ STREET_TURN):** Nếu ghép 1 container của Order Nhập (IMPORT) và 1 container của Order Xuất (EXPORT) dùng chung vỏ, bắt buộc kiểm tra `importOrder.shippingLineId === exportOrder.shippingLineId` và `importContainer.containerType === exportContainer.containerType`. **[SỬA]** Liên kết lưu ở `order_containers.linkedContainerId` (từng cont), không phải ở cấp Order. **[BỔ SUNG]** Thêm:
  - `shippingLine.allowsStreetTurn === true` và đã có `streetTurnApprovalRef` (số chấp thuận/lệnh đổi của hãng tàu) trước khi chuyển trạng thái chuyến sang `DISPATCHED`.
  - Thời gian: Stop `UNSTUFFING` của đơn Nhập phải kết thúc trước Stop `STUFFING` của đơn Xuất.
  - Sau khi đảo vỏ, `exportContainer.containerNo = importContainer.containerNo`; đồng hồ DET của vỏ chuyển sang theo dõi trên cont Xuất; cont Nhập không còn Stop `RETURN_EMPTY` (Stop đó chuyển `SKIPPED`).
  - Ghi phí `STREET_TURN_FEE` (nếu hãng tàu thu) dạng `PASS_THROUGH` hoặc chi phí, theo cấu hình.
- **Rule 4 (COMBINED không có Street Turn) [BỔ SUNG]:** Chuyến kết hợp chiều Nhập và chiều Xuất dùng 2 vỏ khác nhau (trả rỗng cont Nhập rồi lấy rỗng cho cont Xuất). Không áp Rule 3, nhưng vẫn kiểm tra thứ tự Stop hợp lệ về vật lý (không thể chở quá 1 cont 40 cùng lúc).
- **Rule 5 (Cont lạnh) [BỔ SUNG]:** Container loại `*RF` → rơ moóc phải `hasGensetPower = true` (hoặc có máy phát rời được khai báo).
- **Rule 6 (Hàng nguy hiểm) [BỔ SUNG]:** `isDangerousGoods = true` → tài xế phải có chứng chỉ chở hàng nguy hiểm (thêm vào danh mục giấy tờ tài xế) và không được ghép TWIN_20 với đơn của khách khác.
- **Rule 7 (Trạng thái sẵn sàng tại cảng) [BỔ SUNG]:** Không cho chuyến bắt đầu nếu Stop đầu tiên tại cảng/depot mà container đang `HOLD_CUSTOMS` / `HOLD_LINE` hoặc chưa `READY_EDO` / `READY_EMPTY_RELEASE` (cho lưu kế hoạch, chặn lúc Dispatch).
- **Rule 8 (Cut-off) [BỔ SUNG]:** Với hàng Xuất, nếu `plannedEnd` của Stop `PORT_IN` sau `order.cutOffAt` → cảnh báo đỏ trên thẻ Kanban.

### Ghi chú cài đặt (task 08, chốt 23/10/2026)
- **Dịch vụ:** `createConsolidatedTrip` (2 container, `TWIN_20` hoặc `COMBINED`, gán luôn xe nếu có `resources`), `addContainerToTrip` (chuyến SINGLE chưa điều thành chuyến ghép), `linkStreetTurn` và `setStreetTurnApproval`. Khóa theo thứ tự chuyến (nếu có), drivers, tractors, trailers (id tăng dần), rồi `order_containers` (id tăng dần), cùng thứ tự với `assignResources`.
- **Mã lỗi mới:** `TRIP_MODE_INVALID`, `TWIN20_TRAILER_NOT_ALLOWED`, `TWIN20_CONTAINER_NOT_20FT` (Rule 1), `DG_TWIN20_MIXED_CUSTOMER` (Rule 6), `STREET_TURN_LINE_MISMATCH`, `STREET_TURN_TYPE_MISMATCH`, `STREET_TURN_NOT_ALLOWED`, `STREET_TURN_NOT_APPROVED` (Rule 3), `INVALID_STOP_SEQUENCE` (Rule 3, 4), `TRIP_LAST_CONTAINER`. Rule 2, 5, 6, 7 dùng lại mã của task 06. Cảnh báo mới `SEQUENCE_NOT_VERIFIED` (thiếu giờ Stop nên chưa kiểm tra được thứ tự).
- **Rule 2 cho chuyến ghép:** cộng khối lượng toàn bộ các cont; `tổng ≤ trailer.maxPayloadTons` và `tổng + trailer.tareWeightTons + tractor.tareWeightTons ≤ tractor.permittedGrossWeightTons`. Bảng `tractors` thêm cột `tare_weight_tons` (NULL thì giữ cảnh báo `TRACTOR_TARE_NOT_COUNTED`).
- **Rule 4:** mỗi cont ở trên rơ moóc từ Stop đầu đến Stop cuối (Nhập: `PICK_FULL` đến `RETURN_EMPTY`, Xuất: `PICK_EMPTY` đến `PORT_IN`); hai khoảng chồng nhau chỉ hợp lệ khi cả hai là cont 20 feet. Cặp đã Street Turn coi như một vỏ vật lý. COMBINED cần đúng 1 cont Nhập và 1 cont Xuất. Giờ Stop so bằng `deadlineTime ?? windowStart` (kết thúc) và `windowStart` (bắt đầu); thiếu giờ thì cho qua kèm cảnh báo.
- **Street Turn:** liên kết hai chiều, cont Xuất nhận số cont và `detFreeUntil` của cont Nhập, Stop `RETURN_EMPTY` còn `PENDING` của cont Nhập thành `SKIPPED`. Số chấp thuận ghi cho cả cặp; `dispatchTrip` chặn `STREET_TURN_NOT_APPROVED`. Phí `STREET_TURN_FEE` ghi `order_fees` của Order Xuất (`source = MANUAL`, khóa idempotency theo cont Xuất) theo `tenants.settings.dispatch.streetTurnFee` = `PASS_THROUGH` (mặc định) | `REVENUE_SURCHARGE` | `NONE`.
- **Tách chuyến và hủy:** `removeContainerFromTrip` (chuyến `PLANNED` hoặc `DISPATCHED`): hủy assignment của Stop thuộc cont đó, bỏ `trip_containers`, cont về `PENDING`, chuyến còn 1 cont về `SINGLE`, chuyến hết cont thì `CANCELLED`. Cont có giá ghép (`appliedTripMode` khác `SINGLE`) về `SINGLE` và `repriceRequired`. Phân bổ sửa tay về số hệ thống, `allocationMethod` khỏi `MANUAL`, `consolidated_trips.allocation_review_required = true`, audit `RESET_ALLOCATION`. `cancelContainer` và `cancelOrder` gỡ container khỏi chuyến qua `detachFromTrips`; chuyến đang chạy chặn hủy.
- **Sự kiện:** ghép, tách và hủy phát `dispatch.updated` kèm mọi container bị ảnh hưởng; phát thêm `pricing.reprice_required` (kênh `tenant:{tenantId}:pricing`) cho cont bị đánh dấu tính lại giá.

## 3. Nghiệp vụ Drop & Hook (Tách rời Đầu kéo và Rơ moóc)
Khi tài xế kéo cont tới kho khách nhưng khách giữ lại đóng/rút hàng lâu, Điều vận bấm "Drop Trailer".

- Hệ thống cập nhật `trailers.status = 'DROPPED'` và `trailers.currentLocationId = stop.locationId`.
- Giải phóng ngay lập tức `tractors.status = 'AVAILABLE'` và `drivers.status = 'AVAILABLE'` để Điều vận kéo thả sang chuyến khác.
- **[BỔ SUNG]** Assignment hiện tại kết thúc ở Stop `DROP_TRAILER` với status `COMPLETED`; hệ thống tự sinh Stop `HOOK_TRAILER` (status `PENDING`, chưa có đầu kéo) xuất hiện trong cột "Chờ móc rơ moóc" của Kanban.
- **[BỔ SUNG]** Khi Điều vận gán đầu kéo + tài xế cho Stop `HOOK_TRAILER`, áp đầy đủ kiểm tra mục 1 và rơ moóc phải đang `DROPPED` tại đúng `locationId`.
- **[BỔ SUNG]** Lương: chặng trước Drop và chặng sau Hook là 2 assignment riêng, mỗi assignment được tính lương theo bảng phí của chặng tương ứng (cấu hình mã phí `DRIVER_SALARY_DROP` / `DRIVER_SALARY_HOOK` hoặc theo tỷ lệ `completionPercentage`).
- **[BỔ SUNG]** Màn hình "Rơ moóc đang thả" liệt kê rơ moóc `DROPPED` kèm số giờ đã nằm tại kho để Điều vận đòi phí lưu rơ moóc (nếu có thỏa thuận với khách).

## 4. Hủy & Tách chuyến [BỔ SUNG]
- **Hủy assignment:** chuyển `CANCELLED`, không xóa. Nếu tài nguyên đang `IN_USE`/`ON_DUTY` vì assignment này thì trả về `AVAILABLE`. **[task 06]** `cancelAssignment` hủy mọi assignment hoạt động của một chuyến `PLANNED`/`DISPATCHED`, xóa `primary*`, chuyến về `PLANNED`; tài nguyên chỉ về `AVAILABLE` khi không còn assignment hoạt động nào khác giữ chúng.
- **Tách chuyến ghép (un-consolidate):** gỡ 1 container khỏi `trip_containers`, đổi `tripMode` về `SINGLE` nếu chỉ còn 1 cont, và phát sự kiện `pricing.reprice_required` cho các container bị ảnh hưởng (xem file 06 mục 4). Nếu Kế toán đã sửa tay phân bổ của chuyến thì phân bổ bị đặt lại về số hệ thống và báo cho Kế toán.
- **Hủy container / hủy Order [SỬA]:** Hủy được từng container (`order_containers.status = CANCELLED`) mà không hủy cả Order. Container chỉ hủy tự do khi chưa có Stop nào `COMPLETED`; nếu đã chạy một phần thì phải nhập phí hủy (`CANCELLATION_FEE`) và lý do. Hủy Order = hủy mọi container chưa hoàn thành; Order chỉ chuyển `CANCELLED` khi không còn container nào đang hoạt động.
- **Phí hủy nhà xe ngoài:** nếu assignment `SUB_CONTRACTOR` bị hủy sau khi đã xác nhận, cho phép ghi chi phí hủy vào `trip_costs`.

## 5. Giao diện Kanban [BỔ SUNG]
- Cột mặc định: `Chờ điều` (container của Order CONFIRMED chưa có trip) → `Đã lên kế hoạch` → `Đã điều` → `Đang chạy` → `Chờ móc rơ moóc` → `Hoàn thành chờ chứng từ`.
- **[SỬA]** Mỗi thẻ trên Kanban là **một container** (hiển thị số Order, số cont, khách). Thẻ của cùng một Order có thể gom nhóm/thu gọn để Điều vận thấy cả lô. Kéo thẻ container vào thẻ Tài xế/Đầu kéo trên lane thời gian (theo ngày) để tạo assignment.
- Bảng Kanban phải phân trang/lọc theo ngày, khu vực, khách hàng; không tải toàn bộ đơn của tenant.
- Hiển thị nhãn: trạng thái cảng (`portReadinessStatus`), đếm ngược DEM/DET/cut-off, xe sắp đến kỳ bảo dưỡng, giấy tờ sắp hết hạn.

### Ghi chú cài đặt (task 07, chốt 23/10/2026)
- **Phân cột** (`board.query.ts`): `Chờ điều` gồm container `PENDING` của Order `CONFIRMED`/`IN_PROGRESS` mà Stop đầu chưa có giờ hoặc giờ không sau hết ngày xem (tồn từ ngày trước vẫn hiện), cộng container có chuyến `PLANNED` nhưng không còn assignment hoạt động (sau "Hoàn tác"; thẻ mang chuyến cũ để gán lại, không tạo chuyến mới). Các cột chuyến lấy chuyến giao với ngày xem theo giờ tenant. `Chờ móc rơ moóc` chưa có dữ liệu cho tới task 09.
- **Khung giờ** của thẻ chưa có chuyến = giờ Stop đầu + 3,5 giờ (`routes` chưa có thời lượng chuẩn). Thẻ chưa có giờ Stop đầu chưa gán xe được.
- **Phân trang**: tối đa 100 thẻ mỗi cột mỗi lần, cursor theo (giờ bắt đầu, id); tải bảng 300 thẻ khoảng 140 ms.
- **Gán xe trên giao diện**: không có cặp xe–tài xế–rơ moóc mặc định nên làn của lịch là đầu kéo, và gán xe là chọn đầu kéo rồi chọn tài xế, rơ moóc trong bảng gán xe (hoặc thả thẻ vào làn để chọn sẵn đầu kéo). Gán xe cho thẻ chưa có chuyến gọi `createSingleTrip` rồi `assignResources`.
- **Realtime**: Route Handler `GET /api/v1/stream/dispatch` (SSE) đăng ký kênh `tenant:{tenantId}:dispatch`, chưa đăng nhập trả 401 JSON. Client tải lại đúng các thẻ trong `orderContainerIds` của sự kiện (`getBoardCards`) và làm mới lịch xe; mất kết nối thì hiện lỗi giữ bảng cũ và tự nối lại.
- **Mã lỗi hiển thị** theo `apps/web/src/features/dispatch/error-messages.ts`; ghi đè giờ lái chỉ cho `ADMIN` và bắt nhập lý do.
