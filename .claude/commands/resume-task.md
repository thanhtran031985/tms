---
description: Làm tiếp task đang dở (dùng khi mở phiên mới hoặc sau /clear)
argument-hint: <NN-slug, vd 01-setup>
---
Làm tiếp task $ARGUMENTS.

1. Đọc theo thứ tự: docs/tasks/README.md → docs/tasks/$ARGUMENTS/task.md
   → progress.md → decisions.md → plan.md (nếu có).
2. Chạy git status và git log --oneline -5 để xem trạng thái thực tế.
3. Báo cáo ngắn (tối đa 10 dòng):
   - Bước nào đã ✅, bước đang dở, bước tiếp theo.
   - Có thay đổi chưa commit không; có khác biệt nào giữa progress.md và code
     thực tế không (vd progress ghi ✅ nhưng file không tồn tại).
   - Mục "Bước tiếp theo" trong progress.md ghi gì.
4. DỪNG, chờ tôi trả lời "continue" rồi mới làm bước tiếp theo.
KHÔNG làm lại bước đã ✅.
