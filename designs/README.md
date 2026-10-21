Hệ thống giao diện cho phần mềm điều hành vận tải container (TMS) đa doanh nghiệp. Người dùng là điều vận, kế toán và quản lý đội xe trước màn 1366–1440px suốt ca làm, cùng tài xế trên app điện thoại. Hướng thiết kế lấy từ ui-ux-pro-max cho ngành Logistics: Swiss tối giản + Flat, dashboard dày dữ liệu và theo dõi thời gian thực, xanh dương chủ đạo, cam cho theo dõi/cảnh báo, xanh lá cho hoàn thành. Mặt trắng, viền mảnh, không bóng, và việc gấp nhất luôn hiện trước.

## Nguyên tắc nội dung

- Viết tiếng Việt có dấu. Giữ nguyên thuật ngữ ngành người dùng vẫn nói: Order, Container, Booking, B/L, Cut-off, DEM, DET, ePOD, EDO, VGM, HOLD, Street Turn, TWIN_20, Rơ moóc, Đầu kéo.
- Viết hoa kiểu câu: chỉ chữ đầu và tên riêng ("Điều xe", không phải "Điều Xe").
- H1 của màn nói số việc cần làm và mốc gần nhất bằng số thật: "9 việc cần xử lý. Hạn gần nhất: cut-off ONE HARMONY lúc 16:35, còn 2 giờ 15".
- Thời gian có cả giờ tuyệt đối lẫn thời gian còn lại ("lúc 16:35", "còn 2 giờ 15"). Quá hạn ghi "quá 35 phút".
- Thông báo lỗi nói chuyện gì xảy ra và làm gì tiếp: "Sai mật khẩu. Còn 2 lần thử trước khi tài khoản bị khóa 15 phút." Không dùng "Có lỗi xảy ra".
- Không hiện số 0 thay cho dữ liệu chưa có: ghi "Chưa có giá" (kèm nhập tay), "Chưa có xe".
- Không emoji, không dấu chấm than. Nút là động từ: "Điều xe", "Ghép chuyến", "Xác nhận phân bổ", "Thử lại".
- Số container, biển số, mã Order, số chứng từ luôn dùng `--font-mono` và không bao giờ bị cắt ngắn.

## Màu

- Nền vùng nội dung là `bg`. Thẻ, bảng, ô nhập, thanh bên, thanh trên là `surface`. Cột Kanban, hàng tiêu đề bảng, hover dòng là `surface-2`.
- Chữ chính `ink` (từ 12,7:1), chữ phụ `ink-soft` (từ 6,9:1). Mọi chữ đạt ít nhất 4,5:1.
- `primary` / `primary-hover` / `on-primary` cho nút chính, link, vạch "bây giờ", xe đang chạy. Mỗi vùng chỉ một nút chính.
- Mục menu đang chọn và vai trò dùng `info-soft` với chữ `info`.
- `accent` (cam) chỉ cho dấu không phải chữ: marker xe mất tín hiệu, khối Chờ móc rơ moóc. Chữ cảnh báo màu cam luôn là `warn`.
- Năm họ trạng thái, mỗi họ một cặp nền `-soft` và chữ đậm: `crit` (chặn, quá hạn, còn dưới 3 giờ), `warn` (trong 8 giờ, cần xem), `ok` (xong, hợp lệ), `off` (tạm dừng, mất kết nối), `info` (đã lên kế hoạch, thông tin).
- Màu không bao giờ đứng một mình: luôn kèm icon và chữ ("Cut-off còn 2 giờ 15").
- Biểu đồ trạng thái dùng `chart-1`…`chart-4` từ nhạt đến đậm (Chờ điều → Đang chạy), luôn kèm nhãn và số. Bản đồ dùng `map-land`, `map-road`, `map-water`.
- `line` chỉ cho đường kẻ trang trí (viền thẻ, chia dòng). Viền điều khiển (ô nhập, nút phụ) là `line-strong` (4,8:1).
- Chế độ Tối có đủ bộ giá trị riêng; luôn đọc token, không tự đổi màu bằng tay. Không gradient, không kính mờ.

## Chữ

- Một họ chữ giao diện: Fira Sans (`--font-ui`) 400/500/600/700, bật `font-variant-numeric: tabular-nums` để cột số thẳng hàng.
- Mã định danh: Fira Code 500 (`--font-mono`), kiểu `code` 15px.
- Thân chữ 16px, line-height 1.5 (`body`); ô bảng và menu 15px (`body-sm`); không chữ nào dưới 12px (`chip-sm`).
- Tiêu đề: `hero-title` 44px trang đăng nhập, `screen-title` 28px/700 cho H1, `section-title` 20px/600 cho H2, `kpi-figure` 32px/700 cho số chỉ số. Tiêu đề luôn 600–700.
- Nhãn ô nhập `label` 15px/600 đặt trên ô; không dùng placeholder thay nhãn.

## Khoảng cách, bo góc, bóng

- Thang `space-4` đến `space-48` (4/6/8/10/12/16/20/24/32/48). Trong khối dùng `space-12`–`space-20`; giữa các khối trên màn dùng `space-24`.
- Bo góc theo kích thước: `radius-chip-sm` 5px (chip trên thẻ Kanban), `radius-chip` 6px (chip), `radius-control` 8px (nút, ô nhập, menu, hộp thông báo), `radius-card-sm` 10px (thẻ container), `radius-card` 12px (khối lớn), `radius-pill` cho tab lọc và badge.
- Khối là mặt `surface` với viền 1px `line`, bo 12px, không bóng. Bóng chỉ cho lớp nổi: `shadow-popover` (menu, thẻ đang kéo) và `shadow-drawer` (ngăn kéo, hộp thoại).
- Không lồng thẻ trong thẻ, không thẻ viền trái màu; trạng thái dùng chip.

## Bố cục

- Thanh bên trắng rộng `size-nav` (240px) + thanh trên (đổi công ty, tìm kiếm có phím `/`, chấm trực tiếp, đổi giao diện, người dùng). Nội dung tối đa `size-content` (1240px), đệm `space-24`.
- Trang chủ đọc từ trên xuống: H1 → thẻ chỉ số → "Mốc hạn sắp tới" (`DeadlineTimeline`) → bảng Việc cần xử lý cạnh bản đồ đội xe và biểu đồ trạng thái.
- Điều vận: Kanban theo trạng thái (`ContainerCard`), panel gán xe, lịch xe theo làn giờ.
- Bố cục dùng flex-wrap để co giãn; bảng rộng cuộn ngang trong khối. App tài xế thiết kế ở `size-phone` (390px), một cột.

## Trạng thái điều khiển

- Vùng bấm tối thiểu `size-hit` (44px). Nút và ô nhập ở form cao `size-button` (48px), nút trong bảng `size-ctl` (40px), tab lọc `size-tab` (36px).
- Hover: nút chính sang `primary-hover`; nút phụ, ghost, dòng bảng sang `surface-2`; thẻ công ty sang viền `primary` nền `info-soft`.
- Đang xử lý: giữ chiều rộng, vòng quay + "Đang …", `aria-busy`. Bị khóa có lý do thì ghi lý do ("Thử lại sau 14:35").
- Ô lỗi: viền 2px `crit`, dòng lỗi có icon ngay dưới ô, nối bằng `aria-describedby`.
- Thẻ đang chọn: `aria-pressed="true"`, viền và vòng 2px `primary`.

## Bốn trạng thái dữ liệu

Mỗi bảng, thẻ và khối dữ liệu đều có đủ bốn trạng thái:

1. **Bình thường:** sắp theo độ gấp, không theo thời gian tạo.
2. **Đang tải:** khung xương nền `surface-2` đúng kích thước dòng thật; không vòng quay toàn trang.
3. **Trống:** nói vì sao trống và một hành động (`EmptyState`).
4. **Lỗi:** giữ dữ liệu cũ, `Alert` nói phần nào lỗi và nút "Thử lại".

## Biểu tượng và logo

- Biểu tượng là SVG nét nội tuyến (stroke 2, đầu tròn), 16–20px, màu `currentColor`. Không emoji. Nút chỉ có icon luôn có `aria-label`.
- Logo là dấu "thùng container" (`assets/Logos/tms-mark.svg`): ô `primary` bo 6px, khung và 3 vạch `on-primary`. Đặt được trên mọi nền sáng lẫn tối.

## Chuyển động

- Chỉ báo thay đổi trạng thái: 150ms ease-out cho màu nền và viền. Chấm "Trực tiếp" nhấp nháy 2s.
- Tôn trọng `prefers-reduced-motion`: tắt chuyển tiếp và nhấp nháy, vòng quay chậm lại.

## Bàn phím và focus

- Mọi thao tác điều vận làm được bằng bàn phím. Ô tìm kiếm mở bằng phím `/`, hiển thị bằng `.tms-kbd`.
- Viền focus 3px màu `focus`, lệch 2px, luôn nhìn thấy trên cả hai theme.
- Thứ tự Tab theo thứ tự đọc: thanh bên → thanh trên → H1 → mốc hạn → bảng.

## Màn hình

`components/Screen01…Screen09` chứa các màn hoàn chỉnh (Đăng nhập, Trang chủ, Điều vận, Đối soát…), dựng từ các thành phần trên. Mỗi màn có thanh chuyển đủ 4 trạng thái dữ liệu: Bình thường, Đang tải, Trống, Lỗi.
