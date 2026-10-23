# Quyết định 04-orders-containers

## Đã chốt
<!-- Quyết định đã chốt trước khi làm (nếu có), kèm ngày. -->
- 1 Order = 1 Booking/B/L chứa nhiều container (`order_containers`); container là đơn vị điều vận, tính giá, DEM/DET, ePOD và nhận chi phí phân bổ (16/10/2026, PO; spec 01 mục 3 "[SỬA theo PO 16/10]", spec 02 nhóm 5).
- Phạm vi MVP chỉ hỗ trợ hàng FCL; LCL ngoài phạm vi (spec 00 mục 1; spec không ghi ngày chốt).
- Giao diện theo Design System "TMS Container" phiên bản token 2, hướng xanh dương thiết kế lại theo ui-ux-pro-max (21/10/2026, `docs/DESIGN_SYSTEM.md`); chỉ dùng token, không tự đặt mã màu.

## Phát sinh khi làm
<!-- Chỗ làm khác task.md, spec hoặc thiết kế: lý do, ai đồng ý, đã sửa spec chưa. -->
Ngày 22/10/2026, trong Plan mode và khi làm. "Người dùng chọn" nghĩa là đã trả lời câu hỏi trong Plan mode; còn lại là tự suy ra từ spec và thiết kế, cần PO xem lại.

**Quyết định của người dùng**
- **DOMESTIC: thêm bảng `route_stop_templates`** (`routeId`, `sequenceNo`, `stopType`, duy nhất theo `(routeId, sequenceNo)`) thay vì mẫu cố định hoặc chọn tay trên form. Đơn Nội địa sinh Stop theo mẫu của tuyến; tuyến chưa có mẫu thì tạo Order bị chặn kèm lời nhắc cấu hình. Sửa mẫu ở ngăn kéo sửa tuyến (Danh mục, task 02) bằng Server Action `setRouteStopTemplate` (quyền `masterData.write`, có audit). Đã bổ sung vào spec 02.

**Suy ra từ spec và thiết kế (báo cáo, không cần dừng)**
- **`orderNo`** `{IMP|EXP|DOM}-{YYMM}-{NNN}` (vd. `EXP-2610-044`) theo dữ liệu mẫu thiết kế; YYMM theo múi giờ tenant, bộ đếm `nextNumber` khóa `ORD:<chiều>:<YYMM>` riêng theo tenant, chiều, tháng. Seed đẩy bộ đếm lên sau các số mẫu để Order mới không trùng. Đã ghi vào spec 02 mục 1.
- **Ngày tra giá (`targetDate`)**: ngày của `windowStart` Stop đầu theo múi giờ tenant; chưa hẹn thì `eta` (Nhập, Nội địa) hoặc `cutOffAt` (Xuất); cuối cùng là ngày xác nhận. Form tạo Order có ô "Hẹn Stop đầu". Đã ghi vào spec 06 mục 2.
- **Địa điểm của Stop**: tuyến chỉ có vùng (zone) chứ không có địa điểm, nên form có 3 ô tùy chọn (điểm lấy, điểm đóng/dỡ hàng, điểm hạ/trả) gán vào Stop theo loại; bỏ trống thì `locationName` lấy tên vùng của tuyến. Thêm container sau này sao chép địa điểm và giờ hẹn từ container đầu của Order.
- **Giá chốt = có `freightTariffId` hoặc `isManualPrice`.** `baseFreightAmount = 0.00` của container chưa chốt chỉ là giá trị đệm của cột, giao diện không bao giờ hiện (ADR-005). Order nháp hiện **giá dự kiến**: `previewPrices` tra Pricing Engine không ghi gì, nên bảng có container cụ thể "Giá dự kiến" hoặc "Chưa có giá"; giá chỉ chốt (snapshot) khi xác nhận. Thiết kế Screen04 cũng hiện tổng và "+ 1 cont chưa có giá" cho Order nháp.
- **Xác nhận là tất cả hoặc không gì**: còn container chưa có giá và chưa có giá tay thì `PRICE_MISSING` (kèm `details.lines`), không ghi gì. Thêm container vào Order đã xác nhận theo cùng quy tắc (kèm giá tay tùy chọn từng dòng). Phí `PER_KM` nhân `standardDistanceKm` của tuyến; phí `PER_DAY` chưa tính ở bước xác nhận (DEM/DET, task 18); `COST_NORM` không ghi vào `order_fees`.
- **Tổng tiền Order** tính lại trong cùng transaction: cước = cont chưa hủy; phụ thu = phụ phí cont chưa hủy + `CANCELLATION_FEE` của cont đã hủy; chi hộ tách riêng và không vào doanh thu. Chi phí và lãi lỗ hiện "Chưa có chi phí", "Chưa tính được", không hiện 0 (task 17, 22).
- **Phí hủy** là dòng `order_fees` (`REVENUE_SURCHARGE`, `CANCELLATION_FEE`, `source MANUAL`), bắt buộc > 0 khi container đã có Stop hoàn thành; Stop chưa chạy chuyển `SKIPPED`; container `DELIVERED`/`COMPLETED` không hủy được. Hủy Order là tất cả hoặc không gì; Order chỉ `CANCELLED` khi mọi container đã hủy, còn container đã giao thì Order giữ trạng thái. Bớt container (xóa cứng cont và Stop, đánh lại số dòng) chỉ với Order nháp; Order đã xác nhận thì hủy container.
- **Khóa lạc quan**: mọi thao tác kiểm `orders.version` (một thao tác tăng một lần), kể cả thao tác trên một container; `order_containers.version` cũng tăng khi container đổi nhưng chưa dùng để so. Giao diện khóa nút ghi trong lúc nạp lại dữ liệu để không gửi version cũ.
- **Quyền**: thêm `order.view` (mọi vai trò web), `order.manualPrice` (Quản trị, Điều vận, Kế toán), và đưa `OWNER` vào `order.write` theo task.md. PRD A4 ghi "theo ma trận" cho Chủ công ty ghi Order nên **cần PO xác nhận**. Chủ công ty xác nhận được Order nhưng không nhập được giá tay (task.md không liệt kê).
- **Giá tay "chờ Kế toán duyệt"** (Screen04): chỉ có chip "Giá tay", lý do và audit `MANUAL_PRICE`; luồng duyệt không thuộc task.md nên để task sau.
- **Nhãn loại container** hiển thị đúng mã spec 02 (`20DC`, `40HC`…), nhất quán với màn bảng giá task 03; thiết kế ghi `20GP`/`40GP`. Không đổi enum.
- **Trùng số container**: trong cùng Order là lỗi theo dòng; với container đang hoạt động ở Order khác chỉ cảnh báo (hiện trên chi tiết Order, không chặn). IMPORT bắt buộc có số container; EXPORT và DOMESTIC được để trống.
- **Mã lỗi mới**: `INVALID_STATUS_TRANSITION`, `PRICE_MISSING`, `CANCEL_FEE_REQUIRED`. **Audit** dùng entity `orders` cho cả thay đổi container và phí: `CREATE`, `UPDATE` (kèm `change` = `ADD_CONTAINERS`/`REMOVE_CONTAINER`), `STATUS_CHANGE`, `CONFIRM`, `MANUAL_PRICE`, `CANCEL_CONTAINER`.
- **ISO 6346** đặt ở `packages/shared` như task.md, nhưng test đặt ở `packages/core/modules/orders` vì `packages/shared` chưa có vitest (cài thêm cần hỏi trước). Lệnh `--filter shared` trong task.md vì thế không chạy được; dùng `pnpm test --filter core -- iso6346`.
- **Danh sách Order** tải đủ rồi lọc và đếm tab ở client, chưa phân trang (như task 02, 03). "Import" danh sách container hiểu là dán từ Excel hoặc email vào ô dán, không có đường tải file riêng. "Xuất Excel" trên thiết kế thuộc task 22. "Sửa thông tin chung" trên thiết kế không có trong task.md nên chưa làm.
- **Giao diện**: thêm token `--container-cell-sm|cell|cell-lg` (120, 176, 240 px) cho độ rộng tối thiểu ô nhập trong bảng dòng container; thêm `lib/deadline.ts` (mức hạn crit dưới 3 giờ hoặc HOLD, warn trong 8 giờ, info xa hơn) và nhãn Order, container, cảng, Stop trong `packages/shared/labels.ts`.
- **Layout Dash Mantine Components (23/10/2026)**: Tái cấu trúc layout màn danh sách Order (`OrderList`) theo hệ thống component Mantine (v8 / Dash Mantine Components): bổ sung cụm 4 thẻ KPI Stat Cards thống kê thời gian thực (Cần điều vận, Đang vận chuyển, Đơn nháp/Chờ chốt, Doanh thu tạm tính); thanh lọc Paper tích hợp Mantine Tabs (SegmentedControl) kèm badge số lượng và lưới lọc linh hoạt; bảng Mantine Table hỗ trợ dòng mở rộng lồng Container Mini Table trong thẻ Paper riêng; thanh thao tác hàng loạt dạng Floating Banner. Toàn bộ triển khai bằng Design Tokens và Tailwind CSS hiện có, tuân thủ TypeScript strict và chuẩn React 19.

**Câu hỏi mở cho PO**
- `OWNER` có ghi Order không (đang có theo task.md; PRD A4 "theo ma trận")?
- Giá tay có cần Kế toán duyệt trước khi lập hóa đơn không, và duyệt ở đâu (task nào)?
- Hủy Order còn container đã giao: Order giữ trạng thái hiện tại (đang làm) hay có trạng thái riêng?
- Có muốn phân trang danh sách Order khi số Order lớn không?
