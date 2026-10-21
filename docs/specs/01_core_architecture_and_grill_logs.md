# Kiến trúc Mã nguồn & Hồ sơ Quyết định Nghiệp vụ (Grill Logs)

## 1. Tech Stack & Global Rules cho AI
- **Tech Stack:** Next.js App Router, React 19, TypeScript (strict), Drizzle ORM, MariaDB, Redis, Tailwind CSS, Shadcn UI, `dnd-kit`, TanStack Table. **[BỔ SUNG]** BullMQ (job), Auth.js hoặc better-auth (xác thực), `decimal.js` (tiền), Vitest + Testcontainers (test tích hợp với MariaDB/Redis thật), Playwright (E2E), Expo/React Native (app tài xế), pnpm workspace (monorepo).
- **Rule 1 (Tenant Guard) [SỬA]:** Mọi câu query Drizzle phải chứa `eq(table.tenantId, ctx.tenantId)`. `ctx.tenantId` chỉ lấy từ session đã xác thực, không bao giờ lấy từ input client. Truy cập DB trong `/modules` chỉ qua `getTenantDb(ctx)` (xem ADR-003).
- **Rule 2 (Validation):** Mọi Server Action / Route Handler phải validate input bằng `zod` trước khi mở DB Transaction.
- **Rule 3 (Optimistic UI):** Màn hình kéo thả Kanban phải dùng `useOptimistic` để cập nhật giao diện tức thì và tự rollback nếu Server Action trả về lỗi.
- **Rule 4 (Authorization) [BỔ SUNG]:** Mọi Server Action / Route Handler bắt đầu bằng `const ctx = await requireRole([...])`. Ma trận quyền nằm ở `modules/identity/permissions.ts`, không rải rác trong component.
- **Rule 5 (Kết quả trả về) [BỔ SUNG]:** Server Action không `throw` ra client; trả về `{ ok: true, data } | { ok: false, code, message }` với `code` là mã lỗi nghiệp vụ cố định (ví dụ `DRIVER_NOT_AVAILABLE`, `TARIFF_NOT_FOUND`) để UI hiển thị và test được.
- **Rule 6 (Tiền & Thời gian) [BỔ SUNG]:** Tuân thủ ADR-008: không dùng `number` cho tiền, không dùng `new Date()` để cắt ngày nghiệp vụ mà dùng helper `toTenantDate(ctx, instant)`.
- **Rule 7 (Idempotency) [BỔ SUNG]:** Mọi API nhận dữ liệu từ app tài xế / thiết bị phải nhận `clientEventId` (UUID do client sinh) và bỏ qua nếu đã xử lý.
- **Rule 8 (Audit) [BỔ SUNG]:** Thay đổi trên Order, Assignment, Tariff, Fee, Ledger, Invoice phải ghi `audit_logs` trong cùng transaction.
- **Rule 9 (Test) [BỔ SUNG]:** Mỗi ticket phải kèm test cho hành vi nghiệp vụ (viết test trước theo TDD). Bắt buộc có test cho: tenant isolation, xung đột điều vận đồng thời, Pricing Engine, phân bổ chi phí (tổng phân bổ = tổng chi phí).

## 2. Cấu trúc Thư mục (Feature-Sliced Design) [SỬA]
```text
/apps
  /web                       # Next.js
    /src/app/(auth)          # Đăng nhập, chọn tenant
    /src/app/(tenant)/[module]   # dispatch, orders, billing, fleet, fuel, reports, settings
    /src/app/api/v1/driver   # REST cho app tài xế (JWT)
    /src/app/api/v1/gps/ingest   # Nhận dữ liệu GPS (API key/HMAC theo thiết bị hoặc nhà cung cấp)
    /src/app/api/v1/stream   # SSE đẩy vị trí xe / cập nhật Kanban
    /src/features/<module>   # [BỔ SUNG 21/10] View + Server Action theo phân hệ (dispatch, orders, fleet, fuel, billing…); app/ chỉ định tuyến và gọi vào đây
    /src/components/ui       # [BỔ SUNG 21/10] Component dùng chung dựng theo designs/ (Button, Field, StatusChip, WorkTable…)
  /worker                    # Node process chạy BullMQ: cron, GPS flush, OCR, DEM/DET, thông báo
  /driver-app                # Expo / React Native
/packages
  /shared                    # zod schemas, enums, mã lỗi dùng chung web + app + worker
  /core
    /modules
      /identity              # users, memberships, roles, permissions
      /master-data           # customers, shipping lines, vendors, locations, routes
      /orders                # orders, order_containers, stops, DEM/DET
      /dispatch              # Điều vận, ghép chuyến, khóa Pessimistic Lock, kiểm tra xung đột thời gian
      /billing               # Pricing Engine 4 chiều, phân bổ chi phí, hóa đơn, đối soát công nợ
      /fuel                  # Phiếu dầu, định mức L/100km, OCR đồng hồ
      /expenses              # Chi phí dọc đường, tạm ứng
      /payroll               # driver_ledger, kỳ lương
      /fleet                 # Xe, rơ moóc, giấy tờ, bảo dưỡng, lốp
      /telemetry             # Redis hot-path, geofence, flush xuống MariaDB
      /notifications
      Mỗi module: service.ts (nghiệp vụ), repo.ts (truy cập DB có tenant guard), schema.ts (zod), *.test.ts
    /lib
      /db                    # Drizzle connection, schema/*.ts tách theo module, migrations
      /redis                 # Redis client + quy ước key
      /storage               # S3 client, signed URL
      /ai                    # Interface VisionOcrProvider (Gemini là một implementation, có thể thay)
      /audit
      /time, /money          # helper múi giờ và decimal
/designs                     # [BỔ SUNG 21/10] Bản tải từ Design System "TMS Container" (chỉ đọc): tokens.json, README.md, components/Screen01…09
/docs
  /specs                     # Bộ spec 00–08
  /tasks/<NN-tên-task>/      # [BỔ SUNG 21/10] Mỗi ticket một thư mục: task.md, plan.md, progress.md, decisions.md
CLAUDE.md                    # [BỔ SUNG 21/10] Hướng dẫn cho Claude Code
```

## 3. Hồ sơ Quyết định Nghiệp vụ (Tóm tắt các phiên /grill)
### Tại sao tách orders thành order_stops và dispatch_assignments?
Để xử lý nghiệp vụ Drop & Hook (thả rơ moóc tại kho chờ đóng hàng 2 ngày, đầu kéo chạy đi làm việc khác) và Cứu hộ dọc đường (xe hỏng giữa đường, điều đầu kéo khác ra kéo tiếp rơ moóc).

### Tại sao cần bảng consolidated_trips đứng giữa orders và dispatch_assignments?
Để xử lý bài toán Ghép 2 cont 20ft (TWIN_20) và Cont kết hợp 2 chiều (COMBINED). Doanh thu tính theo từng Order (thu của từng khách), nhưng Chi phí vận hành (Lương tài xế, BOT, Dầu) tính theo Chuyến thực chạy (consolidated_trips), sau đó mới phân bổ (allocate) ngược về từng container rồi cộng lên Order để tính Lãi/Lỗ. **[SỬA]** Mức phân bổ do hệ thống đề xuất theo định mức, Kế toán được sửa lại.

### Tại sao khóa cứng điều kiện is_epod_verified = true trước khi Đối soát?
Tránh việc tài xế làm mất phơi EIR hoặc biên bản giao hàng khiến kế toán không đòi được tiền khách hàng. **[BỔ SUNG]** `isEpodVerified` của Order được tính từ các Stop bắt buộc có chứng từ (xem file 05 mục 4); người xác nhận cuối cùng là con người (Kế toán/Điều vận), AI chỉ hỗ trợ.

### Tại sao Snapshot giá dầu, giá cước và bảng phí?
Giá dầu và bảng giá cước thay đổi theo thời điểm. Khi tạo giao dịch đổ dầu hoặc chốt đơn hàng, bắt buộc sao chép cứng đơn giá tại thời điểm đó vào bản ghi giao dịch để việc sửa bảng giá tháng này không làm nhảy số liệu của tháng trước. **[BỔ SUNG]** Snapshot lưu kèm `tariffId` nguồn để truy vết. Snapshot được phép tính lại (re-price) **chỉ khi** Order chưa xuất hóa đơn và có sự kiện làm đổi khóa tra giá (ghép/tách chuyến, đổi tuyến, đổi loại cont); mỗi lần tính lại ghi audit.

### [SỬA theo PO 16/10] Tại sao 1 Order chứa nhiều container nhưng vẫn cần bảng order_containers?
Nghiệp vụ: 1 Order = 1 Booking/B/L của khách, gồm nhiều container. Nhưng mỗi container có hành trình, tài xế, ngày trả rỗng, DEM/DET và ePOD riêng, và có thể được ghép TWIN_20 hoặc đảo vỏ độc lập với các cont khác cùng đơn. Vì vậy `orders` giữ thông tin chung, còn `order_containers` giữ mọi thứ theo từng vỏ. Stop, assignment, giá cước snapshot, phí DEM/DET, ePOD và chi phí phân bổ đều gắn với container; Order chỉ tổng hợp.

### [BỔ SUNG] Tại sao kiểm tra xung đột tài nguyên theo khoảng thời gian thay vì chỉ theo status?
Điều vận lên kế hoạch trước cho ngày mai. Nếu chỉ khóa theo `status = AVAILABLE` thì xe đang chạy chuyến sáng không thể được xếp chuyến chiều, và trạng thái dễ bị "kẹt" khi chuyến bị hủy. Vì vậy `status` chỉ phản ánh trạng thái hiện tại; điều kiện gán là *không có assignment chồng lấn khoảng thời gian kế hoạch* (xem file 03).

### [BỔ SUNG] Tại sao phí "chi hộ" tách khỏi phụ phí doanh thu?
Phí nâng hạ, cược vỏ, DEM/DET của hãng tàu do nhà xe trả thay rồi thu lại; nếu ghi là doanh thu sẽ làm sai P&L và sai thuế. Chi hộ đi theo luồng riêng: có chứng từ gốc, thu lại đúng số tiền, không cộng vào doanh thu cước.

## 4. Câu hỏi Mở cần Product Owner chốt [BỔ SUNG]
- ~~Phương pháp phân bổ chi phí mặc định~~ **Đã chốt 16/10:** mặc định theo định mức chi phí, Kế toán được sửa lại (file 06 mục 3).
- Lương tài xế tính theo chuyến cố định, theo km, hay kết hợp? (Schema hiện hỗ trợ theo chuyến qua `fee_tariffs.DRIVER_SALARY`.)
- Danh sách nhà cung cấp hóa đơn điện tử và nhà cung cấp GPS cần tích hợp đầu tiên.
- Thời gian lưu trữ dữ liệu GPS theo quy định hiện hành về thiết bị giám sát hành trình (cần pháp chế xác nhận).
