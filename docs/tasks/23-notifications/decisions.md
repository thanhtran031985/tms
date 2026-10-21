# Quyết định 23-notifications

## Đã chốt
<!-- Quyết định đã chốt trước khi làm (nếu có), kèm ngày. -->
- Kênh: trong app + email + Zalo/SMS qua adapter; cấu hình người nhận theo loại sự kiện (TICKET-23).
- Sự kiện tối thiểu: sắp hết free time, sắp cut-off, giấy tờ sắp hết hạn, vượt định mức dầu (spec 00 mục 3 phân hệ 10).
- Cảnh báo 48 giờ và 24 giờ trước khi hết free time / cut-off cho Điều vận, và khách nếu tenant bật (spec 05 mục 5).
- Gửi thông báo chạy trong worker riêng, idempotent, có retry và dead-letter (ADR-007).

**Còn mở, hỏi người dùng trước bước liên quan:**
- Spec 02 chưa có bảng thông báo: thêm `notifications`, `notification_recipients`, `notification_rules`, `notification_deliveries` (bước 1).
- Nhà cung cấp email, Zalo (ZNS), SMS chưa chọn; khi chưa chọn thì dùng adapter giả cho Zalo/SMS (bước 3).
- README `AppShell` không có chuông thông báo trên thanh trên; cần chốt vị trí (đề xuất cạnh nút đổi giao diện) (bước 5).
- Thông báo đẩy trên app tài xế Expo không có trong ticket (ngoài phạm vi task này).

## Phát sinh khi làm
<!-- Chỗ làm khác task.md, spec hoặc thiết kế: lý do, ai đồng ý, đã sửa spec chưa. -->
