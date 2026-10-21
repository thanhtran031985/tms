# 06-dispatch-single — Điều vận SINGLE, khóa bi quan và chống chồng lấn

> Giai đoạn: GĐ2 · Phụ thuộc: 04, 05 · Nhánh git: `feat/06-dispatch-single`
> Nguồn: `docs/specs/07_implementation_tickets.md` TICKET-06; spec `03_dispatch_and_concurrency.md` mục 1 (toàn bộ, bước 1 đến 9), mục 2 Rule 2, 5, 6, 7, 8 phần áp cho một container, mục 4 (Hủy assignment); spec `00_system_overview_and_adrs.md` ADR-004, ADR-008; spec `01_core_architecture_and_grill_logs.md` Rule 1, 4, 5, 8, 9 và mục 3 "kiểm tra xung đột theo khoảng thời gian"; spec `02_database_schema.md` bảng `consolidated_trips`, `trip_containers`, `dispatch_assignments`; spec `08_nonfunctional_security_ops.md` mục 1 (p95 < 500 ms); PRD `docs/PRD.md` mục F3

## Mục tiêu
Sau task này, Điều vận lập chuyến SINGLE cho một container và gán tài xế, đầu kéo, rơ moóc cho chuyến đó qua service và Server Action. Khi hai Điều vận cùng gán một tài xế cho hai chuyến chồng giờ, đúng một người thành công, người kia nhận lý do rõ ràng. Xe đang chạy chuyến sáng vẫn xếp được chuyến chiều, và hệ thống chặn gán khi giấy tờ hết hạn, xe đang bảo dưỡng, cont lạnh không có rơ moóc genset hoặc cont chưa sẵn sàng tại cảng.

## Phạm vi
**Làm:**
- Bảng `consolidated_trips`, `trip_containers`, `dispatch_assignments`; migration; seed chuyến mẫu.
- Tạo chuyến `SINGLE` cho một container (`tripCode` từ `nextNumber`), liên kết qua `trip_containers`, container chuyển `PLANNED`.
- Service `assignResources` đúng spec 03 mục 1: transaction, thứ tự khóa, kiểm tra tồn tại/cùng tenant/không `INACTIVE`/không xóa mềm, chồng lấn thời gian cho cả tài xế, đầu kéo, rơ moóc, bảo dưỡng chồng lấn, giấy tờ còn hạn tại `plannedEnd` (cảnh báo 15 ngày), giờ lái xe, điều kiện `AVAILABLE` khi chuyến bắt đầu trong 30 phút, mã lỗi, lưu assignment, đồng bộ cột `primary*`, tăng `version`, audit.
- Kiểm tra ràng buộc vật lý áp cho chuyến một container: tải trọng (Rule 2), cont lạnh cần genset (Rule 5), hàng nguy hiểm cần chứng chỉ (Rule 6), trạng thái sẵn sàng tại cảng chặn lúc Dispatch (Rule 7), cảnh báo cut-off (Rule 8).
- Timeout khóa `RESOURCE_BUSY_RETRY`, khóa lạc quan `STALE_DATA` khi sửa chuyến.
- Sau commit: `revalidatePath('/dispatch')` và publish sự kiện `dispatch.updated` lên Redis Pub/Sub.
- Chuyển chuyến `PLANNED` → `DISPATCHED`; hủy assignment (chuyển `CANCELLED`, không xóa).
- Truy vấn "tài nguyên gán được" cho một container và khung giờ, mỗi tài nguyên kèm lý do được hoặc không được điều, để task 07 dựng bảng gán xe.

**Không làm (thuộc task khác):**
- Giao diện Kanban, kéo thả, SSE tới trình duyệt (task 07).
- Ghép TWIN_20, COMBINED, Street Turn, tách chuyến, hủy Order có chuyến (task 08); task này chỉ viết bộ kiểm tra để task 08 dùng lại.
- Drop & Hook, cứu hộ, bắn xe ngoài `SUB_CONTRACTOR` (task 09).
- Chuyển xe sang `IN_USE` và tài xế sang `ON_DUTY` khi chuyến thực sự bắt đầu (task 10 khi tài xế bấm "Bắt đầu chuyến", task 14 khi geofence rời bãi).
- Định mức chi phí chuyến `trip_costs`, phân bổ (task 17); lương theo assignment (task 20).

## Thiết kế
- Không có giao diện riêng; đây là API/service. Kết quả lỗi và cảnh báo phải đủ thông tin để giao diện task 07 hiện đúng các lý do trong `designs/components/Screen03-Dispatch/` (bảng gán xe: "Rảnh trong khung giờ này", "GPLX còn 2 ngày", "Trùng giờ với chuyến khác", "Đăng kiểm hết hạn, không được điều", tài xế nghỉ phép, cont lạnh cần rơ moóc có genset).

## Quyết định kiến trúc
- Module `packages/core/modules/dispatch/`: `trips.service.ts` (tạo chuyến, chuyển trạng thái, sửa giờ), `assign.service.ts` (`assignResources`, `cancelAssignment`), `rules/` (từng kiểm tra là hàm riêng: `overlap.ts`, `documents.ts`, `maintenance.ts`, `driving-hours.ts`, `physical.ts`, `port-readiness.ts`), `availability.query.ts`, `repo.ts`, `schema.ts`. Schema Drizzle ở `packages/core/lib/db/schema/dispatch.ts`.
- `dispatch_assignments` là nguồn sự thật về tài nguyên; `consolidated_trips.primaryDriverId/primaryTractorId/primaryTrailerId` chỉ để hiển thị, đồng bộ từ assignment, không dùng kiểm tra xung đột hay tính lương (ADR-004).
- Quan hệ assignment và Stop: `dispatch_assignments.stopId` bắt buộc. Đề xuất: mỗi Stop của container trong chuyến có một assignment cùng bộ tài nguyên và cùng khung giờ chuyến (gán độc lập theo chặng, ADR-004); kiểm tra chồng lấn bỏ qua các assignment cùng `consolidatedTripId`. Cách hiểu này phải được người dùng duyệt trong plan.md vì ảnh hưởng Drop & Hook, cứu hộ (task 09) và lương (task 20).
- Thứ tự khóa cố định `drivers` → `tractors` → `trailers`, trong cùng bảng sắp `id` tăng dần; mỗi dòng `SELECT ... FOR UPDATE` có điều kiện `tenantId` (spec 03 mục 1 bước 2).
- Chồng lấn: assignment có status không thuộc `CANCELLED`, `COMPLETED`, `ABORTED_MIDWAY` và `planned_start < :newEnd AND planned_end > :newStart`, kiểm tra riêng cho `driverId`, `tractorId`, `trailerId` (dùng index `idx_assign_*_time`). Không dựa vào `status` của tài nguyên, trừ khi chuyến bắt đầu trong 30 phút (`plannedStart <= now + 30 phút`) thì thêm điều kiện `status = 'AVAILABLE'`.
- Giấy tờ còn hạn tại `plannedEnd` (GPLX tài xế; đăng kiểm, bảo hiểm, phù hiệu đầu kéo; kiểm định rơ moóc): hết hạn trả `DOCUMENT_EXPIRED`; còn dưới 15 ngày thì cho gán và trả cảnh báo.
- Giờ lái: tổng thời gian kế hoạch của tài xế trong ngày (theo múi giờ tenant) không quá giới hạn cấu hình theo tenant (`tenants.settings`, mặc định 10 giờ/ngày, liên tục không quá 4 giờ). Vượt thì trả cảnh báo; chỉ `ADMIN` được ghi đè, bắt buộc lý do, ghi `audit_logs`.
- Ràng buộc vật lý cho chuyến một container: Rule 2 dùng `vgmTons`, nếu chưa có thì `cargoWeightTons` + vỏ cont tiêu chuẩn; tổng ≤ `trailer.maxPayloadTons` và cộng `trailer.tareWeightTons` + đầu kéo ≤ `tractor.permittedGrossWeightTons`; thiếu dữ liệu khối lượng thì cảnh báo bắt buộc xác nhận. Rule 5: container loại `*RF` cần `trailer.hasGensetPower = true`. Rule 6: `isDangerousGoods` cần tài xế có chứng chỉ hàng nguy hiểm còn hạn (cột thêm ở task 05). Rule 7: cho lưu kế hoạch, chặn lúc chuyển `DISPATCHED` nếu Stop đầu ở cảng/depot mà container `HOLD_CUSTOMS`/`HOLD_LINE` hoặc chưa `READY_EDO`/`READY_EMPTY_RELEASE`. Rule 8: Stop `PORT_IN` kết thúc sau `order.cutOffAt` thì trả cảnh báo đỏ.
- Mã lỗi (spec 03 mục 1 bước 4, 8, 9): `DRIVER_NOT_AVAILABLE`, `TRACTOR_NOT_AVAILABLE`, `TRAILER_NOT_AVAILABLE`, `RESOURCE_TIME_CONFLICT`, `DOCUMENT_EXPIRED`, `RESOURCE_BUSY_RETRY`, `STALE_DATA`; thêm mã mới cho Rule 5, 6, 7 và cho ghi đè giờ lái thiếu quyền (đặt tên trong plan.md, khai báo ở `packages/shared/errors.ts`). Vi phạm thì rollback và trả `{ ok: false, code, message }` (Rule 5 spec 01); cảnh báo trả trong `data.warnings`.
- Timeout khóa: đặt `SET SESSION innodb_lock_wait_timeout = 5` cho transaction điều vận; hết giờ chờ khóa trả `RESOURCE_BUSY_RETRY`.
- Khóa lạc quan khi sửa chuyến: client gửi `version`, `UPDATE ... WHERE id = ? AND version = ?` không ảnh hưởng dòng nào thì trả `STALE_DATA`.
- Sau commit (không trong transaction): `revalidatePath('/dispatch')` ở Server Action, publish `dispatch.updated` lên kênh Redis có tiền tố tenant (`tenant:{tenantId}:dispatch`) kèm id container, chuyến, `version`.
- `status` tài xế và đầu kéo không đổi khi lên kế hoạch (spec 03 mục 1 bước 6). Hủy assignment: chuyển `CANCELLED`, không xóa; nếu tài nguyên đang `IN_USE`/`ON_DUTY` vì assignment này thì trả `AVAILABLE` (spec 03 mục 4).
- Audit trong cùng transaction cho mọi thay đổi chuyến và assignment (Rule 8).
- Quyền: `OWNER`, `ADMIN`, `DISPATCHER` tạo chuyến, gán, hủy; chỉ `ADMIN` ghi đè giờ lái.
- Hiệu năng: Server Action điều vận p95 < 500 ms (spec 08 mục 1).

## Các bước
### Bước 1 — Schema chuyến và assignment, migration, seed, tenant isolation
- `packages/core/lib/db/schema/dispatch.ts`: `consolidated_trips`, `trip_containers`, `dispatch_assignments` đúng spec 02 (index `uq_trip_code`, `idx_assign_driver_time`, `idx_assign_tractor_time`, `idx_assign_trailer_time`); `pnpm db:generate`, review SQL.
- Viết test trước `packages/core/modules/dispatch/repo.int.test.ts`: 3 repo, Tenant B không đọc, sửa được dữ liệu Tenant A.
- Seed: một chuyến buổi sáng đã gán 51C-482.17 và tài xế tương ứng cho một container trong seed task 04.
**Kiểm tra:** `pnpm db:migrate` chạy được trên DB trống và DB đã có dữ liệu của task 05; `pnpm db:seed` chạy hai lần không trùng; `pnpm test --filter core -- dispatch.*repo` xanh.

### Bước 2 — Test đồng thời và test quy tắc (đỏ)
- `packages/core/modules/dispatch/assign.concurrency.int.test.ts` (Testcontainers, hai kết nối thật): 2 transaction gán cùng 1 tài xế cho 2 chuyến chồng giờ chạy song song, đúng 1 thành công, cái kia nhận `DRIVER_NOT_AVAILABLE` hoặc `RESOURCE_TIME_CONFLICT`; gán chuyến chiều cho xe đang có chuyến sáng không chồng giờ thành công; 2 người ghép chéo tài nguyên (A gán tài xế X + xe Y, B gán tài xế X' + xe Y' theo thứ tự ngược) không deadlock, chạy 20 lần; giữ khóa quá 5 giây thì bên chờ nhận `RESOURCE_BUSY_RETRY`.
- `assign.rules.int.test.ts`: tài nguyên khác tenant, `INACTIVE`, đã xóa mềm bị chặn; chồng lấn với assignment `CANCELLED`/`COMPLETED`/`ABORTED_MIDWAY` không tính; bảo dưỡng chồng lấn bị chặn; GPLX hết hạn trước `plannedEnd` bị `DOCUMENT_EXPIRED`; còn 10 ngày thì gán được kèm cảnh báo; vượt 10 giờ lái thì cảnh báo, `DISPATCHER` ghi đè bị từ chối, `ADMIN` ghi đè có lý do thì được và có audit; chuyến bắt đầu sau 20 phút với tài xế `OFF_DUTY` bị chặn; cont `40RF` với rơ moóc không genset bị chặn; cont hàng nguy hiểm với tài xế không có chứng chỉ bị chặn; thiếu khối lượng trả cảnh báo cần xác nhận.
**Kiểm tra:** `pnpm test --filter core -- assign` chạy và đỏ vì chưa có code.

### Bước 3 — Tạo chuyến SINGLE cho một container
- Viết test trước `trips.service.int.test.ts`: tạo chuyến cho container `PENDING` của Order `CONFIRMED` sinh `tripCode` từ `nextNumber(ctx, 'TRIP:yyyy-mm')`, một dòng `trip_containers` (`orderId` denormalize), container sang `PLANNED`, có audit; container của Order `DRAFT` hoặc đã `CANCELLED` bị chặn; container đã có chuyến đang hoạt động bị chặn.
- Viết `trips.service.ts` (`createSingleTrip`, `updateTripTimes` có `version`).
**Kiểm tra:** `pnpm test --filter core -- trips` xanh.

### Bước 4 — assignResources: khóa, chồng lấn, tồn tại, trạng thái, timeout
- Viết `assign.service.ts` và `rules/overlap.ts`: transaction, `innodb_lock_wait_timeout = 5`, khóa theo thứ tự, kiểm tra tồn tại/cùng tenant/`INACTIVE`/xóa mềm, chồng lấn ba loại tài nguyên, bảo dưỡng chồng lấn (`findMaintenanceOverlap` của task 05), điều kiện `AVAILABLE` trong 30 phút; lưu `dispatch_assignments`, đồng bộ `primary*`, tăng `version`, audit.
**Kiểm tra:** `pnpm test --filter core -- assign.concurrency` xanh, chạy 5 lần liên tiếp đều xanh; các test chồng lấn, bảo dưỡng, khác tenant trong `assign.rules` xanh.

### Bước 5 — Giấy tờ, giờ lái và ràng buộc vật lý một container
- Viết `rules/documents.ts`, `rules/driving-hours.ts`, `rules/physical.ts` (Rule 2, 5, 6, 8 cho một container), `rules/port-readiness.ts` (Rule 7); nối vào `assignResources` và vào chuyển trạng thái `PLANNED` → `DISPATCHED` (`dispatchTrip`); cảnh báo trả trong `data.warnings`, ghi đè giờ lái chỉ `ADMIN`.
**Kiểm tra:** `pnpm test --filter core -- assign.rules` xanh toàn bộ; test chuyển `DISPATCHED` khi container `HOLD_CUSTOMS` bị chặn, khi `READY_EDO` thì được.

### Bước 6 — Sau commit, hủy assignment, truy vấn tài nguyên gán được và Server Action
- Viết test trước: sau gán thành công có đúng 1 thông điệp trên kênh `tenant:{tenantId}:dispatch`, tenant khác không nhận; transaction lỗi thì không publish; `cancelAssignment` chuyển `CANCELLED`, không xóa dòng, tài nguyên `IN_USE`/`ON_DUTY` vì assignment đó trở về `AVAILABLE`; `listResourceAvailability(ctx, { orderContainerId, start, end })` trả mọi tài xế/đầu kéo/rơ moóc kèm lý do (rảnh, trùng giờ, giấy tờ hết hạn, giấy tờ sắp hết hạn, nghỉ phép, thiếu genset, bảo dưỡng) mà không khóa dòng nào.
- Server Action `apps/web/src/features/dispatch/actions.ts`: `createSingleTrip`, `assignResources`, `dispatchTrip`, `cancelAssignment`, `updateTripTimes` theo khuôn `requireRole` rồi zod rồi service, gọi `revalidatePath('/dispatch')` sau khi service trả `ok`.
- Đo hiệu năng: script hoặc test đo `assignResources` với 300 assignment trong ngày.
**Kiểm tra:** `pnpm test --filter core -- dispatch` và `pnpm test --filter web -- dispatch` xanh; `VIEWER` gọi `assignResources` bị `FORBIDDEN`; p95 của `assignResources` dưới 500 ms trên DB Testcontainers có 300 assignment trong ngày.

### Bước 7 — Hoàn tất
- Chạy toàn bộ kiểm tra, cập nhật progress.md, đổi trạng thái dòng 06 trong `docs/tasks/README.md`, cập nhật spec 03 nếu cách hiểu assignment theo Stop hoặc mã lỗi mới khác tài liệu.
**Kiểm tra:** `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` không lỗi; migration chạy được trên DB trống và DB có dữ liệu; seed có chuyến mẫu; mọi Server Action có `requireRole` và zod; mọi repo mới có test tenant isolation; đạt "Chấp nhận khi" của ticket: test đồng thời: 2 transaction gán cùng 1 tài xế cho 2 chuyến chồng giờ → đúng 1 thành công; gán chuyến chiều cho xe đang có chuyến sáng (không chồng giờ) → thành công; không có deadlock khi 2 người ghép chéo tài nguyên.
