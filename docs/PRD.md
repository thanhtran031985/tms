# Đặc tả chức năng: Phần mềm điều hành vận tải container (TMS)

*Phiên bản 1.0, 21/10/2026.*
*Bản này gom spec `docs/specs/00–08` và thiết kế `designs/` thành một mô tả chức năng. Khi khác nhau, spec là gốc cho nghiệp vụ và dữ liệu, `designs/` là gốc cho hiển thị.*

**Những quyết định đã chốt:**
- **1 Order chứa nhiều container** (chốt 16/10/2026). Order là một Booking (hàng Xuất) hoặc một B/L (hàng Nhập). Container là đơn vị để điều xe, tính giá, tính DEM/DET, xác nhận ePOD và nhận chi phí phân bổ.
- **Chi phí chuyến mặc định phân bổ theo định mức, Kế toán được sửa** (chốt 16/10/2026). Hệ thống đề xuất, Kế toán chỉnh, tổng luôn phải khớp.
- **Giao diện hướng xanh dương** (chốt 21/10/2026): Swiss tối giản kết hợp Flat, mặt trắng, viền mảnh, cam cho cảnh báo, xanh lá cho hoàn thành.

**Ký hiệu dùng trong tài liệu:**
- **[GĐ0]** đến **[GĐ6]**: giai đoạn xây dựng, khớp PHASE 0–6 trong `docs/specs/07_implementation_tickets.md` (xem Phần I).
  - GĐ0 nền tảng; GĐ1 danh mục và đơn hàng; GĐ2 đội xe và điều vận; GĐ3 app tài xế và chứng từ; GĐ4 GPS, geofence và dầu; GĐ5 chi phí, phân bổ, lương và công nợ; GĐ6 báo cáo, thông báo và vận hành.
- **Vai trò viết tắt:** **CS** Chủ công ty (`OWNER`), **QT** Quản trị (`ADMIN`), **ĐV** Điều vận (`DISPATCHER`), **KT** Kế toán (`ACCOUNTANT`), **ĐX** Quản lý đội xe (`FLEET_MANAGER`), **TX** Tài xế (`DRIVER`), **XEM** Chỉ xem (`VIEWER`).
- **(chưa thiết kế)**: màn có trong spec nhưng chưa có trong `designs/components/`. Danh sách đầy đủ ở Phần J.

**Mục lục:** A. Tổng quan và vai trò · B. Yêu cầu giao diện · C. Màn hình web · D. App tài xế · E. Danh mục và quản trị · F. Quy tắc nghiệp vụ · G. Cơ sở dữ liệu · H. Công nghệ và quy trình · I. Giai đoạn xây dựng · J. Đoạn mô tả cho Claude Design

---

## Phần A. Tổng quan, người dùng và vai trò

### A1. Sản phẩm làm gì

TMS là phần mềm cho thuê (SaaS) dành cho công ty vận tải container đường bộ; mỗi công ty thuê là một **tenant**. Hệ thống phục vụ trọn vòng đời lô hàng nguyên container (FCL): nhận Order theo Booking hoặc B/L gồm nhiều container; tra giá 4 chiều cho từng container; điều xe trên Kanban, ghép TWIN_20, COMBINED, Street Turn, Drop & Hook, cứu hộ, thuê xe ngoài; tài xế chạy chuyến bằng app kể cả khi mất sóng; GPS và geofence ghi giờ đến, rời, giờ chờ; Kế toán duyệt dầu và chi phí, phân bổ chi phí chuyến, đối soát, lương, hóa đơn, khóa kỳ; báo cáo lãi lỗ và cảnh báo mốc hạn.

**Ngoài phạm vi bản đầu** (spec 00 mục 4): hàng lẻ LCL, tối ưu tuyến tự động, cổng khách tự đặt đơn, kết nối trực tiếp ePort (chỉ chừa sẵn chỗ cắm), ngôn ngữ khác tiếng Việt.

### A2. Đa doanh nghiệp (multi-tenant)

- Một người dùng có thể thuộc nhiều công ty, mỗi công ty một vai trò riêng (bảng `tenant_memberships`). Sau đăng nhập, người có nhiều công ty chọn công ty để làm việc; người chỉ có một công ty vào thẳng.
- Dữ liệu nghiệp vụ của các công ty tách biệt tuyệt đối. Mọi bảng có `tenant_id`, mọi truy vấn lọc theo tenant lấy từ phiên đăng nhập, không bao giờ lấy từ dữ liệu người dùng gửi lên. Khóa Redis và đường dẫn file đều có tiền tố tenant (ADR-003).
- Mỗi tenant có cấu hình riêng (múi giờ, phân bổ, đánh số, gói thuê bao...), xem E2.
- Tenant ở trạng thái `SUSPENDED` chỉ được xem. Tenant `CLOSED` được xuất toàn bộ dữ liệu trước khi xóa theo hợp đồng.

### A3. Người dùng

| Người dùng | Làm việc ở đâu | Việc chính |
|---|---|---|
| Điều vận | Web, màn 1366–1440px, cả ca | Tạo Order, điều xe, ghép chuyến, theo dõi mốc hạn và bản đồ, xử lý sự cố |
| Kế toán | Web | Duyệt phiếu dầu và chi phí, phân bổ chi phí, đối soát, lương, hóa đơn, khóa kỳ |
| Quản lý đội xe | Web | Hồ sơ xe, rơ moóc, tài xế, giấy tờ, bảo dưỡng, thiết bị GPS |
| Chủ công ty, Quản trị | Web | Người dùng, cấu hình, bảng giá, báo cáo |
| Tài xế | App điện thoại 390px, ngoài trời, một tay | Nhận lệnh, check-in, chụp chứng từ, phiếu dầu, chi phí, xem sổ lương |
| Nhà xe ngoài | Liên kết nộp chứng từ một lần | Nộp ảnh EIR, ePOD cho đúng container được giao, không có tài khoản |

### A4. Vai trò và quyền

Ma trận quyền nằm tập trung ở `packages/core/modules/identity/permissions.ts` (spec 01 Rule 4). Mọi Server Action và API tự kiểm tra quyền, không dựa vào việc nút bị ẩn trên giao diện. Bảng dưới là khởi điểm, lấy từ các quy tắc trong spec; chỗ spec chưa nói rõ thì ghi "theo ma trận".

| Việc | CS | QT | ĐV | KT | ĐX | TX | XEM |
|---|---|---|---|---|---|---|---|
| Quản lý người dùng, cấu hình tenant | Có | Có | | | | | |
| Sửa bảng giá đang hiệu lực | | Có | | | | | |
| Tạo, xác nhận Order, điều xe, ghép chuyến | theo ma trận | Có | Có | | | | |
| Ghi đè cảnh báo vượt giờ lái (ghi lý do) | | Có | | | | | |
| Phát hành phiếu dầu | | Có | Có | Có | | | |
| Duyệt phiếu dầu, chi phí dọc đường, tạo phạt vào sổ lương | | | | Có | | | |
| Sửa phân bổ chi phí chuyến, khóa chi phí | | Có | chỉ xem | Có | | | |
| Đối soát, hóa đơn, thanh toán, khóa kỳ | | mở lại kỳ | | Có | | | |
| Hồ sơ xe, rơ moóc, tài xế, giấy tờ, bảo dưỡng | | Có | xem | | Có | | |
| Dùng app tài xế (chỉ lệnh của chính mình) | | | | | | Có | |
| Xem báo cáo | Có | Có | theo ma trận | Có | theo ma trận | | Có |

- Số CCCD, số GPLX, số điện thoại tài xế là dữ liệu cá nhân: chỉ vai trò có quyền mới thấy, xuất file thì ghi audit.
- Đăng nhập hai lớp (2FA) cho CS, QT, KT để giai đoạn sau (spec 08 mục 2).

---

## Phần B. Yêu cầu chung về giao diện

Nguồn chi tiết: `designs/README.md`, `designs/tokens.json` và các thành phần trong `designs/components/`. Code không tự đặt mã màu, cỡ chữ hay khoảng cách ngoài token.

| Hạng mục | Yêu cầu |
|---|---|
| Web, máy tính trước | Màn văn phòng có chuột và bàn phím. Thiết kế ở 1440px, dùng tốt ở 1366px; nội dung tối đa 1240px. Khung: thanh bên trắng 240px và thanh trên (đổi công ty, tìm kiếm, chấm "Trực tiếp", sáng/tối, người dùng). Bảng rộng cuộn ngang trong khối; dưới 640px thanh bên thành dải trên cùng. |
| App tài xế, điện thoại | Khung 390×844, một cột, Android tầm trung. Vùng chạm từ 48px, nút chính 60–72px, chữ thân 16–19px, đệm theo vùng an toàn. Dùng được dưới nắng, một tay, sóng yếu. |
| Màu | Hướng xanh dương: `primary` cho nút chính, link, xe đang chạy. Năm họ trạng thái `crit`, `warn`, `ok`, `off`, `info`. Cam `accent` chỉ cho dấu hiệu không phải chữ. Có chế độ tối. Không gradient. Màu luôn kèm icon và chữ ("Cut-off còn 2 giờ 15"). |
| Mức hạn | `crit` dưới 3 giờ, quá hạn hoặc HOLD; `warn` trong 8 giờ; `info` xa hơn; `off` mất kết nối. |
| Chữ | Fira Sans cho giao diện, số đều cột; Fira Code cho số container, biển số, mã Order, số chứng từ, không cắt ngắn. Thân 16px, ô bảng 15px, tối thiểu 12px. |
| Tương phản và kích thước | Mọi chữ từ 4,5:1. Vùng bấm từ 44px; nút form 48px, nút trong bảng 40px. Mỗi vùng một nút chính. |
| Bốn trạng thái dữ liệu | Mỗi bảng, thẻ, khối có đủ: **bình thường** (sắp theo độ gấp); **đang tải** (khung xương đúng kích thước, không vòng quay toàn trang); **trống** (lý do và một hành động); **lỗi** (giữ dữ liệu cũ kèm giờ, nói phần nào lỗi, nút "Thử lại"). Lọc không ra thì "Xóa bộ lọc". |
| Lời văn | Tiếng Việt có dấu, viết hoa kiểu câu, giữ thuật ngữ ngành (Order, Booking, B/L, Cut-off, DEM, DET, ePOD, EDO, VGM, HOLD, Street Turn, TWIN_20). H1 nói số việc và mốc gần nhất bằng số thật. Thời gian ghi cả giờ và thời gian còn lại. Nút là động từ. Không emoji, không dấu chấm than. |
| Số chưa có và lỗi | Không hiện 0 thay cho dữ liệu chưa có ("Chưa có giá", "Không phát sinh"). Lỗi nói chuyện gì xảy ra và làm gì tiếp, hiện ngay dưới ô; không dùng "Có lỗi xảy ra". |
| Phím tắt và bàn phím | Phím **/** mở tìm kiếm ở mọi màn web. Mọi thao tác điều vận làm được bằng bàn phím. Thứ tự Tab theo thứ tự đọc. Viền focus 3px màu `focus`, thấy rõ trên cả hai chế độ. Nút chỉ có icon có `aria-label`; nút bật tắt dùng `aria-pressed`; bản đồ có bảng thay thế. |
| Chuyển động | 150ms cho đổi màu; tôn trọng chế độ giảm chuyển động. |

---

## Phần C. Màn hình web

Màn đã thiết kế có README trong `designs/components/ScreenNN-*/` mô tả đủ khối, tương tác và 4 trạng thái; phần này chỉ nêu điều code phải đảm bảo, quy tắc chi tiết ở Phần F.

### Sơ đồ điều hướng

```
Đăng nhập ─► Chọn công ty (nếu thuộc nhiều công ty) ─► Trang chủ

Thanh bên:
 ├─► Trang chủ
 ├─► Đơn hàng ─► Tạo Order · Chi tiết Order ─► Chi tiết container
 ├─► Điều vận (Kanban) ─► Gán xe · Ghép/Tách chuyến · Rơ moóc thả, Cứu hộ, Xe ngoài
 ├─► Duyệt chứng từ
 ├─► Bản đồ đội xe ─► Xem lại lộ trình
 ├─► Phiếu dầu ─► Phát hành · Duyệt giao dịch
 ├─► Chi phí dọc đường và tạm ứng
 ├─► Phân bổ chi phí chuyến
 ├─► Phí DEM/DET
 ├─► Đối soát ─► Tải và ánh xạ bảng kê ─► So khớp và xử lý ─► Chốt
 ├─► Lương tài xế ─► Kỳ lương ─► Sổ cái một tài xế
 ├─► Hóa đơn và công nợ
 ├─► Báo cáo
 ├─► Đội xe · Danh mục · Bảng giá
 └─► Cài đặt (Người dùng, Cấu hình công ty, Thông báo)

Thanh trên ở mọi màn: Đổi công ty · Tìm kiếm (/) · Trực tiếp · Sáng/Tối · Thông báo · Người dùng
```

Menu chỉ hiện mục mà vai trò hiện tại được dùng; số việc chờ hiện bằng huy hiệu.

### C1. Đăng nhập và chọn công ty [GĐ0]

**Thiết kế:** `designs/components/Screen01-Login`, thành phần `TenantPicker`.

- **Mục đích:** vào hệ thống đa công ty; một tài khoản có thể có vai trò khác nhau ở nhiều công ty.
- **Nội dung chính:** cột giới thiệu; form Email (hoặc số điện thoại), Mật khẩu có nút hiện/ẩn, "Ghi nhớ 30 ngày"; bước chọn công ty (chữ tắt, tên, lần đăng nhập cuối, vai trò).
- **Hành động:** Đăng nhập, chọn công ty, Đổi tài khoản, đổi công ty từ thanh trên.
- **Quy tắc:** sai mật khẩu báo dưới ô kèm số lần còn lại; sai 5 lần khóa 15 phút ("Thử lại sau 14:35"). Công ty sắp theo lần đăng nhập gần nhất; chỉ một công ty thì bỏ qua bước chọn; chưa có công ty nào thì "Liên hệ quản trị". Phiên chứa `tenantId` và vai trò.

### C2. Trang chủ điều vận [GĐ2]

**Thiết kế:** `designs/components/Screen02-Home`.

- **Nội dung chính:** H1 đếm việc; 4 thẻ chỉ số; "Mốc hạn sắp tới" (`DeadlineTimeline`); bảng "Việc cần xử lý"; bản đồ đội xe thu nhỏ; thanh container theo trạng thái.
- **Hành động:** lọc bảng việc theo Tất cả, Cut-off, DEM/DET, HOLD, Giấy tờ, Mất tín hiệu, Street Turn; bấm một việc để mở đúng màn xử lý.
- **Quy tắc:** HOLD hải quan chặn chuyến; giấy tờ sắp hết hạn sẽ chặn điều xe. Chưa có Order trong ngày thì nút "Tạo Order". Dựng ở GĐ2, bản đồ có dữ liệu thật từ GĐ4, chỉ số đầy đủ ở GĐ6.

### C3. Đơn hàng và container [GĐ1]

**Thiết kế:** `designs/components/Screen04-Orders` (danh sách, tạo Order, chi tiết Order).

- **Nội dung chính:** danh sách Order mở rộng ra bảng container; form tạo Order (thông tin chung theo Booking hoặc B/L, dán danh sách số cont, bảng dòng cont với loại, VGM, seal, hạn DEM, DET, lạnh, nguy hiểm, tuyến riêng); chi tiết Order (doanh thu, chi phí, lãi lỗ, chuỗi Stop từng cont, giá, chi hộ, EIR/ePOD, trạng thái cảng, lịch sử).
- **Hành động:** tạo, sửa, xác nhận (cả hàng loạt), xuất Excel; thêm, bớt, hủy từng cont; nhập giá tay; giữ hoặc áp giá mới khi cần tính lại giá.
- **Quy tắc:**
  - Số cont kiểm check digit ISO 6346 khi gõ, báo trùng; số dán từ Excel hoặc email được tách tự động.
  - Khi xác nhận, tra giá và chụp giá cho **từng container**. Không có giá thì "Chưa có giá" và bắt nhập giá tay kèm lý do, chờ Kế toán duyệt; không bao giờ 0 ₫.
  - Tự sinh Stop cho từng cont: Nhập `PICK_FULL` → `UNSTUFFING` → `RETURN_EMPTY`; Xuất `PICK_EMPTY` → `STUFFING` → `PORT_IN`; Nội địa theo tuyến.
  - Tổng Order bằng tổng các cont; chi hộ không vào doanh thu.
  - Hủy từng cont không hủy Order; cont đã giao không hủy được; cont đã chạy một phần phải có phí hủy lớn hơn 0 và lý do.
  - Trạng thái Order đi theo bảng chuyển hợp lệ (spec 02), từ `DRAFT` đến `INVOICED` hoặc `CANCELLED`; chuyển sai thứ tự bị chặn.

### C4. Điều vận Kanban [GĐ2]

**Thiết kế:** `designs/components/Screen03-Dispatch`, thành phần `ContainerCard`.

- **Nội dung chính:** bộ lọc chiều hàng, ô lọc số cont, Order, khách, lọc theo ngày và khu vực; 6 cột Chờ điều → Đã lên kế hoạch → Đã điều → Đang chạy → Chờ móc rơ moóc → Hoàn thành chờ chứng từ; mỗi thẻ là **một container**, gom nhóm theo Order được; bảng gán xe ghi lý do được hay không được điều; lịch xe 05:00–23:00 có vạch "bây giờ".
- **Hành động:** chọn thẻ để gán xe hoặc kéo thẻ vào làn tài xế, đầu kéo; Hoàn tác; hủy assignment; mở Ghép chuyến.
- **Quy tắc:**
  - Chip trên thẻ theo README màn (cut-off, DEM, DET, EDO, HOLD, hàng nguy hiểm, cont lạnh, Street Turn, chứng từ). Hàng Xuất dự kiến hạ bãi sau cut-off thì cảnh báo đỏ.
  - Giao diện đổi ngay khi kéo thả và tự quay lại kèm thông báo theo mã lỗi nếu máy chủ từ chối; `STALE_DATA` thì tải lại thẻ. Các Điều vận cùng mở thấy thay đổi của nhau theo thời gian thực.
  - Không tải toàn bộ đơn của tenant; dưới 2 giây với 300 thẻ. Kiểm tra xung đột ở F3.

### C5. Ghép chuyến và tách chuyến [GĐ2] (chưa thiết kế)

- **Nội dung chính:** container ứng viên; khung chuyến (chế độ chạy, tài nguyên, chuỗi Stop sau ghép); bảng kiểm tra luật (Đạt, Cảnh báo, Chặn kèm lý do); ô số chấp thuận đảo vỏ của hãng tàu.
- **Hành động:** Ghép chuyến, Tách chuyến, xác nhận cảnh báo thiếu khối lượng.
- **Quy tắc:** theo F4. Sau ghép hoặc tách, cont bị ảnh hưởng cần tính lại giá; phân bổ đã sửa tay của chuyến về lại số hệ thống và Kế toán được báo.

### C6. Rơ moóc đang thả, cứu hộ và xe ngoài [GĐ2] (chưa thiết kế)

- **Nội dung chính:** rơ moóc đang thả và số giờ đã nằm; sự cố hỏng xe và tỷ lệ hoàn thành đề xuất; xe ngoài (nhà xe, giá thuê, biển số và tên tài xế bắt buộc).
- **Hành động:** Thả rơ moóc, Điều xe móc rơ moóc, Báo hỏng xe, Điều xe cứu hộ, Bắn xe ngoài, Gửi liên kết nộp chứng từ.
- **Quy tắc:** theo F4 (spec 03 mục 3, spec 05 mục 1–2). Thả moóc giải phóng ngay đầu kéo và tài xế; đầu kéo hỏng chuyển `MAINTENANCE`; chi phí cứu hộ không tính cho khách trừ khi hợp đồng quy định.

### C7. Duyệt chứng từ EIR và ePOD [GĐ3] (chưa thiết kế)

- **Nội dung chính:** hàng đợi theo nhóm AI đã khớp, Lệch, Độ tin cậy thấp, OCR lỗi; ảnh phóng to; so OCR với hệ thống (số cont, seal, loại cont, giờ EIR, biển số) kèm độ tin cậy.
- **Hành động:** xác nhận nhanh nhóm AI đã khớp, sửa giá trị, xác nhận số cont OCR đề xuất cho hàng Xuất lấy rỗng, yêu cầu chụp lại.
- **Quy tắc:** theo F7. Người xác nhận là cuối cùng; đối soát được từng phần theo container đã đủ chứng từ.

### C8. Bản đồ đội xe và xem lại lộ trình [GĐ4]

**Thiết kế:** `designs/components/Screen05-FleetMap`.

- **Nội dung chính:** danh sách xe (Đầu kéo, Rơ moóc đang thả), sơ đồ khu vực có geofence, thẻ chi tiết xe, bảng thay thế sơ đồ.
- **Hành động:** chọn, lọc, tìm không cần gõ dấu, phóng to thu nhỏ (gom cụm), xem lại với thanh tua và tốc độ 60×/300×/900×, Điều xe móc rơ moóc.
- **Quy tắc:** mỗi trạng thái xe có hình riêng ngoài màu; quá 15 phút không có GPS là mất tín hiệu; rơ moóc viền cam quá 24 giờ, đỏ quá 48 giờ; vị trí trễ dưới 30 giây.

### C9. Phiếu dầu [GĐ4]

**Thiết kế:** `designs/components/Screen06-Fuel` (danh sách, phát hành, duyệt).

- **Nội dung chính:** thẻ chỉ số; tab Danh sách phiếu, Phát hành phiếu, Duyệt giao dịch; bảng phiếu có L/100km so với định mức và cờ; biểu đồ tiêu hao có bảng thay thế.
- **Hành động:** phát hành (xe, tài xế, cây xăng, hạn mức, hạn dùng, xem trước QR); duyệt (ảnh trụ bơm và đồng hồ km, so số nhập với OCR, giải trình full-to-full, duyệt, từ chối, ghi phạt); duyệt hàng loạt phiếu không cờ.
- **Quy tắc:** theo F8. Điều vận phát hành và xem, không duyệt. Phiếu có cờ duyệt từng phiếu, bắt buộc lý do.

### C10. Chi phí dọc đường và tạm ứng [GĐ5] (chưa thiết kế)

- **Nội dung chính:** chi phí chờ duyệt theo chuyến (ảnh hóa đơn, loại, số tiền, người trả: tiền mặt tài xế, thẻ công ty, tạm ứng); cờ chi hộ thu lại của khách; số dư tạm ứng từng tài xế.
- **Hành động:** duyệt, từ chối kèm lý do, cấp tạm ứng, ghi hoàn ứng.
- **Quy tắc:** chi phí duyệt vào chi phí thực tế của chuyến; chi hộ sinh phí `PASS_THROUGH`; tạm ứng và hoàn ứng vào sổ cái tài xế; phát sinh của nhà xe ngoài cũng duyệt ở đây.

### C11. Phân bổ chi phí chuyến [GĐ5]

**Thiết kế:** `designs/components/Screen08-CostAlloc`.

- **Nội dung chính:** thẻ chuyến; bảng chi phí theo khoản; bảng phân bổ với Hệ thống đề xuất, Kế toán áp dụng, Chênh, Gán thẳng, Tổng vào cont; Lý do; Lịch sử; thanh lưu ở đáy (tổng, đã phân bổ, còn lệch). Điều vận chỉ xem.
- **Hành động:** nhập theo tiền hoặc %, dồn phần lệch vào cont cuối, Khôi phục số hệ thống, xem chi phí của cont qua mọi chuyến, xác nhận cờ "Cần xem lại", Lưu, Khóa chi phí.
- **Quy tắc:** theo F6. Còn lệch khác 0 ₫ thì khóa Lưu.

### C12. Phí DEM/DET [GĐ5] (chưa thiết kế)

- **Nội dung chính:** bảng container với hạn miễn phí DEM, DET, Storage, số ngày quá, số tiền dự tính hoặc đã chốt, ai chịu phí; nhóm sắp hết hạn trong 24 và 48 giờ.
- **Hành động:** đổi ai chịu (công ty hay khách), nhập số theo hóa đơn hãng tàu, mở trên Kanban.
- **Quy tắc:** theo F2.

### C13. Đối soát [GĐ5]

**Thiết kế:** `designs/components/Screen07-Reconcile`.

- **Nội dung chính:** bước 1 tải bảng kê của Khách hàng, Cây xăng hoặc Nhà xe ngoài và ánh xạ cột; bước 2 so khớp hai cột Hệ thống và Bảng kê, thẻ tổng, khối container bị loại vì chưa có ePOD.
- **Hành động:** lọc Khớp, Lệch số liệu, Chỉ có ở bảng kê, Chỉ có trong hệ thống; xử lý từng dòng; Hoàn tác; Chốt đối soát.
- **Quy tắc:** đơn vị đối soát là container; ô lệch ghi rõ số chênh; ánh xạ cột lưu theo đối tác; nhập lại cùng file không tạo trùng; Chốt chỉ bật khi đã xử lý hết; khách hàng thì sang lập hóa đơn, cây xăng và nhà xe thì tạo bảng kê phải trả; kỳ đã khóa chỉ xem.

### C14. Lương tài xế [GĐ5] (chưa thiết kế)

- **Nội dung chính:** kỳ lương (Mở, Đã tính, Đã duyệt, Đã chi); bảng tài xế (Lương chuyến, Phụ cấp, Tạm ứng, Phạt, Thực lãnh); sổ cái một tài xế có tham chiếu chuyến, phiếu dầu, chi phí.
- **Hành động:** tính kỳ, duyệt kỳ, ghi chi lương, tạo bút toán đảo.
- **Quy tắc:** theo F9.

### C15. Hóa đơn, thanh toán, công nợ và khóa kỳ [GĐ5] (chưa thiết kế)

- **Nội dung chính:** container đủ điều kiện xuất hóa đơn; hóa đơn nháp gom nhiều Order của một khách (cước, phụ phí, chi hộ, VAT); trạng thái hóa đơn; thanh toán thu và chi; tuổi nợ 0–30, 31–60, 61–90, trên 90 ngày; bảng kê phải trả; kỳ kế toán.
- **Hành động:** tạo nháp, phát hành hóa đơn điện tử, ghi thanh toán và cấn trừ, khóa kỳ, mở lại kỳ (Quản trị).
- **Quy tắc:** theo F10.

### C16. Báo cáo [GĐ6] (chưa thiết kế)

- Lãi lỗ theo Order, Khách hàng, Xe, Tài xế, Tuyến; tỷ lệ km rỗng; số chuyến mỗi xe mỗi ngày; công nợ quá hạn. Hiện cả chi phí định mức và thực tế, cả số hệ thống và số Kế toán đã sửa. Xuất Excel. Báo cáo nặng chạy trên bản sao đọc.

### C17. Thông báo [GĐ6] (chưa thiết kế)

- Trung tâm thông báo mở từ thanh trên và màn cấu hình người nhận theo loại sự kiện và kênh (trong app, email, Zalo/SMS).
- Sự kiện: sắp hết free time DEM/DET (48 và 24 giờ trước), sắp cut-off, giấy tờ sắp hết hạn (15 ngày), vượt định mức dầu, xung đột đồng bộ từ app, sự cố xe, xe mất tín hiệu khi đang có chuyến. Gửi cho khách chỉ khi tenant bật.

---

## Phần D. App tài xế

**Thiết kế:** `designs/components/Screen09-DriverApp` (390×844, sáng và tối, mạng online/offline/xung đột, 4 trạng thái dữ liệu).

App viết bằng Expo (React Native), lưu offline bằng SQLite, gọi REST `/api/v1/driver/*`. Tài xế chỉ thấy lệnh của chính mình. Thanh dưới có 4 mục: Lệnh, Phiếu dầu, Chi phí, Sổ lương.

| Màn | GĐ | Nội dung và quy tắc |
|---|---|---|
| D1. Đăng nhập (chưa thiết kế) | 3 | Số điện thoại và mật khẩu; token ngắn hạn kèm token làm mới, thu hồi được khi tài xế nghỉ việc. Lần đầu xin quyền vị trí, máy ảnh, có lời đồng ý về theo dõi vị trí. |
| D2. Lệnh hôm nay | 3 | H1 đếm việc còn lại kèm hạn gần nhất ("2 chuyến còn lại · Cut-off 18:00"), pill trạng thái mạng; thẻ **Việc tiếp theo** với một nút chính; danh sách chuyến (TWIN_20 hiện 2 cont). Trống: "Chưa có lệnh nào hôm nay" và "Tải lại lệnh". |
| D3. Chạy chuyến | 3 | Dòng thời gian Stop (ví dụ `PICK_EMPTY` → `STUFFING` → `PORT_IN`). Bắt đầu chuyến → Check-in → Đã đến (GPS trong vùng kho) → chụp đủ chứng từ → Hoàn tất Stop. "Hoàn tất Stop" khóa kèm lý do đến khi đủ chứng từ bắt buộc. Server từ chối Stop làm sai thứ tự. |
| D4. Chụp chứng từ | 3 | EIR, ePOD, seal, ký nhận. Ảnh tải thẳng lên kho qua đường dẫn ký sẵn, tiếp tục được khi đứt mạng; ảnh chờ tải ghi "Chờ tải lên". |
| D5. Phiếu dầu | 4 | Quét QR → số lít, đơn giá, km đồng hồ → "Đổ đầy bình" (mặc định bật) → ảnh trụ bơm và đồng hồ km → Gửi. Kiểm tra ngay hạn mức, dung tích bình, thành tiền. |
| D6. Chi phí dọc đường | 5 | Loại → số tiền → ảnh hóa đơn bắt buộc → Gửi; mất sóng thì "Chờ gửi". |
| D7. Sổ lương | 5 | Dòng sổ cái trong kỳ: lương chuyến, phụ cấp, tạm ứng, phạt (trả vỏ trễ DET, dầu vượt định mức), thực lãnh. |
| D8. Offline và xung đột | 3 | Banner "Đang offline · 3 thao tác chờ gửi" mở hàng chờ. Mỗi thao tác lưu giờ thật lúc bấm và độ lệch đồng hồ, gửi đúng thứ tự, gửi lại không sinh trùng. Điều vận đã sửa hoặc hủy Stop thì server trả `CONFLICT`, app báo "Check-in Stop 2 không được nhận" và nút gọi Điều vận. |
| D9. Báo sự cố (chưa thiết kế, cần xác nhận) | 2–3 | Spec 05 mục 1 cần bản ghi sự cố có vị trí GPS và ảnh nhưng chưa nói ai tạo. Đề xuất: tài xế báo từ app (loại, ảnh, vị trí tự lấy), Điều vận hoàn thiện trên web (C6). |
| D10. Nộp chứng từ nhà xe ngoài (chưa thiết kế) | 2–3 | Trang điện thoại mở bằng liên kết một lần có hạn; chỉ nộp ảnh EIR, ePOD cho đúng container được giao; không có tài khoản. |

---

## Phần E. Danh mục và quản trị

Cả phần này **chưa thiết kế**. Dùng khung `AppShell`, `WorkTable`, `Field`, `FilterTabs`. Mọi danh mục xóa mềm, mã duy nhất trong tenant, nhập Excel có xem trước và báo lỗi từng dòng.

### E1. Người dùng và vai trò [GĐ0]

Danh sách người dùng (vai trò, trạng thái, lần đăng nhập cuối); mời bằng email hoặc số điện thoại; đổi vai trò; khóa tài khoản; tài khoản tài xế gắn với hồ sơ tài xế. Mọi thay đổi ghi audit.

### E2. Cấu hình công ty [GĐ0, bổ sung dần]

Tên, mã số thuế, múi giờ; phương pháp phân bổ mặc định (`COST_NORM_RATIO`, đổi được sang `REVENUE_RATIO`, `EQUAL`, `DISTANCE_RATIO`); mẫu đánh số chuyến, phiếu dầu, hóa đơn; giờ job DEM/DET; dung sai định mức dầu (5%); giới hạn giờ lái (10 giờ/ngày, liên tục 4 giờ); chia ưu đãi giá ghép cho khách hay không; ngày tra giá; bật tắt OCR; giá dầu niêm yết theo kỳ.

### E3. Danh mục cơ bản [GĐ1]

| Danh mục | Thông tin chính |
|---|---|
| Khách hàng | Mã, tên, mã số thuế, địa chỉ hóa đơn, hạn thanh toán, hạn mức công nợ |
| Hãng tàu | Mã (MSK, ONE, CMA...), tên, cho đảo vỏ hay không |
| Nhà cung cấp | Tên, mã số thuế, loại (cây xăng, nhà xe ngoài, garage, cảng, depot, lốp), hạn thanh toán |
| Địa điểm | Loại (cảng, depot, kho khách, cây xăng, garage, bãi đỗ), địa chỉ, tọa độ, bán kính geofence (300 m), khu vực, chủ sở hữu |
| Tuyến | Mã, tên, khu vực đi, khu vực đến, km chuẩn |

Dữ liệu mẫu: tuyến Cát Lái – Sóng Thần, vài cảng, depot, kho.

### E4. Bảng giá, bảng phí, DEM/DET, định mức dầu [GĐ1, GĐ4, GĐ5]

- Giá cước (thu khách) và bảng phí (định mức chi phí, phụ phí, chi hộ) theo 4 chiều Tuyến, Loại cont, Chế độ chạy, Khách hàng (riêng hoặc chung). Bảng phí thêm mã phí, cách tính (chuyến, cont, ngày, km), cờ "miễn".
- Biểu DEM/DET lũy tiến theo ngày [GĐ5]; định mức dầu theo chạy rỗng, có hàng 20, có hàng 40, TWIN_20 [GĐ4].
- Không cho 2 bản ghi đang hiệu lực cùng khóa chồng lấn thời gian. Sửa giá đang hiệu lực bằng cách đóng bản ghi cũ và tạo bản mới; chỉ Quản trị được làm. Nhập Excel báo cả dòng chồng lấn.

### E5. Đội xe, tài xế, giấy tờ, bảo dưỡng [GĐ2]

- **Đầu kéo:** biển số, sở hữu hay thuê, định mức dầu cơ sở, km hiện tại và km bảo dưỡng kế tiếp, hạn đăng kiểm, bảo hiểm, phù hiệu, khối lượng toàn bộ cho phép, thiết bị GPS.
- **Rơ moóc:** loại (20, 40, 40 combo, 45), chở được 2×20, có genset, tự trọng, tải trọng, hạn kiểm định, vị trí.
- **Tài xế:** điện thoại, CCCD, GPLX (số, hạng, hạn), chứng chỉ hàng nguy hiểm, loại hợp đồng, tài khoản app.
- Giấy tờ hết hạn trong 15 ngày có danh sách và cảnh báo hằng ngày; hết hạn thì chặn điều xe. Bảo dưỡng theo km hoặc ngày, lệnh bảo dưỡng chặn điều xe trong khoảng thời gian của nó. Lốp quản lý tối giản. Thiết bị GPS cấp khóa API [GĐ4].

### E6. Vận hành SaaS [GĐ6]

Tạo tenant, tài khoản Chủ công ty, cấu hình ban đầu, nhập danh mục bằng Excel mẫu; gói thuê bao giới hạn số xe, người dùng, lượt OCR (vượt thì cảnh báo, không khóa dữ liệu); màn job lỗi; nhân viên hỗ trợ "đăng nhập thay" có thời hạn và ghi audit.

---

## Phần F. Quy tắc nghiệp vụ

*Phần này dùng khi dựng code. Mỗi mục là tóm tắt; con số và điều kiện đầy đủ nằm ở spec được dẫn.*

### F1. Giá 4 chiều và phí (spec 06 mục 1–2, 4)

- Tra giá trong **một truy vấn**: lọc khách này hoặc giá chung, chế độ này hoặc SINGLE, hạn hiệu lực bỏ trống là vô thời hạn; xếp theo 4 mức ưu tiên: (1) giá riêng của khách cho đúng chế độ, (2) giá chung cho đúng chế độ, (3) giá riêng của khách cho SINGLE, (4) giá chung cho SINGLE; cùng mức lấy bản ghi hiệu lực mới nhất. Không bao giờ lấy nhầm giá riêng của khách khác.
- Bảng phí ghép theo từng mã phí: ngoại lệ của khách ở một mã không ảnh hưởng mã khác; cờ "miễn" bỏ mã phí đó; phí có tuyến cụ thể ưu tiên hơn phí mọi tuyến.
- Không có giá: `TARIFF_NOT_FOUND`, bắt nhập giá tay, không trả 0. Ngày tra là ngày (theo múi giờ tenant) của Stop đầu tiên theo kế hoạch.
- Giá chụp cho từng container kèm mã bảng giá nguồn. Ghép, tách, đổi tuyến, đổi loại cont, đổi khách thì cont cần tính lại giá; chỉ tính lại khi chưa lên hóa đơn và không phải giá tay, có audit; đã lên hóa đơn thì tạo yêu cầu điều chỉnh.
- Chuyến ghép: 2 cont cùng khách áp giá TWIN_20 hoặc COMBINED (theo cấu hình tenant); khác khách giữ giá SINGLE.
- Bốn loại phí: định mức chi phí, phụ phí doanh thu, chi hộ (không phải doanh thu, thu lại đúng số đã trả), chi phí dọc đường.

### F2. DEM, DET và Storage (spec 05 mục 5)

- Tính **theo từng container**. DEM từ hạn miễn phí DEM đến khi lấy cont hàng (`PICK_FULL`) xong; DET từ hạn miễn phí DET đến khi trả rỗng hoặc đảo vỏ; Storage theo hạn của cảng. Số tiền theo biểu lũy tiến theo ngày.
- Job hằng ngày theo múi giờ từng tenant, cập nhật **một dòng dự tính** mỗi cont cho đến khi chốt; chạy lại không sinh thêm phí.
- DEM/DET hãng tàu là chi hộ, số chính thức theo hóa đơn hãng tàu. Chậm do nhà xe thì công ty chịu. Cảnh báo 48 và 24 giờ trước hạn.

### F3. Điều vận và chồng lấn thời gian (spec 03 mục 1, 4)

- Gán trong một giao dịch, khóa dòng theo thứ tự tài xế → đầu kéo → rơ moóc (cùng bảng theo mã tăng dần). Chờ khóa khoảng 5 giây, quá thì `RESOURCE_BUSY_RETRY`.
- Không chỉ dựa vào trạng thái. Kiểm tra: còn hoạt động và cùng tenant; không có assignment còn hiệu lực chồng lấn khoảng giờ cho cả tài xế, đầu kéo, rơ moóc; không có lệnh bảo dưỡng chồng lấn; giấy tờ còn hạn tại giờ kết thúc (hết hạn chặn `DOCUMENT_EXPIRED`, dưới 15 ngày cảnh báo); giờ lái không vượt giới hạn (chỉ Quản trị ghi đè, có lý do); chuyến bắt đầu trong 30 phút thì tài nguyên phải đang rảnh.
- Hai người gán cùng tài xế cho hai chuyến chồng giờ: đúng một người thành công. Xe có chuyến sáng vẫn xếp được chuyến chiều.
- Sửa chuyến theo số phiên bản (`STALE_DATA`). Hủy là đổi trạng thái, không xóa. Trạng thái xe và tài xế chỉ đổi sang đang chạy khi chuyến thực sự bắt đầu.

### F4. Ghép chuyến, đảo vỏ, Drop & Hook, cứu hộ (spec 03 mục 2–3, spec 05 mục 1–2)

- **TWIN_20:** rơ moóc chở được 2×20, cả 2 cont 20ft, cùng hoặc khác Order.
- **Tải trọng:** tổng khối lượng cont (VGM) không vượt tải trọng moóc; cộng tự trọng moóc và đầu kéo không vượt khối lượng toàn bộ cho phép; thiếu dữ liệu thì bắt xác nhận.
- **Street Turn:** cùng hãng tàu, cùng loại cont, hãng cho phép và có số chấp thuận trước khi điều; rút hàng Nhập xong trước đóng hàng Xuất. Sau đảo vỏ, cont Xuất mang số cont Nhập, DET chuyển sang cont Xuất, Stop trả rỗng của cont Nhập thành `SKIPPED`.
- **COMBINED** dùng 2 vỏ khác nhau, vẫn kiểm thứ tự Stop hợp lệ. **Cont lạnh** cần moóc có genset. **Hàng nguy hiểm** cần tài xế có chứng chỉ, không ghép TWIN_20 với khách khác. Cont HOLD hoặc chưa có EDO, lệnh cấp rỗng thì lưu kế hoạch được nhưng chặn lúc điều.
- **Drop & Hook:** chặng trước thả và sau móc là 2 assignment, lương tính riêng. Khi móc, moóc phải đang thả đúng địa điểm.
- **Cứu hộ:** assignment cũ `ABORTED_MIDWAY`, tỷ lệ hoàn thành đề xuất bằng km GPS đã chạy chia km chuẩn, sửa được có audit; tổng tỷ lệ trên một Stop bằng 100; lương chia theo tỷ lệ, làm tròn đến đồng, phần dư cho tài xế hoàn tất (hỏng ở 40% thì chia 40/60).

### F5. Doanh thu và chi phí chuyến ghép (spec 06 mục 3)

- Doanh thu tính trên container, cộng lên Order. Chi phí tính trên chuyến thực chạy: một mức lương, một mức cầu đường cho cả chuyến theo chế độ chạy của chuyến, không cộng đôi; chuyến 2 khách dùng bảng phí chung.
- Chi phí thực tế gồm dầu (chia theo km), chi phí dọc đường đã duyệt, thuê ngoài, cứu hộ. Lãi lỗ dùng thực tế khi đã chốt, định mức để so.

### F6. Phân bổ chi phí chuyến (spec 06 mục 3, chốt 16/10/2026)

- **Hệ thống đề xuất:** mặc định theo tỷ lệ chi phí định mức nếu từng cont chạy SINGLE. Phân bổ **mọi** chi phí của chuyến; chi phí riêng của một cont thì gán thẳng. Làm tròn đến đồng, phần dư dồn vào cont cuối, tổng phân bổ **bằng đúng** tổng chi phí.
- **Kế toán sửa:** chỉ KT hoặc QT; theo tiền hoặc %; tổng phải khớp, không âm, bắt buộc lý do; lưu cả số hệ thống và số áp dụng, phương pháp thành `MANUAL`, có audit; nút khôi phục số hệ thống.
- Chi phí tăng sau khi Kế toán sửa: không ghi đè, phần chênh chia theo tỷ lệ Kế toán đang dùng, gắn cờ "Cần xem lại".
- Chi phí cont bằng tổng phân bổ qua mọi chuyến nó đi. Khóa chi phí khi chuyến xong và chi phí dọc đường đã duyệt; sau khóa hoặc kỳ đã đóng chỉ điều chỉnh ở kỳ đang mở.

### F7. Chứng từ, OCR, thời gian tin cậy (spec 05 mục 3–4)

- OCR chạy nền, nhà cung cấp AI thay được; lưu độ tin cậy từng trường, model, phiên bản prompt.
- EIR: kiểm check digit ISO 6346; khớp số cont và seal, mọi trường đạt ngưỡng (mặc định 0,9) thì "AI đã khớp", lệch thì duyệt tay. Ảnh đổ dầu: dung sai ±0,1 L, ±1.000 đ, km khớp tuyệt đối; đạt thì duyệt nhanh nhưng không tự duyệt chi tiền. Ảnh trùng mã băm thì gắn cờ.
- Con người xác nhận cuối cùng; OCR lỗi không chặn duyệt tay; tenant được tắt OCR.
- Thứ tự tin cậy của giờ: geofence từ GPS gắn xe, rồi giờ bấm trên app đã hiệu chỉnh, rồi EXIF. Lệch trên 15 phút thì cờ `TIME_MISMATCH`, mặc định dùng geofence.
- Giờ chờ tại kho = giờ rời − max(giờ đến, đầu khung hẹn), trừ thời gian miễn phí; phần vượt sinh phụ phí chờ duyệt.

### F8. Phiếu dầu và định mức (spec 04 mục 2)

- Phiếu có mã, QR, hạn mức lít, hạn dùng; quá hạn `EXPIRED`, hủy `VOIDED`; mỗi đầu kéo tối đa một phiếu hiệu lực; hạn mức không vượt dung tích bình.
- Tiêu hao tính **từ lần đổ đầy đến lần đổ đầy kế tiếp**, cộng các lần đổ một phần ở giữa, chia km đồng hồ, nhân 100. Định mức cho phép là bình quân theo km theo trạng thái tải từng đoạn; vượt quá dung sai (mặc định 5%) thì cảnh báo.
- Cờ: km lùi, km đồng hồ lệch trên 10% so với GPS, ảnh trùng, giá lệch niêm yết, vượt định mức. Phần vượt không giải trình được có thể ghi phạt vào sổ lương, bắt buộc lý do.

### F9. Lương tài xế (spec 07 TICKET-20)

- Sổ cái **chỉ ghi thêm**; sửa sai bằng bút toán đảo. Thực lãnh = Lương chuyến + Phụ cấp − Tạm ứng − Phạt; chi lương ghi một dòng chi; kỳ đã duyệt không ghi thêm.
- Lương chuyến lấy theo mã phí lương trong bảng phí; cách tính theo chuyến, km hay kết hợp còn chờ PO chốt.

### F10. Đối soát, hóa đơn, khóa kỳ (spec 04 mục 2.5, spec 06 mục 5)

- Xuất hóa đơn khi đã đối soát; cho xuất từng phần theo container đủ chứng từ; gom nhiều Order của một khách theo kỳ; VAT theo thuế suất chụp lại. Cách xử lý chi hộ trên hóa đơn chờ kế toán trưởng xác nhận.
- Hóa đơn điện tử qua bộ chuyển đổi theo nhà cung cấp; đã phát hành thì không sửa. Công nợ phải trả lập theo kỳ sau đối soát.
- Kỳ `CLOSED` không cho tạo hay sửa số liệu có ngày trong kỳ; chỉ điều chỉnh ở kỳ mở.

### F11. Audit, bất biến, phi chức năng (ADR-008, ADR-009, spec 01, spec 08)

- Thay đổi Order, Assignment, bảng giá, phí, sổ cái, hóa đơn ghi `audit_logs` trong cùng giao dịch. Sổ cái, phí đã duyệt, hóa đơn đã phát hành không bao giờ bị sửa hay xóa.
- Thời gian lưu UTC, cắt ngày theo múi giờ tenant; tiền `DECIMAL(18,2)`, tính bằng số thập phân. Số chứng từ sinh từ bảng dãy số có khóa dòng. API từ app và thiết bị bỏ qua sự kiện đã xử lý.
- Mục tiêu: 50 tenant, tới 500 đầu kéo mỗi tenant, GPS 10 giây/điểm; Kanban dưới 2 giây với 300 thẻ; thao tác điều vận 95% dưới 500 ms; vị trí trễ dưới 30 giây; uptime 99,5%. Sao lưu hằng ngày, giữ 30 ngày, diễn tập khôi phục mỗi quý.

---

## Phần G. Cơ sở dữ liệu

**Nguồn chi tiết duy nhất:** `docs/specs/02_database_schema.md` (schema Drizzle cho MariaDB). Phần này chỉ tóm tắt.

**Quy ước chung:** khóa chính UUIDv7; mọi bảng nghiệp vụ có `tenant_id` đứng đầu mọi index nghiệp vụ; thời gian `DATETIME(3)` UTC; tiền `DECIMAL(18,2)` kèm `currency`; danh mục xóa mềm; bảng nhiều người sửa có `version`; enum ở `packages/shared/enums.ts`.

| Nhóm | Bảng | Dùng để |
|---|---|---|
| SaaS, định danh, audit | `tenants`, `users`, `tenant_memberships`, `audit_logs`, `number_sequences`, `attachments` | Công ty, người dùng, vai trò theo công ty, nhật ký thay đổi, dãy số chứng từ, ảnh và kết quả OCR |
| Danh mục | `customers`, `shipping_lines`, `vendors`, `locations`, `routes` | Khách, hãng tàu, nhà cung cấp, địa điểm có geofence, tuyến |
| Đội xe | `tractors`, `trailers`, `drivers`, `maintenance_plans`, `maintenance_orders`, `tires` | Xe, moóc, tài xế, hạn giấy tờ, bảo dưỡng, lốp |
| GPS | `gps_devices`, `gps_logs` | Thiết bị và lịch sử vị trí; `gps_logs` chia partition theo tháng, tạo bằng migration SQL riêng, không khóa ngoại |
| Giá và định mức | `freight_tariffs`, `fee_tariffs`, `dem_det_tariffs`, `fuel_norms` | Giá cước 4 chiều, bảng phí 4 chiều, biểu DEM/DET lũy tiến, định mức dầu theo trạng thái tải |
| Đơn hàng và chuyến | `orders`, `order_containers`, `consolidated_trips`, `trip_containers`, `order_stops`, `dispatch_assignments`, `incidents` | Order chung; từng container (giá snapshot, hạn DEM/DET, trạng thái cảng, ePOD, chi phí phân bổ); chuyến thực chạy; bảng nối chuyến và container (tỷ lệ và số phân bổ hệ thống, số áp dụng, cờ sửa tay); điểm dừng; gán tài nguyên (nguồn sự thật duy nhất); sự cố |
| Phí và chi phí | `order_fees`, `trip_costs`, `trip_expenses`, `fuel_transactions` | Phí thu khách và chi hộ; chi phí chuyến định mức và thực tế; chi phí dọc đường; phiếu và giao dịch dầu |
| Tài chính | `accounting_periods`, `payroll_periods`, `driver_ledger`, `invoices`, `invoice_lines`, `payments`, `vendor_bills` | Kỳ kế toán, kỳ lương, sổ cái tài xế chỉ ghi thêm, hóa đơn, thanh toán thu chi, công nợ phải trả |

**Ngoài MariaDB:** Redis giữ vị trí mới nhất của từng xe, luồng GPS chờ ghi, trạng thái geofence, hàng đợi job và phiên; kho lưu trữ tương thích S3 giữ ảnh chứng từ với khóa `tenants/{tenantId}/...`, chỉ truy cập qua đường dẫn ký có hạn.

---

## Phần H. Công nghệ, chạy trên máy, triển khai, quy trình làm việc

### H1. Công nghệ

| Phần | Lựa chọn |
|---|---|
| Web | Next.js App Router, React 19, TypeScript strict. Server Components cho dashboard và báo cáo, Server Action cho thao tác web. |
| Nghiệp vụ | Chỉ trong `packages/core/modules/*/service.ts`; Server Action và API chỉ kiểm quyền (`requireRole`), kiểm dữ liệu (zod) rồi gọi service, trả `{ ok, data }` hoặc `{ ok: false, code, message }`. |
| Dữ liệu | MariaDB qua Drizzle ORM, truy cập qua `getTenantDb(ctx)`; Redis; kho tương thích S3 (MinIO trên máy). |
| Job | BullMQ trong worker Node riêng: cron, GPS, OCR, DEM/DET, thông báo; chạy lại không sinh trùng, có retry và hàng lỗi. |
| Khác | Auth.js hoặc better-auth, decimal.js cho tiền, Tailwind và shadcn/ui, dnd-kit, TanStack Table, `VisionOcrProvider` (Gemini là một cách cài đặt). |
| App tài xế | Expo (React Native), SQLite. |
| Kiểm thử | Vitest, Testcontainers (MariaDB, Redis thật), Playwright. |
| Monorepo | pnpm workspace: `apps/web`, `apps/worker`, `apps/driver-app`, `packages/shared`, `packages/core`. |

### H2. Chạy trên máy

1. Cài Node.js, pnpm, Docker. Chạy `docker compose up` để bật MariaDB, Redis, MinIO.
2. Sao chép `.env.example` thành `.env`, điền kết nối cơ sở dữ liệu, Redis, kho file, khóa phiên (tên biến chốt ở TICKET-00).
3. `pnpm install`, `pnpm db:migrate`, `pnpm db:seed`, rồi `pnpm dev` để bật web và worker. Các lệnh khác: `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm e2e`; danh sách chính thức ghi trong mục "Lệnh" của `CLAUDE.md` sau TICKET-00.

### H3. Triển khai

- Ba môi trường `dev`, `staging`, `production`; web và worker triển khai độc lập. MariaDB và Redis dùng dịch vụ được quản lý, đặt tại Việt Nam nếu cần lưu dữ liệu trong nước (chờ pháp chế). Migration có phiên bản, không `push` trên production.
- Log có cấu trúc, không ghi dữ liệu cá nhân; cảnh báo khi trễ GPS trên 5 phút, lỗi trên 2%, job DEM/DET không chạy, sao lưu thất bại. Chi tiết ở spec 08.

### H4. Quy trình làm việc

1. Thiết kế bằng Claude Design theo Phần J, tải về và chép đè vào `designs/` (chỉ đọc trong code).
2. Làm bằng Claude Code. `CLAUDE.md` ở gốc là hướng dẫn bắt buộc; tài liệu này là `docs/PRD.md`.
3. Làm **từng task một** theo thứ tự `docs/tasks/README.md`. Mỗi task có `task.md`, `plan.md`, `progress.md`, `decisions.md`. Task đầu dùng `prompts/prompt-01-khoi-tao.md`, các task sau dùng `prompts/prompt-02-mot-task.md`.
4. Mỗi task bắt đầu ở **Plan mode**: đọc `task.md`, spec liên quan, màn thiết kế tương ứng; viết `plan.md` (các bước, file sẽ đụng, test sẽ viết trước) rồi **dừng để người duyệt**.
5. Sau khi duyệt: TDD, viết test trước rồi code. **Dừng sau mỗi bước** của kế hoạch, ghi `progress.md`, báo kết quả rồi mới làm bước sau. Làm khác spec hay thiết kế thì ghi `decisions.md` và sửa spec.
6. Xong khi đạt "Chấp nhận khi" và Definition of Done (test hành vi, test tenant isolation cho mọi repository mới, kiểm quyền và zod ở mọi action, migration chạy trên DB trống và DB có dữ liệu, typecheck, lint, test xanh trên CI); cập nhật `docs/tasks/README.md`. Nên làm hết 00–04 trước khi đụng giao diện lớn.

---

## Phần I. Giai đoạn xây dựng

Mỗi task là một ticket trong spec 07 và một thư mục trong `docs/tasks/`.

| GĐ | Task | Kết quả |
|---|---|---|
| **0. Nền tảng** | 00-monorepo-setup, 01-auth-tenant | Đăng nhập, chọn công ty, dữ liệu các công ty tách biệt có test |
| **1. Danh mục và đơn hàng** | 02-master-data, 03-pricing-engine, 04-orders-containers | Tạo Order nhiều cont, có giá từng cont, không bao giờ giá 0 |
| **2. Đội xe và điều vận** | 05-fleet-drivers, 06-dispatch-single, 07-dispatch-kanban, 08-trip-combining, 09-drop-hook-rescue | Điều vận làm việc hằng ngày trên Kanban, không gán trùng |
| **3. App tài xế và chứng từ** | 10-driver-app, 11-driver-offline-sync, 12-ocr-epod | Tài xế chạy chuyến bằng app kể cả mất sóng; chứng từ được xác nhận |
| **4. GPS, geofence, dầu** | 13-gps-pipeline, 14-geofence-waiting, 15-fuel-vouchers | Bản đồ trực tiếp, xem lại lộ trình, cảnh báo dầu |
| **5. Chi phí, phân bổ, lương, công nợ** | 16-road-expenses, 17-trip-cost-allocation, 18-dem-det-fees, 19-reconciliation, 20-driver-payroll, 21-invoicing | Kế toán khép kín từ chi phí đến hóa đơn |
| **6. Báo cáo, thông báo, vận hành** | 22-reports-kpi, 23-notifications, 24-production-readiness | Dùng thật cho nhiều công ty |

- Có thể đưa lên staging sau GĐ1 để Điều vận thử nhập Order.
- **Câu hỏi còn mở cần PO chốt** (spec 01 mục 4, spec 06 mục 5): cách tính lương tài xế; nhà cung cấp hóa đơn điện tử và GPS đầu tiên; thời gian lưu dữ liệu GPS theo quy định; cách xử lý chi hộ trên hóa đơn; ngưỡng chính xác OCR; ai tạo bản ghi sự cố (D9).

---

## Phần J. Đoạn mô tả cho Claude Design

### Prompt 1: Hệ thống giao diện và 9 màn chính (đã làm)

Đã làm xong. Kết quả là trang Design System "TMS Container": https://claude.ai/artifact/CjQUJpYnuGH3UMTPgY3Ygw. Bản tải về nằm ở `designs/`:

- Token, `README.md`, logo và các thành phần: Alert, AppShell, Button, ContainerCard, Cover, DeadlineTimeline, EmptyState, Field, FilterTabs, StatusChip, TenantPicker, WorkTable.
- 9 màn: Screen01-Login, Screen02-Home, Screen03-Dispatch, Screen04-Orders, Screen05-FleetMap, Screen06-Fuel, Screen07-Reconcile, Screen08-CostAlloc, Screen09-DriverApp.

### Các màn spec có mà chưa thiết kế

| # | Màn | Mục PRD | GĐ |
|---|---|---|---|
| 1 | Người dùng và vai trò, Cấu hình công ty | E1, E2 | 0 |
| 2 | Danh mục: khách hàng, hãng tàu, nhà cung cấp, địa điểm và geofence, tuyến | E3 | 1 |
| 3 | Bảng giá cước, bảng phí 4 chiều, biểu DEM/DET, định mức dầu, nhập Excel | E4 | 1 |
| 4 | Đội xe: đầu kéo, rơ moóc, tài xế, giấy tờ sắp hết hạn, bảo dưỡng, thiết bị GPS | E5 | 2 |
| 5 | Ghép chuyến và tách chuyến (TWIN_20, COMBINED, Street Turn) | C5 | 2 |
| 6 | Rơ moóc đang thả, cứu hộ, bắn xe ngoài | C6 | 2 |
| 7 | Duyệt chứng từ EIR và ePOD (hàng đợi OCR) | C7 | 3 |
| 8 | Đăng nhập app tài xế và báo sự cố trên app | D1, D9 | 3 |
| 9 | Trang nộp chứng từ của nhà xe ngoài | D10 | 3 |
| 10 | Chi phí dọc đường và tạm ứng | C10 | 5 |
| 11 | Phí DEM/DET theo container | C12 | 5 |
| 12 | Lương tài xế: kỳ lương và sổ cái | C14 | 5 |
| 13 | Hóa đơn, thanh toán, tuổi nợ, công nợ phải trả, khóa kỳ | C15 | 5 |
| 14 | Báo cáo P&L và KPI | C16 | 6 |
| 15 | Trung tâm thông báo và cấu hình người nhận | C17 | 6 |
| 16 | Vận hành SaaS: tạo tenant, gói thuê bao, job lỗi, đăng nhập thay | E6 | 6 |

### Prompt 2: Các màn còn lại theo spec

Dùng sau Prompt 1, trong cùng dự án. Nếu quá dài, chạy phần A và B trước, phần C và D sau.

```text
Tiếp tục hệ thống giao diện "TMS Container" đã có trong dự án này (xanh dương, Swiss tối giản + Flat, Fira Sans và Fira Code, mặt trắng, viền mảnh, không bóng, sáng và tối). Hãy thiết kế các màn còn thiếu theo spec, dùng đúng token và thành phần đã có (AppShell, TenantPicker, Button, Field, FilterTabs, WorkTable, StatusChip, Alert, EmptyState, ContainerCard, DeadlineTimeline). Thêm vào cùng thư viện, cùng cách xem trước như Screen01–Screen09. KHÔNG sửa các màn đã có; cần biến thể thì tạo màn mới. Đặt đúng tên màn trong ngoặc để đối chiếu với code.

Quy tắc chung (như README hệ thống): web 1440px, dùng tốt ở 1366px; điện thoại 390×844. H1 nói số việc và mốc gần nhất bằng số thật, thời gian ghi cả giờ và thời gian còn lại. Không hiện 0 thay cho dữ liệu chưa có. Màu trạng thái luôn kèm icon và chữ. Số container, biển số, mã Order, mã chuyến, số chứng từ dùng font mono. Lỗi hiện dưới ô và nói làm gì tiếp. Mọi bảng có đủ 4 trạng thái: bình thường, đang tải (khung xương), trống (lý do và một hành động), lỗi (giữ dữ liệu cũ kèm giờ, nút Thử lại). Viền focus rõ, vùng bấm từ 44px. Dữ liệu mẫu dùng tiếp Vận tải Phúc An, Điều vận Nguyễn Văn Hùng, Kế toán Lê Thị Mai, tài xế Trần Văn Lộc xe 51C-482.17, tuyến Cát Lái – Sóng Thần, hãng tàu ONE, MSK, CMA, số cont đúng check digit ISO 6346, kỳ 10/2026.

A. Quản trị và danh mục
1. Người dùng và cấu hình (Screen10-TenantAdmin): bảng người dùng (vai trò Chủ công ty, Quản trị, Điều vận, Kế toán, Quản lý đội xe, Tài xế, Chỉ xem; trạng thái; lần đăng nhập cuối), Mời người dùng, đổi vai trò, khóa. Tab Cấu hình: múi giờ, phương pháp phân bổ mặc định (theo định mức, doanh thu, chia đều, km), mẫu đánh số, giờ job DEM/DET, dung sai dầu 5%, giờ lái 10 giờ/ngày và liên tục 4 giờ, bật tắt OCR, giá dầu niêm yết theo kỳ.
2. Danh mục (Screen11-MasterData): tab Khách hàng, Hãng tàu (công tắc "Cho phép đảo vỏ"), Nhà cung cấp, Địa điểm, Tuyến; bảng, tìm kiếm, form trong ngăn kéo phải, xóa mềm, báo trùng mã dưới ô. Địa điểm có loại, tọa độ, sơ đồ nhỏ vẽ vòng geofence nét đứt và ô bán kính 300 m.
3. Bảng giá (Screen12-Tariffs): tab Giá cước, Bảng phí, Biểu DEM/DET, Định mức dầu. Giá theo 4 chiều Tuyến, Loại cont, Chế độ chạy (SINGLE, TWIN_20, COMBINED), Khách hàng (riêng hoặc Giá chung), hiệu lực từ đến (trống là vô thời hạn). Bảng phí thêm mã phí, loại (định mức, phụ phí, chi hộ), cách tính, cờ "Miễn cho khách". Thanh tra thử: chọn tuyến, loại cont, chế độ, khách, ngày, xem bản ghi được chọn và mức ưu tiên 1–4, hoặc "Chưa có giá". Sửa giá đang hiệu lực mở hộp thoại "Đóng giá cũ, tạo giá mới". Nhập Excel: tải mẫu, xem trước, lỗi từng dòng và dòng chồng lấn, nút Nhập chỉ bật khi hết lỗi.
4. Đội xe (Screen13-Fleet): tab Đầu kéo, Rơ moóc, Tài xế, Giấy tờ sắp hết hạn, Bảo dưỡng, Thiết bị GPS. Đầu kéo có hạn đăng kiểm, bảo hiểm, phù hiệu, km hiện tại và km bảo dưỡng. Rơ moóc có "Chở được 2×20", "Có genset", tải trọng. Tài xế có GPLX và hạn, chứng chỉ hàng nguy hiểm, CCCD che bớt khi không có quyền. Giấy tờ hết hạn trong 15 ngày có chip "Sẽ chặn điều xe từ 25/10".

B. Điều vận nâng cao và chứng từ
5. Ghép chuyến (Screen14-TripCombine): mở từ Kanban khi chọn 2 container. Khung chuyến (TWIN_20, COMBINED hoặc Street Turn, đầu kéo, rơ moóc, chuỗi Stop sau ghép) và bảng kiểm tra luật, mỗi dòng Đạt, Cảnh báo hoặc Chặn có lý do: moóc chở được 2×20, tổng khối lượng so tải trọng (thiếu VGM bắt xác nhận), cùng hãng tàu và loại cont khi đảo vỏ, ô số chấp thuận của hãng tàu, rút hàng Nhập xong trước đóng hàng Xuất, cont lạnh cần genset, hàng nguy hiểm không ghép khác khách, HOLD hoặc chưa có EDO. "Ghép chuyến" chỉ bật khi hết dòng Chặn. Biến thể Tách chuyến: chuyến về SINGLE, chip "Cần tính lại giá", báo phân bổ sửa tay bị đặt lại.
6. Rơ moóc thả, cứu hộ, xe ngoài (Screen15-DropHookRescue): tab Rơ moóc đang thả (vị trí, số giờ đã nằm, viền cam quá 24 giờ, đỏ quá 48 giờ, "Điều xe móc rơ moóc"); tab Cứu hộ (sự cố có vị trí và ảnh, tỷ lệ hoàn thành đề xuất 40% sửa được kèm lý do, chọn xe đi cứu, lương chia 40/60); tab Xe ngoài (nhà xe, giá thuê, biển số và tên tài xế bắt buộc, "Gửi liên kết nộp chứng từ").
7. Duyệt chứng từ (Screen16-DocReview): hàng đợi AI đã khớp, Lệch, Độ tin cậy thấp, OCR lỗi có đếm số. Mỗi mục: ảnh EIR hoặc ePOD phóng to, bảng hai cột OCR đọc và Hệ thống (số cont, seal, loại cont, giờ EIR, biển số) kèm độ tin cậy, ô lệch ghi rõ hai giá trị. Nút Xác nhận, "Xác nhận tất cả mục AI đã khớp", Sửa giá trị, Yêu cầu chụp lại.

C. Điện thoại (cùng phong cách Screen09-DriverApp)
8. Đăng nhập và báo sự cố (Screen17-DriverLogin): đăng nhập bằng số điện thoại và mật khẩu, xin quyền vị trí và máy ảnh có lời giải thích. Báo sự cố: loại (hỏng xe, tai nạn, hư hỏng cont, bị phạt), ảnh, vị trí tự lấy, ghi chú, Gửi; mất sóng thì vào hàng chờ.
9. Nộp chứng từ nhà xe ngoài (Screen18-SubcontractUpload): trang mở bằng liên kết, tên nhà xe, biển số, hạn liên kết; đúng các container được giao, mỗi cont có ô chụp EIR và ePOD, trạng thái Đã nộp hoặc Chưa nộp; trạng thái liên kết hết hạn.

D. Kế toán, báo cáo, vận hành
10. Chi phí dọc đường (Screen19-RoadExpenses): hàng đợi chờ duyệt theo chuyến, ảnh hóa đơn, loại, số tiền, người trả (tiền mặt tài xế, thẻ công ty, tạm ứng), chip "Chi hộ, thu lại của khách"; Duyệt, Từ chối kèm lý do. Tab Tạm ứng: số dư từng tài xế, Cấp tạm ứng, Ghi hoàn ứng.
11. Phí DEM/DET (Screen20-DemDet): bảng container với hạn miễn phí DEM, DET, Storage, số ngày quá, số tiền, chip Dự tính hoặc Đã chốt, cột "Ai chịu" (Khách hoặc Công ty); nhóm sắp hết hạn trong 24 và 48 giờ ở trên. Đổi ai chịu kèm lý do, nhập số theo hóa đơn hãng tàu, "Mở trên Kanban".
12. Lương tài xế (Screen21-Payroll): kỳ lương (Mở, Đã tính, Đã duyệt, Đã chi); bảng Lương chuyến, Phụ cấp, Tạm ứng, Phạt, Thực lãnh; sổ cái một tài xế có tham chiếu chuyến, phiếu dầu, chi phí. Không có nút sửa hay xóa dòng, chỉ "Tạo bút toán đảo". Kỳ đã duyệt chỉ xem.
13. Hóa đơn và công nợ (Screen22-Invoices): container đủ điều kiện (đã đối soát, đủ ePOD); hóa đơn nháp gom nhiều Order một khách, dòng cước, phụ phí, chi hộ tách riêng, VAT; trạng thái Nháp, Đã phát hành, Thanh toán một phần, Đã thanh toán; ghi thanh toán và cấn trừ; tuổi nợ 0–30, 31–60, 61–90, trên 90 ngày; bảng kê phải trả; kỳ kế toán với "Khóa kỳ" và "Mở lại kỳ" (chỉ Quản trị).
14. Báo cáo (Screen23-Reports): P&L theo Order, Khách hàng, Xe, Tài xế, Tuyến (doanh thu, chi phí định mức và thực tế, số hệ thống và số Kế toán đã sửa, lãi lỗ); tỷ lệ km rỗng; chuyến mỗi xe mỗi ngày; công nợ quá hạn. Biểu đồ có bảng thay thế. Xuất Excel.
15. Thông báo (Screen24-Notifications): ngăn mở từ thanh trên, nhóm theo loại (free time 48 và 24 giờ, cut-off, giấy tờ, vượt định mức dầu, xung đột đồng bộ, sự cố xe, mất tín hiệu); màn cấu hình người nhận theo sự kiện và kênh (trong app, email, Zalo/SMS).
16. Vận hành SaaS (Screen25-SaasOps): danh sách tenant với gói và trạng thái (Hoạt động, Tạm ngưng chỉ đọc, Đã đóng); trình tạo tenant (thông tin, tài khoản Chủ công ty, cấu hình, nhập danh mục Excel mẫu); hạn mức gói (xe, người dùng, lượt OCR) có cảnh báo; bảng job lỗi có nút chạy lại; "Đăng nhập thay để hỗ trợ" với thời hạn và lý do bắt buộc.

Mọi giá trị mới đặt tên thành token và có trong trang tổng hợp hệ thống giao diện. Cuối cùng, liệt kê lại tên 16 màn vừa thêm theo đúng số thứ tự để tôi đối chiếu.
```
