---
description: Tạo thư mục task mới từ template và thêm vào README
argument-hint: <mô tả ngắn task, vd "ôn tập lặp lại 5 hộp">
---
Tạo task mới cho mô tả sau: $ARGUMENTS

Làm theo mục "Khi tôi yêu cầu tạo task mới" trong CLAUDE.md:
1. Đọc docs/tasks/README.md, lấy số lớn nhất + 1 làm NN.
2. Đề xuất slug (tiếng Anh, kebab-case, ngắn) và tên task tiếng Việt.
3. Đề xuất cột "Phụ thuộc" dựa trên các task đã có (giải thích ngắn vì sao).
4. Liệt kê các thư mục trong designs/components/ có vẻ liên quan (CHỈ theo tên thư mục,
   không đọc nội dung).
DỪNG, chờ tôi xác nhận slug, tên, phụ thuộc và danh sách thiết kế.

Sau khi tôi xác nhận:
- Copy docs/tasks/_template/ sang docs/tasks/NN-slug/, điền tiêu đề và ngày.
- Trong task.md: điền Mục tiêu từ mô tả trên, mục Thiết kế với danh sách file đã
  xác nhận. Các mục còn lại để khung trống cho tôi viết. KHÔNG tự bịa yêu cầu.
- Thêm dòng vào docs/tasks/README.md (trạng thái ⬜, nhánh feat/NN-slug).
- Chạy npm run tasks:dashboard nếu lệnh này đã có trong package.json.
- Đề xuất commit message "docs: add task NN-slug". Chỉ commit khi tôi đồng ý.
KHÔNG bắt đầu làm task.
