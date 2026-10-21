# Đưa TMS vào Claude Code

Bộ khởi động này làm theo đúng khuôn của dự án Học cùng Bông: `CLAUDE.md`, `docs/PRD.md`, `docs/DESIGN_SYSTEM.md`, `docs/tasks/` (README có cột Trạng thái, Phụ thuộc, Nhánh git; mỗi task có task.md, progress.md, plan.md, decisions.md, _archive/).

## 1. Tạo thư mục dự án
Giải nén `tms-starter.zip` vào thư mục mới, ví dụ `D:\tms`. Bên trong:
- `CLAUDE.md`, `AGENTS.md`: hướng dẫn cho Claude (dự án, cấu trúc task, quy trình từng bước, quy tắc code, quy tắc riêng TMS, chuyển thiết kế sang Next.js).
- `docs/PRD.md`: đặc tả chức năng theo màn hình, giai đoạn GĐ0–GĐ6.
- `docs/DESIGN_SYSTEM.md`: token và quy tắc giao diện, sinh từ `designs/`.
- `docs/specs/`: spec 00–08 đã rà soát (nguồn chi tiết).
- `docs/tasks/`: 25 task từ `00-monorepo-setup` đến `24-production-readiness`.
- `designs/`: hệ thống giao diện "TMS Container" tải về từ Claude Design (CHỈ ĐỌC).
- `scripts/`: `tasks-dashboard.mjs`, `design-system.mjs`.
- `prompts/`: câu lệnh mẫu để dán vào Claude Code.

## 2. Mở Claude Code
```
cd D:\tms
git init
git add . && git commit -m "init: bộ khởi động TMS"
claude
```

## 3. Mỗi task
1. Bật Plan mode (Shift+Tab hai lần) rồi dán `prompts/prompt-02-mot-task.md`, thay `NN-slug`. Task đầu tiên dùng `prompts/prompt-01-khoi-tao.md`.
2. Đọc kế hoạch, sửa nếu cần, duyệt. Claude lưu kế hoạch vào `plan.md` và tạo nhánh `feat/NN-slug`.
3. Claude làm từng bước, chạy "Kiểm tra", cập nhật `progress.md`, đề xuất commit rồi DỪNG. Bạn xem, đồng ý commit, gõ `continue`.
4. Xong task: Claude đổi trạng thái thành ✅ trong `docs/tasks/README.md`. Bạn merge nhánh.

Xem tổng thể: `pnpm tasks:dashboard` rồi mở `docs/tasks/dashboard.html`.

## 4. Khi thiết kế thay đổi
Sửa trên Claude Design, tải về chép đè `designs/`, chạy `node scripts/design-system.mjs` để sinh lại `docs/DESIGN_SYSTEM.md`. Màn chưa có thiết kế: dán Prompt 2 ở `docs/PRD.md` Phần J vào Claude Design.
