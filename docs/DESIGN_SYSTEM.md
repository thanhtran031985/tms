# TMS Container — Design System

Nguồn duy nhất cho mọi màu, chữ, khoảng cách, bo góc, bóng và kích thước của TMS Container. **Không viết cứng mã hex, cỡ chữ px hay bo góc lẻ trong component**: luôn dùng token (biến CSS trong `designs/tokens.css` hoặc khóa theme Tailwind). Thiếu token thì thêm vào đây trước, rồi mới dùng.

Nguồn: bản thiết kế Claude Design "TMS Container" (https://claude.ai/artifact/CjQUJpYnuGH3UMTPgY3Ygw), bản tải về nằm trong `designs/` (`tokens.json`, `tokens.css`, `README.md`, `components/*`). Tệp này SINH RA bởi `node scripts/design-system.mjs`; khi thiết kế được cập nhật, tải lại `designs/` rồi chạy lại lệnh, không sửa tay.

Phiên bản token: 2. Thiết kế lại theo ui-ux-pro-max (Logistics: Swiss tối giản + Flat, bảng điều khiển dày dữ liệu), 21/10/2026

Token có hai giá trị được ghi dạng `Sáng … · Tối …`. Chế độ chọn bằng `data-theme` trên thẻ `<html>` (mặc định Sáng).

---

## 1. Nguyên tắc (từ bản thiết kế)

Hệ thống giao diện cho phần mềm điều hành vận tải container (TMS) đa doanh nghiệp. Người dùng là điều vận, kế toán và quản lý đội xe trước màn 1366–1440px suốt ca làm, cùng tài xế trên app điện thoại. Hướng thiết kế lấy từ ui-ux-pro-max cho ngành Logistics: Swiss tối giản + Flat, dashboard dày dữ liệu và theo dõi thời gian thực, xanh dương chủ đạo, cam cho theo dõi/cảnh báo, xanh lá cho hoàn thành. Mặt trắng, viền mảnh, không bóng, và việc gấp nhất luôn hiện trước.

### Nguyên tắc nội dung

- Viết tiếng Việt có dấu. Giữ nguyên thuật ngữ ngành người dùng vẫn nói: Order, Container, Booking, B/L, Cut-off, DEM, DET, ePOD, EDO, VGM, HOLD, Street Turn, TWIN_20, Rơ moóc, Đầu kéo.
- Viết hoa kiểu câu: chỉ chữ đầu và tên riêng ("Điều xe", không phải "Điều Xe").
- H1 của màn nói số việc cần làm và mốc gần nhất bằng số thật: "9 việc cần xử lý. Hạn gần nhất: cut-off ONE HARMONY lúc 16:35, còn 2 giờ 15".
- Thời gian có cả giờ tuyệt đối lẫn thời gian còn lại ("lúc 16:35", "còn 2 giờ 15"). Quá hạn ghi "quá 35 phút".
- Thông báo lỗi nói chuyện gì xảy ra và làm gì tiếp: "Sai mật khẩu. Còn 2 lần thử trước khi tài khoản bị khóa 15 phút." Không dùng "Có lỗi xảy ra".
- Không hiện số 0 thay cho dữ liệu chưa có: ghi "Chưa có giá" (kèm nhập tay), "Chưa có xe".
- Không emoji, không dấu chấm than. Nút là động từ: "Điều xe", "Ghép chuyến", "Xác nhận phân bổ", "Thử lại".
- Số container, biển số, mã Order, số chứng từ luôn dùng `--font-mono` và không bao giờ bị cắt ngắn.

### Màu

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

### Chữ

- Một họ chữ giao diện: Fira Sans (`--font-ui`) 400/500/600/700, bật `font-variant-numeric: tabular-nums` để cột số thẳng hàng.
- Mã định danh: Fira Code 500 (`--font-mono`), kiểu `code` 15px.
- Thân chữ 16px, line-height 1.5 (`body`); ô bảng và menu 15px (`body-sm`); không chữ nào dưới 12px (`chip-sm`).
- Tiêu đề: `hero-title` 44px trang đăng nhập, `screen-title` 28px/700 cho H1, `section-title` 20px/600 cho H2, `kpi-figure` 32px/700 cho số chỉ số. Tiêu đề luôn 600–700.
- Nhãn ô nhập `label` 15px/600 đặt trên ô; không dùng placeholder thay nhãn.

### Khoảng cách, bo góc, bóng

- Thang `space-4` đến `space-48` (4/6/8/10/12/16/20/24/32/48). Trong khối dùng `space-12`–`space-20`; giữa các khối trên màn dùng `space-24`.
- Bo góc theo kích thước: `radius-chip-sm` 5px (chip trên thẻ Kanban), `radius-chip` 6px (chip), `radius-control` 8px (nút, ô nhập, menu, hộp thông báo), `radius-card-sm` 10px (thẻ container), `radius-card` 12px (khối lớn), `radius-pill` cho tab lọc và badge.
- Khối là mặt `surface` với viền 1px `line`, bo 12px, không bóng. Bóng chỉ cho lớp nổi: `shadow-popover` (menu, thẻ đang kéo) và `shadow-drawer` (ngăn kéo, hộp thoại).
- Không lồng thẻ trong thẻ, không thẻ viền trái màu; trạng thái dùng chip.

### Bố cục

- Thanh bên trắng rộng `size-nav` (240px) + thanh trên (đổi công ty, tìm kiếm có phím `/`, chấm trực tiếp, đổi giao diện, người dùng). Nội dung tối đa `size-content` (1240px), đệm `space-24`.
- Trang chủ đọc từ trên xuống: H1 → thẻ chỉ số → "Mốc hạn sắp tới" (`DeadlineTimeline`) → bảng Việc cần xử lý cạnh bản đồ đội xe và biểu đồ trạng thái.
- Điều vận: Kanban theo trạng thái (`ContainerCard`), panel gán xe, lịch xe theo làn giờ.
- Bố cục dùng flex-wrap để co giãn; bảng rộng cuộn ngang trong khối. App tài xế thiết kế ở `size-phone` (390px), một cột.

### Trạng thái điều khiển

- Vùng bấm tối thiểu `size-hit` (44px). Nút và ô nhập ở form cao `size-button` (48px), nút trong bảng `size-ctl` (40px), tab lọc `size-tab` (36px).
- Hover: nút chính sang `primary-hover`; nút phụ, ghost, dòng bảng sang `surface-2`; thẻ công ty sang viền `primary` nền `info-soft`.
- Đang xử lý: giữ chiều rộng, vòng quay + "Đang …", `aria-busy`. Bị khóa có lý do thì ghi lý do ("Thử lại sau 14:35").
- Ô lỗi: viền 2px `crit`, dòng lỗi có icon ngay dưới ô, nối bằng `aria-describedby`.
- Thẻ đang chọn: `aria-pressed="true"`, viền và vòng 2px `primary`.

### Bốn trạng thái dữ liệu

Mỗi bảng, thẻ và khối dữ liệu đều có đủ bốn trạng thái:

1. **Bình thường:** sắp theo độ gấp, không theo thời gian tạo.
2. **Đang tải:** khung xương nền `surface-2` đúng kích thước dòng thật; không vòng quay toàn trang.
3. **Trống:** nói vì sao trống và một hành động (`EmptyState`).
4. **Lỗi:** giữ dữ liệu cũ, `Alert` nói phần nào lỗi và nút "Thử lại".

### Biểu tượng và logo

- Biểu tượng là SVG nét nội tuyến (stroke 2, đầu tròn), 16–20px, màu `currentColor`. Không emoji. Nút chỉ có icon luôn có `aria-label`.
- Logo là dấu "thùng container" (`assets/Logos/tms-mark.svg`): ô `primary` bo 6px, khung và 3 vạch `on-primary`. Đặt được trên mọi nền sáng lẫn tối.

### Chuyển động

- Chỉ báo thay đổi trạng thái: 150ms ease-out cho màu nền và viền. Chấm "Trực tiếp" nhấp nháy 2s.
- Tôn trọng `prefers-reduced-motion`: tắt chuyển tiếp và nhấp nháy, vòng quay chậm lại.

### Bàn phím và focus

- Mọi thao tác điều vận làm được bằng bàn phím. Ô tìm kiếm mở bằng phím `/`, hiển thị bằng `.tms-kbd`.
- Viền focus 3px màu `focus`, lệch 2px, luôn nhìn thấy trên cả hai theme.
- Thứ tự Tab theo thứ tự đọc: thanh bên → thanh trên → H1 → mốc hạn → bảng.

### Màn hình

`components/Screen01…Screen09` chứa các màn hoàn chỉnh (Đăng nhập, Trang chủ, Điều vận, Đối soát…), dựng từ các thành phần trên. Mỗi màn có thanh chuyển đủ 4 trạng thái dữ liệu: Bình thường, Đang tải, Trống, Lỗi.

### Dùng trong mã
- Biến CSS: `var(--<tên token>)`, ví dụ `var(--primary)`, `var(--space-12)`, `var(--radius-card)`, `var(--font-ui)`.
- Tailwind: task 00 ánh xạ toàn bộ token vào theme (`bg-surface`, `text-ink-soft`, `rounded-card`, `p-12`…). Không dùng màu mặc định của Tailwind.
- Kiểu chữ dùng theo tên ở mục 3 (`screen-title`, `body`, `code`…), không ghép cỡ chữ lẻ.

---

## 2. Token màu

| Token | Giá trị | Dùng cho |
|---|---|---|
| `bg` | Sáng `#F8FAFC` · Tối `#0B1220` | Nền vùng nội dung của mọi màn. |
| `surface` | Sáng `#FFFFFF` · Tối `#111A2E` | Mặt thẻ, bảng, ô nhập, thanh bên, thanh trên, hộp thoại. |
| `surface-2` | Sáng `#F1F5F9` · Tối `#18233A` | Nền cột Kanban, hàng tiêu đề bảng, hover dòng bảng và nút ghost, khối phụ trong thẻ. |
| `line` | Sáng `#E2E8F0` · Tối `#26334D` | Đường kẻ trang trí: viền thẻ, chia dòng bảng. Không dùng làm viền điều khiển (dưới 3:1). |
| `line-strong` | Sáng `#64748B` · Tối `#7C8AA5` | Viền ô nhập, ô tìm kiếm, nút phụ (outline). 4,8:1 trên `surface` sáng, 5,0:1 tối. |
| `ink` | Sáng `#0F172A` · Tối `#E2E8F0` | Chữ chính (≥ 12,7:1 trên mọi nền ở cả hai theme). |
| `ink-soft` | Sáng `#475569` · Tối `#A3B1C6` | Chữ phụ: mô tả, nhãn cột, meta, placeholder (≥ 6,9:1). |
| `primary` | Sáng `#2563EB` · Tối `#60A5FA` | Nút chính, link, mục menu đang chọn, xe đang chạy trên bản đồ, vạch 'bây giờ'. 5,2:1 trên `surface` sáng. |
| `primary-hover` | Sáng `#1D4ED8` · Tối `#93C5FD` | Hover của nút chính và link. |
| `on-primary` | Sáng `#FFFFFF` · Tối `#0B1220` | Chữ trên `primary` (5,2:1 sáng, 7,4:1 tối). |
| `focus` | Sáng `#2563EB` · Tối `#93C5FD` | Vòng focus 3px, lệch 2px. |
| `accent` | Sáng `#EA580C` · Tối `#FB923C` | Cam theo dõi: chấm và biểu tượng không phải chữ (marker xe mất tín hiệu, khối Chờ móc rơ moóc). 3,6:1 trên nền sáng nên KHÔNG dùng cho chữ cỡ thường; chữ cảnh báo dùng `warn`. |
| `crit` | Sáng `#B91C1C` · Tối `#F87171` | Chặn, quá hạn, lỗi: chữ/icon chip, viền ô lỗi, marker mốc hạn < 3 giờ. Luôn kèm icon và chữ. |
| `crit-soft` | Sáng `#FEF2F2` · Tối `#3B1418` | Nền chip/hộp mức chặn; chữ `crit` (5,9:1 sáng, 5,8:1 tối). |
| `warn` | Sáng `#C2410C` · Tối `#FB923C` | Sắp hạn, cần xem: chữ/icon chip cảnh báo, marker mốc hạn trong 8 giờ. |
| `warn-soft` | Sáng `#FFF7ED` · Tối `#3A2210` | Nền chip/hộp cảnh báo; chữ `warn` (4,9:1 sáng, 6,6:1 tối). |
| `ok` | Sáng `#15803D` · Tối `#4ADE80` | Xong, hợp lệ, rảnh, đã khớp. Kèm dấu tích. |
| `ok-soft` | Sáng `#F0FDF4` · Tối `#0F2E1C` | Nền chip/hộp thành công; chữ `ok` (4,8:1 sáng, 8,4:1 tối). |
| `off` | Sáng `#475569` · Tối `#A3B1C6` | Tạm dừng, nghỉ phép, mất kết nối, không áp dụng. |
| `off-soft` | Sáng `#F1F5F9` · Tối `#1E293B` | Nền chip trạng thái tắt; chữ `off` (6,9:1). |
| `info` | Sáng `#1D4ED8` · Tối `#93C5FD` | Thông tin, đã lên kế hoạch, vai trò người dùng. |
| `info-soft` | Sáng `#EFF6FF` · Tối `#14223F` | Nền chip thông tin, mục menu đang chọn, hover thẻ công ty; chữ `info` (6,2:1 sáng, 8,8:1 tối). |
| `chart-1` | Sáng `#93C5FD` · Tối `#93C5FD` | Biểu đồ trạng thái: Chờ điều. Màu biểu đồ luôn kèm nhãn chữ và số. |
| `chart-2` | Sáng `#60A5FA` · Tối `#60A5FA` | Biểu đồ trạng thái: Đã lên kế hoạch. |
| `chart-3` | Sáng `#3B82F6` · Tối `#3B82F6` | Biểu đồ trạng thái: Đã điều. |
| `chart-4` | Sáng `#1D4ED8` · Tối `#2563EB` | Biểu đồ trạng thái: Đang chạy. |
| `map-land` | Sáng `#EEF2F7` · Tối `#16213A` | Nền đất của bản đồ/sơ đồ vị trí. |
| `map-road` | Sáng `#CBD5E1` · Tối `#334362` | Đường trên bản đồ. |
| `map-water` | Sáng `#DBEAFE` · Tối `#1B2D52` | Sông, cảng trên bản đồ. |

## 3. Chữ

Họ chữ:
- `--font-ui`: "Fira Sans", system-ui, sans-serif
- `--font-mono`: "Fira Code", ui-monospace, monospace

### Tiêu đề

| Kiểu | Cỡ | Dòng | Đậm | Giãn chữ | Dùng cho |
|---|---|---|---|---|---|
| `hero-title` | 44px | 1.1 | 700 | -0.02em | Tiêu đề lớn trang đăng nhập. |
| `screen-title` | 28px | 1.25 | 700 | -0.01em | H1 màn làm việc: số việc và hạn gần nhất. |
| `kpi-figure` | 32px | 1.15 | 700 | 0 | Con số trong thẻ chỉ số. |
| `section-title` | 20px | 1.3 | 600 | 0 | H2 của mỗi khối. |

### Giao diện

| Kiểu | Cỡ | Dòng | Đậm | Giãn chữ | Dùng cho |
|---|---|---|---|---|---|
| `body` | 16px | 1.5 | 400 | 0 | Chữ mặc định. |
| `body-sm` | 15px | 1.5 | 400 | 0 | Ô bảng, mục menu, nút gọn. |
| `label` | 15px | 1.4 | 600 | 0 | Nhãn ô nhập, tiêu đề cột Kanban. |
| `button` | 17px | 1.2 | 600 | 0 | Nút chính cao 48px; nút trong bảng dùng 15px/600. |
| `small` | 14px | 1.45 | 400 | 0 | Meta, dòng thứ hai trong ô bảng, tab lọc. |
| `caption` | 13px | 1.4 | 600 | 0 | Tiêu đề cột bảng, nhãn trên thẻ chỉ số. |
| `chip` | 13px | 1.4 | 700 | 0 | Chip trạng thái trong bảng. |
| `chip-sm` | 12px | 1.5 | 700 | 0 | Chip trên thẻ Kanban, nhãn trục giờ. Cỡ nhỏ nhất được dùng. |

### Mã định danh

| Kiểu | Cỡ | Dòng | Đậm | Giãn chữ | Dùng cho |
|---|---|---|---|---|---|
| `code` | 15px | 1.4 | 500 | 0 | Số container, biển số, mã Order, số Booking/B/L. Không bao giờ cắt ngắn. |

## 4. Khoảng cách

| Token | Giá trị | Dùng cho |
|---|---|---|
| `space-4` | `4px` | Giữa các chip, giữa mục menu. |
| `space-6` | `6px` | Nhãn với ô nhập, giữa tab lọc. |
| `space-8` | `8px` | Icon với chữ, giữa thẻ trong cột Kanban. |
| `space-10` | `10px` | Đệm thẻ Kanban, đệm cột Kanban. |
| `space-12` | `12px` | Khoảng mặc định trong một khối; khoảng giữa thẻ chỉ số. |
| `space-16` | `16px` | Đệm thẻ chỉ số, đệm ô. |
| `space-20` | `20px` | Đệm trong của khối lớn (bảng, panel). |
| `space-24` | `24px` | Khoảng giữa các khối trên một màn; đệm vùng nội dung. |
| `space-32` | `32px` | Đệm ngang panel form. |
| `space-48` | `48px` | Đệm trang đăng nhập. |

## 5. Bo góc

| Token | Giá trị | Dùng cho |
|---|---|---|
| `radius-chip-sm` | `5px` | Chip trên thẻ Kanban. |
| `radius-chip` | `6px` | Chip trạng thái, icon trong thẻ chỉ số. |
| `radius-control` | `8px` | Nút, ô nhập, mục menu, hộp thông báo. |
| `radius-card-sm` | `10px` | Thẻ container, nút chọn xe. |
| `radius-card` | `12px` | Khối lớn: bảng, panel, cột Kanban, thẻ công ty. |
| `radius-pill` | `999px` | Tab lọc, badge đếm, chip vai trò. |

## 6. Bóng

| Token | Giá trị | Dùng cho |
|---|---|---|
| `shadow-popover` | Sáng `0 6px 18px rgba(15,23,42,.12)` · Tối `0 6px 18px rgba(0,0,0,.45)` | Menu thả xuống, thẻ đang kéo. |
| `shadow-drawer` | Sáng `0 12px 32px rgba(15,23,42,.18)` · Tối `0 12px 32px rgba(0,0,0,.55)` | Ngăn kéo chi tiết, hộp thoại. |

## 7. Kích thước

| Token | Giá trị | Dùng cho |
|---|---|---|
| `size-button` | `48px` | Nút chính và ô nhập ở form. |
| `size-hit` | `44px` | Vùng bấm tối thiểu: nút icon, mục menu, ô tìm kiếm. |
| `size-ctl` | `40px` | Nút gọn trong bảng. |
| `size-tab` | `36px` | Tab lọc dạng viên thuốc. |
| `size-nav` | `240px` | Bề rộng thanh bên. |
| `size-content` | `1240px` | Bề rộng tối đa vùng nội dung. |
| `size-phone` | `390px` | Bề rộng thiết kế app tài xế. |

## 8. Thành phần và màn hình

Mỗi thư mục trong `designs/components/` có `README.md` (cách dùng, biến thể, trạng thái) và `preview.html` (xem trực tiếp, có công tắc 4 trạng thái). Kiểu dáng chung nằm trong `designs/components/bundle.css`. Cách chuyển sang React xem mục "Chuyển thiết kế Claude Design sang Next.js" trong `CLAUDE.md`.
