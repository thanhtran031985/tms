# Quyết định 18-dem-det-fees

## Đã chốt
<!-- Quyết định đã chốt trước khi làm (nếu có), kèm ngày. -->
- DEM/DET tính theo từng container (`order_containers.demFreeUntil/detFreeUntil`), không theo Order, vì các cont cùng Order lấy/trả khác ngày (16/10/2026, spec 01 mục 3, spec 05 mục 5).
- Mỗi container mỗi loại phí giữ một dòng dự tính cập nhật hằng ngày, chốt số khi cont đã lấy/trả, không sinh mỗi ngày một dòng (spec 05 mục 5, spec không ghi ngày).
- DEM/DET của hãng tàu là `PASS_THROUGH`, chỉ ghi số dự tính để cảnh báo; số chính thức theo hóa đơn hãng tàu (spec 05 mục 5).
- Chậm do nhà xe thì Điều vận đánh dấu `chargeTo = COMPANY` để không tính cho khách (spec 05 mục 5).
- Cảnh báo 48 giờ và 24 giờ trước khi hết free time / cut-off (spec 05 mục 5).

**Còn mở, hỏi người dùng trước bước liên quan:**
- Spec 05 mục 5 vừa đưa ví dụ khóa theo ngày `'DET:{orderContainerId}:{yyyy-mm-dd}'` vừa chọn một dòng dự tính duy nhất. task.md theo lựa chọn một dòng, khóa `'{DEM|DET|STORAGE}:{orderContainerId}'` (bước 3).
- Thêm cột `order_fees.estimate_status` và `order_fees.charge_to` (spec 02 chưa có `chargeTo` trên `order_fees`) (bước 1).
- Storage là phí cảng, không phải của hãng tàu: biểu phí Storage dùng `dem_det_tariffs` với `shippingLineId = NULL` hay cần khóa theo cảng (`locations`) (bước 1).
- Khi task 23 chưa xong, cảnh báo 48h/24h chỉ nằm trong hàng đợi và danh sách cảnh báo trong app; chưa gửi email/Zalo (bước 4).

## Phát sinh khi làm
<!-- Chỗ làm khác task.md, spec hoặc thiết kế: lý do, ai đồng ý, đã sửa spec chưa. -->
