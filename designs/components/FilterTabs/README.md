# FilterTabs

Tab lọc dạng viên thuốc có số đếm, đặt ở đầu khối chứa bảng hoặc danh sách.

## Dùng
- Bọc trong `tms-tabs` (`role="tablist"`, có `aria-label`), khoảng cách `space-6`. Mỗi tab là `<button role="tab" class="tms-tab">`.
- Tab cao tối thiểu `size-tab` (36px), bo `radius-pill`, viền 1px `line`, chữ 14px/500 `ink`; hover nền `surface-2`.
- Tab đang chọn: `aria-selected="true"`, nền `ink`, chữ `surface`; số đếm đảo thành nền `surface`, chữ `ink`.
- Số đếm trong `<span class="n">` (12px/700, nền `surface-2`, bo `radius-pill`), cập nhật theo dữ liệu thật, kể cả 0.
- Tab đầu luôn là "Tất cả". Tab có 0 việc vẫn hiện; khi chọn, bảng hiện `EmptyState` giải thích nhóm đó.
