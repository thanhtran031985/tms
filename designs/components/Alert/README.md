# Alert

Hộp thông báo nằm trong luồng, đặt ngay trên phần bị ảnh hưởng, luôn có icon, chữ và nếu cần thì một hành động.

## Biến thể
- `tms-alert tms-alert-crit` (`crit-soft` / `crit`) + icon ổ khóa hoặc tam giác: lỗi chặn thao tác. Gắn `role="alert"`.
- `tms-alert-warn` (`warn-soft` / `warn`): lỗi tải nhưng vẫn giữ dữ liệu cũ, kèm nút phụ "Thử lại".
- `tms-alert-ok` (`ok-soft`, icon `ok`, chữ thân `ink`): xác nhận thao tác, kèm "Hoàn tác". Gắn `role="status"`.
- `tms-alert-info` (`info-soft`, icon `info`, chữ thân `ink`): ghi chú quy tắc nghiệp vụ.

## Kích thước
Đệm 12px 16px, bo `radius-control` (8px), khoảng icon–chữ `space-12`, chữ 15px/1.5. Câu chính in đậm 600. Nút bên trong là `tms-btn-sm tms-btn-secondary`.

## Viết
Nói chuyện gì xảy ra, vì sao, và làm gì tiếp: "Tài khoản tạm khóa đến 14:35. Sai mật khẩu 5 lần liên tiếp." Không dùng "Có lỗi xảy ra", không dấu chấm than, không viền trái màu.
