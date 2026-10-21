# 13-gps-pipeline — Pipeline GPS (Redis Stream + MariaDB partition)

> Giai đoạn: GĐ4 · Phụ thuộc: 05 · Nhánh git: `feat/13-gps-pipeline`
> Nguồn: `docs/specs/07_implementation_tickets.md` TICKET-13; spec `04_telemetry_and_fuel.md` mục 1.0 (nguồn dữ liệu và xác thực), 1.1 (Hot Path), 1.2 (Cold Path, bảo trì partition, tổng hợp quãng đường, giám sát); spec `02_database_schema.md` bảng `gps_devices`, `gps_logs` và mục 3 (migration partition); spec `00_system_overview_and_adrs.md` ADR-002, ADR-003, ADR-007; spec `08_nonfunctional_security_ops.md` mục 1 (quy mô), mục 2 (API key, rate-limit), mục 4 (giám sát lag); PRD `docs/PRD.md` mục C8

## Mục tiêu
Sau task này, mọi thiết bị GPS gắn trên đầu kéo đẩy vị trí về hệ thống 10 giây một lần mà không làm nặng MariaDB, và không mất điểm nào kể cả khi worker chết giữa chừng. Điều vận mở bản đồ đội xe thấy vị trí mới nhất của tới 500 xe trễ dưới 30 giây, xe mất tín hiệu quá 15 phút hiện xám, và xem lại lộ trình trong ngày của từng xe.

## Phạm vi
**Làm:**
- Bảng `gps_devices` (Drizzle) và `gps_logs` (migration SQL thủ công, `PARTITION BY RANGE COLUMNS(recorded_at)` theo tháng, không FK).
- Xác thực thiết bị bằng API key (hoặc chữ ký HMAC) lưu dạng hash; server tra `gps_devices` → `tractorId` → `tenantId`, không tin `tenantId`/`tractorId` trong payload.
- `/api/v1/gps/ingest` nhận `{ deviceId, lat, lng, speed, heading, ignition, recordedAt }`, nhận theo lô; bỏ điểm ngoài lãnh thổ phục vụ, `recordedAt` ở tương lai quá 5 phút, tốc độ phi lý; rate-limit theo thiết bị.
- Interface `GpsIngestAdapter` cho 2 kiểu: push trực tiếp và pull định kỳ từ API nhà cung cấp (job worker).
- Hot path: Redis Hash `tenant:{tenantId}:fleet:locations` chỉ ghi khi `recordedAt` mới hơn; `XADD gps:ingest MAXLEN ~ 2000000`.
- Cold path: worker chạy liên tục với consumer group, `XREADGROUP COUNT 1000 BLOCK 5000`, bulk `INSERT IGNORE` vào `gps_logs`, `XACK` sau khi ghi thành công, `XAUTOCLAIM` nhận lại bản ghi treo.
- Job bảo trì partition hằng tháng: tạo trước partition 2 tháng tới, xóa partition quá hạn lưu trữ.
- Job cuối ngày tổng hợp km/ngày/xe (bỏ điểm nhiễu) và cập nhật `tractors.currentOdometer` khi có `deviceOdometerKm`.
- Giám sát: cảnh báo khi lag stream vượt ngưỡng hoặc thiết bị không gửi quá N phút khi xe đang có chuyến.
- Màn Live Fleet Map (SSE `/api/v1/stream/fleet` hoặc polling 10 đến 15 giây) và Playback lộ trình.
- Script tải 500 xe × 10 giây trong 30 phút và kịch bản kill worker.

**Không làm (thuộc task khác):**
- Geofence, ghi `arrivedAt`/`departedAt`, xe "Chờ tại kho" và giờ chờ, mốc vào/ra geofence trên Playback (task 14).
- Dùng km GPS để kiểm tra dầu (task 15) và đề xuất `completionPercentage` cứu hộ (task 09 đọc lại dữ liệu của task này).
- Lớp rơ moóc đang thả trên bản đồ: danh sách đã có ở task 09; trên bản đồ chỉ hiện nếu dữ liệu sẵn, không làm logic mới.
- Gửi cảnh báo lag ra email/Zalo (task 23), runbook và dashboard giám sát production (task 24).
- Tích hợp cụ thể một nhà cung cấp GPS cho kiểu pull: chưa chốt nhà cung cấp (spec 01 mục 4), task này chỉ làm interface và adapter giả.

## Thiết kế
- Bảng task ghi "không có giao diện", nhưng ticket yêu cầu màn Live Fleet Map và Playback, nên task này dùng `designs/components/Screen05-FleetMap/` (đọc README.md và preview.html; 4 trạng thái: Bình thường; Đang tải là khung xương cho danh sách, sơ đồ, thẻ chi tiết và bảng; Trống là "chưa có xe nào gửi vị trí" kèm nút "Kiểm tra thiết bị GPS"; Lỗi là báo mất kết nối, giữ vị trí lúc cập nhật cuối, nút "Thử lại"; thêm trạng thái lọc không ra xe kèm "Xóa bộ lọc").
- Ký hiệu xe: đang chạy hình tròn `--primary` (đặc là có hàng, rỗng ruột là chạy rỗng), dừng lâu hình bát giác `--warn`, mất tín hiệu hình thoi rỗng viền `--accent`; mỗi trạng thái có hình, icon và chữ. Ký hiệu "Chờ tại kho/bãi" thuộc task 14.
- Thành phần: `designs/components/AppShell/` (chấm "Trực tiếp"), `designs/components/FilterTabs/`, `designs/components/Field/`, `designs/components/StatusChip/`, `designs/components/WorkTable/` (bảng "Đầu kéo theo khu vực" thay thế cho sơ đồ), `designs/components/Alert/`, `designs/components/EmptyState/`, `designs/components/Button/`.

## Quyết định kiến trúc
- Nghiệp vụ ở `packages/core/modules/telemetry/` (`ingest.service.ts`, `flush.service.ts`, `partition.service.ts`, `distance.service.ts`, `repo.ts`, `schema.ts`); Redis key và client ở `packages/core/lib/redis`; worker ở `apps/worker/src/jobs/` (`gps-flush.ts`, `gps-partition.ts`, `gps-daily-distance.ts`, `gps-pull.ts`).
- Không bao giờ `INSERT` đơn lẻ từng điểm vào MariaDB trong request ingest (spec 04 mục 1). Request ingest chỉ ghi Redis.
- Ingest là ngoại lệ có kiểm soát của `getTenantDb(ctx)`: tra `gps_devices` theo `(provider, externalId)` không có tenant trong context (unique của spec 02 không bắt đầu bằng `tenant_id`), rồi dựng `ctx` từ `tenantId` của thiết bị cho mọi thao tác sau. Hàm tra cứu này nằm riêng trong `telemetry/device-auth.ts` và có test; ghi `decisions.md`.
- API key thiết bị lưu dạng hash (`gps_devices.apiKeyHash`), so sánh thời gian hằng; có nhật ký truy cập; rate-limit theo thiết bị bằng Redis. Route Handler `apps/web/src/app/api/v1/gps/ingest/route.ts` không dùng `requireRole` của người dùng mà dùng xác thực thiết bị, vẫn validate zod (cả lô).
- Điểm không hợp lệ bị bỏ và đếm metric, không làm hỏng cả lô. "Lãnh thổ phục vụ" cấu hình bằng khung tọa độ (mặc định Việt Nam), "tốc độ phi lý" cấu hình ngưỡng (đề xuất 150 km/h); chốt trong plan.md.
- Hot path: so `recordedAt` trước khi `HSET` bằng script Lua để nguyên tử; điểm gửi dồn sau mất sóng vẫn vào stream nhưng không đè vị trí mới hơn. Mọi key Redis có tiền tố tenant, riêng stream `gps:ingest` dùng chung và mỗi bản ghi mang `tenantId`, `tractorId`.
- Cold path: `INSERT IGNORE` theo PK `(tenant_id, tractor_id, recorded_at)` để chống trùng khi retry; chỉ `XACK` sau khi insert thành công; `XAUTOCLAIM` định kỳ cho bản ghi pending quá thời gian. Worker chạy liên tục, không phải cron 5 phút.
- Partition: `gps_logs` tạo bằng SQL thủ công trong thư mục migration (Drizzle chỉ dùng để query). Job tháng `REORGANIZE PARTITION pmax` để tạo trước 2 tháng. Thời hạn lưu trữ cấu hình theo tenant nhưng partition chia theo tháng cho mọi tenant: xóa partition theo thời hạn lớn nhất trong các tenant, tenant có thời hạn ngắn hơn xóa bằng `DELETE` theo lô; con số tối thiểu chờ pháp chế xác nhận (spec 04 mục 1.2). Ghi `decisions.md`.
- Tổng hợp quãng đường: spec 02 chưa có bảng lưu km/ngày/xe; đề xuất `tractor_daily_distances (tenant_id, tractor_id, date, distance_km DECIMAL(10,2), point_count, created_at)` với `UNIQUE(tenant_id, tractor_id, date)`, ngày cắt theo múi giờ tenant; ghi `decisions.md` và cập nhật spec 02. Job chạy lại cùng ngày ghi đè đúng 1 dòng (idempotent).
- Hai liên kết `tractors.gpsDeviceId` và `gps_devices.tractorId` cùng có trong spec 02: lấy `gps_devices.tractorId` làm nguồn sự thật, đồng bộ cột kia khi gắn thiết bị; ghi `decisions.md`.
- Màn bản đồ đọc từ Redis Hash, đẩy cập nhật qua SSE `apps/web/src/app/api/v1/stream/fleet/route.ts` (có `requireRole` cho các role xem bản đồ: `DISPATCHER`, `FLEET_MANAGER`, `ADMIN`, `OWNER`) hoặc polling 10 đến 15 giây; không gọi Server Action liên tục. Playback đọc `gps_logs` theo `(tenant_id, tractor_id, recorded_at)` trong một ngày.
- Thời gian `DATETIME(3)` UTC (`recordedAt` giờ thiết bị, `receivedAt` giờ server); hiển thị theo múi giờ tenant. Vị trí tài xế là dữ liệu cá nhân: không log tọa độ kèm tên tài xế (spec 08 mục 2, mục 4).
- Giám sát: metric độ dài pending của consumer group (lag), số điểm bị bỏ, số thiết bị mất kết nối; cảnh báo khi lag vượt ngưỡng (spec 08: lag GPS > 5 phút).

## Các bước
### Bước 1 — Schema `gps_devices`, migration partition `gps_logs`
- Thêm `gps_devices` vào `packages/core/lib/db/schema/telemetry.ts` đúng spec 02; viết migration SQL thủ công cho `gps_logs` đúng spec 02 mục 3 (partition tháng hiện tại, tháng sau và `pmax`); thêm `tractor_daily_distances` sau khi ghi `decisions.md`.
- Seed: 3 thiết bị gắn 3 đầu kéo của 2 tenant, API key in ra màn hình lúc seed.
- Viết trước test tenant isolation cho `GpsDeviceRepo`, `GpsLogRepo`, `DailyDistanceRepo` (Testcontainers MariaDB).
**Kiểm tra:** `pnpm db:migrate` chạy trên DB trống và DB có dữ liệu của task 05; `SHOW CREATE TABLE gps_logs` có `PARTITION BY RANGE COLUMNS`; `pnpm db:seed` không lỗi; `pnpm test --filter core -- gps-device.repo gps-log.repo daily-distance.repo` xanh.

### Bước 2 — Xác thực thiết bị và endpoint ingest
- Test trước: API key sai trả 401; `tenantId`/`tractorId` gửi trong payload bị bỏ qua, tenant lấy từ thiết bị; lô 50 điểm có 3 điểm lỗi (ngoài lãnh thổ, tương lai 6 phút, tốc độ 300 km/h) nhận 47; vượt rate-limit trả 429; thiết bị `isActive = false` bị từ chối.
- Viết `device-auth.ts`, `ingest.service.ts`, `GpsIngestAdapter` (push và adapter pull giả, job `gps-pull.ts` khung) và Route Handler.
**Kiểm tra:** `pnpm test --filter core -- gps-ingest` xanh; `curl -X POST /api/v1/gps/ingest` với key seed trả 202 và số điểm nhận.

### Bước 3 — Hot path Redis
- Test trước (Testcontainers Redis): điểm mới ghi vào Hash; điểm cũ hơn gửi dồn không đè Hash nhưng vẫn vào stream; key có tiền tố tenant; stream bị cắt quanh `MAXLEN ~ 2000000`.
- Viết script Lua so sánh và ghi, `XADD`.
**Kiểm tra:** `pnpm test --filter core -- gps-hotpath` xanh; `redis-cli HGETALL tenant:{id}:fleet:locations` trên dev thấy vị trí thiết bị seed.

### Bước 4 — Cold path worker và chống mất dữ liệu
- Test trước (Testcontainers MariaDB + Redis): 10.000 điểm vào stream thì `gps_logs` có đúng 10.000 dòng; gửi trùng điểm không thêm dòng (`INSERT IGNORE`); giả lập worker chết sau khi insert nhưng trước `XACK` thì worker khác nhận lại qua `XAUTOCLAIM` và không trùng; giả lập chết trước insert thì không mất điểm.
- Viết `flush.service.ts` và `apps/worker/src/jobs/gps-flush.ts` chạy liên tục với consumer group.
**Kiểm tra:** `pnpm test --filter worker -- gps-flush` xanh; `XPENDING gps:ingest` về 0 sau khi dừng bơm dữ liệu.

### Bước 5 — Bảo trì partition, quãng đường ngày và giám sát
- Test trước: job tháng tạo đúng partition 2 tháng tới và chạy lại không lỗi; xóa partition quá hạn theo thời hạn lớn nhất; tenant thời hạn ngắn hơn bị `DELETE` đúng phần; job km ngày bỏ điểm nhiễu (nhảy xa phi lý), cắt ngày theo múi giờ tenant, chạy lại không sinh dòng trùng; `tractors.currentOdometer` cập nhật từ `deviceOdometerKm`; metric lag và cảnh báo thiết bị im lặng khi xe có chuyến.
- Viết `partition.service.ts`, `distance.service.ts`, các job worker và metric.
**Kiểm tra:** `pnpm test --filter core -- gps-partition gps-distance` xanh; `SELECT PARTITION_NAME FROM information_schema.PARTITIONS WHERE TABLE_NAME = 'gps_logs'` có đủ 2 tháng tới.

### Bước 6 — Thử tải và kịch bản kill worker
- Viết `scripts/gps-loadtest.mjs` giả lập 500 xe gửi 10 giây một lần trong 30 phút (180.000 điểm), ghi lag stream mỗi phút; lệnh `pnpm gps:loadtest`.
- Chạy lần hai, giữa chừng kill tiến trình worker rồi khởi động lại.
**Kiểm tra:** sau mỗi lần chạy, số dòng `gps_logs` trong khoảng thời gian thử bằng đúng số điểm hợp lệ đã gửi; lag stream không tăng dần theo thời gian (ghi đồ thị số liệu vào Nhật ký); lần có kill worker vẫn đủ điểm, `XPENDING` về 0.

### Bước 7 — Màn Live Fleet Map và Playback
- `apps/web/src/features/fleet-map/` và route `apps/web/src/app/(tenant)/fleet/map/page.tsx`: danh sách xe bên trái có tìm không cần gõ dấu và chip lọc có đếm số, sơ đồ SVG `role="img"` có `aria-label`, thẻ chi tiết xe, bảng "Đầu kéo theo khu vực"; xe mất tín hiệu quá 15 phút hiện hình thoi xám "Mất kết nối"; cập nhật qua SSE; đủ 4 trạng thái.
- Playback: chọn xe và ngày, thanh tua, Phát/Tạm dừng, tốc độ 60×/300×/900×.
**Kiểm tra:** mở `/fleet/map` trên 1440×900 và 1366×768 khi đang chạy `pnpm gps:loadtest`: vị trí đổi trong vòng 30 giây, so với `Screen05-FleetMap/preview.html` đúng ký hiệu và chữ; tắt Redis thì thấy trạng thái Lỗi giữ vị trí cũ và "Thử lại"; `pnpm e2e -- fleet-map` xanh.

### Bước 8 — Hoàn tất
- Chạy toàn bộ kiểm tra, cập nhật progress.md, đổi trạng thái task trong `docs/tasks/README.md`, cập nhật spec 02 và spec 04 cho các chỗ đã chốt.
**Kiểm tra:** `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` không lỗi; `pnpm e2e` cho màn bản đồ; migration chạy trên DB trống và DB có dữ liệu; mọi repo mới có test tenant isolation; Route Handler ingest có xác thực thiết bị và zod, SSE có `requireRole`; đạt "Chấp nhận khi" của ticket: test tải 500 xe × 10 giây trong 30 phút không mất điểm, lag stream ổn định; kill worker giữa chừng không mất dữ liệu.
