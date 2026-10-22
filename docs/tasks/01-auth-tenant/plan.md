# Kế hoạch task 01-auth-tenant — Đăng nhập, tenant và phân quyền

## Bối cảnh
Task 00 đã có nền (monorepo, Docker, Drizzle, Vitest/Testcontainers, Next 16 + token, worker). Task 01 dựng lớp danh tính và cách ly dữ liệu mà mọi task sau dựa vào: 5 bảng identity, `getTenantDb`, `requireRole` + ma trận quyền, `Result`/mã lỗi, audit trong transaction, `nextNumber`, đăng nhập + chọn/đổi công ty + khóa 5 lần/15 phút, proxy chặn route `(tenant)`, màn Screen01-Login, TenantPicker, khung AppShell.
Làm đúng 8 bước trong `docs/tasks/01-auth-tenant/task.md`, test viết trước, dừng chờ "continue" sau mỗi bước.

Môi trường: nhánh `feat/00-monorepo-setup` chưa merge vào `main`. Đã chọn: tạo `feat/01-auth-tenant` **từ `feat/00-monorepo-setup`**, thư viện xác thực **Auth.js v5 Credentials** (`next-auth@5.0.0-beta.32`, peer hỗ trợ Next 16).
Sau khi duyệt: lưu kế hoạch nguyên văn vào `docs/tasks/01-auth-tenant/plan.md`, tạo nhánh, README dòng 01 đổi sang 🔄.

## Lựa chọn kỹ thuật (ghi vào decisions.md)
- **Auth.js, `session: { strategy: 'jwt' }`.** JWT chứa `userId`, `tenantId?`, `rememberMe`, `expiresAt`. `role` KHÔNG tin từ JWT: `requireRole` nạp lại membership từ DB ở mỗi request (đổi vai trò, vô hiệu user có hiệu lực ngay) rồi trả `ctx`. Cấu hình tách đôi theo khuyến nghị Auth.js: `apps/web/src/auth.config.ts` (nhẹ, dùng cho proxy) và `apps/web/src/auth.ts` (Credentials + DB).
- **Đăng nhập chi tiết lỗi:** Server Action `login` gọi `authService.authenticate()` TRƯỚC để có `INVALID_CREDENTIALS` kèm số lần còn lại hoặc `ACCOUNT_LOCKED` kèm giờ mở khóa (Auth.js không chuyển được chi tiết này), chỉ khi `ok` mới `signIn('credentials')`; `authorize()` gọi lại cùng service (hai lần băm argon2, chấp nhận). Đăng nhập đúng đặt lại bộ đếm.
- **Chọn tenant:** `selectTenant`/`switchTenant` kiểm tra membership bằng DB rồi gọi `unstable_update({ tenantId })`; callback `jwt` khi `trigger === 'update'` kiểm tra lại membership một lần nữa nên client giả mạo cũng không chọn được tenant không thuộc mình.
- **"Ghi nhớ 30 ngày":** `maxAge` cookie 30 ngày; `expiresAt` trong JWT = 30 ngày nếu tích, 12 giờ nếu không; callback `jwt` trả `null` khi quá `expiresAt`.
- **Email hoặc SĐT:** một ô "Email hoặc số điện thoại"; chuẩn hóa: có `@` thì email viết thường, ngược lại SĐT bỏ khoảng trắng/dấu, `+84`/`84` đổi thành `0`. Lưu `users.phone` đã chuẩn hóa.
- **Băm mật khẩu:** `@node-rs/argon2` (có binary dựng sẵn, không cần script build nên khớp `allowBuilds`).
- **Proxy:** Next 16 đổi tên `middleware.ts` thành `proxy.ts`; dùng `apps/web/src/proxy.ts` (kiểm tra tài liệu trong `node_modules/next/dist/docs` khi làm; nếu `middleware.ts` vẫn được hỗ trợ không cảnh báo thì ghi lại lựa chọn). Chỉ kiểm tra có JWT hợp lệ và `tenantId`; phân quyền thật ở `requireRole`.
- **`getTenantDb(ctx)`** (`packages/core/lib/db/tenant-db.ts`): đối tượng có `select/insert/update/delete/transaction` nhận bảng có cột `tenantId`; tự thêm `eq(table.tenantId, ctx.tenantId)` vào SELECT/UPDATE/DELETE, INSERT luôn ghi đè `tenantId = ctx.tenantId` (bỏ giá trị từ input), sinh UUIDv7 (`lib/id.ts`, tự viết, không cài thêm). Bảng toàn cục (`users`, `tenants`, `tenant_memberships`) đi qua `lib/db/system-db.ts` chỉ cho `modules/identity/**`; thêm luật ESLint chặn `system-db` ở module khác.
- **`nextNumber`:** một câu `INSERT … ON DUPLICATE KEY UPDATE last_value = LAST_INSERT_ID(last_value + 1)` trong transaction của người gọi (khóa dòng tới commit, rollback hoàn số), tránh deadlock gap-lock của `INSERT IGNORE` + `SELECT FOR UPDATE` khi 50 giao dịch song song; kết quả từ `LAST_INSERT_ID()`. Test 50 song song × 5 lần quyết định; nếu vẫn deadlock thì thêm retry và ghi decisions.md.
- **Schema bổ sung (sửa spec 02 + decisions.md):** `users.failed_login_count INT NOT NULL DEFAULT 0`, `users.locked_until DATETIME(3) NULL` (theo task.md); thêm `tenant_memberships.last_login_at DATETIME(3) NULL` để TenantPicker sắp theo "lần đăng nhập gần nhất" và ghi "Chưa đăng nhập lần nào" (spec 02 chưa có cột này).
- **Giao diện:** component React dựng theo `designs/components/*` bằng class token: `Button`, `Field`, `Alert`, `EmptyState`, `Pill`/`Badge` (StatusChip), `TenantPicker`, `AppShell` trong `apps/web/src/components/ui/`. Giao diện sáng/tối đổi bằng cookie `tms-theme` đọc ở `RootLayout` (không nháy), nút đổi theme là Server Action.
- **Route:** bỏ `app/page.tsx` giữ chỗ của task 00 và `(tenant)/home`; trang chủ là `(tenant)/page.tsx` ở `/` (chỉ H1 giữ chỗ). `/login`, `/select-tenant` trong `(auth)`. E2E `smoke.spec.ts` của task 00 chuyển sang `/login` (có logo + "TMS Container").
- **Menu phân hệ chưa làm:** hiện đủ mục theo thiết kế nhưng `aria-disabled="true"`, không điều hướng, có `title="Chưa có trang"`; chỉ "Trang chủ" là liên kết thật. Không hiện `tms-badge` số việc (chưa có dữ liệu).
- **Quên mật khẩu:** giữ liên kết, chưa làm chức năng (ghi decisions.md và hỏi người dùng sau, theo task.md). Cột giới thiệu có nội dung tĩnh lấy từ `Screen01-Login/preview.html`.
- **Ma trận quyền** khởi điểm theo PRD A4 trong `modules/identity/permissions.ts` (khóa theo hành động, ví dụ `identity.manageUsers`, `pricing.editActive`; chỉ các hành động đã rõ ở A4, thêm dần). `DRIVER` bị chặn khỏi web.
- **Test dùng chung:** mở rộng `packages/core/test/containers.ts` để có helper dựng 2 tenant mẫu; test tích hợp mỗi file tự dựng MariaDB + Redis như task 00.

## Package cần cài (xin duyệt cùng kế hoạch)
`next-auth@beta` (Auth.js v5), `@node-rs/argon2` (cho `core`), `zod` (đã nằm trong Stack, cho `shared` và `web`). Không thêm thư viện form hay UI khác; `lucide-react`, `clsx`, `tailwind-merge`, `class-variance-authority` đã có từ task 00. Biến môi trường mới trong `.env.example` (anh/chị điền vào `.env`): `AUTH_SECRET`, `AUTH_TRUST_HOST`, `SEED_DEV_PASSWORD`.

## Các bước
1. **Schema identity + migration + seed.** `schema/identity.ts` (5 bảng đúng spec 02 + 3 cột bổ sung), re-export trong `schema/index.ts`; `pnpm db:generate`, review SQL (utf8mb4, `DATETIME(3)`, unique `uq_users_email`/`uq_users_phone`/`uq_membership`, PK kép `number_sequences`); seed idempotent bằng UUID cố định: 2 tenant ("Vận tải Phúc An", "Logistics Sao Việt"), mỗi role một user ở tenant 1, `hung.dv@phucan.vn` (DISPATCHER) thuộc cả 2 tenant, một user không có tenant, user riêng cho e2e khóa tài khoản; mật khẩu băm từ `SEED_DEV_PASSWORD`. Cần viết hàm băm ở đây (`modules/identity/password.ts`) nên cài argon2 từ bước này.
   Kiểm tra: migrate trên DB trống và trên DB đã có `__drizzle_migrations` của task 00; seed hai lần không trùng; `SELECT COUNT(*) FROM tenant_memberships` đúng số dòng seed.
2. **Tenant guard + test tenant isolation.** Viết `tenant-db.int.test.ts` trước (A không thấy/sửa/xóa dữ liệu B; INSERT bỏ `tenantId` từ input), rồi `tenant-db.ts`, `system-db.ts`, `lib/id.ts`, `modules/identity/repo.ts` và repo `audit_logs`; luật ESLint cho `system-db`.
   Kiểm tra: `pnpm test --filter core -- tenant` đỏ rồi xanh.
3. **requireRole, quyền, Result, mã lỗi, audit.** Test trước: `VIEWER` ghi bị `FORBIDDEN`; zod sai trả `VALIDATION_ERROR` không mở transaction; lỗi giữa transaction rollback cả `audit_logs`. Viết `shared/result.ts`, `shared/errors.ts` (8 mã + thông báo tiếng Việt), `shared/schemas`, `permissions.ts`, `lib/audit`, `apps/web/src/server/{require-role,define-action}.ts`.
   Kiểm tra: `pnpm test --filter core -- permissions`, `pnpm test --filter web -- require-role` xanh (thêm Vitest cho `web`).
4. **nextNumber.** Test `numbering.int.test.ts` trước (50 song song liên tiếp 1..50; khác key và khác tenant đếm riêng), rồi `numbering.ts`.
   Kiểm tra: chạy 5 lần liên tiếp không trùng, không deadlock.
5. **Dịch vụ đăng nhập, session, proxy.** Test `auth.service.test.ts` trước (đúng/sai/khóa 5 lần/đang khóa/không có tenant/1 tenant vào thẳng/nhiều tenant phải chọn/chọn tenant của người khác bị `FORBIDDEN`); rồi `auth.service.ts`, `schema.ts` (zod), cấu hình Auth.js, Server Action `login/selectTenant/switchTenant/logout` trong `features/identity/actions.ts`, `proxy.ts` chuyển về `/login?next=…` hoặc `/select-tenant`.
   Kiểm tra: `pnpm test --filter core -- auth` xanh; `curl -I http://localhost:3000/dispatch` chưa đăng nhập trả 307 về `/login?next=/dispatch`.
6. **Màn đăng nhập + chọn công ty.** Đọc `Screen01-Login/preview.html` và `bundle.css` để khớp bố cục; component `Button`, `Field` (nút mắt `aria-pressed`, lỗi `aria-describedby`), `Alert`, `EmptyState`, `TenantPicker`; đủ 4 trạng thái; E2E `login.spec.ts` (global setup chạy migrate + seed): 1 tenant vào thẳng, `hung.dv` chọn công ty, sai 5 lần thấy "Thử lại sau HH:MM", user không có tenant thấy trạng thái Trống. CI job e2e thêm dịch vụ MariaDB + migrate + seed.
   Kiểm tra: so `/login` với preview ở 1440×900 cả sáng/tối; `pnpm e2e -- login` xanh.
7. **Khung AppShell.** `(tenant)/layout.tsx`, thanh bên 240px, thanh trên (đổi công ty mở TenantPicker, ô tìm có phím `/`, chấm "Trực tiếp", đổi theme, tên + vai trò), màn ≤ 640px thành dải trên; E2E `shell.spec.ts` (đổi công ty đổi tên + vai trò; thứ tự Tab thanh bên → thanh trên → H1).
   Kiểm tra: khớp `Screen02-Home/preview.html` phần khung ở 1440×900 và 1366×768; focus 3px thấy rõ ở cả hai theme.
8. **Hoàn tất.** Sửa spec 02 (3 cột mới), progress.md, README (✅), decisions.md; chạy `typecheck`, `lint`, `test`, `build`, `e2e`; migrate trên DB trống và DB có dữ liệu; rà mọi Server Action mới có `requireRole` + zod, mọi repo mới có test tenant isolation.

Mỗi bước kết thúc: cập nhật progress.md, `pnpm tasks:dashboard`, báo cáo ngắn, đề xuất commit `01-auth-tenant: step N — …`, DỪNG chờ "continue".

## Rủi ro và việc anh/chị làm thủ công
- `next-auth` v5 vẫn là bản beta; ghim đúng `5.0.0-beta.32`. Nếu `unstable_update` hay Credentials hỏng với Next 16, dừng và hỏi (phương án dự phòng: better-auth).
- E2E và `pnpm dev` cần Docker (MariaDB cổng 3307) đang chạy; `.env` của anh/chị phải có `DATABASE_URL`, `AUTH_SECRET`, `SEED_DEV_PASSWORD` (xem `.env.example`). Tôi không đọc `.env`; khi chạy tay tôi truyền biến trên dòng lệnh.
- Mật khẩu seed chỉ dùng cho dev; không đưa vào repo.
- Quên mật khẩu chưa làm: cần anh/chị quyết định có thêm ticket hay không.
- Thiết kế chỉ có ô "Email"; ô nhận email hoặc SĐT, nhãn và gợi ý chỉnh (ghi decisions.md).

## Kiểm tra cuối
`pnpm typecheck`, `lint`, `test`, `build`, `e2e` mã 0; test chứng minh user Tenant A không đọc được dữ liệu Tenant B; `VIEWER` gọi action ghi bị từ chối; sinh số chứng từ song song 50 lần không trùng; luồng đăng nhập, chọn công ty, đổi công ty chạy trên trình duyệt; CI xanh.
