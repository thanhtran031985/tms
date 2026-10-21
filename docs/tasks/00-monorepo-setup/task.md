# 00-monorepo-setup — Monorepo, CI và môi trường

> Giai đoạn: GĐ0 · Phụ thuộc: không có · Nhánh git: `feat/00-monorepo-setup`
> Nguồn: `docs/specs/07_implementation_tickets.md` TICKET-00 và Definition of Done chung; spec `00_system_overview_and_adrs.md` mục 2 (ADR-001, ADR-002, ADR-007, ADR-008); spec `01_core_architecture_and_grill_logs.md` mục 1 và mục 2 (cấu trúc thư mục); spec `02_database_schema.md` mục 1 và đoạn `enums.ts`, `_helpers.ts`; spec `08_nonfunctional_security_ops.md` mục 2 (dependency scanning), mục 3 (migration, Redis AOF, versioning object storage), mục 4 (log có cấu trúc); `prompts/prompt-01-khoi-tao.md`; PRD `docs/PRD.md` mục H1, H2, B

## Mục tiêu
Sau task này, lập trình viên clone repo, chạy `docker compose up -d` rồi `pnpm dev` là có web Next.js và worker BullMQ cùng chạy trên máy, nối được MariaDB, Redis và MinIO. Mỗi lần đẩy code, CI tự chạy typecheck, lint, test, build và migration trên DB tạm, báo xanh hoặc đỏ. Giao diện web đã nạp sẵn token và font của Design System để các task sau chỉ việc dựng màn.

## Phạm vi
**Làm:**
- pnpm workspace gồm `apps/web` (Next.js App Router, React 19), `apps/worker` (Node + BullMQ), `apps/driver-app` (khung Expo trống), `packages/shared`, `packages/core`; TypeScript strict, ESLint, Prettier.
- Docker Compose cho MariaDB, Redis, MinIO (S3) dùng khi dev.
- Kết nối DB bằng Drizzle (`packages/core/lib/db`), Redis (`lib/redis`), S3 (`lib/storage`), cấu hình drizzle-kit, thư mục migration, lệnh `db:migrate` và `db:seed` (seed rỗng có khung).
- `packages/shared/enums.ts` và `packages/core/lib/db/schema/_helpers.ts` đúng như spec 02 (chưa tạo bảng nghiệp vụ nào).
- Helper `lib/money` (decimal.js) và `lib/time` (`toTenantDate`) làm đối tượng cho test mẫu.
- Vitest + Testcontainers (MariaDB, Redis) ở `packages/core`; Playwright cài cho `apps/web` với 1 test mẫu.
- `apps/web` nạp `designs/tokens.css` làm CSS variables, đưa token vào Tailwind theme, nạp Fira Sans và Fira Code; khởi tạo shadcn/ui dùng token.
- CI GitHub Actions: typecheck, lint, test, build, chạy migration trên DB tạm, quét lỗ hổng phụ thuộc.
- Script `pnpm tasks:dashboard` gọi `scripts/tasks-dashboard.mjs` có sẵn; điền mục "Lệnh thường dùng" trong CLAUDE.md.

**Không làm (thuộc task khác):**
- Bảng nghiệp vụ, đăng nhập, `getTenantDb`, `requireRole`, audit, `nextNumber` (task 01).
- Khung AppShell và màn đăng nhập (task 01).
- Job nghiệp vụ trong worker (DEM/DET task 18, GPS task 13, OCR task 12, thông báo task 23).
- App tài xế có chức năng (task 10).
- Giám sát, Sentry, backup, môi trường staging/production (task 24).

## Thiết kế
- Không có màn hình. Chỉ nạp nền tảng giao diện: `designs/tokens.css` (sinh từ `designs/tokens.json`, không sửa tay), font Fira Sans 400/500/600/700 và Fira Code 500 (giống dòng `@import` đầu `designs/components/bundle.css`), logo `designs/assets/Logos/tms-mark.svg`.
- Đọc `designs/README.md` mục Màu, Chữ, Khoảng cách và `docs/DESIGN_SYSTEM.md` (nếu có) để ánh xạ token sang Tailwind theme.

## Quyết định kiến trúc
- Cấu trúc thư mục đúng spec 01 mục 2: `apps/web/src/app` chỉ định tuyến, `apps/web/src/features/<module>` chứa view và Server Action, `apps/web/src/components/ui` chứa component dùng chung; `packages/core/modules/<module>/{service,repo,schema}.ts` và `packages/core/lib/{db,redis,storage,ai,audit,time,money}`.
- Tên package không có scope để lệnh lọc ngắn gọn: `web`, `worker`, `driver-app`, `shared`, `core` (ví dụ `pnpm test --filter core -- money`). Đường dẫn import dùng alias `@shared/*` và `@core/*` trong `tsconfig.base.json`, khớp cách viết `@shared/enums` trong spec 02. Ghi lại lựa chọn này trong decisions.md.
- Schema Drizzle tách theo module trong `packages/core/lib/db/schema/*.ts`, re-export từ `schema/index.ts` (spec 02). Enum khai báo mảng `as const` trong `packages/shared/enums.ts`, mỗi cột gọi `mysqlEnum()` mới, không dùng chung instance.
- Thời gian lưu `DATETIME(3)` UTC: kết nối mysql2 đặt `timezone: 'Z'` và `SET time_zone = '+00:00'`; cấm `timestamp()` trong schema (ADR-008). Tiền dùng decimal.js, không dùng `number`.
- Migration chỉ bằng `drizzle-kit generate` rồi review SQL, không dùng `drizzle-kit push` (spec 08 mục 3). Migration phải chạy được trên DB trống và DB đã có dữ liệu.
- Lint chặn import client `db` thô trong `packages/core/modules/**` (luật `no-restricted-imports`), chuẩn bị cho ADR-003 ở task 01.
- Redis bật AOF trong Docker Compose (spec 08 mục 3). MinIO tạo sẵn bucket dev có bật versioning; key file sẽ có tiền tố `tenants/{tenantId}/` (ADR-002).
- Worker là process Node riêng chạy BullMQ (ADR-007); log JSON có cấu trúc (pino hoặc tương đương), sẵn chỗ cho `tenantId`, `userId`, `requestId`, không log dữ liệu cá nhân (spec 08 mục 4).
- Giao diện chỉ dùng token, không tự đặt mã màu; Tailwind theme đọc `var(--…)` để chế độ Tối hoạt động theo `data-theme`.
- Phiên bản: Node LTS (ghi trong `.nvmrc` và `engines`), MariaDB bản LTS, Redis 7. Ghi phiên bản đã chọn vào decisions.md.

## Các bước
### Bước 1 — Khởi tạo pnpm workspace và TypeScript strict
- Tạo `package.json` gốc, `pnpm-workspace.yaml`, `tsconfig.base.json` (strict, `noUncheckedIndexedAccess`, alias `@shared/*`, `@core/*`), `.nvmrc`, `.editorconfig`, `.gitignore`, `.env.example`.
- Tạo khung 5 package: `apps/web`, `apps/worker`, `apps/driver-app`, `packages/shared`, `packages/core`, mỗi package có `package.json` và `tsconfig.json` kế thừa gốc.
- Cấu hình ESLint (flat config) và Prettier dùng chung; luật `no-restricted-imports` cho `packages/core/modules/**`.
- Script gốc: `typecheck`, `lint`, `format`, `build` chạy đệ quy qua workspace.
**Kiểm tra:** `pnpm install` không lỗi; `pnpm typecheck` và `pnpm lint` thoát mã 0 trên cả 5 package; thêm thử một file trong `packages/core/modules/` import client `db` thô thì `pnpm lint` báo lỗi (xóa file sau khi thử).

### Bước 2 — Docker Compose, kết nối DB/Redis/S3 và lệnh migration
- `docker-compose.yml`: MariaDB (volume, healthcheck, charset `utf8mb4`), Redis 7 (`appendonly yes`), MinIO (cổng API và console, tạo bucket dev có versioning).
- `packages/core/lib/db/client.ts` (Drizzle + mysql2, UTC), `lib/db/schema/_helpers.ts` và `schema/index.ts` theo spec 02, `packages/shared/enums.ts` đúng 5 mảng trong spec 02, `drizzle.config.ts`, thư mục `lib/db/migrations/`.
- `lib/redis/client.ts` (quy ước key có tiền tố tenant ghi trong comment đầu file), `lib/storage/s3.ts` (client S3 và hàm tạo Signed URL, chưa dùng).
- Script `db:generate`, `db:migrate`, `db:seed` (seed có khung, chạy lại nhiều lần không sinh trùng).
**Kiểm tra:** `docker compose up -d` cả 3 dịch vụ `healthy`; `pnpm db:migrate` thoát mã 0 trên DB trống và chạy lần hai vẫn thoát mã 0; `pnpm db:seed` thoát mã 0; `docker compose exec redis redis-cli ping` trả `PONG` và `CONFIG GET appendonly` trả `yes`; console MinIO mở được và thấy bucket dev.

### Bước 3 — Vitest, Testcontainers và test mẫu
- Viết test trước: `packages/core/lib/money/money.test.ts` (cộng và chia tiền bằng decimal, làm tròn tới đồng, không trả `number`), `packages/core/lib/time/time.test.ts` (`toTenantDate` cho thời điểm 23:30 UTC ra ngày hôm sau theo `Asia/Ho_Chi_Minh`), chạy thấy đỏ.
- Viết `lib/money/index.ts`, `lib/time/index.ts` cho test xanh.
- Helper `packages/core/test/containers.ts`: khởi động MariaDB và Redis bằng Testcontainers, chạy migration, trả client; dùng chung cho test tích hợp các task sau.
- Test tích hợp mẫu `packages/core/test/smoke.int.test.ts`: `SELECT 1` trên MariaDB và `PING` Redis qua Testcontainers.
- Cấu hình `vitest.workspace.ts`, tách test đơn vị và test tích hợp (`*.int.test.ts`).
**Kiểm tra:** `pnpm test --filter core -- money` đỏ trước khi có code, xanh sau khi code; `pnpm test` chạy cả test đơn vị lẫn test tích hợp Testcontainers, tất cả xanh, không cần MariaDB/Redis của Docker Compose đang chạy.

### Bước 4 — apps/web: Next.js, token, font, Tailwind và Playwright
- Next.js App Router + React 19 trong `apps/web`; route group `src/app/(auth)` và `src/app/(tenant)` có trang giữ chỗ; trang `/` hiện logo `tms-mark.svg` và chữ "TMS Container".
- `src/app/globals.css` nạp `designs/tokens.css` (đọc trực tiếp từ `designs/`, không chép rồi sửa); Tailwind theme ánh xạ màu, cỡ chữ, khoảng cách, bo góc, bóng sang `var(--…)`.
- Font Fira Sans 400/500/600/700 và Fira Code 500 qua `next/font/google`, gán vào `--font-ui` và `--font-mono`; bật `font-variant-numeric: tabular-nums`.
- Khởi tạo shadcn/ui với màu lấy từ token; thư mục `src/components/ui/` có sẵn.
- Cài Playwright, `apps/web/e2e/smoke.spec.ts`: mở `/` ở 1440×900, thấy chữ "TMS Container", `font-family` của `body` có "Fira Sans", nền `body` bằng giá trị `--bg`.
**Kiểm tra:** `pnpm --filter web dev`, mở `http://localhost:3000` trên 1440×900 thấy logo và chữ đúng font; đặt `data-theme="dark"` trên `<html>` thì màu đổi theo token Tối; `pnpm e2e` 1 test xanh; `grep -rnE "#[0-9a-fA-F]{3,8}\b" apps/web/src` không ra mã màu tự đặt.

### Bước 5 — apps/worker, apps/driver-app và lệnh pnpm dev
- `apps/worker/src/index.ts`: nối Redis, đăng ký hàng đợi mẫu `system.heartbeat` chạy lặp mỗi 60 giây, ghi log JSON; tắt êm khi nhận `SIGINT`/`SIGTERM`; cấu hình mặc định retry có backoff và giữ job lỗi (chuẩn bị dead-letter, ADR-007).
- `apps/driver-app`: khung Expo TypeScript trống, typecheck được, không nằm trong `pnpm dev`.
- Script gốc `dev` chạy song song `web` và `worker`.
**Kiểm tra:** `pnpm dev` in ra Next.js sẵn sàng ở cổng 3000 và dòng log JSON "worker ready" rồi log heartbeat; Ctrl+C dừng cả hai không treo; `pnpm --filter driver-app typecheck` thoát mã 0.

### Bước 6 — CI GitHub Actions
- `.github/workflows/ci.yml`: cài pnpm theo `packageManager`, `pnpm install --frozen-lockfile`, rồi `typecheck`, `lint`, `test` (Testcontainers chạy trên runner Ubuntu có Docker), `build`.
- Job migration: dịch vụ MariaDB tạm, chạy `pnpm db:migrate` hai lần (DB trống rồi DB đã migrate) và `pnpm db:seed`.
- Bước quét lỗ hổng phụ thuộc (`pnpm audit --prod` hoặc tương đương), lỗi mức cao làm CI đỏ (spec 08 mục 2).
- Cache pnpm store để CI nhanh.
**Kiểm tra:** đẩy nhánh `feat/00-monorepo-setup`, mọi job CI xanh; thêm tạm một test sai thì CI đỏ đúng ở bước test, gỡ test thì xanh lại.

### Bước 7 — Lệnh dashboard tiến độ và mục Lệnh thường dùng
- Thêm vào `package.json` gốc: `"tasks:dashboard": "node scripts/tasks-dashboard.mjs"` (file đã có sẵn trong bộ khởi động, không viết lại).
- Điền mục "Lệnh thường dùng" trong CLAUDE.md: `pnpm dev`, `pnpm test`, `pnpm test --filter core -- <tên>`, `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm db:generate`, `pnpm db:migrate`, `pnpm db:seed`, `pnpm e2e`, `pnpm tasks:dashboard`, `docker compose up -d`, mỗi lệnh một dòng giải thích.
**Kiểm tra:** `pnpm tasks:dashboard` thoát mã 0 và sinh `docs/tasks/dashboard.html`, mở ra thấy dòng 00-monorepo-setup có thanh tiến độ số bước đọc từ progress.md; mọi lệnh liệt kê trong CLAUDE.md chạy được đúng như mô tả.

### Bước 8 — Hoàn tất
- Chạy toàn bộ kiểm tra, cập nhật progress.md, đổi trạng thái dòng 00 trong `docs/tasks/README.md`, ghi vào decisions.md các phiên bản và lựa chọn đã dùng.
**Kiểm tra:** `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` không lỗi; `pnpm e2e` xanh; `pnpm db:migrate` chạy được trên DB trống và DB đã có dữ liệu, `pnpm db:seed` chạy được; đạt "Chấp nhận khi" của ticket: `pnpm dev` chạy web + worker; CI xanh với 1 test mẫu.
