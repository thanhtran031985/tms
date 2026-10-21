# 16-road-expenses — Chi phí dọc đường và tạm ứng

> Giai đoạn: GĐ5 · Phụ thuộc: 06, 10 · Nhánh git: `feat/16-road-expenses`
> Nguồn: `docs/specs/07_implementation_tickets.md` TICKET-16; spec `02_database_schema.md` bảng `trip_expenses`, `order_fees`, `driver_ledger`, `attachments`; spec `00_system_overview_and_adrs.md` mục 1 (Chi hộ), ADR-008, ADR-009; spec `01_core_architecture_and_grill_logs.md` mục 3 ("Tại sao phí chi hộ tách khỏi phụ phí doanh thu"), Rule 7; spec `05_advanced_workflows_and_ai.md` mục 2 (phát sinh của nhà xe ngoài nhập `trip_expenses` có duyệt); spec `06_hierarchical_pricing_and_fees.md` mục 3 (chi phí thực tế), mục 5 (kỳ `CLOSED`); spec `08_nonfunctional_security_ops.md` mục 2 (chỉ `ACCOUNTANT` duyệt chi phí); PRD `docs/PRD.md` mục C10, D

## Mục tiêu
Sau task này, tài xế khai chi phí dọc đường ngay trên app (nâng hạ, cầu đường tiền mặt, gửi xe, cược vỏ, sửa xe) kèm ảnh hóa đơn, kể cả khi mất sóng. Kế toán duyệt hoặc từ chối trên web; khoản tài xế bỏ tiền túi được hoàn vào sổ lương, khoản chi hộ khách tự sinh phí thu hộ trên Order mà không tính vào doanh thu. Kế toán ghi tạm ứng tiền mặt cho tài xế và hoàn ứng, và luôn thấy tài xế đang còn giữ bao nhiêu tiền tạm ứng.

## Phạm vi
**Làm:**
- Bảng `trip_expenses` (nếu chưa có).
- Tài xế khai chi phí từ app: loại (`LIFT_ON`, `LIFT_OFF`, `TOLL_CASH`, `PARKING`, `CONTAINER_DEPOSIT`, `REPAIR`), số tiền, người trả (`DRIVER_CASH`, `COMPANY_CARD`, `ADVANCE`), container hoặc chuyến liên quan, có hóa đơn VAT hay không, ảnh hóa đơn bắt buộc; có `clientEventId`, gửi qua outbox của task 11.
- Kế toán duyệt (`APPROVED`) hoặc từ chối (`REJECTED` kèm lý do) trên web.
- Chi hộ: chi phí `isRebillable = true` khi duyệt sinh `order_fees` `PASS_THROUGH` (`source = 'EXPENSE_REBILL'`, `sourceRefId` = chi phí), cập nhật `orders.totalPassThroughAmount`.
- Tạm ứng và hoàn ứng ghi `driver_ledger`: `CASH_ADVANCE`, `ADVANCE_SETTLEMENT`, `ON_ROUTE_REIMBURSEMENT`; xem số dư tạm ứng còn lại của từng tài xế.
- Sửa sai sau khi đã duyệt bằng bút toán đảo (`REVERSAL`), không sửa hay xóa dòng cũ.
- Điều vận nhập phát sinh ngoài giá thỏa thuận do nhà xe ngoài báo (nâng hạ, chờ đợi) thành `trip_expenses` chờ Kế toán duyệt.
- Giao diện web duyệt chi phí và tạm ứng; tab Chi phí trên app tài xế.

**Không làm (thuộc task khác):**
- Đưa chi phí đã duyệt vào `trip_costs` `ACTUAL` và phân bổ về container (task 17 gom từ `trip_expenses` `APPROVED`).
- Kỳ lương, quyết toán thực lãnh và `PAYOUT` (task 20).
- Xuất hóa đơn cho khoản chi hộ và cách xử lý thuế chi hộ (task 21, cần kế toán trưởng xác nhận theo spec 06 mục 5).
- Bảng `accounting_periods` và khóa kỳ (task 21); task này chỉ chặn ghi vào kỳ `CLOSED` nếu bảng đã có.
- Outbox, upload tiếp tục được và xung đột (task 11); task này dùng lại.
- Thông báo chi phí bị từ chối gửi ra ngoài app (task 23).

## Thiết kế
- `designs/components/WorkTable/` cho danh sách duyệt chi phí và danh sách tạm ứng trên web (cột đầu `StatusChip`, cột cuối một nút; 4 trạng thái: Bình thường sắp theo độ gấp; Đang tải dòng xương `tms-skel`; Trống thay bảng bằng `EmptyState`; Lỗi `Alert` giữ dữ liệu cũ và "Thử lại").
- `designs/components/Screen09-DriverApp/` (đọc README.md và preview.html; tab Chi phí: chọn loại → số tiền → ảnh hóa đơn bắt buộc → Gửi; offline thì chi phí chuyển "Chờ gửi"; 4 trạng thái như danh sách lệnh).
- Thành phần: `designs/components/FilterTabs/` (Chờ duyệt · Đã duyệt · Từ chối), `designs/components/Field/`, `designs/components/Button/`, `designs/components/StatusChip/`, `designs/components/Alert/`, `designs/components/EmptyState/`.
- Màn web chưa có thiết kế riêng: dựng theo `designs/README.md`, ghi phần tự quyết vào `decisions.md`. Số tiền dùng số thẳng cột (`tabular-nums`), định dạng vi-VN.

## Quyết định kiến trúc
- Nghiệp vụ ở `packages/core/modules/expenses/` (`expense.service.ts`, `advance.service.ts`, `repo.ts`, `schema.ts`); bút toán sổ cái qua `packages/core/modules/payroll/ledger.ts` (dùng chung với task 09, 15, 20). Server Action ở `apps/web/src/features/expenses/`, API app ở `apps/web/src/app/api/v1/driver/expenses/`.
- Idempotent (Rule 7): `trip_expenses.clientEventId` có `UNIQUE(tenant_id, client_event_id)`; gửi lại trả kết quả cũ.
- Ảnh hóa đơn lưu `attachments` (`ownerType = 'EXPENSE'`, `kind = 'RECEIPT'`), bắt buộc khi khai từ app; ảnh trùng `sha256` với chi phí khác thì gắn cảnh báo cho Kế toán.
- Chi phí phải gắn với chuyến hoặc container mà tài xế đang được giao (kiểm tra trong service); `CONTAINER_DEPOSIT` và chi hộ phải có `orderId`. Số tiền `DECIMAL(18,2)` + `currency`, lớn hơn 0, tính bằng `decimal.js`.
- Dấu tiền trong `driver_ledger` theo spec 02: dương là công ty nợ tài xế, âm là tài xế nợ công ty. Đề xuất (chốt trong plan.md và `decisions.md`): Kế toán chi tạm ứng → `CASH_ADVANCE` âm; chi phí `DRIVER_CASH` được duyệt → `ON_ROUTE_REIMBURSEMENT` dương; chi phí `ADVANCE` được duyệt → `ADVANCE_SETTLEMENT` dương (cấn vào tạm ứng); tài xế nộp lại tiền tạm ứng thừa → `ADVANCE_SETTLEMENT` dương; `COMPANY_CARD` không ghi sổ cái. Số dư tạm ứng = tổng các dòng `CASH_ADVANCE` và `ADVANCE_SETTLEMENT` của tài xế.
- `driver_ledger` append-only: không `UPDATE`/`DELETE`, sửa sai bằng dòng `REVERSAL` có `reversalOfId` (ADR-009). Mỗi bút toán có `referenceType` (`TRIP_EXPENSE`, `CASH_ADVANCE`) và `referenceId`; chạy lại không sinh trùng.
- Chi hộ: `order_fees` `feeCategory = 'PASS_THROUGH'`, `source = 'EXPENSE_REBILL'`, `feeCode` = `expenseCode`, `orderContainerId` nếu chi phí gắn container, `idempotencyKey = 'EXPENSE:{expenseId}'`, `isApproved = true` và `approvedBy` là Kế toán duyệt chi phí (đề xuất, ghi `decisions.md`). Không cộng vào doanh thu cước; cập nhật `orders.totalPassThroughAmount` trong cùng transaction. Đảo duyệt thì tạo `order_fees` đảo có `reversalOfId`.
- Phát sinh của nhà xe ngoài: spec 02 bắt buộc `trip_expenses.driverId` NOT NULL và tham chiếu `drivers`, nhưng nhà xe ngoài không có bản ghi tài xế. Đề xuất cho `driver_id` NULL khi có `dispatch_assignment_id` loại `SUB_CONTRACTOR` và thêm cột `subcontractor_vendor_id`; khoản này không ghi `driver_ledger`. Phải được người dùng chốt, ghi `decisions.md` và cập nhật spec 02 trước bước 1.
- Quyền (spec 08 mục 2): duyệt, từ chối, đảo, ghi tạm ứng và hoàn ứng chỉ `requireRole(['ACCOUNTANT'])` (thêm `ADMIN` chỉ khi ma trận task 01 cho phép); nhập phát sinh nhà xe ngoài `requireRole(['DISPATCHER', 'ADMIN'])`; API app `requireRole(['DRIVER'])`, `driverId` lấy từ token. Mọi đầu vào validate zod.
- Kỳ kế toán: nếu bảng `accounting_periods` (task 21) đã có và kỳ chứa ngày bút toán là `CLOSED` thì chặn, trả `ACCOUNTING_PERIOD_CLOSED`.
- Mã lỗi mới đề xuất trong `packages/shared`: `EXPENSE_RECEIPT_REQUIRED`, `EXPENSE_NOT_PENDING`, `EXPENSE_NOT_IN_ASSIGNMENT`, `REJECT_REASON_REQUIRED`.
- Audit trong cùng transaction cho duyệt, từ chối, đảo, tạo `order_fees`, mọi bút toán `driver_ledger`. Mọi truy vấn qua `getTenantDb(ctx)`; mỗi repo mới có test tenant isolation.

## Các bước
### Bước 1 — Schema chi phí dọc đường và test đỏ cho repo
- Chốt cách lưu phát sinh nhà xe ngoài trong `decisions.md`, cập nhật spec 02.
- Thêm `trip_expenses` đúng spec 02 cộng phần đã chốt (và `driver_ledger`, `attachments` nếu task 09, 10 chưa tạo); `drizzle-kit generate`, đọc SQL; seed: 2 tài xế có chuyến, 5 chi phí ở các trạng thái, 1 khoản tạm ứng 2.000.000 ₫.
- Viết trước test tenant isolation cho `TripExpenseRepo` và test `DriverLedgerRepo` không có hàm update/delete.
**Kiểm tra:** `pnpm db:migrate` chạy trên DB trống và DB có dữ liệu của task 10; `pnpm db:seed` không lỗi; `pnpm test --filter core -- trip-expense.repo driver-ledger.repo` xanh.

### Bước 2 — Khai chi phí từ app
- Test trước (test tích hợp Route Handler + Testcontainers): `POST /api/v1/driver/expenses` thiếu ảnh hóa đơn trả `EXPENSE_RECEIPT_REQUIRED`; chi phí cho chuyến không phải của tài xế trả `EXPENSE_NOT_IN_ASSIGNMENT`; gửi cùng `clientEventId` 3 lần chỉ ghi 1 dòng; số tiền âm hoặc 0 bị từ chối; tài xế xem được danh sách chi phí của mình và trạng thái duyệt, không thấy của người khác.
- Viết `expense.service.ts` (`submitExpense`, `listMyExpenses`) và Route Handler.
**Kiểm tra:** `pnpm test --filter core -- expense.submit` xanh.

### Bước 3 — Duyệt, từ chối, chi hộ và bút toán đảo
- Test trước: duyệt `DRIVER_CASH` ghi đúng 1 dòng `ON_ROUTE_REIMBURSEMENT` dương; duyệt `ADVANCE` ghi `ADVANCE_SETTLEMENT`; `COMPANY_CARD` không ghi sổ cái; chi phí `isRebillable` sinh đúng 1 `order_fees` `PASS_THROUGH` `EXPENSE_REBILL` và tăng `totalPassThroughAmount`, doanh thu cước không đổi; duyệt lại lần 2 trả `EXPENSE_NOT_PENDING`; từ chối thiếu lý do trả `REJECT_REASON_REQUIRED`; đảo một chi phí đã duyệt sinh `REVERSAL` và `order_fees` đảo, dòng cũ không đổi; role `DISPATCHER` duyệt bị từ chối; có audit cho mọi thao tác.
- Viết `approveExpense`, `rejectExpense`, `reverseExpense` và Server Action.
**Kiểm tra:** `pnpm test --filter core -- expense.approve` xanh.

### Bước 4 — Tạm ứng, hoàn ứng và số dư
- Test trước trong `advance.test.ts`: Kế toán chi tạm ứng 2.000.000 ₫ ghi `CASH_ADVANCE` âm; tài xế khai 3 chi phí `ADVANCE` tổng 1.450.000 ₫ được duyệt thì số dư tạm ứng còn 550.000 ₫; tài xế nộp lại 550.000 ₫ thì số dư về 0; tổng các dòng tính bằng `decimal.js` khớp đến đồng; kỳ kế toán `CLOSED` (nếu bảng đã có) thì chặn `ACCOUNTING_PERIOD_CLOSED`.
- Viết `advance.service.ts` (`issueAdvance`, `settleAdvance`, `getAdvanceBalance`).
**Kiểm tra:** `pnpm test --filter core -- advance` xanh.

### Bước 5 — Phát sinh của nhà xe ngoài
- Test trước: Điều vận nhập phát sinh nâng hạ cho assignment `SUB_CONTRACTOR` tạo `trip_expenses` `SUBMITTED` không cần tài xế nội bộ; assignment `INTERNAL_FLEET` không dùng được luồng này; Kế toán duyệt thì không ghi `driver_ledger`; khoản chi hộ vẫn sinh `order_fees` như bước 3.
- Viết `submitSubcontractorExpense` và Server Action trong `apps/web/src/features/dispatch/`.
**Kiểm tra:** `pnpm test --filter core -- expense.subcontract` xanh.

### Bước 6 — Màn duyệt chi phí và tạm ứng trên web
- Route `apps/web/src/app/(tenant)/expenses/page.tsx`: WorkTable chi phí có tab Chờ duyệt · Đã duyệt · Từ chối có đếm số, mỗi dòng có ảnh hóa đơn (Signed URL), tài xế hoặc nhà xe ngoài, chuyến, container, người trả, chi hộ; nút duyệt, từ chối kèm lý do, đảo; route `apps/web/src/app/(tenant)/expenses/advances/page.tsx`: số dư tạm ứng từng tài xế, ghi tạm ứng, ghi hoàn ứng; đủ 4 trạng thái.
**Kiểm tra:** mở `/expenses` và `/expenses/advances` trên 1440×900 và 1366×768 với dữ liệu seed: duyệt 1 chi phí chi hộ thì Order liên quan tăng chi hộ, không tăng doanh thu; tài khoản `DISPATCHER` không thấy nút duyệt; `pnpm e2e -- expenses` xanh.

### Bước 7 — Tab Chi phí trên app tài xế
- `apps/driver-app`: tab Chi phí có danh sách chi phí đã khai và trạng thái, form chọn loại → số tiền → người trả → ảnh hóa đơn bắt buộc → Gửi qua outbox; offline hiện "Chờ gửi"; lý do từ chối hiện rõ; đủ 4 trạng thái.
**Kiểm tra:** `pnpm test --filter driver-app -- expenses` xanh; trên máy ảo Android 390×844 khai 1 chi phí khi offline, có mạng lại thì xuất hiện trên `/expenses` ở tab Chờ duyệt; vùng chạm ≥ 48px.

### Bước 8 — Hoàn tất
- Chạy toàn bộ kiểm tra, cập nhật progress.md, đổi trạng thái task trong `docs/tasks/README.md`, cập nhật spec 02 (và spec 05 mục 2 nếu đổi cách lưu phát sinh nhà xe ngoài).
**Kiểm tra:** `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` không lỗi; `pnpm e2e` cho luồng duyệt chi phí; migration chạy trên DB trống và DB có dữ liệu; mọi repo mới có test tenant isolation; mọi Server Action, Route Handler có `requireRole` và zod. Ticket không ghi "Chấp nhận khi"; tiêu chí dùng cho task này (rút từ ticket và spec, cần người dùng xác nhận): chi phí khai từ app gửi lại nhiều lần chỉ ghi 1 lần; chỉ `ACCOUNTANT` duyệt được; chi phí chi hộ được duyệt sinh đúng 1 `order_fees` `PASS_THROUGH` và không làm tăng doanh thu; tạm ứng, chi phí trừ tạm ứng và hoàn ứng cho số dư tạm ứng khớp đến từng đồng; không có dòng `driver_ledger` nào bị sửa hay xóa.
