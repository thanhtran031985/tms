# 17-trip-cost-allocation — Chi phí chuyến và phân bổ theo định mức

> Giai đoạn: GĐ5 · Phụ thuộc: 15, 16 · Nhánh git: `feat/17-trip-cost-allocation`
> Nguồn: `docs/specs/07_implementation_tickets.md` TICKET-17; spec `06_hierarchical_pricing_and_fees.md` mục 3 (Định mức chi phí, Chi phí thực tế, Phân bổ chi phí, Khóa chi phí); spec `02_database_schema.md` bảng `trip_costs`, `trip_containers`, `consolidated_trips`, `order_containers`, `orders`; spec `01_core_architecture_and_grill_logs.md` mục 3 và Rule 9; spec `04_telemetry_and_fuel.md` mục 2.4; spec `05_advanced_workflows_and_ai.md` mục 1 bước 6 và mục 2; spec `03_dispatch_and_concurrency.md` mục 4; PRD `docs/PRD.md` mục C11, F5, F6

## Mục tiêu
Sau task này, mỗi chuyến xe có đủ chi phí định mức và chi phí thực tế, và hệ thống tự chia chi phí chuyến về từng container theo định mức để Order có giá vốn. Kế toán mở màn "Phân bổ chi phí chuyến", so số hệ thống đề xuất với số mình áp dụng, sửa theo tiền hoặc theo %, ghi lý do và chỉ lưu được khi tổng khớp đúng chi phí chuyến. Khi chuyến đã xong và chi phí dọc đường đã duyệt hết, Kế toán khóa chi phí để số liệu không bị đổi nữa.

## Phạm vi
**Làm:**
- Bảng `trip_costs` (nếu task 09, 15 hoặc 16 chưa tạo) và các cột còn thiếu cho phân bổ.
- Sinh `trip_costs` loại `NORM` cho chuyến từ `fee_tariffs` (`COST_NORM`) theo `tripMode` của chuyến; cập nhật `consolidated_trips.totalCostNorm`.
- Gom `trip_costs` loại `ACTUAL`: dầu (`FUEL`, từ `fuel_transactions` đã `APPROVED`, chia theo km), chi phí dọc đường đã duyệt (`trip_expenses` `APPROVED`), thuê xe ngoài (`SUBCONTRACT`, từ `agreedSubcontractCost`), cứu hộ (`RESCUE`); cập nhật `consolidated_trips.totalActualCost`.
- Service phân bổ tự động theo `COST_NORM_RATIO` (mặc định) và các phương pháp tenant chọn được: `REVENUE_RATIO`, `EQUAL`, `DISTANCE_RATIO`; chi phí chỉ gắn với 1 container được gán thẳng; làm tròn đến đồng, dư dồn container cuối.
- Cập nhật `order_containers.allocatedCostAmount` và `orders.totalAllocatedCostAmount`.
- Kế toán sửa phân bổ: nhập theo tiền hoặc %, bắt buộc lý do, tổng phải khớp, không số âm, khôi phục số hệ thống, audit.
- Chi phí chuyến đổi sau khi Kế toán đã sửa: chia phần chênh theo tỷ lệ Kế toán đang áp dụng, không ghi đè số của Kế toán, gắn cờ "cần Kế toán xem lại".
- Khóa chi phí chuyến (`costLockedAt`) và chặn sửa sau khóa.
- Màn hình "Phân bổ chi phí chuyến" theo `Screen08-CostAlloc`.

**Không làm (thuộc task khác):**
- Duyệt phiếu dầu, thuật toán full-to-full và bút toán `PENALTY` (task 15).
- Khai, duyệt chi phí dọc đường và chi hộ sinh `order_fees` `PASS_THROUGH` (task 16).
- Ghi `SUBCONTRACT`/`RESCUE` lúc xử lý cứu hộ và bắn xe ngoài (task 09); task này chỉ đọc và đưa vào phân bổ nếu task 09 đã ghi, hoặc tự gom từ `dispatch_assignments`/`incidents` nếu chưa.
- Tách chuyến làm đặt lại phân bổ đã sửa tay về số hệ thống (task 08, spec 03 mục 4); task này chỉ cung cấp hàm `resetAllocationToSystem` để task 08 gọi.
- Bảng `accounting_periods` và thao tác khóa kỳ (task 21); task này chỉ kiểm tra kỳ `CLOSED` nếu bảng đã có.
- Bút toán điều chỉnh sau khóa chi phí (task 21).
- Lương tài xế vào `driver_ledger` (task 20).
- Báo cáo P&L so sánh số hệ thống và số Kế toán (task 22).
- Thông báo "cần Kế toán xem lại" gửi ra ngoài (task 23); task này chỉ gắn cờ và hiện trên màn.

## Thiết kế
- `designs/components/Screen08-CostAlloc/` (đọc README.md và preview.html; 4 trạng thái: Bình thường; Đang tải là khung xương cho hai bảng; Trống là "Chuyến chưa có khoản chi phí nào được duyệt" kèm nút "Mở phiếu dầu của chuyến"; Lỗi là `Alert` đỏ có "Thử lại", giữ số đã lưu và tạm khóa nút Lưu).
- Thành phần: `designs/components/AppShell/`, `designs/components/TenantPicker/`, `designs/components/WorkTable/`, `designs/components/Field/`, `designs/components/Button/`, `designs/components/StatusChip/`, `designs/components/Alert/`, `designs/components/FilterTabs/` (chuyển "Theo số tiền" / "Theo %"), `designs/components/EmptyState/`.
- Khoản không phát sinh ghi "Không phát sinh", không ghi 0. Mã chuyến, số cont, mã Order, biển số dùng `--font-mono`.

## Quyết định kiến trúc
- Nghiệp vụ nằm ở `packages/core/modules/billing/` (spec 01 mục 2: billing gồm phân bổ chi phí): `trip-costs.service.ts`, `allocation.service.ts`, `repo.ts`, `schema.ts`. Hàm phân bổ là hàm thuần nhận danh sách chi phí và container, trả số phân bổ, để property test được không cần DB.
- Tiền dùng `decimal.js`, cột `DECIMAL(18,2)` + `currency`; tỷ lệ `DECIMAL(9,6)` (`systemRatio`, `allocationRatio`). Không dùng `number` cho tiền (ADR-008).
- Định mức chi phí chuyến (`NORM`): tra `fee_tariffs` với `feeCategory = 'COST_NORM'` theo `tripMode` của `consolidated_trips`, đúng 1 mức `DRIVER_SALARY` và 1 mức `TOLL_FEE` cho cả chuyến, không cộng đôi (spec 06 mục 3). Chuyến ghép 2 khách khác nhau tra với `customerId = NULL`. Ghi `trip_costs` (`costType = 'NORM'`, `sourceTariffId`), không ghi vào `order_fees`.
- Tỷ lệ `COST_NORM_RATIO`: với từng container, tổng định mức chi phí nếu container đó chạy `SINGLE` (tra `fee_tariffs` của cont với `tripMode = 'SINGLE'`). `REVENUE_RATIO` theo `order_containers.baseFreightAmount`; `EQUAL` chia đều; `DISTANCE_RATIO` theo `routes.standardDistanceKm` của tuyến container. Phương pháp mặc định đọc từ `tenants.settings.costAllocationMethod` (validate zod).
- Phân bổ mọi chi phí của chuyến (lương, cầu đường, dầu, chi phí dọc đường, thuê xe ngoài, cứu hộ). Với mỗi `feeCode`, nếu đã có `ACTUAL` thì dùng `ACTUAL`, chưa có thì dùng `NORM` (đây là cách hiểu đề xuất, xem "Phát sinh khi làm" trong decisions.md nếu đổi).
- Chi phí chỉ gắn với 1 container (ví dụ `trip_expenses.orderContainerId` có giá trị) gán thẳng cho container đó, không đem chia. Spec 02 chưa có cột trên `trip_costs` để đánh dấu điều này: thêm `trip_costs.order_container_id` (NULL = chi phí chung của chuyến) và cập nhật spec 02.
- Làm tròn: từng phần làm tròn tới đồng, phần dư dồn vào container cuối (theo `order_containers.lineNo` trong chuyến) để tổng phân bổ bằng đúng tổng chi phí chuyến.
- Kết quả đề xuất lưu `trip_containers.systemRatio` / `systemAmount` và đồng thời `allocationRatio` / `allocatedAmount`. Kế toán sửa thì ghi `isManualOverride = true`, `overrideReason`, `consolidated_trips.allocationMethod = 'MANUAL'`, `allocationAdjustedBy`, `allocationAdjustedAt`.
- Cờ "cần Kế toán xem lại": spec 02 chưa có cột. Thêm `consolidated_trips.allocation_review_required BOOLEAN NOT NULL DEFAULT false` và cập nhật spec 02. Kế toán bấm xác nhận thì xóa cờ, ghi audit.
- Quyền: chỉ `ACCOUNTANT` và `ADMIN` được sửa, khôi phục và khóa (spec 06 mục 3). `DISPATCHER` chỉ xem. Kiểm tra bằng `requireRole(['ACCOUNTANT', 'ADMIN'])` trong Server Action, ma trận quyền ở `modules/identity/permissions.ts`.
- Ràng buộc lưu: tổng `allocatedAmount` = tổng chi phí chuyến (phần chia) đúng đến đồng; không số âm; `overrideReason` bắt buộc khi có dòng khác số đã lưu.
- Khóa lạc quan: Server Action gửi `consolidated_trips.version`; lệch thì trả `STALE_DATA` (spec 03 mục 1 bước 9), màn hiện trạng thái Lỗi và tải lại.
- Khóa chi phí: chỉ khi chuyến `COMPLETED` và mọi `trip_expenses` của chuyến không còn `SUBMITTED`. Sau `costLockedAt` mọi thao tác sửa trả lỗi. Nếu bảng `accounting_periods` đã có (task 21) và kỳ chứa ngày chạy chuyến là `CLOSED` thì cũng chặn.
- Mã lỗi thêm vào `packages/shared` (tên đề xuất): `ALLOCATION_TOTAL_MISMATCH`, `ALLOCATION_NEGATIVE_AMOUNT`, `OVERRIDE_REASON_REQUIRED`, `TRIP_COST_LOCKED`, `TRIP_NOT_COMPLETED`, `EXPENSES_PENDING_APPROVAL`, `ACCOUNTING_PERIOD_CLOSED`, `STALE_DATA`.
- Audit: mọi lần tạo, sửa, khôi phục phân bổ và khóa chi phí ghi `audit_logs` trong cùng transaction (`entity = 'consolidated_trips'`, `action` là `ALLOCATE`, `ALLOCATION_OVERRIDE`, `ALLOCATION_RESTORE`, `COST_LOCK`, `before`/`after` là số từng container).
- Tenant: mọi truy vấn qua `getTenantDb(ctx)`; kiểm tra chuyến, container, tariff cùng tenant trước khi ghi. Mỗi repo mới có test tenant isolation.
- Tính lại phân bổ khi có sự kiện đổi chi phí (duyệt phiếu dầu, duyệt chi phí dọc đường, ghi thuê xe ngoài, cứu hộ, chuyến hoàn tất) qua một hàm `recalculateTripCosts(ctx, tripId)` gọi trong cùng transaction với sự kiện; chạy lại nhiều lần cho cùng kết quả (idempotent).

## Các bước
### Bước 1 — Schema và migration chi phí chuyến
- Thêm/kiểm tra `trip_costs` trong `packages/core/lib/db/schema/billing.ts` đúng spec 02, thêm cột `order_container_id` (FK `order_containers`, NULL được) và index `(tenant_id, trip_id)`.
- Thêm cột `allocation_review_required` vào `consolidated_trips`.
- Tạo migration bằng `drizzle-kit generate`, đọc lại SQL; seed tối thiểu: 1 chuyến `TWIN_20` 2 cont 20 ft có `fee_tariffs` `COST_NORM` (khớp số trong preview: lương 850.000 ₫, cầu đường 420.000 ₫) và 1 chuyến `SINGLE`.
- Cập nhật spec 02 cho 2 cột mới.
- Viết test tenant isolation cho `TripCostRepo` trước (Testcontainers MariaDB): session Tenant B không đọc và không sửa được `trip_costs`, `trip_containers` của Tenant A.
**Kiểm tra:** `pnpm db:migrate` chạy được trên DB trống và trên DB đã `pnpm db:seed` của các task trước; `pnpm db:seed` thêm đúng 2 chuyến mẫu; `pnpm test --filter core -- trip-cost.repo` xanh, có ca Tenant B đọc ra 0 dòng và update ảnh hưởng 0 dòng.

### Bước 2 — Hàm phân bổ thuần và property test
- Viết test trước trong `packages/core/modules/billing/allocation.test.ts`: property test (thư viện property test, ví dụ `fast-check`, cần thêm vào devDependencies của `packages/core` và ghi decisions.md) với mọi bộ chi phí và container ngẫu nhiên, tổng phân bổ bằng đúng tổng chi phí chuyến, không phần nào âm; test bảng ví dụ cho từng phương pháp `COST_NORM_RATIO`, `REVENUE_RATIO`, `EQUAL`, `DISTANCE_RATIO`; ca chia 100.000 ₫ cho 3 cont thì dư dồn cont cuối; ca chi phí gán thẳng không bị chia.
- Viết `allocation.ts` (hàm thuần, `decimal.js`) cho xanh.
**Kiểm tra:** `pnpm test --filter core -- allocation` xanh; property test chạy tối thiểu 1.000 bộ ngẫu nhiên không có ca lệch 1 đồng nào.

### Bước 3 — Sinh chi phí định mức và gom chi phí thực tế
- Test trước (Testcontainers): chuyến `TWIN_20` sinh đúng 1 dòng `DRIVER_SALARY` và 1 dòng `TOLL_FEE` loại `NORM` cho cả chuyến, không cộng đôi; chuyến ghép 2 khách khác nhau tra với `customerId = NULL`; không có định mức thì trả `TARIFF_NOT_FOUND`, không ghi 0; gom `ACTUAL` từ phiếu dầu `APPROVED` chia theo km, `trip_expenses` `APPROVED`, `agreedSubcontractCost`, chi phí cứu hộ `RESCUE`; chạy `recalculateTripCosts` 2 lần không sinh dòng trùng.
- Viết `trip-costs.service.ts`: `generateNormCosts`, `collectActualCosts`, `recalculateTripCosts`; cập nhật `totalCostNorm`, `totalActualCost`.
**Kiểm tra:** `pnpm test --filter core -- trip-costs` xanh, gồm ca idempotent và ca `TARIFF_NOT_FOUND`.

### Bước 4 — Service phân bổ tự động và tổng hợp lên Order
- Test trước: tạo phân bổ cho chuyến seed ra `systemRatio`/`systemAmount` và `allocationRatio`/`allocatedAmount` bằng nhau; `order_containers.allocatedCostAmount` bằng tổng `trip_containers.allocatedAmount` của cont qua mọi chuyến (cont đi 2 chuyến); `orders.totalAllocatedCostAmount` bằng tổng các cont; có `audit_logs` `ALLOCATE`.
- Viết `allocation.service.ts`: `allocateTrip(ctx, tripId)` dùng hàm thuần ở bước 2, ghi trong một transaction, đọc phương pháp từ `tenants.settings`.
- Nối `recalculateTripCosts` với `allocateTrip` cho chuyến chưa sửa tay.
**Kiểm tra:** `pnpm test --filter core -- allocation.service` xanh; trên DB seed, tổng `allocatedAmount` của chuyến `TWIN_20` đúng bằng tổng chi phí chuyến trừ phần gán thẳng.

### Bước 5 — Kế toán sửa phân bổ, khôi phục, cờ xem lại và khóa chi phí
- Test trước: Kế toán lưu số lệch tổng bị chặn với `ALLOCATION_TOTAL_MISMATCH`; số âm bị chặn; thiếu lý do bị chặn; nhập theo % quy ra tiền đúng và vẫn phải khớp tổng; role khác `ACCOUNTANT`/`ADMIN` (ví dụ `DISPATCHER`, `VIEWER`) gọi action bị từ chối; lưu thành công đặt `isManualOverride`, `allocationMethod = 'MANUAL'`, `allocationAdjustedBy/At` và audit số trước, số sau; "Khôi phục số hệ thống" trả về `systemAmount` và ghi audit; chi phí chuyến tăng sau khi Kế toán sửa thì số của Kế toán không bị ghi đè, phần chênh chia theo `allocationRatio` đang áp dụng và cờ `allocation_review_required = true`; khóa khi chuyến chưa `COMPLETED` hoặc còn chi phí `SUBMITTED` bị chặn; sau khi khóa mọi thao tác sửa trả `TRIP_COST_LOCKED`; gửi `version` cũ trả `STALE_DATA`.
- Viết `overrideAllocation`, `restoreSystemAllocation`, `acknowledgeReview`, `lockTripCosts`, `resetAllocationToSystem` trong service; zod schema trong `packages/core/modules/billing/schema.ts`; Server Action trong `apps/web/src/features/billing/cost-allocation/actions.ts` bắt đầu bằng `requireRole(['ACCOUNTANT', 'ADMIN'])`, validate zod rồi gọi service, trả `{ ok, data } | { ok: false, code, message }`.
**Kiểm tra:** `pnpm test --filter core -- allocation.override` và `pnpm test --filter web -- cost-allocation.actions` xanh, đủ các ca trên.

### Bước 6 — Màn hình Phân bổ chi phí chuyến
- Route `apps/web/src/app/(tenant)/billing/cost-allocation/[tripId]/page.tsx` chỉ định tuyến; view trong `apps/web/src/features/billing/cost-allocation/` dựng từ `src/components/ui` (WorkTable, Field, Alert, StatusChip, FilterTabs, EmptyState).
- Thẻ thông tin chuyến; bảng "Chi phí chuyến theo khoản" có dòng tổng, phần chia và phần gán thẳng; bảng "Phân bổ cho từng container" có thanh cân, cột Hệ thống đề xuất, Kế toán áp dụng, Chênh, Gán thẳng, Tổng vào cont; chuyển "Theo số tiền" / "Theo %"; nút "Dồn/Trừ phần lệch" vào cont cuối; "Khôi phục số hệ thống"; mở chi phí của cont qua mọi chuyến; xác nhận cờ "Cần xem lại"; ô Lý do điều chỉnh có lỗi ngay dưới ô; Lịch sử thay đổi đọc từ `audit_logs`; thanh lưu cố định ở đáy với tổng chuyến, đã phân bổ, còn lệch; nút Lưu khóa khi còn lệch khác 0 ₫, thiếu lý do hoặc đang lỗi.
- Chuyến đã khóa thì chỉ xem. Đủ 4 trạng thái theo preview. `DISPATCHER` thấy màn ở chế độ chỉ xem.
- Viết E2E Playwright `apps/web/e2e/cost-allocation.spec.ts` trước khi hoàn thiện UI.
**Kiểm tra:** mở `/billing/cost-allocation/<tripId của chuyến seed>` trên 1440×900 và 1366×768 khớp preview; `pnpm e2e -- cost-allocation` xanh với luồng: sửa số để lệch thì nút Lưu khóa, bấm "Trừ phần lệch" thì cân, thiếu lý do thì báo lỗi dưới ô, nhập lý do rồi lưu thì lịch sử thêm 1 dòng, "Khôi phục số hệ thống" trả về số đề xuất; đăng nhập `DISPATCHER` không thấy nút Lưu và gọi action trực tiếp bị từ chối.

### Bước 7 — Hoàn tất
- Chạy toàn bộ kiểm tra, cập nhật progress.md, đổi trạng thái README, cập nhật spec 02 và spec 06 nếu có quyết định khác.
**Kiểm tra:** `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` không lỗi; `pnpm e2e` cho luồng sửa phân bổ xanh; migration chạy trên DB trống và DB có dữ liệu; đạt "Chấp nhận khi" của ticket: property test với mọi bộ chi phí ngẫu nhiên, tổng phân bổ = tổng chi phí chuyến; Kế toán lưu số lệch tổng bị chặn; role khác `ACCOUNTANT`/`ADMIN` không sửa được; chi phí chuyến tăng sau khi Kế toán sửa không ghi đè số của Kế toán và gắn cờ cần xem lại; sau khi khóa không sửa được.
