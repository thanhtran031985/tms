# WorkTable

Bảng dữ liệu dày trong khối trắng, mỗi dòng là một container hoặc một đối tượng cần xử lý, sắp theo độ gấp.

## Cấu trúc
- `section.tms-card` (nền `surface`, viền 1px `line`, bo `radius-card` 12px, không bóng) → `tms-card-head` (H2 20px/600 + `tms-card-meta` + `FilterTabs`) → `tms-table-wrap` (cuộn ngang trong khối) → `table.tms-table` → `tms-card-foot` (dòng hoạt động gần nhất, `aria-live="polite"`).
- Hàng tiêu đề: nền `surface-2`, chữ 13px/600 `ink-soft`. Dòng chia bằng `line`; hover dòng nền `surface-2`. Ô đệm 10px 12px, cột đầu và cuối đệm `space-20`.
- Mỗi ô tối đa hai dòng: `tms-main-cell` (600; mã định danh thêm `tms-mono`) và `tms-sub` (14px, `ink-soft`).
- Cột đầu là `StatusChip`. Cột hạn: giờ đậm, dòng phụ "còn X giờ Y" dùng `tms-due-crit` (`crit`) hoặc `tms-due-warn` (`warn`).
- Cột cuối: đúng một nút `tms-btn-sm`; việc gấp dùng nút chính, còn lại nút phụ. Tiêu đề cột ẩn bằng `tms-sr`.
- Đặt `min-width` cho bảng (khoảng 860px) để cột không bị bóp.

## Bốn trạng thái
- Đang tải: giữ khung, tiêu đề và tab; dòng xương `tms-skel` nền `surface-2`.
- Trống: thay bảng bằng `EmptyState`.
- Lỗi: `Alert` cảnh báo trên bảng, giữ dữ liệu cũ, nút "Thử lại".

## Bên dùng cung cấp
Dữ liệu đã sắp theo hạn gần nhất, số cont đúng ISO 6346, biển số dạng 51C-482.17.
