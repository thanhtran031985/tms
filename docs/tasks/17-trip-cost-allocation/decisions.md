# Quyết định 17-trip-cost-allocation

## Đã chốt
<!-- Quyết định đã chốt trước khi làm (nếu có), kèm ngày. -->
- Chi phí chuyến mặc định phân bổ theo định mức, Kế toán được sửa, tổng phải khớp, bắt buộc lý do, lưu cả số hệ thống và số đã sửa (16/10/2026, spec 06 mục 3, spec 01 mục 4).
- Phương pháp mặc định là `COST_NORM_RATIO`: tỷ lệ theo chi phí định mức nếu từng container chạy `SINGLE`; tenant đổi được sang `REVENUE_RATIO`, `EQUAL`, `DISTANCE_RATIO` (16/10/2026, spec 06 mục 3).
- Container là đơn vị nhận chi phí phân bổ; chi phí của Order là tổng các container (16/10/2026, spec 01 mục 3).
- Chi phí chuyến thay đổi sau khi Kế toán đã sửa thì không ghi đè số của Kế toán, phần chênh chia theo tỷ lệ đang áp dụng và gắn cờ cần xem lại (spec 06 mục 3, spec không ghi ngày riêng).

**Còn mở, hỏi người dùng trước bước liên quan:**
- Tổng chi phí đem phân bổ lấy `ACTUAL` hay `NORM`: spec 06 mục 3 nói phân bổ "mọi chi phí" (lương, cầu đường là định mức; dầu, dọc đường, thuê ngoài là thực tế). task.md đề xuất theo từng `feeCode`: có `ACTUAL` thì dùng, chưa có thì dùng `NORM` (bước 3).
- Chi hộ (`trip_expenses.isRebillable = true`) có tính vào chi phí chuyến đem phân bổ không, khi khoản này đã thu lại của khách qua `order_fees` `PASS_THROUGH` (bước 3).
- Thêm thư viện property test (ví dụ `fast-check`) vào devDependencies của `packages/core` (bước 2).
- Thêm cột `trip_costs.order_container_id` và `consolidated_trips.allocation_review_required` (spec 02 chưa có) (bước 1).

## Phát sinh khi làm
<!-- Chỗ làm khác task.md, spec hoặc thiết kế: lý do, ai đồng ý, đã sửa spec chưa. -->
