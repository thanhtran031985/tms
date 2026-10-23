# Kế hoạch 07-dispatch-kanban — Giao diện Kanban điều vận

## Bối cảnh
Task 06 đã có service điều vận (`createSingleTrip`, `assignResources`, `cancelAssignment`, `listResourceAvailability`, sự kiện Redis `dispatch.updated` ở kênh `tenant:{tenantId}:dispatch`) nhưng chưa có màn hình. Task 07 dựng `/dispatch`: bảng Kanban 6 cột (mỗi container một thẻ, gom theo Order), lịch xe theo giờ, bảng gán xe, kéo thả (chuột + bàn phím), optimistic UI có rollback và "Hoàn tác", realtime qua SSE. Mục tiêu: tải lần đầu < 2 giây với 300 thẻ, dùng tốt ở 1440×900 và 1366×768, đủ 4 trạng thái, khớp `designs/components/Screen03-Dispatch`.

Nhánh `feat/07-dispatch-kanban` đã tạo từ `feat/06-dispatch-single`; README dòng 07 đã 🔄. Người dùng đã duyệt cài **`@dnd-kit/core`** (chỉ gói này); không cài gì khác. Người dùng cho "toàn quyền": làm lần lượt các bước, commit sau mỗi bước, không chờ "continue", chỉ dừng khi thật sự mơ hồ.

## Phát hiện từ khám phá (ảnh hưởng thiết kế)
- `TenantDb.select` chỉ một bảng, không join, không đếm → `board.query.ts` gom dữ liệu bằng nhiều truy vấn `inArray` rồi ghép trong bộ nhớ (như `availability.query.ts`). Không có phân trang cursor ở đâu trong repo → viết mới.
- `order_containers` đã có `portReadinessStatus`, `demFreeUntil`, `detFreeUntil`, `isEpodVerified`, `isDangerousGoods`, `linkedContainerId` (Street Turn), `containerType` (đuôi `RF` = cont lạnh). `cutOffAt` nằm ở `orders`. Không có cờ "thiếu chứng từ" → suy ra: `containerNo` null, `cargoWeightTons`/`vgmTons` null.
- `order_stops.windowStart` chỉ có ở Stop đầu; `routes` không có thời lượng → khung giờ gợi ý = `windowStart` Stop đầu + hằng số `DEFAULT_TRIP_HOURS = 3.5` (ghi decisions.md).
- Không có cặp mặc định xe–tài xế–rơ moóc → "làn" của lịch là **đầu kéo**; mỗi làn hiện tài xế/rơ moóc của các chuyến trong ngày. Khi gán phải chọn đủ tài xế + rơ moóc (xem Bước 5).
- Hoàn tác = `cancelAssignment` (task 06): chuyến vẫn `PLANNED`, container vẫn `PLANNED`, `primary*` trống. Vì vậy **chuyến PLANNED không còn assignment hoạt động hiển thị ở cột Chờ điều** (thẻ mang `tripId` + `version`, lần gán tiếp theo dùng lại chuyến, không tạo chuyến mới). Cũng giúp khi `createSingleTrip` ok mà `assignResources` lỗi: không có chuyến mồ côi.
- `proxy.ts` chuyển hướng mọi request chưa đăng nhập sang `/login` (307) → SSE cần 401: thêm nhánh `/api/v1/*` trả 401 JSON.
- Web Vitest chỉ chạy `src/**/*.test.ts` môi trường node (không jsdom): logic UI tách thành hàm thuần để test; hành vi giao diện kiểm bằng Playwright.
- `apps/web/src/lib/deadline.ts` đã có `deadlineLevel`/`formatRemaining` (dùng ở orders). Chuyển lõi sang `packages/shared/deadline.ts` theo task.md, file web re-export giữ nguyên API cũ (test cũ phải xanh).
- Seed: chỉ Order `IMP-2610-031` có Stop mốc 25/10; `EXP-2610-046` (2 cont 40HC, PENDING, cùng khung) có mốc 28/10 → dùng cho E2E đồng thời; bổ sung dữ liệu board vào seed dispatch (DEM/DET, portReadiness, bảo dưỡng sắp đến) theo kiểu idempotent.
- `dispatch.view` gồm cả FLEET_MANAGER (task.md chỉ liệt kê OWNER/ADMIN/DISPATCHER/VIEWER) → giữ `dispatch.view`, ghi decisions.md.

## Suy ra từ task.md/spec (báo cáo, ghi decisions.md, không dừng)
1. **Phân cột** (tính trong `board.query.ts`, ngày theo múi giờ tenant `[startOfTenantDay, +1 ngày)`):
   - Chờ điều = container `PENDING` của Order `CONFIRMED`/`IN_PROGRESS` có mốc Stop đầu ≤ hết ngày (gồm tồn từ ngày trước) hoặc chưa có mốc, **cộng** container có chuyến `PLANNED` mà không còn assignment hoạt động.
   - Đã lên kế hoạch = chuyến `PLANNED` có assignment hoạt động; Đã điều = `DISPATCHED`; Đang chạy = `IN_TRANSIT`; Hoàn thành chờ chứng từ = chuyến `COMPLETED` mà container chưa `isEpodVerified`; các cột chuyến lấy chuyến giao với ngày đang xem (`plannedStart < cuối ngày` và `plannedEnd ≥ đầu ngày`).
   - Chờ móc rơ moóc: cột và trạng thái trống hiển thị, chưa truy vấn (dữ liệu từ task 09).
   - Order `DRAFT`, container/Order `CANCELLED` không có thẻ.
2. **Phân trang**: tối đa 100 thẻ mỗi cột mỗi lần, `total` mỗi cột luôn đúng, cursor dạng chuỗi mờ `(sortKey,id)` theo cột, nút "Tải thêm" ở cột còn dữ liệu.
3. **Lọc**: `zone` (qua `locations.zone` của Stop đầu/cuối hoặc `routes.originZone/destinationZone`), `customerId`, `direction` (`orders.orderType`; DOMESTIC tính vào "Tất cả"), `q` (số cont, mã Order, tên khách). Số đếm tab Xuất/Nhập/Tất cả tính trước khi áp `direction`.
4. **Chip thẻ**: cut-off (Order xuất) và DEM/DET theo `deadline.ts`; cảng (`READY_EDO` Có EDO, `PENDING`+nhập Chờ EDO, `READY_EMPTY_RELEASE` Có lệnh cấp rỗng, `HOLD_*` HOLD hải quan, mức crit); Cont lạnh; Hàng nguy hiểm; Street Turn; "Thiếu số cont"/"Thiếu khối lượng"; Rule 8: `plannedEnd` (hoặc khung gợi ý) sau `cutOffAt` thì chip đỏ "Quá cut-off".
5. **Làn xe**: mỗi đầu kéo `ACTIVE`: chuyến trong ngày (khối trên trục 05:00–23:00), bảo dưỡng chồng ngày (`maintenance_orders`), nhãn giấy tờ ≤15 ngày/đã hết hạn (dùng `documentsOf`), "sắp đến kỳ bảo dưỡng" khi `nextMaintenanceOdometer − currentOdometer ≤ 1000 km` hoặc đến hạn theo `listMaintenanceDue`; tài xế `OFF_DUTY` hiện khối "Nghỉ phép/Nghỉ".
6. **Gán xe**: bảng gán xe liệt kê đầu kéo từ `listResourceAvailability` kèm lý do; chọn xe → chọn tài xế và rơ moóc (ô chọn có sẵn mặc định là phương án rảnh đầu tiên, mỗi phương án kèm lý do) → "Gán xe". Khác preview (bấm xe là gán ngay) vì mô hình dữ liệu không có cặp mặc định → ghi decisions.md. Kéo thả vào làn: thả xong mở cùng hộp chọn tài xế/rơ moóc rồi gán. Bàn phím: chọn thẻ bằng Enter/Space, Tab đến xe, Enter; dnd-kit `KeyboardSensor` cho kéo.
7. **Sau gán** gọi `assignResources` (nếu thẻ chưa có chuyến thì `createSingleTrip` trước, giờ = khung gợi ý), thông báo "Hoàn tác" 8 giây → `cancelAssignment`. `data.warnings` cấp `warn/danger` cần xác nhận hiện hộp xác nhận (gửi lại với `confirmMissingWeight` khi `WEIGHT_CONFIRMATION_REQUIRED`); `DRIVING_HOURS_EXCEEDED` chỉ cho ADMIN nút ghi đè, bắt nhập lý do.
8. **SSE**: sự kiện `dispatch.updated` → client lấy lại đúng các thẻ trong `orderContainerIds` bằng Server Action `loadBoardCards` (cùng builder với board), so `version`, ghi đè nếu mới hơn; tab hết hạn session thì SSE đóng, hiện trạng thái Lỗi.

## Cấu trúc mã
```
packages/shared/deadline.ts (+ .test.ts)      deadlineStatus(target, now, tz) → {level,text,absolute}; hàm cũ giữ tương thích
packages/shared/schemas/dispatch.ts           + getDispatchBoardSchema, loadBoardCardsSchema
packages/core/modules/dispatch/board.query.ts getDispatchBoard(ctx,{date,zone?,customerId?,direction?,q?,column?,cursor?}) + getBoardCards(ctx,{orderContainerIds,date})
packages/core/modules/dispatch/index.ts       + getDispatchBoard, getBoardCards trong DispatchService
packages/core/modules/dispatch/board.int.test.ts (+ board.perf trong cùng file hoặc board.perf.int.test.ts)
packages/core/lib/db/seeds/dispatch.ts/.test-data.ts  bổ sung dữ liệu board (idempotent)
apps/web/src/proxy.ts                         /api/v1/* chưa đăng nhập → 401
apps/web/src/app/api/v1/stream/dispatch/route.ts + route.test.ts, features/dispatch/stream-handler.ts (factory có thể test)
apps/web/src/app/(tenant)/dispatch/{page,loading,error}.tsx
apps/web/src/features/dispatch/{board,kanban-column,container-card?,assign-panel,resource-lanes,use-dispatch-stream,board-state,error-messages}.tsx|ts
apps/web/src/components/ui/{container-card,status-chip(+size sm đã có)}.tsx
apps/web/src/components/ui/app-shell/nav-menu.tsx  "Điều vận" → href '/dispatch'
apps/web/e2e/{dispatch,dispatch-concurrency}.spec.ts
apps/web/package.json                         + @dnd-kit/core (đã được duyệt)
```
Tái sử dụng: `defineAction`/`requireRole` (`apps/web/src/server`), `getDispatchService` (`server/services.ts`), `rolesFor('dispatch.view'|'dispatch.assign')`, `startOfTenantDay`/`toTenantDate` (`core/lib/time`), `documentsOf` (`dispatch/rules/documents.ts`), `listMaintenanceDue` (`fleet/maintenance.service.ts`), `Alert`, `FilterTabs`, `StatusChip`, `EmptyState`, `Button`, `Field`, `getRedis().duplicate()` cho kết nối subscribe, `startTestInfra({redis:true})`, `dispatchChannel`.

## Các bước (đúng task.md; test viết trước, mỗi bước xong cập nhật progress.md + dashboard và commit `07-dispatch-kanban: step N — …`)
1. **Truy vấn bảng**: `board.int.test.ts` đỏ trước (6 cột, DRAFT/CANCELLED không có thẻ, lọc ngày/khu vực/khách/chiều/ô tìm, phân trang ổn định, tách tenant, 300 thẻ < 2 s) → `board.query.ts` + bổ sung seed + Server Action `loadDispatchBoard`/`loadBoardCards` (`requireRole` + zod). Nếu 300 thẻ chậm, thêm migration index (`consolidated_trips (tenantId, plannedStart)`) và ghi decisions.md.
2. **Mức hạn**: `packages/shared/deadline.test.ts` đỏ trước (còn 2 giờ 15 crit, 7 giờ 40 warn, 20 giờ 40 info, "quá 35 phút" crit, qua nửa đêm giờ Việt Nam) → `deadline.ts`; web `lib/deadline.ts` re-export, test cũ vẫn xanh.
3. **SSE**: `route.test.ts` đỏ trước (Testcontainers Redis: tenant A nhận của A, không nhận của B; chưa đăng nhập 401; VIEWER nhận được) → `stream-handler.ts` + `route.ts` (SSE `text/event-stream`, heartbeat 15 s, đóng subscriber khi hủy), `proxy.ts` 401, `use-dispatch-stream.ts` (tự nối lại, báo mất kết nối).
4. **Giao diện chỉ hiển thị**: page + `loading.tsx`/`error.tsx`, `board.tsx`, `kanban-column.tsx`, `resource-lanes.tsx`, `ContainerCard`, nhóm theo Order có thu gọn, bộ lọc trên URL, đủ 4 trạng thái; menu "Điều vận" có link; hàm thuần của view (nhóm, đếm, vị trí khối trên trục giờ) có test Vitest. Kiểm tra bằng Playwright chụp 1440×900 và 1366×768, sáng/tối, đối chiếu `preview.html`.
5. **Gán xe**: `assign-panel.tsx`, dnd-kit (Pointer + Keyboard), `useOptimistic`, rollback theo `error-messages.ts`, `STALE_DATA` tải lại thẻ, `RESOURCE_BUSY_RETRY` báo thử lại, hộp xác nhận cảnh báo, ghi đè giờ lái (ADMIN), "Hoàn tác", cập nhật thẻ theo SSE; VIEWER không thấy nút gán/không kéo được. Logic trạng thái (reducer optimistic/rollback) tách hàm thuần có test.
6. **E2E hai trình duyệt**: `dispatch-concurrency.spec.ts` (hai context, 2 cont EXP-2610-046 cùng tài xế, thua → thẻ về Chờ điều + lỗi đúng mã, thắng → Đã lên kế hoạch, hai bên cùng trạng thái nhờ SSE) và `dispatch.spec.ts` (lọc Xuất/Nhập, bảng gán xe khóa "Đăng kiểm hết hạn, không được điều"); chạy 5 lần liên tiếp không chập chờn.
7. **Hoàn tất**: `pnpm typecheck`, `lint`, `test`, `build`, `e2e` xanh; mọi Server Action/Route Handler có `requireRole` + zod; decisions.md ghi chỗ khác preview; cập nhật spec 03 mục 5 nếu lệch; README → ✅.

## Kiểm tra end-to-end
- Docker Desktop chạy; `pnpm db:migrate && pnpm db:seed` (hai lần không trùng).
- `pnpm test --filter core -- board`, `--filter shared -- deadline`, `--filter web -- stream`; `pnpm e2e -- dispatch` ×5.
- Thủ công: `/dispatch?date=2026-10-28` đăng nhập `hung.dv@phucan.vn`, chọn thẻ → gán bằng chuột và bằng bàn phím; mở hai trình duyệt thấy đồng bộ; `curl -N` vào `/api/v1/stream/dispatch` với cookie phiên thấy `dispatch.updated`.
- Không đọc `.env`; không cài thêm package ngoài `@dnd-kit/core`.

## Việc người dùng cần làm thủ công
Duyệt kế hoạch này; bật Docker Desktop; có `.env` với `DATABASE_URL`, `SEED_DEV_PASSWORD`, `REDIS_URL` cho e2e; lần đầu e2e chạy `pnpm --filter web exec playwright install chromium` nếu chưa cài.
