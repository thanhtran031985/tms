# Screen09-DriverApp

App điện thoại cho tài xế xem việc tiếp theo, chạy chuyến theo từng stop, chụp EIR/ePOD/Seal, khai phiếu dầu và chi phí, xem sổ lương, kể cả khi mất sóng.

- **Mục đích, người dùng:** tài xế đầu kéo (ví dụ Trần Văn Lộc, xe `51C-482.17`), cầm máy 390×844 ngoài trời, dưới nắng, một tay.
- **Khối chính:** header có H1 đếm việc còn lại kèm hạn gần nhất (ví dụ "2 chuyến còn lại · Cut-off 18:00"), pill trạng thái mạng, nút sáng/tối; thẻ **Việc tiếp theo** với một nút chính; danh sách 3 chuyến hôm nay; chi tiết chuyến với timeline 3 stop (PICK_EMPTY → STUFFING → PORT_IN); check-in 3 bước; phiếu dầu; chi phí dọc đường; sổ lương; bottom nav 4 mục (Lệnh, Phiếu dầu, Chi phí, Sổ lương).
- **Quy tắc mobile:** mọi vùng chạm ≥ 48px (nút chính 60–72px), chữ thân 16–19px, H1 22px, padding theo `env(safe-area-inset-*)`, không vẽ thanh trạng thái hệ điều hành giả, nhấn có phản hồi rõ (`:active` đổi nền và thu nhỏ 2–3%, tắt thu nhỏ khi giảm chuyển động).
- **Tương tác:** Bắt đầu chuyến → Check-in Stop 2 → Đã đến (GPS trong khu vực kho) → chụp đủ EIR, ePOD, Seal và ký nhận → Hoàn tất Stop (bị khoá kèm lý do đến khi đủ) → Đi Stop 3. Phiếu dầu: quét QR → nhập số lít, đơn giá, odometer → công tắc Đổ đầy bình → 2 ảnh trụ bơm và đồng hồ km → Gửi. Chi phí: chọn loại → số tiền → ảnh hoá đơn bắt buộc → Gửi.
- **Offline:** banner "Đang offline · 3 thao tác chờ gửi" mở ra hàng chờ (ảnh EIR 62%, chi phí Nâng hạ, vị trí GPS); ô ảnh chờ tải hiện màu `off` + icon tải lên + chữ "Chờ tải lên"; chi phí chuyển "Chờ gửi". Xung đột: alert `crit` "Check-in Stop 2 không được nhận" và nút gọi Điều vận.
- **Quy tắc nghiệp vụ:** container là đơn vị ePOD; TWIN_20 hiện 2 cont trên một chuyến; mức tiêu hao dầu tính từ lần đổ đầy bình đến lần đổ đầy kế tiếp (đổ một phần thì cộng dồn); phạt trả vỏ trễ hạn DET hiện trong sổ lương; màu luôn đi kèm icon và chữ.
- **4 trạng thái dữ liệu (danh sách lệnh):** Bình thường; Đang tải (khung xương, không spinner toàn màn); Trống ("Chưa có lệnh nào hôm nay" + "Tải lại lệnh"); Lỗi (giữ lệnh lúc 10:41, alert + "Thử lại").
- **Props canvas:** `dark`, `network` (online / offline / conflict), `data` (normal / loading / empty / error).
- **Thành phần dùng:** [Button](../Button/README.md), [Field](../Field/README.md), [StatusChip](../StatusChip/README.md), [Alert](../Alert/README.md), [ContainerCard](../ContainerCard/README.md), [EmptyState](../EmptyState/README.md), [DeadlineTimeline](../DeadlineTimeline/README.md).
