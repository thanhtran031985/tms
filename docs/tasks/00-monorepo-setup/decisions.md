# Quyết định 00-monorepo-setup

## Đã chốt
<!-- Quyết định đã chốt trước khi làm (nếu có), kèm ngày. -->
- Cấu trúc mã nguồn: `apps/web/src/features/<module>` chứa view và Server Action, `apps/web/src/app` chỉ định tuyến, `apps/web/src/components/ui` chứa component dựng theo `designs/`; `designs/` chỉ đọc; mỗi ticket một thư mục trong `docs/tasks/` (21/10/2026, spec 01 mục 2 "[BỔ SUNG 21/10]").
- Giao diện theo Design System "TMS Container" phiên bản token 2, hướng xanh dương thiết kế lại theo ui-ux-pro-max (21/10/2026, `docs/DESIGN_SYSTEM.md`); chỉ dùng token, không tự đặt mã màu.

## Phát sinh khi làm
<!-- Chỗ làm khác task.md, spec hoặc thiết kế: lý do, ai đồng ý, đã sửa spec chưa. -->
