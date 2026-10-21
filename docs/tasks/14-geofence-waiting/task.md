# 14-geofence-waiting — Geofence và tính giờ chờ

> Giai đoạn: GĐ4 · Phụ thuộc: 06, 13 · Nhánh git: `feat/14-geofence-waiting`
> Nguồn: `docs/specs/07_implementation_tickets.md` TICKET-14; spec `04_telemetry_and_fuel.md` mục 1.1 (Geofencing); spec `05_advanced_workflows_and_ai.md` mục 3 (thứ tự tin cậy thời gian, `TIME_MISMATCH`, tính giờ chờ detention); spec `03_dispatch_and_concurrency.md` mục 1 bước 6 (bắt đầu chuyến khi geofence rời bãi); spec `06_hierarchical_pricing_and_fees.md` mục 1 (phí `WAITING_FEE` trong `fee_tariffs`); spec `02_database_schema.md` bảng `locations` (`geofenceRadiusM`), `order_stops`, `order_fees`, `fee_tariffs`; PRD `docs/PRD.md` mục C8, F2

## Mục tiêu
Sau task này, khi đầu kéo vào hoặc rời bán kính geofence của cảng, depot hay kho khách, hệ thống tự ghi giờ đến và giờ đi của Stop từ GPS thiết bị gắn xe, kể cả khi tài xế quên bấm. Điều vận thấy ngay Stop nào có giờ tài xế bấm lệch giờ GPS quá 15 phút để xem xét. Xe chờ quá thời gian miễn phí tại kho khách tự sinh phụ phí giờ chờ ở trạng thái chờ duyệt, tính theo giờ thật chứ không theo giờ đồng bộ.

## Phạm vi
**Làm:**
- Với mỗi điểm GPS mới: lấy các Stop `PENDING`/`ARRIVED` của assignment đang chạy của đầu kéo, tính khoảng cách tới `locations.lat/lng`.
- Vào bán kính `geofenceRadiusM` liên tục ≥ 2 điểm thì ghi `arrivedAt` (`timeSource = 'GEOFENCE'`) nếu tài xế chưa bấm; rời bán kính thì ghi `departedAt`.
- Lưu trạng thái "đang ở trong vùng" trong Redis `tenant:{t}:geofence:{tractorId}` để không phát trùng sự kiện.
- Geofence rời bãi ở Stop đầu tiên thì bắt đầu chuyến nếu tài xế chưa bấm (tài xế `ON_DUTY`, đầu kéo `IN_USE`).
- Đối chiếu với giờ tài xế bấm theo thứ tự tin cậy: geofence, rồi `occurredAt` đã hiệu chỉnh `clockSkewMs`, rồi EXIF ảnh. Lệch quá 15 phút thì gắn cờ `TIME_MISMATCH`, mặc định dùng giờ geofence, Điều vận xem xét và chọn.
- Tính giờ chờ tại kho khách: `waitingMinutes = departedAt − max(arrivedAt, windowStart)`, trừ thời gian miễn phí theo hợp đồng khách (phí `WAITING_FEE`), phần vượt sinh `order_fees` `REVENUE_SURCHARGE` chờ duyệt.
- Giao diện: lớp geofence nét đứt, ký hiệu "Chờ tại kho/bãi" kèm số phút chờ, mốc vào/ra geofence trên Playback; danh sách Stop có cờ `TIME_MISMATCH` để Điều vận xử lý; duyệt phụ phí giờ chờ.

**Không làm (thuộc task khác):**
- Pipeline GPS, Redis Hash, stream, `gps_logs`, màn bản đồ và Playback cơ bản (task 13).
- Ghi `occurredAt`, `clockSkewMs` từ app tài xế (task 10, task 11).
- Phí DEM/DET và cảnh báo free time (task 18).
- Đưa phụ phí giờ chờ đã duyệt vào hóa đơn (task 21) và đối soát với khách (task 19).
- Gửi thông báo `TIME_MISMATCH` ra ngoài (task 23).

## Thiết kế
- `designs/components/Screen05-FleetMap/` (đọc README.md và preview.html; 4 trạng thái như task 13: Bình thường; Đang tải khung xương; Trống "chưa có xe nào gửi vị trí" + "Kiểm tra thiết bị GPS"; Lỗi giữ vị trí cũ + "Thử lại"; lọc không ra xe + "Xóa bộ lọc").
- Phần của task này trên màn: geofence vẽ nét đứt ("vùng nét đứt là geofence"), ký hiệu "Chờ tại kho/bãi" hình vuông `--off` có đồng hồ kèm chữ "chờ 75 phút", nhóm "N xe đang chờ tại Cảng Cát Lái" bấm để lọc, mốc vào/ra geofence bấm được trên thanh tua Playback.
- Danh sách lệch giờ và duyệt phụ phí giờ chờ chưa có màn riêng: dựng bằng `designs/components/WorkTable/`, `designs/components/StatusChip/` (`TIME_MISMATCH` dùng `warn`), `designs/components/FilterTabs/`, `designs/components/Alert/`, `designs/components/EmptyState/`, `designs/components/Button/`; đủ 4 trạng thái; ghi phần tự quyết vào `decisions.md`.

## Quyết định kiến trúc
- Thứ tự làm: bảng task chỉ ghi phụ thuộc 06, 13, nhưng đối chiếu giờ tài xế cần `driver_events` và `attachments` (task 10, 11) và bắt đầu chuyến dùng `startTrip` (task 10). Làm task này sau task 11; nếu buộc phải làm trước thì bước 3 chỉ dùng nguồn GEOFENCE, ghi `decisions.md`.
- Nghiệp vụ ở `packages/core/modules/telemetry/geofence.service.ts` (hàm thuần khoảng cách và luật 2 điểm), `packages/core/modules/orders/waiting-time.service.ts` (giờ chờ và phụ phí); consumer ở `apps/worker/src/jobs/geofence-consumer.ts` dùng consumer group riêng `geofence` trên stream `gps:ingest` của task 13 (không làm chậm luồng ghi `gps_logs`).
- Khoảng cách tính bằng haversine trên `DECIMAL(9,6)`; "liên tục ≥ 2 điểm" là 2 điểm liên tiếp theo `recordedAt` của cùng đầu kéo nằm trong bán kính. Điểm đến trễ (gửi dồn) xử lý theo `recordedAt`, không theo giờ nhận.
- Redis `tenant:{t}:geofence:{tractorId}` lưu `{ stopId, locationId, insideSince, consecutiveInside }`; chỉ phát sự kiện khi trạng thái đổi. Mất Redis thì dựng lại từ `gps_logs` gần nhất (spec 08 mục 3: Redis không phải nguồn sự thật).
- Lưu bằng chứng: `order_stops` chỉ có một bộ `arrivedAt`/`departedAt`/`timeSource`, không đủ chỗ cho cả giờ geofence và giờ tài xế. Đề xuất bảng `geofence_events (id, tenant_id, tractor_id, location_id, stop_id, event_type ENTER|EXIT, occurred_at, created_at)` và cột `order_stops.time_flags` (JSON, validate zod, giá trị như `TIME_MISMATCH`) hoặc cột boolean `time_mismatch`; giờ tài xế bấm đọc từ `driver_events` của task 10/11. Ghi `decisions.md` và cập nhật spec 02 trước bước 1.
- Thứ tự tin cậy (spec 05 mục 3): GEOFENCE > `occurredAt` đã hiệu chỉnh `clockSkewMs` > EXIF (`attachments.capturedAt`). Lệch giữa (2) và (1) quá 15 phút thì gắn `TIME_MISMATCH`, giá trị trên `order_stops` dùng (1), `timeSource = 'GEOFENCE'`. Điều vận chọn giá trị khác thì `timeSource = 'MANUAL'` và ghi audit (giá trị trước, sau, lý do).
- Bắt đầu chuyến khi geofence rời bãi Stop đầu tiên dùng lại hàm `startTrip` của task 10 (khóa theo thứ tự tài xế → đầu kéo → rơ moóc, audit, publish `dispatch.updated`); tài xế đã bấm thì không làm gì.
- Giờ chờ chỉ tính cho Stop tại `locations.type = 'WAREHOUSE'` (kho khách). `waitingMinutes = departedAt − max(arrivedAt, windowStart)`, luôn dựa trên giờ đã chọn theo thứ tự tin cậy, không dùng `syncedAt`.
- Phí giờ chờ tra `fee_tariffs` `feeCode = 'WAITING_FEE'` qua `resolveFees` của task 03 (khách riêng trước, chung sau, `isExcluded` thì miễn). Spec 02 không có cột số phút miễn phí và enum `calcBasis` không có theo giờ: đề xuất lưu số phút miễn phí trong `tenants.settings` và cho phép ghi đè theo khách, tính phần vượt theo `PER_DAY` hoặc theo giờ khi bổ sung `PER_HOUR`; phải được người dùng chốt và ghi `decisions.md` trước bước 4.
- Phụ phí sinh ra là `order_fees` (`feeCategory = 'REVENUE_SURCHARGE'`, `source = 'TARIFF'`, `orderContainerId` của Stop, `isApproved = false`) với `idempotencyKey = 'WAIT:{stopId}'`: tính lại khi giờ đổi thì cập nhật đúng dòng chưa duyệt, dòng đã duyệt không sửa (ADR-009, sửa bằng bút toán đảo). Tiền `decimal.js`, `DECIMAL(18,2)` + `currency`.
- Quyền: xử lý `TIME_MISMATCH` dùng `requireRole(['DISPATCHER', 'ADMIN'])`; duyệt phụ phí giờ chờ dùng `requireRole(['ACCOUNTANT', 'ADMIN'])` (đề xuất, spec không nói rõ ai duyệt phụ phí doanh thu; ghi `decisions.md`). Mọi Server Action validate zod, trả `{ ok, code, message }`.
- Audit trong cùng transaction cho thay đổi giờ Stop, chọn nguồn thời gian, tạo và duyệt `order_fees`. Mọi truy vấn qua `getTenantDb(ctx)` dựng từ `tenantId` của bản ghi stream.

## Các bước
### Bước 1 — Schema bằng chứng thời gian và hàm geofence thuần
- Chốt `geofence_events` và cờ lệch giờ trong `decisions.md`, cập nhật spec 02, tạo migration; seed 1 kho khách bán kính 300 m, 1 chuyến IMPORT có Stop `UNSTUFFING` tại kho đó và chuỗi điểm GPS mẫu vào, ở 80 phút, ra.
- Viết trước test cho hàm thuần trong `geofence.test.ts`: điểm cách tâm 299 m là trong, 301 m là ngoài; 1 điểm lọt vào rồi ra ngay không tính đến; 2 điểm liên tiếp trong thì đến; điểm đến trễ được xếp theo `recordedAt`.
- Viết test tenant isolation cho `GeofenceEventRepo`.
**Kiểm tra:** `pnpm db:migrate` chạy trên DB trống và DB có dữ liệu của task 13; `pnpm test --filter core -- geofence geofence-event.repo` xanh.

### Bước 2 — Consumer geofence ghi giờ đến, giờ đi và bắt đầu chuyến
- Test trước (Testcontainers MariaDB + Redis): bơm chuỗi điểm seed vào stream thì Stop có `arrivedAt` và `departedAt` từ GPS, `timeSource = 'GEOFENCE'`, đúng 1 sự kiện ENTER và 1 EXIT; bơm lại cùng chuỗi không phát trùng; tài xế đã bấm đến thì không ghi đè `arrivedAt` nhưng vẫn lưu `geofence_events`; rời bãi Stop đầu tiên khi tài xế chưa bấm thì chuyến bắt đầu; xóa key Redis giữa chừng thì dựng lại trạng thái, không phát trùng.
- Viết `geofence-consumer.ts` và phần ghi của `geofence.service.ts`.
**Kiểm tra:** `pnpm test --filter worker -- geofence-consumer` xanh; trên dev chạy `pnpm gps:loadtest` ngắn với tuyến mẫu, Stop seed có giờ đến và đi.

### Bước 3 — Đối chiếu giờ tài xế và cờ `TIME_MISMATCH`
- Test trước: giờ tài xế bấm (đã cộng `clockSkewMs`) lệch giờ geofence 16 phút thì gắn `TIME_MISMATCH` và Stop dùng giờ geofence; lệch 14 phút thì không gắn; không có geofence thì dùng `occurredAt`, không có cả hai thì dùng EXIF; Điều vận chọn giờ tài xế thì `timeSource = 'MANUAL'` và có audit; role `VIEWER` bị từ chối.
- Viết `resolveStopTimes` và Server Action chọn nguồn thời gian trong `apps/web/src/features/dispatch/time-review/`.
**Kiểm tra:** `pnpm test --filter core -- stop-time` xanh.

### Bước 4 — Tính giờ chờ và phụ phí `WAITING_FEE`
- Chốt cách lưu số phút miễn phí và đơn vị tính trong `decisions.md` trước khi code.
- Test trước trong `waiting-time.test.ts`: đến 08:10, khung giờ hẹn 08:30, đi 10:00 thì chờ 90 phút; trừ miễn phí rồi sinh đúng 1 dòng `order_fees` `REVENUE_SURCHARGE` chưa duyệt; chờ trong miễn phí thì không sinh; giờ đổi sau khi Điều vận xử lý `TIME_MISMATCH` thì cập nhật đúng dòng chưa duyệt; dòng đã duyệt không bị sửa; khách có `isExcluded` cho `WAITING_FEE` thì không sinh; không tìm thấy phí thì không sinh dòng 0 ₫ mà gắn cờ cho Điều vận nhập tay; tính theo múi giờ tenant khi qua nửa đêm.
- Viết `waiting-time.service.ts`, gọi sau khi Stop có `departedAt`.
**Kiểm tra:** `pnpm test --filter core -- waiting-time` xanh; chạy 2 lần trên cùng Stop không có dòng phí thứ hai.

### Bước 5 — Lớp geofence và xe chờ trên bản đồ
- Trong `apps/web/src/features/fleet-map/`: vẽ geofence nét đứt cho địa điểm có xe đang hướng tới, ký hiệu "Chờ tại kho/bãi" kèm số phút chờ, nhóm xe chờ theo địa điểm bấm để lọc danh sách, mốc vào/ra geofence trên Playback bấm được để nhảy tới.
**Kiểm tra:** mở `/fleet/map` trên 1440×900 và 1366×768 với dữ liệu seed: xe ở kho hiện "chờ N phút" khớp `geofence_events`; so với `Screen05-FleetMap/preview.html` đúng hình, icon và chữ; bấm mốc vào geofence trên Playback nhảy đúng thời điểm.

### Bước 6 — Danh sách lệch giờ và duyệt phụ phí giờ chờ
- Route `apps/web/src/app/(tenant)/dispatch/time-review/page.tsx`: WorkTable các Stop `TIME_MISMATCH` (giờ GPS, giờ tài xế, EXIF, chênh lệch) với nút chọn nguồn và lý do; tab phụ phí giờ chờ chờ duyệt cho Kế toán với nút duyệt; đủ 4 trạng thái.
**Kiểm tra:** mở `/dispatch/time-review` trên 1440×900: xử lý 1 Stop lệch giờ thì phụ phí giờ chờ liên quan cập nhật; tài khoản `DISPATCHER` không thấy nút duyệt phí; `pnpm e2e -- time-review` xanh.

### Bước 7 — Hoàn tất
- Chạy toàn bộ kiểm tra, cập nhật progress.md, đổi trạng thái task trong `docs/tasks/README.md`, cập nhật spec 02, spec 04 mục 1.1 và spec 05 mục 3 cho các chỗ đã chốt.
**Kiểm tra:** `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` không lỗi; `pnpm e2e` cho bản đồ và danh sách lệch giờ; migration chạy trên DB trống và DB có dữ liệu; mọi repo mới có test tenant isolation; mọi Server Action có `requireRole` và zod. Ticket không ghi "Chấp nhận khi"; tiêu chí dùng cho task này (rút từ spec, cần người dùng xác nhận): vào vùng ≥ 2 điểm ghi `arrivedAt` và rời vùng ghi `departedAt` với `timeSource = 'GEOFENCE'`, không phát trùng sự kiện; lệch giờ tài xế quá 15 phút gắn `TIME_MISMATCH` và mặc định dùng giờ geofence; giờ chờ tính theo `departedAt − max(arrivedAt, windowStart)` trừ miễn phí, phần vượt sinh đúng 1 dòng `order_fees` `REVENUE_SURCHARGE` chờ duyệt.
