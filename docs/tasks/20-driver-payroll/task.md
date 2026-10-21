# 20-driver-payroll — Sổ cái lương tài xế và kỳ lương

> Giai đoạn: GĐ5 · Phụ thuộc: 16, 17 · Nhánh git: `feat/20-driver-payroll`
> Nguồn: `docs/specs/07_implementation_tickets.md` TICKET-20; spec `02_database_schema.md` bảng `payroll_periods`, `driver_ledger`, `trip_costs`, `dispatch_assignments`; spec `00_system_overview_and_adrs.md` ADR-009 và mục 3 (phân hệ 7, 8); spec `05_advanced_workflows_and_ai.md` mục 1 bước 5; spec `04_telemetry_and_fuel.md` mục 2.4 (`PENALTY`); spec `06_hierarchical_pricing_and_fees.md` mục 3; spec `01_core_architecture_and_grill_logs.md` mục 4 (câu hỏi mở về cách tính lương); spec `08_nonfunctional_security_ops.md` mục 2; PRD `docs/PRD.md` mục C14, F9

## Mục tiêu
Sau task này, Kế toán mở một kỳ lương, hệ thống gom mọi bút toán của từng tài xế trong kỳ và tính Thực lãnh = Lương chuyến + Phụ cấp − Tạm ứng − Phạt. Kế toán xem bảng quyết toán từng tài xế, người duyệt chốt kỳ, rồi ghi chi lương; kỳ đã duyệt không nhận thêm bút toán nào. Tài xế xem được sổ lương của chính mình. Mọi sai sót được sửa bằng bút toán đảo, không ai sửa hay xóa được bút toán cũ.

## Phạm vi
**Làm:**
- Bảng `payroll_periods` và `driver_ledger` append-only (tạo nếu task 16 chưa tạo; nếu đã có thì bổ sung ràng buộc và index).
- Ghi `TRIP_SALARY` khi chuyến hoàn tất từ định mức `DRIVER_SALARY` của chuyến, chia theo `completionPercentage` của các assignment (không ghi trùng phần task 09 đã ghi cho cứu hộ).
- Ghi `ALLOWANCE` (phụ cấp) bằng tay có lý do.
- Gắn bút toán vào kỳ lương mở theo ngày ghi sổ ở múi giờ tenant.
- Quyết toán kỳ: Lương chuyến + Phụ cấp − Tạm ứng − Phạt = Thực lãnh; trạng thái kỳ `OPEN` → `CALCULATED` → `APPROVED` → `PAID`.
- Chi lương ghi bút toán `PAYOUT`; kỳ `APPROVED` không cho ghi thêm.
- Bút toán đảo `REVERSAL` để sửa sai.
- Màn kỳ lương và sổ cái tài xế trên web (WorkTable); API chỉ đọc cho tài xế xem sổ lương của mình.

**Không làm (thuộc task khác):**
- Tạm ứng `CASH_ADVANCE`, hoàn ứng `ADVANCE_SETTLEMENT`, hoàn tiền chi phí dọc đường `ON_ROUTE_REIMBURSEMENT` (task 16).
- Phạt vượt định mức dầu `PENALTY` (task 15).
- Chia lương 40/60 khi cứu hộ (task 09); task này dùng lại hàm chia của task 09 nếu đã có.
- Giao diện sổ lương trong app Expo (chưa có thiết kế; xem decisions.md).
- Thanh toán qua ngân hàng và bảng `payments` (task 21).
- Báo cáo chi phí lương theo xe, tuyến (task 22).

## Thiết kế
- Thành phần: `designs/components/WorkTable/` (bảng kỳ lương và bảng quyết toán từng tài xế, dòng tổng, cột cuối đúng một nút), `designs/components/StatusChip/` (trạng thái kỳ: `info` OPEN, `warn` CALCULATED, `ok` APPROVED/PAID), `designs/components/FilterTabs/`, `designs/components/Field/`, `designs/components/Alert/`, `designs/components/EmptyState/`, `designs/components/AppShell/`.
- Không có màn hoàn chỉnh riêng; bố cục theo `designs/README.md` (H1 nói số việc và hạn, khối `surface` viền `line`, 4 trạng thái dữ liệu). Số tiền dùng `tabular-nums`; mã tài xế, mã chuyến dùng `--font-mono`.

## Quyết định kiến trúc
- Nghiệp vụ ở `packages/core/modules/payroll/` (spec 01 mục 2): `service.ts`, `repo.ts`, `schema.ts`, `settlement.ts` (hàm thuần quyết toán).
- `driver_ledger` append-only (ADR-009): repo không có hàm `update`/`delete`; không có `updated_at`/`deleted_at`; sửa sai bằng `REVERSAL` có `reversalOfId`. Test chứng minh không có đường code nào `UPDATE`/`DELETE` bảng này.
- Quy ước dấu (spec 02): dương là công ty nợ tài xế, âm là tài xế nợ công ty. Thực lãnh của kỳ = tổng `amount` các bút toán của tài xế trong kỳ trước `PAYOUT`; công thức ticket tương ứng `TRIP_SALARY` (+) + `ALLOWANCE` (+) + `CASH_ADVANCE` (−) + `PENALTY` (−). Cách xử lý `ADVANCE_SETTLEMENT` và `ON_ROUTE_REIMBURSEMENT` (công thức ticket không nhắc) phải ghi vào decisions.md trước khi code.
- `TRIP_SALARY`: khi `consolidated_trips` chuyển `COMPLETED`, lấy `trip_costs` `NORM` `DRIVER_SALARY` của chuyến, chia cho tài xế các assignment `INTERNAL_FLEET` theo `completionPercentage`, làm tròn đến đồng, phần dư dồn cho tài xế hoàn tất chuyến (spec 05 mục 1 bước 5). Assignment `SUB_CONTRACTOR` không sinh lương (spec 05 mục 2). Chống ghi trùng: kiểm tra `(referenceType = 'ASSIGNMENT', referenceId, transactionType)` trong transaction có khóa; spec 02 chưa có unique cho việc này, thêm cột `idempotency_key` unique `(tenant_id, idempotency_key)` trên `driver_ledger` và cập nhật spec 02.
- Cách tính lương (theo chuyến cố định, theo km hay kết hợp) còn là câu hỏi mở của PO (spec 01 mục 4). Task này chỉ làm theo chuyến qua `fee_tariffs.DRIVER_SALARY` như schema hiện hỗ trợ.
- Kỳ lương: không cho 2 kỳ chồng ngày trong cùng tenant (kiểm tra trong transaction `SELECT ... FOR UPDATE`, vì schema không có ràng buộc). Bút toán gắn `payrollPeriodId` theo `toTenantDate(ctx, createdAt)`; ngày rơi vào kỳ đã `APPROVED`/`PAID` thì vào kỳ mở kế tiếp (không bị mất), ghi chú rõ.
- Chuyển trạng thái kỳ hợp lệ: `OPEN` → `CALCULATED` (tính quyết toán, còn tính lại được) → `APPROVED` (khóa, không nhận thêm bút toán; trả `PAYROLL_PERIOD_LOCKED`) → `PAID` (đã ghi `PAYOUT` cho mọi tài xế có thực lãnh dương). `PAYOUT` có số âm bằng thực lãnh để số dư về 0.
- Quyền (spec 08 mục 2 chỉ nêu `ACCOUNTANT` tạo `PENALTY`; vai trò duyệt kỳ chưa được chốt): đề xuất `ACCOUNTANT` tạo kỳ, ghi phụ cấp, tính quyết toán, ghi chi lương; `OWNER`/`ADMIN` duyệt kỳ; `DRIVER` chỉ đọc sổ của chính mình qua `/api/v1/driver/*`. Ghi đề xuất này vào decisions.md và hỏi người dùng trước khi code.
- Mọi bút toán và chuyển trạng thái kỳ ghi `audit_logs` trong cùng transaction (Rule 8: Ledger).
- Tiền `decimal.js`, `DECIMAL(18,2)` + `currency`. Ngày kỳ là `DATE` theo múi giờ tenant.
- PII: số điện thoại, CCCD tài xế không hiện trong bảng quyết toán; xuất file có audit (spec 02 mục 1).
- Mã lỗi đề xuất: `PAYROLL_PERIOD_OVERLAP`, `PAYROLL_PERIOD_LOCKED`, `PAYROLL_INVALID_TRANSITION`, `LEDGER_IMMUTABLE`, `LEDGER_ALREADY_POSTED`.
- Tenant: mọi truy vấn qua `getTenantDb(ctx)`; API tài xế lấy `driverId` từ JWT, không từ input; repo mới có test tenant isolation.

## Các bước
### Bước 1 — Schema kỳ lương, sổ cái và migration
- Thêm hoặc bổ sung `payroll_periods`, `driver_ledger` trong `packages/core/lib/db/schema/payroll.ts` đúng spec 02; thêm `idempotency_key` và unique; cập nhật spec 02.
- Migration `drizzle-kit generate`, đọc lại SQL (nếu bảng đã có từ task 16 thì migration chỉ thêm cột, chạy được trên DB đã có bút toán).
- Seed: kỳ 10/2026 `OPEN`, 3 tài xế có chuyến hoàn tất, 1 tạm ứng, 1 phạt.
- Test tenant isolation cho `PayrollRepo`, `LedgerRepo` viết trước; test repo `LedgerRepo` không có hàm sửa/xóa.
**Kiểm tra:** `pnpm db:migrate` chạy trên DB trống và DB đã có dữ liệu (có bút toán của task 16); `pnpm db:seed` thêm kỳ mẫu; `pnpm test --filter core -- payroll.repo` xanh.

### Bước 2 — Hàm quyết toán thuần
- Test trước `packages/core/modules/payroll/settlement.test.ts`: bảng ví dụ Lương chuyến + Phụ cấp − Tạm ứng − Phạt = Thực lãnh; bút toán đảo triệt tiêu đúng bút toán gốc; thực lãnh âm (tài xế còn nợ) chuyển sang kỳ sau; tổng các tài xế khớp tổng sổ cái kỳ đến từng đồng.
- Viết `settlement.ts` (`decimal.js`).
**Kiểm tra:** `pnpm test --filter core -- settlement` xanh.

### Bước 3 — Ghi lương chuyến và phụ cấp vào sổ cái
- Test trước (Testcontainers): chuyến `COMPLETED` ghi đúng 1 `TRIP_SALARY` cho tài xế; gọi lại không ghi trùng (`LEDGER_ALREADY_POSTED` hoặc bỏ qua); chuyến có 2 assignment 40/60 chia đúng đến từng đồng, dư dồn tài xế hoàn tất; assignment `SUB_CONTRACTOR` không sinh lương; `ALLOWANCE` bắt buộc lý do; bút toán vào đúng kỳ theo ngày giờ tenant; mọi bút toán có audit.
- Viết `postTripSalary`, `postAllowance`, `postReversal` trong `service.ts`; nối `postTripSalary` vào sự kiện chuyến hoàn tất.
**Kiểm tra:** `pnpm test --filter core -- payroll.posting` xanh.

### Bước 4 — Vòng đời kỳ lương, quyết toán, duyệt và chi lương
- Test trước: tạo kỳ chồng ngày bị chặn `PAYROLL_PERIOD_OVERLAP`; `OPEN` → `CALCULATED` → `APPROVED` → `PAID` theo đúng thứ tự, nhảy cóc bị chặn; kỳ `APPROVED` ghi thêm bút toán trả `PAYROLL_PERIOD_LOCKED`; chi lương ghi `PAYOUT` cho mọi tài xế có thực lãnh dương, số dư kỳ về 0; role không đúng gọi action bị từ chối; mọi chuyển trạng thái có audit.
- Viết `createPeriod`, `calculatePeriod`, `approvePeriod`, `payoutPeriod`; Server Action trong `apps/web/src/features/payroll/actions.ts` mở đầu bằng `requireRole([...])` theo ma trận quyền đã chốt, validate zod.
**Kiểm tra:** `pnpm test --filter core -- payroll.period` và `pnpm test --filter web -- payroll.actions` xanh.

### Bước 5 — Màn kỳ lương và sổ cái tài xế
- Route `apps/web/src/app/(tenant)/billing/payroll/page.tsx` (danh sách kỳ) và `.../payroll/[periodId]/page.tsx` (quyết toán từng tài xế), view ở `apps/web/src/features/payroll/`.
- Bảng quyết toán: tài xế, Lương chuyến, Phụ cấp, Tạm ứng, Phạt, Thực lãnh, nút xem sổ cái chi tiết; nút "Tính quyết toán", "Duyệt kỳ", "Ghi chi lương" theo trạng thái và quyền; hộp ghi phụ cấp và bút toán đảo có lý do; 4 trạng thái dữ liệu.
- E2E Playwright viết trước `apps/web/e2e/payroll.spec.ts`.
**Kiểm tra:** mở `/billing/payroll` trên 1440×900 thấy kỳ 10/2026 seed; `pnpm e2e -- payroll` xanh với luồng tính, duyệt, chi lương và thử ghi phụ cấp vào kỳ đã duyệt thấy `Alert` báo kỳ đã khóa.

### Bước 6 — API tài xế xem sổ lương
- Route Handler `apps/web/src/app/api/v1/driver/ledger/route.ts` (JWT tài xế, zod cho tham số kỳ), trả bút toán và số dư của chính tài xế.
- Test trước: tài xế A không xem được sổ của tài xế B dù đổi tham số; tenant khác không đọc được; không trả PII của người khác.
**Kiểm tra:** `pnpm test --filter web -- driver.ledger` xanh.

### Bước 7 — Hoàn tất
- Chạy toàn bộ kiểm tra, cập nhật progress.md, đổi trạng thái README, cập nhật spec 02 nếu có quyết định khác.
**Kiểm tra:** `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` không lỗi; `pnpm e2e` cho luồng kỳ lương xanh; migration chạy trên DB trống và DB có dữ liệu; đạt yêu cầu của ticket (TICKET-20 không ghi "Chấp nhận khi" riêng, dùng đúng các ý của ticket): có `payroll_periods`; `driver_ledger` append-only, không có đường sửa/xóa; quyết toán Lương chuyến + Phụ cấp − Tạm ứng − Phạt = Thực lãnh khớp đến từng đồng; chi lương ghi `PAYOUT`; kỳ đã `APPROVED` không cho ghi thêm.
