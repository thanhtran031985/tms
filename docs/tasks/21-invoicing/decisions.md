# Quyết định 21-invoicing

## Đã chốt
<!-- Quyết định đã chốt trước khi làm (nếu có), kèm ngày. -->
- Order đủ điều kiện xuất hóa đơn khi `RECONCILED`; cho xuất hóa đơn từng phần theo container đã đủ chứng từ (spec 06 mục 5).
- Hóa đơn gom nhiều Order của cùng khách theo kỳ; VAT theo `vatRatePercent` snapshot (spec 06 mục 5).
- Hóa đơn đã phát hành không `UPDATE`/`DELETE`, sửa bằng điều chỉnh (ADR-009).
- Kỳ kế toán `CLOSED` không cho tạo/sửa phí, hóa đơn có ngày thuộc kỳ; điều chỉnh bằng bút toán ở kỳ mở (spec 00 mục 1, spec 06 mục 5).
- Container đã xuất hóa đơn không bị tính lại giá, tạo yêu cầu điều chỉnh hóa đơn (spec 06 mục 4).

**Còn mở, hỏi người dùng trước bước liên quan:**
- Cách xử lý phí chi hộ trên hóa đơn (xuất hóa đơn riêng hay chuyển chứng từ gốc của bên thứ ba) cần kế toán trưởng xác nhận trước khi code (spec 06 mục 5) (bước 3).
- Nhà cung cấp hóa đơn điện tử đầu tiên chưa chọn (spec 01 mục 4) (bước 4).
- `invoiceNo` lấy từ `number_sequences` hay do nhà cung cấp hóa đơn điện tử cấp (bước 4).
- Ai được khóa kỳ: task.md đề xuất `ADMIN`, `OWNER`; thiết kế Đối soát ghi "cần Admin mở lại" kỳ đã khóa nhưng spec không có thao tác mở lại kỳ (bước 2).
- `payments` chỉ có một `invoiceId`: một lần chuyển khoản trả nhiều hóa đơn phải tách thành nhiều bản ghi, hay cần bảng cấn trừ riêng (bước 5).

## Phát sinh khi làm
<!-- Chỗ làm khác task.md, spec hoặc thiết kế: lý do, ai đồng ý, đã sửa spec chưa. -->
