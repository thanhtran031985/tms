# 09-drop-hook-rescue — Drop & Hook, cứu hộ và bắn xe ngoài

> Giai đoạn: GĐ2 · Phụ thuộc: 06 · Nhánh git: `feat/09-drop-hook-rescue`
> Nguồn: `docs/specs/07_implementation_tickets.md` TICKET-09; spec `03_dispatch_and_concurrency.md` mục 1 (áp lại cho Hook và xe cứu hộ), mục 3 (Drop & Hook), mục 4 (phí hủy nhà xe ngoài), mục 5 (cột "Chờ móc rơ moóc"); spec `05_advanced_workflows_and_ai.md` mục 1 (cứu hộ), mục 2 (bắn xe ngoài); spec `02_database_schema.md` bảng `dispatch_assignments`, `order_stops`, `trailers`, `incidents`, `maintenance_orders`, `trip_costs`, `driver_ledger`, `attachments`; spec `00_system_overview_and_adrs.md` ADR-004, ADR-009; PRD `docs/PRD.md` mục C6, F4

## Mục tiêu
Sau task này, Điều vận thả rơ moóc lại kho khách bằng nút "Drop Trailer" để đầu kéo và tài xế đi làm việc khác ngay, rồi điều một đầu kéo bất kỳ quay lại móc rơ moóc từ cột "Chờ móc rơ moóc". Khi xe hỏng giữa đường, Điều vận ghi sự cố, khóa xe hỏng và điều xe cứu hộ kéo tiếp, lương chuyến tự chia cho hai tài xế khớp đến từng đồng. Khi đội xe quá tải, Điều vận bắn container cho nhà xe ngoài với giá thuê thỏa thuận, và nhà xe ngoài nộp chứng từ qua link một lần mà không cần tài khoản.

## Phạm vi
**Làm:**
- Drop Trailer: rơ moóc `DROPPED` tại `stop.locationId`, giải phóng đầu kéo và tài xế về `AVAILABLE`, assignment hiện tại kết thúc ở Stop `DROP_TRAILER` (`COMPLETED`), tự sinh Stop `HOOK_TRAILER` (`PENDING`, chưa có đầu kéo).
- Hook Trailer: gán đầu kéo + tài xế cho Stop `HOOK_TRAILER` với đủ kiểm tra của spec 03 mục 1, rơ moóc phải đang `DROPPED` đúng `locationId`.
- Lương Drop & Hook: chặng trước Drop và chặng sau Hook là 2 assignment riêng, mỗi assignment tính lương theo bảng phí của chặng (`DRIVER_SALARY_DROP` / `DRIVER_SALARY_HOOK`) hoặc theo tỷ lệ `completionPercentage`.
- Danh sách "Rơ moóc đang thả": rơ moóc `DROPPED` kèm số giờ đã nằm tại kho.
- Cứu hộ: tạo `incidents` (`BREAKDOWN`) kèm vị trí và ảnh; assignment cũ `ABORTED_MIDWAY` với `completionPercentage` đề xuất tự động và Điều vận sửa được (có audit); đầu kéo cũ `MAINTENANCE` + `maintenance_orders` (`BREAKDOWN`); assignment mới `RESCUE_ASSIGNED` trên cùng `stopId`, `replacesAssignmentId` trỏ về assignment cũ, đủ kiểm tra khóa và xung đột, tổng `completionPercentage` trên một stop bằng 100 kiểm tra trong transaction.
- Chia `TRIP_SALARY` vào `driver_ledger` theo `completionPercentage` khi chuyến hoàn tất, làm tròn đến đồng, phần dư dồn cho tài xế hoàn tất chuyến.
- Chi phí cứu hộ ghi `trip_costs` (`ACTUAL`, `feeCode = 'RESCUE'`), không tính vào doanh thu khách trừ khi hợp đồng quy định (khi đó Điều vận nhập phụ phí tay).
- Cảnh báo ưu tiên cho Điều vận khi Order có cut-off hoặc free time sắp hết mà chuyến bị cứu hộ.
- Bắn xe ngoài: `assignmentType = 'SUB_CONTRACTOR'`, `subcontractorVendorId`, `agreedSubcontractCost`, bắt buộc `subcontractorPlate` và `subcontractorDriverName`; bỏ qua kiểm tra xe nội bộ, cấp phiếu dầu và tính lương tài xế.
- Khi container hoàn thành: ghi `agreedSubcontractCost` vào `trip_costs` (`ACTUAL`, `SUBCONTRACT`); hủy assignment xe ngoài sau khi đã xác nhận cho ghi chi phí hủy vào `trip_costs`.
- Chứng từ nhà xe ngoài: Điều vận tải lên hộ, hoặc gửi magic link có hạn chỉ cho xem và nộp ảnh EIR/ePOD của đúng các container được giao.
- Giao diện: nút Drop Trailer, cột và panel "Chờ móc rơ moóc", form cứu hộ, chế độ "Xe ngoài" trong bảng gán xe, bảng "Rơ moóc đang thả", trang nộp chứng từ qua magic link.

**Không làm (thuộc task khác):**
- Khung Kanban, kéo thả, SSE và xử lý `STALE_DATA` chung (task 07); task này chỉ thêm cột, thẻ và panel mới.
- Ghép chuyến, tách chuyến, hủy assignment và hủy Order nói chung (task 08); task này chỉ thêm phần phí hủy riêng của assignment xe ngoài.
- Gom `vendor_bills` (AP) của nhà xe ngoài theo kỳ sau đối soát bảng kê (task 19).
- Phát sinh ngoài giá thỏa thuận do nhà xe ngoài báo, nhập `trip_expenses` có duyệt (task 16).
- Gợi ý giá thuê từ bảng giá nhà xe ngoài (`fee_tariffs` `feeCode = 'SUBCONTRACT'` + vendor): giai đoạn sau, MVP nhập tay.
- Quãng đường GPS thật để đề xuất `completionPercentage` (pipeline GPS ở task 13); task này dùng km GPS nếu đã có, chưa có thì Điều vận nhập.
- Phân bổ `trip_costs` về container (task 17), kỳ lương và quyết toán (task 20), gửi thông báo ra email/Zalo (task 23).
- Tài xế bấm hoàn tất Stop trên app (task 10); task này cung cấp hàm hoàn tất chuyến để task 10 gọi.

## Thiết kế
- `designs/components/Screen03-Dispatch/` (đọc README.md và preview.html; 4 trạng thái: Bình thường; Đang tải là skeleton cột và lịch xe; Trống là "chưa có container cần điều hôm nay" kèm nút "Tạo Order"; Lỗi là giữ bảng lúc tải cuối, cảnh báo gán có thể trùng và nút "Thử lại").
- Cột "Chờ móc rơ moóc" dùng khối `accent` như preview (thẻ mẫu "Drop tại Sao Việt"); chữ cảnh báo cam luôn là `warn`.
- Bảng "Rơ moóc đang thả": `designs/components/WorkTable/` (cột đầu `StatusChip`, cột số giờ nằm kho đổi `warn` khi quá 24 giờ và `crit` khi quá 48 giờ, giống quy ước rơ moóc ở `Screen05-FleetMap`).
- Thành phần: `designs/components/ContainerCard/`, `designs/components/StatusChip/`, `designs/components/Field/`, `designs/components/Button/`, `designs/components/Alert/`, `designs/components/EmptyState/`.
- Form cứu hộ, chế độ xe ngoài và trang magic link chưa có màn thiết kế riêng: dựng từ các thành phần trên theo `designs/README.md`, ghi phần tự quyết vào `decisions.md`.

## Quyết định kiến trúc
- Nghiệp vụ ở `packages/core/modules/dispatch/` (`drop-hook.service.ts`, `rescue.service.ts`, `subcontract.service.ts`), lương ở `packages/core/modules/payroll/salary-split.ts`. Server Action ở `apps/web/src/features/dispatch/` chỉ gọi `requireRole`, validate zod rồi gọi service.
- Mọi thao tác chạy trong `db.transaction`, khóa tài nguyên theo thứ tự cố định `drivers` → `tractors` → `trailers`, trong cùng bảng sắp theo `id` tăng dần (spec 03 mục 1 bước 2). Hook và xe cứu hộ dùng lại đúng hàm kiểm tra của `assignResources` (task 06): chồng lấn thời gian, bảo dưỡng, giấy tờ còn hạn tại `plannedEnd`, giờ lái, `innodb_lock_wait_timeout` 5 giây trả `RESOURCE_BUSY_RETRY`.
- Hook: ngoài kiểm tra trên, rơ moóc phải `status = 'DROPPED'` và `currentLocationId` bằng `locationId` của Stop `HOOK_TRAILER`; sai thì trả `TRAILER_NOT_AVAILABLE`.
- Drop: chỉ cho khi assignment đang `ASSIGNED`/`IN_TRANSIT` và Stop hiện tại có `locationId`. Thêm Stop `DROP_TRAILER` và `HOOK_TRAILER` vào chuỗi Stop của container và đánh lại `sequenceNo` trong cùng transaction (ràng buộc `uq_stop_seq(order_container_id, sequence_no)`); cách chèn ghi vào `decisions.md`.
- Thời điểm thả rơ moóc lấy từ `occurredAt` của Stop `DROP_TRAILER` (spec 02 không có cột `trailers.droppedAt`); số giờ nằm kho = bây giờ trừ mốc đó, hiển thị theo múi giờ tenant.
- Cứu hộ: `completionPercentage` đề xuất = km GPS đã chạy từ Stop trước / `routes.standardDistanceKm`, làm tròn số nguyên 0 đến 100; Điều vận sửa thì ghi `audit_logs` (giá trị trước, sau, lý do). Assignment mới = 100 trừ phần cũ. Tổng `completionPercentage` của các assignment không `CANCELLED` trên một `stopId` phải bằng 100, kiểm tra sau khi ghi trong cùng transaction.
- Đầu kéo hỏng: `tractors.status = 'MAINTENANCE'` và tạo `maintenance_orders` `type = 'BREAKDOWN'`, `status = 'IN_PROGRESS'`, `plannedStart` = thời điểm sự cố, để kiểm tra bảo dưỡng chồng lấn của task 06 chặn điều xe này.
- Chia lương: `TRIP_SALARY` lấy từ định mức `DRIVER_SALARY` của chuyến (tra `fee_tariffs` qua `resolveFees` của task 03 theo `tripMode` của chuyến). Phần của mỗi tài xế không hoàn tất = `amount × completionPercentage / 100` làm tròn đến đồng bằng `decimal.js` (chế độ làm tròn chốt trong plan.md); tài xế hoàn tất chuyến nhận phần còn lại để tổng khớp đúng định mức. Ghi `driver_ledger` (`transactionType = 'TRIP_SALARY'`, `referenceType = 'ASSIGNMENT'`, `referenceId` = assignment), append-only, không `UPDATE`/`DELETE` (ADR-009). Ghi một lần cho mỗi assignment: gọi lại không sinh dòng trùng.
- Assignment `SUB_CONTRACTOR` không có `driverId`/`tractorId` nội bộ nên không khóa dòng tài nguyên, không cấp phiếu dầu, không ghi `TRIP_SALARY`. `subcontractorVendorId` phải là `vendors.type = 'SUB_CONTRACTOR'` cùng tenant. `agreedSubcontractCost` là `DECIMAL(18,2)` + `currency`, lớn hơn 0.
- `trip_costs` ghi `RESCUE` và `SUBCONTRACT` với `sourceRefId` (incident hoặc assignment) để chạy lại không trùng. AP không ghi thẳng: `vendor_bills` lập theo kỳ ở task 19.
- Magic link: token ngẫu nhiên lưu dạng hash, có hạn (đề xuất 72 giờ, chốt trong plan.md), gắn với tenant, vendor và danh sách `order_container_id`; chỉ cho xem thông tin tối thiểu và nộp ảnh EIR/ePOD qua presigned URL key `tenants/{tenantId}/...`. Spec 02 chưa có bảng cho link này: đề xuất bảng `subcontractor_upload_links`, ghi `decisions.md` và cập nhật spec 02 trước khi làm bước đó.
- Bảng cần dùng mà task 06 chưa tạo thì tạo đúng schema spec 02 ở bước 1: `incidents`, `trip_costs`, `payroll_periods`, `driver_ledger`, `attachments` (task 10 và task 20 dùng lại, không tạo lần hai). Ghi vào `decisions.md`.
- Mã lỗi dùng lại: `DRIVER_NOT_AVAILABLE`, `TRACTOR_NOT_AVAILABLE`, `TRAILER_NOT_AVAILABLE`, `RESOURCE_TIME_CONFLICT`, `DOCUMENT_EXPIRED`, `RESOURCE_BUSY_RETRY`, `STALE_DATA`. Mã mới đề xuất thêm vào `packages/shared/errors.ts`: `COMPLETION_PERCENTAGE_INVALID`, `SUBCONTRACT_INFO_REQUIRED`, `UPLOAD_LINK_EXPIRED`.
- Quyền: Drop, Hook, cứu hộ, bắn xe ngoài, sửa `completionPercentage`, tạo magic link dùng `requireRole(['DISPATCHER', 'ADMIN'])` theo ma trận `modules/identity/permissions.ts`. Trang magic link không cần đăng nhập nhưng kiểm tra token, hạn và container trong mọi request.
- Audit trong cùng transaction cho mọi thay đổi assignment, Stop, trạng thái tài nguyên, `trip_costs` và `driver_ledger`. Sau commit publish `dispatch.updated` lên Redis Pub/Sub và `revalidatePath('/dispatch')`.
- Mọi truy vấn qua `getTenantDb(ctx)`; kiểm tra Stop, rơ moóc, vendor, container cùng tenant trước khi ghi. Thời gian `DATETIME(3)` UTC, tiền `decimal.js`.

## Các bước
### Bước 1 — Schema bổ sung và test đỏ cho repo
- Kiểm tra bảng đã có từ task 05/06; thêm vào `packages/core/lib/db/schema/` các bảng còn thiếu đúng spec 02: `incidents`, `trip_costs`, `payroll_periods`, `driver_ledger`, `attachments`.
- `drizzle-kit generate`, đọc lại SQL; seed tối thiểu: 1 vendor `SUB_CONTRACTOR`, 1 kho khách có tọa độ, 1 chuyến IMPORT đang chạy có `DRIVER_SALARY` 1.234.567 ₫ trong `fee_tariffs`.
- Viết trước test tenant isolation cho `IncidentRepo`, `TripCostRepo`, `DriverLedgerRepo`, `AttachmentRepo` (Testcontainers MariaDB) và test `DriverLedgerRepo` không có hàm update/delete.
**Kiểm tra:** `pnpm db:migrate` chạy được trên DB trống và trên DB đã có dữ liệu seed của task 00 đến 08; `pnpm db:seed` không lỗi; `pnpm test --filter core -- incident.repo trip-cost.repo driver-ledger.repo attachment.repo` xanh, session Tenant B đọc ra 0 dòng của Tenant A.

### Bước 2 — Service Drop Trailer và Hook Trailer
- Test trước trong `packages/core/modules/dispatch/drop-hook.test.ts`: Drop làm rơ moóc `DROPPED` đúng `locationId`, đầu kéo và tài xế `AVAILABLE`, assignment `COMPLETED` ở Stop `DROP_TRAILER`, sinh đúng 1 Stop `HOOK_TRAILER` `PENDING`; Hook với rơ moóc ở địa điểm khác bị chặn `TRAILER_NOT_AVAILABLE`; Hook với tài xế trùng giờ bị chặn `RESOURCE_TIME_CONFLICT`; Hook hợp lệ tạo assignment mới; 2 transaction Hook cùng rơ moóc song song chỉ 1 thành công, không deadlock.
- Viết `drop-hook.service.ts` (`dropTrailer`, `hookTrailer`) và query `listDroppedTrailers` (số giờ nằm kho).
**Kiểm tra:** `pnpm test --filter core -- drop-hook` xanh; có `audit_logs` cho từng thay đổi; số giờ nằm kho trong test khớp mốc `occurredAt` của Stop `DROP_TRAILER`.

### Bước 3 — Service cứu hộ
- Test trước trong `rescue.test.ts`: tạo `incidents` `BREAKDOWN` có lat/lng; assignment cũ `ABORTED_MIDWAY` với 40; đầu kéo cũ `MAINTENANCE` và có `maintenance_orders` `BREAKDOWN` chặn điều xe đó cho chuyến khác; assignment mới `RESCUE_ASSIGNED` cùng `stopId` với 60 và `replacesAssignmentId` đúng; tổng khác 100 bị chặn `COMPLETION_PERCENTAGE_INVALID` và rollback; xe cứu hộ trùng giờ bị chặn `RESOURCE_TIME_CONFLICT`; Điều vận sửa phần trăm có audit trước/sau; Order có cut-off còn dưới 8 giờ thì publish sự kiện cảnh báo ưu tiên.
- Viết `rescue.service.ts` (`reportBreakdown`, `assignRescue`, `adjustCompletionPercentage`), đề xuất phần trăm từ km GPS nếu có, không có thì bắt nhập.
**Kiểm tra:** `pnpm test --filter core -- rescue` xanh, gồm ca rollback khi tổng khác 100.

### Bước 4 — Chia lương chuyến và chi phí cứu hộ
- Test trước trong `packages/core/modules/payroll/salary-split.test.ts`: kịch bản xe hỏng ở 40% với `DRIVER_SALARY` 1.234.567 ₫ ra 2 dòng `TRIP_SALARY` có tổng đúng 1.234.567 ₫, phần dư dồn cho tài xế hoàn tất; ca 3 assignment (cứu hộ 2 lần); ca chuyến thường 100%; gọi hoàn tất 2 lần không sinh dòng trùng; Drop & Hook ra 2 dòng theo `DRIVER_SALARY_DROP` / `DRIVER_SALARY_HOOK` khi có mã phí, không có thì theo `completionPercentage`.
- Viết `salary-split.ts` (hàm thuần, `decimal.js`) và `onTripCompleted(ctx, tripId)` trong `dispatch/service.ts`: ghi `driver_ledger`, ghi `trip_costs` `RESCUE` từ chi phí sự cố.
**Kiểm tra:** `pnpm test --filter core -- salary-split` xanh; ca 40/60 khớp đến từng đồng; `trip_costs` có đúng 1 dòng `RESCUE` cho mỗi sự cố có chi phí.

### Bước 5 — Bắn xe ngoài
- Test trước trong `subcontract.test.ts`: tạo assignment `SUB_CONTRACTOR` không cần tài xế nội bộ; thiếu biển số hoặc tên tài xế bị chặn `SUBCONTRACT_INFO_REQUIRED`; vendor không phải `SUB_CONTRACTOR` hoặc khác tenant bị chặn; không sinh `TRIP_SALARY`; container hoàn thành ghi đúng 1 dòng `trip_costs` `ACTUAL` `SUBCONTRACT` bằng `agreedSubcontractCost`; hủy sau khi đã xác nhận cho ghi chi phí hủy vào `trip_costs`; không ghi `vendor_bills`.
- Viết `subcontract.service.ts`, nối vào `assignResources` theo `assignmentType`.
**Kiểm tra:** `pnpm test --filter core -- subcontract` xanh.

### Bước 6 — Chứng từ nhà xe ngoài qua tải hộ và magic link
- Chốt bảng `subcontractor_upload_links` trong `decisions.md`, cập nhật spec 02, tạo migration.
- Test trước: Điều vận tải hộ ảnh EIR/ePOD vào `attachments` (`ownerType = 'ORDER_STOP'`); link hết hạn trả `UPLOAD_LINK_EXPIRED`; link chỉ thấy và nộp được cho container được giao, container khác trả 404; token chỉ lưu dạng hash; key S3 có tiền tố `tenants/{tenantId}/`.
- Viết service trong `dispatch/subcontract-upload.ts`, Route Handler `apps/web/src/app/api/v1/subcontractor-upload/[token]/route.ts` (zod, rate-limit) và trang `apps/web/src/app/(public)/nop-chung-tu/[token]/page.tsx`.
**Kiểm tra:** `pnpm test --filter core -- subcontract-upload` xanh; mở link trên điện thoại 390×844 nộp được 1 ảnh, link quá hạn hiện lỗi nói rõ phải liên hệ Điều vận.

### Bước 7 — Giao diện điều vận
- `apps/web/src/features/dispatch/`: nút "Drop Trailer" trên thẻ đang chạy; cột "Chờ móc rơ moóc" và panel gán xe cho Stop `HOOK_TRAILER`; form "Báo hỏng xe và điều cứu hộ" (vị trí, ảnh, phần trăm đề xuất có ô sửa và lý do); chế độ "Xe ngoài" trong bảng gán xe (nhà xe, giá thuê, biển số, tên tài xế, nút tạo magic link); trang `/dispatch/dropped-trailers` dùng WorkTable.
- Server Action trả `{ ok, code, message }`; UI hiện thông báo tiếng Việt theo mã lỗi, rollback optimistic khi `ok: false`.
- Đủ 4 trạng thái cho cột mới, bảng rơ moóc và các form.
**Kiểm tra:** mở `/dispatch` trên 1440×900 và 1366×768: thẻ Drop chuyển sang cột "Chờ móc rơ moóc"; Hook sai địa điểm hiện lỗi rõ ràng; `/dispatch/dropped-trailers` hiện số giờ nằm kho với chip `warn` quá 24 giờ, `crit` quá 48 giờ; `pnpm e2e -- drop-hook rescue` xanh cho luồng Drop rồi Hook và luồng cứu hộ.

### Bước 8 — Hoàn tất
- Chạy toàn bộ kiểm tra, cập nhật progress.md, đổi trạng thái task trong `docs/tasks/README.md`, cập nhật spec 02 và spec 03/05 cho mọi chỗ đã chốt khác tài liệu.
**Kiểm tra:** `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` không lỗi; `pnpm e2e` xanh cho Drop & Hook và cứu hộ; migration chạy trên DB trống và DB có dữ liệu; mọi repo mới có test tenant isolation; mọi Server Action, Route Handler có `requireRole` (trừ trang magic link kiểm tra token) và zod; đạt "Chấp nhận khi" của ticket: kịch bản xe hỏng ở 40% → lương chia 40/60 khớp đến từng đồng.
