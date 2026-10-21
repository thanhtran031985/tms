# Screen05-FleetMap

Màn Bản đồ đội xe cho điều vận theo dõi trực tiếp 58 đầu kéo và 7 rơ moóc đang thả trên sơ đồ khu vực TP.HCM, Bình Dương, Đồng Nai.

- **Mục đích, người dùng:** điều vận và quản lý đội xe xem ngay xe nào mất tín hiệu GPS hoặc dừng lâu, gọi tài xế, xem lại lộ trình trong ngày.
- **Khối chính:**
  - AppShell: thanh bên trắng, mục "Bản đồ đội xe" đang mở, thanh trên có chấm "Trực tiếp" và nút chế độ tối.
  - H1 nêu số việc cần xem và xe mất tín hiệu lâu nhất. Nút chuyển "Trực tiếp" / "Xem lại lộ trình".
  - Danh sách xe bên trái: tab Đầu kéo / Rơ moóc đang thả, ô tìm có nhãn, chip lọc trạng thái có đếm số, danh sách cuộn trong khung.
  - Sơ đồ SVG (`role="img"`, có `aria-label`) vẽ bằng `--map-land`, `--map-road`, `--map-water`. Có ghi tên cảng, depot, KCN, đường và vùng, ghi rõ là sơ đồ minh họa, không theo tỷ lệ. Geofence vẽ nét đứt.
  - Thẻ chi tiết xe đang chọn nằm dưới sơ đồ: tài xế, chuyến, container, stop kế tiếp, tốc độ, vị trí, giờ cập nhật.
  - Bảng "Đầu kéo theo khu vực" là phương án thay thế dạng bảng cho sơ đồ.
- **Ký hiệu xe (mỗi trạng thái có hình, biểu tượng và chữ, không chỉ dựa vào màu):**
  - Xe đang chạy dùng hình tròn màu `--primary`: đặc là có hàng, rỗng ruột là chạy rỗng.
  - Chờ tại kho/bãi: hình vuông `--off` có đồng hồ.
  - Dừng lâu: hình bát giác `--warn` có dấu tạm dừng.
  - Mất tín hiệu GPS: hình thoi rỗng ruột viền `--accent`.
  - Rơ moóc: hình vuông, viền đỏ khi nằm quá 48 giờ, viền cam khi quá 24 giờ.
- **Tương tác:**
  - Bấm marker hoặc dòng trong danh sách để chọn xe. Lọc theo trạng thái, tìm theo biển số hay tên tài xế (không cần gõ dấu).
  - Nhóm xe chờ tại một điểm lọc danh sách theo điểm đó. Nút "Lọc danh sách" trong bảng lọc theo khu vực.
  - Phóng to / thu nhỏ: khi thu nhỏ, xe gom cụm theo khu vực.
  - Xem lại lộ trình: thanh tua, Phát/Tạm dừng, tốc độ 60×/300×/900×, mốc vào/ra geofence bấm được.
  - Trên các nút đổi trạng thái, `aria-pressed` cho biết nút nào đang bật.
- **Quy tắc nghiệp vụ hiện trên màn:**
  - Xe mất tín hiệu khi quá 15 phút không có GPS. Số cont đúng check digit ISO 6346.
  - Chuyến ghi rõ loại SINGLE / TWIN_20 / COMBINED. Stop kế tiếp ghi rõ loại PORT_IN, PICK_EMPTY, UNSTUFFING…
  - Rơ moóc thả theo DROP_TRAILER và chờ HOOK_TRAILER. Rơ moóc chưa có lệnh móc thì có nút "Điều xe móc rơ moóc".
- **4 trạng thái dữ liệu:**
  - Bình thường.
  - Đang tải: khung xương cho danh sách, sơ đồ, thẻ chi tiết và bảng.
  - Trống: chưa có xe nào gửi vị trí, có nút "Kiểm tra thiết bị GPS".
  - Lỗi: báo mất kết nối, giữ vị trí lúc 14:19:48, có nút "Thử lại".
  - Ngoài ra, khi lọc không còn xe nào thì hiện "Không có xe nào khớp bộ lọc" kèm nút "Xóa bộ lọc".
- **Thành phần dùng:**
  - [AppShell](../AppShell/README.md), [Button](../Button/README.md), [Field](../Field/README.md), [StatusChip](../StatusChip/README.md)
  - [Alert](../Alert/README.md), [FilterTabs](../FilterTabs/README.md), [WorkTable](../WorkTable/README.md), [EmptyState](../EmptyState/README.md)
