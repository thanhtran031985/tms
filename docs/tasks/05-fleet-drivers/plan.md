# Kế hoạch task 05-fleet-drivers — Đội xe, tài xế và giấy tờ

## Bối cảnh
Task 00–02 xong (✅, CI xanh). Task 05 khai báo đầu kéo (`tractors`), rơ moóc (`trailers`), tài xế (`drivers`), kế hoạch bảo dưỡng (`maintenance_plans`), và lệnh bảo dưỡng (`maintenance_orders`). Quản lý hạn giấy tờ (đăng kiểm, bảo hiểm, phù hiệu, GPLX, kiểm định rơ moóc, chứng chỉ chở hàng nguy hiểm). Job hàng ngày quét giấy tờ sắp hết hạn trong 15 ngày theo múi giờ tenant. Tìm lệnh bảo dưỡng chồng lấn để giữ chỗ chặn điều xe. Che dữ liệu PII tài xế cho role không đủ quyền.
Nhánh `feat/05-fleet-drivers` tạo từ `feat/02-master-data` (`3847d42`).

## Quyết định (ghi decisions.md)
- **Chứng chỉ hàng nguy hiểm**: Spec 03 Rule 6 yêu cầu kiểm tra chứng chỉ hàng nguy hiểm của tài xế nhưng spec 02 chưa có cột. Bổ sung `drivers.dgCertificateNo VARCHAR(30) NULL` và `drivers.dgCertificateExpiry DATE NULL`.
- **Rơ moóc 20FT và Twin 20**: `trailerType = '20FT'` thì `canCarryTwin20` bắt buộc `false`. `maxPayloadTons` bắt buộc.
- **Hạn giấy tờ**: Kiểu `DATE`, tính theo `toTenantDate(ctx, now)`. "Sắp hết hạn 15 ngày" = [hôm nay, hôm nay + 15 ngày]; "Đã hết hạn" = trước hôm nay.
- **Bảo mật PII**: `nationalIdNo`, `licenseNo`, `phone` chỉ trả đầy đủ cho `OWNER`, `ADMIN`, `FLEET_MANAGER`. Các role khác nhận giá trị che (vd: `09xx xxx 123`).
- **Job hàng ngày**: Worker job `fleet.document-expiry` chạy theo tenant, idempotent theo key `DOC_EXPIRY:{tenantId}:{yyyy-mm-dd}`, phát sự kiện `fleet.documents_expiring`.
- **Bảo dưỡng**: Lệnh `PLANNED`/`IN_PROGRESS` chặn điều xe khi `planned_start < :end AND planned_end > :start`.
- **Quyền**: Ghi cho `OWNER`, `ADMIN`, `FLEET_MANAGER`; `DISPATCHER` xem (PII che); `VIEWER` xem.

## Các bước
1. **Schema + migration + repo + cách ly tenant.** Viết test trước `modules/fleet/repo.int.test.ts` (đỏ), rồi `schema/fleet.ts`, `pnpm db:generate` (review SQL), `repo.ts`. Kiểm tra: migrate trên DB trống và DB đã có dữ liệu task 02; test repo xanh.
2. **Service đầu kéo, rơ moóc, tài xế và che PII.** Viết test trước `fleet.service.int.test.ts`, rồi service + schema zod + Server Action. Kiểm tra: test xanh.
3. **Rà hạn giấy tờ và seed.** Viết test trước `documents.service.int.test.ts` (đồng hồ cố định), `documents.service.ts`, seed `seeds/fleet.ts`. Kiểm tra: seed và list ra đúng danh sách 15 ngày.
4. **Kế hoạch và lệnh bảo dưỡng.** Viết test trước `maintenance.service.int.test.ts`, rồi service + Server Action. Kiểm tra: test xanh.
5. **Job hàng ngày cảnh báo giấy tờ.** Viết test trước `apps/worker/src/jobs/document-expiry.int.test.ts`, rồi job worker. Kiểm tra: test xanh.
6. **Màn đội xe, tài xế và giấy tờ.** Route và view `/fleet/tractors`, `/fleet/trailers`, `/fleet/drivers`, `/fleet/documents`, e2e test. Kiểm tra: e2e xanh.
7. **Hoàn tất.** typecheck, lint, format, test, build, e2e; progress, decisions, README ✅; commit.
