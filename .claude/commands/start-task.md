---
description: Bắt đầu một task từ Bước 0 (chỉ dùng cho task chưa có code)
argument-hint: <NN-slug, vd 02-auth-profiles>
---
Bắt đầu task $ARGUMENTS. Đọc @docs/tasks/$ARGUMENTS/ và docs/tasks/README.md.

Kiểm tra trước khi làm:
- Nếu thư mục docs/tasks/$ARGUMENTS/ không tồn tại → DỪNG và báo.
- Nếu task.md còn mục trống quan trọng (Mục tiêu, Các bước, Phạm vi) → liệt kê
  và DỪNG, không tự điền.
- Nếu progress.md có bước nào khác ⬜, hoặc README ghi task không phải ⬜
  → DỪNG và hỏi: có thể task đã có code, nên dùng /resume-task hoặc
  /finish-task thay vì làm lại từ đầu.
- Nếu các task trong cột "Phụ thuộc" chưa ✅ → báo và hỏi có tiếp tục không.
- Kiểm tra nhánh git hiện tại. Nếu chưa ở nhánh ghi trong README, đề xuất lệnh
  tạo/chuyển nhánh và chờ tôi đồng ý.

Khi mọi thứ ổn:
- Đổi trạng thái task trong README thành 🔄.
- Làm Bước 0 theo task.md và quy trình trong CLAUDE.md (cập nhật progress.md,
  báo cáo, đề xuất commit, DỪNG chờ "continue").
