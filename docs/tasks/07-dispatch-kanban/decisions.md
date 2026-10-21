# Quyết định 07-dispatch-kanban

## Đã chốt
<!-- Quyết định đã chốt trước khi làm (nếu có), kèm ngày. -->
- 1 Order = 1 Booking/B/L chứa nhiều container (`order_containers`); container là đơn vị điều vận, tính giá, DEM/DET, ePOD và nhận chi phí phân bổ (16/10/2026, PO; spec 01 mục 3 "[SỬA theo PO 16/10]", spec 02 nhóm 5).
- Mỗi thẻ trên Kanban là một container, thẻ cùng Order gom nhóm được (spec 03 mục 5 "[SỬA]", theo quyết định 16/10/2026 ở trên).
- Giao diện theo Design System "TMS Container" phiên bản token 2, hướng xanh dương thiết kế lại theo ui-ux-pro-max (21/10/2026, `docs/DESIGN_SYSTEM.md`); chỉ dùng token, không tự đặt mã màu.

## Phát sinh khi làm
<!-- Chỗ làm khác task.md, spec hoặc thiết kế: lý do, ai đồng ý, đã sửa spec chưa. -->
