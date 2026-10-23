# Tiến độ 06-dispatch-single

Trạng thái: ⬜ chưa làm · 🔄 đang làm · ❓ có code chưa rà soát · ⚠️ khác task.md · ❌ thiếu · ✅ xong

| Bước | Nội dung | Trạng thái | Commit |
|---|---|---|---|
| 1 | Schema chuyến và assignment, migration, seed, tenant isolation | ✅ | 9ddfb41 |
| 2 | Test đồng thời và test quy tắc (đỏ) | ✅ | 5dec2c5 |
| 3 | Tạo chuyến SINGLE cho một container | ✅ | 84585d2 |
| 4 | assignResources: khóa, chồng lấn, tồn tại, trạng thái, timeout | ✅ | 0b3bf48 |
| 5 | Giấy tờ, giờ lái và ràng buộc vật lý một container | ✅ | e528ce7 |
| 6 | Sau commit, hủy assignment, truy vấn tài nguyên gán được và Server Action | ✅ | fbc792d |
| 7 | Hoàn tất | ✅ | |

## Nhật ký
<!-- Sau mỗi bước: ngày, đã làm gì, kết quả Kiểm tra, việc người dùng cần làm thủ công. -->

### Bước 1 — 23/10/2026 (xong, kiểm tra DB xanh)
Cập nhật sau khi bật Docker: lần chạy đầu migration lỗi `ER_TOO_LONG_IDENT` vì tên FK tự sinh `dispatch_assignments_consolidated_trip_id_consolidated_trips_id_fk` dài 66 ký tự (MariaDB tối đa 64). Đã đặt tên `fk_assign_trip` bằng `foreignKey()` trong schema, sinh lại `0006_dispatch.sql`. Kết quả kiểm tra thực tế:
- `pnpm test` (project int) cho `modules/dispatch` và `seeds/dispatch`: 2 file, 13 test xanh.
- `pnpm db:migrate` chạy hai lần trên DB dev đã có dữ liệu task 05: xong, không lỗi. Migration cũng chạy trên DB trống (Testcontainers).
- `pnpm db:seed` chạy hai lần: vẫn 1 chuyến, 3 assignment, 1 trip_containers; cont MAEU2388417 ở `PLANNED`.
- `pnpm typecheck` và `pnpm lint` xanh (một lần lint ngẫu nhiên báo 7 lỗi khi chạy ngay sau typecheck, chạy lại hai lần đều xanh, không tái hiện được).

Ghi chú ban đầu (trước khi bật Docker):
Đã làm:
- Duyệt kế hoạch ở Plan mode, lưu `plan.md`, ghi `decisions.md`; commit task 05 và tạo nhánh `feat/06-dispatch-single`.
- Test trước `packages/core/modules/dispatch/repo.int.test.ts` (tenant isolation 3 bảng, `uq_trip_code`, mặc định); đã thấy đỏ vì chưa có `./repo`.
- Enum điều vận trong `packages/shared/enums.ts`; schema `packages/core/lib/db/schema/dispatch.ts` (3 bảng đúng spec 02, thêm `idx_assign_trip`); migration `0006_dispatch.sql` (đã đọc lại SQL).
- `packages/core/modules/dispatch/repo.ts` (repo riêng cho `trip_containers` vì khóa chính ghép).
- Seed `seeds/dispatch.ts` + `dispatch.test-data.ts` + `dispatch.int.test.ts`: 1 chuyến sáng 25/10 (08:00–12:30), 3 assignment cho 3 Stop của cont MAEU2388417, gán 51C-482.17 + 51R-112.23 + Phạm Quốc Huy; cont về `PLANNED`; bộ đếm `TRIP:2026-10`.
Kết quả kiểm tra:
- `pnpm typecheck` xanh, `pnpm lint` xanh, test đơn vị `core` xanh (99).
- CHƯA chạy được: `pnpm db:migrate`, `pnpm db:seed` hai lần, `repo.int.test.ts` và `seeds/dispatch.int.test.ts` vì Docker Desktop chưa chạy (Testcontainers cần Docker).
Việc người dùng cần làm: bật Docker Desktop, rồi tôi chạy `pnpm test --filter core -- dispatch` và hai lệnh db. Bước 1 chỉ đổi sang ✅ khi các lệnh này xanh.

### Bước 2 — 23/10/2026 (xong)
Đã làm:
- `packages/shared/schemas/dispatch.ts` (zod 6 hành động, kiểu `DispatchWarning`, `parseDispatchSettings` mặc định 10 giờ/ngày), 14 mã lỗi mới trong `errors.ts`, quyền `dispatch.view`/`dispatch.assign`.
- Khung `modules/dispatch/index.ts`: kiểu vào/ra của `DispatchService`, thân hàm chưa cài (ném lỗi) để test chạy đỏ mà typecheck vẫn xanh.
- `dispatch.test-world.ts`: dựng Testcontainers + seed + hàm tạo tài xế/đầu kéo/rơ moóc/container/chuyến riêng cho từng test.
- `assign.concurrency.int.test.ts` (5 test: 2 Điều vận cùng tài xế lặp 5 lần, chiều sau sáng, song song không chồng giờ, ghép chéo 20 vòng, giữ khóa >5 giây) và `assign.rules.int.test.ts` (41 test: kết quả gán, tenant/INACTIVE/xóa mềm, chồng lấn theo status, bảo dưỡng, trạng thái khi sắp chạy, giấy tờ, giờ lái, genset, hàng nguy hiểm, khối lượng, cut-off, dispatchTrip/Rule 7).
Kết quả kiểm tra: `pnpm test --filter core -- assign` chạy và đỏ: 46 test fail, mọi lỗi đều là "chưa được cài đặt" (setup và dữ liệu mẫu chạy được). `pnpm typecheck` xanh; `pnpm lint` xanh với mã của task (lint toàn repo đôi lúc báo lỗi ở thư mục `.fleet/` — worktree của công cụ khác, đã nằm trong .gitignore, không thuộc task này).

### Bước 3 — 23/10/2026 (xong)
Đã làm: test trước `trips.service.int.test.ts` (14 test) rồi cài `deps.ts` (kiểm quyền, `lockTrip`, khóa lạc quan `updateTripWithVersion`, `emit` sau commit) và `trips.service.ts`: `createSingleTrip` (khóa dòng container, Order phải CONFIRMED/IN_PROGRESS/PARTIALLY_DELIVERED, chặn container đã có chuyến hoạt động, `tripCode` TRIP-yymm-NNN từ `nextNumber`, container sang PLANNED, audit) và `updateTripTimes` (version, chỉ chuyến PLANNED, dời giờ assignment hoạt động). `createDispatchService` ở `index.ts` đã nối hai hàm này.
Kết quả kiểm tra: `pnpm test --filter core -- trips` 14/14 xanh (gồm ca hai Điều vận cùng tạo chuyến cho một container: đúng một người thành công); `pnpm typecheck` xanh.
Ghi chú: `updateTripTimes` hiện chỉ dời giờ assignment; kiểm tra lại chồng lấn/giấy tờ khi dời giờ chuyến đã gán sẽ làm ở Bước 4 và 5.

### Bước 4 — 23/10/2026 (xong)
Đã làm: `lib/db/tenant-db.ts` nhận `transaction(fn, { lockWaitTimeoutSec })` (SET SESSION innodb_lock_wait_timeout rồi trả về DEFAULT ở finally); `lib/db/errors.ts` (`isLockContentionError`: lỗi 1205 và 1213 kể cả khi drizzle bọc trong `cause`). `rules/{types,resource-state,overlap,maintenance}.ts` (hàm riêng cho từng quy tắc), `evaluate.ts` (`lockResources` theo thứ tự drivers -> tractors -> trailers, `evaluateResource`, `evaluateAssignment`), `assign.service.ts` (`assignResources`: khóa chuyến, khóa tài nguyên, rồi mới đọc thường; hủy assignment cũ khi gán lại; mỗi Stop một assignment; đồng bộ `primary*`; tăng `version`; audit từng assignment và chuyến; publish sau commit; lock timeout hoặc deadlock -> RESOURCE_BUSY_RETRY). `updateTripTimes` kiểm tra lại chồng lấn/bảo dưỡng cho chuyến đã gán rồi dời giờ assignment (thêm 2 test).
Kết quả kiểm tra: `assign.concurrency` 5/5 test xanh, chạy 5 lần liên tiếp đều xanh (gồm 2 Điều vận cùng tài xế lặp 5 vòng, ghép chéo 20 vòng không deadlock, giữ khóa >5 giây ra RESOURCE_BUSY_RETRY và gán lại được sau khi nhả); `trips` 16/16 xanh; `assign.rules` 23/41 xanh, đủ nhóm của bước này (tồn tại, tenant, INACTIVE, xóa mềm, chồng lấn theo status, bảo dưỡng, trạng thái khi sắp chạy, kết quả gán); 18 test còn đỏ đều thuộc Bước 5 (giấy tờ, giờ lái, vật lý, dispatchTrip). `pnpm typecheck` xanh.

### Bước 5 — 23/10/2026 (xong)
Đã làm: `rules/documents.ts` (GPLX; đăng kiểm, bảo hiểm, phù hiệu; kiểm định; hết hạn chặn, dưới 15 ngày cảnh báo, hết hạn đúng ngày kết thúc vẫn còn hạn), `rules/driving-hours.ts` (tổng giờ kế hoạch theo ngày múi giờ tenant, hợp khoảng để 3 dòng của một chuyến không bị đếm ba lần, chuyến qua nửa đêm chia theo ngày), `rules/physical.ts` (Rule 2 tải trọng dùng decimal.js, Rule 5 genset, Rule 6 chứng chỉ hàng nguy hiểm tại giờ kết thúc, Rule 8 cut-off), `rules/port-readiness.ts` (Rule 7), `context.ts` (tải container, Order, Stop, loại địa điểm). `evaluate.ts` gộp mọi quy tắc; `assignResources` đọc cấu hình tenant (`parseDispatchSettings`), từ chối ngay `DRIVING_HOURS_OVERRIDE_FORBIDDEN` nếu không phải ADMIN gửi ghi đè, ghi lý do ghi đè vào audit. `dispatchTrip` (PLANNED -> DISPATCHED): bắt buộc đã gán đủ ba tài nguyên, xét lại trạng thái tài nguyên, áp Rule 7, cập nhật `dispatchedAt`, audit `DISPATCH`. `lib/time` thêm `startOfTenantDay`, `addCalendarDays`, `diffCalendarDays`.
Kết quả kiểm tra: `pnpm test --filter core -- assign.rules` 41/41 xanh; toàn bộ `modules/dispatch` 71/71 test tích hợp xanh (repo 9, trips 16, concurrency 5, rules 41); test đơn vị `core` 121 xanh (thêm `rules.test.ts` và `time.test.ts`); `pnpm typecheck` xanh. Test dispatchTrip: cont HOLD_CUSTOMS/HOLD_LINE/PENDING bị PORT_NOT_READY, READY_EDO được; hàng Xuất cần READY_EMPTY_RELEASE.
Ghi chú: ngày đang xét là ngày tenant của giờ kế hoạch; `dispatchTrip` chỉ xét lại trạng thái tài nguyên và Rule 7 (không lặp lại giờ lái/khối lượng, vì cờ xác nhận và ghi đè không được lưu).

### Bước 6 — 23/10/2026 (xong)
Đã làm: `lib/redis/publish.ts` (`dispatchChannel` = `tenant:{tenantId}:dispatch`, `publishDispatchEvent`); `cancelAssignment` (hủy mọi assignment hoạt động của chuyến PLANNED/DISPATCHED, xóa primary*, chuyến về PLANNED, trả tài xế ON_DUTY/xe IN_USE về AVAILABLE khi không còn assignment hoạt động khác giữ chúng, audit từng dòng); `availability.query.ts` (`listResourceAvailability`: mọi tài xế/đầu kéo/rơ moóc chưa xóa mềm, dùng lại đúng hàm quy tắc của assignResources, không khóa dòng nào, lý do AVAILABLE "Rảnh trong khung giờ này", loại trừ chuyến hiện tại của chính container); `findTenantSettings` trong identity repo; `apps/web/src/features/dispatch/actions.ts` (6 action bằng defineAction, `revalidatePath("/dispatch")` chỉ sau khi service trả ok, trả tóm tắt không lộ tenantId) và `getDispatchService` trong `server/services.ts` (Redis publish + đọc tenants.settings).
Kết quả kiểm tra: `pnpm test --filter core -- dispatch` 10 file / 117 test xanh (events 4, cancel 7, availability 10, rules 43, trips 16, concurrency 5, perf 1, repo 9, seed 4, rules.test unit); web 13 file / 106 test xanh (actions dispatch 9, kể cả VIEWER/ACCOUNTANT/FLEET_MANAGER bị FORBIDDEN, actions-guard); đo hiệu năng trên DB Testcontainers có 300 assignment trong ngày: assignResources p50=48 ms, p95=87 ms, max=98 ms (40 lần) < 500 ms.

### Bước 7 — 23/10/2026 (xong, task hoàn thành)
Đã làm: cập nhật spec 03 (mục "Ghi chú cài đặt" và mục 4 hủy assignment) và spec 02 (`idx_assign_trip`, tên FK `fk_assign_trip`); README dòng 06 đổi sang ✅.
Kết quả kiểm tra:
- `pnpm typecheck`, `pnpm lint`, `pnpm build` không lỗi.
- `pnpm test` toàn workspace: core 48 file / 474 test, web 13 file / 106 test, worker 2 file / 7 test, tất cả xanh.
- Migration 0006 chạy được trên DB trống (Testcontainers mọi bộ test) và trên DB dev đã có dữ liệu; `pnpm db:seed` chạy lại nhiều lần không sinh trùng (1 chuyến, 3 assignment).
- Mọi Server Action dùng defineAction (requireRole rồi zod); 3 repo mới đều có test tenant isolation.
- "Chấp nhận khi" của ticket: hai transaction cùng tài xế chồng giờ đúng một thành công (lặp 5 vòng x 5 lần chạy); chuyến chiều cho xe có chuyến sáng thành công; ghép chéo 20 vòng không deadlock; p95 assignResources 87 ms với 300 assignment trong ngày.
Không chạy `pnpm e2e`: task không có giao diện.
