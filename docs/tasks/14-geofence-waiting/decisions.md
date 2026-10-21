# Quyết định 14-geofence-waiting

## Đã chốt
<!-- Quyết định đã chốt trước khi làm (nếu có), kèm ngày. -->
- 1 Order = 1 Booking/B/L có nhiều container; phụ phí giờ chờ ghi `order_fees` theo `orderContainerId` của Stop, không ở cấp Order (16/10/2026, spec 01 mục 3 "[SỬA theo PO 16/10]").
- Chưa chốt: số phút miễn phí giờ chờ lưu ở đâu và tính theo giờ hay theo ngày (spec 05 mục 3 nêu `PER_DAY` "hoặc theo giờ", enum `calcBasis` chưa có theo giờ). Phải hỏi người dùng trước bước 4.

## Phát sinh khi làm
<!-- Chỗ làm khác task.md, spec hoặc thiết kế: lý do, ai đồng ý, đã sửa spec chưa. -->
