# Tiến độ 05-fleet-drivers

Trạng thái: ⬜ chưa làm · 🔄 đang làm · ❓ có code chưa rà soát · ⚠️ khác task.md · ❌ thiếu · ✅ xong

| Bước | Nội dung | Trạng thái | Commit |
|---|---|---|---|
| 1 | Schema đội xe, migration và tenant isolation | ✅ | `0c667d1` |
| 2 | Service đầu kéo, rơ moóc, tài xế và che dữ liệu cá nhân | ✅ | |
| 3 | Rà hạn giấy tờ và seed | 🔄 | |
| 4 | Kế hoạch và lệnh bảo dưỡng | ⬜ | |
| 5 | Job hằng ngày cảnh báo giấy tờ | ⬜ | |
| 6 | Màn đội xe, tài xế và giấy tờ | ⬜ | |
| 7 | Hoàn tất | ⬜ | |

## Nhật ký
<!-- Sau mỗi bước: ngày, đã làm gì, kết quả Kiểm tra, việc người dùng cần làm thủ công. -->

### Bước 1 — Schema đội xe, migration và tenant isolation (22/10/2026)
- Tạo schema `schema/fleet.ts` (5 bảng: `tractors`, `trailers`, `drivers`, `maintenance_plans`, `maintenance_orders`), bổ sung 2 cột chứng chỉ hàng nguy hiểm `dg_certificate_no` và `dg_certificate_expiry` cho `drivers`.
- Enum mới trong `shared/enums.ts`: `TRACTOR_OWNERSHIP`, `TRACTOR_STATUS`, `TRAILER_TYPES`, `TRAILER_STATUS`, `DRIVER_EMPLOYMENT_TYPES`, `DRIVER_STATUS`, `MAINTENANCE_ORDER_TYPES`, `MAINTENANCE_ORDER_STATUS`.
- Sinh migration `0003_fleet.sql` và cập nhật journal.
- Tạo `modules/fleet/repo.ts` hỗ trợ soft-delete và unique key tra cứu theo tenant.
- Kiểm tra: 12 test cách ly tenant trong `modules/fleet/repo.int.test.ts` xanh; `db:migrate` chạy thành công trên MariaDB dev (port 3307); typecheck và lint xanh 100%.

### Bước 2 — Service đầu kéo, rơ moóc, tài xế và che dữ liệu cá nhân (22/10/2026)
- Viết schema validation Zod & hàm che PII (maskPhone, maskNationalId, maskLicense, maskDriverPII) tại `packages/shared/schemas/fleet.ts`. Cấm 20FT chọn canCarryTwin20.
- Viết `packages/core/modules/fleet/fleet.service.ts`: CRUD đầu kéo, rơ moóc, tài xế, che PII theo role (DISPATCHER thấy số che, FLEET_MANAGER/ADMIN thấy đầy đủ), chống trùng biển số xe trong cùng tenant.
- Cập nhật quyền `fleet.view` và `fleet.write` trong `packages/core/modules/identity/permissions.ts`.
- Viết Server Actions tại `apps/web/src/features/fleet/actions.ts` theo khuôn `defineAction`.
- Kiểm tra: 7 test trong `fleet.service.int.test.ts` xanh (tổng cộng 19/19 fleet tests xanh); typecheck và eslint xanh 100%.
