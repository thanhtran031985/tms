# Logos

`tms-mark.svg` là dấu "thùng container": ô vuông bo góc 32×32 (bo 6px) màu `#2563EB` (`primary` sáng), bên trong là khung container viền trắng `#FFFFFF` (`on-primary` sáng) với 3 vạch dọc trắng. Ô xanh đặc tự mang nền nên dấu đứng được trên mọi nền sáng (`bg`, `surface`) lẫn nền tối.

- File dùng mã màu cố định vì hiển thị qua `<img>`; trong giao diện, vẽ SVG nội tuyến với `var(--primary)` và `var(--on-primary)` (xem `AppShell`).
- Kích thước chuẩn 28px ở thanh bên, 32px ở trang đăng nhập, tối thiểu 20px.
- Đặt cạnh chữ "TMS Container" (Fira Sans 700), cách `space-10`.
- Không đổi màu, không xoay, không thêm bóng hay gradient, không đặt lên ảnh nhiều chi tiết.
