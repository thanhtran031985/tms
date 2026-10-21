# Nghiệp vụ Nâng cao, Xử lý Sự cố & Tự động hóa AI OCR

## 1. Cứu hộ Dọc đường (Mid-trip Breakdown & Re-dispatch)
Khi đầu kéo gặp sự cố hỏng máy giữa đường trên một chặng (order_stops):

1. **[BỔ SUNG]** Tạo bản ghi `incidents` (`type = 'BREAKDOWN'`) kèm vị trí GPS hiện tại và ảnh.
2. Cập nhật bản ghi `dispatch_assignments` hiện tại sang trạng thái `ABORTED_MIDWAY` và ghi nhận `completionPercentage` (VD: đã chạy được 40% quãng đường). **[SỬA]** Giá trị đề xuất tự động = km GPS đã chạy từ Stop trước / `route.standardDistanceKm`, Điều vận được sửa và hệ thống ghi audit.
3. Đổi trạng thái Đầu kéo cũ sang `MAINTENANCE` và **[BỔ SUNG]** tạo `maintenance_orders` (`type = 'BREAKDOWN'`) để chặn điều xe này đến khi sửa xong.
4. Tạo một bản ghi `dispatch_assignments` mới trên cùng `stopId` với trạng thái `RESCUE_ASSIGNED` cho Đầu kéo mới và Tài xế mới đến kéo tiếp Rơ moóc đó. **[BỔ SUNG]** `replacesAssignmentId` trỏ về assignment cũ; áp đầy đủ kiểm tra khóa & xung đột của file 03 mục 1; `completionPercentage` của assignment mới = 100 − phần của assignment cũ (tổng các assignment trên một stop phải bằng 100, kiểm tra trong transaction).
5. Khi hoàn tất chuyến, tiền lương chuyến (`TRIP_SALARY`) được chia tự động vào `driver_ledger` cho 2 tài xế theo tỷ lệ `completionPercentage`. **[BỔ SUNG]** Làm tròn đến đơn vị đồng, phần dư dồn cho tài xế hoàn tất chuyến để tổng khớp đúng định mức.
6. **[BỔ SUNG]** Chi phí cứu hộ (xe cẩu, garage, đầu kéo đi cứu chạy rỗng) ghi vào `trip_costs` với `feeCode = 'RESCUE'`, không tính vào doanh thu khách trừ khi hợp đồng quy định.
7. **[BỔ SUNG]** Nếu Order có hạn cut-off / free time sắp hết, hệ thống đẩy cảnh báo ưu tiên cho Điều vận.

## 2. Nghiệp vụ Bắn Xe Ngoài (Sub-contracting)
Khi đội xe nhà quá tải, Điều vận chọn chế độ `assignmentType = 'SUB_CONTRACTOR'` và chọn nhà xe đối tác (`subcontractorVendorId`) cùng mức giá thuê thỏa thuận (`agreedSubcontractCost`).

- Hệ thống tự động bỏ qua: kiểm tra trạng thái xe nội bộ, cấp phiếu dầu, và tính lương tài xế.
- **[BỔ SUNG]** Vẫn bắt buộc nhập biển số và tên tài xế nhà xe ngoài (cần cho cổng cảng, EIR và đối chiếu OCR).
- **[BỔ SUNG]** Nhà xe ngoài phải nộp chứng từ (EIR/ePOD) như xe nhà. Cách nộp: Điều vận tải lên hộ, hoặc gửi link một lần (magic link có hạn, chỉ xem và nộp ảnh cho đúng các container được giao) — không cấp tài khoản đầy đủ.
- **[BỔ SUNG]** Giá thuê có thể lấy gợi ý từ bảng giá nhà xe ngoài (mở rộng `fee_tariffs` với `feeCode = 'SUBCONTRACT'` + vendor) — giai đoạn sau; MVP nhập tay.
- Khi đơn hàng hoàn thành, `agreedSubcontractCost` được ghi vào `trip_costs` (`ACTUAL`, `SUBCONTRACT`) và gom vào `vendor_bills` (Công nợ phải trả AP) của nhà xe đối tác theo kỳ đối soát. **[SỬA]** Không ghi "thẳng" vào AP từng đơn; AP được lập theo kỳ sau khi đối soát bảng kê của nhà xe (giống luồng cây xăng file 04 mục 2.5).
- **[BỔ SUNG]** Phát sinh ngoài giá thỏa thuận (nâng hạ, chờ đợi) do nhà xe ngoài báo → nhập `trip_expenses` có duyệt.

## 3. Đồng bộ Offline tại Cảng (Offline-first Timestamp Sync)
Khu vực cảng biển thường xuyên mất sóng 4G. Mobile App của tài xế (ADR-006) phải lưu thao tác bấm nút và ảnh chụp vào bộ nhớ cục bộ (SQLite) kèm timestamp thực tế tại thời điểm thao tác (`occurredAt`).

Khi xe ra khỏi cảng và có mạng lại, App đồng bộ lên Server (ghi nhận `syncedAt`).

**[BỔ SUNG] Giao thức đồng bộ:**
- Mỗi thao tác là một sự kiện `{ clientEventId (UUID), type, stopId, occurredAt, deviceMonotonicMs, lat, lng, payload }` trong hàng đợi outbox cục bộ; gửi theo đúng thứ tự tạo.
- Server xử lý idempotent theo `clientEventId` (gửi lại không sinh trùng) và trả kết quả từng sự kiện.
- Ảnh upload riêng, có thể tiếp tục khi đứt mạng (resumable / presigned multipart), sự kiện tham chiếu ảnh bằng `sha256`.
- **Xung đột:** nếu Điều vận đã sửa/hủy Stop trong lúc tài xế offline, sự kiện của tài xế không ghi đè; server trả `CONFLICT` và app hiển thị cho tài xế, đồng thời tạo cảnh báo cho Điều vận.
- **Chuyển trạng thái hợp lệ:** server từ chối sự kiện sai thứ tự Stop (ví dụ `COMPLETED` Stop 3 khi Stop 2 còn `PENDING`), trừ khi Điều vận cho phép bỏ qua.
- App tự lấy giờ chuẩn từ server mỗi khi có mạng và lưu độ lệch đồng hồ (`clockSkewMs`) để gửi kèm sự kiện.

**Quy tắc bắt buộc:** Mọi logic kiểm tra trễ giờ đóng/hạ bãi hoặc tính giờ chờ lưu ca (Detention) tại kho khách BẮT BUỘC tính toán dựa trên `occurredAt`. **[SỬA]** Thay vì chỉ đối chiếu EXIF (EXIF có thể bị sửa hoặc bị hệ điều hành xóa), dùng thứ tự tin cậy:
1. Thời điểm geofence từ GPS thiết bị gắn xe (`timeSource = 'GEOFENCE'`) — tin cậy nhất vì không qua điện thoại tài xế.
2. `occurredAt` từ app đã hiệu chỉnh `clockSkewMs`.
3. EXIF của ảnh.

Nếu (2) lệch (1) quá 15 phút → gắn cờ `TIME_MISMATCH`, mặc định dùng (1), Điều vận xem xét.

**[BỔ SUNG] Tính giờ chờ (Detention tại kho khách):** `waitingMinutes = departedAt − max(arrivedAt, windowStart)`; trừ thời gian miễn phí theo hợp đồng khách (cấu hình phí `WAITING_FEE` theo `calcBasis = 'PER_DAY'` hoặc theo giờ); phần vượt sinh `order_fees` loại `REVENUE_SURCHARGE` ở trạng thái chờ duyệt.

## 4. Tích hợp AI Vision OCR (Tự động duyệt Chứng từ & Đồng hồ Dầu)
Khi tài xế tải ảnh phơi EIR hoặc ảnh trụ bơm xăng/Odometer lên Object Storage, **[SỬA]** đẩy job `ocr.process` vào hàng đợi (không gọi đồng bộ trong request) để đọc ảnh qua Vision LLM. Provider truy cập qua interface `VisionOcrProvider` trong `lib/ai` (Gemini là một implementation).

**[SỬA] Quy tắc so khớp.** "Khớp 100%" / "sai lệch bằng 0" quá cứng với OCR và sẽ khiến gần như mọi ảnh rơi vào duyệt tay. Áp dụng:
- Kết quả OCR luôn kèm `confidence` từng trường; lưu `model` và `promptVersion` trong `attachments.ocrResult` để truy vết.
- **Ảnh Phơi EIR:** Trích xuất `{ containerNo, sealNo, containerType, eirDateTime, plateNumber }`.
  - `containerNo` chuẩn hóa (bỏ khoảng trắng, chữ hoa) và **kiểm tra check digit ISO 6346**; sai check digit → `LOW_CONFIDENCE`.
  - Khớp tuyệt đối `containerNo` + `sealNo` và mọi trường có confidence ≥ ngưỡng (mặc định 0.9) → `ocrStatus = 'MATCHED'`, `orderStops.isAiVerified = true`.
  - Đối chiếu với `order_containers` của Stop đó. Nếu container chưa có `containerNo` (hàng Xuất lấy rỗng) → OCR đề xuất điền, người dùng xác nhận.
  - Lệch → `MISMATCH`, đưa vào hàng đợi duyệt tay kèm ảnh và giá trị hai bên.
- **Ảnh Đổ dầu:** Trích xuất `{ odometerReading, volumeLiters, totalAmount, pricePerLiter }`. Đối chiếu với số tài xế nhập tay với dung sai: số lít ±0,1 L, tiền ±1.000đ, odometer khớp tuyệt đối. Trong dung sai và confidence đạt ngưỡng → đánh dấu hợp lệ để Kế toán duyệt nhanh (duyệt hàng loạt), nhưng **không tự động duyệt chi tiền**.
- **[BỔ SUNG] Con người là người quyết định cuối:** `order_containers.isEpodVerified` = mọi Stop của container đó có `requiresProof = true` đều có chứng từ và `isHumanVerified = true`. **[SỬA]** `orders.isEpodVerified` = mọi container chưa hủy của Order đều đã xác nhận; Kế toán có thể đối soát/xuất hóa đơn từng phần theo container đã đủ chứng từ. Stop có `isAiVerified = true` được hiển thị nhóm "AI đã khớp" để người duyệt bấm xác nhận nhanh.
- **[BỔ SUNG] Xử lý lỗi:** job OCR có retry với backoff; lỗi hẳn → `FAILED` và vào hàng đợi duyệt tay. Giới hạn chi phí gọi API theo tenant/ngày.
- **[BỔ SUNG] Dữ liệu cá nhân:** ảnh có thể chứa mặt người, biển số, chữ ký. Trước khi gửi ảnh tới nhà cung cấp AI bên ngoài phải: có điều khoản trong hợp đồng SaaS về xử lý dữ liệu cá nhân theo quy định hiện hành; cấu hình nhà cung cấp không dùng dữ liệu để huấn luyện; tenant được quyền tắt OCR.
- **[BỔ SUNG] Bộ test OCR:** lưu bộ ảnh mẫu đã gán nhãn (EIR của các cảng/depot chính, đồng hồ trụ bơm nhiều loại) để đo độ chính xác mỗi khi đổi model hoặc prompt.

## 5. Tính phí DEM/DET tự động [BỔ SUNG]
(Bản gốc chỉ nêu "cron 00:01 quét đơn quá hạn freeTimeEnd tạo phụ phí".)
- Job chạy hằng ngày theo **múi giờ của tenant**, mỗi tenant một job.
- **DEM** (hàng Nhập): tính từ `demFreeUntil` đến khi Stop `PICK_FULL` hoàn tất. **DET:** từ `detFreeUntil` đến khi Stop `RETURN_EMPTY` (hoặc đảo vỏ sang đơn Xuất) hoàn tất. **Storage** tương tự theo `storageFreeUntil`.
- Số tiền tính theo biểu lũy tiến `dem_det_tariffs` (ngày 1–5 giá A, ngày 6–10 giá B...).
- Idempotent: mỗi ngày phát sinh một dòng `order_fees` với `idempotencyKey = 'DET:{orderContainerId}:{yyyy-mm-dd}'` hoặc cập nhật một dòng "dự tính" duy nhất cho đến khi chốt — chọn **một dòng dự tính** cập nhật hằng ngày, chốt số khi cont đã trả/lấy, để tránh hàng chục dòng phí mỗi cont. **[SỬA]** DEM/DET luôn tính **theo từng container** (`order_containers.demFreeUntil/detFreeUntil`), vì các cont cùng một Order thường được lấy/trả vào những ngày khác nhau.
- Phân loại: DEM/DET của hãng tàu là `PASS_THROUGH` (thu hộ theo hóa đơn hãng tàu), chỉ ghi nhận số tiền dự tính để cảnh báo; số chính thức lấy theo hóa đơn hãng tàu khi nhập.
- Ai chịu phí: nếu chậm do nhà xe (ví dụ chậm điều xe) thì Điều vận đánh dấu `chargeTo = COMPANY` để không tính cho khách.
- Cảnh báo trước: 48 giờ và 24 giờ trước khi hết free time / cut-off, gửi thông báo cho Điều vận (và khách nếu bật).
