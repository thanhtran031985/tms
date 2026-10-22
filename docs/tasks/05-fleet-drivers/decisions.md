# Quyết định 05-fleet-drivers

## Đã chốt
<!-- Quyết định đã chốt trước khi làm (nếu có), kèm ngày. -->
- Giao diện theo Design System "TMS Container" phiên bản token 2, hướng xanh dương thiết kế lại theo ui-ux-pro-max (21/10/2026, `docs/DESIGN_SYSTEM.md`); chỉ dùng token, không tự đặt mã màu.
- **Chứng chỉ hàng nguy hiểm**: Spec 03 Rule 6 yêu cầu kiểm tra chứng chỉ hàng nguy hiểm của tài xế khi vận chuyển hàng nguy hiểm nhưng spec 02 ban đầu chưa có cột. Quyết định bổ sung `drivers.dg_certificate_no VARCHAR(30) NULL` và `drivers.dg_certificate_expiry DATE NULL`, đã cập nhật vào `docs/specs/02_database_schema.md` (22/10/2026).
- **Rơ moóc 20FT và Twin 20**: `trailerType = '20FT'` thì `canCarryTwin20` bắt buộc `false` (spec 03 Rule 1); `maxPayloadTons` bắt buộc.
- **Hạn giấy tờ**: Kiểu `DATE`, tính theo `toTenantDate(ctx, now)`. "Sắp hết hạn 15 ngày" = [hôm nay, hôm nay + 15 ngày]; "Đã hết hạn" = trước hôm nay. Khớp ngưỡng cảnh báo 15 ngày ở spec 03 mục 1.
- **Bảo mật dữ liệu cá nhân (PII)**: `nationalIdNo`, `licenseNo`, `phone` chỉ trả về đầy đủ cho `OWNER`, `ADMIN`, `FLEET_MANAGER`. Các role khác (`DISPATCHER`, `VIEWER`) nhận giá trị đã che (e.g. `090xx xxx 456`, `079xxxxxx234`, `GPLxxxxxx233`).
- **Job hàng ngày cảnh báo giấy tờ**: Worker job `fleet.document-expiry` chạy theo tenant, idempotent theo khóa Redis `DOC_EXPIRY:{tenantId}:{yyyy-mm-dd}`, phát sự kiện `fleet.documents_expiring` (không log PII, log JSON có `tenantId`).
- **Bảo dưỡng**: Lệnh `maintenance_orders` có trạng thái `PLANNED`/`IN_PROGRESS` chặn điều xe khi `planned_start < :end AND planned_end > :start` (spec 03 mục 1). Lệnh `IN_PROGRESS` chuyển trạng thái xe sang `MAINTENANCE`, `DONE` đưa xe về `AVAILABLE`.

## Phát sinh khi làm
<!-- Chỗ làm khác task.md, spec hoặc thiết kế: lý do, ai đồng ý, đã sửa spec chưa. -->
- Không có thay đổi nào ngoài phạm vi hoặc mâu thuẫn với spec; việc bổ sung cột chứng chỉ hàng nguy hiểm đã được cập nhật đồng bộ vào `docs/specs/02_database_schema.md`.
