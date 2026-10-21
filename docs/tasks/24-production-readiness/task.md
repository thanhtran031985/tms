# 24-production-readiness — Sẵn sàng production

> Giai đoạn: GĐ6 · Phụ thuộc: 00–23 · Nhánh git: `feat/24-production-readiness`
> Nguồn: `docs/specs/07_implementation_tickets.md` TICKET-24; spec `08_nonfunctional_security_ops.md` mục 1 đến mục 7; spec `00_system_overview_and_adrs.md` ADR-002, ADR-003, ADR-007; spec `01_core_architecture_and_grill_logs.md` mục 4 (thời gian lưu GPS cần pháp chế); spec `04_telemetry_and_fuel.md` mục 1.0 và 1.2 (rate-limit thiết bị, giám sát lag); spec `02_database_schema.md` mục 1 (PII); PRD `docs/PRD.md` mục E6, F11, H3

## Mục tiêu
Sau task này, đội vận hành đưa hệ thống lên production mà ngủ yên: dữ liệu được sao lưu hằng ngày và đã khôi phục thử thành công, lỗi và độ trễ được theo dõi, có cảnh báo khi GPS trễ hay job DEM/DET không chạy, API bị chặn khi gọi dồn. Có runbook để xử lý sự cố theo từng bước, và nhân viên vận hành tạo được một công ty khách mới kèm dữ liệu danh mục trong một buổi.

## Phạm vi
**Làm:**
- Log có cấu trúc (JSON) kèm `tenantId`, `userId`, `requestId` cho web, worker; theo dõi lỗi (Sentry hoặc tương đương) cho web, worker, app tài xế.
- Metrics: độ trễ action, số lỗi theo mã, lag Redis Stream, số job lỗi, số thiết bị GPS mất kết nối, chi phí gọi AI theo tenant, số thông báo gửi lỗi.
- Cảnh báo: lag GPS > 5 phút, tỷ lệ lỗi > 2%, job DEM/DET không chạy, backup thất bại.
- Rate-limit cho API GPS, API tài xế, đăng nhập và Server Action nhạy cảm.
- Rà soát bảo mật OWASP Top 10, dependency scanning trong CI, kiểm tra Origin của Server Action, giới hạn file tải lên, bí mật trong secret manager.
- Backup MariaDB full hằng ngày + binlog (PITR), giữ tối thiểu 30 ngày; Redis AOF; object storage versioning; diễn tập khôi phục và ghi kết quả.
- Màn admin xem job lỗi và dead-letter, chạy lại job.
- Onboarding tenant mới: tạo tenant, user `OWNER`, cấu hình múi giờ, đánh số, phương pháp phân bổ, import danh mục bằng Excel mẫu; trạng thái tenant `SUSPENDED` chỉ đọc; giới hạn theo gói (cảnh báo, không khóa dữ liệu); impersonate có thời hạn và audit.
- Runbook sự cố trong `docs/runbooks/`.
- Kiểm tra mục tiêu hiệu năng của spec 08 mục 1 trên môi trường staging.

**Không làm (thuộc task khác hoặc ngoài phạm vi MVP):**
- 2FA cho `OWNER`/`ADMIN`/`ACCOUNTANT` (spec 08 mục 2 ghi giai đoạn 2).
- Mua, chọn nhà cung cấp hạ tầng và ký hợp đồng (người dùng quyết định); task này viết cấu hình và script chạy được trên môi trường người dùng cung cấp.
- Quyết định pháp lý: thời gian lưu GPS, nơi lưu dữ liệu trong nước, điều khoản xử lý dữ liệu cá nhân (cần pháp chế; ghi vào decisions.md là việc chờ người dùng).
- Pipeline GPS và job bảo trì partition (task 13), thông báo nghiệp vụ (task 23); task này chỉ thêm giám sát cho chúng.

## Thiết kế
- Không có giao diện theo thiết kế riêng. Màn admin xem job lỗi và màn onboarding tenant dùng `designs/components/WorkTable/`, `designs/components/Field/`, `designs/components/Alert/`, `designs/components/EmptyState/`, `designs/components/AppShell/`, theo `designs/README.md`, đủ 4 trạng thái dữ liệu.

## Quyết định kiến trúc
- Log: một logger dùng chung ở `packages/core/lib/log/` (JSON, có `tenantId`, `userId`, `requestId`); bộ lọc che PII và token (số điện thoại, CCCD, GPLX, email, JWT, API key) trước khi ghi (spec 08 mục 4, spec 02 mục 1). Test chứng minh log không lộ các trường này.
- Theo dõi lỗi: SDK Sentry (hoặc tương đương người dùng chọn) cho `apps/web`, `apps/worker`, `apps/driver-app`; DSN lấy từ biến môi trường; scrub PII giống logger.
- Metrics xuất dạng Prometheus/OpenTelemetry từ web và worker; ngưỡng cảnh báo khai báo trong file cấu hình có version trong repo (`infra/alerts/*.yml`).
- Cảnh báo "job DEM/DET không chạy": worker ghi nhịp tim (heartbeat) mỗi lần job chạy xong theo tenant vào Redis `tenant:{t}:jobs:demdet:lastRun`; kiểm tra quá 26 giờ thì báo.
- Rate-limit dùng Redis (key có tiền tố tenant hoặc thiết bị): theo thiết bị cho `/api/v1/gps/ingest` (spec 04 mục 1.0), theo tài xế cho `/api/v1/driver/*`, theo IP và tài khoản cho đăng nhập (khóa tạm sau N lần sai đã có ở task 01); vượt ngưỡng trả HTTP 429 kèm `Retry-After`.
- Bảo mật: giữ kiểm tra Origin mặc định của Next.js cho Server Action, không tắt; header bảo mật (CSP, HSTS, X-Content-Type-Options, frame-ancestors); file tải lên giới hạn kích thước và loại, chỉ ảnh/PDF/Excel đúng chỗ dùng; Signed URL hạn ngắn; dependency scanning (`pnpm audit` hoặc công cụ tương đương) chạy trong CI và chặn merge khi có lỗ hổng mức cao.
- Rà soát ma trận quyền: test tự động duyệt mọi Server Action và Route Handler, khẳng định mỗi cái có `requireRole` và zod (DoD); test đa tenant cho mọi repository chạy trong CI (spec 08 mục 2).
- Backup: script `infra/backup/` cho full dump hằng ngày + binlog, lưu nơi tách biệt, giữ ≥ 30 ngày; diễn tập khôi phục PITR về một thời điểm, đo thời gian, ghi biên bản vào `docs/runbooks/restore-drill-YYYY-MM-DD.md`. Redis bật AOF; mất Redis chỉ mất vị trí realtime và job chờ chạy lại được.
- Migration: chỉ dùng migration có version (`drizzle-kit generate` + review SQL), không dùng `push` trên production; migration tương thích ngược một phiên bản để deploy không downtime; CI chặn lệnh `push` trong script deploy.
- Môi trường `dev` → `staging` (dữ liệu giả) → `production`; web và worker deploy độc lập cùng phiên bản `packages/core`.
- Tenant `SUSPENDED`: mọi Server Action ghi và API ghi trả `TENANT_SUSPENDED`, đọc vẫn được. Gói thuê bao: vượt giới hạn số xe, số user, số lượt OCR/tháng thì cảnh báo, không khóa dữ liệu.
- Impersonate cho nhân viên hỗ trợ: phiên có thời hạn, có lý do, ghi `audit_logs` mỗi thao tác với `actorUserId` thật; chỉ role nội bộ hệ thống (không phải role của tenant) bật được.
- Màn admin job lỗi: chỉ `OWNER`/`ADMIN` của tenant thấy job của tenant mình; quản trị hệ thống thấy toàn bộ. Server Action chạy lại job `requireRole` + zod, ghi audit.
- Mã lỗi đề xuất: `RATE_LIMITED`, `TENANT_SUSPENDED`, `PLAN_LIMIT_EXCEEDED` (cảnh báo), `IMPERSONATION_EXPIRED`.

## Các bước
### Bước 1 — Log có cấu trúc, theo dõi lỗi và metrics
- Test trước: logger thêm `tenantId`, `userId`, `requestId` vào mọi dòng; các trường PII và token bị che; lỗi chưa bắt ở web và worker được gửi sang adapter theo dõi lỗi (adapter giả trong test).
- Viết `packages/core/lib/log/`, tích hợp Sentry (hoặc tương đương) cho web, worker, driver-app; xuất metrics độ trễ action, lỗi theo mã, lag Redis Stream, job lỗi, thiết bị GPS mất kết nối, chi phí AI theo tenant, thông báo gửi lỗi.
**Kiểm tra:** `pnpm test --filter core -- log` xanh; chạy `pnpm dev`, gọi một action lỗi, thấy dòng log JSON có đủ 3 trường, không có số điện thoại; endpoint metrics trả các chỉ số trên.

### Bước 2 — Rate-limit và rà soát bảo mật
- Test trước: gọi `/api/v1/gps/ingest` vượt ngưỡng theo thiết bị trả 429 có `Retry-After`; API tài xế và đăng nhập tương tự; test quét mọi Server Action và Route Handler khẳng định có `requireRole` và zod; header bảo mật có mặt; file sai loại hoặc quá cỡ bị từ chối; tenant `SUSPENDED` ghi bị chặn `TENANT_SUSPENDED`, đọc vẫn được.
- Viết middleware rate-limit trên Redis, header bảo mật, bước dependency scanning trong CI; rà soát OWASP Top 10 theo checklist và ghi kết quả vào `docs/runbooks/security-review.md`.
**Kiểm tra:** `pnpm test --filter web -- security` xanh; CI chạy dependency scanning và thất bại khi thêm thử một gói có lỗ hổng mức cao; checklist OWASP có kết luận cho cả 10 mục.

### Bước 3 — Backup, khôi phục và diễn tập
- Viết script `infra/backup/` (full hằng ngày + binlog, giữ ≥ 30 ngày), cấu hình Redis AOF, bật versioning cho bucket; script khôi phục PITR về thời điểm chỉ định.
- Diễn tập trên staging: xóa thử một bảng, khôi phục về thời điểm trước đó, so số dòng và tổng tiền các bảng tài chính trước và sau.
**Kiểm tra:** chạy `pnpm ops:backup` (hoặc lệnh script tương ứng) tạo bản sao lưu; chạy `pnpm ops:restore -- --to "<thời điểm>"` trên staging khôi phục được, tổng `driver_ledger`, `invoices`, `order_fees` khớp trước sự cố; biên bản diễn tập lưu ở `docs/runbooks/restore-drill-<ngày>.md`; thêm vào progress.md việc người dùng cần làm thủ công (cấp chỗ lưu backup, lịch diễn tập hằng quý).

### Bước 4 — Cảnh báo vận hành và màn job lỗi
- Test trước: heartbeat DEM/DET quá 26 giờ sinh cảnh báo; lag GPS > 5 phút sinh cảnh báo; tỷ lệ lỗi > 2% trong cửa sổ đo sinh cảnh báo; backup thất bại sinh cảnh báo; màn job lỗi chỉ hiện job của tenant hiện tại, chạy lại job ghi audit, role không đủ bị từ chối.
- Viết `infra/alerts/*.yml`, heartbeat trong worker, route `apps/web/src/app/(tenant)/settings/jobs/page.tsx` và view `apps/web/src/features/admin/jobs/` với 4 trạng thái.
**Kiểm tra:** `pnpm test --filter worker -- heartbeat` và `pnpm test --filter web -- admin.jobs` xanh; trên staging tắt worker DEM/DET và thấy cảnh báo trong kênh cảnh báo đã cấu hình; mở `/settings/jobs` trên 1440×900 thấy job dead-letter và chạy lại được.

### Bước 5 — Onboarding tenant, gói thuê bao và impersonate
- Test trước: tạo tenant mới kèm `OWNER`, múi giờ, mẫu đánh số, phương pháp phân bổ; import Excel mẫu khách, xe, tài xế, tuyến, bảng giá với xem trước và lỗi theo dòng; vượt giới hạn gói chỉ cảnh báo `PLAN_LIMIT_EXCEEDED`; impersonate hết hạn trả `IMPERSONATION_EXPIRED`, mỗi thao tác khi impersonate ghi audit với người thật.
- Viết `packages/core/modules/identity/onboarding.service.ts`, file Excel mẫu trong `docs/onboarding/templates/`, màn onboarding cho quản trị hệ thống, cơ chế impersonate.
**Kiểm tra:** `pnpm test --filter core -- onboarding` xanh; trên staging tạo một tenant mới từ đầu tới lúc Điều vận đăng nhập thấy danh mục đã import, ghi thời gian thực hiện vào progress.md.

### Bước 6 — Kiểm tra hiệu năng và runbook sự cố
- Viết kịch bản tải: Kanban 300 thẻ trong ngày tải lần đầu < 2 giây; Server Action điều vận p95 < 500 ms; 500 xe × 1 điểm/10 giây độ trễ vị trí trên bản đồ < 30 giây; Kanban và bảng dùng tốt ở 1366px.
- Viết runbook trong `docs/runbooks/`: GPS trễ hoặc mất điểm, worker chết, job DEM/DET không chạy, MariaDB đầy hoặc chậm, Redis mất dữ liệu, khôi phục backup, nhà cung cấp hóa đơn điện tử lỗi, rò rỉ khóa API, tenant báo thấy dữ liệu lạ (nghi rò rỉ tenant). Mỗi runbook có dấu hiệu, kiểm tra, xử lý, người cần báo.
**Kiểm tra:** chạy kịch bản tải trên staging đạt cả 4 mục tiêu (ghi số đo vào progress.md); một người không viết runbook làm theo runbook "worker chết" trên staging và khôi phục được trong thời gian ghi trong runbook.

### Bước 7 — Hoàn tất
- Chạy toàn bộ kiểm tra, cập nhật progress.md, đổi trạng thái README, cập nhật spec 08 nếu có quyết định khác.
**Kiểm tra:** `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` không lỗi; `pnpm e2e` toàn bộ luồng chính của các task trước vẫn xanh; migration chạy trên DB trống và DB có dữ liệu; đạt yêu cầu của ticket (TICKET-24 không ghi "Chấp nhận khi" riêng, dùng đúng các ý của ticket theo spec 08): backup + restore thử thành công có biên bản; có giám sát, log, rate-limit; đã rà soát bảo mật; có runbook sự cố; onboarding tenant mới làm được trên staging.
