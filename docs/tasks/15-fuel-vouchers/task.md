# 15-fuel-vouchers — Phiếu dầu và cảnh báo định mức

> Giai đoạn: GĐ4 · Phụ thuộc: 05, 13 · Nhánh git: `feat/15-fuel-vouchers`
> Nguồn: `docs/specs/07_implementation_tickets.md` TICKET-15; spec `04_telemetry_and_fuel.md` mục 2.1 (phát hành phiếu), 2.2 (thực thi tại cây xăng), 2.3 (thuật toán full-to-full), 2.4 (phê duyệt, vượt định mức, chi phí dầu vào chuyến); spec `05_advanced_workflows_and_ai.md` mục 4 (OCR ảnh đổ dầu, dung sai); spec `01_core_architecture_and_grill_logs.md` mục 3 (snapshot giá dầu); spec `08_nonfunctional_security_ops.md` mục 2 (chỉ `ACCOUNTANT` duyệt phiếu dầu và tạo `PENALTY`); spec `02_database_schema.md` bảng `fuel_transactions`, `fuel_norms`, `number_sequences`, `attachments`, `driver_ledger`, `trip_costs`; PRD `docs/PRD.md` mục C9, F8

## Mục tiêu
Sau task này, Điều vận hoặc Kế toán phát hành phiếu dầu có mã QR, hạn mức lít và hạn dùng cho từng đầu kéo; tài xế quét QR tại cây xăng đối tác, nhập số lít, đơn giá, odometer và chụp 2 ảnh trên app. Hệ thống tính tiêu hao theo cách đổ đầy bình đến đổ đầy bình, đối chiếu quãng đường GPS và định mức theo trạng thái tải, rồi gắn cờ đỏ cho giao dịch bất thường. Kế toán duyệt nhanh hàng loạt giao dịch sạch, duyệt từng giao dịch có cờ kèm lý do và ghi phạt vào sổ lương khi cần.

## Phạm vi
**Làm:**
- Bảng `fuel_transactions`, `fuel_norms`.
- Phát hành phiếu: `voucherCode` từ `number_sequences`, mã QR, hạn mức `maxVolumeLiters`, hạn dùng `voucherExpiresAt`; job đánh dấu `EXPIRED`; mỗi đầu kéo tối đa 1 phiếu `VOUCHER_ISSUED` còn hiệu lực; hủy phiếu thành `VOIDED`, không xóa.
- Nhập số liệu từ app: `volumeLiters`, `pricePerLiter` (snapshot), `odometerReading`, `isFullTank` (mặc định bật), 2 ảnh `PUMP_METER`, `ODOMETER`.
- Kiểm tra khi nhập: `volumeLiters ≤ maxVolumeLiters`; `volumeLiters ≤` dung tích bình của xe; `totalAmount ≈ volumeLiters × pricePerLiter` (sai số làm tròn ≤ 1.000 ₫); đơn giá lệch quá X% so với giá niêm yết kỳ hiện tại thì gắn cờ; ảnh trùng `sha256` thì cờ `DUPLICATE_PHOTO`.
- Thuật toán full-to-full (spec 04 mục 2.3): cộng mọi lần đổ một phần ở giữa, `ODOMETER_ROLLBACK`, `GPS_DISTANCE_MISMATCH` (lệch > 10% so với km GPS), định mức bình quân gia quyền theo km từ `fuel_norms` theo trạng thái tải, `isOverNormWarning` khi vượt dung sai tenant (mặc định 5%), lưu số liệu giải trình.
- Fleet Manager khai báo "reset odometer" kèm ảnh khi thay đồng hồ.
- OCR ảnh trụ bơm và odometer qua job `ocr.process` (task 12), so với số tài xế nhập theo dung sai: lít ±0,1 L, tiền ±1.000 ₫, odometer khớp tuyệt đối; trong dung sai và đạt ngưỡng confidence thì đánh dấu hợp lệ để duyệt nhanh, không tự duyệt chi tiền.
- Kế toán duyệt (`APPROVED`), duyệt hàng loạt chỉ cho giao dịch không có cờ; tạo bút toán `PENALTY` vào `driver_ledger` cho phần vượt định mức không giải trình được, có lý do.
- Ghi chi phí dầu thực tế vào `trip_costs` (`ACTUAL`, `FUEL`) chia theo km của từng chuyến trong khoảng full-to-full.
- Giao diện web theo `Screen06-Fuel` và tab Phiếu dầu trên app tài xế.

**Không làm (thuộc task khác):**
- Đối soát bảng kê cây xăng cuối tháng, `RECONCILED`, `vendorStatementRef`, `vendor_bills` (task 19, spec 04 mục 2.5).
- Phân bổ chi phí dầu từ chuyến về từng container (task 17).
- Quyết toán kỳ lương có khoản `PENALTY` (task 20).
- Pipeline GPS và tổng hợp km/ngày (task 13); task này chỉ đọc.
- Job và interface OCR chung, hàng đợi duyệt EIR (task 12).
- Outbox offline của app (task 11); task này gửi sự kiện đổ dầu qua outbox đó.
- Thông báo vượt định mức ra email/Zalo (task 23).

## Thiết kế
- `designs/components/Screen06-Fuel/` (đọc README.md và preview.html; 4 trạng thái: Bình thường; Đang tải là khung xương cho thẻ chỉ số và dòng bảng; Trống là "Chưa có phiếu dầu nào trong tháng" kèm nút "Phát hành phiếu"; Lỗi giữ dữ liệu cũ, cảnh báo và "Thử lại"; thêm "Không có phiếu nào khớp bộ lọc").
- Khối chính: 4 thẻ chỉ số, tab việc (Danh sách phiếu · Phát hành phiếu · Duyệt giao dịch), bảng phiếu, biểu đồ tiêu hao full-to-full dạng dot plot có nút "Bảng số liệu"; màn duyệt có ảnh phóng to, bảng tài xế nhập so với OCR đọc, giải trình full-to-full, lý do bắt buộc khi có cờ, phạt đề xuất vào sổ lương. Điều vận phát hành và xem, không duyệt.
- `designs/components/Screen09-DriverApp/` (README.md: phiếu dầu quét QR → nhập số lít, đơn giá, odometer → công tắc "Đổ đầy bình" → 2 ảnh trụ bơm và đồng hồ km → Gửi).
- Thành phần: `designs/components/AppShell/`, `designs/components/TenantPicker/`, `designs/components/WorkTable/`, `designs/components/Field/`, `designs/components/FilterTabs/`, `designs/components/StatusChip/`, `designs/components/Alert/`, `designs/components/EmptyState/`, `designs/components/Button/`. Biểu đồ đọc thêm hướng dẫn trực quan hóa dữ liệu trước khi vẽ.
- Ô chưa có số liệu hiện dấu gạch như preview, không bao giờ ghi 0. Mã phiếu, biển số dùng `--font-mono`.

## Quyết định kiến trúc
- Thứ tự làm: bảng task chỉ ghi phụ thuộc 05, 13, nhưng task này dùng API và outbox app tài xế (task 10, 11), job `ocr.process` (task 12), `driver_ledger` và `trip_costs` (tạo ở task 09). Làm sau các task đó; thiếu task nào thì ghi `decisions.md` phần bị hoãn.
- Nghiệp vụ ở `packages/core/modules/fuel/` (`voucher.service.ts`, `fueling.service.ts`, `consumption.ts` hàm thuần, `approval.service.ts`, `repo.ts`, `schema.ts`); job ở `apps/worker/src/jobs/` (`fuel-voucher-expire.ts`). Server Action ở `apps/web/src/features/fuel/`, API app ở `apps/web/src/app/api/v1/driver/fuel/`.
- `voucherCode` sinh bằng `nextNumber(ctx, 'FUEL_VOUCHER:{yyyy}')` của task 01 (`SELECT ... FOR UPDATE` trong cùng transaction), unique `(tenant_id, voucher_code)`. QR chứa `voucherCode` và chữ ký chống làm giả, không chứa thông tin cá nhân.
- "Mỗi đầu kéo tối đa 1 phiếu `VOUCHER_ISSUED` còn hiệu lực": khóa dòng `tractors` (`FOR UPDATE`) rồi kiểm tra trong transaction, vì MariaDB không có unique có điều kiện; trả `FUEL_VOUCHER_ACTIVE_EXISTS` (mã mới).
- Dung tích bình: spec 02 chưa có cột trên `tractors`. Đề xuất thêm `tractors.fuel_tank_capacity_liters DECIMAL(10,2)`; ghi `decisions.md`, cập nhật spec 02. Cột đó trống thì bỏ kiểm tra này và hiện cảnh báo cho Fleet Manager.
- Giá niêm yết theo kỳ do Kế toán nhập: spec 02 chưa có bảng. Đề xuất `fuel_price_lists (id, tenant_id, fuel_type, price_per_liter DECIMAL(10,2), currency, valid_from, valid_to, created_by, ...)` và ngưỡng X% trong `tenants.settings` (mặc định chốt trong plan.md); ghi `decisions.md`, cập nhật spec 02.
- Reset odometer: spec 02 chưa có chỗ lưu. Đề xuất `odometer_resets (id, tenant_id, tractor_id, old_reading, new_reading, reset_at, reason, created_by)` kèm ảnh trong `attachments` (`ownerType = 'ODOMETER_RESET'`); thuật toán coi lần reset là mốc mới. Ghi `decisions.md`.
- Thuật toán full-to-full đúng spec 04 mục 2.3, là hàm thuần trong `consumption.ts` nhận các giao dịch, km GPS và các đoạn chuyến: chỉ tính khi giao dịch hiện tại `isFullTank = true`; mốc là giao dịch `isFullTank = true` gần nhất trước đó theo `fueledAt`; `totalLiters` gồm mọi giao dịch sau mốc đến hết giao dịch hiện tại; `distanceKm ≤ 0` thì cờ `ODOMETER_ROLLBACK`, không chia; lệch > 10% so với `gpsDistanceKm` thì `GPS_DISTANCE_MISMATCH`; `actualConsumption = totalLiters / distanceKm × 100`; `allowedConsumption` bình quân gia quyền theo km của từng đoạn với `fuel_norms` theo `loadState` (`EMPTY_RUN`, `LOADED_20`, `LOADED_40`, `TWIN_20`), đoạn ngoài chuyến tính `EMPTY_RUN`; vượt `allowed × (1 + dung sai)` thì `isOverNormWarning = true` và thêm vào `anomalyFlags`. Lưu `calculatedConsumptionPer100Km`, `allowedConsumptionPer100Km`, `gpsDistanceKm`.
- Chọn `fuel_norms`: bản ghi theo `tractorId` trước, rồi theo `tractorModel`, còn hiệu lực tại ngày đổ (xử lý `validTo` NULL). Không còn dùng `fuelNormAdjustmentPercent`.
- km GPS lấy từ `gps_logs` của task 13 trong khoảng giữa hai lần đổ đầy (hoặc bảng km/ngày nếu khớp ranh giới); km từng chuyến lấy trong khoảng `actualStart` đến `actualEnd` của chuyến.
- Tính toán dùng `decimal.js`; tiền `DECIMAL(18,2)` + `currency`; số lít, đơn giá theo đúng độ chính xác cột của spec 02. `pricePerLiter` snapshot lúc bơm, không bao giờ lấy lại từ bảng giá.
- `anomalyFlags` là JSON (validate zod khi đọc); để lọc "chỉ phiếu có cờ" dùng `isOverNormWarning` và kiểm tra trong service, không truy vấn lọc trên JSON (ADR-002). Giá trị cờ: `ODOMETER_ROLLBACK`, `OVER_TANK_CAPACITY`, `GPS_DISTANCE_MISMATCH`, `DUPLICATE_PHOTO`, `PRICE_DEVIATION`, `OVER_NORM`.
- Nhập từ app: sự kiện có `clientEventId` (lưu `fuel_transactions.clientEventId`), gửi qua outbox của task 11, idempotent.
- Quyền (spec 08 mục 2): phát hành, hủy phiếu dùng `requireRole(['DISPATCHER', 'ACCOUNTANT', 'ADMIN'])`; duyệt và tạo `PENALTY` chỉ `requireRole(['ACCOUNTANT'])` (thêm `ADMIN` chỉ khi ma trận task 01 cho phép); reset odometer `requireRole(['FLEET_MANAGER', 'ADMIN'])`; API app `requireRole(['DRIVER'])` và phiếu phải thuộc đầu kéo, tài xế trong token.
- `PENALTY` ghi `driver_ledger` số âm, `referenceType = 'FUEL_TX'`, `referenceId` = `fuel_transactions.id`, `note` là lý do bắt buộc; append-only (ADR-009).
- Chi phí dầu vào chuyến: khi duyệt, chia `totalAmount` của khoảng full-to-full theo km từng chuyến, ghi `trip_costs` (`costType = 'ACTUAL'`, `feeCode = 'FUEL'`, `sourceRefId` = giao dịch); làm tròn đến đồng, dư dồn chuyến cuối; chạy lại không trùng.
- Audit trong cùng transaction: phát hành, hủy, nhập số liệu, duyệt, `PENALTY`, reset odometer. Mọi truy vấn qua `getTenantDb(ctx)`.

## Các bước
### Bước 1 — Schema phiếu dầu, định mức và bảng bổ sung
- Chốt trong `decisions.md`: cột dung tích bình, `fuel_price_lists`, `odometer_resets`; cập nhật spec 02.
- Thêm `fuel_transactions`, `fuel_norms` đúng spec 02 và các bảng, cột đã chốt; `drizzle-kit generate`, đọc SQL; seed: 2 cây xăng `FUEL_STATION`, định mức 4 trạng thái tải cho 1 model, giá niêm yết tháng hiện tại, chuỗi giao dịch mẫu của 1 xe.
- Viết trước test tenant isolation cho `FuelTransactionRepo`, `FuelNormRepo`, `FuelPriceListRepo`, `OdometerResetRepo`.
**Kiểm tra:** `pnpm db:migrate` chạy trên DB trống và DB có dữ liệu của task 13; `pnpm db:seed` không lỗi; `pnpm test --filter core -- fuel-transaction.repo fuel-norm.repo fuel-price-list.repo odometer-reset.repo` xanh.

### Bước 2 — Phát hành, hủy và hết hạn phiếu
- Test trước trong `voucher.test.ts`: phát hành ra `voucherCode` liên tiếp không trùng khi gọi song song 50 lần; xe đã có phiếu còn hiệu lực bị chặn `FUEL_VOUCHER_ACTIVE_EXISTS`; hạn mức vượt dung tích bình bị chặn; hủy thành `VOIDED` và dòng vẫn còn; job hết hạn chuyển đúng phiếu quá `voucherExpiresAt` sang `EXPIRED`, chạy lại không đổi gì; role `DRIVER` không phát hành được.
- Viết `voucher.service.ts`, payload QR có chữ ký, job `fuel-voucher-expire.ts`.
**Kiểm tra:** `pnpm test --filter core -- voucher` xanh.

### Bước 3 — Nhập số liệu từ app và OCR ảnh đổ dầu
- Test trước trong `fueling.test.ts`: nhập quá hạn mức hoặc quá dung tích bình bị chặn; `totalAmount` lệch hơn 1.000 ₫ so với lít × đơn giá bị chặn; đơn giá lệch hơn X% giá niêm yết thì cờ `PRICE_DEVIATION`; ảnh trùng `sha256` thì `DUPLICATE_PHOTO`; gửi cùng `clientEventId` 2 lần chỉ ghi 1 lần; phiếu `VOIDED` hoặc `EXPIRED` không nhập được; OCR (provider giả) trong dung sai lít ±0,1, tiền ±1.000 ₫, odometer khớp tuyệt đối thì đánh dấu hợp lệ, ngoài dung sai thì cờ và không tự duyệt.
- Viết `fueling.service.ts`, Route Handler `POST /api/v1/driver/fuel/{voucherCode}` (zod), thêm loại ảnh `PUMP_METER`, `ODOMETER` vào job `ocr.process` của task 12.
**Kiểm tra:** `pnpm test --filter core -- fueling` xanh.

### Bước 4 — Thuật toán full-to-full và đối chiếu GPS
- Viết trước test bảng trong `consumption.test.ts` cho các ca của "Chấp nhận khi": đổ một phần xen giữa (lít được cộng dồn, kết quả đúng); odometer lùi (`ODOMETER_ROLLBACK`, không chia); chênh GPS > 10% (`GPS_DISTANCE_MISMATCH`); vượt định mức (`isOverNormWarning`); thêm: giao dịch không đổ đầy thì không tính; đoạn ngoài chuyến dùng `EMPTY_RUN`; định mức bình quân gia quyền theo km của chuyến `LOADED_40` và `TWIN_20`; lần reset odometer làm mốc mới; dung sai tenant khác 5%.
- Viết `consumption.ts` (hàm thuần, `decimal.js`) và phần gọi trong `fueling.service.ts` lấy km GPS từ `gps_logs`.
**Kiểm tra:** `pnpm test --filter core -- consumption` xanh, đủ 4 ca của "Chấp nhận khi".

### Bước 5 — Duyệt, phạt và chi phí dầu vào chuyến
- Test trước trong `approval.test.ts`: Kế toán duyệt thành `APPROVED` có audit; duyệt hàng loạt từ chối giao dịch có cờ; duyệt giao dịch có cờ bắt buộc lý do; `PENALTY` ghi `driver_ledger` số âm có `referenceId`; role `DISPATCHER` duyệt bị từ chối; `trip_costs` `FUEL` chia theo km 2 chuyến trong khoảng, tổng khớp đúng `totalAmount`, chạy lại không trùng; test tenant isolation cho repo mới.
- Viết `approval.service.ts` và Server Action trong `apps/web/src/features/fuel/`.
**Kiểm tra:** `pnpm test --filter core -- approval` xanh.

### Bước 6 — Màn phiếu dầu trên web
- Route `apps/web/src/app/(tenant)/fuel/page.tsx`: H1 nêu số giao dịch chờ duyệt, số có cờ và phiếu sớm hết hạn nhất; 4 thẻ chỉ số; tab Danh sách phiếu · Phát hành phiếu · Duyệt giao dịch; bảng phiếu với chip trạng thái và cờ; chọn nhiều phiếu không cờ để duyệt hàng loạt; màn duyệt có ảnh, bảng so OCR, giải trình full-to-full, lý do, phạt đề xuất; biểu đồ dot plot có bảng số liệu thay thế; đổi theo vai trò Kế toán và Điều vận; đủ 4 trạng thái.
**Kiểm tra:** mở `/fuel` trên 1440×900 và 1366×768 so với `Screen06-Fuel/preview.html`: đủ 3 tab, lỗi phát hành hiện ngay dưới ô, tài khoản `DISPATCHER` không thấy nút duyệt; `pnpm e2e -- fuel` xanh cho phát hành, duyệt hàng loạt và duyệt có cờ.

### Bước 7 — Tab Phiếu dầu trên app tài xế
- `apps/driver-app`: tab Phiếu dầu có phiếu còn hiệu lực và mã QR, quét QR tại cây xăng, nhập số lít, đơn giá, odometer, công tắc "Đổ đầy bình" bật sẵn, chụp 2 ảnh, gửi qua outbox; hiện lỗi tiếng Việt theo mã; đủ 4 trạng thái.
**Kiểm tra:** `pnpm test --filter driver-app -- fuel` xanh; trên máy ảo Android 390×844 gửi 1 giao dịch khi offline, có mạng lại thì giao dịch xuất hiện trên `/fuel` ở trạng thái "Đã đổ chờ duyệt".

### Bước 8 — Hoàn tất
- Chạy toàn bộ kiểm tra, cập nhật progress.md, đổi trạng thái task trong `docs/tasks/README.md`, cập nhật spec 02 và spec 04 mục 2 cho các chỗ đã chốt.
**Kiểm tra:** `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` không lỗi; `pnpm e2e` cho màn phiếu dầu; migration chạy trên DB trống và DB có dữ liệu; mọi repo mới có test tenant isolation; mọi Server Action, Route Handler có `requireRole` và zod; đạt "Chấp nhận khi" của ticket: test các ca: đổ một phần xen giữa, odometer lùi, chênh GPS > 10%, vượt định mức.
