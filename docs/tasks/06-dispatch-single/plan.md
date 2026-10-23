# Kế hoạch 06-dispatch-single

_Kế hoạch đã duyệt ở Plan mode ngày 23/10/2026, lưu nguyên văn._

# Kế hoạch 06-dispatch-single — Điều vận SINGLE, khóa bi quan, chống chồng lấn

## Bối cảnh
Sau task 04 (Order nhiều container, Stop) và 05 (đội xe, tài xế, giấy tờ, bảo dưỡng), hệ thống chưa có chuyến và gán tài nguyên. Task 06 thêm lõi điều vận: tạo chuyến SINGLE cho một container, gán tài xế + đầu kéo + rơ moóc an toàn khi nhiều Điều vận thao tác đồng thời, chặn gán sai (giấy tờ, bảo dưỡng, genset, hàng nguy hiểm, cảng chưa sẵn sàng). Không có giao diện; task 07 dựng Kanban trên service này.

Nhánh `feat/06-dispatch-single` đã tạo từ `feat/05-fleet-drivers` (đã commit 05). README dòng 06 đã đổi sang 🔄.

## Quyết định đã chốt với người dùng (ghi vào decisions.md ở Bước 1)
1. **Mỗi Stop một assignment**: mỗi Stop của container trong chuyến có một dòng `dispatch_assignments` cùng bộ tài nguyên và cùng khung giờ chuyến; kiểm tra chồng lấn bỏ qua các dòng cùng `consolidatedTripId`. Task 20 (lương) phải gom theo chuyến; task 09 tách chặng Drop/Hook từ các dòng này.
2. **Giờ lái**: chỉ giới hạn tổng giờ kế hoạch/ngày (mặc định 10 giờ, múi giờ tenant). Mốc 4 giờ liên tục để task sau (cần dữ liệu GPS).
3. **Rule 2**: bỏ phần tự trọng đầu kéo (bảng `tractors` chưa có cột), chỉ chặn khi cont vượt `maxPayloadTons` rơ moóc; kiểm tra tổng cont + tare rơ moóc so với `permittedGrossWeightTons` đầu kéo; cảnh báo nêu rõ đã bỏ tự trọng đầu kéo. Không đổi schema task 05.
4. **Trạng thái xa giờ**: tài xế `OFF_DUTY` luôn bị chặn; `status` đầu kéo/rơ moóc/tài xế khác chỉ kiểm tra khi chuyến bắt đầu trong 30 phút; xa hơn chỉ dựa vào chồng lấn assignment và bảo dưỡng.

## Suy ra từ spec (báo cáo ở Bước 1, ghi decisions.md, không dừng)
- **Mã lỗi** (khai báo ở `packages/shared/errors.ts`, có thông điệp tiếng Việt):
  `DRIVER_NOT_AVAILABLE`, `TRACTOR_NOT_AVAILABLE`, `TRAILER_NOT_AVAILABLE` = không tồn tại / khác tenant / `INACTIVE` / xóa mềm / `OFF_DUTY` / `status` không rảnh khi bắt đầu trong 30 phút / bảo dưỡng chồng lấn (kèm `details.reason`).
  `RESOURCE_TIME_CONFLICT` = chồng lấn assignment (`details`: loại tài nguyên, mã chuyến gây trùng).
  `DOCUMENT_EXPIRED`, `RESOURCE_BUSY_RETRY` (lỗi MariaDB 1205 lock wait timeout và 1213 deadlock), `STALE_DATA` (đã có).
  Mới: `REEFER_REQUIRES_GENSET` (Rule 5), `DG_CERTIFICATE_REQUIRED` (Rule 6), `PORT_NOT_READY` (Rule 7), `PAYLOAD_EXCEEDED` (Rule 2), `WEIGHT_CONFIRMATION_REQUIRED` (thiếu khối lượng, cần cờ `confirmMissingWeight`), `DRIVING_HOURS_EXCEEDED`, `DRIVING_HOURS_OVERRIDE_FORBIDDEN` (không phải ADMIN mà gửi ghi đè), `CONTAINER_ALREADY_IN_TRIP`, `ORDER_NOT_CONFIRMED`.
- **Ghi đè giờ lái**: vượt giới hạn trả `DRIVING_HOURS_EXCEEDED` (UI hiện như cảnh báo có nút ghi đè cho ADMIN); gửi lại với `overrideDrivingHours: { reason }` bởi `ADMIN` thì gán được và `audit_logs` ghi lý do; role khác gửi cờ này nhận `DRIVING_HOURS_OVERRIDE_FORBIDDEN`. Quyền dùng `dispatch.overrideDriveHours` đã có.
- **Giờ Stop**: `order_stops` không có giờ kế hoạch; Rule 8 so `trip.plannedEnd` với `order.cutOffAt` cho Stop `PORT_IN`. Mọi assignment của chuyến dùng `plannedStart/End` của chuyến.
- **Rule 7**: chặn lúc `dispatchTrip`. `HOLD_CUSTOMS`/`HOLD_LINE` luôn chặn; Order `IMPORT` cần `READY_EDO`; `EXPORT` cần `READY_EMPTY_RELEASE`; `DOMESTIC` bỏ qua; Stop đầu không có `locationId` hoặc không ở cảng/depot thì bỏ qua (kiểm tra `locations.type` khi làm Bước 5).
- **Vỏ cont chuẩn** (Rule 2 khi chưa có VGM): hằng số trong `rules/physical.ts` (20ft 2,3 t; 40ft/45ft 3,8 t; RF cộng thêm), ghi decisions.md.
- **`dispatchedAt` NOT NULL**: đặt bằng thời điểm tạo assignment, cập nhật lại khi `dispatchTrip`.
- **`dispatchTrip`**: chỉ đổi trip `PLANNED` → `DISPATCHED`; container giữ `PLANNED` (state machine không có DISPATCHED); assignment giữ `ASSIGNED`.
- **`cancelAssignment`**: nhận `tripId + version`, chuyển mọi assignment đang hoạt động của chuyến sang `CANCELLED`, xóa `primary*` của trip, trip giữ `PLANNED`; tài nguyên đang `IN_USE`/`ON_DUTY` vì chuyến này (không còn assignment hoạt động khác) trả về `AVAILABLE`. Hủy cả chuyến thuộc task 08.
- **Gán lại**: nếu chuyến đã có assignment hoạt động, `assignResources` chuyển chúng sang `CANCELLED` rồi tạo mới trong cùng transaction.
- **Kênh Redis**: theo task.md, `tenant:{tenantId}:dispatch` (khác tiền tố `t:{tenantId}:` của `tenantKey`); ghi decisions.md để task 07 dùng đúng.
- **Tài xế seed cho 51C-482.17**: Phạm Quốc Huy (0x44, giấy tờ sạch) thay vì Trần Văn Lộc (GPLX còn 2 ngày); cặp rơ moóc 51R-112.23 (20FT, tare 3,8, payload 28), container `MAEU2388417` 20DC của Order IMP-2610-031 (`…9003-000000000021`).
- **Tải cấu hình tenant**: `tenants.settings` chưa có kiểu; thêm zod schema `tenantDispatchSettingsSchema` (mặc định 10 giờ) trong `packages/shared`, và `loadTenantSettings` được truyền vào factory (nối ở `apps/web/src/server/services.ts` qua accessor mới trong `modules/identity`, vì chỉ identity được dùng system-db).

## Cấu trúc mã (theo phong cách orders: factory + repo, AppError)
```
packages/shared/enums.ts            + TRIP_STATUSES, ALLOCATION_METHODS, ASSIGNMENT_TYPES, ASSIGNMENT_STATUSES
packages/shared/errors.ts           + mã lỗi mới
packages/shared/schemas/dispatch.ts zod: createSingleTrip, assignResources, dispatchTrip, cancelAssignment, updateTripTimes, listAvailability, tenantDispatchSettings
packages/core/lib/db/schema/dispatch.ts   3 bảng; export trong schema/index.ts
packages/core/lib/db/migrations/0006_dispatch.sql (+ journal, snapshot)
packages/core/lib/db/tenant-db.ts   transaction nhận tùy chọn lockWaitTimeoutSec (SET SESSION, trả lại mặc định ở finally); ánh xạ lỗi 1205/1213 -> RESOURCE_BUSY_RETRY
packages/core/lib/redis/publish.ts  publishDispatchUpdated(tenantId, payload), gọi sau commit
packages/core/lib/db/seeds/dispatch.ts + dispatch.test-data.ts + dispatch.int.test.ts; thêm vào seed.ts sau 'orders'
packages/core/modules/identity/permissions.ts   + 'dispatch.assign' (OWNER, ADMIN, DISPATCHER)
packages/core/modules/dispatch/
  repo.ts                 createTripRepo / tripContainerRepo / assignmentRepo (createTableRepo)
  trips.service.ts        createSingleTrip, updateTripTimes, dispatchTrip
  assign.service.ts       assignResources, cancelAssignment
  availability.query.ts   listResourceAvailability (không khóa)
  rules/{overlap,documents,maintenance,driving-hours,physical,port-readiness}.ts
  index.ts                createDispatchService({ tenantDb, now?, loadSettings, publish })
apps/web/src/server/services.ts       getDispatchService()
apps/web/src/features/dispatch/actions.ts  defineAction(...) cho 5 hành động; revalidatePath('/dispatch') sau ok
```
Tái sử dụng: `createTableRepo`, `getTenantDb`/`tx.select(..., {forUpdate})`, `nextNumber(tx,'TRIP:yyyy-mm')`, `writeAudit`, `toTenantDate`, `assertContainerTransition` (`modules/orders/state-machine.ts`), `findMaintenanceOverlap` (`modules/fleet/maintenance.service.ts`), `ok/fail` (`shared/result.ts`), `defineAction`, `startTestInfra` (`core/test/containers.ts`).

## Thiết kế lõi
- **Rule dạng hàm thuần**: mỗi file trong `rules/` nhận dữ liệu đã tải và trả `{ errors, warnings }`. `assignResources` gọi sau khi khóa; `listResourceAvailability` gọi cùng hàm trên dữ liệu không khóa, nên lý do khớp nhau. Cảnh báo có dạng `{ code, severity: 'info'|'warn'|'danger', resource, message, details }` trong `data.warnings`.
- **assignResources**: validate zod, `requireRole`, rồi trong một transaction (`innodb_lock_wait_timeout = 5`): khóa chuyến, khóa tài nguyên theo thứ tự `drivers → tractors → trailers` (cùng bảng sắp `id` tăng), kiểm tra tồn tại/tenant/trạng thái, rồi chồng lấn (bỏ qua cùng chuyến), bảo dưỡng, giấy tờ tại `plannedEnd`, giờ lái, vật lý, ghi assignment từng Stop, đồng bộ `primary*`, tăng `version` bằng `UPDATE ... WHERE version = ?`, `writeAudit`. Mọi đọc trước khi có khóa tài nguyên đều là locking read, để truy vấn chồng lấn (đọc thường) thấy dữ liệu đã commit của người đi trước; test đồng thời chứng minh điều này.
- Publish Redis và `revalidatePath` chỉ sau commit, ngoài transaction; lỗi thì không publish.
- Tenant isolation: mọi truy vấn qua `TenantDb`; mỗi repo mới có test tenant A/B. `trip_containers` khóa chính ghép (tripId, orderContainerId), không có cột `id`.

## Các bước (đúng task.md, mỗi bước xong dừng chờ "continue")
1. **Schema + migration `0006_dispatch` + seed + repo test**: viết `repo.int.test.ts` đỏ trước, rồi schema, `pnpm db:generate --name dispatch`, review SQL. Seed chuyến sáng (3 assignment cho 3 Stop, trip `TRIP-…`), nâng `number_sequences`, container về `PLANNED` (seed dispatch chạy sau orders). Ghi decisions.md các mục "Suy ra từ spec".
2. **Test đỏ**: `assign.concurrency.int.test.ts` (2 transaction song song đúng 1 thành công; chiều sau sáng thành công; ghép chéo 20 lần không deadlock; giữ khóa >5 giây thì `RESOURCE_BUSY_RETRY`) và `assign.rules.int.test.ts` (đủ các ca trong task.md).
3. **`trips.service`** (test trước): `createSingleTrip` (Order `CONFIRMED`, container `PENDING`, `tripCode` từ `nextNumber`, một dòng `trip_containers`, container sang `PLANNED`, audit), `updateTripTimes` có `version`.
4. **`assignResources` + `rules/overlap.ts` + bảo dưỡng + timeout khóa**. Kiểm tra: `assign.concurrency` xanh 5 lần liên tiếp.
5. **`documents`, `driving-hours`, `physical`, `port-readiness`** nối vào `assignResources` và `dispatchTrip`.
6. **Redis publish, `cancelAssignment`, `listResourceAvailability`, Server Action**, test action (VIEWER bị `FORBIDDEN`), đo p95 `assignResources` < 500 ms với 300 assignment trong ngày.
7. **Hoàn tất**: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`; migration trên DB trống và DB có dữ liệu; sửa spec 03 (assignment theo Stop, mã lỗi mới) nếu lệch; README → ✅.

## Kiểm tra end-to-end
- `pnpm db:migrate` (DB trống và DB có dữ liệu task 05), `pnpm db:seed` hai lần không trùng.
- `pnpm test --filter core -- dispatch`, `-- assign`, `-- trips`; `pnpm test --filter web -- dispatch`.
- Tiêu chí ticket: 2 transaction cùng tài xế chồng giờ đúng 1 thành công; chuyến chiều cho xe có chuyến sáng thành công; ghép chéo 20 lần không deadlock.
- Cần Docker Desktop chạy (Testcontainers MariaDB 11.4 + Redis 7). Không cài package mới; không đọc `.env`.

## Việc người dùng cần làm thủ công
Duyệt `plan.md`; sau mỗi bước trả lời "continue"; bật Docker Desktop khi chạy test tích hợp.
