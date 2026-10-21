# Quyết định 03-pricing-engine

## Đã chốt
<!-- Quyết định đã chốt trước khi làm (nếu có), kèm ngày. -->
- Pricing Engine tra giá cho từng `order_containers` và snapshot vào `order_containers.baseFreightAmount`, `orders.totalFreightAmount` là tổng; hệ quả của quyết định 1 Order nhiều container (16/10/2026, PO; spec 06 mục 3 "[SỬA]").
- Không tìm thấy giá thì trả `TARIFF_NOT_FOUND` và bắt nhập giá tay, không bao giờ mặc định 0 (ADR-005; spec không ghi ngày chốt).
- Giao diện theo Design System "TMS Container" phiên bản token 2, hướng xanh dương thiết kế lại theo ui-ux-pro-max (21/10/2026, `docs/DESIGN_SYSTEM.md`); chỉ dùng token, không tự đặt mã màu.

## Phát sinh khi làm
<!-- Chỗ làm khác task.md, spec hoặc thiết kế: lý do, ai đồng ý, đã sửa spec chưa. -->
