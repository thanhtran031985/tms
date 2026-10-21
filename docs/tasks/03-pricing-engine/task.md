# 03-pricing-engine — Bảng giá và 4D Pricing Engine

> Giai đoạn: GĐ1 · Phụ thuộc: 02 · Nhánh git: `feat/03-pricing-engine`
> Nguồn: `docs/specs/07_implementation_tickets.md` TICKET-03; spec `06_hierarchical_pricing_and_fees.md` mục 1 và mục 2 (toàn bộ, gồm bảng test bắt buộc và đoạn `targetDate`); spec `00_system_overview_and_adrs.md` ADR-005, ADR-008, ADR-009; spec `01_core_architecture_and_grill_logs.md` Rule 5, 6, 8, 9 và mục 3 "Tại sao Snapshot giá"; spec `02_database_schema.md` bảng `freight_tariffs`, `fee_tariffs`; spec `08_nonfunctional_security_ops.md` mục 2 (chỉ `ADMIN` sửa bảng giá đang hiệu lực); PRD `docs/PRD.md` mục E4, F1

## Mục tiêu
Sau task này, công ty khai báo bảng giá cước thu khách và bảng phí (định mức chi phí, phụ phí, chi hộ) theo 4 chiều: tuyến, loại cont, chế độ chạy và khách hàng riêng hoặc chung, bằng tay hoặc import Excel có xem trước. Hệ thống không cho hai giá cùng khóa có hiệu lực chồng nhau. Khi cần giá cho một container, Pricing Engine trả đúng một giá theo thứ tự ưu tiên, không bao giờ lấy nhầm giá riêng của khách khác, và báo "Chưa có giá" thay vì trả 0.

## Phạm vi
**Làm:**
- Bảng `freight_tariffs`, `fee_tariffs`; migration; seed giá mẫu cho tuyến Cát Lái – Sóng Thần.
- `resolveFreight(ctx, key)` và `resolveFees(ctx, key)` ở `packages/core/modules/billing/pricing-engine.ts` đúng spec 06 mục 2: một câu query, `WHERE` đầy đủ (`customer_id IN (:customerId, NULL)`, `trip_mode IN (:tripMode, 'SINGLE')`), xử lý `validTo NULL`, `isExcluded`, `routeId NULL`.
- Lưu bảng giá/phí: chặn chồng lấn hiệu lực bằng `SELECT ... FOR UPDATE` trong transaction; sửa giá đang hiệu lực bằng cách đóng bản ghi cũ và tạo bản ghi mới; audit.
- Màn hình CRUD bảng giá cước và bảng phí.
- Import Excel có bước xem trước và báo lỗi theo từng dòng.

**Không làm (thuộc task khác):**
- Gọi Pricing Engine khi xác nhận Order và snapshot giá cho từng container, chọn `targetDate` từ Stop đầu (task 04).
- Chọn `tripMode` doanh thu khi ghép chuyến, `appliedTripMode`, tính lại giá (task 08).
- Sinh `trip_costs` định mức cho chuyến và phân bổ chi phí (task 17).
- Bảng `dem_det_tariffs` (task 18), `fuel_norms` (task 15).
- Bảng giá nhà xe ngoài `feeCode = 'SUBCONTRACT'` + vendor (giai đoạn sau, spec 05 mục 2).

## Thiết kế
- Không có màn thiết kế riêng cho bảng giá. Dựng từ thành phần chung theo bố cục AppShell.
- Thành phần: `designs/components/WorkTable/` (danh sách giá, lọc theo tuyến, loại cont, chế độ chạy, khách; cột hiệu lực), `designs/components/Field/` (form giá, lỗi dưới ô), `designs/components/Alert/` (`tms-alert-info` giải thích "Sửa giá đang hiệu lực sẽ đóng giá cũ và tạo giá mới"; `tms-alert-crit` cho dòng import lỗi), `designs/components/FilterTabs/`, `designs/components/EmptyState/`, `designs/components/Button/`.
- 4 trạng thái cho bảng giá và màn xem trước import. Giá hiển thị theo vi-VN kèm đơn vị tiền; "Vô thời hạn" khi `validTo` rỗng, không hiện ô trống.

## Quyết định kiến trúc
- Module `packages/core/modules/billing/`: `pricing-engine.ts` (tra cứu), `tariffs.service.ts` (lưu, đóng, import), `repo.ts`, `schema.ts`. Schema Drizzle ở `packages/core/lib/db/schema/tariffs.ts`, đúng cột spec 02 (`basePrice`, `vatRatePercent`, `feeCategory`, `feeCode`, `calcBasis`, `amount`, `isExcluded`, `validFrom`, `validTo`, `isActive`).
- Tra giá cước đúng mẫu code spec 06 mục 2: `inArray(tripMode, tripMode === 'SINGLE' ? ['SINGLE'] : [tripMode, 'SINGLE'])`, `or(eq(customerId, k.customerId), isNull(customerId))` bắt buộc, `or(isNull(validTo), gte(validTo, targetDate))` bắt buộc, `ORDER BY priorityExpr, validFrom DESC LIMIT 1`. Không viết nhiều câu query rời.
- Tra bảng phí: cùng điều kiện, thêm `or(eq(routeId, k.routeId), isNull(routeId))`; sắp theo `priorityExpr`, rồi `routeId IS NULL` sau cùng, rồi `validFrom DESC`; dùng `Map<feeCode, FeeTariff>` giữ bản ghi đầu tiên mỗi `feeCode`; bản ghi thắng có `isExcluded = true` thì bỏ mã phí đó, không fallback xuống bảng chung. Cho phép lọc theo `feeCategory`.
- Không tìm thấy giá trả `{ ok: false, code: 'TARIFF_NOT_FOUND' }`, không bao giờ trả 0 (ADR-005).
- `targetDate` là chuỗi `'YYYY-MM-DD'` theo múi giờ tenant, tính bằng `toTenantDate(ctx, instant)`; engine không tự cắt ngày bằng `new Date()` (Rule 6).
- Chặn chồng lấn: trong transaction, `SELECT ... FOR UPDATE` các bản ghi `isActive = true` cùng khóa (4 chiều, thêm `feeCode` với bảng phí, `customerId` và `routeId` so sánh cả NULL), kiểm tra khoảng `[validFrom, validTo]` giao nhau (NULL là vô hạn). Vi phạm trả `TARIFF_OVERLAP` (mã mới trong `packages/shared/errors.ts`). Hai người lưu song song bản ghi chồng nhau thì chỉ một thành công.
- Sửa giá: bản ghi đã bắt đầu hiệu lực (`validFrom` ≤ ngày hiện tại theo múi giờ tenant) không sửa `basePrice`/`amount` trực tiếp mà đóng (`validTo = ngày trước ngày hiệu lực mới`) rồi tạo bản ghi mới, để snapshot đã lấy vẫn truy vết được (spec 06 mục 1, spec 01 mục 3). Bản ghi chưa tới ngày hiệu lực được sửa trực tiếp.
- Audit mọi thay đổi `freight_tariffs`, `fee_tariffs` trong cùng transaction (Rule 8), `action` là `CREATE`, `UPDATE`, `CLOSE`, `IMPORT`.
- Quyền: chỉ `ADMIN` (và `OWNER`) sửa hoặc đóng giá đang hiệu lực (spec 08 mục 2). Tạo giá mới và import: đề xuất `OWNER`, `ADMIN`, `ACCOUNTANT`; chốt trong plan.md. Các role web khác chỉ xem.
- Tiền `DECIMAL(18,2)` + `currency`, so sánh và cộng bằng decimal.js. `vatRatePercent` bắt buộc với giá cước.
- Import Excel: đọc file ở server, không lưu file gốc lâu dài; mỗi dòng validate bằng cùng schema zod với form; kiểm tra chồng lấn cả giữa các dòng trong file và với dữ liệu đang có; chỉ ghi khi người dùng bấm xác nhận, ghi trong một transaction. Có dòng lỗi thì không cho xác nhận (ghi decisions.md nếu người dùng muốn nhập phần dòng hợp lệ).

## Các bước
### Bước 1 — Schema bảng giá, migration, seed và tenant isolation
- `packages/core/lib/db/schema/tariffs.ts`: `freight_tariffs`, `fee_tariffs` với index `idx_freight_4d`, `idx_fee_4d` đúng spec 02; `pnpm db:generate`, review SQL.
- Viết test trước `packages/core/modules/billing/repo.int.test.ts`: Tenant B không đọc, sửa được giá của Tenant A.
- Seed: giá chung SINGLE cho 20DC và 40HC tuyến Cát Lái – Sóng Thần, một giá TWIN_20 chung, một giá riêng cho một khách mẫu; phí `DRIVER_SALARY`, `TOLL_FEE` (COST_NORM), `LIFT_FEE` với `routeId = NULL` (PASS_THROUGH).
**Kiểm tra:** `pnpm db:migrate` chạy được trên DB trống và DB đã có dữ liệu của task 02; `pnpm db:seed` chạy hai lần không trùng; `pnpm test --filter core -- billing.*repo` xanh.

### Bước 2 — Bảng test bắt buộc của Pricing Engine (đỏ)
- Viết `packages/core/modules/billing/pricing-engine.int.test.ts` (Testcontainers), mỗi dòng một test:
  - Có giá riêng TWIN_20 của khách A, tra TWIN_20 cho khách A: chọn Priority 0.
  - Chỉ có giá riêng TWIN_20 của khách B, tra cho khách A: không lấy giá của B.
  - Bản ghi `validTo = NULL`: được chọn.
  - Hai bản ghi cùng khóa, khác `validFrom`: lấy `validFrom` mới nhất ≤ ngày tra.
  - Không có bản ghi nào: `TARIFF_NOT_FOUND`.
  - Khách A có `isExcluded` cho `LIFT_FEE`: không có `LIFT_FEE` trong kết quả.
  - Ngày tra cứu sát nửa đêm giờ VN: dùng ngày theo múi giờ tenant, không theo UTC.
- Thêm test: đủ 4 mức Priority 0 đến 3 khi chỉ có từng loại bản ghi; phí có `routeId` cụ thể thắng phí `routeId = NULL` cùng mức priority; khách A chỉ có ngoại lệ một mã phí thì các mã khác lấy từ bảng chung; `isActive = false` không được chọn.
**Kiểm tra:** `pnpm test --filter core -- pricing` chạy và đỏ toàn bộ vì chưa có code.

### Bước 3 — resolveFreight và resolveFees
- Viết `pricing-engine.ts` theo mẫu spec 06 mục 2 (`priorityExpr`, `WHERE` đầy đủ, `Map<feeCode>`, `isExcluded`), trả kết quả kèm `tariffId` để snapshot truy vết.
**Kiểm tra:** `pnpm test --filter core -- pricing` xanh toàn bộ bảng test ở bước 2; `EXPLAIN` câu query tra giá cước dùng index `idx_freight_4d`.

### Bước 4 — Lưu bảng giá: chặn chồng lấn, đóng và tạo mới, audit
- Viết test trước `packages/core/modules/billing/tariffs.service.int.test.ts`: tạo bản ghi chồng hiệu lực cùng khóa trả `TARIFF_OVERLAP`; khác `customerId` hoặc khác `feeCode` thì không chồng; hai transaction song song tạo hai bản ghi chồng nhau chỉ một thành công; sửa giá đang hiệu lực tạo bản ghi mới và đóng bản ghi cũ đúng ngày; bản ghi chưa hiệu lực sửa trực tiếp được; mỗi thay đổi có một dòng `audit_logs` trước/sau; role không phải `ADMIN`/`OWNER` sửa giá đang hiệu lực bị `FORBIDDEN`.
- Viết `tariffs.service.ts`, `schema.ts` (zod cho form và import).
**Kiểm tra:** `pnpm test --filter core -- tariffs` xanh, chạy 5 lần test song song không lần nào lọt bản ghi chồng.

### Bước 5 — Import Excel có xem trước
- Viết test trước: file mẫu có dòng hợp lệ, dòng sai loại cont, dòng thiếu giá, hai dòng chồng nhau trong file, một dòng chồng với giá đang có; kết quả xem trước trả lỗi đúng số dòng và lý do tiếng Việt; xác nhận khi còn lỗi bị chặn; xác nhận file sạch ghi đủ dòng trong một transaction và có audit `IMPORT`.
- `tariffs.service.ts` thêm `previewImport`, `commitImport`; file Excel mẫu `docs/templates/` hoặc tải từ màn hình (chọn trong plan.md).
**Kiểm tra:** `pnpm test --filter core -- tariff-import` xanh; import thử file mẫu 200 dòng xem trước dưới 3 giây.

### Bước 6 — Server Action và màn danh sách, form bảng giá
- `apps/web/src/features/billing/tariff-actions.ts` (khuôn `requireRole` rồi zod rồi service).
- Route `apps/web/src/app/(tenant)/billing/tariffs/page.tsx`, `.../fees/page.tsx`; view `apps/web/src/features/billing/tariff-list.tsx`, `tariff-form.tsx`: lọc theo tuyến, loại cont, chế độ chạy, khách (có lựa chọn "Giá chung"), trạng thái hiệu lực; form có `Alert` info khi sửa giá đang hiệu lực; lỗi `TARIFF_OVERLAP` hiện dưới ô ngày hiệu lực kèm giá đang chồng.
- Đủ 4 trạng thái bảng.
**Kiểm tra:** mở `/billing/tariffs` trên 1440×900 thấy đúng bảng và bộ lọc; tạo giá chồng thấy lỗi dưới ô; đăng nhập `DISPATCHER` không thấy nút sửa giá đang hiệu lực và gọi action trực tiếp bị `FORBIDDEN`.

### Bước 7 — Màn import Excel
- View `apps/web/src/features/billing/tariff-import.tsx`: chọn file, bảng xem trước (`WorkTable`) có cột lỗi theo dòng, tab lọc "Tất cả / Hợp lệ / Có lỗi" có số đếm, nút chính "Nhập N dòng" chỉ bật khi không còn lỗi; Trống khi file không có dòng nào; Lỗi khi không đọc được file.
- E2E `apps/web/e2e/tariff-import.spec.ts`: tải file có lỗi thấy đúng số dòng lỗi; tải file sạch, xác nhận, thấy giá mới trong danh sách.
**Kiểm tra:** `pnpm e2e -- tariff` xanh.

### Bước 8 — Hoàn tất
- Chạy toàn bộ kiểm tra, cập nhật progress.md, đổi trạng thái dòng 03 trong `docs/tasks/README.md`.
**Kiểm tra:** `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` không lỗi; `pnpm e2e` xanh cho tạo giá và import; migration chạy được trên DB trống và DB có dữ liệu; mọi Server Action có `requireRole` và zod; repo mới có test tenant isolation; đạt "Chấp nhận khi" của ticket: toàn bộ bảng test ở file 06 mục 2 xanh.
