# Pipeline Dữ liệu GPS Thời gian thực & Quản lý Đổ dầu Công nợ

## 1. Kiến trúc GPS Telemetry (Hot Path & Cold Path)
Không bao giờ ghi trực tiếp (INSERT đơn lẻ) tọa độ từ hàng trăm thiết bị IoT (10 giây/lần) vào MariaDB.

### 1.0 Nguồn dữ liệu & Xác thực [BỔ SUNG]
- Xe container kinh doanh vận tải thường đã lắp thiết bị giám sát hành trình của một nhà cung cấp. Vì vậy ingest hỗ trợ 2 kiểu qua interface `GpsIngestAdapter`:
  1. **Push trực tiếp** từ thiết bị/nhà cung cấp gọi `/api/v1/gps/ingest`.
  2. **Pull** định kỳ từ API của nhà cung cấp GPS (job trong worker).
- **[SỬA] Không tin `tenantId` / `tractorId` trong payload.** Thiết bị xác thực bằng API key (hoặc HMAC chữ ký) gắn với bản ghi `gps_devices`; server tra `gps_devices` → `tractorId` → `tenantId`. Payload chỉ cần `{ deviceId, lat, lng, speed, heading, ignition, recordedAt }`.
- Hỗ trợ gửi theo lô (mảng điểm) vì thiết bị mất sóng sẽ gửi dồn.
- Bỏ điểm không hợp lệ: tọa độ ngoài lãnh thổ phục vụ, `recordedAt` ở tương lai > 5 phút, tốc độ phi lý.
- Rate-limit theo thiết bị.

### 1.1 Hot Path (Redis)
- Endpoint `/api/v1/gps/ingest` nhận payload như trên.
- Ghi đè vị trí mới nhất vào Redis Hash: `HSET tenant:{tenantId}:fleet:locations {tractorId} JSON_PAYLOAD` **[SỬA]** chỉ khi `recordedAt` mới hơn giá trị đang lưu (điểm gửi dồn sau khi mất sóng không được đè vị trí hiện tại).
- **[SỬA]** Đẩy bản ghi vào **Redis Stream** `gps:ingest` (`XADD ... MAXLEN ~ 2000000`) thay vì Redis List. Lý do: List + LPOP làm mất dữ liệu nếu worker chết giữa chừng; Stream có consumer group, `XACK` sau khi insert thành công và `XAUTOCLAIM` để nhận lại bản ghi treo.
- Màn hình Bản đồ Next.js đọc trực tiếp từ Redis Hash để hiển thị 500 xe mượt mà. **[BỔ SUNG]** Cập nhật tới trình duyệt qua SSE (`/api/v1/stream/fleet`) hoặc polling 10–15 giây; không gọi Server Action liên tục. Xe mất tín hiệu > 15 phút hiển thị màu xám "mất kết nối".
- **[BỔ SUNG] Geofencing (bản gốc nêu trong phân hệ nhưng chưa có spec):** Trong luồng ingest (hoặc job tiêu thụ stream riêng), với mỗi điểm mới:
  - Lấy các Stop `PENDING`/`ARRIVED` của assignment đang chạy của đầu kéo đó.
  - Tính khoảng cách tới `locations.lat/lng`; vào bán kính `geofenceRadiusM` liên tục ≥ 2 điểm → ghi `arrivedAt` (`timeSource = 'GEOFENCE'`) nếu tài xế chưa bấm; rời bán kính → ghi `departedAt`.
  - Sự kiện geofence dùng làm **bằng chứng đối chiếu** với thời điểm tài xế bấm (file 05 mục 3) và để tự động khởi động đồng hồ tính giờ chờ (detention) tại kho khách.
  - Lưu trạng thái "đang ở trong vùng" trong Redis `tenant:{t}:geofence:{tractorId}` để không phát trùng sự kiện.

### 1.2 Cold Path (MariaDB Partitioned)
- Background Worker **[SỬA]** chạy liên tục (không phải mỗi 5 phút một lần), đọc stream theo batch 1.000 bản ghi (`XREADGROUP COUNT 1000 BLOCK 5000`) và Bulk Insert vào `gps_logs` bằng `INSERT IGNORE` (chống trùng khi retry), sau đó `XACK`. Lý do: 500 xe × 6 điểm/phút = 3.000 điểm/phút; chạy 5 phút/lần với batch 1.000 sẽ không theo kịp nếu chỉ đọc 1 batch.
- Bảng `gps_logs` được thiết lập Table Partitioning theo `RANGE COLUMNS(recorded_at)` theo tháng để phục vụ tính năng xem lại lộ trình (Playback). DDL ở file 02 mục 3.
- **[BỔ SUNG] Bảo trì partition:** job hàng tháng tạo trước partition 2 tháng tới và xóa partition quá thời hạn lưu trữ (cấu hình theo tenant, tối thiểu theo quy định về dữ liệu giám sát hành trình — cần pháp chế xác nhận con số).
- **[BỔ SUNG] Tổng hợp quãng đường:** job cuối ngày tính `km/ngày/xe` từ `gps_logs` (bỏ điểm nhiễu) lưu vào bảng tổng hợp, dùng cho kiểm tra dầu (mục 2) và cập nhật `tractors.currentOdometer` khi có `deviceOdometerKm`.
- **[BỔ SUNG] Giám sát:** cảnh báo khi độ dài stream (lag) vượt ngưỡng, hoặc một thiết bị không gửi dữ liệu quá N phút trong khi xe đang có chuyến.

## 2. Luồng Đổ dầu Hợp đồng & Cảnh báo Rút ruột Dầu
### 2.1 Phát hành Phiếu (VOUCHER_ISSUED)
Điều vận/Kế toán tạo phiếu đổ dầu gán cho `tractorId`, `driverId`, chỉ định Cây xăng đối tác (`vendorId`) và hạn mức số lít (**[SỬA]** lưu ở `maxVolumeLiters`; bản gốc nêu hạn mức nhưng schema không có cột). **[BỔ SUNG]**
- `voucherCode` sinh từ `number_sequences`, kèm mã QR để cây xăng quét.
- Phiếu có hạn dùng (`voucherExpiresAt`); job đánh dấu `EXPIRED` khi quá hạn.
- Mỗi đầu kéo chỉ có tối đa 1 phiếu `VOUCHER_ISSUED` còn hiệu lực tại một thời điểm.
- Hủy phiếu → `VOIDED` (không xóa).

### 2.2 Thực thi tại Cây xăng (FUELED)
Tài xế nhập số lít thực đổ (`volumeLiters`), đơn giá (`pricePerLiter` - bắt buộc snapshot tại thời điểm bơm) và số công tơ mét hiện tại (`odometerReading`), kèm 2 ảnh chụp: Đồng hồ trụ bơm & Đồng hồ Odometer xe. **[BỔ SUNG]**
- Thêm lựa chọn "Đổ đầy bình" (`isFullTank`), mặc định bật.
- Validate: `volumeLiters ≤ maxVolumeLiters`; `volumeLiters ≤ dung tích bình` của xe; `totalAmount ≈ volumeLiters × pricePerLiter` (sai số làm tròn ≤ 1.000đ).
- `pricePerLiter` lệch quá X% so với giá niêm yết kỳ hiện tại (bảng giá dầu theo kỳ do Kế toán nhập) → cờ cảnh báo.
- Ảnh lưu vào `attachments` (`PUMP_METER`, `ODOMETER`); trùng `sha256` với ảnh cũ → cờ `DUPLICATE_PHOTO`.

### 2.3 Thuật toán Kiểm tra Định mức Tiêu hao (Fuel Theft Detection) [SỬA]
Bản gốc tính tiêu hao giữa 2 lần đổ liền kề. Cách này chỉ đúng khi cả 2 lần đều đổ đầy bình; nếu lần trước đổ một phần thì kết quả sai. Thuật toán chuẩn (full-to-full):

1. Chỉ tính khi giao dịch hiện tại `isFullTank = true`.
2. Tìm giao dịch `isFullTank = true` gần nhất trước đó của `tractorId` (theo `fueledAt`) → `previousOdometer`.
3. `totalLiters` = tổng `volumeLiters` của **mọi** giao dịch sau mốc đó đến hết giao dịch hiện tại (bao gồm các lần đổ một phần ở giữa).
4. `distanceKm = odometerReading - previousOdometer`.
   - `distanceKm <= 0` → cờ `ODOMETER_ROLLBACK`, không chia, chuyển Kế toán xem xét (có thể do thay đồng hồ; cho phép Fleet Manager khai báo "reset odometer" kèm ảnh).
   - `distanceKm` lệch > 10% so với quãng đường GPS cùng kỳ (`gpsDistanceKm`) → cờ `GPS_DISTANCE_MISMATCH` (nghi khai khống odometer).
5. `actualConsumption = totalLiters / distanceKm × 100`.
6. **Định mức cho phép** (`allowedConsumption`) là bình quân gia quyền theo km của các chuyến trong khoảng đó, mỗi đoạn lấy định mức từ `fuel_norms` theo trạng thái tải (`EMPTY_RUN`, `LOADED_20`, `LOADED_40`, `TWIN_20`). Không còn dùng `fuelNormAdjustmentPercent` trong bảng phí. Đoạn không thuộc chuyến nào tính theo `EMPTY_RUN`.
7. Nếu `actualConsumption > allowedConsumption × (1 + dung sai tenant, mặc định 5%)`, bật cờ `isOverNormWarning = true` để cảnh báo đỏ trên màn hình Kế toán, ghi vào `anomalyFlags`.
8. Lưu `calculatedConsumptionPer100Km`, `allowedConsumptionPer100Km`, `gpsDistanceKm` để giải trình.

### 2.4 Phê duyệt & Xử lý vượt định mức [BỔ SUNG]
- Kế toán duyệt giao dịch → `APPROVED`. Giao dịch có cờ bất thường không được duyệt hàng loạt.
- Phần dầu vượt định mức không giải trình được → Kế toán có thể tạo bút toán `PENALTY` vào `driver_ledger` (tham chiếu `fuel_transactions.id`), cần role `ACCOUNTANT` + ghi lý do.
- Chi phí dầu thực tế được ghi vào `trip_costs` (`costType = 'ACTUAL'`, `feeCode = 'FUEL'`) phân theo km của từng chuyến trong khoảng full-to-full.

### 2.5 Đối soát cuối tháng (RECONCILED)
Kế toán import file Excel bảng kê của cây xăng vào màn hình Split-view Reconciliation để đối chiếu tự động theo `voucherCode`, `plateNumber`, `volumeLiters`, `totalAmount`. **[BỔ SUNG]**
- Mỗi cây xăng có thể có mẫu file khác nhau → cấu hình ánh xạ cột (column mapping) lưu theo `vendorId`.
- Kết quả 4 nhóm: Khớp / Lệch số liệu / Có ở bảng kê nhưng không có trong hệ thống / Có trong hệ thống nhưng không có ở bảng kê.
- Khớp hết → tạo `vendor_bills` cho cây xăng, các giao dịch chuyển `RECONCILED` và lưu `vendorStatementRef`.
- Import phải idempotent: import lại cùng file không tạo trùng.
