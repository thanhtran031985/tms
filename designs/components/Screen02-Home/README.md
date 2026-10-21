# Screen02-Home

Trang chủ Điều vận cho biết ngay có bao nhiêu việc cần xử lý và mốc hạn gần nhất, kèm chỉ số trong ngày, đội xe và container theo trạng thái.

- **Mục đích:** màn đầu tiên của Điều vận (Nguyễn Văn Hùng, Vận tải Phúc An) trên màn 1366–1440px; H1 nói "9 việc cần xử lý" và cut-off ONE HARMONY 16:35 còn 2 giờ 15.
- **Khối chính:** khung ứng dụng (thanh bên 240px, thanh trên có đổi công ty, tìm kiếm phím `/`, chấm trực tiếp, nút giao diện, người dùng); 4 thẻ KPI; dòng thời gian mốc hạn 14:00 → 08:00 với 4 mốc đánh số; bảng Việc cần xử lý; bản đồ đội xe với 3 xe mất tín hiệu; thanh container theo trạng thái (91 cont).
- **Tương tác:** tab dạng pill lọc bảng (Tất cả, Cut-off, DEM/DET, HOLD, Giấy tờ, Mất tín hiệu, Street Turn); tab không có việc hiện trạng thái trống riêng của nhóm đó.
- **Quy tắc thể hiện:** `crit` khi còn dưới 3 giờ, `warn` khi trong 8 giờ, `off` khi mất GPS; mỗi chip có icon và chữ, không dựa vào màu; HOLD hải quan chặn chuyến; GPLX/đăng kiểm sắp hết hạn sẽ chặn điều xe; số container, biển số, mã Order dùng font mono; bảng cuộn ngang trong hộp.
- **4 trạng thái:**
  - Bình thường: dữ liệu lúc 14:20.
  - Đang tải: skeleton theo đúng bố cục (KPI, mốc hạn, bảng, bản đồ).
  - Trống: chưa có Order nào trong ngày, kèm nút "Tạo Order".
  - Lỗi: giữ số liệu cũ, báo mất kết nối từ 14:20 và có nút "Thử lại".
- **Thành phần dùng:** [AppShell](../AppShell/README.md), [FilterTabs](../FilterTabs/README.md), [WorkTable](../WorkTable/README.md), [StatusChip](../StatusChip/README.md), [DeadlineTimeline](../DeadlineTimeline/README.md), [Alert](../Alert/README.md), [Button](../Button/README.md), [EmptyState](../EmptyState/README.md).
- Nguồn: `redesign/project/Home.dc.html`.
