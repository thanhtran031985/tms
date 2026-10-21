# Danh sách Tickets Lập trình (Implementation Backlog)
AI Developer: Thực thi tuần tự từng Ticket dưới đây. Đánh dấu [x] khi hoàn thành từng hạng mục.

**[SỬA] Nguyên tắc chia ticket:** Bản gốc chia theo tầng (làm toàn bộ schema trước, rồi engine, rồi UI). Bản này chia theo **lát cắt dọc** (vertical slice / tracer bullet): mỗi ticket đi từ schema → service → API/UI → test cho một hành vi người dùng thấy được, và chỉ tạo bảng khi ticket cần đến. Cách này giúp phát hiện sai thiết kế sớm và mỗi ticket demo được.

**[BỔ SUNG] Định nghĩa Hoàn thành (Definition of Done) cho mọi ticket:**
- Có test viết trước (TDD) cho hành vi nghiệp vụ; test tích hợp chạy với MariaDB/Redis thật (Testcontainers).
- Có test tenant isolation cho mọi repository mới.
- Mọi Server Action / Route Handler có `requireRole` và validate `zod`.
- Migration chạy được trên DB trống và DB đã có dữ liệu; có seed tối thiểu.
- Typecheck, lint, test xanh trên CI.
- Cập nhật spec nếu quyết định thay đổi so với tài liệu.

---

## PHASE 0: NỀN TẢNG [BỔ SUNG]
### [ ] TICKET-00: Monorepo, CI & Môi trường
- Khởi tạo pnpm workspace: `apps/web`, `apps/worker`, `apps/driver-app` (khung trống), `packages/shared`, `packages/core`.
- Docker Compose cho MariaDB + Redis + MinIO (S3) cho dev.
- CI: typecheck, lint, test, build; chạy migration trên DB tạm.
- **Chấp nhận khi:** `pnpm dev` chạy web + worker; CI xanh với 1 test mẫu.

### [ ] TICKET-01: Xác thực, Tenant & Phân quyền
- Bảng `tenants`, `users`, `tenant_memberships`, `audit_logs`, `number_sequences`.
- Đăng nhập (email/SĐT + mật khẩu), chọn tenant nếu user thuộc nhiều tenant, session chứa `tenantId` + `role`.
- `getTenantDb(ctx)`, `requireRole()`, helper audit, helper `nextNumber(ctx, key)`.
- Middleware chặn route `(tenant)` khi chưa đăng nhập.
- **Chấp nhận khi:** test chứng minh user Tenant A không đọc được dữ liệu Tenant B; user role `VIEWER` gọi action ghi bị từ chối; sinh số chứng từ song song 50 lần không trùng.

## PHASE 1: DANH MỤC & ĐƠN HÀNG ĐẦU TIÊN
### [ ] TICKET-02: Danh mục cơ bản
- CRUD Khách hàng, Hãng tàu, Nhà cung cấp, Địa điểm (có tọa độ, bán kính geofence), Tuyến đường; xóa mềm; unique theo tenant.
- Seed: tuyến Cát Lái – Sóng Thần, vài cảng/depot/kho mẫu.
- **Chấp nhận khi:** tạo trùng mã khách trong cùng tenant bị chặn, khác tenant thì được.

### [ ] TICKET-03: Bảng giá & 4D Pricing Engine
- Bảng `freight_tariffs`, `fee_tariffs` (+ màn hình CRUD, chặn chồng lấn hiệu lực, import Excel có xem trước).
- Hàm `resolveFreight`, `resolveFees` theo file 06 mục 2 (có điều kiện `WHERE` đầy đủ, xử lý `validTo NULL`, `isExcluded`, `routeId NULL`).
- **Chấp nhận khi:** toàn bộ bảng test ở file 06 mục 2 xanh.

### [ ] TICKET-04: Order nhiều Container & Tự động sinh Stop
- Bảng `orders`, `order_containers`, `order_stops`, `order_fees`.
- **[SỬA]** Tạo 1 Order (theo Booking/B/L) kèm danh sách N container: nhập tay hoặc dán/import danh sách số cont; kiểm tra check digit ISO 6346; thêm/bớt/hủy từng cont sau khi tạo.
- Khi `CONFIRMED`: gọi Pricing Engine **cho từng container** để snapshot `baseFreightAmount` (+ `freightTariffId`) và phụ phí thu khách vào `order_fees`; cập nhật tổng trên `orders`. Container không tìm thấy giá → bắt nhập giá tay (`isManualPrice`).
- Tự động sinh các Stop tiêu chuẩn **cho từng container** theo loại đơn:
  - IMPORT: `PICK_FULL` → `UNSTUFFING` → `RETURN_EMPTY`
  - EXPORT: `PICK_EMPTY` → `STUFFING` → `PORT_IN`
  - DOMESTIC: cấu hình theo tuyến.
- Máy trạng thái Order (file 02 enum `status`) với bảng chuyển trạng thái hợp lệ + test.
- **Chấp nhận khi:** đơn có cont không có giá không thể `CONFIRMED` với giá 0; chuyển trạng thái sai thứ tự bị chặn; Order 5 cont sinh đúng 5 bộ Stop; tổng tiền Order = tổng tiền các cont; hủy 1 cont không làm hủy Order.

## PHASE 2: ĐỘI XE & ĐIỀU VẬN
### [ ] TICKET-05: Đội xe, Tài xế & Giấy tờ
- Bảng `tractors`, `trailers`, `drivers`, `maintenance_plans`, `maintenance_orders`.
- Hạn giấy tờ (đăng kiểm, bảo hiểm, phù hiệu, GPLX, kiểm định rơ moóc); job hằng ngày cảnh báo sắp hết hạn.
- **Chấp nhận khi:** danh sách "giấy tờ sắp hết hạn 15 ngày" đúng với dữ liệu seed.

### [ ] TICKET-06: Điều vận SINGLE với Pessimistic Lock & kiểm tra xung đột thời gian
- Bảng `consolidated_trips`, `trip_containers`, `dispatch_assignments`.
- Service `assignResources` theo file 03 mục 1 (thứ tự khóa, chồng lấn thời gian, giấy tờ, bảo dưỡng, giờ lái, mã lỗi).
- **Chấp nhận khi:** test đồng thời: 2 transaction gán cùng 1 tài xế cho 2 chuyến chồng giờ → đúng 1 thành công; gán chuyến chiều cho xe đang có chuyến sáng (không chồng giờ) → thành công; không có deadlock khi 2 người ghép chéo tài nguyên.

### [ ] TICKET-07: Giao diện Kanban Điều vận (Drag & Drop + Optimistic UI)
- Kanban `dnd-kit` + `useOptimistic`, mỗi thẻ là một container (gom nhóm theo Order), rollback khi action trả `ok: false` kèm thông báo theo mã lỗi.
- Cập nhật realtime giữa các Điều vận viên qua SSE (Redis Pub/Sub); xử lý `STALE_DATA`.
- Hiển thị nhãn ePort (`portReadinessStatus`), đếm ngược DEM/DET/cut-off, cảnh báo bảo dưỡng/giấy tờ.
- **Chấp nhận khi:** E2E Playwright: 2 trình duyệt cùng kéo một tài xế, trình duyệt thua thấy thẻ quay lại và thông báo lỗi.

### [ ] TICKET-08: Ghép chuyến TWIN_20 / COMBINED / Street Turn & Tách chuyến
- `createConsolidatedTrip` với các Rule 1–8 file 03 mục 2.
- Tách chuyến, hủy assignment, hủy Order (file 03 mục 4); phát sự kiện re-pricing (file 06 mục 4).
- **Chấp nhận khi:** mỗi Rule có ít nhất 1 test chặn và 1 test cho phép.

### [ ] TICKET-09: Drop & Hook, Cứu hộ, Bắn xe ngoài
- Drop/Hook theo file 03 mục 3; Cứu hộ theo file 05 mục 1 (có `incidents`, tổng `completionPercentage` = 100); Sub-contract theo file 05 mục 2.
- **Chấp nhận khi:** kịch bản xe hỏng ở 40% → lương chia 40/60 khớp đến từng đồng.

## PHASE 3: APP TÀI XẾ & CHỨNG TỪ [BỔ SUNG – bản gốc thiếu hẳn phần app]
### [ ] TICKET-10: API tài xế & App Expo (online)
- `/api/v1/driver/*` với JWT; xem lệnh hôm nay, bắt đầu chuyến, check-in/hoàn tất Stop, chụp ảnh chứng từ (upload presigned lên S3, bảng `attachments`).
- **Chấp nhận khi:** tài xế chỉ thấy assignment của chính mình.

### [ ] TICKET-11: Offline-first & Đồng bộ
- Outbox SQLite, `clientEventId`, upload ảnh tiếp tục được, xử lý `CONFLICT`, `clockSkewMs` (file 05 mục 3).
- **Chấp nhận khi:** test: gửi cùng 1 sự kiện 3 lần → chỉ ghi 1 lần; sự kiện đến sai thứ tự bị từ chối có lý do.

### [ ] TICKET-12: OCR chứng từ & Xác nhận ePOD
- Job `ocr.process` qua `VisionOcrProvider`; kiểm tra check digit; hàng đợi duyệt tay; `isEpodVerified` theo file 05 mục 4.
- `isEpodVerified` theo từng container, Order tổng hợp. Chặn chuyển Order sang `RECONCILED` nếu `isEpodVerified === false` (cho đối soát từng phần theo container đã đủ chứng từ).
- **Chấp nhận khi:** bộ ảnh mẫu đạt ngưỡng chính xác do PO chốt; OCR lỗi không chặn được quy trình duyệt tay.

## PHASE 4: GPS, GEOFENCE & DẦU
### [ ] TICKET-13: Pipeline GPS (Redis Stream + MariaDB Partitioned)
- `gps_devices`, xác thực thiết bị, `/api/v1/gps/ingest`, Redis Hash vị trí mới nhất, Redis Stream, worker consumer group + `INSERT IGNORE`, migration partition + job bảo trì partition.
- Màn hình Live Fleet Map (SSE/polling) và Playback lộ trình.
- **Chấp nhận khi:** test tải 500 xe × 10 giây trong 30 phút không mất điểm, lag stream ổn định; kill worker giữa chừng không mất dữ liệu.

### [ ] TICKET-14: Geofencing & Tính giờ chờ
- Sự kiện vào/ra vùng → `arrivedAt`/`departedAt`; đối chiếu với giờ tài xế bấm; tính detention tại kho (file 05 mục 3).

### [ ] TICKET-15: Phiếu Dầu & Cảnh báo Định mức
- `fuel_transactions`, `fuel_norms`; phát hành phiếu (QR, hạn mức, hết hạn); nhập số liệu từ app; thuật toán full-to-full + đối chiếu GPS (file 04 mục 2.3); OCR ảnh trụ bơm/odometer.
- **Chấp nhận khi:** test các ca: đổ một phần xen giữa, odometer lùi, chênh GPS > 10%, vượt định mức.

## PHASE 5: CHI PHÍ, PHÂN BỔ, LƯƠNG & CÔNG NỢ
### [ ] TICKET-16: Chi phí dọc đường & Tạm ứng
- `trip_expenses` (khai từ app, duyệt trên web), chi hộ sinh `order_fees` `PASS_THROUGH`; tạm ứng/hoàn ứng vào `driver_ledger`.

### [ ] TICKET-17: Chi phí chuyến & Phân bổ
- `trip_costs` (NORM từ bảng phí, ACTUAL từ dầu/chi phí/thuê ngoài/cứu hộ); hệ thống tự phân bổ về từng container theo định mức (file 06 mục 3); khóa chi phí.
- **[BỔ SUNG] Màn hình Kế toán sửa phân bổ:** so sánh số hệ thống và số áp dụng, nhập theo tiền hoặc %, bắt buộc lý do, nút khôi phục số hệ thống, audit.
- **Chấp nhận khi:** property test: với mọi bộ chi phí ngẫu nhiên, tổng phân bổ = tổng chi phí chuyến; Kế toán lưu số lệch tổng bị chặn; role khác `ACCOUNTANT`/`ADMIN` không sửa được; chi phí chuyến tăng sau khi Kế toán sửa không ghi đè số của Kế toán và gắn cờ cần xem lại; sau khi khóa không sửa được.

### [ ] TICKET-18: Phí DEM/DET tự động
- `dem_det_tariffs`, job theo múi giờ tenant, idempotent, cảnh báo 48h/24h (file 05 mục 5).
- **Chấp nhận khi:** chạy job 2 lần trong cùng ngày không sinh thêm phí.

### [ ] TICKET-19: Đối soát Split-view (Khách hàng, Cây xăng, Nhà xe ngoài)
- Import Excel có ánh xạ cột theo đối tác, 4 nhóm kết quả, idempotent; sinh `vendor_bills` cho AP.

### [ ] TICKET-20: Sổ cái Lương Tài xế & Kỳ lương
- `payroll_periods`, `driver_ledger` append-only, quyết toán: Lương chuyến + Phụ cấp − Tạm ứng − Phạt = Thực lãnh; chi lương ghi `PAYOUT`; kỳ đã `APPROVED` không cho ghi thêm.

### [ ] TICKET-21: Hóa đơn, Thanh toán & Khóa kỳ
- `invoices`, `invoice_lines`, `payments`, `accounting_periods`; adapter hóa đơn điện tử (bắt đầu với 1 nhà cung cấp); báo cáo tuổi nợ; khóa kỳ.

## PHASE 6: BÁO CÁO, THÔNG BÁO & VẬN HÀNH [BỔ SUNG]
### [ ] TICKET-22: Báo cáo P&L & KPI
- P&L theo Order / Khách hàng / Xe / Tài xế / Tuyến; tỷ lệ km rỗng; số chuyến/xe/ngày; công nợ quá hạn. Xuất Excel.

### [ ] TICKET-23: Thông báo
- Trong app + email + Zalo/SMS (adapter); cấu hình người nhận theo loại sự kiện.

### [ ] TICKET-24: Sẵn sàng Production
- Theo file 08: backup + restore thử, giám sát, log, rate-limit, rà soát bảo mật, runbook sự cố, onboarding tenant mới.
