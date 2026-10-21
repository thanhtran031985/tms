# Screen06-Fuel

Màn phiếu dầu cho Kế toán và Điều vận: phát hành phiếu có hạn mức lít, duyệt giao dịch đổ dầu và so tiêu hao full-to-full của từng xe với định mức L/100km.

- **Mục đích, người dùng:** Kế toán duyệt, từ chối hoặc ghi phạt giao dịch dầu; Điều vận phát hành phiếu và xem (không được duyệt). H1 nêu số giao dịch chờ duyệt, số có cờ và phiếu sớm hết hạn nhất.
- **Khối chính:** 4 thẻ chỉ số (chờ duyệt, có cờ, vượt định mức trên 5%, phiếu còn hiệu lực) → tab việc (Danh sách phiếu · Phát hành phiếu · Duyệt giao dịch) → bảng phiếu → biểu đồ tiêu hao full-to-full.
- **Bảng phiếu:** mã phiếu kèm chip trạng thái (Đã phát hành, Đã đổ chờ duyệt, Đã duyệt, Đã đối soát, Đã hủy, Hết hạn), xe · tài xế, cây xăng, hạn mức lít, lít thực đổ, đơn giá (báo khi lệch niêm yết), thành tiền, L/100km / định mức kèm % chênh, cờ bất thường.
- **Biểu đồ tiêu hao:** dot plot trục 30–44 L/100km, mỗi xe có vạch định mức riêng; mức lệch mã hóa bằng hình (thoi = vượt trên 5%, tam giác = cao hơn trong ngưỡng, tròn = đạt), chữ số và chip nhãn, không chỉ màu. Nút "Bảng số liệu" chuyển sang bảng thay thế (km odometer, lít, thực tế, định mức, chênh lệch).
- **Tương tác:** lọc theo trạng thái (pill tab có số đếm), tìm mã phiếu / biển số / tài xế, "Chỉ phiếu có cờ bất thường", chọn nhiều phiếu không cờ để duyệt hàng loạt, nút hành động mỗi dòng mở màn duyệt.
- **Phát hành (canvas):** chọn đầu kéo, tài xế, cây xăng đối tác, hạn mức lít, hạn dùng; chặn khi xe đang có phiếu còn hiệu lực hoặc hạn mức vượt dung tích bình (lỗi hiện ngay dưới ô); xem trước phiếu QR trên app tài xế.
- **Duyệt (canvas):** ảnh trụ bơm và odometer (phóng to), bảng xác nhận OCR (tài xế nhập so với OCR đọc), giải trình full-to-full (mốc đổ đầy trước, km odometer, km GPS, lít, định mức theo tỉ lệ có hàng / rỗng), thanh so thực tế với định mức, lý do bắt buộc khi có cờ, phạt đề xuất vào sổ lương.
- **Quy tắc nghiệp vụ:** tiêu hao = lít đổ đầy ÷ km odometer từ lần đổ đầy trước × 100; cờ Vượt định mức khi cao hơn trên 5%; cờ Odometer lùi, Lệch GPS > 10%, Ảnh trùng, Giá lệch niêm yết; phiếu có cờ phải duyệt từng phiếu; "—" là chưa có số liệu, không phải 0.
- **4 trạng thái dữ liệu:** Bình thường; Đang tải (khung xương cho thẻ chỉ số và dòng bảng); Trống (chưa có phiếu tháng 10/2026, nút "Phát hành phiếu"); Lỗi (giữ dữ liệu lúc 14:05, cảnh báo và nút "Thử lại").
- **Thành phần dùng:** [AppShell](../AppShell/README.md), [TenantPicker](../TenantPicker/README.md), [Button](../Button/README.md), [Field](../Field/README.md), [StatusChip](../StatusChip/README.md), [Alert](../Alert/README.md), [FilterTabs](../FilterTabs/README.md), [WorkTable](../WorkTable/README.md), [EmptyState](../EmptyState/README.md). Không dùng ContainerCard, DeadlineTimeline.
- **Bản canvas tương tác:** `redesign/project/Fuel.dc.html` (đủ 3 màn, đổi vai trò Kế toán / Điều vận, chế độ tối).
