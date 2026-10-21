# 22-reports-kpi — Báo cáo P&L và KPI

> Giai đoạn: GĐ6 · Phụ thuộc: 17, 21 · Nhánh git: `feat/22-reports-kpi`
> Nguồn: `docs/specs/07_implementation_tickets.md` TICKET-22; spec `00_system_overview_and_adrs.md` mục 3 (phân hệ 9 Reporting), ADR-001 (RSC cho báo cáo), ADR-008; spec `06_hierarchical_pricing_and_fees.md` mục 3 (P&L dùng chi phí thực tế, hiển thị cả số hệ thống và số Kế toán) và mục 5 (tuổi nợ); spec `01_core_architecture_and_grill_logs.md` mục 3 (chi hộ không phải doanh thu); spec `02_database_schema.md` mục 1 (PII, audit khi xuất file); spec `08_nonfunctional_security_ops.md` mục 1, mục 5 (read replica), mục 7; spec `03_dispatch_and_concurrency.md` mục 5; PRD `docs/PRD.md` mục C2, C16

## Mục tiêu
Sau task này, Chủ doanh nghiệp và Kế toán xem lãi/lỗ theo Order, Khách hàng, Xe, Tài xế và Tuyến trong một khoảng ngày, so được số chi phí hệ thống đề xuất với số Kế toán đã sửa, và xuất ra Excel. Quản lý thấy các chỉ số vận hành: tỷ lệ km rỗng, số chuyến mỗi xe mỗi ngày, công nợ quá hạn. Điều vận mở trang chủ là thấy ngay số việc cần xử lý, mốc hạn gần nhất và chỉ số trong ngày.

## Phạm vi
**Làm:**
- Truy vấn P&L theo Order, Khách hàng, Xe (đầu kéo), Tài xế, Tuyến trong khoảng ngày theo múi giờ tenant: doanh thu (cước + phụ phí, không gồm chi hộ), giá vốn (chi phí phân bổ), lãi gộp, biên lãi.
- Hiển thị song song số hệ thống (`systemAmount`) và số Kế toán đã sửa (`allocatedAmount`).
- KPI: tỷ lệ km rỗng, số chuyến/xe/ngày, công nợ quá hạn.
- Xuất Excel cho mọi báo cáo, ghi audit khi file có dữ liệu cá nhân.
- Màn Báo cáo (`/reports`) với bộ lọc và bảng.
- Trang chủ theo `Screen02-Home`: H1 số việc và hạn gần nhất, 4 thẻ KPI trong ngày, `DeadlineTimeline`, bảng Việc cần xử lý với tab lọc, khối Đội xe lúc này, thanh container theo trạng thái.

**Không làm (thuộc task khác):**
- Phân bổ chi phí và khóa chi phí (task 17); tuổi nợ chi tiết theo hóa đơn (task 21).
- Bản đồ đội xe trực tiếp (task 13); trang chủ chỉ nhúng lại component bản đồ của task 13.
- Khung `AppShell` (task 01).
- Tính phí DEM/DET và cảnh báo (task 18); trang chủ chỉ đọc mốc hạn.
- Gửi báo cáo định kỳ qua email (không có trong ticket).
- Dựng read replica ở hạ tầng (task 24); task này chỉ cho phép truy vấn báo cáo đi qua kết nối đọc riêng khi được cấu hình.

## Thiết kế
- `designs/components/Screen02-Home/` (đọc README.md và preview.html; 4 trạng thái: Bình thường "dữ liệu lúc 14:20"; Đang tải là skeleton đúng bố cục KPI, mốc hạn, bảng, bản đồ; Trống là "chưa có Order nào trong ngày" kèm nút "Tạo Order"; Lỗi giữ số liệu cũ, báo mất kết nối từ 14:20 và nút "Thử lại").
- Thành phần: `designs/components/AppShell/`, `designs/components/DeadlineTimeline/`, `designs/components/WorkTable/`, `designs/components/FilterTabs/` (Tất cả, Cut-off, DEM/DET, HOLD, Giấy tờ, Mất tín hiệu, Street Turn), `designs/components/StatusChip/`, `designs/components/Alert/`, `designs/components/Button/`, `designs/components/EmptyState/`.
- Màn Báo cáo P&L không có thiết kế riêng: dựng bằng thẻ chỉ số `tms-kpi` của AppShell, `WorkTable`, `FilterTabs`, `Field`, theo `designs/README.md` (biểu đồ dùng `chart-1`…`chart-4`, luôn kèm nhãn và số). Ghi vào decisions.md các chỗ tự quyết bố cục.

## Quyết định kiến trúc
- Truy vấn báo cáo ở `packages/core/modules/reporting/` (`service.ts`, `repo.ts`, `schema.ts`, `kpi.ts` hàm thuần); trang dùng React Server Components (ADR-001), không gọi Server Action để đọc.
- Doanh thu = `order_containers.baseFreightAmount` + `order_fees` `REVENUE_SURCHARGE` đã duyệt; chi hộ `PASS_THROUGH` không tính vào doanh thu (spec 01 mục 3), hiện cột riêng "Chi hộ" để đối chiếu. Container `CANCELLED` có phí hủy thì tính phí hủy.
- Giá vốn = `order_containers.allocatedCostAmount` (tổng `trip_containers.allocatedAmount`); cột so sánh lấy tổng `systemAmount`. Chuyến đã khóa chi phí dùng chi phí thực tế; chuyến chưa khóa đánh dấu "số tạm tính" và hiện định mức để so vượt/hụt (spec 06 mục 3).
- P&L theo Xe và Tài xế: chi phí lấy từ `trip_costs` của chuyến mà đầu kéo/tài xế chạy theo `dispatch_assignments` (nguồn sự thật tài nguyên, ADR-004), chia theo `completionPercentage` khi có cứu hộ; doanh thu lấy từ container của chuyến đó theo cùng tỷ lệ. Cách quy doanh thu về xe/tài xế ghi decisions.md.
- Tỷ lệ km rỗng = km chạy không chở container / tổng km trong kỳ. Nguồn km: bảng tổng hợp km/ngày/xe từ GPS (task 13, spec 04 mục 1.2) và trạng thái tải từng đoạn (`EMPTY_RUN` theo spec 04 mục 2.3). Định nghĩa chính xác cần người dùng xác nhận trước khi code (xem decisions.md).
- Số chuyến/xe/ngày = số `consolidated_trips` `COMPLETED` / số đầu kéo hoạt động / số ngày trong kỳ, cắt ngày theo múi giờ tenant (`toTenantDate`).
- Công nợ quá hạn = tổng số còn nợ của hóa đơn quá `dueDate`, dùng lại `aging.ts` của task 21.
- Tiền `decimal.js`; số tiền hiển thị định dạng vi-VN; ngày theo múi giờ tenant.
- Hiệu năng: truy vấn gom nhóm bằng SQL có index bắt đầu bằng `tenant_id`; có phân trang; báo cáo nặng đi qua kết nối đọc `getTenantReadDb(ctx)` (trỏ read replica khi cấu hình, mặc định trỏ DB chính) (spec 08 mục 5). Trang chủ tải dưới 2 giây với dữ liệu seed 300 container trong ngày (spec 08 mục 1).
- Xuất Excel: tạo file ở server, trả qua Signed URL hạn ngắn hoặc stream; báo cáo theo Tài xế có dữ liệu cá nhân thì ghi `audit_logs` (`action = 'EXPORT'`) và chỉ role có quyền xem PII mới xuất được (spec 02 mục 1).
- Quyền: P&L xem được bởi `OWNER`, `ADMIN`, `ACCOUNTANT`; KPI vận hành thêm `DISPATCHER`, `FLEET_MANAGER`; trang chủ cho mọi role trên web trừ `DRIVER`. Route Handler xuất Excel mở đầu bằng `requireRole([...])` và validate zod cho bộ lọc.
- Tenant: mọi truy vấn có `tenant_id`; test tenant isolation cho repo báo cáo (Tenant B không thấy số của Tenant A trong mọi báo cáo).

## Các bước
### Bước 1 — Dữ liệu mẫu báo cáo và test tenant isolation
- Seed báo cáo trong `packages/core/test/fixtures/reporting/`: 2 tenant, mỗi tenant 3 khách, 4 xe, 5 tài xế, 20 Order nhiều container trong 10/2026, có chuyến `TWIN_20`, có cứu hộ 40/60, có phân bổ sửa tay, có chi hộ, có hóa đơn quá hạn; bảng kỳ vọng P&L tính tay đi kèm.
- Viết test tenant isolation cho `ReportingRepo` trước. Không cần bảng mới; nếu thêm index phục vụ báo cáo thì tạo migration và cập nhật spec 02.
**Kiểm tra:** `pnpm db:migrate` chạy trên DB trống và DB đã có dữ liệu (nếu có migration index); `pnpm test --filter core -- reporting.repo` xanh.

### Bước 2 — Truy vấn P&L 5 chiều
- Test trước: P&L theo Order, Khách hàng, Xe, Tài xế, Tuyến khớp bảng kỳ vọng đến từng đồng; chi hộ không vào doanh thu; cột số hệ thống và số Kế toán khác nhau đúng ở chuyến sửa tay; chuyến chưa khóa chi phí gắn nhãn tạm tính; lọc theo ngày cắt đúng múi giờ tenant (ca sát nửa đêm).
- Viết `reporting/service.ts` và `repo.ts`.
**Kiểm tra:** `pnpm test --filter core -- reporting.pnl` xanh.

### Bước 3 — KPI vận hành và công nợ quá hạn
- Test trước bằng bảng ví dụ: tỷ lệ km rỗng theo định nghĩa đã chốt; số chuyến/xe/ngày; công nợ quá hạn khớp tổng tuổi nợ của task 21; các ô không có dữ liệu trả "chưa có" thay vì 0.
- Viết `kpi.ts` (hàm thuần) và truy vấn đầu vào.
**Kiểm tra:** `pnpm test --filter core -- reporting.kpi` xanh.

### Bước 4 — Xuất Excel có kiểm quyền và audit
- Test trước: Route Handler `apps/web/src/app/api/v1/reports/export/route.ts` (hoặc Server Action) từ chối role không có quyền; validate zod bộ lọc; file có đúng cột, số tiền dạng số không phải chuỗi; xuất báo cáo Tài xế ghi `audit_logs` `EXPORT`; Tenant B không xuất được số của Tenant A.
- Viết hàm tạo Excel ở `packages/core/modules/reporting/export.ts`.
**Kiểm tra:** `pnpm test --filter web -- reports.export` xanh; mở file xuất từ dữ liệu seed bằng LibreOffice/Excel thấy đúng tổng.

### Bước 5 — Màn Báo cáo
- Route `apps/web/src/app/(tenant)/reports/page.tsx` (RSC), view ở `apps/web/src/features/reports/`: bộ lọc khoảng ngày, chiều xem (Order, Khách hàng, Xe, Tài xế, Tuyến) bằng `FilterTabs`; thẻ chỉ số; `WorkTable` P&L có dòng tổng, cột số hệ thống và số Kế toán; nút "Xuất Excel"; đủ 4 trạng thái.
- E2E Playwright viết trước `apps/web/e2e/reports.spec.ts`.
**Kiểm tra:** mở `/reports` trên 1440×900 và 1366×768 không vỡ bố cục, bảng cuộn ngang trong khối; `pnpm e2e -- reports` xanh với luồng đổi chiều xem và xuất Excel.

### Bước 6 — Trang chủ Điều vận
- Route `apps/web/src/app/(tenant)/page.tsx` (hoặc `/home`), view ở `apps/web/src/features/home/`: H1 "N việc cần xử lý. Hạn gần nhất: …" bằng số thật; 4 thẻ KPI (Chờ điều, Đang chạy, Cut-off trong 6 giờ, Mất tín hiệu GPS); `DeadlineTimeline` tối đa 4 mốc; bảng Việc cần xử lý sắp theo độ gấp với 7 tab, tab 0 việc hiện `EmptyState` riêng; khối Đội xe lúc này nhúng bản đồ của task 13; thanh container theo trạng thái với `chart-1`…`chart-4`; quy tắc màu `crit` dưới 3 giờ, `warn` trong 8 giờ, `off` mất GPS; đủ 4 trạng thái theo preview.
- E2E Playwright viết trước `apps/web/e2e/home.spec.ts`.
**Kiểm tra:** mở `/` trên 1440×900 khớp preview `Screen02-Home`; trang tải dưới 2 giây với seed 300 container trong ngày; `pnpm e2e -- home` xanh với luồng lọc tab Cut-off và tab không có việc.

### Bước 7 — Hoàn tất
- Chạy toàn bộ kiểm tra, cập nhật progress.md, đổi trạng thái README, cập nhật spec nếu có quyết định khác.
**Kiểm tra:** `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` không lỗi; `pnpm e2e` cho luồng báo cáo và trang chủ xanh; đạt yêu cầu của ticket (TICKET-22 không ghi "Chấp nhận khi" riêng, dùng đúng các ý của ticket): P&L theo Order / Khách hàng / Xe / Tài xế / Tuyến khớp bảng kỳ vọng; có tỷ lệ km rỗng, số chuyến/xe/ngày, công nợ quá hạn; xuất Excel được cho mọi báo cáo.
