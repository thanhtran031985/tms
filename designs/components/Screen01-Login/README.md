# Screen01-Login

Màn đăng nhập bằng email công việc rồi chọn công ty (tenant) để làm việc, dùng cho mọi người dùng web: Điều vận, Kế toán, Quản lý đội xe.

- **Mục đích:** vào hệ thống đa công ty; một tài khoản có thể có quyền ở nhiều công ty với vai trò khác nhau.
- **Khối chính:** cột giới thiệu (3 lợi ích, số hỗ trợ 1900 1234), form đăng nhập (Email, Mật khẩu có nút hiện/ẩn, Ghi nhớ 30 ngày, nút Đăng nhập), bước chọn công ty.
- **Tương tác:** nút mắt hiện/ẩn mật khẩu (`aria-pressed`), nút Đăng nhập chuyển sang "Đang đăng nhập…" có spinner và dòng trạng thái `aria-live`.
- **Quy tắc thể hiện:** sai mật khẩu báo ngay dưới ô (còn bao nhiêu lần thử); sai 5 lần thì khóa 15 phút, nút bị vô hiệu với nhãn "Thử lại sau 14:35"; nhãn hiện rõ trên mọi ô; chạm tối thiểu 44px.
- **4 trạng thái:**
  - Bình thường: form đăng nhập.
  - Đang tải: đang gửi, nút `aria-busy` có spinner.
  - Trống: bước chọn công ty khi tài khoản chưa được gán vào công ty nào, có một hành động "Liên hệ quản trị".
  - Lỗi: sai mật khẩu lần thứ 5 kèm cảnh báo tài khoản tạm khóa.
- **Thành phần dùng:** [Button](../Button/README.md), [Field](../Field/README.md), [Alert](../Alert/README.md), [TenantPicker](../TenantPicker/README.md), [EmptyState](../EmptyState/README.md).
- Nguồn: `redesign/project/Main.dc.html` (bản canvas tương tác).
