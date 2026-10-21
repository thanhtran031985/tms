# Field

Ô nhập có nhãn luôn hiện ở trên và dòng lỗi ngay dưới ô, dùng cho form và ô lọc.

## Cấu trúc
- `tms-field` bọc `<label for>` + `tms-input`, cách nhau `space-6`. Nhãn kiểu `label` (15px/600), không thay bằng placeholder.
- `tms-input` cao `size-button` (48px), bo `radius-control`, nền `surface`, viền 1px `line-strong` (4,8:1, đạt mức 3:1 cho viền điều khiển). Placeholder dùng `ink-soft`.
- Gợi ý dưới ô: `tms-hint` (14px, `ink-soft`).
- Lỗi: `aria-invalid="true"` (viền 2px `crit`) và `p.tms-error-text` có icon tròn chấm than, chữ `crit`, nối bằng `aria-describedby`. Câu lỗi nói vấn đề và cách xử lý.
- Mật khẩu: bọc `tms-input-wrap`, nút `tms-icon-btn` 44px bên phải để hiện/ẩn, `aria-label` và `aria-pressed` đổi theo trạng thái.
- Ô tìm/lọc: `tms-search` với icon kính lúp bên trái; trên thanh trên cao `size-hit` (44px).
- Khóa: `disabled`, nền `surface-2`, chữ `ink-soft`, kèm gợi ý vì sao khóa.
- Mã định danh (biển số, số cont) thêm `tms-mono` (`--font-mono`).

## Bên dùng cung cấp
`id` khớp `for`, `autocomplete` đúng loại, giá trị mẫu thật (hung.dv@phucan.vn, 51C-482.17).
