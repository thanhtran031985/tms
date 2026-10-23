# Tiến độ 06-dispatch-single

Trạng thái: ⬜ chưa làm · 🔄 đang làm · ❓ có code chưa rà soát · ⚠️ khác task.md · ❌ thiếu · ✅ xong

| Bước | Nội dung | Trạng thái | Commit |
|---|---|---|---|
| 1 | Schema chuyến và assignment, migration, seed, tenant isolation | ✅ | 9ddfb41 |
| 2 | Test đồng thời và test quy tắc (đỏ) | ✅ | |
| 3 | Tạo chuyến SINGLE cho một container | ⬜ | |
| 4 | assignResources: khóa, chồng lấn, tồn tại, trạng thái, timeout | ⬜ | |
| 5 | Giấy tờ, giờ lái và ràng buộc vật lý một container | ⬜ | |
| 6 | Sau commit, hủy assignment, truy vấn tài nguyên gán được và Server Action | ⬜ | |
| 7 | Hoàn tất | ⬜ | |

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
