# Quyết định 20-driver-payroll

## Đã chốt
<!-- Quyết định đã chốt trước khi làm (nếu có), kèm ngày. -->
- `driver_ledger` append-only, không `UPDATE`/`DELETE`, sửa sai bằng bút toán đảo (ADR-009, spec không ghi ngày).
- Quyết toán: Lương chuyến + Phụ cấp − Tạm ứng − Phạt = Thực lãnh; chi lương ghi `PAYOUT`; kỳ `APPROVED` không cho ghi thêm (TICKET-20).
- Lương chuyến khi cứu hộ chia theo `completionPercentage`, làm tròn đến đồng, dư dồn tài xế hoàn tất chuyến (spec 05 mục 1).
- Bắn xe ngoài không tính lương tài xế (spec 05 mục 2).

**Còn mở, hỏi người dùng trước bước liên quan:**
- Lương tài xế tính theo chuyến cố định, theo km hay kết hợp vẫn là câu hỏi mở của PO (spec 01 mục 4). task.md làm theo chuyến qua `fee_tariffs.DRIVER_SALARY` (bước 3).
- Công thức ticket không nhắc `ADVANCE_SETTLEMENT` và `ON_ROUTE_REIMBURSEMENT` (task 16 ghi): tính vào Thực lãnh thế nào (bước 2).
- Ai duyệt kỳ lương: task.md đề xuất `ACCOUNTANT` tính, `OWNER`/`ADMIN` duyệt (bước 4).
- Ai ghi `TRIP_SALARY` cho chuyến thường: ticket 09 chỉ nói chia khi cứu hộ, không task nào nói rõ; task.md đặt ở đây (bước 3).
- Thêm `driver_ledger.idempotency_key` unique để không ghi lương trùng (spec 02 chưa có) (bước 1).
- Spec 00 mục 3 nói app tài xế "xem sổ lương" nhưng chưa có thiết kế màn trong `Screen09-DriverApp`; task.md chỉ làm API (bước 6).

## Phát sinh khi làm
<!-- Chỗ làm khác task.md, spec hoặc thiết kế: lý do, ai đồng ý, đã sửa spec chưa. -->
