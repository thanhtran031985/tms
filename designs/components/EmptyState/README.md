# EmptyState

Trạng thái trống nói vì sao chưa có dữ liệu, khi nào sẽ có và đưa tối đa một hành động.

## Cấu trúc
`tms-empty` đặt thay cho bảng hoặc danh sách, căn giữa, đệm 40px 20px, các phần cách `space-8`:
- `tms-empty-ico`: vòng tròn 44px, nền `surface-2`, icon nét 22px `ink-soft`. Thêm `is-ok` (nền `ok-soft`, icon `ok`, dấu tích) khi trống là tin tốt ("Không còn việc nào").
- Tiêu đề `h3` 16px/600 `ink`: nói tình trạng.
- Câu giải thích `p` `ink-soft`, tối đa 440px: nói điều gì làm dữ liệu xuất hiện.
- Một nút `tms-btn-sm tms-btn-secondary` nếu có hành động tạo ra dữ liệu ("Tạo Order").

## Viết
"Không có Street Turn nào chờ chấp thuận" + "Khi bạn ghép cont Nhập với cont Xuất dùng chung vỏ, chuyến cần số chấp thuận của hãng tàu sẽ hiện ở đây." Không hình minh họa, không emoji, không số 0 đứng một mình.
