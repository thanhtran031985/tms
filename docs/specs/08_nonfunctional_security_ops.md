# [BỔ SUNG] Yêu cầu Phi chức năng, Bảo mật & Vận hành
Bản gốc chưa có tài liệu này. Đây là các yêu cầu áp dụng cho mọi phân hệ.

## 1. Quy mô & Hiệu năng mục tiêu (MVP)
| Chỉ số | Mục tiêu |
|---|---|
| Số tenant | 50 |
| Xe/tenant | tới 500 đầu kéo |
| Điểm GPS | 500 xe × 1 điểm/10 giây/tenant lớn nhất |
| Kanban tải lần đầu | < 2 giây với 300 thẻ trong ngày |
| Server Action điều vận | p95 < 500 ms |
| Độ trễ vị trí trên bản đồ | < 30 giây |
| Uptime | 99,5%/tháng |

## 2. Bảo mật
- **Xác thực:** mật khẩu băm (argon2/bcrypt), khóa tạm sau N lần sai, phiên hết hạn; 2FA cho role `OWNER`/`ADMIN`/`ACCOUNTANT` (giai đoạn 2). App tài xế dùng access token ngắn hạn + refresh token, thu hồi được khi tài xế nghỉ việc.
- **Phân quyền:** ma trận quyền tập trung (file 01 Rule 4). Ví dụ: chỉ `ACCOUNTANT` duyệt chi phí/phiếu dầu và tạo `PENALTY`; chỉ `ADMIN` sửa bảng giá đang hiệu lực; `DRIVER` chỉ truy cập API tài xế.
- **Server Actions:** luôn kiểm tra quyền bên trong action; bật kiểm tra Origin (mặc định của Next.js) và không tắt.
- **Tenant isolation:** ADR-003; thêm kiểm tra tự động trong CI (test tích hợp đa tenant cho mọi repository).
- **File:** chỉ truy cập qua Signed URL hạn ngắn, kiểm tra quyền trước khi cấp; giới hạn kích thước và loại file; quét bỏ file không phải ảnh/PDF.
- **API GPS & tích hợp:** API key theo thiết bị/nhà cung cấp, lưu dạng hash; rate-limit; nhật ký truy cập.
- **Bí mật:** khóa API (AI, hóa đơn điện tử, GPS) lưu trong secret manager, không commit; khóa riêng của từng tenant (nếu tenant tự cấu hình tích hợp) được mã hóa khi lưu.
- **Dữ liệu cá nhân:** tài xế (CCCD, GPLX, SĐT, vị trí), người nhận hàng (chữ ký, ảnh). Cần: điều khoản xử lý dữ liệu trong hợp đồng SaaS, thông báo/đồng ý với tài xế về việc theo dõi vị trí, phân quyền xem, xuất/xóa dữ liệu theo yêu cầu, tuân thủ quy định hiện hành về bảo vệ dữ liệu cá nhân (cần pháp chế rà soát).
- **Kiểm thử bảo mật:** rà soát OWASP Top 10 trước khi go-live; dependency scanning trong CI.

## 3. Độ tin cậy & Dữ liệu
- **Backup MariaDB:** full hằng ngày + binlog để khôi phục theo thời điểm (PITR); giữ tối thiểu 30 ngày; **diễn tập khôi phục** mỗi quý.
- **Redis:** bật AOF; mất Redis chỉ được phép mất vị trí realtime và job đang chờ có thể chạy lại, không mất dữ liệu tài chính.
- **Object storage:** bật versioning; vòng đời lưu ảnh chứng từ theo thời hạn lưu trữ chứng từ kế toán do tenant cấu hình.
- **Migration:** chỉ dùng migration có version (drizzle-kit generate + review SQL), không dùng `push` trên production; migration phải tương thích ngược một phiên bản để deploy không downtime.
- **Job:** retry có backoff, dead-letter queue, màn hình xem job lỗi cho admin.

## 4. Quan sát hệ thống (Observability)
- Log có cấu trúc (JSON) kèm `tenantId`, `userId`, `requestId`; không log dữ liệu cá nhân hay token.
- Theo dõi lỗi (Sentry hoặc tương đương) cho web, worker, app tài xế.
- Metrics: độ trễ action, số lỗi theo mã, lag Redis Stream, số job lỗi, số thiết bị GPS mất kết nối, chi phí gọi AI theo tenant.
- Cảnh báo (alert) khi: lag GPS > 5 phút, tỷ lệ lỗi > 2%, job DEM/DET không chạy, backup thất bại.

## 5. Triển khai
- Môi trường: `dev` → `staging` (dữ liệu giả) → `production`.
- Web (Next.js) và Worker deploy độc lập, cùng phiên bản `packages/core`.
- MariaDB và Redis dùng dịch vụ được quản lý hoặc có replica; đặt cùng region với ứng dụng (ưu tiên đặt tại Việt Nam nếu yêu cầu lưu trữ dữ liệu trong nước — cần pháp chế xác nhận).
- Báo cáo nặng chạy trên read replica khi dữ liệu lớn.

## 6. Vận hành SaaS
- **Onboarding tenant:** tạo tenant, user OWNER, cấu hình múi giờ/đánh số/phương pháp phân bổ, import danh mục (khách, xe, tài xế, tuyến, bảng giá) bằng Excel mẫu.
- **Gói thuê bao:** giới hạn theo gói (số xe, số user, OCR/tháng); vượt giới hạn thì cảnh báo, không khóa dữ liệu.
- **Tạm ngưng / chấm dứt:** tenant `SUSPENDED` chỉ đọc; khi chấm dứt cho xuất toàn bộ dữ liệu rồi xóa theo thời hạn hợp đồng.
- **Hỗ trợ:** nhân viên hỗ trợ truy cập tenant phải qua cơ chế "impersonate" có ghi audit và có thời hạn.

## 7. Trải nghiệm & Khả năng sử dụng
- Giao diện tiếng Việt; định dạng số/tiền/ngày theo vi-VN; hiển thị giờ theo múi giờ tenant.
- Kanban và bảng dữ liệu dùng tốt trên màn hình 1366px (máy văn phòng phổ biến).
- App tài xế: nút lớn, ít bước, chạy được trên điện thoại Android tầm trung, hoạt động khi sóng yếu.
