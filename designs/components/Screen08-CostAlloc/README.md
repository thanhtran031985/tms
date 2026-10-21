# Screen08-CostAlloc

Màn Phân bổ chi phí chuyến giúp Kế toán chia chi phí một chuyến cho từng container, so số hệ thống đề xuất với số sửa tay và chỉ lưu khi tổng khớp đúng chi phí chuyến.

- **Mục đích, người dùng:** Kế toán (Lê Thị Mai) kiểm và chốt giá vốn vận chuyển của từng container trong chuyến TWIN_20 `TRIP-2610-0912`; Điều vận chỉ xem.
- **Khối chính:**
  - `AppShell`: thanh bên, mục "Phân bổ chi phí" đang chọn; thanh trên có `TenantPicker` và ô tìm `/`.
  - H1 nêu số việc và hạn khóa chi phí.
  - Thẻ thông tin chuyến: chế độ chạy, xe, moóc, tài xế, ngày chạy, khóa chi phí, phương pháp.
  - `WorkTable` "Chi phí chuyến theo khoản" có dòng tổng.
  - `WorkTable` "Phân bổ cho từng container": thanh cân, các cột Hệ thống đề xuất, Kế toán áp dụng, Chênh, Gán thẳng, Tổng vào cont.
  - `Field` Lý do điều chỉnh và Lịch sử thay đổi.
  - Thanh lưu cố định ở đáy: tổng chuyến, đã phân bổ, còn lệch.
- **Tương tác chính:**
  - Nhập theo số tiền hoặc theo %.
  - Gõ số áp dụng thì độ lệch, thanh cân và H1 cập nhật ngay.
  - "Dồn/Trừ phần lệch" vào cont cuối.
  - "Khôi phục số hệ thống".
  - Mở chi phí của cont qua mọi chuyến.
  - Xác nhận cờ "Cần xem lại".
  - Lưu ghi một dòng vào lịch sử.
- **Quy tắc nghiệp vụ hiển thị:**
  - Mặc định chia theo COST_NORM_RATIO.
  - Sửa tay chuyển sang MANUAL và bắt buộc có lý do; lỗi hiện ngay dưới ô.
  - Tổng áp dụng phải bằng đúng chi phí chuyến: còn lệch khác 0 ₫ thì khóa nút Lưu.
  - Giữ cả số hệ thống và số sửa; mọi thay đổi vào lịch sử kiểm toán.
  - Chuyến đã khóa thì chỉ xem và tạo bút toán điều chỉnh ở kỳ mở.
  - Khoản không phát sinh ghi "Không phát sinh", không ghi 0.
- **4 trạng thái dữ liệu:**
  - Bình thường.
  - Đang tải: khung xương cho hai bảng.
  - Trống: chuyến chưa có khoản chi phí được duyệt, kèm nút "Mở phiếu dầu của chuyến".
  - Lỗi: `Alert` đỏ có "Thử lại", giữ số đã lưu và tạm khóa Lưu.
- **Thành phần dùng:** [AppShell](../AppShell/README.md), [TenantPicker](../TenantPicker/README.md), [Button](../Button/README.md), [Field](../Field/README.md), [StatusChip](../StatusChip/README.md), [Alert](../Alert/README.md), [FilterTabs](../FilterTabs/README.md), [WorkTable](../WorkTable/README.md), [EmptyState](../EmptyState/README.md). Không dùng ContainerCard và DeadlineTimeline.
