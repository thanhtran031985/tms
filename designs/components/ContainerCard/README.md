# ContainerCard

Thẻ Kanban đại diện cho một container trên bảng điều vận, là đơn vị để chọn và gán xe.

## Cột
`tms-kcol`: nền `surface-2`, đệm `space-10`, bo `radius-card` (12px), thẻ cách nhau `space-8`. Tiêu đề `tms-kcol-head` (15px/600) kèm số đếm `.n` nền `surface`, bo `radius-pill`.

## Nội dung thẻ theo thứ tự
1. `tms-kcard-top`: số cont `tms-kcard-id` (`--font-mono`, 15px/600) + loại cont `tms-kcard-type` (13px/600, `ink-soft`).
2. Order (`tms-mono`, `ink`) · khách hàng (`ink-soft`).
3. Chiều (Xuất/Nhập) · tuyến (`ink-soft`).
4. `tms-kcard-chips`: `tms-chip-sm` (bo `radius-chip-sm` 5px) cho mốc hạn kèm thời gian còn lại, trạng thái cảng (Có EDO, HOLD hải quan), Cont lạnh, Street Turn, chứng từ thiếu.
5. `tms-kcard-foot`: "Khung 14:30–16:20" và biển số (`tms-mono`, `ink`) hoặc "Chưa có xe".

## Hình
Nền `surface`, viền 1px `line`, bo `radius-card-sm` (10px), đệm 10px 12px, chữ 14px. Hover viền `line-strong`. Không bóng, không viền trái màu.

## Tương tác
- Cả thẻ là một `<button class="tms-kcard">` có `aria-label` đọc số cont, loại, khách và "chọn để gán xe" nếu ở cột Chờ điều.
- Đang chọn: `aria-pressed="true"`, viền và vòng 2px `primary`; panel gán xe mở bên dưới.
- Đang kéo: lớp `is-dragging`, bóng `shadow-popover` (lớp nổi duy nhất được có bóng).

## Bên dùng cung cấp
Một thẻ cho một dòng `order_containers`; không gộp nhiều cont vào một thẻ. Mức chip theo quy tắc: dưới 3 giờ `crit`, trong 8 giờ `warn`, xa hơn `info`.
