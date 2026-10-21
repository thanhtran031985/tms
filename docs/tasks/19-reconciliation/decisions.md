# Quyết định 19-reconciliation

## Đã chốt
<!-- Quyết định đã chốt trước khi làm (nếu có), kèm ngày. -->
- Đơn vị đối soát khách hàng là container; container chưa có ePOD đã xác minh không vào kỳ; Order được đối soát từng phần theo container đã đủ chứng từ (16/10/2026, spec 01 mục 3; spec 05 mục 4; TICKET-12).
- Người xác nhận ePOD cuối cùng là con người, AI chỉ hỗ trợ (spec 01 mục 3).
- AP của cây xăng và nhà xe ngoài lập theo kỳ sau khi đối soát bảng kê, không ghi thẳng từng đơn (spec 05 mục 2, spec 04 mục 2.5).
- Import phải idempotent: import lại cùng file không tạo trùng (spec 04 mục 2.5).

**Còn mở, hỏi người dùng trước bước liên quan:**
- Bảng mới chưa có trong spec 02: `statement_mappings`, `statement_imports`, `statement_lines`, `vendor_bill_lines`, cột `order_containers.reconciled_at`, `statement_import_id` (bước 1).
- Spec 04 mục 2.5 nói "khớp hết thì tạo `vendor_bills`", còn thiết kế cho chốt sau khi đã xử lý hết dòng lệch (theo bảng kê hoặc giữ số hệ thống). task.md theo thiết kế: chốt khi mọi dòng đã có cách xử lý (bước 4).
- Thiết kế ghi ePOD có 2 bước (Điều vận xác nhận rồi Kế toán xác minh); spec 02 chỉ có `isHumanVerified`/`isEpodVerified`. Cần chốt "đã xác minh" là cột nào (bước 3).
- Thiết kế ghi "Kỳ đã khóa không sửa được, cần Admin mở lại"; spec 00 chỉ cho bút toán điều chỉnh ở kỳ mở, không nói mở lại kỳ (bước 4, liên quan task 21).
- Bước 1 và loại đối tác Cây xăng, Nhà xe ngoài nằm ở `Reconcile.dc.html` không có trong bộ khởi động (bước 5).

## Phát sinh khi làm
<!-- Chỗ làm khác task.md, spec hoặc thiết kế: lý do, ai đồng ý, đã sửa spec chưa. -->
