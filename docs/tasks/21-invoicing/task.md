# 21-invoicing — Hóa đơn, thanh toán và khóa kỳ

> Giai đoạn: GĐ5 · Phụ thuộc: 19 · Nhánh git: `feat/21-invoicing`
> Nguồn: `docs/specs/07_implementation_tickets.md` TICKET-21; spec `06_hierarchical_pricing_and_fees.md` mục 4 và mục 5; spec `02_database_schema.md` bảng `invoices`, `invoice_lines`, `payments`, `accounting_periods`, `order_fees`, `orders`, `order_containers`, `vendor_bills`, `number_sequences`; spec `00_system_overview_and_adrs.md` mục 1 (Chi hộ, Accounting Period), ADR-008, ADR-009; spec `01_core_architecture_and_grill_logs.md` mục 3 (chi hộ) và mục 4 (nhà cung cấp hóa đơn điện tử); spec `08_nonfunctional_security_ops.md` mục 2; PRD `docs/PRD.md` mục C15, F10

## Mục tiêu
Sau task này, Kế toán gom các container đã đối soát của cùng một khách trong kỳ thành hóa đơn, phát hành hóa đơn điện tử qua một nhà cung cấp và lưu mã tra cứu. Khi khách trả tiền, Kế toán ghi thanh toán cấn trừ vào hóa đơn và xem báo cáo tuổi nợ 0–30, 31–60, 61–90, trên 90 ngày. Cuối tháng, người có quyền khóa kỳ kế toán; sau đó không ai tạo hay sửa phí, hóa đơn có ngày thuộc kỳ đó, mọi điều chỉnh đi bằng bút toán ở kỳ đang mở.

## Phạm vi
**Làm:**
- Bảng `invoices`, `invoice_lines`, `payments`, `accounting_periods`.
- Lập hóa đơn nháp gom nhiều Order của cùng khách theo kỳ; cho xuất từng phần theo container đã đủ chứng từ và đã đối soát.
- Dòng cước và phụ phí chịu VAT theo `vatRatePercent` snapshot; dòng chi hộ theo cách tenant chọn (sau khi kế toán trưởng xác nhận).
- Phát hành hóa đơn điện tử qua interface `EInvoiceProvider`, bắt đầu với 1 adapter; lưu `einvoiceProvider`, `einvoiceLookupCode`; `invoiceNo` từ `number_sequences` hoặc từ nhà cung cấp.
- Hủy/điều chỉnh hóa đơn đã phát hành bằng trạng thái `CANCELLED`/`ADJUSTED` và hóa đơn điều chỉnh, không sửa trực tiếp.
- Ghi thanh toán khách (`direction = 'RECEIVE'`) cấn trừ vào hóa đơn, cập nhật `PARTIALLY_PAID`/`PAID`; ghi thanh toán nhà cung cấp (`direction = 'PAY'`) cho `vendor_bills` của task 19.
- Báo cáo tuổi nợ phải thu theo `dueDate`.
- Kỳ kế toán `OPEN`/`CLOSED`; khóa kỳ; chặn tạo/sửa phí, hóa đơn, phân bổ có ngày thuộc kỳ đã khóa; bút toán điều chỉnh ở kỳ mở.
- Yêu cầu điều chỉnh hóa đơn khi container đã xuất hóa đơn bị đánh dấu `repriceRequired` (spec 06 mục 4).

**Không làm (thuộc task khác):**
- Đối soát bảng kê khách và nhà cung cấp, tạo `vendor_bills` (task 19).
- Báo cáo P&L và công nợ quá hạn trên trang báo cáo tổng (task 22); task này chỉ làm báo cáo tuổi nợ.
- Gửi hóa đơn hoặc nhắc nợ qua email, Zalo (task 23).
- Thêm adapter hóa đơn điện tử thứ hai (giai đoạn sau).
- Mở lại kỳ đã khóa (spec không có; xem decisions.md).

## Thiết kế
- Thành phần: `designs/components/WorkTable/` (danh sách hóa đơn, dòng hóa đơn, thanh toán, bảng tuổi nợ có dòng tổng), `designs/components/Alert/` (kỳ đã khóa dùng `tms-alert-crit` icon ổ khóa; phát hành lỗi dùng `tms-alert-warn` giữ dữ liệu cũ và "Thử lại"; phát hành xong dùng `tms-alert-ok`), `designs/components/StatusChip/`, `designs/components/FilterTabs/`, `designs/components/Field/`, `designs/components/Button/`, `designs/components/EmptyState/`, `designs/components/AppShell/`.
- Không có màn hoàn chỉnh riêng; bố cục theo `designs/README.md`, đủ 4 trạng thái dữ liệu. Số hóa đơn, mã Order, số cont dùng `--font-mono`; không hiện số 0 thay dữ liệu chưa có.

## Quyết định kiến trúc
- Nghiệp vụ ở `packages/core/modules/billing/` (spec 01 mục 2: billing gồm hóa đơn): `invoicing/{service,repo,schema}.ts`, `payments/{service,repo,schema}.ts`, `periods/{service,repo,schema}.ts`, `aging.ts` (hàm thuần). Interface `EInvoiceProvider` ở `packages/core/lib/einvoice/` với một adapter thật và một adapter giả cho test.
- Điều kiện xuất hóa đơn: container có `reconciled_at` (task 19) và `isEpodVerified = true`; Order `RECONCILED` cho phép xuất cả Order; cho phép xuất từng phần theo container (spec 06 mục 5). Container và `order_fees` đã nằm trên hóa đơn chưa hủy thì không đưa vào hóa đơn khác (`order_fees.invoiceId`). Xuất hết container của Order thì Order chuyển `INVOICED` (audit `STATUS_CHANGE`).
- Dòng hóa đơn: cước theo `order_containers.baseFreightAmount`, phụ phí `REVENUE_SURCHARGE` đã duyệt, VAT theo `vatRatePercent` snapshot trên tariff/phí. Phí chi hộ `PASS_THROUGH` không cộng vào doanh thu cước; cách xử lý (xuất hóa đơn riêng hoặc chuyển chứng từ gốc của bên thứ ba) là cấu hình tenant `tenants.settings.passThroughInvoicing` và phải được kế toán trưởng xác nhận trước khi code (spec 06 mục 5).
- Tiền `decimal.js`, `DECIMAL(18,2)` + `currency`; `subtotal`, `vatAmount`, `total` tính bằng decimal, làm tròn từng dòng đến đồng.
- Bất biến: hóa đơn `ISSUED` không bao giờ bị `UPDATE` số tiền hay dòng (ADR-009); sửa bằng hủy và phát hành hóa đơn thay thế hoặc hóa đơn điều chỉnh, trạng thái `CANCELLED`/`ADJUSTED`. Nháp `DRAFT` sửa được.
- Đánh số: `invoiceNo` cấp lúc phát hành từ `number_sequences` (`'INVOICE:{yyyy}'`, `SELECT ... FOR UPDATE` cùng transaction, unique theo tenant) trừ khi adapter trả số của nhà cung cấp; quyết định cuối ghi decisions.md theo nhà cung cấp được chọn.
- Gọi `EInvoiceProvider` ngoài transaction DB: tạo bản ghi `ISSUING`/nháp có khóa idempotent, gọi nhà cung cấp, rồi ghi kết quả; gọi lại khi lỗi mạng không tạo 2 hóa đơn (khóa idempotent gửi sang nhà cung cấp). Khóa API nhà cung cấp lấy từ secret manager, không commit (spec 08 mục 2).
- Thanh toán: một `payments` gắn một `invoiceId` hoặc một `vendorBillId` theo schema; tổng thanh toán vượt số còn nợ bị chặn; trạng thái hóa đơn tính lại trong cùng transaction. Thanh toán không bị sửa, sai thì ghi thanh toán đảo có lý do.
- Tuổi nợ: số còn nợ = `total` − tổng `payments` của hóa đơn; nhóm 0–30, 31–60, 61–90, trên 90 ngày theo số ngày quá `dueDate` tính ở ngày tenant; `dueDate` = `issueDate` + `customers.paymentTermDays`.
- Kỳ kế toán: `accounting_periods.period` dạng `'2026-10'`, unique theo tenant. Một service `assertPeriodOpen(ctx, date)` dùng chung cho mọi nơi tạo/sửa phí, hóa đơn, thanh toán, phân bổ chi phí (task 17), đối soát (task 19); kỳ `CLOSED` trả `ACCOUNTING_PERIOD_CLOSED`. Khóa kỳ ghi `closedBy`, `closedAt`, audit. Điều chỉnh sau khóa là bút toán ở kỳ đang mở.
- Re-pricing (spec 06 mục 4): container đã nằm trên hóa đơn phát hành mà bị `repriceRequired` thì không sửa giá, tạo yêu cầu điều chỉnh hóa đơn hiện cho Kế toán.
- Quyền: `ACCOUNTANT`, `ADMIN` lập, phát hành, hủy hóa đơn và ghi thanh toán; khóa kỳ đề xuất `ADMIN`, `OWNER` (spec chưa chốt, ghi decisions.md); `VIEWER` chỉ xem. Mọi Server Action `requireRole([...])` rồi zod.
- Audit: hóa đơn, thanh toán, khóa kỳ ghi `audit_logs` trong cùng transaction (Rule 8: Invoice).
- Mã lỗi đề xuất: `CONTAINER_NOT_INVOICEABLE`, `ALREADY_INVOICED`, `INVOICE_IMMUTABLE`, `EINVOICE_PROVIDER_ERROR`, `PAYMENT_EXCEEDS_BALANCE`, `ACCOUNTING_PERIOD_CLOSED`, `PASS_THROUGH_POLICY_MISSING`.
- Tenant: mọi truy vấn qua `getTenantDb(ctx)`; khách, Order, hóa đơn được kiểm tra cùng tenant; mỗi repo mới có test tenant isolation.

## Các bước
### Bước 1 — Schema hóa đơn, thanh toán, kỳ kế toán và migration
- Thêm `invoices`, `invoice_lines`, `payments`, `accounting_periods` trong `packages/core/lib/db/schema/finance.ts` đúng spec 02; enum trong `packages/shared/enums.ts`; nếu cần thêm cột (ví dụ khóa idempotent phát hành, `adjusts_invoice_id`) thì cập nhật spec 02.
- Migration `drizzle-kit generate`, đọc lại SQL. Seed: kỳ 09/2026 `CLOSED`, kỳ 10/2026 `OPEN`, 1 khách có 2 Order đã đối soát (1 Order đủ, 1 Order đối soát 3/5 cont), 1 hóa đơn cũ đã thanh toán một phần với `dueDate` quá 45 ngày.
- Test tenant isolation cho các repo mới viết trước.
**Kiểm tra:** `pnpm db:migrate` chạy trên DB trống và DB đã có dữ liệu; `pnpm db:seed` thêm dữ liệu mẫu; `pnpm test --filter core -- invoicing.repo` xanh.

### Bước 2 — Kỳ kế toán và chặn ghi vào kỳ đã khóa
- Test trước: `assertPeriodOpen` trả `ACCOUNTING_PERIOD_CLOSED` cho ngày thuộc kỳ `CLOSED` (cắt ngày theo múi giờ tenant, ca sát nửa đêm); tạo `order_fees`, hóa đơn, thanh toán, sửa phân bổ có ngày thuộc kỳ 09/2026 bị chặn; khóa kỳ ghi `closedBy/At` và audit; role không đủ quyền khóa kỳ bị từ chối.
- Viết `periods/service.ts`; nối `assertPeriodOpen` vào service phí (task 04/16/18), phân bổ (task 17), đối soát (task 19).
**Kiểm tra:** `pnpm test --filter core -- accounting-period` xanh; các test cũ của task 17, 19 vẫn xanh.

### Bước 3 — Lập hóa đơn nháp từ container đã đối soát
- Test trước: gom nhiều Order cùng khách vào 1 hóa đơn; chỉ container đã đối soát và có ePOD xác minh được đưa vào (`CONTAINER_NOT_INVOICEABLE` cho cont còn lại); xuất từng phần 3/5 cont đúng; container đã có hóa đơn không vào hóa đơn khác (`ALREADY_INVOICED`); VAT từng dòng theo snapshot, tổng khớp từng đồng; chi hộ xử lý theo cấu hình tenant, thiếu cấu hình trả `PASS_THROUGH_POLICY_MISSING`.
- Viết `invoicing/service.ts`: `createDraftInvoice`, `addLines`, `removeLines`.
**Kiểm tra:** `pnpm test --filter core -- invoicing.draft` xanh.

### Bước 4 — Phát hành hóa đơn điện tử và điều chỉnh
- Test trước với adapter giả: phát hành cấp `invoiceNo` không trùng khi 50 lần song song; lưu `einvoiceLookupCode`; lỗi mạng rồi gọi lại không tạo 2 hóa đơn; hóa đơn `ISSUED` sửa dòng trả `INVOICE_IMMUTABLE`; hủy/điều chỉnh tạo hóa đơn thay thế và giữ nguyên bản cũ; Order chuyển `INVOICED` khi hết cont; container đã xuất hóa đơn bị `repriceRequired` tạo yêu cầu điều chỉnh, không đổi giá.
- Viết interface `EInvoiceProvider`, adapter giả và adapter của nhà cung cấp đầu tiên (sau khi người dùng chốt nhà cung cấp); `issueInvoice`, `cancelInvoice`, `adjustInvoice`.
**Kiểm tra:** `pnpm test --filter core -- invoicing.issue` xanh; chạy adapter thật với môi trường thử của nhà cung cấp (nếu có tài khoản) ra mã tra cứu hợp lệ, hoặc ghi vào progress.md việc người dùng cần làm thủ công để lấy tài khoản thử.

### Bước 5 — Thanh toán và báo cáo tuổi nợ
- Test trước: thanh toán một phần chuyển `PARTIALLY_PAID`, đủ thì `PAID`; vượt số còn nợ trả `PAYMENT_EXCEEDS_BALANCE`; thanh toán sai sửa bằng thanh toán đảo; thanh toán `PAY` cho `vendor_bills` cập nhật `PAID`; hàm `aging.ts` chia đúng 4 nhóm theo `dueDate` với bảng ví dụ, có ca đúng ngày 30, 31, 60, 61, 90, 91.
- Viết `payments/service.ts`, `aging.ts`, truy vấn báo cáo tuổi nợ theo khách.
**Kiểm tra:** `pnpm test --filter core -- payments` và `pnpm test --filter core -- aging` xanh.

### Bước 6 — Màn hóa đơn, thanh toán, tuổi nợ và kỳ kế toán
- Route `apps/web/src/app/(tenant)/billing/invoices/page.tsx`, `.../invoices/[invoiceId]/page.tsx`, `.../billing/aging/page.tsx`, `.../settings/accounting-periods/page.tsx`; view ở `apps/web/src/features/billing/invoicing/`. Server Action mở đầu bằng `requireRole([...])`, validate zod, trả `{ ok, data } | { ok: false, code, message }`.
- Danh sách container chờ lập hóa đơn theo khách; hóa đơn nháp sửa dòng; nút "Phát hành hóa đơn"; ghi thanh toán; bảng tuổi nợ có dòng tổng; màn kỳ kế toán có nút "Khóa kỳ" và `Alert` ổ khóa cho kỳ đã khóa; đủ 4 trạng thái.
- E2E Playwright viết trước `apps/web/e2e/invoicing.spec.ts`.
**Kiểm tra:** mở `/billing/invoices` trên 1440×900; `pnpm e2e -- invoicing` xanh với luồng: chọn 3 cont đã đối soát, lập hóa đơn, phát hành (adapter giả), ghi thanh toán một phần, tuổi nợ hiện đúng nhóm; thử tạo phí ngày thuộc kỳ đã khóa thấy `Alert` báo kỳ đã khóa.

### Bước 7 — Hoàn tất
- Chạy toàn bộ kiểm tra, cập nhật progress.md, đổi trạng thái README, cập nhật spec 02, spec 06 nếu có quyết định khác.
**Kiểm tra:** `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` không lỗi; `pnpm e2e` cho luồng hóa đơn xanh; migration chạy trên DB trống và DB có dữ liệu; đạt yêu cầu của ticket (TICKET-21 không ghi "Chấp nhận khi" riêng, dùng đúng các ý của ticket và spec 06 mục 5): có `invoices`, `invoice_lines`, `payments`, `accounting_periods`; phát hành qua adapter hóa đơn điện tử của 1 nhà cung cấp và lưu mã tra cứu; báo cáo tuổi nợ 0–30 / 31–60 / 61–90 / > 90 ngày theo `dueDate`; kỳ `CLOSED` không cho tạo/sửa phí, hóa đơn có ngày thuộc kỳ đó.
