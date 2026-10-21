# Quyết định 24-production-readiness

## Đã chốt
<!-- Quyết định đã chốt trước khi làm (nếu có), kèm ngày. -->
- Mục tiêu MVP: 50 tenant, tới 500 đầu kéo/tenant, Kanban < 2 giây với 300 thẻ, Server Action điều vận p95 < 500 ms, vị trí trên bản đồ trễ < 30 giây, uptime 99,5%/tháng (spec 08 mục 1).
- Backup MariaDB full hằng ngày + binlog, giữ tối thiểu 30 ngày, diễn tập khôi phục mỗi quý; Redis AOF; object storage versioning (spec 08 mục 3).
- Cảnh báo khi lag GPS > 5 phút, tỷ lệ lỗi > 2%, job DEM/DET không chạy, backup thất bại (spec 08 mục 4).
- 2FA cho `OWNER`/`ADMIN`/`ACCOUNTANT` để giai đoạn 2 (spec 08 mục 2).
- Chỉ dùng migration có version, không `push` trên production (spec 08 mục 3).

**Còn mở, hỏi người dùng trước bước liên quan:**
- Nhà cung cấp hạ tầng (MariaDB, Redis được quản lý, object storage), công cụ theo dõi lỗi (Sentry hay tương đương), kênh nhận cảnh báo (bước 1, 3, 4).
- Thời gian lưu dữ liệu GPS, yêu cầu lưu dữ liệu trong nước, điều khoản xử lý dữ liệu cá nhân: cần pháp chế xác nhận (spec 01 mục 4, spec 08 mục 2 và 5).
- Ngưỡng rate-limit cụ thể cho từng API (bước 2).
- Định nghĩa vai trò quản trị hệ thống (nhân viên hỗ trợ) nằm ngoài 7 role của tenant cho impersonate và onboarding (bước 5).

## Phát sinh khi làm
<!-- Chỗ làm khác task.md, spec hoặc thiết kế: lý do, ai đồng ý, đã sửa spec chưa. -->
