# Tiến độ 01-auth-tenant

Trạng thái: ⬜ chưa làm · 🔄 đang làm · ❓ có code chưa rà soát · ⚠️ khác task.md · ❌ thiếu · ✅ xong

| Bước | Nội dung | Trạng thái | Commit |
|---|---|---|---|
| 1 | Schema identity, migration và seed | ✅ | |
| 2 | Tenant guard và test tenant isolation | ✅ | |
| 3 | requireRole, ma trận quyền, kết quả action, mã lỗi và audit | ✅ | |
| 4 | nextNumber sinh số chứng từ không trùng | ✅ | |
| 5 | Dịch vụ đăng nhập, chọn tenant, session và middleware | ✅ | |
| 6 | Màn đăng nhập và chọn công ty | ✅ | |
| 7 | Khung AppShell | ✅ | |
| 8 | Hoàn tất | ✅ | |

## Nhật ký
<!-- Sau mỗi bước: ngày, đã làm gì, kết quả Kiểm tra, việc người dùng cần làm thủ công. -->

### Bước 1 — 22/10/2026
Đã làm: `packages/core/lib/db/schema/identity.ts` (5 bảng `tenants`, `users`, `tenant_memberships`, `audit_logs`, `number_sequences` đúng spec 02, thêm `users.failed_login_count`, `users.locked_until`, `tenant_memberships.last_login_at`) và re-export ở `schema/index.ts`; migration `0000_db_charset.sql` (viết tay: đặt mặc định DB là utf8mb4 / utf8mb4_unicode_ci) và `0001_identity.sql` (do drizzle-kit sinh, đã review); `modules/identity/password.ts` (argon2id qua `@node-rs/argon2`); `lib/db/seeds/identity.ts` + `identity.test-data.ts` (2 công ty, 10 user, 10 membership, UUID cố định); `seed.ts` gọi seeder, bắt buộc `SEED_DEV_PASSWORD`, từ chối chạy ở production; `vitest.config.ts` thêm alias `@core`/`@shared`; `.env.example` thêm `AUTH_SECRET`, `AUTH_TRUST_HOST`, `SEED_DEV_PASSWORD`; CI job migration có `SEED_DEV_PASSWORD`.
Kiểm tra:
- Viết `seeds/identity.int.test.ts` trước, thấy đỏ; sau khi có seeder xanh 3 test (chạy hai lần không trùng và đúng 2/10/10 dòng; mật khẩu là `$argon2id$` không lưu thuần; seed lại đặt về 0 bộ đếm sai và bỏ khóa). Test chạy migration trên DB trống bằng Testcontainers.
- Trên DB dev có sẵn `__drizzle_migrations` của task 00: `pnpm db:migrate` hai lần mã 0; `pnpm db:seed` hai lần mã 0; `SELECT COUNT(*)`: tenants 2, users 10, tenant_memberships 10; mọi bảng và DB là `utf8mb4_unicode_ci`.
- `pnpm lint`, `pnpm typecheck`, `pnpm format:check` sạch; `pnpm test` 20 test xanh (core 19, worker 1).
Việc anh/chị cần làm thủ công: thêm vào `.env` các biến `AUTH_SECRET` (chuỗi ngẫu nhiên dài, `openssl rand -base64 33`), `AUTH_TRUST_HOST=true` và `SEED_DEV_PASSWORD` (mật khẩu dev dùng cho mọi tài khoản mẫu) trước khi chạy `pnpm db:seed`, `pnpm dev` hay `pnpm e2e` ở các bước sau. Danh sách tài khoản mẫu: owner@, admin@, hung.dv@ (thuộc 2 công ty), ketoan@, doixe@, taixe@, xem@ (đều `@phucan.vn`), dieuvan@saoviet.vn, khoa.test@phucan.vn (thử khóa), chua.co.congty@example.vn (không có công ty).

### Bước 2 — 22/10/2026
Đã làm: viết test trước `lib/db/tenant-db.int.test.ts` (10 test), `modules/identity/repo.int.test.ts` (6 test), `lib/audit/repo.int.test.ts` (2 test), `lib/id.test.ts` (3 test); rồi `lib/id.ts` (uuidv7), `lib/db/tenant-db.ts` (`getTenantDb`: select/insert/update/delete/transaction luôn gắn `tenantId`), `lib/db/system-db.ts`, `modules/identity/repo.ts` (`createIdentityRepo`, `listTenantMembers`), `lib/audit/repo.ts` (`insertAudit`, `listAuditForEntity`), `packages/shared/schemas/audit.ts` (zod cho `before/after`); `startTestInfra({ redis: false })` để test chỉ cần MariaDB; luật ESLint mới cho `system-db` và `_unsafeExecutor`.
Kiểm tra:
- `pnpm test --filter core -- tenant` đỏ trước khi có `tenant-db.ts`, xanh sau khi có (10 test). Test chứng minh: tenant B không đọc, không UPDATE, không DELETE được dòng của tenant A (kể cả khi truyền điều kiện `OR … 1 = 1`); INSERT bỏ `tenantId` giả mạo và dùng `ctx.tenantId`; UPDATE không đổi được `tenantId`; transaction giữ rào tenant và rollback khi lỗi.
- `repo` tests xanh: thành viên tenant A (8) và B (2) không lộ chéo; B không sửa được vai trò của A; `findMembership` trả rỗng khi user không thuộc tenant; danh sách công ty của user sắp theo lần đăng nhập gần nhất, chưa đăng nhập xếp cuối; audit của tenant A không đọc được từ tenant B.
- Lint âm tính: file thử trong `modules/_tmp` import `lib/db/client`, `lib/db`, `lib/db/system-db` và dùng `_unsafeExecutor` đều bị chặn; `modules/identity` vẫn import được `system-db`; đã xóa file thử.
- `pnpm typecheck`, `pnpm lint`, `pnpm format:check` sạch; `pnpm test`: 42 test xanh (core 41, worker 1).
Việc anh/chị cần làm thủ công: `DATABASE_URL` trong `.env` đang trỏ `localhost:3306` (MariaDB/XAMPP cũ, kết nối bị từ chối) trong khi MariaDB của docker compose chạy ở `localhost:3307` với user `tms`, mật khẩu `change-me`, DB `tms`. Tôi đã thêm `AUTH_TRUST_HOST`, `SEED_DEV_PASSWORD` vào cuối `.env` (`AUTH_SECRET` đã có sẵn); phần sửa `DATABASE_URL` bị chặn vì là sửa giá trị có sẵn, anh/chị đổi tay thành `mysql://tms:change-me@localhost:3307/tms` trước khi chạy `pnpm dev`/`pnpm e2e` ở Bước 5 trở đi.

### Bước 3 — 22/10/2026
Đã làm: viết test trước (`permissions.test.ts` 6 test, `lib/result.test.ts` 3 test, `lib/audit/audit.int.test.ts` 3 test, `apps/web/src/server/require-role.test.ts` 7 test, `define-action.test.ts` 7 test) và thấy đỏ; rồi `packages/shared/errors.ts` (9 mã: 8 mã của task + `INTERNAL_ERROR`, `AppError`), `result.ts` (`Result`, `ok`, `fail`, `fieldErrors` tùy chọn), `packages/core/lib/context.ts` (`RequestContext`), `modules/identity/permissions.ts` (ma trận quyền theo PRD A4, `rolesFor`, `can`), `lib/audit/index.ts` (`writeAudit`), `apps/web/src/server/require-role.ts` (`createRequireRole`) và `define-action.ts` (`createDefineAction`); Vitest cho `apps/web` (`pnpm test` chạy luôn cả web).
Kiểm tra:
- `pnpm test --filter core -- permissions` và `pnpm test --filter web -- require-role` đỏ trước khi có code, xanh sau.
- Test `VIEWER` ghi bị từ chối: `{ ok: false, code: 'FORBIDDEN' }`, handler không chạy; kiểm quyền chạy trước validate.
- Input sai zod → `VALIDATION_ERROR` kèm `fieldErrors`, handler (nơi mở transaction) không chạy.
- Lỗi giữa transaction làm `audit_logs` cùng rollback (thay đổi vai trò + audit); audit từ chối khi ctx và tenantDb khác tenant.
- Lỗi bất ngờ trả `INTERNAL_ERROR` chung, không lộ chi tiết.
- `pnpm typecheck`, `pnpm lint`, `pnpm format:check` sạch; `pnpm test`: 68 test xanh (core 53, web 14, worker 1).
Việc anh/chị cần làm thủ công: không có.

### Bước 4 — 22/10/2026
Đã làm: viết `lib/db/numbering.int.test.ts` trước (7 test), thấy đỏ (chưa có module), rồi `lib/db/numbering.ts` (`nextNumber(tx, seqKey)`).
Kiểm tra:
- 50 lời gọi song song, mỗi lời gọi một transaction riêng, ra đúng 50 số khác nhau từ 1 đến 50.
- 5 vòng liên tiếp × 50 song song (key khác nhau mỗi vòng) không trùng; hai `seq_key` đếm riêng; hai tenant cùng `seq_key` đếm riêng khi chạy xen kẽ; rollback hoàn lại số; nhiều số trong một transaction tăng dần; key rỗng hoặc dài hơn 50 ký tự bị từ chối.
- `pnpm test --filter core -- numbering` chạy 5 lần liên tiếp, cả 5 lần 7/7 xanh, không trùng, không deadlock.
- `pnpm typecheck`, `pnpm lint`, `pnpm format:check` sạch.
Việc anh/chị cần làm thủ công: không có.

### Bước 5 — 22/10/2026
Đã làm: viết test trước `modules/identity/auth.service.test.ts` (16 test, thấy đỏ) rồi `auth.service.ts` (`authenticate`, `resolveTenantAccess`, `selectTenant`; khóa 5 lần sai / 15 phút); `packages/shared/schemas/identity.ts` (`loginSchema`, `selectTenantSchema`, `normalizeIdentifier` cho email hoặc SĐT); `Failure.details` trong `result.ts` (`attemptsLeft`, `lockedUntil`); web: `auth.config.ts` (cấu hình an toàn cho proxy), `auth.ts` (Auth.js v5 Credentials + JWT, callback `jwt` kiểm tra hết hạn và membership khi đổi công ty), `app/api/auth/[...nextauth]/route.ts`, `proxy.ts`, `server/{session-token,session,services,index}.ts` (`requireRole`, `defineAction` đã nối Auth.js và DB), `lib/safe-next.ts`, `features/identity/actions.ts` (`login`, `selectTenant`, `switchTenant`, `logout`), `next.config.ts` nạp `.env` ở gốc repo; CI thêm `AUTH_SECRET`, `AUTH_TRUST_HOST`; `e2e/smoke.spec.ts` chuyển sang `/login`.
Kiểm tra:
- `pnpm test --filter core -- auth` xanh (16 test): đúng mật khẩu vào được; sai báo còn bao nhiêu lần; sai lần 5 khóa đến +15 phút; đang khóa thì đúng mật khẩu vẫn bị chặn; hết khóa thì vào lại và đếm lại từ 0; không có công ty → `NO_TENANT_MEMBERSHIP`; một công ty vào thẳng; nhiều công ty phải chọn; chọn công ty không thuộc mình hoặc đã đóng → `FORBIDDEN`; nhận email viết hoa và SĐT dạng `0903 000 111`, `+84…`, `84…`.
- Chưa đăng nhập: `curl -I http://localhost:3000/dispatch` trả 307, `location: /login?next=%2Fdispatch` (mã hóa URL của `/login?next=/dispatch`); `/orders?status=OPEN` giữ nguyên query; `/login` trả 200.
- Đăng nhập thật qua `/api/auth/callback/credentials` bằng curl: `owner@phucan.vn` (một công ty) có phiên với `tenantId` của Phúc An và `/` trả 200; `hung.dv@phucan.vn` (hai công ty) có phiên chưa có `tenantId` và `/` chuyển về `/select-tenant`.
- `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm build` sạch (build có `ƒ Proxy (Middleware)` và `/api/auth/[...nextauth]`); `pnpm test`: 96 test xanh (core 76, web 19, worker 1); `pnpm e2e`: 2 test xanh.
Việc anh/chị cần làm thủ công: `/select-tenant` chưa có trang (làm ở Bước 6) nên đăng nhập bằng người nhiều công ty tạm thời hiện 404. DB dev đã được seed lại với `SEED_DEV_PASSWORD` trong `.env` (`TmsDev@2026`, tôi đặt) và `DATABASE_URL` trong `.env` vẫn cần sửa thành cổng 3307 (xem Bước 2).

### Bước 6 — 22/10/2026
Đã làm: component `Button`/`IconButton`, `Field` (`TextField`, `PasswordField` có nút mắt `aria-pressed`), `Alert`, `EmptyState`, `Pill`/`Badge`, `TenantPicker` trong `apps/web/src/components/ui/`; `features/identity/{auth-shell,login-form,select-tenant-view}.tsx`; `features/theme/*` (đổi giao diện Sáng/Tối bằng cookie `tms-theme`, đọc ở `RootLayout` nên không nháy); route `(auth)/layout.tsx`, `(auth)/login`, `(auth)/select-tenant`, `(tenant)/page.tsx` (H1 giữ chỗ); xóa `app/page.tsx` và `(tenant)/home` của task 00; `packages/shared/labels.ts` (tên vai trò); `lib/{format,utils,safe-next}.ts`; `playwright.config.ts` + `e2e/global-setup.ts` (migrate + seed + làm nóng route) + `e2e/login.spec.ts` (10 test); CI job e2e có dịch vụ MariaDB.
Kiểm tra:
- `pnpm e2e`: 13 test xanh, chạy lại 3 lần liên tiếp đều xanh (sau khi thêm bước làm nóng route; một lần đầu có 1 test chậm vì `next dev` biên dịch lần đầu). Các luồng: người một công ty vào thẳng trang chủ; `hung.dv@phucan.vn` thấy 2 công ty kèm vai trò Điều vận, chọn xong vào trang chủ; đăng nhập bằng SĐT `0903 000 111`; sai mật khẩu hiện "Mật khẩu chưa đúng. Còn N lần thử" dưới ô, `aria-invalid` và `aria-describedby` nối đúng; sai 5 lần thấy "Tài khoản tạm khóa đến HH:MM", nút khóa "Thử lại sau HH:MM", đúng mật khẩu khi đang khóa vẫn bị chặn; tài khoản không có công ty thấy trạng thái Trống với liên kết "Liên hệ quản trị"; `/orders` chưa đăng nhập về `/login?next=%2Forders` rồi quay lại `/orders`; "Đổi tài khoản" đăng xuất; nút mắt; chế độ tối nhớ qua cookie; ô nhập, nút đăng nhập, nút mắt cao ≥ 44px.
- So sánh với `designs/components/Screen01-Login/preview.html` ở 1440×900 bằng ảnh chụp (Playwright): trạng thái Bình thường, Lỗi/khóa, Trống và chế độ Tối khớp bố cục, khoảng cách, chữ, màu; trạng thái Đang tải kiểm tra qua mã (`aria-busy`, spinner, dòng `aria-live`) chứ chưa có ảnh chụp.
- `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm build` sạch (cả 4 route là `ƒ` vì đọc cookie); `pnpm test`: 102 test xanh (core 76, web 25, worker 1).
Token thêm vào theme (liệt kê theo CLAUDE.md): `--spacing-2`, `--spacing-14`, `--spacing-18`, `--spacing-52`, `--spacing-64`, `--spacing-72`, `--container-form` (400px), `--container-form-wide` (480px), `--container-intro` (520px) — các giá trị này thiết kế dùng nhưng `tokens.css` chưa có.
Việc anh/chị cần làm thủ công: `.env` cần `DATABASE_URL` đúng cổng 3307 thì `pnpm e2e` và `pnpm dev` mới chạy (xem Bước 2). Mở `http://localhost:3000/login` xem thử: tài khoản mẫu và mật khẩu `SEED_DEV_PASSWORD` (`TmsDev@2026`, tôi đặt trong `.env`); `pnpm db:seed` đặt lại bộ đếm sai khi cần mở khóa.

### Bước 7 — 22/10/2026
Đã làm: `components/ui/app-shell/{app-shell,nav-menu,tenant-switch,global-search,user-menu}.tsx`; `app/(tenant)/layout.tsx` (gọi `requireRole(rolesFor('web.access'))`, chưa đăng nhập về `/login`, chưa chọn công ty về `/select-tenant`, tài xế thấy hướng dẫn dùng app điện thoại); `features/identity/logout-button.tsx`; trang chủ `(tenant)/page.tsx` chỉ có H1 "Trang chủ"; thêm user mẫu `hien.dt@phucan.vn` (Kế toán ở Phúc An, Quản trị ở Sao Việt) để thử đổi công ty đổi vai trò; `e2e/shell.spec.ts` (11 test); `devIndicators` tắt khi chạy e2e.
Kiểm tra:
- `pnpm e2e`: 24 test xanh, chạy lại 2 lần liên tiếp đều xanh. Các việc kiểm tra: thanh bên đúng 240px, có logo, đủ 8 mục menu (chỉ "Trang chủ" là liên kết thật, `aria-current="page"`; 7 mục còn lại `aria-disabled` kèm `title="Chưa có trang"`); thanh trên có tên công ty, ô tìm, "Trực tiếp", nút giao diện, người dùng + vai trò; đổi công ty trên thanh trên (Kế toán ở Phúc An thành Quản trị ở Sao Việt) đổi cả tên và vai trò; người một công ty không có nút đổi; thứ tự Tab thanh bên rồi thanh trên, và thứ tự DOM thanh bên, thanh trên, H1; phím `/` đưa con trỏ vào ô tìm nhưng không chen khi đang gõ; đổi giao diện sáng/tối và nhớ qua cookie; đăng xuất từ menu người dùng; tài xế không dùng web; viền focus 3px liền nét đúng màu `--focus` ở cả giao diện Sáng và Tối; màn 600px thanh bên thành dải trên cùng; 1366×768 không tràn ngang.
- So sánh ảnh chụp 1440×900 với `designs/components/Screen02-Home/preview.html` (chỉ phần khung): bố cục thanh bên 240px, thanh trên (đổi công ty, ô tìm, Trực tiếp, nút giao diện, người dùng), mục đang mở nền `info-soft`, chữ, khoảng cách, chế độ Tối và màn hẹp khớp thiết kế. Xem thêm Bước 6 về chênh lệch icon.
- `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm build` sạch.
Việc anh/chị cần làm thủ công: không có.

### Bước 8 — 22/10/2026
Đã làm: sửa `docs/specs/02_database_schema.md` cho `users.failed_login_count`, `users.locked_until`, `tenant_memberships.last_login_at`, cách đánh số `nextNumber` và migration charset; thêm `apps/web/src/server/actions-guard.test.ts` (rào chắn: mọi Server Action trong `features/**/actions.ts` phải dùng `defineAction`, hoặc nằm trong danh sách ngoại lệ có lý do và có validate zod); cập nhật CLAUDE.md mục `pnpm e2e`.
Kiểm tra cuối:
- `pnpm typecheck` (0 lỗi), `pnpm lint`, `pnpm format:check`, `pnpm build` sạch; `pnpm test`: 111 test xanh (core 76, web 34, worker 1); `pnpm e2e`: 24 test xanh.
- Migration chạy được trên DB trống (Testcontainers ở mọi test tích hợp) và trên DB dev đã có dữ liệu (`db:migrate` hai lần, `db:seed` lại): tenants 2, users 11, tenant_memberships 12.
- Đạt "Chấp nhận khi" của TICKET-01: test chứng minh user Tenant A không đọc, sửa, xóa được dữ liệu Tenant B (`tenant-db.int.test.ts`, `repo.int.test.ts`, `audit/repo.int.test.ts`); `VIEWER` gọi action ghi nhận `{ ok: false, code: 'FORBIDDEN' }` (`define-action.test.ts`); 50 lời gọi `nextNumber` song song không trùng, 5 lần chạy liên tiếp không deadlock (`numbering.int.test.ts`).
- Mọi Server Action mới: `defineAction` chưa có action nghiệp vụ nào (chưa có module nghiệp vụ); 5 action viết tay (`login`, `selectTenant`, `switchTenant`, `logout`, `setTheme`) đều validate zod (trừ `logout` không có input) và nằm trong danh sách ngoại lệ có lý do. Mọi repo mới (`identity`, `audit`) có test tenant isolation.
Chưa kiểm tra: CI trên GitHub (task 01 chưa được commit nên chưa đẩy nhánh; job e2e đã thêm MariaDB và biến môi trường, cần xem kết quả lần chạy đầu).
Việc anh/chị cần làm thủ công: (1) sửa `DATABASE_URL` trong `.env` thành `mysql://tms:change-me@localhost:3307/tms`; (2) quyết định commit: 8 bước chưa được commit (xem báo cáo cuối); (3) trả lời các câu hỏi mở trong decisions.md (quên mật khẩu, ma trận quyền ô "theo ma trận", `OWNER` ghi Order).
