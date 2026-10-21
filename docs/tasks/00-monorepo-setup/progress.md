# Tiến độ 00-monorepo-setup

Trạng thái: ⬜ chưa làm · 🔄 đang làm · ❓ có code chưa rà soát · ⚠️ khác task.md · ❌ thiếu · ✅ xong

| Bước | Nội dung | Trạng thái | Commit |
|---|---|---|---|
| 1 | Khởi tạo pnpm workspace và TypeScript strict | ✅ | |
| 2 | Docker Compose, kết nối DB/Redis/S3 và lệnh migration | ✅ | |
| 3 | Vitest, Testcontainers và test mẫu | ✅ | |
| 4 | apps/web: Next.js, token, font, Tailwind và Playwright | ✅ | |
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

### Bước 2 — 21/10/2026
Đã làm: `docker-compose.yml` (MariaDB 11.4 utf8mb4, Redis 7 AOF, MinIO + hai container một lần tạo bucket `tms-dev` và bật versioning); `packages/shared/enums.ts` (5 mảng đúng spec 02); `packages/core/lib/db/{client,migrate,seed}.ts`, `schema/_helpers.ts`, `schema/index.ts` (rỗng), `drizzle.config.ts`, `migrations/meta/_journal.json` (do drizzle-kit sinh); `lib/redis/client.ts` (quy ước key `t:{tenantId}:…` ghi đầu file); `lib/storage/s3.ts` (client, `tenantObjectKey`, Signed URL tải lên/xuống); `lib/env.ts`; `.gitattributes` (eol=lf); script `db:generate`, `db:migrate`, `db:seed` ở gốc và `core`.
Kiểm tra (chạy với `DATABASE_URL` đặt trực tiếp ở dòng lệnh):
- `docker compose up -d`: mariadb và redis `healthy`; minio chạy, hai container tạo bucket thoát mã 0 ("Bucket created", "versioning is enabled").
- `pnpm db:generate`: "No schema changes", mã 0.
- `pnpm db:migrate` lần 1 và lần 2: mã 0; bảng `__drizzle_migrations` có trong DB; `@@time_zone` = +00:00.
- `pnpm db:seed`: mã 0 (0 seeder, khung chạy lại được).
- `redis-cli ping` = PONG, `CONFIG GET appendonly` = yes.
- Console MinIO http://localhost:9001 trả 200; `mc ls` thấy bucket `tms-dev`.
- `pnpm typecheck`, `pnpm lint`, `pnpm format:check`: sạch.
Việc anh/chị cần làm thủ công: file `.env` của anh/chị hiện chỉ có `DATABASE_URL` (tôi chỉ liệt kê tên biến, không đọc giá trị). Hãy cập nhật theo `.env.example`: cổng MariaDB của Compose là **3307** vì XAMPP MySQL đang chiếm 3306, và thêm các biến `REDIS_URL`, `S3_*`, `MINIO_*`, `MARIADB_*`.

### Bước 3 — 21/10/2026
Đã làm: viết `lib/money/money.test.ts` (7 test) và `lib/time/time.test.ts` (5 test) trước, thấy đỏ, rồi viết `lib/money/index.ts` (`toMoney`, `add`, `sub`, `mul`, `div`, `roundToDong`, `toDbString`; từ chối `number`, chia 0 báo lỗi) và `lib/time/index.ts` (`toTenantDate`, mặc định `Asia/Ho_Chi_Minh`); `test/containers.ts` (`startTestInfra`: MariaDB 11.4 + Redis 7 qua Testcontainers, chạy migration, trả db/pool/redis/stop); `test/smoke.int.test.ts` (4 test: SELECT 1, múi giờ +00:00, bảng `__drizzle_migrations`, PING); `packages/core/vitest.config.ts` với hai project `unit` và `int`; `scripts/test.mjs` để `pnpm test --filter core -- money` hoạt động.
Kiểm tra:
- `pnpm test --filter core -- money`: đỏ (5/7 test hỏng, `add is not a function`) trước khi có code, xanh sau khi có code.
- `pnpm test`: 3 file, 16 test xanh; chạy lại khi `docker compose stop` (không có container nào của Compose) vẫn xanh, 16 giây.
- `pnpm typecheck`, `pnpm lint`, `pnpm format:check`: sạch.
Việc anh/chị cần làm thủ công: không có.

### Bước 4 — 21/10/2026
Đã làm: viết `apps/web/e2e/smoke.spec.ts` trước (2 test: trang `/` ở 1440×900 có heading "TMS Container", font body có "Fira Sans" và đã nạp, nền body bằng `--bg`; đặt `data-theme="dark"` thì nền đổi), thấy đỏ (không có app), rồi dựng Next.js 16.4 + React 19: `next.config.ts` (`turbopack.root` và `outputFileTracingRoot` về gốc repo), `postcss.config.mjs`, `tsconfig.json`, route group `(auth)/login` và `(tenant)/home` có trang giữ chỗ, trang `/` có logo + chữ "TMS Container"; `globals.css` nạp thẳng `designs/tokens.css` và ánh xạ token sang Tailwind v4 bằng `@theme inline` (màu, khoảng cách `p-12`, bo góc, bóng, kích thước, 13 kiểu chữ + font); logo vẽ nội tuyến bằng token (`components/brand/tms-mark.tsx`); `components.json` của shadcn/ui, `lib/utils.ts` (`cn`), thư mục `components/ui` và `features`; Playwright (`playwright.config.ts`, cổng 3100, Chromium); ESLint thêm `eslint-config-next` cho `apps/web`; `scripts/fetch-fonts.mjs` + `public/fonts/*.woff2` + `fonts.css`.
Kiểm tra:
- `pnpm e2e`: 2 test xanh (sau khi đỏ ban đầu).
- Trang `/` chạy 200 ở 1440×900, đổi `data-theme="dark"` đổi màu nền theo token Tối (test tự động).
- CSS sinh ra dùng biến token (vd. `.gap-10 { gap: var(--space-10) }`, `.bg-bg { background-color: var(--bg) }`).
- `grep -rnE "#[0-9a-fA-F]{3,8}" apps/web/src`: không có kết quả.
- `pnpm --filter web build` (Turbopack) thành công, 4 route tĩnh; `pnpm typecheck`, `pnpm lint`, `pnpm format:check`: sạch.
Token đã thêm vào theme (CLAUDE.md yêu cầu liệt kê): `tokens.css` chưa có biến cỡ chữ nên thêm 13 kiểu `--text-*` (hero-title, screen-title, kpi-figure, section-title, body, body-sm, label, button, small, caption, chip, chip-sm, code) lấy đúng cỡ, dòng, độ đậm từ `designs/tokens.json`; ánh xạ thêm tên shadcn/ui (`--color-background`, `--color-foreground`, `--color-border`, `--color-ring`…) về token có sẵn.
Việc anh/chị cần làm thủ công: không có.
