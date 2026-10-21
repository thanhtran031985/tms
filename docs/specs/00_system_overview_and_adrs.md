# Bức tranh Tổng thể Hệ thống (System Overview & ADRs)
Dự án: SaaS Logistics chuyên biệt về vận tải Container (Trucking TMS)

> Quy ước đánh dấu trong bộ spec bản rà soát: **[BỔ SUNG]** = ý mới thêm, **[SỬA]** = sửa lại so với bản gốc. Mục không đánh dấu là giữ nguyên.

## 1. Mô hình Tên miền (Domain Model & Glossary)
AI Developer: BẮT BUỘC sử dụng đúng các thuật ngữ này khi đặt tên biến, bảng, hàm và viết comments:
- **Tenant:** Một công ty vận tải khách hàng thuê phần mềm SaaS.
- **User / Membership [BỔ SUNG]:** Người dùng đăng nhập. Một User có thể thuộc nhiều Tenant qua `tenant_memberships`, mỗi membership có một Role (`OWNER`, `ADMIN`, `DISPATCHER`, `ACCOUNTANT`, `FLEET_MANAGER`, `DRIVER`, `VIEWER`).
- **FCL / LCL:** Full Container Load (Hàng nguyên cont) / Less than Container Load (Hàng lẻ). **[SỬA]** Phạm vi MVP chỉ hỗ trợ FCL; LCL ghi nhận là ngoài phạm vi để tránh AI tự sinh logic gom hàng lẻ.
- **Order (Đơn hàng) [SỬA]:** Yêu cầu vận chuyển của khách gắn với 1 số Booking (hàng Xuất) hoặc 1 số B/L (hàng Nhập), **chứa nhiều container**. Order giữ thông tin chung: khách hàng, hãng tàu, tàu/chuyến, cut-off, tuyến mặc định.
- **Order Container (Container của đơn) [BỔ SUNG]:** Từng vỏ cont trong một Order (bảng `order_containers`). Đây là đơn vị nhỏ nhất để điều xe, ghép TWIN_20, đảo vỏ, tính giá cước, DEM/DET, ePOD và nhận chi phí phân bổ. Doanh thu và lãi/lỗ của Order là tổng của các container.
- **Location (Địa điểm) [BỔ SUNG]:** Danh mục địa điểm vật lý có tọa độ và bán kính geofence: `PORT`, `DEPOT` (bãi rỗng), `WAREHOUSE` (kho khách), `FUEL_STATION`, `GARAGE`, `PARKING`.
- **Stop (Điểm dừng) / Leg (Chặng):** Các điểm dừng vật lý của một Order (`PICK_EMPTY`, `PICK_FULL`, `STUFFING`, `UNSTUFFING`, `PORT_IN`, `RETURN_EMPTY`, `DROP_TRAILER`, `HOOK_TRAILER`, `STREET_TURN`). **[SỬA]** Bổ sung `PICK_FULL` (lấy cont hàng Nhập tại cảng) và cặp `DROP_TRAILER` / `HOOK_TRAILER`. Leg là đoạn đường nối 2 Stop liên tiếp.
- **Consolidated Trip (Chuyến xe gom/kết hợp):** Một chuyến chạy thực tế của đầu kéo có thể thực hiện 1 cont đơn (`SINGLE`), kẹp đôi 2 cont 20ft (`TWIN_20`), hoặc kết hợp hàng 2 chiều Nhập - Xuất (`COMBINED`).
- **COMBINED vs Street Turn [SỬA]:** Hai khái niệm KHÁC NHAU, không được dùng lẫn. `COMBINED` là *chế độ chạy* (một chuyến làm cả chiều Nhập và chiều Xuất). *Street Turn* là *quan hệ giữa 2 Order* (vỏ của Order Nhập được dùng cho Order Xuất). Một chuyến COMBINED có thể có hoặc không có Street Turn.
- **Drop & Hook:** Nghiệp vụ tháo rơ moóc để lại kho/bãi, tài xế lái đầu kéo đi làm việc khác; sau đó một đầu kéo (có thể khác) quay lại móc (Hook) rơ moóc đi tiếp.
- **Street Turn (Đảo vỏ):** Tái sử dụng vỏ container vừa rút hàng Nhập để đóng hàng Xuất ngay tại kho hoặc khu vực lân cận mà không cần trả rỗng về cảng. **[BỔ SUNG]** Cần có chấp thuận của hãng tàu (thường kèm phí đảo vỏ / đổi lệnh).
- **DEM/DET (Demurrage & Detention):** Phí lưu bãi tại cảng (DEM) và phí lưu vỏ cont ngoài cảng (DET). **[BỔ SUNG]** Hai hạn miễn phí là hai mốc thời gian riêng (`demFreeUntil`, `detFreeUntil`), không gộp làm một.
- **Storage (Phí lưu kho bãi cảng) [BỔ SUNG]:** Phí cảng thu (khác DEM của hãng tàu), có thể phát sinh song song.
- **EIR (Equipment Interchange Receipt):** Phơi giao nhận vỏ container tại cảng/depot.
- **EDO / Lệnh cấp rỗng [BỔ SUNG]:** Lệnh giao hàng điện tử (hàng Nhập) / lệnh cấp container rỗng (hàng Xuất). Là điều kiện để xe được vào cảng/depot.
- **Cut-off [BỔ SUNG]:** Hạn chót hạ cont hàng Xuất vào cảng trước giờ tàu chạy.
- **ePOD (Electronic Proof of Delivery):** Bằng chứng giao hàng điện tử (chữ ký số, ảnh chụp chứng từ).
- **Chi hộ (Pass-through / Disbursement) [BỔ SUNG]:** Khoản nhà xe ứng trả thay khách (phí nâng hạ, phí cược vỏ, phí DEM/DET của hãng tàu...) rồi thu lại đúng số đó. Không phải doanh thu, xử lý thuế/hóa đơn khác cước vận chuyển.
- **Allocation (Phân bổ) [SỬA]:** Chia chi phí của 1 Consolidated Trip về các container (`order_containers`) mà chuyến chở. Hệ thống đề xuất theo định mức chi phí; **Kế toán có quyền sửa lại** số phân bổ trước khi khóa chi phí (xem file 06).
- **Accounting Period (Kỳ kế toán) [BỔ SUNG]:** Kỳ tháng có trạng thái `OPEN` / `CLOSED`. Kỳ đã khóa không cho sửa số liệu tài chính, chỉ cho bút toán điều chỉnh ở kỳ mở.

## 2. Các Quyết định Kiến trúc (Architecture Decision Records - ADRs)
Không được tự ý thay đổi các quyết định cốt lõi sau:
- **ADR-001 (Full-stack Framework) [SỬA]:** Sử dụng Next.js (App Router) + React 19. Dùng React Server Components (RSC) cho Dashboard/Báo cáo. Server Actions dùng cho mutation **của giao diện Web**. Mọi nghiệp vụ nằm trong tầng Service (`/modules/*/service.ts`) để Server Action và Route Handler (API cho mobile app, GPS, tích hợp) cùng gọi một chỗ. Server Action là endpoint POST công khai: mỗi action BẮT BUỘC tự kiểm tra session, tenant và quyền, không dựa vào việc nút bấm bị ẩn trên UI.
- **ADR-002 (Database & Polyglot Persistence):**
  - **MariaDB:** Lưu trữ dữ liệu Transactional đòi hỏi tính toàn vẹn ACID (Đơn hàng, Điều vận, Bảng giá, Kế toán, Công nợ). Sử dụng cột `JSON` cho metadata động (hình ảnh, kết quả OCR). **[BỔ SUNG]** Lưu ý: JSON trên MariaDB là alias của `LONGTEXT`, driver `mysql2` trả về chuỗi; phải parse + validate bằng `zod` ở tầng repository. Không dùng cột JSON cho dữ liệu cần lọc/join/tính tiền.
  - **Redis:** Lưu trữ dữ liệu Hot Path (Tọa độ GPS thời gian thực của đội xe) trước khi gom batch đẩy xuống MariaDB. **[BỔ SUNG]** Đồng thời là backend cho hàng đợi job (BullMQ) và cache phiên. Redis không phải nguồn sự thật cho dữ liệu tài chính.
  - **Object Storage [BỔ SUNG]:** Ảnh EIR/ePOD/phiếu dầu lưu trên S3-compatible storage, key có tiền tố `tenants/{tenantId}/...`, chỉ truy cập qua Signed URL có hạn.
- **ADR-003 (Multi-tenancy Isolation) [SỬA]:** Mọi bảng dữ liệu nghiệp vụ ĐỀU PHẢI CÓ cột `tenant_id`. Bắt buộc truyền `tenant_id` vào mọi mệnh đề `WHERE` trong Drizzle ORM. Vì MariaDB không có Row-Level Security, việc này được cưỡng chế bằng 3 lớp:
  1. Không import `db` trực tiếp trong `/modules`; chỉ dùng `getTenantDb(ctx)` / repository đã gắn sẵn `tenantId` lấy từ session (không bao giờ lấy `tenantId` từ input của client).
  2. Mọi `INSERT` tự gán `tenantId` từ context; mọi `UPDATE`/`DELETE` phải có điều kiện `tenant_id`.
  3. Test tích hợp bắt buộc cho mỗi repository: dữ liệu của Tenant A không đọc/sửa được bằng session Tenant B.
  - Mọi index và unique constraint nghiệp vụ bắt đầu bằng `tenant_id` (ví dụ `UNIQUE(tenant_id, plate_number)`).
  - Mọi key Redis và đường dẫn file có tiền tố tenant.
- **ADR-004 (Decoupled Assets):** Không bao giờ gán cứng Tài xế + Đầu kéo + Rơ moóc vào bảng `orders`. Tài nguyên phải được gán độc lập vào từng chặng (`dispatch_assignments`) và gom theo chuyến (`consolidated_trips`). **[SỬA]** `dispatch_assignments` là nguồn sự thật duy nhất về tài nguyên; các cột tài nguyên trên `consolidated_trips` chỉ là "tài nguyên kế hoạch chính" để hiển thị, được đồng bộ từ assignment và không được dùng để tính lương hay kiểm tra xung đột. Quan hệ Trip ↔ container đi qua bảng nối `trip_containers`.
- **ADR-005 (4D Hierarchical Rate & Fee Engine):** Bảng giá cước (`freight_tariffs`) và Bảng phí (`fee_tariffs`) được thiết kế theo ma trận 4 chiều: `Tuyến đường` + `Loại Cont` + `Chế độ chạy (SINGLE/TWIN_20/COMBINED)` + `Khách hàng (Riêng/Chung)`. **[BỔ SUNG]** Không được có 2 bản ghi cùng khóa 4 chiều (+ `feeCode` với bảng phí) có khoảng hiệu lực chồng lấn; kiểm tra khi lưu. Không tìm thấy giá → báo lỗi và yêu cầu nhập giá thủ công, KHÔNG mặc định 0.
- **ADR-006 (Ứng dụng Tài xế) [BỔ SUNG]:** App tài xế viết bằng React Native (Expo) + TypeScript, lưu offline bằng SQLite, dùng chung các schema `zod` với Web qua package `shared`. Lý do: cần lưu ảnh + hàng đợi thao tác offline bền vững, giữ EXIF ảnh và đồng bộ nền ổn định hơn PWA. App gọi REST API `/api/v1/driver/*` (không gọi Server Action).
- **ADR-007 (Background Jobs) [BỔ SUNG]:** Cron, flush GPS, OCR, tính DEM/DET, gửi thông báo chạy trong một **worker process Node riêng** (BullMQ trên Redis), không chạy trong request của Next.js. Mọi job phải idempotent (chạy lại không sinh trùng dữ liệu) và có retry + dead-letter.
- **ADR-008 (Thời gian, Tiền tệ, Định danh) [BỔ SUNG]:**
  - Lưu thời gian bằng `DATETIME(3)` theo **UTC**; hiển thị và cắt ngày theo múi giờ của tenant (mặc định `Asia/Ho_Chi_Minh`). Không dùng kiểu `TIMESTAMP` (giới hạn năm 2038 và tự đổi múi giờ theo session).
  - Tiền dùng `DECIMAL(18,2)` + cột `currency CHAR(3)` (mặc định `VND`); khi quy đổi phải snapshot `exchangeRate`. Không tính tiền bằng `number` của JS; dùng thư viện decimal (ví dụ `decimal.js`) trong tầng service.
  - Khóa chính dùng UUIDv7 (`CHAR(36)`) để giữ thứ tự chèn, tránh phân mảnh index.
- **ADR-009 (Dữ liệu tài chính bất biến) [BỔ SUNG]:** `driver_ledger`, `order_fees` đã duyệt, hóa đơn đã phát hành không bao giờ bị `UPDATE`/`DELETE`; sửa sai bằng bút toán đảo (reversal). Mọi thay đổi trên dữ liệu nghiệp vụ quan trọng ghi `audit_logs` (ai, lúc nào, giá trị trước/sau).

## 3. Phân hệ Hệ thống (System Modules)
0. **Identity & Tenant Admin [BỔ SUNG]:** Đăng nhập, quản lý người dùng, phân quyền theo Role, cấu hình tenant (múi giờ, phương pháp phân bổ, mẫu đánh số chứng từ), gói thuê bao SaaS.
1. **Master Data [BỔ SUNG]:** Khách hàng, Hãng tàu, Nhà cung cấp, Địa điểm (Location + geofence), Tuyến đường.
2. **Order Management:** Quản lý Đơn hàng theo Booking/Vận đơn với danh sách nhiều container, Hãng tàu, theo dõi hạn miễn phí DEM/DET từng cont, cut-off, tình trạng EDO/lệnh cấp rỗng.
3. **Dispatching & Consolidation:** Kanban kéo thả điều vận, ghép cặp 2 cont 20ft, kết hợp cont 2 chiều, bắn xe ngoài (Sub-contracting).
4. **Fleet & Maintenance:** Quản lý Đầu kéo, Rơ moóc, Tài xế, Lốp xe và lịch bảo dưỡng tự động theo Odometer. **[BỔ SUNG]** Theo dõi hạn giấy tờ (đăng kiểm, bảo hiểm, GPLX, phù hiệu) và chặn điều xe khi hết hạn.
5. **Fuel & Cost Control:** Cấp phiếu đổ dầu công nợ tại cây xăng đối tác, kiểm soát định mức tiêu hao (L/100km), duyệt chi phí dọc đường, tạm ứng tài xế.
6. **Tracking & Telemetry:** Bản đồ vị trí đội xe thời gian thực (Redis), lịch sử hành trình (MariaDB Partitioned) và Geofencing tự động.
7. **Billing, Tariffs & Reconciliation:** Tính giá/phí tự động theo ma trận 4 chiều, phân bổ chi phí chuyến ghép, đối soát công nợ Khách hàng/Cây xăng/Nhà xe ngoài và quyết toán Sổ cái lương tài xế. **[BỔ SUNG]** Xuất hóa đơn (kết nối nhà cung cấp hóa đơn điện tử), quản lý thanh toán, khóa kỳ.
8. **Driver App [BỔ SUNG]:** Nhận lệnh, check-in từng Stop, chụp chứng từ, nhập phiếu dầu, khai chi phí dọc đường, xem sổ lương. Hoạt động offline.
9. **Reporting [BỔ SUNG]:** P&L theo Order / Khách hàng / Xe / Tài xế, tỷ lệ chạy rỗng, hiệu suất sử dụng xe, công nợ quá hạn.
10. **Notifications [BỔ SUNG]:** Cảnh báo trong app + gửi ra ngoài (email, Zalo/SMS) cho các sự kiện: sắp hết free time, sắp cut-off, giấy tờ sắp hết hạn, vượt định mức dầu.

## 4. Ngoài Phạm vi MVP [BỔ SUNG]
Ghi rõ để AI không tự sinh: hàng LCL, tối ưu tuyến tự động (route optimization), cổng khách hàng tự đặt đơn, tích hợp trực tiếp ePort của cảng (giai đoạn sau, thiết kế sẵn interface adapter), đa ngôn ngữ ngoài tiếng Việt.
