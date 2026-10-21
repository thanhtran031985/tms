# 11-driver-offline-sync — Offline-first và đồng bộ app tài xế

> Giai đoạn: GĐ3 · Phụ thuộc: 10 · Nhánh git: `feat/11-driver-offline-sync`
> Nguồn: `docs/specs/07_implementation_tickets.md` TICKET-11; spec `05_advanced_workflows_and_ai.md` mục 3 (giao thức đồng bộ, xung đột, chuyển trạng thái hợp lệ, `clockSkewMs`, thứ tự tin cậy thời gian); spec `01_core_architecture_and_grill_logs.md` Rule 7 (Idempotency); spec `00_system_overview_and_adrs.md` ADR-006; spec `08_nonfunctional_security_ops.md` mục 7 (app chạy khi sóng yếu); spec `02_database_schema.md` bảng `order_stops` (`occurredAt`, `syncedAt`, `timeSource`), `attachments` (`sha256`); PRD `docs/PRD.md` mục D

## Mục tiêu
Sau task này, tài xế ở trong cảng mất sóng vẫn bấm check-in, hoàn tất Stop và chụp ảnh như bình thường; app lưu lại kèm giờ thao tác thật và tự gửi khi có mạng. Ảnh lớn đang tải dở khi mất sóng sẽ tải tiếp chứ không làm lại từ đầu. Nếu Điều vận đã sửa hoặc hủy Stop trong lúc tài xế offline, tài xế thấy rõ thao tác nào không được nhận và gọi Điều vận ngay, còn Điều vận nhận cảnh báo.

## Phạm vi
**Làm:**
- Outbox SQLite trên app: mỗi thao tác là một sự kiện `{ clientEventId (UUID), type, stopId, occurredAt, deviceMonotonicMs, lat, lng, payload }`, gửi theo đúng thứ tự tạo.
- Endpoint đồng bộ theo lô, xử lý idempotent theo `clientEventId` và trả kết quả từng sự kiện.
- Từ chối sự kiện sai thứ tự Stop có lý do, trừ khi Điều vận cho phép bỏ qua.
- Xung đột: Điều vận đã sửa hoặc hủy Stop trong lúc tài xế offline thì sự kiện không ghi đè, trả `CONFLICT`, app hiện cho tài xế và tạo cảnh báo cho Điều vận.
- Đồng hồ: app lấy giờ chuẩn từ server mỗi khi có mạng, lưu `clockSkewMs` và gửi kèm sự kiện; server lưu `occurredAt` đã hiệu chỉnh và `syncedAt`.
- Upload ảnh tiếp tục được (presigned multipart), sự kiện tham chiếu ảnh bằng `sha256`.
- Giao diện offline trên app: banner "Đang offline · N thao tác chờ gửi", hàng chờ (tiến độ ảnh, chi phí, vị trí), ô ảnh "Chờ tải lên", alert xung đột và nút gọi Điều vận.

**Không làm (thuộc task khác):**
- So `occurredAt` với thời điểm geofence, cờ `TIME_MISMATCH` và chọn nguồn thời gian GEOFENCE (task 14).
- Tính giờ chờ (detention) tại kho khách dựa trên `occurredAt` (task 14).
- OCR ảnh và EXIF dùng cho đối chiếu (task 12, task 14).
- Gửi thông báo ra ngoài app cho Điều vận (task 23); task này chỉ tạo cảnh báo trên Kanban qua Redis Pub/Sub.
- Nội dung sự kiện phiếu dầu và chi phí dọc đường (task 15, task 16); task này cung cấp outbox chung để các task đó dùng.

## Thiết kế
- `designs/components/Screen09-DriverApp/` (đọc README.md và preview.html; dùng prop `network` online / offline / conflict; 4 trạng thái danh sách lệnh như task 10: Bình thường, Đang tải khung xương, Trống "Chưa có lệnh nào hôm nay" + "Tải lại lệnh", Lỗi giữ lệnh cũ + "Thử lại").
- Offline theo README của màn: banner "Đang offline · 3 thao tác chờ gửi" mở ra hàng chờ (ảnh EIR 62%, chi phí Nâng hạ, vị trí GPS); ô ảnh chờ tải màu `off` + icon tải lên + chữ "Chờ tải lên"; chi phí chuyển "Chờ gửi"; xung đột là alert `crit` "Check-in Stop 2 không được nhận" và nút gọi Điều vận.
- Thành phần: `designs/components/Alert/`, `designs/components/StatusChip/`, `designs/components/Button/`.

## Quyết định kiến trúc
- Server: `packages/core/modules/dispatch/driver-sync.service.ts`, Route Handler `apps/web/src/app/api/v1/driver/sync/route.ts` và `apps/web/src/app/api/v1/driver/time/route.ts`; zod schema sự kiện dùng chung ở `packages/shared/driver-events.ts`. Bắt đầu bằng `requireRole(['DRIVER'])`, `tenantId` và `driverId` lấy từ JWT.
- Idempotent (Rule 7): mở rộng bảng `driver_events` của task 10 với `device_monotonic_ms`, `clock_skew_ms`, `lat`, `lng`, `payload` (JSON, validate zod khi đọc), `result_code`, `reject_reason`. `UNIQUE(tenant_id, client_event_id)`; sự kiện đã có thì trả lại đúng kết quả cũ, không ghi lần hai. Cập nhật spec 02.
- Mỗi sự kiện xử lý trong transaction riêng, theo thứ tự app gửi; một sự kiện bị từ chối không làm hỏng các sự kiện độc lập phía sau, nhưng sự kiện sau trên cùng Stop phụ thuộc sự kiện bị từ chối cũng bị từ chối có lý do.
- Kết quả từng sự kiện: `OK`, `DUPLICATE` (kèm kết quả lần đầu), `CONFLICT`, `STOP_OUT_OF_ORDER`, `PROOF_REQUIRED`, `VALIDATION_ERROR`; mã cố định trong `packages/shared`, câu thông báo tiếng Việt nói chuyện gì xảy ra và làm gì tiếp.
- Thứ tự Stop: từ chối `COMPLETED` Stop N khi Stop trước còn `PENDING`. "Điều vận cho phép bỏ qua" làm bằng cách Điều vận chuyển Stop trước sang `SKIPPED` (có audit); spec chưa nói cơ chế, ghi `decisions.md`.
- Phát hiện xung đột: sự kiện mang `stopUpdatedAt` mà app đã thấy; server trả `CONFLICT` khi assignment của Stop không còn thuộc tài xế hoặc đã `CANCELLED`, Stop đã `SKIPPED`, hoặc Stop bị Điều vận sửa sau mốc đó. `order_stops` không có cột `version` nên dùng `updatedAt` (đề xuất, ghi `decisions.md`). Khi xung đột: không ghi đè, ghi `driver_events` với `result_code = 'CONFLICT'`, publish `dispatch.conflict` lên Redis Pub/Sub để Kanban hiện cảnh báo.
- Thời gian: `occurredAt` server lưu = giờ thiết bị cộng `clockSkewMs`, `timeSource = 'DEVICE'`, `syncedAt` = giờ server nhận. Mọi tính trễ giờ và giờ chờ phải dùng `occurredAt`, không dùng `syncedAt` (spec 05 mục 3). `deviceMonotonicMs` dùng để giữ thứ tự khi giờ thiết bị bị chỉnh tay. Lưu `DATETIME(3)` UTC.
- Ảnh: presigned multipart (`init`, `parts`, `complete`) trên `lib/storage`, key `tenants/{tenantId}/...`; app nhớ `uploadId` và phần đã xong trong SQLite để tải tiếp. Sự kiện tham chiếu ảnh bằng `sha256`; server chấp nhận sự kiện tham chiếu ảnh chưa tải xong và gắn `attachments` khi ảnh về (đề xuất, ghi `decisions.md`). Cùng `sha256` gửi lại không tạo `attachments` thứ hai.
- App: outbox bằng `expo-sqlite` ở `apps/driver-app/src/outbox/`, gửi tuần tự có backoff, chỉ xóa khỏi outbox khi server trả kết quả cuối (`OK`, `DUPLICATE`, hoặc bị từ chối đã hiện cho tài xế). Dữ liệu outbox không chứa token.
- Tenant và quyền sở hữu: sự kiện cho Stop không thuộc assignment của tài xế bị từ chối như không tồn tại; mọi truy vấn qua `getTenantDb(ctx)`.

## Các bước
### Bước 1 — Mở rộng schema sự kiện và test đỏ cho idempotent
- Thêm cột cho `driver_events`, migration, cập nhật spec 02; zod schema sự kiện trong `packages/shared/driver-events.ts`.
- Viết trước test trong `driver-sync.test.ts` (Testcontainers MariaDB): gửi cùng 1 sự kiện 3 lần chỉ ghi 1 lần và lần 2, 3 trả `DUPLICATE` kèm kết quả lần đầu; 2 request song song cùng `clientEventId` chỉ 1 dòng; test tenant isolation cho `DriverEventRepo` mở rộng.
**Kiểm tra:** `pnpm db:migrate` chạy trên DB trống và DB có dữ liệu của task 10; `pnpm test --filter core -- driver-sync` chạy và đỏ đúng ở các ca chưa viết code (ghi vào Nhật ký), test repo xanh.

### Bước 2 — Endpoint đồng bộ theo lô, thứ tự Stop và giờ chuẩn
- Viết `driver-sync.service.ts` (`syncEvents`) và Route Handler `POST /api/v1/driver/sync`, `GET /api/v1/driver/time`.
- Test: lô 5 sự kiện trả 5 kết quả đúng thứ tự; `COMPLETED` Stop 3 khi Stop 2 còn `PENDING` bị từ chối `STOP_OUT_OF_ORDER` có lý do; Stop 2 đã `SKIPPED` bởi Điều vận thì Stop 3 được nhận; `occurredAt` lưu đã cộng `clockSkewMs`, `syncedAt` là giờ server; sự kiện đến muộn 2 giờ vẫn giữ `occurredAt` gốc.
**Kiểm tra:** `pnpm test --filter core -- driver-sync` xanh, gồm 2 ca của "Chấp nhận khi".

### Bước 3 — Xung đột với thay đổi của Điều vận
- Test trước: Điều vận hủy assignment trong lúc tài xế offline thì sự kiện check-in trả `CONFLICT` và Stop không đổi; Điều vận sửa Stop sau `stopUpdatedAt` thì `CONFLICT`; có sự kiện `dispatch.conflict` publish lên Redis (Testcontainers Redis); sự kiện không xung đột trong cùng lô vẫn được nhận.
- Viết phần phát hiện xung đột và cảnh báo trên Kanban (badge trên thẻ container, dựng theo `StatusChip` `crit`).
**Kiểm tra:** `pnpm test --filter core -- driver-sync.conflict` xanh; mở `/dispatch` trên 1440×900, gửi sự kiện xung đột bằng script test thì thẻ hiện cảnh báo trong vòng 5 giây.

### Bước 4 — Upload ảnh tiếp tục được
- Test trước: `init` trả `uploadId` và key đúng tiền tố tenant; tải 3 phần, ngắt, gọi lại `parts` chỉ trả phần còn thiếu, `complete` ghép đúng `sha256`; `sha256` đã có thì không tạo `attachments` mới; sự kiện tham chiếu ảnh chưa xong được nhận và gắn ảnh khi `complete`.
- Viết multipart trong `lib/storage` và Route Handler `apps/web/src/app/api/v1/driver/attachments/multipart/{init,parts,complete}/route.ts`.
**Kiểm tra:** `pnpm test --filter core -- multipart` xanh với MinIO trong Testcontainers.

### Bước 5 — Outbox SQLite và bộ gửi trên app
- `apps/driver-app/src/outbox/`: bảng outbox, ghi sự kiện mỗi lần tài xế bấm (kể cả khi online), bộ gửi tuần tự có backoff, đồng bộ giờ khi có mạng và lưu `clockSkewMs`, tải ảnh multipart tiếp từ phần đã xong.
- Màn check-in và hoàn tất Stop của task 10 chuyển sang ghi qua outbox thay vì gọi API trực tiếp.
- Test đơn vị cho outbox: thứ tự gửi, không mất sự kiện khi app bị tắt giữa chừng, xử lý từng mã kết quả.
**Kiểm tra:** `pnpm test --filter driver-app -- outbox` xanh; trên máy ảo Android bật chế độ máy bay, hoàn tất 2 Stop và chụp 1 ảnh, tắt hẳn app, mở lại và tắt chế độ máy bay: cả 2 sự kiện và ảnh lên server, `occurredAt` đúng giờ bấm.

### Bước 6 — Giao diện offline và xung đột trên app
- Banner offline có số thao tác chờ gửi, mở ra hàng chờ có tiến độ ảnh; ô ảnh "Chờ tải lên"; alert `crit` khi `CONFLICT` hoặc bị từ chối, kèm nút gọi Điều vận; danh sách lệnh vẫn đủ 4 trạng thái.
- Test thành phần cho 3 trạng thái mạng online / offline / conflict.
**Kiểm tra:** `pnpm test --filter driver-app` xanh; trên máy ảo Android 390×844 so với `Screen09-DriverApp/preview.html` ở `network=offline` và `network=conflict`: chữ, màu `off`/`crit` kèm icon và chữ, vùng chạm ≥ 48px.

### Bước 7 — Hoàn tất
- Chạy toàn bộ kiểm tra, cập nhật progress.md, đổi trạng thái task trong `docs/tasks/README.md`, cập nhật spec 02 và spec 05 mục 3 cho các chỗ đã chốt.
**Kiểm tra:** `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` không lỗi; `pnpm e2e` cho luồng web nhận cảnh báo xung đột; migration chạy trên DB trống và DB có dữ liệu; mọi Route Handler có `requireRole(['DRIVER'])` và zod; đạt "Chấp nhận khi" của ticket: gửi cùng 1 sự kiện 3 lần → chỉ ghi 1 lần; sự kiện đến sai thứ tự bị từ chối có lý do.
