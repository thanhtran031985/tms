# Button

Nút bấm cho mọi hành động, nhãn luôn là động từ và mỗi vùng chỉ có một nút chính.

## Biến thể
- `tms-btn tms-btn-primary`: hành động chính của form hoặc dòng (Đăng nhập, Điều xe). Nền `primary`, hover `primary-hover`, chữ `on-primary`.
- `tms-btn tms-btn-secondary`: hành động phụ (Ghép chuyến, Xem đơn). Nền `surface`, viền 1px `line-strong`, hover `surface-2`.
- `tms-btn tms-btn-ghost`: quay lại hoặc ít quan trọng (Đổi tài khoản). Không viền, chữ `ink-soft`, hover `surface-2`.
- `tms-icon-btn`: nút chỉ có icon, 44×44px (`size-hit`), viền `line`; thêm `is-bare` để bỏ viền. Bắt buộc `aria-label` nói rõ đối tượng ("Mở chi tiết OOLU8842105").

## Cỡ
- Mặc định cao `size-button` (48px), chữ 17px/600, bo `radius-control` (8px).
- `tms-btn-sm` cao `size-ctl` (40px), chữ 15px/600, dùng trong bảng và thanh công cụ.

## Trạng thái
- Đang gửi: `disabled` + `aria-busy="true"`, icon `tms-spin`, chữ dạng tiếp diễn ("Đang đăng nhập…"). Giữ nền `primary`.
- Bị khóa: `disabled`, nền `surface-2`, chữ `ink-soft`, chữ nói khi nào dùng lại được ("Thử lại sau 14:35").
- Focus: viền 3px `focus`, lệch 2px.

## Không nên
- Không đặt hai nút chính cạnh nhau, không dùng màu trạng thái hay `accent` làm nền nút.
- Không đổ bóng, không gradient.
