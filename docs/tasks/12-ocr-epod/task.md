# 12-ocr-epod — OCR chứng từ và xác nhận ePOD

> Giai đoạn: GĐ3 · Phụ thuộc: 10 · Nhánh git: `feat/12-ocr-epod`
> Nguồn: `docs/specs/07_implementation_tickets.md` TICKET-12; spec `05_advanced_workflows_and_ai.md` mục 4 (OCR, quy tắc so khớp, con người quyết định cuối, xử lý lỗi, dữ liệu cá nhân, bộ test OCR); spec `01_core_architecture_and_grill_logs.md` mục 3 ("Tại sao khóa cứng điều kiện is_epod_verified"); spec `00_system_overview_and_adrs.md` ADR-002, ADR-007; spec `06_hierarchical_pricing_and_fees.md` mục 5 (đối soát, xuất hóa đơn từng phần theo container); spec `08_nonfunctional_security_ops.md` mục 2 (dữ liệu cá nhân, bí mật), mục 4 (chi phí gọi AI); spec `02_database_schema.md` bảng `attachments`, `order_stops`, `order_containers`, `orders`; PRD `docs/PRD.md` mục C7, D, F7

## Mục tiêu
Sau task này, mỗi ảnh EIR tài xế chụp được AI đọc số cont, số seal, loại cont, giờ EIR và biển số trong nền, rồi tự đối chiếu với container của Stop. Kế toán và Điều vận mở hàng đợi duyệt, bấm xác nhận nhanh nhóm "AI đã khớp" và xử lý tay nhóm lệch hoặc lỗi; OCR hỏng không bao giờ chặn được việc duyệt tay. Container chỉ được tính là đủ chứng từ khi con người xác nhận, và Order chỉ sang `RECONCILED` khi mọi container còn hiệu lực đã đủ chứng từ.

## Phạm vi
**Làm:**
- Interface `VisionOcrProvider` trong `packages/core/lib/ai`, một implementation Gemini và một provider giả cho test.
- Job `ocr.process` trong worker (BullMQ), đẩy vào hàng đợi khi ảnh EIR được xác nhận, không gọi đồng bộ trong request; retry có backoff, lỗi hẳn thì `FAILED` và vào hàng đợi duyệt tay.
- Trích xuất EIR `{ containerNo, sealNo, containerType, eirDateTime, plateNumber }` kèm `confidence` từng trường, lưu `model` và `promptVersion` trong `attachments.ocrResult`.
- Chuẩn hóa `containerNo` và kiểm tra check digit ISO 6346; sai check digit thì `LOW_CONFIDENCE`.
- So khớp với `order_containers` của Stop: khớp tuyệt đối `containerNo` + `sealNo` và mọi trường có confidence ≥ ngưỡng (mặc định 0.9) thì `MATCHED` và `orderStops.isAiVerified = true`; lệch thì `MISMATCH` vào hàng đợi duyệt tay kèm ảnh và giá trị hai bên.
- Container hàng Xuất chưa có `containerNo`: OCR đề xuất điền, người dùng xác nhận.
- Hàng đợi duyệt tay: nhóm "AI đã khớp" xác nhận nhanh, nhóm lệch, nhóm lỗi; người xác nhận ghi `isHumanVerified`.
- `order_containers.isEpodVerified` theo từng container, `orders.isEpodVerified` tổng hợp; chặn Order sang `RECONCILED` khi `isEpodVerified === false`, cho đối soát từng phần theo container đã đủ chứng từ.
- Giới hạn chi phí gọi API theo tenant mỗi ngày; tenant được tắt OCR; cấu hình nhà cung cấp không dùng dữ liệu để huấn luyện.
- Bộ ảnh mẫu đã gán nhãn và lệnh đo độ chính xác mỗi khi đổi model hoặc prompt.
- Khối chứng từ EIR/ePOD trong chi tiết container của màn Đơn hàng.

**Không làm (thuộc task khác):**
- OCR ảnh trụ bơm và đồng hồ odometer, dung sai số lít, tiền, odometer (task 15); task này làm job và interface chung để task 15 thêm loại ảnh.
- Đối soát với khách hàng và split-view (task 19), xuất hóa đơn từng phần (task 21); task này chỉ cung cấp cờ `isEpodVerified` theo container và chặn chuyển trạng thái Order.
- Chụp và tải ảnh trên app (task 10, task 11).
- Gửi thông báo về ảnh lệch ra email/Zalo (task 23).
- Điều khoản xử lý dữ liệu cá nhân trong hợp đồng SaaS (việc pháp chế, không phải code); task này chỉ có cờ tắt OCR và cấu hình provider.

## Thiết kế
- `designs/components/Screen04-Orders/` (đọc README.md và preview.html; phần chi tiết container có khối chứng từ EIR/ePOD; 4 trạng thái: Bình thường; Đang tải là dòng xương; Trống nói lý do và một hành động; Lỗi giữ dữ liệu cũ và nút "Thử lại").
- `designs/components/Screen09-DriverApp/` (đọc README.md; nơi tài xế chụp EIR, ePOD, Seal; task này không đổi giao diện app, chỉ đọc để hiểu loại ảnh và luồng).
- Hàng đợi duyệt chứng từ chưa có màn thiết kế riêng: dựng bằng `designs/components/WorkTable/`, `designs/components/FilterTabs/` (AI đã khớp · Lệch · Lỗi OCR · Chưa đọc), `designs/components/StatusChip/`, `designs/components/Alert/`, `designs/components/EmptyState/`, `designs/components/Button/`; đủ 4 trạng thái; ghi phần tự quyết vào `decisions.md`.
- Số cont, số seal, biển số dùng `--font-mono`, không cắt ngắn.

## Quyết định kiến trúc
- `VisionOcrProvider` ở `packages/core/lib/ai/vision-ocr.ts` (interface), `gemini.ts` (implementation), `fake.ts` (test). Khóa API trong secret manager hoặc biến môi trường, không commit (spec 08 mục 2). Cấu hình provider tắt dùng dữ liệu để huấn luyện.
- Job `ocr.process` ở `apps/worker/src/jobs/ocr-process.ts`, gọi `packages/core/modules/orders/epod.service.ts`. Job idempotent theo `attachmentId` (chạy lại không đổi kết quả đã có người xác nhận), retry có backoff, dead-letter (ADR-007).
- Kết quả OCR là JSON trong `attachments.ocrResult`, parse và validate bằng zod ở repo (ADR-002); không dùng cột JSON để lọc, trạng thái dùng `attachments.ocrStatus` (`NONE`, `PENDING`, `MATCHED`, `MISMATCH`, `LOW_CONFIDENCE`, `FAILED`).
- Chuẩn hóa `containerNo`: bỏ khoảng trắng, chữ hoa, kiểm tra check digit ISO 6346 bằng hàm của task 04 (không viết lại).
- Ngưỡng confidence mặc định 0.9, cấu hình theo tenant trong `tenants.settings` (validate zod); cờ `ocrEnabled` trong `tenants.settings`, tắt thì ảnh vào thẳng hàng đợi duyệt tay với `ocrStatus = 'NONE'`.
- Giới hạn chi phí: đếm số lần gọi theo tenant và ngày (theo múi giờ tenant) bằng Redis key `tenant:{tenantId}:ocr:count:{yyyy-mm-dd}`; vượt giới hạn thì không gọi provider, ảnh vào hàng đợi duyệt tay; ghi metric chi phí gọi AI theo tenant (spec 08 mục 4).
- Con người quyết định cuối: `order_stops.isHumanVerified = true` chỉ do người có quyền bấm; `order_containers.isEpodVerified` = mọi Stop `requiresProof = true` của container đã có chứng từ và `isHumanVerified = true`, ghi `epodVerifiedBy`, `epodVerifiedAt`; `orders.isEpodVerified` = mọi container chưa `CANCELLED` đã xác nhận. Tính lại trong cùng transaction mỗi khi xác nhận hoặc bỏ xác nhận.
- Chặn `RECONCILED`: thêm điều kiện vào bảng chuyển trạng thái Order của task 04; vi phạm trả `EPOD_NOT_VERIFIED` (mã mới, thêm vào `packages/shared`).
- Đề xuất số cont cho hàng Xuất: ghi giá trị đề xuất trong `ocrResult`, chỉ điền vào `order_containers.containerNo` khi người dùng xác nhận; số trùng container khác trong tenant thì chặn.
- Quyền: xác nhận chứng từ và đề xuất số cont dùng `requireRole(['ACCOUNTANT', 'DISPATCHER', 'ADMIN'])` theo ma trận `modules/identity/permissions.ts` (spec 01 mục 3: Kế toán hoặc Điều vận xác nhận). Mọi Server Action validate zod.
- Audit trong cùng transaction: xác nhận, bỏ xác nhận, điền số cont, đổi `isEpodVerified` của container và Order.
- Ảnh xem qua Signed URL hạn ngắn, kiểm tra quyền trước khi cấp. Không log nội dung ảnh hay kết quả OCR có biển số, chữ ký.

## Các bước
### Bước 1 — Interface OCR và quy tắc so khớp
- Viết trước test trong `packages/core/modules/orders/epod-match.test.ts`: chuẩn hóa `containerNo` có khoảng trắng, chữ thường; sai check digit ra `LOW_CONFIDENCE`; khớp `containerNo` + `sealNo` và mọi confidence ≥ 0.9 ra `MATCHED`; một trường dưới ngưỡng ra `LOW_CONFIDENCE`; lệch seal ra `MISMATCH`; container chưa có số thì ra đề xuất.
- Viết `lib/ai/vision-ocr.ts`, `lib/ai/fake.ts` và hàm thuần `matchEir` trong `epod-match.ts`.
**Kiểm tra:** `pnpm test --filter core -- epod-match` xanh.

### Bước 2 — Job `ocr.process` trong worker
- Test trước (Testcontainers MariaDB + Redis, provider giả): xác nhận ảnh EIR đẩy đúng 1 job; job ghi `ocrResult` có `model`, `promptVersion`, đặt `ocrStatus`, `isAiVerified`; provider lỗi tạm thời thì retry, lỗi hẳn thì `FAILED` và ảnh nằm trong hàng đợi duyệt tay; tenant tắt OCR thì không gọi provider; vượt giới hạn ngày thì không gọi provider; chạy job 2 lần không đổi kết quả đã được người xác nhận.
- Viết `apps/worker/src/jobs/ocr-process.ts`, đăng ký hàng đợi, nối vào bước xác nhận ảnh của task 10.
**Kiểm tra:** `pnpm test --filter worker -- ocr-process` xanh; chạy `pnpm dev`, tải 1 ảnh EIR mẫu qua API tài xế, trong vòng 30 giây `attachments.ocrStatus` khác `PENDING`.

### Bước 3 — Provider Gemini và bộ ảnh mẫu
- Viết `lib/ai/gemini.ts` (prompt có `promptVersion`, đầu ra validate zod), cấu hình không dùng dữ liệu để huấn luyện.
- Tạo `packages/core/test-fixtures/ocr/` với ảnh EIR đã gán nhãn của các cảng/depot chính (ảnh do người dùng cung cấp, đã che thông tin cá nhân) và lệnh `pnpm ocr:eval` in độ chính xác từng trường và tỷ lệ `MATCHED` đúng.
**Kiểm tra:** `pnpm ocr:eval` chạy hết bộ ảnh và in bảng độ chính xác; ghi kết quả vào Nhật ký; nếu PO chưa chốt ngưỡng thì ghi "chờ PO chốt ngưỡng" vào `decisions.md` và không đánh dấu bước xong.

### Bước 4 — Xác nhận ePOD và chặn `RECONCILED`
- Test trước trong `epod.test.ts`: container 2 Stop `requiresProof` mới xác nhận 1 Stop thì chưa `isEpodVerified`; xác nhận đủ thì `true` và ghi người, giờ; Order 3 container, 1 container `CANCELLED`, 2 container đã xác nhận thì `orders.isEpodVerified = true`; Order chưa đủ chuyển `RECONCILED` bị chặn `EPOD_NOT_VERIFIED`; xác nhận được dù OCR `FAILED`; đề xuất số cont hàng Xuất chỉ điền khi người dùng xác nhận; role `VIEWER` và `DRIVER` bị từ chối; test tenant isolation cho repo mới.
- Viết `epod.service.ts` (`verifyStopProof`, `unverifyStopProof`, `confirmContainerNoSuggestion`, `recomputeEpodFlags`) và sửa bảng chuyển trạng thái Order.
**Kiểm tra:** `pnpm test --filter core -- epod` xanh, gồm ca "OCR lỗi không chặn được quy trình duyệt tay".

### Bước 5 — Màn hàng đợi duyệt chứng từ
- `apps/web/src/features/orders/epod-review/` và route `apps/web/src/app/(tenant)/orders/epod-review/page.tsx`: tab AI đã khớp · Lệch · Lỗi OCR · Chưa đọc có đếm số; mỗi dòng có ảnh thu nhỏ, giá trị OCR và giá trị hệ thống cạnh nhau, chỗ lệch tô `crit` kèm icon và chữ; xác nhận nhanh nhiều dòng nhóm "AI đã khớp"; xác nhận tay từng dòng; đủ 4 trạng thái.
- Server Action `requireRole` + zod, trả `{ ok, code, message }`.
**Kiểm tra:** mở `/orders/epod-review` trên 1440×900 và 1366×768 với dữ liệu seed: chọn 3 dòng "AI đã khớp" bấm xác nhận, 3 container đổi chip; `pnpm e2e -- epod-review` xanh.

### Bước 6 — Chứng từ trong chi tiết container
- Trong chi tiết container của màn Đơn hàng (`apps/web/src/features/orders/`): danh sách Stop cần chứng từ, ảnh EIR/ePOD qua Signed URL, chip trạng thái OCR, chip "Đủ chứng từ" hoặc "Thiếu chứng từ"; đề xuất số cont cho hàng Xuất với nút xác nhận; tổng hợp `isEpodVerified` ở đầu Order.
**Kiểm tra:** mở `/orders/{id}` trên 1440×900 so với `Screen04-Orders/preview.html`: khối chứng từ đúng vị trí, màu luôn kèm icon và chữ; nút chuyển Order sang `RECONCILED` bị khóa kèm lý do khi còn container thiếu chứng từ.

### Bước 7 — Hoàn tất
- Chạy toàn bộ kiểm tra, cập nhật progress.md, đổi trạng thái task trong `docs/tasks/README.md`, cập nhật spec 05 mục 4 và spec 02 cho các chỗ đã chốt.
**Kiểm tra:** `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` không lỗi; `pnpm e2e` cho luồng duyệt chứng từ; migration (nếu có) chạy trên DB trống và DB có dữ liệu; mọi repo mới có test tenant isolation; mọi Server Action có `requireRole` và zod; đạt "Chấp nhận khi" của ticket: bộ ảnh mẫu đạt ngưỡng chính xác do PO chốt; OCR lỗi không chặn được quy trình duyệt tay.
