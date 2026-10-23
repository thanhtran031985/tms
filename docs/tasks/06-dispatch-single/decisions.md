# Quyết định 06-dispatch-single

## Đã chốt
<!-- Quyết định đã chốt trước khi làm (nếu có), kèm ngày. -->
- 1 Order = 1 Booking/B/L chứa nhiều container (`order_containers`); container là đơn vị điều vận, tính giá, DEM/DET, ePOD và nhận chi phí phân bổ (16/10/2026, PO; spec 01 mục 3 "[SỬA theo PO 16/10]", spec 02 nhóm 5).

- (23/10/2026, người dùng duyệt ở Plan mode) **Mỗi Stop một assignment**: mỗi Stop của container trong chuyến có một dòng `dispatch_assignments` cùng bộ tài nguyên và khung giờ chuyến; kiểm tra chồng lấn bỏ qua các dòng cùng `consolidatedTripId`. Task 20 (lương) phải gom theo chuyến; task 09 tách chặng Drop/Hook từ các dòng này.
- (23/10/2026) **Giờ lái**: chỉ giới hạn tổng giờ kế hoạch mỗi ngày (múi giờ tenant, mặc định 10 giờ). Mốc 4 giờ liên tục để task sau, khi có dữ liệu GPS (task 13/14). Spec 03 mục 1 bước 3 cần ghi chú lại.
- (23/10/2026) **Rule 2 bỏ tự trọng đầu kéo**: bảng `tractors` chưa có cột; chỉ chặn khi cont vượt `maxPayloadTons` rơ moóc, so tổng cont + tare rơ moóc với `permittedGrossWeightTons` đầu kéo, cảnh báo nêu rõ đã bỏ tự trọng đầu kéo. Không đổi schema task 05.
- (23/10/2026) **Trạng thái xa giờ**: tài xế `OFF_DUTY` luôn bị chặn (khớp thiết kế Screen03 "Tài xế nghỉ phép hôm nay"); `status` đầu kéo/rơ moóc/tài xế khác chỉ kiểm tra khi chuyến bắt đầu trong 30 phút.

## Suy ra từ spec (tự suy, báo cáo ở Bước 1)
- Mã lỗi: `*_NOT_AVAILABLE` = không tồn tại / khác tenant / `INACTIVE` / xóa mềm / `OFF_DUTY` / status không rảnh trong 30 phút / bảo dưỡng chồng lấn (kèm `details.reason`); `RESOURCE_TIME_CONFLICT` = chồng lấn assignment; mã mới `REEFER_REQUIRES_GENSET`, `DG_CERTIFICATE_REQUIRED`, `PORT_NOT_READY`, `PAYLOAD_EXCEEDED`, `WEIGHT_CONFIRMATION_REQUIRED`, `DRIVING_HOURS_EXCEEDED`, `DRIVING_HOURS_OVERRIDE_FORBIDDEN`, `CONTAINER_ALREADY_IN_TRIP`, `ORDER_NOT_CONFIRMED`. Lỗi MariaDB 1205 và 1213 đều trả `RESOURCE_BUSY_RETRY`.
- Ghi đè giờ lái: vượt giới hạn trả `DRIVING_HOURS_EXCEEDED`; `ADMIN` gửi lại kèm `overrideDrivingHours.reason` thì gán được và audit ghi lý do; role khác gửi cờ này nhận `DRIVING_HOURS_OVERRIDE_FORBIDDEN`.
- `order_stops` không có giờ kế hoạch: mọi assignment của chuyến dùng `plannedStart/End` của chuyến; Rule 8 so `trip.plannedEnd` với `order.cutOffAt` cho Stop `PORT_IN`.
- Rule 7 chặn lúc `dispatchTrip`: `HOLD_*` luôn chặn; `IMPORT` cần `READY_EDO`; `EXPORT` cần `READY_EMPTY_RELEASE`; `DOMESTIC` bỏ qua; Stop đầu không ở cảng/depot thì bỏ qua.
- Vỏ cont chuẩn khi chưa có VGM: hằng số trong `rules/physical.ts` (20ft 2,3 t; 40ft/45ft 3,8 t).
- `dispatchedAt` (NOT NULL, spec không có mặc định): đặt bằng thời điểm tạo assignment, cập nhật khi `dispatchTrip`.
- `dispatchTrip` chỉ đổi trip `PLANNED` → `DISPATCHED`; container giữ `PLANNED`, assignment giữ `ASSIGNED`.
- `cancelAssignment` nhận `tripId + version`, hủy mọi assignment hoạt động của chuyến, xóa `primary*`, trip giữ `PLANNED`. Gán lại chuyến đã có assignment: hủy cái cũ rồi tạo mới trong cùng transaction.
- Kênh Redis `tenant:{tenantId}:dispatch` (theo task.md), khác tiền tố `t:{tenantId}:` của `tenantKey`; task 07 dùng đúng kênh này.
- Seed: tài xế Phạm Quốc Huy đi cùng 51C-482.17 và rơ moóc 51R-112.23, container `MAEU2388417` của Order IMP-2610-031.

## Phát sinh khi làm
<!-- Chỗ làm khác task.md, spec hoặc thiết kế: lý do, ai đồng ý, đã sửa spec chưa. -->
- (23/10/2026, Bước 1) Thêm index `idx_assign_trip (tenant_id, consolidated_trip_id)` trên `dispatch_assignments`, spec 02 chưa có: dùng khi hủy/gán lại theo chuyến và khi bỏ qua assignment cùng chuyến lúc kiểm tra chồng lấn. Cần thêm vào spec 02 ở Bước 7.
- (23/10/2026, Bước 1) Giữ `primary_*` trên `consolidated_trips` và `replaces_assignment_id` không có FK, đúng spec 02 (ADR-004 coi đây là cột hiển thị/tham chiếu mềm).
