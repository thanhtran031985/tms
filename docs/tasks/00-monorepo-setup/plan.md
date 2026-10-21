# Kế hoạch task 00-monorepo-setup — Monorepo, CI và môi trường

## Bối cảnh
Repo `D:\tms` hiện chỉ có tài liệu (`docs/`, `designs/`, `prompts/`, `scripts/`, `.claude/`), chưa có mã. Task 00 dựng nền để các task sau chỉ việc thêm module: pnpm workspace 5 package, Docker Compose (MariaDB, Redis, MinIO), kết nối Drizzle/Redis/S3, Vitest + Testcontainers, Next.js nạp token Design System, worker BullMQ, CI GitHub Actions, lệnh dashboard.
Làm đúng 8 bước trong `docs/tasks/00-monorepo-setup/task.md`, dừng chờ "continue" sau mỗi bước, test viết trước (Bước 3, Bước 4 e2e).

Môi trường đã kiểm tra: Node v25.2.1 (không phải LTS), pnpm 12.10.1, Docker 29.6.1, Git 2.52. Nhánh `main` đã đẩy lên `github.com/thanhtran031985/tms` (repo public, 2 commit). Sau khi duyệt: lưu kế hoạch nguyên văn vào `plan.md`, tạo nhánh `feat/00-monorepo-setup`, README đổi sang 🔄.

## Lựa chọn kỹ thuật (ghi vào decisions.md)
- **Node:** `.nvmrc` và `engines` ghi Node 24 LTS (máy đang chạy 25, chỉ cảnh báo). **pnpm:** `packageManager` ghi đúng bản đang cài (12.10.1).
- **Tailwind v4** (CSS-first): `@theme inline { --color-bg: var(--bg); … }` đọc thẳng biến CSS nên chế độ Tối chạy theo `data-theme`. Không dùng màu mặc định của Tailwind. Tên tiện ích khớp DESIGN_SYSTEM.md (`bg-surface`, `text-ink-soft`, `rounded-card`, `p-12`…).
- **Next.js 15 + React 19**, build bằng webpack hoặc Turbopack tùy cái nào đọc được `designs/` ngoài thư mục app; đặt `turbopack.root` / `outputFileTracingRoot` về gốc repo. `globals.css` `@import` trực tiếp `designs/tokens.css`, không chép.
- **Logo:** `designs/assets/Logos/tms-mark.svg` nằm ngoài `apps/web`. Dùng script `predev`/`prebuild` chép nguyên bản sang `apps/web/public/` (đã `.gitignore`), không sửa nội dung. Nếu Next import SVG ngoài root chạy ổn thì bỏ script này.
- **Font:** `next/font/google` (Fira Sans 400/500/600/700, Fira Code 500), gán `--font-ui`/`--font-mono`. `designs/components/bundle.css` có dòng `@import` Google Fonts nhưng ta không dùng file đó ở Bước này.
- **Kiểu chữ:** `tokens.css` chưa có biến cỡ chữ (chỉ có bảng ở DESIGN_SYSTEM.md mục 3). Đọc `designs/tokens.json`; nếu thiếu thì thêm tiện ích `text-body`, `text-screen-title`… vào `@theme` và liệt kê trong báo cáo.
- **Alias:** `@shared/*`, `@core/*` trong `tsconfig.base.json`; tên package không scope (`web`, `worker`, `driver-app`, `shared`, `core`).
- **Test:** Vitest workspace tách `*.test.ts` (đơn vị) và `*.int.test.ts` (Testcontainers, timeout dài); Playwright ở `apps/web`.
- **Thời gian/tiền:** mysql2 `timezone: 'Z'` + `SET time_zone = '+00:00'`; `lib/money` bằng decimal.js trả `Decimal` hoặc chuỗi, không `number`; `toTenantDate` dùng `Intl` với `Asia/Ho_Chi_Minh`.
- **Hạ tầng dev:** MariaDB LTS (11.4), Redis 7 `--appendonly yes`, MinIO với bucket dev bật versioning (container `mc` khởi tạo một lần).
- **Seed:** khung idempotent, chưa có dữ liệu nghiệp vụ.

## Package cần cài (xin duyệt cùng kế hoạch)
Đã nằm trong Stack hoặc task.md: next, react, react-dom, typescript, tailwindcss, shadcn/ui (+ class-variance-authority, clsx, tailwind-merge, lucide-react), drizzle-orm, drizzle-kit, mysql2, ioredis, bullmq, decimal.js, zod, vitest, @testcontainers/mariadb + testcontainers (Redis dùng GenericContainer), @playwright/test, eslint (flat) + typescript-eslint + eslint-config-next, prettier, expo (khung), pino, @aws-sdk/client-s3 + @aws-sdk/s3-request-presigner.
**Ngoài danh sách Stack, cần anh/chị đồng ý:** `tsx` (chạy script TS: seed, worker dev), `@types/node`. Không cài `dotenv` (dùng `node --env-file`), không cài `concurrently` (dùng `pnpm -r --parallel`). Thư viện chưa dùng ở task này (dnd-kit, TanStack Table, Auth.js/better-auth, fast-check) KHÔNG cài.

## Các bước
1. **Workspace + TS strict.** `package.json` gốc, `pnpm-workspace.yaml`, `tsconfig.base.json` (strict, `noUncheckedIndexedAccess`), `.nvmrc`, `.editorconfig`, `.gitignore` (viết lại đầy đủ, giữ các mục hiện có), `.env.example`; 5 package khung; ESLint flat + Prettier; luật `no-restricted-imports` cho `packages/core/modules/**`; script gốc `typecheck/lint/format/build`.
   Kiểm tra: `pnpm install`, `typecheck`, `lint` mã 0; file thử trong `modules/` import `db` thô bị lint chặn rồi xóa.
2. **Docker + kết nối + migration.** `docker-compose.yml`; `lib/db/client.ts`, `schema/_helpers.ts`, `schema/index.ts` (rỗng, re-export), `shared/enums.ts` đúng 5 mảng spec 02; `drizzle.config.ts`; `lib/redis/client.ts`, `lib/storage/s3.ts`; script `db:generate/migrate/seed`.
   Kiểm tra: 3 dịch vụ healthy, `db:migrate` hai lần mã 0, `db:seed` mã 0, `redis-cli ping` = PONG, `appendonly` = yes, thấy bucket dev trên console MinIO. Lưu ý: chưa có bảng nghiệp vụ nên `generate` có thể không sinh SQL; kiểm tra bảng `__drizzle_migrations` được tạo và lệnh chạy được trên DB trống/có dữ liệu.
3. **Vitest + Testcontainers.** Viết `money.test.ts`, `time.test.ts` trước (đỏ), rồi `lib/money`, `lib/time` (xanh); `test/containers.ts`; `smoke.int.test.ts`; `vitest.workspace.ts`.
   Kiểm tra: `pnpm test --filter core -- money` đỏ rồi xanh; `pnpm test` xanh khi Compose đang tắt.
4. **apps/web.** Route group `(auth)`, `(tenant)`; trang `/` có logo và chữ "TMS Container"; `globals.css` + `@theme`; font; khởi tạo shadcn/ui lấy màu từ token; viết `e2e/smoke.spec.ts` trước (đỏ), rồi trang cho xanh (1440×900, font Fira Sans, nền = `--bg`).
   Kiểm tra: dev mở được, `data-theme="dark"` đổi màu, `pnpm e2e` xanh, `grep` không ra mã hex tự đặt trong `apps/web/src`.
5. **worker + driver-app + `pnpm dev`.** Worker pino JSON, hàng đợi `system.heartbeat` 60 giây, retry/backoff, giữ job lỗi, tắt êm SIGINT/SIGTERM; khung Expo typecheck được; `pnpm dev` chạy web + worker song song.
   Kiểm tra: log "worker ready" và heartbeat, Ctrl+C dừng sạch, `driver-app typecheck` mã 0.
6. **CI.** `.github/workflows/ci.yml`: typecheck, lint, test, build; job migration với MariaDB tạm (chạy hai lần + seed); `pnpm audit --prod` (mức cao làm đỏ); cache pnpm. Kiểm tra cần đẩy nhánh lên GitHub và quan sát Actions (anh/chị mở tab Actions hoặc cho phép `gh` đăng nhập); `gh` hiện chưa đăng nhập.
7. **Dashboard + CLAUDE.md.** Thêm `tasks:dashboard`, điền mục "Lệnh thường dùng"; chạy thử, mở `dashboard.html` kiểm tra dòng 00.
8. **Hoàn tất.** Chạy đủ typecheck/lint/test/build/e2e/migrate/seed; cập nhật progress.md, README (✅), decisions.md (phiên bản và lựa chọn).

Mỗi bước kết thúc: cập nhật progress.md, `pnpm tasks:dashboard` (từ Bước 7 trở đi; trước đó chạy `node scripts/tasks-dashboard.mjs`), báo cáo ngắn, đề xuất commit `00-monorepo-setup: step N — …`, DỪNG chờ "continue".

## Rủi ro và việc anh/chị làm thủ công
- Bước 6 cần đẩy nhánh và xem CI; thêm test sai tạm để thấy đỏ rồi gỡ.
- Nếu Docker Desktop chưa chạy, Bước 2 và 3 sẽ báo lỗi: bật Docker Desktop trước.
- Nếu `.env` thiếu biến, tôi chỉ thêm vào `.env.example` và nhờ anh/chị điền; không đọc `.env`.
- Thiết kế chưa có biến cỡ chữ và có thể thiếu token: ghi trong báo cáo Bước 4.
- Quyết định sau khi làm có thể khiến spec cũ sai (vd. Next/Tailwind phiên bản) sẽ nêu trong báo cáo.

## Kiểm tra cuối
`pnpm typecheck`, `lint`, `test`, `build`, `e2e` đều mã 0; `docker compose up -d` rồi `pnpm dev` chạy web + worker; `db:migrate` chạy được trên DB trống và có dữ liệu; CI xanh với 1 test mẫu.
