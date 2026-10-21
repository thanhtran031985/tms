# 01-auth-tenant — Đăng nhập, tenant và phân quyền

> Giai đoạn: GĐ0 · Phụ thuộc: 00 · Nhánh git: `feat/01-auth-tenant`
> Nguồn: `docs/specs/07_implementation_tickets.md` TICKET-01; spec `00_system_overview_and_adrs.md` mục 1 (User / Membership) và ADR-001, ADR-003, ADR-009; spec `01_core_architecture_and_grill_logs.md` mục 1 (Rule 1, 2, 4, 5, 8, 9); spec `02_database_schema.md` mục 1 và nhóm "0. SAAS, IDENTITY, AUDIT" (`tenants`, `users`, `tenant_memberships`, `audit_logs`, `number_sequences`); spec `08_nonfunctional_security_ops.md` mục 2 (Xác thực, Phân quyền, Server Actions); PRD `docs/PRD.md` mục C1, A2, A4, E1

## Mục tiêu
Sau task này, nhân viên của một công ty vận tải đăng nhập bằng email hoặc số điện thoại và mật khẩu; nếu tài khoản thuộc nhiều công ty thì chọn công ty để làm việc và đổi được công ty từ thanh trên. Người chưa đăng nhập không vào được trang nghiệp vụ nào. Dữ liệu của công ty này không bao giờ lộ sang công ty khác, người chỉ có quyền xem không ghi được gì, và số chứng từ sinh ra không bao giờ trùng.

## Phạm vi
**Làm:**
- Bảng `tenants`, `users`, `tenant_memberships`, `audit_logs`, `number_sequences` và seed tối thiểu.
- Đăng nhập email hoặc SĐT + mật khẩu (băm argon2 hoặc bcrypt), khóa tạm sau 5 lần sai trong 15 phút, phiên hết hạn, tùy chọn "Ghi nhớ trên máy này 30 ngày".
- Chọn tenant khi user thuộc nhiều tenant, bỏ qua bước này khi chỉ có một; đổi tenant từ thanh trên; session chứa `tenantId` + `role`.
- `getTenantDb(ctx)`, `requireRole()`, ma trận quyền `modules/identity/permissions.ts`, kiểu kết quả Server Action, mã lỗi chung, helper audit, helper `nextNumber(ctx, key)`.
- Middleware chặn route `(tenant)` khi chưa đăng nhập.
- Màn đăng nhập và chọn công ty (Screen01-Login, TenantPicker) và khung AppShell dùng chung cho mọi màn.

**Không làm (thuộc task khác):**
- 2FA cho `OWNER`/`ADMIN`/`ACCOUNTANT` (giai đoạn 2, spec 08 mục 2; chưa có ticket).
- Luồng "Quên mật khẩu" / "Đặt lại mật khẩu" có trên thiết kế nhưng chưa có trong ticket: giữ link, chưa làm chức năng (ghi decisions.md, hỏi người dùng).
- Màn quản lý người dùng và cấu hình tenant, onboarding tenant, impersonate có thời hạn, tenant `SUSPENDED` chỉ đọc (task 24).
- Đăng nhập app tài xế bằng JWT access/refresh token (task 10).
- Nội dung trang chủ Screen02-Home: KPI, mốc hạn, bảng việc (task 22).
- Chuông thông báo trên thanh trên (task 23).

## Thiết kế
- `designs/components/Screen01-Login/` (đọc README.md và preview.html; 4 trạng thái: Bình thường là form đăng nhập; Đang tải là nút `aria-busy` "Đang đăng nhập…" có spinner và dòng `aria-live`; Trống là bước chọn công ty khi tài khoản chưa được gán công ty nào, có một hành động "Liên hệ quản trị"; Lỗi là sai mật khẩu lần thứ 5, tài khoản tạm khóa, nút "Thử lại sau HH:MM").
- `designs/components/TenantPicker/` (sắp theo lần đăng nhập gần nhất, "Chưa đăng nhập lần nào", vai trò là `tms-pill`, tài khoản một công ty thì bỏ qua).
- `designs/components/AppShell/` và phần khung của `designs/components/Screen02-Home/` (chỉ thanh bên, thanh trên, vùng nội dung; không làm KPI, mốc hạn, bảng).
- Thành phần: `designs/components/Field/`, `designs/components/Button/`, `designs/components/Alert/`, `designs/components/EmptyState/`, `designs/components/StatusChip/` (`tms-pill`, `tms-badge`).
- Thiết kế chỉ có ô "Email" với gợi ý "Dùng email công việc", còn ticket yêu cầu email hoặc SĐT: ô nhận cả hai, nhãn và gợi ý chỉnh cho đúng, ghi chênh lệch vào decisions.md.

## Quyết định kiến trúc
- Thư viện xác thực: Auth.js hoặc better-auth (spec 01 mục 1), chọn trong plan.md và ghi decisions.md. Session lưu `userId`, `tenantId`, `role`; `tenantId` chỉ lấy từ session, không bao giờ từ input client (Rule 1).
- `getTenantDb(ctx)` ở `packages/core/lib/db/tenant-db.ts`: trả đối tượng truy cập đã gắn `ctx.tenantId`; repo trong `modules/*/repo.ts` luôn có `eq(table.tenantId, ctx.tenantId)` cho SELECT/UPDATE/DELETE và tự gán `tenantId` khi INSERT (ADR-003). Không import `db` trực tiếp trong `/modules`.
- `requireRole(roles)` ở `apps/web/src/server/require-role.ts`: đọc session, nạp membership, kiểm tra role theo `packages/core/modules/identity/permissions.ts`, trả `ctx = { tenantId, userId, role, requestId, timezone }`. Mọi Server Action / Route Handler bắt đầu bằng `const ctx = await requireRole([...])`, rồi validate zod trước khi mở transaction (Rule 2, Rule 4).
- Kết quả Server Action: `{ ok: true, data } | { ok: false, code, message }` (Rule 5), kiểu ở `packages/shared/result.ts`; mã lỗi cố định ở `packages/shared/errors.ts`. Task này thêm các mã chung: `UNAUTHENTICATED`, `FORBIDDEN`, `VALIDATION_ERROR`, `INVALID_CREDENTIALS`, `ACCOUNT_LOCKED`, `NO_TENANT_MEMBERSHIP`, `STALE_DATA`, `NOT_FOUND`. Thông báo tiếng Việt nói chuyện gì xảy ra và làm gì tiếp.
- Role theo `ROLES` trong `packages/shared/enums.ts`: `OWNER`, `ADMIN`, `DISPATCHER`, `ACCOUNTANT`, `FLEET_MANAGER`, `DRIVER`, `VIEWER`. `VIEWER` chỉ đọc; `DRIVER` không vào web, chỉ API tài xế (spec 08 mục 2).
- Audit: `writeAudit(tx, ctx, { entity, entityId, action, before, after })` ở `packages/core/lib/audit`, luôn chạy trong cùng transaction với thay đổi (Rule 8). `audit_logs.before/after` là cột JSON: parse và validate zod ở repo (ADR-002).
- `nextNumber(ctx, key)` ở `packages/core/lib/db/numbering.ts`: trong transaction, đảm bảo có dòng `number_sequences(tenant_id, seq_key)` (INSERT IGNORE) rồi `SELECT ... FOR UPDATE`, tăng `last_value`, trả số mới (spec 02 mục 1). Khóa `seq_key` theo dạng `'TRIP:2026-10'`, `'INVOICE:2026'`.
- Khóa tài khoản: spec 02 chưa có cột cho số lần sai. Thêm `users.failed_login_count INT NOT NULL DEFAULT 0` và `users.locked_until DATETIME(3) NULL`, cập nhật spec 02 và ghi decisions.md. Sai 5 lần liên tiếp khóa 15 phút (theo Screen01-Login); đăng nhập đúng đặt lại bộ đếm.
- Mật khẩu băm argon2 (hoặc bcrypt); không log mật khẩu, token hay số điện thoại (spec 08 mục 4). Không tắt kiểm tra Origin của Server Action (spec 08 mục 2).
- `tenants.settings` là JSON: validate bằng zod (`timezone` mặc định `Asia/Ho_Chi_Minh`, các khóa cấu hình sau này thêm dần).
- `apps/web/src/middleware.ts` chặn mọi đường dẫn thuộc `(tenant)` khi chưa có session hợp lệ, chuyển về `/login?next=…`; session có user nhưng chưa chọn tenant thì chuyển về `/select-tenant`.

## Các bước
### Bước 1 — Schema identity, migration và seed
- `packages/core/lib/db/schema/identity.ts`: `tenants`, `users` (thêm `failed_login_count`, `locked_until`), `tenant_memberships`, `audit_logs`, `number_sequences` đúng tên bảng, cột, index trong spec 02; re-export trong `schema/index.ts`.
- `pnpm db:generate`, review SQL migration.
- Seed: 2 tenant (ví dụ "Vận tải Phúc An" và một công ty thứ hai), mỗi role một user ở tenant 1, user `hung.dv@phucan.vn` (DISPATCHER) thuộc cả 2 tenant, một user không thuộc tenant nào; mật khẩu dev lấy từ biến môi trường.
**Kiểm tra:** `pnpm db:migrate` chạy được trên DB trống và trên DB đã có dữ liệu của task 00; `pnpm db:seed` chạy hai lần không sinh trùng; `SELECT COUNT(*) FROM tenant_memberships` đúng số dòng seed.

### Bước 2 — Tenant guard và test tenant isolation
- Viết test trước `packages/core/lib/db/tenant-db.int.test.ts` (Testcontainers): tạo dữ liệu `audit_logs` ở Tenant A, dùng ctx Tenant B thì đọc không thấy, UPDATE và DELETE không ảnh hưởng dòng nào; INSERT bỏ qua `tenantId` truyền từ input và dùng `ctx.tenantId`.
- Viết `lib/db/tenant-db.ts`, `modules/identity/repo.ts` (membership, user) và repo `audit_logs` cho test xanh; mỗi repo mới có test tenant isolation riêng.
**Kiểm tra:** `pnpm test --filter core -- tenant` đỏ trước khi code, xanh sau khi code; test chứng minh user Tenant A không đọc được dữ liệu Tenant B.

### Bước 3 — requireRole, ma trận quyền, kết quả action, mã lỗi và audit
- Viết test trước: `VIEWER` gọi một Server Action ghi mẫu bị trả `{ ok: false, code: 'FORBIDDEN' }`; input sai zod trả `VALIDATION_ERROR` mà không mở transaction; lỗi giữa transaction làm `audit_logs` cũng bị rollback.
- `packages/core/modules/identity/permissions.ts`, `packages/shared/result.ts`, `packages/shared/errors.ts`, `packages/core/lib/audit/index.ts`, `apps/web/src/server/require-role.ts`, helper `defineAction(roles, zodSchema, handler)` trong `apps/web/src/server/` để mọi action theo đúng khuôn requireRole rồi zod rồi service.
**Kiểm tra:** `pnpm test --filter core -- permissions` và `pnpm test --filter web -- require-role` xanh; test `VIEWER` ghi bị từ chối có trong bộ test.

### Bước 4 — nextNumber sinh số chứng từ không trùng
- Viết test trước `packages/core/lib/db/numbering.int.test.ts`: 50 lời gọi `nextNumber(ctx, 'TEST:2026-10')` song song (50 transaction riêng) cho ra 50 số khác nhau, liên tiếp từ 1 đến 50; hai `seq_key` khác nhau đếm riêng; hai tenant cùng `seq_key` đếm riêng.
- Viết `lib/db/numbering.ts`.
**Kiểm tra:** `pnpm test --filter core -- numbering` xanh, chạy 5 lần liên tiếp không lần nào trùng hoặc deadlock.

### Bước 5 — Dịch vụ đăng nhập, chọn tenant, session và middleware
- Viết test trước `packages/core/modules/identity/auth.service.test.ts`: đúng mật khẩu thì đăng nhập; sai trả `INVALID_CREDENTIALS` kèm số lần còn lại; sai lần 5 trả `ACCOUNT_LOCKED` kèm giờ mở khóa; đang khóa thì đúng mật khẩu vẫn bị chặn; user không có membership trả `NO_TENANT_MEMBERSHIP`; user 1 tenant vào thẳng; user nhiều tenant phải chọn; chọn tenant không thuộc mình bị `FORBIDDEN`.
- `modules/identity/auth.service.ts`, `schema.ts` (zod), cấu hình thư viện xác thực, Server Action `login`, `selectTenant`, `switchTenant`, `logout` trong `apps/web/src/features/identity/actions.ts`, `apps/web/src/middleware.ts`.
**Kiểm tra:** `pnpm test --filter core -- auth` xanh; `curl -I http://localhost:3000/dispatch` khi chưa đăng nhập trả 307 về `/login?next=/dispatch`.

### Bước 6 — Màn đăng nhập và chọn công ty
- `apps/web/src/app/(auth)/login/page.tsx`, `apps/web/src/app/(auth)/select-tenant/page.tsx` chỉ định tuyến; view ở `apps/web/src/features/identity/login-form.tsx`, `tenant-picker.tsx`; component `Field`, `Button`, `Alert`, `EmptyState` trong `src/components/ui/` dựng theo designs.
- Đủ 4 trạng thái của Screen01-Login; nút mắt hiện/ẩn mật khẩu (`aria-pressed`), lỗi dưới ô nối `aria-describedby`, vùng bấm ≥ 44px.
- E2E `apps/web/e2e/login.spec.ts`: user 1 tenant vào thẳng trang chủ; `hung.dv@phucan.vn` thấy TenantPicker 2 công ty, chọn xong vào trang chủ; sai 5 lần thấy "Thử lại sau HH:MM"; user không có công ty thấy trạng thái Trống.
**Kiểm tra:** mở `/login` trên 1440×900 so với `designs/components/Screen01-Login/preview.html`, khớp bố cục, chữ, màu ở cả 4 trạng thái và ở chế độ Tối; `pnpm e2e -- login` xanh.

### Bước 7 — Khung AppShell
- `apps/web/src/app/(tenant)/layout.tsx` dùng `src/components/ui/app-shell/` (thanh bên 240px có logo, menu, `tms-badge`; thanh trên có nút đổi công ty mở TenantPicker, ô tìm kiếm có phím `/` (chưa tìm thật), chấm "Trực tiếp", nút đổi giao diện sáng/tối, tên người dùng + vai trò).
- Trang chủ `(tenant)/page.tsx` chỉ có H1 giữ chỗ trong vùng nội dung; mục menu cho phân hệ chưa làm hiện ở trạng thái chưa có trang theo cách ghi trong plan.md.
- Màn hẹp ≤ 640px: thanh bên thành dải trên cùng.
- E2E: đổi công ty trên thanh trên làm tên công ty và vai trò đổi theo; thứ tự Tab: thanh bên, thanh trên, H1.
**Kiểm tra:** mở `/` sau đăng nhập trên 1440×900 và 1366×768, khung khớp phần AppShell của `designs/components/Screen02-Home/preview.html`; viền focus 3px thấy rõ ở cả hai theme; `pnpm e2e -- shell` xanh.

### Bước 8 — Hoàn tất
- Chạy toàn bộ kiểm tra, cập nhật progress.md, đổi trạng thái dòng 01 trong `docs/tasks/README.md`, cập nhật spec 02 cho 2 cột khóa tài khoản.
**Kiểm tra:** `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` không lỗi; `pnpm e2e` xanh cho luồng đăng nhập, chọn công ty, đổi công ty; migration chạy được trên DB trống và DB có dữ liệu; mọi Server Action mới có `requireRole` và zod; mọi repo mới có test tenant isolation; đạt "Chấp nhận khi" của ticket: test chứng minh user Tenant A không đọc được dữ liệu Tenant B; user role `VIEWER` gọi action ghi bị từ chối; sinh số chứng từ song song 50 lần không trùng.
