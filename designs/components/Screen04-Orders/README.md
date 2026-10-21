# Screen04-Orders

Màn Đơn hàng & container cho Điều vận: danh sách Order (mỗi Order là một Booking hoặc B/L) mở ra từng container, kèm trạng thái, cước và hạn DEM/DET của từng cont.

- **Mục đích, người dùng:** Điều vận và Kế toán theo dõi Order, tạo Order mới và xử lý từng container (đơn vị để điều xe, tính giá, DEM/DET, ePOD).
- **Khối chính:**
  - Danh sách: H1 nêu số Order/container cần xử lý và hạn gần nhất, tab trạng thái có đếm số, bộ lọc (tìm, khách hàng, hãng tàu, chiều, ngày tạo), thanh thao tác hàng loạt, bảng Order có dòng mở rộng hiện bảng container.
  - Tạo Order: thông tin chung (khách, hãng tàu, chiều, Booking/B/L, tàu, cut-off, tuyến), dán danh sách số cont, bảng dòng cont (loại, VGM, seal, DEM, DET, lạnh, nguy hiểm, tuyến riêng).
  - Chi tiết Order: thông tin chung, tổng doanh thu, chi phí và lãi lỗ, bảng container, chi tiết container đang chọn (chuỗi Stop, giá, chi hộ, chứng từ EIR/ePOD, hủy cont), lịch sử thay đổi.
- **Tương tác chính:** mở và thu gọn container của Order; chọn nhiều Order để xác nhận Order nháp hoặc xuất Excel; kiểm tra check digit ISO 6346 ngay khi gõ và báo số cont trùng; tách số cont dán từ Excel hoặc email; nhập giá tay; giữ hay áp giá mới khi phải tính lại giá; hủy container kèm lý do và phí.
- **Quy tắc nghiệp vụ hiển thị:**
  - 1 Order = 1 Booking/B/L có nhiều container.
  - Không tìm thấy bảng giá thì ghi "Chưa có giá" và cho nhập giá tay, có lý do bắt buộc. Không bao giờ hiện 0 ₫.
  - Giá tay được ghi vào lịch sử và chờ Kế toán duyệt.
  - Cont tách khỏi TWIN_20 bị gắn cờ "Cần tính lại giá".
  - Chi hộ không tính vào doanh thu.
  - Cont đã giao thì không hủy được. Cont đã lấy rỗng thì phải nhập phí hủy lớn hơn 0.
  - Mức hạn: `crit` khi còn dưới 3 giờ hoặc bị HOLD, `warn` khi còn trong 8 giờ, `info` khi xa hơn. Màu luôn đi kèm biểu tượng và chữ.
- **4 trạng thái dữ liệu:**
  - Bình thường.
  - Đang tải: dòng xương thay cho bảng.
  - Trống: nói lý do và có một hành động (Tạo Order đầu tiên hoặc Thêm container).
  - Lỗi: giữ dữ liệu cũ lúc 14:12 và có nút "Thử lại".
  - Lọc không ra kết quả thì có nút "Xóa bộ lọc".
- **Component dùng:** [AppShell](../AppShell/), [TenantPicker](../TenantPicker/), [Button](../Button/), [Field](../Field/), [FilterTabs](../FilterTabs/), [WorkTable](../WorkTable/), [StatusChip](../StatusChip/), [Alert](../Alert/), [ContainerCard](../ContainerCard/), [DeadlineTimeline](../DeadlineTimeline/), [EmptyState](../EmptyState/).
