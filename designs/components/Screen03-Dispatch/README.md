# Screen03-Dispatch

Bảng điều vận Kanban theo từng container, nơi Điều vận chọn một thẻ Chờ điều để gán xe và đối chiếu lịch xe trong ngày.

- **Mục đích:** điều xe cho từng container (1 Order nhiều container, container là đơn vị điều); dùng bởi Điều vận trên màn rộng.
- **Khối chính:** thanh đầu (về Trang chủ, H1 "Điều vận", ngày giờ, đặt lại dữ liệu mẫu); bộ lọc chiều hàng Tất cả/Xuất/Nhập và ô lọc số cont, Order, khách; 6 cột Kanban (Chờ điều → Hoàn thành chờ chứng từ); bảng gán xe; lịch xe 05:00–23:00 với vạch "bây giờ".
- **Tương tác:**
  - Chọn thẻ ở cột Chờ điều mở bảng gán xe với 7 xe, mỗi xe có lý do được hoặc không được điều.
  - Bấm một xe được phép thì thẻ chuyển sang Đã lên kế hoạch, khối chuyến hiện trên lịch xe và có thông báo kèm "Hoàn tác".
  - Bộ lọc chiều hàng và ô lọc cập nhật số đếm của từng cột.
- **Quy tắc thể hiện:**
  - Chip cut-off, DEM, DET đổi `crit`/`warn`/`info` theo giờ còn lại.
  - Có các chip Chờ EDO, Có EDO, HOLD hải quan, Hàng nguy hiểm, Cont lạnh, Street Turn và chứng từ ePOD/EIR.
  - Bảng gán xe chặn tài xế nghỉ phép, đăng kiểm hết hạn, cont lạnh cần rơ moóc có genset và trùng giờ; xe 2×20 được ghép TWIN_20.
- **4 trạng thái:**
  - Bình thường.
  - Đang tải: skeleton cột và lịch xe.
  - Trống: chưa có container cần điều hôm nay, kèm nút "Tạo Order".
  - Lỗi: giữ bảng lúc 14:20, cảnh báo gán có thể trùng và có nút "Thử lại".
- **Thành phần dùng:** [ContainerCard](../ContainerCard/README.md), [StatusChip](../StatusChip/README.md), [FilterTabs](../FilterTabs/README.md), [Button](../Button/README.md), [Field](../Field/README.md), [Alert](../Alert/README.md), [EmptyState](../EmptyState/README.md), [AppShell](../AppShell/README.md).
- Nguồn: `redesign/project/Dispatch.dc.html`.
