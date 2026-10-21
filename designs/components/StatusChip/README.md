# StatusChip

Nhãn trạng thái ngắn luôn có icon và chữ, không bao giờ chỉ là một chấm màu.

## Năm mức
| Lớp | Nền / chữ | Nghĩa | Icon |
|---|---|---|---|
| `tms-chip-crit` | `crit-soft` / `crit` | Chặn, quá hạn, còn dưới 3 giờ (cut-off ONE HARMONY, GPLX sắp hết hạn) | đồng hồ, tờ giấy |
| `tms-chip-warn` | `warn-soft` / `warn` | Trong 8 giờ, cần xem (DET, HOLD, Chờ EDO) | đồng hồ, ổ khóa |
| `tms-chip-ok` | `ok-soft` / `ok` | Xong, hợp lệ, rảnh (Có EDO, Ghép TWIN_20 được) | dấu tích |
| `tms-chip-off` | `off-soft` / `off` | Tạm dừng, mất tín hiệu, nghỉ phép | wifi gạch |
| `tms-chip-info` | `info-soft` / `info` | Đã lên kế hoạch, thông tin (Street Turn, Cont lạnh) | mũi tên, bông tuyết |

`tms-chip-neutral` (`surface-2` / `ink-soft`) cho thuộc tính không phải trạng thái (loại cont 40RF).

## Cỡ
- Mặc định: 13px/700, bo `radius-chip` (6px), icon 14px. Dùng trong cột "Việc" của bảng.
- `tms-chip-sm`: 12px/700, bo `radius-chip-sm` (5px), icon 12px. Dùng trên thẻ Kanban và làn lịch xe.
- `tms-pill`: viên thuốc `radius-pill`, `info-soft` / `info`, cho vai trò (Điều vận, Kế toán).
- `tms-badge`: số đếm `radius-pill`, `crit-soft` / `crit`, cạnh mục menu.

## Quy tắc
- Giữ nguyên thuật ngữ: Cut-off, DEM, DET, HOLD hải quan, TWIN_20, Street Turn, EDO.
- Chip có mốc hạn ghi cả thời gian còn lại ("Cut-off còn 2 giờ 15").
- Không dùng `accent` cho chữ chip; cam chữ luôn là `warn`.
