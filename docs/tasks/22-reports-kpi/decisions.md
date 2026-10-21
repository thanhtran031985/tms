# Quyết định 22-reports-kpi

## Đã chốt
<!-- Quyết định đã chốt trước khi làm (nếu có), kèm ngày. -->
- Doanh thu và lãi/lỗ của Order là tổng của các container (16/10/2026, spec 00 mục 1).
- Báo cáo P&L hiển thị cả số hệ thống và số Kế toán đã sửa để so sánh (16/10/2026, spec 06 mục 3).
- P&L dùng chi phí thực tế nếu đã chốt, định mức dùng để so vượt/hụt (spec 06 mục 3).
- Chi hộ không phải doanh thu, không cộng vào doanh thu cước (spec 01 mục 3).

**Còn mở, hỏi người dùng trước bước liên quan:**
- Định nghĩa tỷ lệ km rỗng: km chạy không chở container trên tổng km, lấy km từ GPS hay từ `routes.standardDistanceKm`; đoạn đi lấy rỗng/trả rỗng có tính là chạy rỗng không (bước 3).
- Cách quy doanh thu về Xe và Tài xế khi chuyến ghép hoặc có cứu hộ (bước 2).
- Không có thiết kế màn Báo cáo P&L; `Screen02-Home` là trang chủ Điều vận. task.md giao trang chủ cho task này vì không task nào khác nhận phần nội dung trang chủ (bước 5, 6).
- Thư viện tạo Excel (cùng thư viện với import Excel của task 03 nếu có) (bước 4).

## Phát sinh khi làm
<!-- Chỗ làm khác task.md, spec hoặc thiết kế: lý do, ai đồng ý, đã sửa spec chưa. -->
