# Tiến độ 00-monorepo-setup

Trạng thái: ⬜ chưa làm · 🔄 đang làm · ❓ có code chưa rà soát · ⚠️ khác task.md · ❌ thiếu · ✅ xong

| Bước | Nội dung | Trạng thái | Commit |
|---|---|---|---|
| 1 | Khởi tạo pnpm workspace và TypeScript strict | ✅ | |
| 2 | Docker Compose, kết nối DB/Redis/S3 và lệnh migration | ⬜ | |
| 3 | Vitest, Testcontainers và test mẫu | ⬜ | |
| 4 | apps/web: Next.js, token, font, Tailwind và Playwright | ⬜ | |
| 5 | apps/worker, apps/driver-app và lệnh pnpm dev | ⬜ | |
| 6 | CI GitHub Actions | ⬜ | |
| 7 | Lệnh dashboard tiến độ và mục Lệnh thường dùng | ⬜ | |
| 8 | Hoàn tất | ⬜ | |

## Nhật ký
<!-- Sau mỗi bước: ngày, đã làm gì, kết quả Kiểm tra, việc người dùng cần làm thủ công. -->

### Bước 1 — 21/10/2026
Đã làm: `package.json` gốc (`packageManager` pnpm@12.10.1, `engines` node >=24), `pnpm-workspace.yaml`, `tsconfig.base.json` (strict, `noUncheckedIndexedAccess`, alias `@shared/*` và `@core/*`), `.nvmrc` (24), `.editorconfig`, `.gitignore` (viết lại đầy đủ), `.env.example`, Prettier, ESLint flat config với luật `no-restricted-imports` cho `packages/core/modules/**`; 5 package khung `web`, `worker`, `driver-app`, `shared`, `core` (mỗi package có `package.json`, `tsconfig.json`, một file `export {}` giữ chỗ).
Kiểm tra:
- `pnpm install`: không lỗi, `pnpm peers check` không còn cảnh báo.
- `pnpm typecheck`: mã 0 trên cả 5 package.
- `pnpm lint`: mã 0; thử file `packages/core/modules/_tmp/bad.ts` import `../../lib/db/client` thì lint báo lỗi `no-restricted-imports` (mã 1), đã xóa file thử, lint lại mã 0.
- `pnpm format:check`: sạch.
Việc cần làm thủ công: không có.
