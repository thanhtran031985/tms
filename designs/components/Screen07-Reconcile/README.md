# Screen07-Reconcile

Màn Đối soát giúp Kế toán so khớp bảng kê của khách hàng, cây xăng và nhà xe ngoài với dữ liệu hệ thống, xử lý từng dòng lệch rồi chốt kỳ.

- **Ai dùng, để làm gì:** Kế toán (Lê Thị Mai) đối soát cuối kỳ với từng đối tác trước khi lập hóa đơn hoặc tạo bảng kê phải trả.
- **Khối chính:**
  - `AppShell`: sidebar trắng 240px, mục "Đối soát" đang chọn có huy hiệu số dòng chưa xử lý; thanh trên có đổi công ty, tìm kiếm `/`, chấm trực tiếp, chế độ tối, người dùng.
  - H1 nêu số dòng lệch và hạn chốt kỳ ("5 dòng lệch cần xử lý. Hạn chốt kỳ 10/2026: 31/10, còn 14 ngày"); bước 1 Tải và ánh xạ bảng kê → bước 2 So khớp và xử lý.
  - Bước 1: loại đối tác (Khách hàng · Cây xăng · Nhà xe ngoài), chọn đối tác và kỳ, file bảng kê, ánh xạ cột có nhãn, bảng xem trước 10 dòng, nút chính "So khớp N dòng".
  - Bước 2: 4 thẻ tổng (hệ thống, bảng kê, chênh lệch, số chốt sau xử lý), khối container bị loại vì chưa có ePOD đã xác minh, kết quả so khớp hai cột Hệ thống | Bảng kê, thanh chốt kỳ.
- **Tương tác chính:**
  - `FilterTabs` dạng viên thuốc: Khớp · Lệch số liệu · Chỉ có ở bảng kê · Chỉ có trong hệ thống, kèm số "n chưa xử lý".
  - Mỗi dòng lệch có 2 cách xử lý (Theo bảng kê / Giữ số hệ thống; Bổ sung / Loại khỏi kỳ; Vẫn tính / Chuyển sang kỳ sau) và "Hoàn tác".
  - Nút "Chốt đối soát" chỉ bật khi đã xử lý hết; khách hàng → chuyển lập hóa đơn, cây xăng và nhà xe → tạo bảng kê phải trả (VB-2610-0007).
  - Tình huống mẫu: nhập trùng file (cảnh báo, mở phiên đã nhập), kỳ đã khóa (chỉ xem, mọi điều khiển tắt).
- **Quy tắc nghiệp vụ hiển thị:**
  - Đơn vị đối soát là container; container chưa có ePOD đã xác minh không vào kỳ.
  - Ô lệch tô `warn-soft`, viền `warn` và ghi rõ "lệch +300.000 ₫" hoặc "hệ thống: 07/10", không dựa vào màu.
  - Phiếu dầu so theo mã phiếu, biển số, số lít và đơn giá niêm yết.
  - Kỳ đã khóa không sửa được, cần Admin mở lại.
  - Mã container, Order, phiếu dầu, biển số và tên file dùng `--font-mono`.
- **4 trạng thái dữ liệu:**
  - Bình thường.
  - Đang tải: xương thẻ tổng và dòng so khớp, giữ tiêu đề cột.
  - Trống: "Chưa có bảng kê nào của … cho kỳ 10/2026" kèm nút "Tải bảng kê".
  - Lỗi: `Alert` crit giữ số liệu cũ lúc 14:12 và nút "Thử lại".
- **Thành phần dùng:** [AppShell](../AppShell/README.md), [Button](../Button/README.md), [Field](../Field/README.md), [StatusChip](../StatusChip/README.md), [Alert](../Alert/README.md), [FilterTabs](../FilterTabs/README.md), [WorkTable](../WorkTable/README.md), [EmptyState](../EmptyState/README.md), [TenantPicker](../TenantPicker/README.md).
