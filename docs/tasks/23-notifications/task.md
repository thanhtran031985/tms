# 23-notifications — Thông báo

> Giai đoạn: GĐ6 · Phụ thuộc: 06 · Nhánh git: `feat/23-notifications`
> Nguồn: `docs/specs/07_implementation_tickets.md` TICKET-23; spec `00_system_overview_and_adrs.md` mục 3 (phân hệ 10 Notifications), ADR-007; spec `05_advanced_workflows_and_ai.md` mục 1 bước 7, mục 3 (CONFLICT, TIME_MISMATCH), mục 5 (cảnh báo 48h/24h); spec `04_telemetry_and_fuel.md` mục 1.2 và 2.3; spec `03_dispatch_and_concurrency.md` mục 1 bước 7 (Redis Pub/Sub, SSE); spec `06_hierarchical_pricing_and_fees.md` mục 3 (cờ cần Kế toán xem lại); spec `08_nonfunctional_security_ops.md` mục 2, mục 3, mục 4; PRD `docs/PRD.md` mục C17

## Mục tiêu
Sau task này, Điều vận, Kế toán và Quản lý đội xe nhận cảnh báo đúng người, đúng lúc: sắp hết free time, sắp cut-off, giấy tờ sắp hết hạn, vượt định mức dầu, tài xế báo xung đột hay xe hỏng giữa đường. Cảnh báo hiện ngay trong ứng dụng ở nút chuông và gửi ra email hoặc Zalo/SMS theo cấu hình. Quản trị viên chọn mỗi loại sự kiện gửi cho vai trò hay người nào, qua kênh nào.

## Phạm vi
**Làm:**
- Bảng thông báo trong app, quy tắc người nhận theo loại sự kiện, nhật ký gửi từng kênh.
- Service `notify(ctx, event)` dùng chung cho mọi phân hệ: chống trùng theo khóa sự kiện, đẩy job vào hàng đợi.
- Worker gửi theo kênh: trong app (SSE qua Redis Pub/Sub), email, Zalo/SMS qua adapter; retry có backoff và dead-letter.
- Interface adapter `EmailProvider`, `ZaloProvider`, `SmsProvider` với 1 adapter thật cho email và adapter giả cho Zalo/SMS khi chưa chọn nhà cung cấp.
- Nối các nguồn sự kiện đã có: cảnh báo DEM/DET và cut-off 48h/24h (task 18), giấy tờ sắp hết hạn (task 05), vượt định mức dầu (task 15), `CONFLICT` từ app tài xế (task 11), xe hỏng giữa đường (task 09), `TIME_MISMATCH` (task 14), cờ cần Kế toán xem lại phân bổ (task 17), cập nhật điều vận (task 06/07).
- Màn cấu hình người nhận theo loại sự kiện; chuông thông báo trên `AppShell` có danh sách, đánh dấu đã đọc.
- Gửi cho khách hàng khi tenant bật (cảnh báo free time, spec 05 mục 5).

**Không làm (thuộc task khác):**
- Sinh sự kiện nghiệp vụ gốc (các task 05, 09, 11, 14, 15, 17, 18); task này chỉ nhận sự kiện và gửi.
- Cập nhật Kanban realtime `dispatch.updated` (task 07).
- Cảnh báo vận hành hệ thống (lag GPS, job lỗi, backup lỗi) gửi cho đội kỹ thuật (task 24).
- Thông báo đẩy (push) trên app tài xế Expo (không có trong ticket; xem decisions.md).
- Nhắc nợ, gửi hóa đơn (không có trong ticket).

## Thiết kế
- `designs/components/AppShell/` (thanh trên; chuông thông báo đặt cạnh nút đổi giao diện, dùng `tms-icon-btn` 44px có `aria-label`, số chưa đọc dùng `tms-badge` `crit-soft`/`crit`). README AppShell hiện chưa có chuông trong thứ tự thanh trên: ghi vị trí và cách dựng vào decisions.md.
- Danh sách thông báo là lớp nổi `shadow-popover`, mỗi dòng có `StatusChip` theo mức (`crit`, `warn`, `info`), giờ tuyệt đối và thời gian còn lại, một hành động dẫn tới đối tượng.
- Màn cấu hình dùng `designs/components/WorkTable/`, `designs/components/Field/`, `designs/components/FilterTabs/`, `designs/components/Alert/`, `designs/components/EmptyState/`; đủ 4 trạng thái.
- Câu thông báo theo `designs/README.md`: nói chuyện gì, hạn bao giờ, làm gì tiếp; không emoji, không dấu chấm than; số cont, biển số, mã Order dùng `--font-mono` trong app.

## Quyết định kiến trúc
- Nghiệp vụ ở `packages/core/modules/notifications/` (spec 01 mục 2): `service.ts`, `repo.ts`, `schema.ts`, `templates.ts`; adapter ở `packages/core/lib/notify/{email,zalo,sms}/`; job gửi ở `apps/worker/src/jobs/notifications.ts` (ADR-007).
- Spec 02 chưa có bảng thông báo. Thêm và cập nhật spec 02: `notifications` (`tenant_id`, `event_type`, `dedupe_key`, `severity` CRIT/WARN/INFO, `title`, `body`, `entity`, `entity_id`, `link`, `created_at`, unique `(tenant_id, dedupe_key)`), `notification_recipients` (`notification_id`, `user_id`, `read_at`), `notification_rules` (`tenant_id`, `event_type`, `target_type` ROLE/USER/CUSTOMER, `target_value`, `channels` (IN_APP, EMAIL, ZALO, SMS), `is_active`), `notification_deliveries` (`tenant_id`, `notification_id`, `channel`, `recipient_ref`, `status` PENDING/SENT/FAILED/DEAD, `attempts`, `last_error`, `sent_at`).
- Loại sự kiện là hằng `as const` trong `packages/shared/enums.ts` (ví dụ `FREE_TIME_EXPIRING`, `CUTOFF_APPROACHING`, `DOCUMENT_EXPIRING`, `FUEL_OVER_NORM`, `DRIVER_SYNC_CONFLICT`, `BREAKDOWN`, `TIME_MISMATCH`, `ALLOCATION_REVIEW_REQUIRED`); payload mỗi loại validate zod.
- Idempotent (ADR-007, Rule 7): `notify` với cùng `dedupe_key` không tạo thông báo thứ hai (ví dụ `'DET:{orderContainerId}:24h'`); job gửi theo từng `notification_deliveries` nên chạy lại không gửi trùng kênh đã `SENT`.
- Gửi ngoài transaction nghiệp vụ: `notify` chỉ ghi bản ghi và đẩy job sau commit; lỗi gửi không làm hỏng nghiệp vụ gốc. Retry có backoff, quá số lần thì `DEAD` và vào dead-letter.
- Trong app: publish lên Redis Pub/Sub kênh `tenant:{tenantId}:notifications`, trình duyệt nhận qua SSE `/api/v1/stream/notifications`; chỉ đẩy cho user là người nhận. Key Redis có tiền tố tenant (ADR-003).
- Người nhận theo vai trò lấy từ `tenant_memberships`; người nhận khách hàng chỉ khi tenant bật (`tenants.settings`) và chỉ cho loại sự kiện cho phép (free time).
- Khóa API email, Zalo, SMS lấy từ secret manager; khóa riêng của tenant (nếu tenant tự cấu hình) mã hóa khi lưu (spec 08 mục 2). Log không chứa số điện thoại, email, token (spec 08 mục 4); số điện thoại tài xế là PII.
- Quyền: cấu hình quy tắc là `OWNER`, `ADMIN`; mọi user đọc và đánh dấu đã đọc thông báo của chính mình. Server Action `requireRole([...])` + zod. Đổi quy tắc ghi `audit_logs`.
- Metrics: số thông báo gửi lỗi theo kênh (spec 08 mục 4) đưa ra log có cấu trúc để task 24 dựng giám sát.
- Mã lỗi đề xuất: `NOTIFICATION_RULE_INVALID`, `NOTIFICATION_CHANNEL_NOT_CONFIGURED`.
- Tenant: mọi truy vấn qua `getTenantDb(ctx)`; user Tenant A không đọc được thông báo Tenant B; mỗi repo mới có test tenant isolation.

## Các bước
### Bước 1 — Schema thông báo, quy tắc, nhật ký gửi
- Thêm 4 bảng trong `packages/core/lib/db/schema/notifications.ts`, enum loại sự kiện và kênh trong `packages/shared/enums.ts`; cập nhật spec 02.
- Migration `drizzle-kit generate`, đọc lại SQL. Seed quy tắc mặc định: cut-off và free time → `DISPATCHER` (trong app + email); giấy tờ sắp hết hạn → `FLEET_MANAGER`, `DISPATCHER`; vượt định mức dầu và cần xem lại phân bổ → `ACCOUNTANT`; xe hỏng và xung đột đồng bộ → `DISPATCHER`.
- Test tenant isolation cho các repo mới viết trước.
**Kiểm tra:** `pnpm db:migrate` chạy trên DB trống và DB đã có dữ liệu; `pnpm db:seed` thêm quy tắc mặc định; `pnpm test --filter core -- notifications.repo` xanh.

### Bước 2 — Service notify, chống trùng và chọn người nhận
- Test trước: `notify` cùng `dedupe_key` 3 lần chỉ tạo 1 thông báo; người nhận đúng theo quy tắc vai trò, người dùng cụ thể; quy tắc tắt thì không gửi; khách hàng chỉ nhận khi tenant bật; payload sai zod bị từ chối; `notify` gọi trong transaction bị rollback thì không có job gửi.
- Viết `service.ts`, `templates.ts` (câu tiếng Việt theo `designs/README.md`).
**Kiểm tra:** `pnpm test --filter core -- notifications.service` xanh.

### Bước 3 — Worker gửi đa kênh và adapter
- Test trước (Redis và MariaDB qua Testcontainers): job gửi trong app publish đúng kênh tenant; email qua adapter giả ghi đúng người nhận; adapter lỗi thì retry có backoff, quá số lần chuyển `DEAD` và vào dead-letter; chạy lại job không gửi trùng kênh đã `SENT`; log không chứa email, số điện thoại.
- Viết `apps/worker/src/jobs/notifications.ts`, interface `EmailProvider`, `ZaloProvider`, `SmsProvider`, adapter email thật (SMTP hoặc nhà cung cấp người dùng chọn) và adapter giả cho Zalo/SMS.
**Kiểm tra:** `pnpm test --filter worker -- notifications` xanh; chạy `pnpm dev`, gửi thử email tới hộp thư dev (ví dụ Mailpit trong Docker Compose nếu task 00 đã có) và thấy thư.

### Bước 4 — Nối nguồn sự kiện của các phân hệ
- Test trước cho từng nguồn: cảnh báo 48h/24h của task 18 tạo đúng 2 thông báo cho mỗi mốc; job giấy tờ của task 05 tạo `DOCUMENT_EXPIRING`; giao dịch dầu có `isOverNormWarning` tạo `FUEL_OVER_NORM`; sự kiện `CONFLICT` của task 11 tạo `DRIVER_SYNC_CONFLICT` cho Điều vận; cứu hộ của task 09 tạo `BREAKDOWN` ưu tiên khi Order sắp hết cut-off/free time; `TIME_MISMATCH` của task 14; cờ cần xem lại của task 17.
- Thay các chỗ phát sự kiện tạm của các task trước bằng `notify`.
**Kiểm tra:** `pnpm test --filter core -- notifications.sources` xanh; test của các task 05, 09, 11, 14, 15, 17, 18 vẫn xanh.

### Bước 5 — Chuông thông báo và SSE trong app
- Route Handler SSE `apps/web/src/app/api/v1/stream/notifications/route.ts` (kiểm session, chỉ gửi thông báo của user hiện tại); chuông trên `AppShell` trong `apps/web/src/components/ui/` với số chưa đọc, danh sách lớp nổi, đánh dấu đã đọc qua Server Action `requireRole` + zod; 4 trạng thái của danh sách (đang tải, trống "Không có thông báo mới", lỗi giữ danh sách cũ và "Thử lại", có dữ liệu).
- E2E Playwright viết trước `apps/web/e2e/notifications.spec.ts`.
**Kiểm tra:** `pnpm e2e -- notifications` xanh với luồng: 2 trình duyệt, tạo sự kiện cut-off, trình duyệt của Điều vận thấy số chuông tăng trong vòng 5 giây, trình duyệt của Kế toán không thấy; bấm đọc thì số giảm.

### Bước 6 — Màn cấu hình người nhận theo loại sự kiện
- Route `apps/web/src/app/(tenant)/settings/notifications/page.tsx`, view ở `apps/web/src/features/notifications/`: bảng loại sự kiện × người nhận × kênh, bật/tắt, thêm người nhận theo vai trò hoặc người dùng, bật gửi cho khách; Server Action `requireRole(['OWNER', 'ADMIN'])` + zod; đổi quy tắc ghi audit; đủ 4 trạng thái.
**Kiểm tra:** `pnpm test --filter web -- notifications.actions` xanh (`DISPATCHER` đổi quy tắc bị từ chối); mở `/settings/notifications` trên 1440×900 thấy quy tắc seed, tắt kênh email cho cut-off rồi tạo sự kiện thì chỉ có thông báo trong app.

### Bước 7 — Hoàn tất
- Chạy toàn bộ kiểm tra, cập nhật progress.md, đổi trạng thái README, cập nhật spec 02 nếu có quyết định khác.
**Kiểm tra:** `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` không lỗi; `pnpm e2e` cho luồng chuông thông báo xanh; migration chạy trên DB trống và DB có dữ liệu; đạt yêu cầu của ticket (TICKET-23 không ghi "Chấp nhận khi" riêng, dùng đúng các ý của ticket): thông báo trong app + email + Zalo/SMS qua adapter; cấu hình người nhận theo loại sự kiện có hiệu lực; cùng một sự kiện không gửi trùng.
