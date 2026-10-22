# Danh sách task

Bảng tổng các task của dự án, chia theo giai đoạn GĐ0–GĐ6 trong `docs/PRD.md` Phần I. Mỗi thư mục có một `task.md` (Mục tiêu, Phạm vi, Thiết kế, Quyết định kiến trúc, Các bước có Kiểm tra). Bảng này là nguồn của `pnpm tasks:dashboard`: giữ đúng các cột `#`, `Task`, `Trạng thái`, `Phụ thuộc`, `Nhánh git`.

| # | Task | Trạng thái | Phụ thuộc | Nhánh git |
|---|---|---|---|---|
| 00 | [00-monorepo-setup](00-monorepo-setup/task.md) — Monorepo, CI và môi trường | ✅ | — | `feat/00-monorepo-setup` |
| 01 | [01-auth-tenant](01-auth-tenant/task.md) — Đăng nhập, tenant và phân quyền | ✅ | 00 | `feat/01-auth-tenant` |
| 02 | [02-master-data](02-master-data/task.md) — Danh mục cơ bản | ✅ | 01 | `feat/02-master-data` |
| 03 | [03-pricing-engine](03-pricing-engine/task.md) — Bảng giá và 4D Pricing Engine | ✅ | 02 | `feat/03-pricing-engine` |
| 04 | [04-orders-containers](04-orders-containers/task.md) — Order nhiều container và tự sinh Stop | ✅ | 02, 03 | `feat/04-orders-containers` |
| 05 | [05-fleet-drivers](05-fleet-drivers/task.md) — Đội xe, tài xế và giấy tờ | 🔄 | 02 | `feat/05-fleet-drivers` |
| 06 | [06-dispatch-single](06-dispatch-single/task.md) — Điều vận SINGLE, khóa bi quan và chống chồng lấn | ⬜ | 04, 05 | `feat/06-dispatch-single` |
| 07 | [07-dispatch-kanban](07-dispatch-kanban/task.md) — Giao diện Kanban điều vận | ⬜ | 06 | `feat/07-dispatch-kanban` |
| 08 | [08-trip-combining](08-trip-combining/task.md) — Ghép chuyến TWIN_20, COMBINED, Street Turn và tách chuyến | ⬜ | 06, 07 | `feat/08-trip-combining` |
| 09 | [09-drop-hook-rescue](09-drop-hook-rescue/task.md) — Drop & Hook, cứu hộ và bắn xe ngoài | ⬜ | 06 | `feat/09-drop-hook-rescue` |
| 10 | [10-driver-app](10-driver-app/task.md) — API tài xế và app Expo (online) | ⬜ | 06 | `feat/10-driver-app` |
| 11 | [11-driver-offline-sync](11-driver-offline-sync/task.md) — Offline-first và đồng bộ app tài xế | ⬜ | 10 | `feat/11-driver-offline-sync` |
| 12 | [12-ocr-epod](12-ocr-epod/task.md) — OCR chứng từ và xác nhận ePOD | ⬜ | 10 | `feat/12-ocr-epod` |
| 13 | [13-gps-pipeline](13-gps-pipeline/task.md) — Pipeline GPS (Redis Stream + MariaDB partition) | ⬜ | 05 | `feat/13-gps-pipeline` |
| 14 | [14-geofence-waiting](14-geofence-waiting/task.md) — Geofence và tính giờ chờ | ⬜ | 06, 13 | `feat/14-geofence-waiting` |
| 15 | [15-fuel-vouchers](15-fuel-vouchers/task.md) — Phiếu dầu và cảnh báo định mức | ⬜ | 05, 13 | `feat/15-fuel-vouchers` |
| 16 | [16-road-expenses](16-road-expenses/task.md) — Chi phí dọc đường và tạm ứng | ⬜ | 06, 10 | `feat/16-road-expenses` |
| 17 | [17-trip-cost-allocation](17-trip-cost-allocation/task.md) — Chi phí chuyến và phân bổ theo định mức | ⬜ | 15, 16 | `feat/17-trip-cost-allocation` |
| 18 | [18-dem-det-fees](18-dem-det-fees/task.md) — Phí DEM/DET tự động | ⬜ | 03, 04, 14 | `feat/18-dem-det-fees` |
| 19 | [19-reconciliation](19-reconciliation/task.md) — Đối soát split-view (khách hàng, cây xăng, nhà xe ngoài) | ⬜ | 17, 18 | `feat/19-reconciliation` |
| 20 | [20-driver-payroll](20-driver-payroll/task.md) — Sổ cái lương tài xế và kỳ lương | ⬜ | 16, 17 | `feat/20-driver-payroll` |
| 21 | [21-invoicing](21-invoicing/task.md) — Hóa đơn, thanh toán và khóa kỳ | ⬜ | 19 | `feat/21-invoicing` |
| 22 | [22-reports-kpi](22-reports-kpi/task.md) — Báo cáo P&L và KPI | ⬜ | 17, 21 | `feat/22-reports-kpi` |
| 23 | [23-notifications](23-notifications/task.md) — Thông báo | ⬜ | 06 | `feat/23-notifications` |
| 24 | [24-production-readiness](24-production-readiness/task.md) — Sẵn sàng production | ⬜ | 00–23 | `feat/24-production-readiness` |

Thiết kế đã có cho 9 màn (`designs/components/Screen01`–`Screen09`). Các màn danh mục, bảng giá, đội xe, lương, hóa đơn và báo cáo chưa có màn riêng: dựng từ thành phần `WorkTable`, `Field`, `FilterTabs`, `Alert`, `EmptyState`, hoặc thiết kế thêm bằng Prompt 2 ở PRD Phần J trước khi làm giao diện.

## Thứ tự làm đề xuất
1. **00 → 01** dựng nền: monorepo, Docker, CI, token giao diện, đăng nhập, tenant, phân quyền.
2. **02 → 03 → 04** danh mục, bảng giá và Order nhiều container. Xong 04 là nhập được đơn hàng thật.
3. **05 → 06 → 07** đội xe, điều vận lõi và bảng Kanban. Xong 07 là điều xe hằng ngày được.
4. **08, 09** ghép chuyến, drop & hook, cứu hộ.
5. **10 → 11 → 12** app tài xế, chạy offline, ePOD.
6. **13 → 14 → 15** GPS, geofence, phiếu dầu.
7. **16 → 21** chi phí, phân bổ, DEM/DET, đối soát, lương, hóa đơn.
8. **22 → 24** báo cáo, thông báo, sẵn sàng production.

13 có thể làm song song với 06–09 vì chỉ phụ thuộc 05.

## Điểm cần quyết định
- **Order và container:** đã chốt (16/10/2026) một Order là một Booking/B/L có nhiều container; container là đơn vị điều vận, tính giá, DEM/DET và ePOD (task 04).
- **Phân bổ chi phí chuyến:** đã chốt (16/10/2026) mặc định theo định mức, Kế toán được sửa, tổng phải khớp, bắt buộc lý do, lưu cả số hệ thống và số đã sửa (task 17).
- **Giao diện:** đã chốt (21/10/2026) hướng xanh dương, Fira Sans + Fira Code (`designs/`).
- **Thư viện đăng nhập:** Auth.js hay better-auth, chốt ở Plan mode của task 01.
- **Dịch vụ OCR và nhà cung cấp GPS:** chốt trong Plan mode của task 12 và task 13.
- **Màn chưa có thiết kế:** quyết định thiết kế thêm (Prompt 2, PRD Phần J) hay dựng từ thành phần có sẵn trước khi làm giao diện của 02, 03, 05, 20, 21, 22.
- **Lương tài xế:** tính theo chuyến, theo km hay kết hợp; lương Drop & Hook theo đơn giá DROP/HOOK hay theo phần trăm hoàn thành; làm tròn khi chia lương cứu hộ (spec 01 mục 4; task 09, 20).
- **Quan hệ chuyến và Stop:** đề xuất mỗi Stop một assignment cùng tài nguyên và khung giờ chuyến, kiểm tra chồng lấn bỏ qua assignment cùng chuyến (task 06). Cần duyệt trước khi làm 06.
- **Ma trận quyền:** role nào ghi danh mục, tạo và import giá, duyệt phụ phí giờ chờ, duyệt kỳ lương, khóa kỳ kế toán (task 02, 03, 14, 20, 21). Mỗi task đề xuất trong Plan mode.
- **Schema còn thiếu cột:** khóa đăng nhập sai 5 lần, chứng chỉ hàng nguy hiểm, khối lượng đầu kéo, giờ geofence, dung tích bình dầu, bảng đối soát và thông báo. Task nào cần thì thêm cột, sửa spec 02 và ghi `decisions.md`.
- **Thiết kế khác spec:** loại cont 20GP/40GP (thiết kế) hay 20DC/40DC (spec 02); đăng nhập chỉ email (thiết kế) hay email hoặc SĐT (spec); "giữ hay áp giá mới" khi tính lại giá (thiết kế) hay tự tính lại (spec 06).
- **Ngưỡng do PO chốt:** độ chính xác OCR (task 12), % lệch giá dầu niêm yết (task 15), thời gian lưu GPS theo quy định (task 13), cách xử lý chi hộ trên hóa đơn (task 16, 21).
- **Thư viện cần hỏi trước khi cài:** `fast-check` cho property test phân bổ (task 17), thư viện đọc ghi Excel (task 03, 19).

Mỗi `decisions.md` của task liệt kê chi tiết các câu hỏi còn mở của task đó.
