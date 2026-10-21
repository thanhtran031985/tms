---
description: Vẽ sơ đồ ER database bằng skill archify, hover vào entity hiện tất cả fields của table, xuất ra docs/database-er.html
argument-hint: [all | <nhom-bang, vd: auth | content | progress | rewards>]
---
Vẽ sơ đồ ER (Entity-Relationship) cho database bằng skill archify (https://github.com/tt-a1i/archify) từ $ARGUMENTS (mặc định là `all`).
Mục đích: trực quan hóa toàn bộ cấu trúc bảng, khóa chính, khóa ngoại và quan hệ giữa các bảng trong database; khi hover (rê chuột) vào bất kỳ entity nào sẽ hiện ra đầy đủ tất cả các field của table đó kèm kiểu dữ liệu, ràng buộc và chú thích.

## Chuẩn bị
- Sử dụng skill archify (https://github.com/tt-a1i/archify) đã có trong `.claude/skills/archify/`. Nếu chưa có → DỪNG và báo tôi chạy:
  `npx skills add tt-a1i/archify -g` rồi mở lại Claude Code. KHÔNG tự cài.
- Đọc SKILL.md của archify (`.claude/skills/archify/SKILL.md`) và làm đúng quy trình:
  1. Viết JSON nguồn: `docs/database-er.json`.
  2. Chạy lệnh: `node .claude/skills/archify/bin/archify.mjs finalize architecture docs/database-er.json docs/database-er.html --quality showcase --repo-root . --json`.
  3. Sửa theo biên nhận nếu chưa đạt. Chỉ báo "xong" khi cổng finalize đạt pass.
- Bước kiểm tra trình duyệt của archify cần Chrome hoặc Edge:
  `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe` hoặc `chrome.exe`.
- Nguồn sự thật duy nhất là `prisma/schema.prisma` và các migration trong `prisma/migrations/`.
- Gắn nguồn (file + dòng trong `prisma/schema.prisma`) cho từng entity theo hướng dẫn repository của archify (`--repo-root .`, chế độ `local-only`).
- Nhãn, ghi chú bằng tiếng Việt; giữ nguyên tên model, tên bảng (`@@map`), tên field và kiểu dữ liệu trong code.
- KHÔNG đọc `.env`, KHÔNG cài package mới vào dự án, KHÔNG sửa code ứng dụng hay schema trong lệnh này.

## 1. Trích xuất dữ liệu từ `prisma/schema.prisma`
Đọc toàn bộ file `prisma/schema.prisma`, trích xuất:
- Các Model (Entity): Tên Model PascalCase, tên bảng DB (`@@map`), chú thích `///`.
- Danh sách 100% các Field của từng Model:
  - Tên field trong code & tên cột `@map` trong DB.
  - Kiểu dữ liệu (Int, String, VarChar, DateTime, Boolean, Enum...).
  - Thuộc tính: Khóa chính (`@id`), Khóa ngoại (`@relation`), `@unique`, `@default`, cho phép null (`?`).
  - Ghi chú tiếng Việt lấy từ comment `///`.
- Toàn bộ Quan hệ (Relations): 1-1, 1-n, n-n, khóa ngoại nối từ bảng nào đến bảng nào.
- Phân nhóm (boundaries) theo module chức năng:
  - Tài khoản & Hồ sơ (`users`, `learners`, `manual_unlocks`...)
  - Cây nội dung & Bài học (`grades`, `themes`, `topics`, `lessons`, `vocabularies`...)
  - Tiến độ & Học tập (`learner_progress`, `word_progress`, `review_items`...)
  - Gamification & Phần thưởng (`streaks`, `coin_transactions`, `stickers`, `medals`...)

## 2. Tạo JSON nguồn cho archify (`docs/database-er.json`)
Sử dụng schema `architecture` của archify (`schemas/architecture.schema.json`):
- `meta`:
  - `title`: "Sơ đồ quan hệ thực thể database (ER Diagram)"
  - `locale`: "vi"
  - `quality_profile`: "showcase"
  - `output`: "docs/database-er.html"
  - `repository`: link repo cục bộ (`link_mode: "local-only"`, `url`: repo git hiện tại)
- `components` (từng Entity / Bảng):
  - `id`: tên bảng (`snake_case` từ `@@map`).
  - `type`: `"database"` (hoặc `"security"` cho User/Pin, `"frontend"` cho UI Theme/Avatar).
  - `label`: Tên Model PascalCase (vd: `Learner`).
  - `sublabel`: Tên bảng DB (vd: `bảng learners · 14 fields`).
  - `sources`: Đường dẫn đến dòng bắt đầu của model trong `prisma/schema.prisma`.
- **Cơ chế HOVER hiện tất cả các field của table**:
  - Tích hợp toàn bộ danh sách 100% các field vào cấu trúc dữ liệu hiển thị (kết hợp với Viewer Runtime của archify: `Semantic Lens`, `Semantic Passport` và mục `cards`).
  - Mỗi field được định dạng rõ ràng:
    `[PK/FK/UQ/NULL] <tên_field> (<kiểu_dữ_liệu>): <chú thích>`
  - Đảm bảo khi người dùng rê chuột (hover) vào bất kỳ node bảng nào trên sơ đồ, flyout/tooltip lập tức hiển thị đầy đủ danh sách tất cả các field của bảng đó.
- `boundaries`: Gom các bảng vào các vùng chức năng (Tài khoản, Nội dung, Tiến độ, Phần thưởng).
- `connections`: Vẽ các đường quan hệ nối giữa các bảng:
  - `from`: bảng chứa khóa ngoại.
  - `to`: bảng được tham chiếu.
  - `label`: tên quan hệ / trường liên kết.
  - `variant`: `"emphasis"` cho quan hệ cốt lõi, `"default"` cho quan hệ thông thường.

## 3. Biên dịch và kiểm tra bằng archify (Finalize)
- Chạy lệnh finalize của archify:
  ```bash
  node .claude/skills/archify/bin/archify.mjs finalize architecture docs/database-er.json docs/database-er.html --quality showcase --repo-root . --json
  ```
- Kiểm tra biên nhận trả về (receipt):
  - Phải vượt qua toàn bộ các cổng: `validate`, `deliver`, `check`, và `browser-check` trên Edge/Chrome.
  - Nếu có cảnh báo giao cắt đường nối (crossovers) hoặc kích thước, đọc `references/architecture-layout-repair.md` để sửa tọa độ `pos` trong `docs/database-er.json`, sau đó finalize lại đến khi đạt chuẩn.
- Đảm bảo tính năng hover hiển thị danh sách field hoạt động mượt mà trên tệp HTML đầu ra `docs/database-er.html`.

## 4. Mục lục và Báo cáo
- Cập nhật `docs/so-do/README.md`:
  Thêm dòng: `| [Sơ đồ ER Database](../database-er.html) | architecture (ER) | database | <ngày cập nhật> |`
- Báo cáo kết quả:
  - Tổng số bảng và quan hệ đã trích xuất từ `prisma/schema.prisma`.
  - Kết quả finalize của archify.
  - Đường dẫn mở file: `docs/database-er.html` (kéo thả vào Chrome/Edge; hover vào bảng để xem toàn bộ danh sách fields).
- Không tự commit. Đề xuất commit: `docs: sơ đồ ER database bằng archify`.
