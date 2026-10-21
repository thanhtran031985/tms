# Quyết định 08-trip-combining

## Đã chốt
<!-- Quyết định đã chốt trước khi làm (nếu có), kèm ngày. -->
- 1 Order = 1 Booking/B/L chứa nhiều container (`order_containers`); container là đơn vị điều vận, tính giá, DEM/DET, ePOD và nhận chi phí phân bổ (16/10/2026, PO; spec 01 mục 3 "[SỬA theo PO 16/10]", spec 02 nhóm 5).
- Chi phí chuyến mặc định phân bổ theo định mức (`COST_NORM_RATIO`), Kế toán được sửa, tổng phải khớp, bắt buộc lý do, lưu cả số hệ thống và số đã sửa, ghi audit (16/10/2026, PO; spec 01 mục 4, spec 06 mục 3).
- Liên kết Street Turn lưu ở từng container (`order_containers.linkedContainerId`), không ở cấp Order (spec 03 mục 2 Rule 3 "[SỬA]", theo quyết định 16/10/2026).

## Phát sinh khi làm
<!-- Chỗ làm khác task.md, spec hoặc thiết kế: lý do, ai đồng ý, đã sửa spec chưa. -->
