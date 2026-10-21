# 10-driver-app — API tài xế và app Expo (online)

> Giai đoạn: GĐ3 · Phụ thuộc: 06 · Nhánh git: `feat/10-driver-app`
> Nguồn: `docs/specs/07_implementation_tickets.md` TICKET-10; spec `00_system_overview_and_adrs.md` ADR-002 (Object Storage), ADR-006 (App tài xế); spec `01_core_architecture_and_grill_logs.md` Rule 1, 2, 4, 5, 7 và mục 2 (cấu trúc `apps/driver-app`, `/api/v1/driver`); spec `03_dispatch_and_concurrency.md` mục 1 bước 6 (trạng thái tài nguyên khi bắt đầu chuyến); spec `05_advanced_workflows_and_ai.md` mục 3 (chuyển trạng thái Stop hợp lệ); spec `08_nonfunctional_security_ops.md` mục 2 (token tài xế, file qua Signed URL), mục 7 (app tài xế); spec `02_database_schema.md` bảng `drivers`, `dispatch_assignments`, `order_stops`, `consolidated_trips`, `attachments`; PRD `docs/PRD.md` mục D

## Mục tiêu
Sau task này, tài xế đăng nhập app trên điện thoại Android, thấy ngay việc tiếp theo và các lệnh hôm nay của chính mình, bấm "Bắt đầu chuyến", check-in từng Stop, chụp ảnh EIR, ePOD, Seal rồi hoàn tất Stop khi có mạng. Điều vận thấy chuyến chuyển sang "Đang chạy" ngay khi tài xế bấm bắt đầu. Tài xế không bao giờ thấy được lệnh của tài xế khác hay của công ty khác.

## Phạm vi
**Làm:**
- Đăng nhập tài xế cho app: access token JWT ngắn hạn + refresh token thu hồi được (khi tài xế nghỉ việc hoặc bị khóa).
- REST `/api/v1/driver/*` với JWT: xem lệnh hôm nay, bắt đầu chuyến, check-in Stop, hoàn tất Stop, xin presigned URL và xác nhận ảnh chứng từ.
- Bảng `attachments` (nếu task 09 chưa tạo) và upload ảnh presigned lên S3 (MinIO khi dev), key `tenants/{tenantId}/...`.
- Bắt đầu chuyến chuyển tài xế `ON_DUTY`, đầu kéo và rơ moóc `IN_USE`, assignment `IN_TRANSIT`, chuyến `IN_TRANSIT`; hoàn tất Stop cuối gọi `onTripCompleted` (task 09) và trả tài nguyên về `AVAILABLE`.
- Chặn hoàn tất Stop sai thứ tự và chặn hoàn tất Stop `requiresProof` khi chưa có đủ ảnh.
- Ghi nhận `clientEventId` cho mọi thao tác ghi từ app (Rule 7) và bỏ qua thao tác đã xử lý.
- App Expo `apps/driver-app`: đăng nhập, header đếm việc còn lại, thẻ "Việc tiếp theo", danh sách lệnh hôm nay, chi tiết chuyến với timeline Stop, check-in 3 bước, chụp ảnh, bottom nav 4 mục (Lệnh hoạt động; Phiếu dầu, Chi phí, Sổ lương là khung chờ task sau).

**Không làm (thuộc task khác):**
- Outbox SQLite, gửi lại khi có mạng, upload ảnh tiếp tục được, `CONFLICT`, `clockSkewMs` (task 11).
- OCR ảnh EIR và xác nhận ePOD của con người (task 12).
- Geofence tự ghi `arrivedAt`/`departedAt` và bắt đầu chuyến khi rời bãi (task 14).
- Tab Phiếu dầu (task 15), tab Chi phí (task 16), tab Sổ lương (task 20).
- Thông báo đẩy cho tài xế (task 23).

## Thiết kế
- `designs/components/Screen09-DriverApp/` (đọc README.md và preview.html; 4 trạng thái cho danh sách lệnh: Bình thường; Đang tải là khung xương, không spinner toàn màn; Trống là "Chưa có lệnh nào hôm nay" + "Tải lại lệnh"; Lỗi là giữ lệnh lúc tải cuối, alert + "Thử lại").
- Quy tắc mobile của màn: khung 390×844, vùng chạm ≥ 48px (nút chính 60 đến 72px), chữ thân 16 đến 19px, H1 22px, padding theo safe area, phản hồi khi nhấn, tôn trọng giảm chuyển động.
- Thành phần: `designs/components/Button/`, `designs/components/Field/`, `designs/components/StatusChip/`, `designs/components/Alert/`, `designs/components/ContainerCard/` (chuyến TWIN_20 hiện 2 cont), `designs/components/EmptyState/`, `designs/components/DeadlineTimeline/`.
- Token lấy từ `designs/tokens.json` chuyển sang theme của React Native; không tự đặt mã màu.

## Quyết định kiến trúc
- App gọi REST `/api/v1/driver/*`, không gọi Server Action (ADR-006). Route Handler ở `apps/web/src/app/api/v1/driver/`, nghiệp vụ ở `packages/core/modules/dispatch/driver.service.ts` và `packages/core/modules/identity/driver-auth.ts`; zod schema dùng chung ở `packages/shared/driver-api.ts` để app và server cùng validate.
- Mọi Route Handler bắt đầu bằng `requireRole(['DRIVER'])` đọc từ JWT (ma trận ở `modules/identity/permissions.ts`), rồi validate zod. `tenantId` và `driverId` chỉ lấy từ token, không bao giờ từ body hay query (ADR-003, Rule 1). Role `DRIVER` chỉ truy cập API tài xế (spec 08 mục 2).
- Quyền sở hữu: mọi truy vấn lệnh, Stop, chuyến, ảnh có điều kiện `tenant_id = ctx.tenantId` và assignment có `driver_id = ctx.driverId`; tài nguyên của tài xế khác trả 404 (không lộ là có tồn tại).
- Token: access token hạn ngắn (đề xuất 15 phút), refresh token lưu dạng hash, thu hồi được, xoay vòng khi dùng. Spec 02 chưa có bảng cho refresh token: đề xuất `driver_refresh_tokens (id, tenant_id, driver_id, token_hash, expires_at, revoked_at, created_at)`, ghi `decisions.md` và cập nhật spec 02. Tài xế `INACTIVE` hoặc membership bị gỡ thì refresh bị từ chối.
- Idempotency (Rule 7): mọi request ghi có `clientEventId` (UUID do app sinh). Spec 02 chưa có bảng lưu sự kiện tài xế đã xử lý: đề xuất `driver_events (id, tenant_id, driver_id, client_event_id, type, stop_id, occurred_at, synced_at, result_code, created_at)` với `UNIQUE(tenant_id, client_event_id)`; request trùng trả lại kết quả cũ, không ghi lần hai. Task 11 mở rộng bảng này cho đồng bộ offline.
- Chuyển trạng thái Stop: `PENDING` → `ARRIVED` (check-in, ghi `arrivedAt`, `timeSource = 'DEVICE'`) → `COMPLETED` (ghi `occurredAt`, `departedAt`, `syncedAt`). Không hoàn tất Stop khi Stop trước còn `PENDING` (trừ khi Stop trước `SKIPPED`), trả mã `STOP_OUT_OF_ORDER` (mã mới, thêm vào `packages/shared`). Stop `requiresProof = true` thiếu ảnh bắt buộc trả `PROOF_REQUIRED` (mã mới).
- Bắt đầu chuyến theo spec 03 mục 1 bước 6: chỉ lúc này `drivers.status = 'ON_DUTY'`, `tractors.status = 'IN_USE'` (rơ moóc `IN_USE`), `actualStart` của chuyến, khóa dòng theo thứ tự tài xế → đầu kéo → rơ moóc. Ghi `audit_logs` cho assignment và chuyến; publish `dispatch.updated` để Kanban cập nhật.
- Hoàn tất Stop cuối của chuyến: chuyến `COMPLETED`, `actualEnd`, assignment `COMPLETED`, tài nguyên về `AVAILABLE`, cập nhật trạng thái container và Order theo máy trạng thái của task 04, gọi `onTripCompleted` của task 09 (ghi lương). Tất cả trong một transaction. Task này chỉ phụ thuộc 06: nếu task 09 chưa xong thì để `onTripCompleted` là hàm rỗng có test gọi đúng 1 lần, ghi `decisions.md`.
- Ảnh: app xin presigned PUT URL (hạn ngắn, giới hạn kích thước, chỉ `image/jpeg`, `image/png`, `application/pdf`), tải thẳng lên S3, rồi gọi xác nhận để ghi `attachments` (`ownerType = 'ORDER_STOP'`, `kind` là `EIR`, `EPOD`, `SEAL_PHOTO`, `sha256`, `capturedAt` từ EXIF, `capturedLat/Lng`). Server kiểm tra object tồn tại và đúng kích thước trước khi ghi. Xem ảnh qua Signed URL hạn ngắn, kiểm tra quyền trước khi cấp (spec 08 mục 2).
- Thời gian lưu `DATETIME(3)` UTC; app hiển thị theo múi giờ tenant trả về trong hồ sơ đăng nhập.
- Không log token, số CCCD, GPLX, SĐT (spec 08 mục 4).

## Các bước
### Bước 1 — Schema token, sự kiện tài xế và ảnh
- Chốt `driver_refresh_tokens` và `driver_events` trong `decisions.md`, cập nhật spec 02; thêm `attachments` nếu task 09 chưa tạo.
- `drizzle-kit generate`, đọc SQL; seed: 2 tài xế có tài khoản `DRIVER` cùng tenant, 1 tài xế tenant khác, mỗi người 1 chuyến hôm nay.
- Viết trước test tenant isolation và test chủ sở hữu cho `DriverEventRepo`, `RefreshTokenRepo`, `AttachmentRepo` (Testcontainers MariaDB).
**Kiểm tra:** `pnpm db:migrate` chạy trên DB trống và DB có dữ liệu seed các task trước; `pnpm db:seed` không lỗi; `pnpm test --filter core -- driver-event.repo refresh-token.repo attachment.repo` xanh.

### Bước 2 — Đăng nhập tài xế bằng JWT
- Test trước trong `packages/core/modules/identity/driver-auth.test.ts`: đăng nhập bằng SĐT + mật khẩu ra access và refresh token; access token hết hạn bị từ chối 401; refresh xoay vòng và token cũ không dùng lại được; tài xế `INACTIVE` không refresh được; user không có role `DRIVER` không vào được `/api/v1/driver/*`; sai mật khẩu nhiều lần bị khóa tạm theo cấu hình task 01.
- Viết `driver-auth.ts` và Route Handler `apps/web/src/app/api/v1/driver/auth/{login,refresh,logout}/route.ts` (zod, rate-limit).
**Kiểm tra:** `pnpm test --filter core -- driver-auth` xanh; `curl -X POST /api/v1/driver/auth/login` với tài khoản seed trả 200 có `accessToken`, sai mật khẩu trả 401 kèm thông báo tiếng Việt.

### Bước 3 — Lệnh hôm nay và quyền sở hữu
- Test trước (test tích hợp Route Handler + Testcontainers): `GET /api/v1/driver/assignments/today` chỉ trả assignment của tài xế trong token, sắp theo giờ kế hoạch; tài xế A gọi `GET /api/v1/driver/trips/{id}` của tài xế B nhận 404; tài xế tenant khác nhận 404; ngày "hôm nay" cắt theo múi giờ tenant (ca 23:30 giờ Việt Nam).
- Viết `driver.service.ts` (`listTodayAssignments`, `getTripDetail`) và Route Handler tương ứng.
**Kiểm tra:** `pnpm test --filter web -- driver-api` xanh, gồm ca "tài xế chỉ thấy assignment của chính mình".

### Bước 4 — Bắt đầu chuyến, check-in và hoàn tất Stop
- Test trước: bắt đầu chuyến đổi trạng thái tài xế, đầu kéo, rơ moóc, assignment, chuyến đúng spec 03 mục 1 bước 6 và có audit; check-in ghi `arrivedAt` + `timeSource = 'DEVICE'`; hoàn tất Stop 3 khi Stop 2 còn `PENDING` trả `STOP_OUT_OF_ORDER`; Stop `requiresProof` thiếu ảnh trả `PROOF_REQUIRED`; gửi cùng `clientEventId` 2 lần chỉ ghi 1 lần; hoàn tất Stop cuối làm chuyến `COMPLETED`, tài nguyên `AVAILABLE`, `onTripCompleted` được gọi đúng 1 lần.
- Viết `startTrip`, `checkInStop`, `completeStop` và Route Handler `POST /api/v1/driver/trips/{id}/start`, `POST /api/v1/driver/stops/{id}/check-in`, `POST /api/v1/driver/stops/{id}/complete`.
**Kiểm tra:** `pnpm test --filter core -- driver.service` xanh; mở `/dispatch` trên web, gọi API bắt đầu chuyến thì thẻ chuyển sang cột "Đang chạy" qua SSE.

### Bước 5 — Upload ảnh chứng từ presigned
- Test trước (Testcontainers MinIO hoặc S3 giả trong `lib/storage`): `POST /api/v1/driver/attachments/presign` trả URL có key `tenants/{tenantId}/...`, từ chối loại file và kích thước không cho phép; xác nhận ảnh ghi `attachments` với `sha256`, EXIF; xác nhận khi object chưa có trên S3 bị từ chối; tài xế không gắn ảnh vào Stop của người khác; Signed URL xem ảnh hết hạn đúng thời gian.
- Viết `lib/storage` (nếu task 09 chưa có), `attachment.service.ts` và Route Handler `presign`, `confirm`.
**Kiểm tra:** `pnpm test --filter core -- attachment` xanh; ảnh tải lên thấy trong MinIO console dưới đúng tiền tố tenant.

### Bước 6 — App Expo: đăng nhập và danh sách lệnh
- Dựng `apps/driver-app` (Expo + TypeScript, dùng `packages/shared`), theme từ `designs/tokens.json`, màn đăng nhập, lưu token an toàn trên máy, tự refresh.
- Màn Lệnh: header "N chuyến còn lại · hạn gần nhất", thẻ "Việc tiếp theo" có một nút chính, danh sách chuyến hôm nay, đủ 4 trạng thái; bottom nav 4 mục, 3 mục chưa làm hiện khung "Chưa mở trong bản này".
- Test thành phần cho danh sách lệnh và 4 trạng thái.
**Kiểm tra:** `pnpm test --filter driver-app` xanh; chạy `pnpm --filter driver-app start` trên máy ảo Android 390×844: đăng nhập tài khoản seed thấy đúng chuyến của mình, tắt server thấy trạng thái Lỗi giữ lệnh cũ và nút "Thử lại".

### Bước 7 — App Expo: chạy chuyến theo Stop và chụp ảnh
- Chi tiết chuyến: timeline Stop (ví dụ PICK_EMPTY → STUFFING → PORT_IN), TWIN_20 hiện 2 cont; nút "Bắt đầu chuyến"; check-in 3 bước (Đã đến → chụp EIR, ePOD, Seal và ký nhận → Hoàn tất Stop); nút Hoàn tất bị khóa kèm lý do đến khi đủ ảnh; hiện thông báo tiếng Việt theo mã lỗi.
- Chụp ảnh bằng camera, tính `sha256`, đọc EXIF, upload presigned, hiện tiến độ.
**Kiểm tra:** trên máy ảo Android chạy hết một chuyến seed từ Bắt đầu đến Stop cuối, ảnh xuất hiện trong MinIO và trong `attachments`; trên web thẻ chuyến về cột "Hoàn thành chờ chứng từ"; vùng chạm đo được ≥ 48px.

### Bước 8 — Hoàn tất
- Chạy toàn bộ kiểm tra, cập nhật progress.md, đổi trạng thái task trong `docs/tasks/README.md`, cập nhật spec 02 cho bảng mới và spec 05 cho mã lỗi mới.
**Kiểm tra:** `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` không lỗi; `pnpm e2e` cho luồng web thấy chuyến đổi trạng thái khi gọi API tài xế; migration chạy trên DB trống và DB có dữ liệu; mọi Route Handler có `requireRole(['DRIVER'])` và zod; đạt "Chấp nhận khi" của ticket: tài xế chỉ thấy assignment của chính mình.
