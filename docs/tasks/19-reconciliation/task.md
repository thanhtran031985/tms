# 19-reconciliation — Đối soát split-view (khách hàng, cây xăng, nhà xe ngoài)

> Giai đoạn: GĐ5 · Phụ thuộc: 17, 18 · Nhánh git: `feat/19-reconciliation`
> Nguồn: `docs/specs/07_implementation_tickets.md` TICKET-19 (và TICKET-12 về chặn `RECONCILED`); spec `04_telemetry_and_fuel.md` mục 2.5; spec `05_advanced_workflows_and_ai.md` mục 2 và mục 4; spec `06_hierarchical_pricing_and_fees.md` mục 5; spec `02_database_schema.md` bảng `vendor_bills`, `fuel_transactions`, `trip_costs`, `orders`, `order_containers`, `attachments`; spec `01_core_architecture_and_grill_logs.md` mục 3 (khóa `isEpodVerified` trước đối soát); spec `00_system_overview_and_adrs.md` ADR-002 (Object Storage), ADR-009; PRD `docs/PRD.md` mục C13, F10

## Mục tiêu
Sau task này, Kế toán tải bảng kê Excel của khách hàng, cây xăng hoặc nhà xe ngoài, ánh xạ cột một lần cho mỗi đối tác, rồi xem kết quả so khớp hai cột Hệ thống | Bảng kê chia 4 nhóm. Kế toán xử lý từng dòng lệch, chốt đối soát khi đã xử lý hết: với khách hàng thì container chuyển sang chờ lập hóa đơn, với cây xăng và nhà xe ngoài thì hệ thống tạo bảng kê phải trả (`vendor_bills`). Tải lại cùng file không tạo trùng.

## Phạm vi
**Làm:**
- Lưu cấu hình ánh xạ cột theo đối tác (khách hàng hoặc nhà cung cấp) và loại đối tác.
- Tải file Excel lên Object Storage, đọc, xem trước 10 dòng, báo lỗi theo từng dòng.
- Phiên đối soát theo đối tác và kỳ; import idempotent theo nội dung file.
- So khớp tự động theo loại đối tác, chia 4 nhóm: Khớp, Lệch số liệu, Chỉ có ở bảng kê, Chỉ có trong hệ thống.
- Xử lý từng dòng: Theo bảng kê / Giữ số hệ thống; Bổ sung / Loại khỏi kỳ; Vẫn tính / Chuyển sang kỳ sau; Hoàn tác.
- Loại container chưa có ePOD đã xác minh khỏi kỳ đối soát khách hàng và hiện danh sách lý do.
- Chốt đối soát: khách hàng → container/Order chuyển `RECONCILED`; cây xăng → `vendor_bills` + `fuel_transactions` `RECONCILED` + `vendorStatementRef`; nhà xe ngoài → `vendor_bills` từ `trip_costs` `SUBCONTRACT`.
- Màn hình Đối soát theo `Screen07-Reconcile`.

**Không làm (thuộc task khác):**
- Lập, phát hành hóa đơn và thanh toán (task 21).
- Khóa kỳ kế toán và mở lại kỳ (task 21); task này chỉ chặn sửa khi kỳ đã `CLOSED` nếu bảng `accounting_periods` đã có.
- Xác minh ePOD (task 12); nút "Xác minh ePOD", "Nhắc tài xế" chỉ dẫn sang màn của task 12 và task 23.
- Duyệt phiếu dầu (task 15), ghi chi phí thuê xe ngoài (task 09/17).
- Đối soát hãng tàu về DEM/DET (ngoài phạm vi ticket).

## Thiết kế
- `designs/components/Screen07-Reconcile/` (đọc README.md và preview.html; 4 trạng thái: Bình thường; Đang tải là xương thẻ tổng và dòng so khớp, giữ tiêu đề cột; Trống là "Chưa có bảng kê nào của … cho kỳ 10/2026" kèm nút "Tải bảng kê"; Lỗi là `Alert` crit giữ số liệu cũ kèm giờ và nút "Thử lại").
- Thành phần: `designs/components/AppShell/` (mục "Đối soát" có huy hiệu số dòng chưa xử lý), `designs/components/TenantPicker/`, `designs/components/WorkTable/`, `designs/components/FilterTabs/`, `designs/components/Field/`, `designs/components/Button/`, `designs/components/StatusChip/`, `designs/components/Alert/`, `designs/components/EmptyState/`.
- Tình huống cần dựng: nhập trùng file (cảnh báo, mở phiên đã nhập), kỳ đã khóa (chỉ xem, mọi điều khiển tắt). Preview ghi rằng bước 1 và loại Cây xăng, Nhà xe ngoài nằm ở bản canvas `Reconcile.dc.html` không có trong bộ khởi động: dựng theo mô tả trong README.md và ghi chỗ tự quyết vào decisions.md.

## Quyết định kiến trúc
- Nghiệp vụ ở `packages/core/modules/billing/reconciliation/` (spec 01 mục 2: billing gồm đối soát công nợ): `service.ts`, `repo.ts`, `schema.ts`, `matchers/{customer,fuel,subcontractor}.ts` (hàm thuần so khớp), `excel.ts` (đọc file theo ánh xạ).
- Spec 02 chưa có bảng cho đối soát. Thêm và cập nhật spec 02: `statement_mappings` (`tenant_id`, `partner_type` CUSTOMER/FUEL_STATION/SUB_CONTRACTOR, `partner_id`, `mapping` JSON validate zod, unique `(tenant_id, partner_type, partner_id)`), `statement_imports` (`tenant_id`, `partner_type`, `partner_id`, `period CHAR(7)`, `file_sha256`, `storage_key`, `status` DRAFT/CLOSED, `closed_by`, `closed_at`, unique `(tenant_id, partner_type, partner_id, file_sha256)`), `statement_lines` (`tenant_id`, `import_id`, `row_no`, dữ liệu dòng đã chuẩn hóa, `system_ref_type`, `system_ref_id`, `match_group` MATCHED/DIFF/PARTNER_ONLY/SYSTEM_ONLY, `resolution`, `resolved_by`, `resolved_at`, `note`). Cột JSON chỉ cho dữ liệu dòng thô, không cho số tiền dùng để tính (ADR-002).
- Import idempotent: `file_sha256` trùng với phiên đã có của cùng đối tác thì không tạo phiên mới, trả `STATEMENT_ALREADY_IMPORTED` kèm id phiên cũ (spec 04 mục 2.5).
- File lưu S3 với key `tenants/{tenantId}/statements/{importId}.xlsx`, chỉ truy cập qua Signed URL hạn ngắn; giới hạn kích thước và chỉ nhận `.xlsx`/`.xls`/`.csv` (spec 08 mục 2).
- Khóa so khớp: cây xăng theo `voucherCode`, `plateNumber`, `volumeLiters`, `totalAmount` (spec 04 mục 2.5) và đơn giá niêm yết (README màn); khách hàng theo số container (`containerNo`), Order, ngày giao và thành tiền; nhà xe ngoài theo container hoặc chuyến, biển số `subcontractorPlate` và `agreedSubcontractCost`. Số tiền so bằng `decimal.js`, không dùng `number`.
- Đơn vị đối soát khách hàng là container: container có `order_containers.isEpodVerified = false` không vào kỳ, hiện ở khối "Chưa đưa vào" kèm lý do (spec 05 mục 4, TICKET-12). Order chỉ chuyển `RECONCILED` khi mọi container chưa hủy đã đối soát; container đã đối soát từng phần được đánh dấu riêng. Spec 02 chưa có cột cho trạng thái này trên `order_containers`: thêm `reconciled_at DATETIME(3) NULL` và `statement_import_id`, cập nhật spec 02.
- Chốt đối soát chỉ khi mọi dòng lệch đã có `resolution`. Khách hàng: ghi `reconciled_at` cho container, đổi `orders.status` sang `RECONCILED` khi đủ (ghi `audit_logs` `STATUS_CHANGE`). Cây xăng: tạo `vendor_bills` (`status = 'MATCHED'`, `periodFrom/To`, `total` = số chốt), chuyển `fuel_transactions` sang `RECONCILED` và ghi `vendorStatementRef`. Nhà xe ngoài: tạo `vendor_bills` từ các `trip_costs` `SUBCONTRACT` đã chốt. Spec 02 chưa có bảng dòng của `vendor_bills`: thêm `vendor_bill_lines` (`vendor_bill_id`, `source_type`, `source_id`, `amount`) để truy vết, cập nhật spec 02. `billNo` sinh từ `number_sequences` (ví dụ `VB-2610-0007`).
- Dòng "Theo bảng kê" không sửa ngược số đã duyệt hoặc đã snapshot (ADR-009): chênh lệch ghi thành dòng điều chỉnh (với khách hàng là `order_fees` `MANUAL` chờ duyệt, với nhà cung cấp là dòng trong `vendor_bill_lines`), có lý do.
- Quyền: `ACCOUNTANT`, `ADMIN` được tải file, xử lý và chốt; `VIEWER`, `DISPATCHER` chỉ xem. Mọi Server Action bắt đầu bằng `requireRole([...])` rồi validate zod.
- Kỳ đã khóa (`accounting_periods.status = 'CLOSED'`, nếu task 21 đã tạo bảng): phiên của kỳ đó chỉ xem, mọi thao tác trả `ACCOUNTING_PERIOD_CLOSED`.
- Audit: tạo phiên, xử lý dòng, hoàn tác, chốt đều ghi `audit_logs` trong cùng transaction.
- Mã lỗi đề xuất: `STATEMENT_ALREADY_IMPORTED`, `STATEMENT_MAPPING_INVALID`, `STATEMENT_ROW_INVALID`, `RECONCILIATION_UNRESOLVED_LINES`, `EPOD_NOT_VERIFIED`, `ACCOUNTING_PERIOD_CLOSED`, `STALE_DATA`.
- Tenant: mọi truy vấn qua `getTenantDb(ctx)`; đối tác, Order, phiếu dầu được kiểm tra cùng tenant; mỗi repo mới có test tenant isolation.

## Các bước
### Bước 1 — Schema đối soát và migration
- Thêm `statement_mappings`, `statement_imports`, `statement_lines`, `vendor_bill_lines`, cột `reconciled_at`, `statement_import_id` trên `order_containers` (và `vendor_bills` nếu chưa có) trong `packages/core/lib/db/schema/billing.ts`; enum trong `packages/shared/enums.ts`; cập nhật spec 02.
- Migration `drizzle-kit generate`, đọc lại SQL. Seed: 1 khách có 9 container kỳ 10/2026 (3 chưa xác minh ePOD), 1 cây xăng có 6 phiếu `APPROVED`, 1 nhà xe ngoài có 3 chuyến `SUBCONTRACT`; 3 file bảng kê mẫu trong `packages/core/test/fixtures/statements/`.
- Test tenant isolation cho các repo mới viết trước.
**Kiểm tra:** `pnpm db:migrate` chạy trên DB trống và DB đã có dữ liệu; `pnpm db:seed` thêm dữ liệu đối soát mẫu; `pnpm test --filter core -- reconciliation.repo` xanh.

### Bước 2 — Đọc file theo ánh xạ cột và import idempotent
- Test trước: đọc file mẫu theo ánh xạ ra đúng số dòng và kiểu dữ liệu; dòng sai định dạng (ngày hỏng, số tiền chữ) báo lỗi theo số dòng; lưu ánh xạ theo đối tác rồi lần sau tự áp; import lại cùng file trả `STATEMENT_ALREADY_IMPORTED` kèm id phiên cũ và không tạo dòng mới; file lưu S3 đúng tiền tố tenant (MinIO qua Testcontainers).
- Viết `excel.ts`, `uploadStatement`, `previewStatement`, `saveMapping`.
**Kiểm tra:** `pnpm test --filter core -- reconciliation.import` xanh, có ca import 2 lần cùng file.

### Bước 3 — So khớp tự động 4 nhóm cho 3 loại đối tác
- Test trước bằng bảng ví dụ cho từng matcher: khách hàng (khớp đủ; lệch tiền "lệch −300.000 ₫"; lệch ngày "hệ thống: 07/10"; chỉ có ở bảng kê; chỉ có trong hệ thống; container chưa xác minh ePOD bị loại khỏi kỳ kèm lý do); cây xăng (theo mã phiếu, biển số, số lít, thành tiền, đơn giá niêm yết); nhà xe ngoài (theo container/chuyến, biển số, giá thuê).
- Viết `matchers/*.ts` (hàm thuần) và `runMatching(ctx, importId)` ghi `statement_lines`.
**Kiểm tra:** `pnpm test --filter core -- reconciliation.match` xanh; chạy trên dữ liệu seed khách hàng ra đúng 4 khớp, 3 lệch, 1 chỉ có ở bảng kê, 1 chỉ có trong hệ thống như preview.

### Bước 4 — Xử lý từng dòng và chốt đối soát
- Test trước: mỗi dòng lệch nhận đúng 2 cách xử lý theo nhóm và hoàn tác được; chốt khi còn dòng chưa xử lý trả `RECONCILIATION_UNRESOLVED_LINES`; chốt khách hàng đặt `reconciled_at` cho container và chuyển Order `RECONCILED` chỉ khi mọi cont chưa hủy đã đối soát, Order có cont chưa xác minh ePOD không chuyển; chốt cây xăng tạo đúng 1 `vendor_bills` với tổng bằng số chốt, phiếu chuyển `RECONCILED`, có `vendorStatementRef`; chốt nhà xe tạo `vendor_bills` từ `SUBCONTRACT`; kỳ đã khóa trả `ACCOUNTING_PERIOD_CLOSED`; `DISPATCHER` gọi action ghi bị từ chối; mọi thao tác có `audit_logs`.
- Viết `resolveLine`, `undoResolution`, `closeReconciliation` trong service; Server Action trong `apps/web/src/features/billing/reconciliation/actions.ts` với `requireRole(['ACCOUNTANT', 'ADMIN'])` + zod.
**Kiểm tra:** `pnpm test --filter core -- reconciliation.close` và `pnpm test --filter web -- reconciliation.actions` xanh.

### Bước 5 — Màn Đối soát bước 1: tải và ánh xạ bảng kê
- Route `apps/web/src/app/(tenant)/billing/reconciliation/page.tsx`; view ở `apps/web/src/features/billing/reconciliation/`.
- Chọn loại đối tác (Khách hàng · Cây xăng · Nhà xe ngoài), đối tác, kỳ; chọn file; ánh xạ cột có nhãn; bảng xem trước 10 dòng; nút chính "So khớp N dòng"; cảnh báo nhập trùng file kèm link mở phiên đã nhập; trạng thái Trống và Lỗi theo README.
**Kiểm tra:** mở `/billing/reconciliation` trên 1440×900, tải file mẫu khách hàng thấy xem trước 10 dòng và nút "So khớp 9 dòng"; tải lại cùng file thấy cảnh báo trùng.

### Bước 6 — Màn Đối soát bước 2: so khớp và chốt
- 4 thẻ tổng (hệ thống, bảng kê, chênh lệch, số chốt sau xử lý); khối "Chưa đưa vào" với container chưa có ePOD đã xác minh; `FilterTabs` 4 nhóm kèm số "n chưa xử lý"; danh sách hai cột Hệ thống | Bảng kê, ô lệch nền `warn-soft` có chữ "lệch +300.000 ₫"; nút xử lý và "Hoàn tác"; thanh chốt kỳ, "Chốt đối soát" chỉ bật khi đã xử lý hết; huy hiệu menu "Đối soát" đếm dòng chưa xử lý; kỳ đã khóa thì mọi điều khiển tắt. Đủ 4 trạng thái.
- E2E Playwright viết trước `apps/web/e2e/reconciliation.spec.ts`.
**Kiểm tra:** `pnpm e2e -- reconciliation` xanh với luồng: tải file khách hàng, so khớp, xử lý 5 dòng lệch, nút chốt bật, chốt xong container chuyển chờ lập hóa đơn; luồng cây xăng chốt xong thấy mã bảng kê phải trả `VB-…`.

### Bước 7 — Hoàn tất
- Chạy toàn bộ kiểm tra, cập nhật progress.md, đổi trạng thái README, cập nhật spec 02, spec 04 nếu có quyết định khác.
**Kiểm tra:** `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` không lỗi; `pnpm e2e` cho luồng đối soát xanh; migration chạy trên DB trống và DB có dữ liệu; đạt yêu cầu của ticket (TICKET-19 không ghi "Chấp nhận khi" riêng, dùng đúng các ý của ticket và spec 04 mục 2.5): import Excel có ánh xạ cột theo đối tác; kết quả 4 nhóm; import lại cùng file không tạo trùng; khớp hết thì sinh `vendor_bills` cho AP; container chưa có ePOD đã xác minh không vào kỳ.
