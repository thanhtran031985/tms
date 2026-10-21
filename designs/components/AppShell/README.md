# AppShell

Khung chung của mọi màn làm việc trên máy tính: thanh bên trắng bên trái, thanh trên trắng và vùng nội dung nền `bg`.

## Thanh bên (`tms-nav`)
- Rộng `size-nav` (240px), nền `surface`, viền phải 1px `line`, đệm 16px 12px.
- Đầu thanh: logo `tms-mark.svg` vẽ nội tuyến 28px (ô `primary`, nét `on-primary`) + "TMS Container" 700.
- `tms-nav-menu`: mục cao tối thiểu `size-hit` (44px), bo `radius-control`, icon 20px, chữ 15px/500 `ink`, cách nhau `space-4`. Hover nền `surface-2`.
- Mục đang mở: `aria-current="page"`, nền `info-soft`, chữ và icon `info`, 600.
- Số việc chờ: `tms-badge` (`crit-soft` / `crit`, bo `radius-pill`).

## Thanh trên (`tms-topbar`)
Nền `surface`, viền dưới `line`, đệm 12px 24px, khoảng `space-12`. Thứ tự:
1. `tms-switch`: nút đổi công ty (chữ tắt `tms-ini` nền `surface-2` + tên + mũi tên), viền `line`.
2. `tms-search`: ô tìm cao 44px, viền `line-strong`, icon kính lúp, phím tắt `tms-kbd` "/".
3. `tms-live`: chấm `ok` nhấp nháy (tắt khi giảm chuyển động) + "Trực tiếp · cập nhật 14:20".
4. Nút đổi giao diện sáng/tối `tms-icon-btn` có `aria-label`.
5. `tms-user`: avatar tròn `primary` / `on-primary` + tên + vai trò.

## Vùng nội dung (`tms-content`)
Tối đa `size-content` (1240px), đệm `space-24`, các khối cách `space-24`. H1 `tms-h1` (28px/700) nói số việc và hạn gần nhất, dòng phụ `ink-soft`. Thẻ chỉ số `tms-kpi`: viền `line`, bo `radius-card`, icon trong ô `radius-chip`, số 32px/700.

## Màn hẹp (≤ 640px)
Thanh bên thành dải trên cùng rộng hết màn, menu xếp dọc; vùng nội dung đệm `space-16`.
