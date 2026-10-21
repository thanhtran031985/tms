# DeadlineTimeline

Khối "Mốc hạn sắp tới" đặt mọi cut-off, DEM, DET lên một trục giờ ngang, mỗi mốc là một vòng tròn đánh số và một thẻ nói còn bao lâu.

## Cấu trúc
- `section.tms-tl`: nền `surface`, viền 1px `line`, bo `radius-card` (12px), đệm `space-20`, các phần cách `space-16`. Đặt ngay dưới H1 và hàng thẻ chỉ số.
- `tms-tl-head`: H2 "Mốc hạn sắp tới" (20px/600) + khoảng giờ đang xem (`tms-tl-range`, 14px `ink-soft`).
- `tms-tl-track` (cao 56px, `aria-hidden="true"`):
  - `tms-tl-rail`: thanh 4px nền `surface-2`; `tms-tl-past`: đoạn đã qua tô `primary`.
  - `tms-tl-tick`: nhãn giờ 12px `ink-soft`, mỗi 2 giờ.
  - `tms-tl-now`: vạch "bây giờ" 2px × 28px màu `primary`.
  - `tms-tl-mark`: vòng tròn 28px đánh số (14px/700), viền tách 3px màu `surface`.
- `ol.tms-tl-list`: lưới thẻ `tms-tl-item` (đệm `space-12`, bo `radius-control`, nền `surface-2`; mốc gấp nền `crit-soft`). Mỗi thẻ: vòng số, loại hạn (13px/600 `ink-soft`), đối tượng (600; số cont thêm `tms-mono`), dòng phụ, và "Còn 2 giờ 15" đậm kèm giờ tuyệt đối.

## Màu theo độ gấp
- `is-crit`: còn dưới 3 giờ hoặc quá hạn. Vòng `crit`, chữ "Còn…" `crit`, thẻ `crit-soft`.
- `is-warn`: trong 8 giờ. Vòng `warn`, chữ "Còn…" `warn`.
- `is-info`: xa hơn 8 giờ. Vòng `primary`, chữ "Còn…" `ink`.
Số trên vòng và thẻ cùng số giúp nối trục với danh sách; màu không bao giờ đứng một mình.

## Quy tắc
- Tối đa 4 mốc, sắp theo thời gian; mốc thứ 5 trở đi vào bảng Việc cần xử lý.
- Quá hạn ghi "Quá 35 phút". Giờ tính theo Asia/Ho_Chi_Minh.
- Trống: "Không có mốc hạn nào trong 18 giờ tới" kèm link sang Đơn hàng.
