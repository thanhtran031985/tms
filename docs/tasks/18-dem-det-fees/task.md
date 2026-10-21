# 18-dem-det-fees — Phí DEM/DET tự động

> Giai đoạn: GĐ5 · Phụ thuộc: 03, 04, 14 · Nhánh git: `feat/18-dem-det-fees`
> Nguồn: `docs/specs/07_implementation_tickets.md` TICKET-18; spec `05_advanced_workflows_and_ai.md` mục 5; spec `02_database_schema.md` bảng `dem_det_tariffs`, `order_containers` (`demFreeUntil`, `detFreeUntil`, `storageFreeUntil`), `order_fees`, `order_stops`, `tenants.settings`; spec `00_system_overview_and_adrs.md` mục 1 (DEM/DET, Storage, Chi hộ), ADR-007, ADR-008, ADR-009; spec `06_hierarchical_pricing_and_fees.md` mục 4 (DEM/DET không bị tính lại); spec `08_nonfunctional_security_ops.md` mục 4; PRD `docs/PRD.md` mục C12, F2

## Mục tiêu
Sau task này, Điều vận không phải tự đếm ngày lưu bãi, lưu vỏ: mỗi ngày hệ thống tự tính phí DEM, DET và Storage dự tính cho từng container theo biểu lũy tiến và giờ của công ty, hiện số tiền đang chạy và đếm ngược trên thẻ container. Trước khi hết miễn phí hoặc tới cut-off 48 giờ và 24 giờ, Điều vận nhận cảnh báo để kịp điều xe. Khi container đã được lấy hoặc trả, số phí được chốt, và nếu chậm do nhà xe thì Điều vận đánh dấu để không tính cho khách.

## Phạm vi
**Làm:**
- Bảng `dem_det_tariffs` (biểu lũy tiến theo hãng tàu, loại phí, loại cont, khoảng ngày), màn quản lý tối thiểu và seed.
- Hàm tính phí thuần theo biểu lũy tiến cho DEM, DET, Storage.
- Job hằng ngày trong `apps/worker`, mỗi tenant một job theo múi giờ tenant, idempotent, có retry và dead-letter.
- Một dòng `order_fees` dự tính cho mỗi container và mỗi loại phí, cập nhật hằng ngày, chốt số khi Stop kết thúc (`PICK_FULL` cho DEM, `RETURN_EMPTY` hoặc đảo vỏ cho DET).
- Đánh dấu ai chịu phí (`chargeTo = COMPANY` khi chậm do nhà xe).
- Phát sự kiện cảnh báo 48 giờ và 24 giờ trước khi hết free time và trước cut-off.
- Hiển thị phí dự tính và đếm ngược DEM/DET trên `ContainerCard` và `DeadlineTimeline`.

**Không làm (thuộc task khác):**
- Gửi thông báo ra email, Zalo/SMS và cấu hình người nhận (task 23); task này chỉ phát sự kiện vào hàng đợi `notifications` và lưu cảnh báo để task 23 tiêu thụ.
- Nhập số phí chính thức theo hóa đơn hãng tàu, đối soát với hãng tàu (task 19, 21).
- Đưa phí vào hóa đơn (task 21).
- Tính giờ chờ tại kho khách và phí `WAITING_FEE` (task 14).
- Nhập `demFreeUntil`/`detFreeUntil`/`storageFreeUntil` trên Order (task 04).
- Cảnh báo khi job DEM/DET không chạy (task 24).

## Thiết kế
- Thành phần: `designs/components/ContainerCard/` (chip mốc hạn DEM/DET kèm thời gian còn lại, mức `crit` dưới 3 giờ, `warn` trong 8 giờ, `info` xa hơn), `designs/components/DeadlineTimeline/` (mốc "DEM hết miễn phí", "DET hết miễn phí", tối đa 4 mốc, quá hạn ghi "Quá 35 phút", giờ theo Asia/Ho_Chi_Minh).
- Màn quản lý biểu phí DEM/DET dùng `designs/components/WorkTable/`, `designs/components/Field/`, `designs/components/Alert/`, đủ 4 trạng thái (đang tải, trống có nút "Thêm biểu phí", lỗi giữ dữ liệu cũ kèm "Thử lại", có dữ liệu).
- Không có màn hoàn chỉnh riêng cho DEM/DET; chip và mốc dùng lại trong `Screen03-Dispatch`, `Screen04-Orders`, `Screen02-Home` của các task 07, 04, 22.

## Quyết định kiến trúc
- Nghiệp vụ ở `packages/core/modules/orders/` (spec 01 mục 2: orders gồm DEM/DET): `dem-det.ts` (hàm thuần), `dem-det.service.ts`, `dem-det.repo.ts`, `schema.ts`. Job ở `apps/worker/src/jobs/dem-det.ts` chỉ gọi service (ADR-007).
- DEM/DET luôn tính theo từng container (`order_containers.demFreeUntil`, `detFreeUntil`, `storageFreeUntil`), không theo Order (spec 05 mục 5).
- DEM (hàng Nhập): từ `demFreeUntil` đến khi Stop `PICK_FULL` của cont `COMPLETED`. DET: từ `detFreeUntil` đến khi Stop `RETURN_EMPTY` hoặc `STREET_TURN` (đảo vỏ sang đơn Xuất) `COMPLETED`. Storage: theo `storageFreeUntil`, kết thúc như DEM. Thời điểm kết thúc lấy theo thứ tự tin cậy của spec 05 mục 3 (geofence trước, rồi `occurredAt`).
- Số ngày tính theo ngày lịch ở múi giờ tenant (`toTenantDate(ctx, instant)`), không theo UTC. Số tiền theo biểu lũy tiến `dem_det_tariffs` (`fromDay`, `toDay`, `ratePerDay`), chọn bản ghi theo `shippingLineId` của Order, `chargeType`, `containerType`, hiệu lực tại ngày tính (`validTo` NULL là vô thời hạn). Không có biểu phí thì không ghi số 0: ghi cảnh báo thiếu biểu phí.
- Tiền dùng `decimal.js`, `DECIMAL(18,2)` + `currency`.
- Idempotent: chọn một dòng dự tính duy nhất cho mỗi container và mỗi loại phí, cập nhật hằng ngày, chốt khi cont đã lấy/trả (spec 05 mục 5). Khóa idempotent `order_fees.idempotencyKey = '{DEM|DET|STORAGE}:{orderContainerId}'` (unique `uq_order_fee_idem`). Chạy job 2 lần trong cùng ngày không sinh thêm dòng và không đổi số.
- `order_fees`: `feeCategory = 'PASS_THROUGH'`, `source = 'DEM_DET_JOB'`, `feeCode` là `DEM`, `DET` hoặc `STORAGE`, `orderContainerId` có giá trị. Đây là số dự tính để cảnh báo; số chính thức lấy theo hóa đơn hãng tàu khi nhập (task 19/21).
- Spec 02 chưa có cột phân biệt dòng dự tính và dòng đã chốt, và chưa có cột người chịu phí trên `order_fees`. Thêm `order_fees.estimate_status ENUM('ESTIMATING','FINAL') NULL` và `order_fees.charge_to ENUM('CUSTOMER','COMPANY') NOT NULL DEFAULT 'CUSTOMER'`, cập nhật spec 02. Dòng đã `isApproved` hoặc đã chốt thì không `UPDATE` (ADR-009), chỉ sửa bằng bút toán đảo.
- DEM/DET không bị tính lại khi re-pricing (spec 06 mục 4).
- Job: mỗi tenant một job lặp (BullMQ repeatable) theo `tenants.settings.demDetCronHour` (mặc định 00:01 giờ tenant), retry có backoff, dead-letter, log có `tenantId`.
- Cảnh báo 48 giờ và 24 giờ trước `demFreeUntil`, `detFreeUntil`, `storageFreeUntil` và `orders.cutOffAt`: phát sự kiện `demdet.warning` / `cutoff.warning` vào hàng đợi `notifications` với khóa chống trùng `'{loại}:{orderContainerId}:{48h|24h}'`, gửi cho Điều vận (và khách nếu tenant bật). Nếu task 23 chưa xong, sự kiện nằm trong hàng đợi và hiện trong danh sách cảnh báo của Kanban/Trang chủ.
- Quyền: quản lý biểu phí DEM/DET là `ADMIN`, `ACCOUNTANT` (ghi `audit_logs` vì là Tariff, Rule 8); đánh dấu `chargeTo = COMPANY` là `DISPATCHER`, `ADMIN`, bắt buộc lý do, ghi `audit_logs` (`entity = 'order_fees'`).
- Mã lỗi đề xuất: `DEM_DET_TARIFF_NOT_FOUND` (cảnh báo, không chặn), `DEM_DET_TARIFF_OVERLAP` (hai khoảng ngày chồng nhau trong cùng biểu), `FEE_ALREADY_FINAL`.
- Tenant: mọi truy vấn qua `getTenantDb(ctx)`; key Redis của job có tiền tố tenant; repo mới có test tenant isolation.

## Các bước
### Bước 1 — Schema biểu phí và cột phí dự tính
- Thêm `dem_det_tariffs` vào `packages/core/lib/db/schema/pricing.ts` đúng spec 02 (`mysqlEnum` mới cho từng cột, enum khai báo trong `packages/shared/enums.ts`); thêm `estimate_status`, `charge_to` vào `order_fees`; cập nhật spec 02.
- Migration bằng `drizzle-kit generate`, đọc lại SQL. Seed: biểu DET và DEM lũy tiến mẫu cho 2 hãng tàu (ngày 1–5 giá A, ngày 6–10 giá B, từ ngày 11 giá C) và 3 container có hạn miễn phí khác nhau.
- Test tenant isolation cho `DemDetTariffRepo` viết trước.
**Kiểm tra:** `pnpm db:migrate` chạy trên DB trống và DB đã có dữ liệu; `pnpm db:seed` thêm biểu phí mẫu; `pnpm test --filter core -- dem-det.repo` xanh.

### Bước 2 — Hàm tính phí lũy tiến
- Test trước `packages/core/modules/orders/dem-det.test.ts`: tính đúng số ngày quá hạn theo ngày giờ tenant (ca sát nửa đêm giờ Việt Nam khác ngày UTC); biểu lũy tiến 12 ngày quá hạn ra đúng tổng 3 bậc; chưa quá hạn ra 0 ngày và không sinh phí; không có biểu phí trả `DEM_DET_TARIFF_NOT_FOUND`; DEM dừng khi `PICK_FULL` hoàn tất, DET dừng khi `RETURN_EMPTY` hoặc `STREET_TURN` hoàn tất; Storage tính song song với DEM.
- Viết `dem-det.ts` (hàm thuần, `decimal.js`).
**Kiểm tra:** `pnpm test --filter core -- dem-det` xanh, gồm ca nửa đêm và ca 3 bậc.

### Bước 3 — Service ghi dòng dự tính và chốt số
- Test trước (Testcontainers): `runDemDetForTenant(ctx, date)` tạo 1 dòng `order_fees` dự tính cho mỗi container quá hạn và mỗi loại phí; chạy lại cùng ngày không thêm dòng và không đổi số; chạy ngày hôm sau cập nhật số trên chính dòng đó; khi Stop kết thúc thì dòng chuyển `FINAL` và các lần chạy sau không đổi; dòng `FINAL` hoặc đã duyệt không bị `UPDATE`; Order có 5 cont lấy ở 5 ngày khác nhau ra 5 số khác nhau.
- Viết `dem-det.service.ts`, `dem-det.repo.ts`; hàm `markChargeToCompany(ctx, orderFeeId, reason)` ghi audit.
- Server Action đánh dấu ai chịu phí trong `apps/web/src/features/orders/dem-det/actions.ts` với `requireRole(['DISPATCHER', 'ADMIN'])` và zod.
**Kiểm tra:** `pnpm test --filter core -- dem-det.service` xanh; trên DB seed chạy service cho ngày cố định ra đúng 3 dòng phí như bảng kỳ vọng trong test.

### Bước 4 — Job worker theo múi giờ tenant và cảnh báo 48h/24h
- Test trước: lập lịch tạo đúng 1 job lặp cho mỗi tenant với giờ theo `tenants.settings.demDetCronHour` và `tenants.timezone`; chạy job 2 lần trong cùng ngày không sinh thêm phí (test tích hợp với MariaDB và Redis thật qua Testcontainers); job lỗi được retry rồi vào dead-letter; cảnh báo 48h và 24h cho free time và cut-off phát đúng 1 lần mỗi mốc dù job chạy lại.
- Viết `apps/worker/src/jobs/dem-det.ts` và `scheduleDemDetJobs`; phát sự kiện vào hàng đợi `notifications` với khóa chống trùng.
**Kiểm tra:** `pnpm test --filter worker -- dem-det` xanh; chạy `pnpm dev`, gọi chạy job thủ công 2 lần cho tenant seed, đếm `order_fees` có `source = 'DEM_DET_JOB'` không đổi giữa 2 lần.

### Bước 5 — Màn quản lý biểu phí DEM/DET
- Service CRUD biểu phí: chặn chồng khoảng ngày và chồng hiệu lực trong cùng khóa (hãng tàu, loại phí, loại cont), ghi audit. Server Action `requireRole(['ADMIN', 'ACCOUNTANT'])` + zod.
- Route `apps/web/src/app/(tenant)/settings/dem-det-tariffs/page.tsx`, view `apps/web/src/features/orders/dem-det/` dựng bằng WorkTable, Field, Alert; đủ 4 trạng thái.
**Kiểm tra:** `pnpm test --filter core -- dem-det-tariff.service` xanh (ca chồng khoảng ngày bị chặn); mở `/settings/dem-det-tariffs` trên 1440×900 thấy biểu phí seed, tạo bậc chồng ngày thì lỗi hiện ngay dưới ô; `VIEWER` gọi action ghi bị từ chối.

### Bước 6 — Hiển thị phí và đếm ngược trên thẻ container và mốc hạn
- Thêm dữ liệu phí dự tính và hạn DEM/DET vào truy vấn của `ContainerCard` (Kanban, task 07) và `DeadlineTimeline`; chip ghi cả thời gian còn lại ("DET còn 4 giờ 40"), mức màu theo quy tắc 3 giờ / 8 giờ, luôn có icon và chữ; quá hạn ghi "DET quá 1 ngày · dự tính 1.200.000 ₫"; dòng phí có nút đánh dấu "Nhà xe chịu" cho Điều vận.
- E2E Playwright viết trước: cont seed quá hạn DET hiện chip `crit` có số tiền dự tính.
**Kiểm tra:** mở `/dispatch` trên 1440×900 thấy chip DEM/DET đúng mức màu cho 3 cont seed; `pnpm e2e -- dem-det` xanh.

### Bước 7 — Hoàn tất
- Chạy toàn bộ kiểm tra, cập nhật progress.md, đổi trạng thái README, cập nhật spec 02 và spec 05 nếu có quyết định khác.
**Kiểm tra:** `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` không lỗi; `pnpm e2e` cho luồng chip DEM/DET xanh; migration chạy trên DB trống và DB có dữ liệu; đạt "Chấp nhận khi" của ticket: chạy job 2 lần trong cùng ngày không sinh thêm phí.
