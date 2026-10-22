# Quản lý Bảng Giá, Bảng Phí Phân Cấp 4 Chiều & Phân bổ Chi phí

## 1. Ma trận Giá & Phí 4 Chiều (4D Matrix)
Cả `freight_tariffs` (Giá cước thu khách) và `fee_tariffs` (Định mức chi phí nội bộ, Phụ phí và **[BỔ SUNG]** phí Chi hộ) được tra cứu theo 4 chiều:
`route_id` (Tuyến đường) + `container_type` (Loại cont) + `trip_mode` (SINGLE | TWIN_20 | COMBINED) + `customer_id` (Khách hàng riêng hoặc NULL cho giá chung).

**[BỔ SUNG] Ràng buộc dữ liệu khi lưu bảng giá/phí:**
- Không được có 2 bản ghi `isActive = true` cùng khóa (4 chiều, + `feeCode` với bảng phí) có khoảng hiệu lực chồng lấn. Kiểm tra trong Service trong transaction có khóa (`SELECT ... FOR UPDATE` các bản ghi cùng khóa) vì MariaDB không có exclusion constraint.
- Sửa giá đang hiệu lực = đóng bản ghi cũ (`validTo = ngày trước`) + tạo bản ghi mới; không sửa trực tiếp `basePrice` của bản ghi đã từng được dùng để snapshot.
- Có màn hình import bảng giá từ Excel với bước xem trước và báo lỗi theo từng dòng.
- `fee_tariffs.routeId = NULL` nghĩa là áp mọi tuyến (phí nâng hạ theo cảng, phí đảo vỏ...). Khi tra cứu, bản ghi có `routeId` cụ thể được ưu tiên hơn bản ghi `routeId = NULL` ở cùng mức priority.

## 2. Thứ tự Ưu tiên Fallback trong 1 Câu Query SQL (4-Level Priority)
Khi tra cứu Giá cước hoặc Bảng phí, tuyệt đối không viết nhiều câu query rời rạc. Sử dụng 1 query duy nhất lọc hiệu lực và sắp xếp ORDER BY theo điểm ưu tiên:

- **Priority 0 (Ưu tiên cao nhất):** `customer_id = :customerId AND trip_mode = :tripMode` (Giá/Phí ghép hoặc kết hợp thỏa thuận riêng cho khách hàng).
- **Priority 1:** `customer_id IS NULL AND trip_mode = :tripMode` (Giá/Phí ghép hoặc kết hợp theo biểu chuẩn của công ty).
- **Priority 2:** `customer_id = :customerId AND trip_mode = 'SINGLE'` (Khách hàng có giá riêng nhưng không có ưu đãi khi ghép/kết hợp → lấy giá riêng đi đơn).
- **Priority 3 (Fallback cuối cùng):** `customer_id IS NULL AND trip_mode = 'SINGLE'` (Giá/Phí đi đơn niêm yết chung).

> **[SỬA] Lỗi trong mẫu code gốc:** biểu thức `CASE WHEN custCol IS NOT NULL ...` chỉ đúng nếu mệnh đề `WHERE` đã giới hạn `customer_id IN (:customerId, NULL)` và `trip_mode IN (:tripMode, 'SINGLE')`. Bản gốc không ghi rõ điều kiện này, AI rất dễ sinh query trả về **giá riêng của khách hàng khác** với priority 0. Ngoài ra `validTo` có thể `NULL` (vô thời hạn) nên điều kiện `validFrom <= targetDate <= validTo` sẽ loại mất các bản ghi đó.

**Mẫu Code Drizzle ORM cho Pricing Engine (`packages/core/modules/billing/pricing-engine.ts`) [SỬA]:**
```typescript
import { and, eq, or, isNull, lte, gte, desc, sql, inArray } from 'drizzle-orm';

type LookupKey = {
  routeId: string; containerType: ContainerType; tripMode: TripMode;
  customerId: string; targetDate: string; // 'YYYY-MM-DD' theo múi giờ tenant
};

const priorityExpr = (custCol: AnyColumn, modeCol: AnyColumn, targetMode: TripMode) => sql<number>`
  CASE
    WHEN ${custCol} IS NOT NULL AND ${modeCol} = ${targetMode} THEN 0
    WHEN ${custCol} IS NULL     AND ${modeCol} = ${targetMode} THEN 1
    WHEN ${custCol} IS NOT NULL AND ${modeCol} = 'SINGLE'      THEN 2
    ELSE 3
  END`;

export async function resolveFreight(ctx: TenantCtx, k: LookupKey) {
  const t = freightTariffs;
  const rows = await ctx.db.select().from(t).where(and(
    eq(t.tenantId, ctx.tenantId),
    eq(t.routeId, k.routeId),
    eq(t.containerType, k.containerType),
    inArray(t.tripMode, k.tripMode === 'SINGLE' ? ['SINGLE'] : [k.tripMode, 'SINGLE']),
    or(eq(t.customerId, k.customerId), isNull(t.customerId)),   // BẮT BUỘC
    eq(t.isActive, true),
    lte(t.validFrom, k.targetDate),
    or(isNull(t.validTo), gte(t.validTo, k.targetDate)),        // BẮT BUỘC xử lý NULL
  ))
  .orderBy(priorityExpr(t.customerId, t.tripMode, k.tripMode), desc(t.validFrom))
  .limit(1);

  if (!rows[0]) return { ok: false, code: 'TARIFF_NOT_FOUND' } as const; // KHÔNG trả 0
  return { ok: true, data: rows[0] } as const;
}
```

**Ghi đè từng phần cho Bảng Phí (Granular Fee Override):** Đối với `fee_tariffs`, cùng điều kiện `WHERE` như trên (thêm `or(eq(routeId, k.routeId), isNull(routeId))`), sắp xếp theo `priorityExpr`, rồi `routeId IS NULL` sau cùng, rồi `desc(validFrom)`; dùng `Map<feeCode, FeeTariff>` để giữ lại bản ghi xuất hiện đầu tiên của mỗi `feeCode` (DRIVER_SALARY, TOLL_FEE, LIFT_FEE...). Nhờ đó, nếu khách hàng A chỉ có ngoại lệ ở đúng 1 mã phí, các mã phí còn lại sẽ tự động lấy từ bảng phí chung. **[BỔ SUNG]** Nếu bản ghi thắng có `isExcluded = true` thì mã phí đó bị bỏ khỏi kết quả (khách được miễn), không fallback xuống bảng chung.

**[BỔ SUNG] Test bắt buộc cho Pricing Engine** (bảng ví dụ, mỗi dòng một test):
| Tình huống | Kỳ vọng |
|---|---|
| Có giá riêng TWIN_20 của khách A, tra TWIN_20 cho khách A | Priority 0 |
| Chỉ có giá riêng TWIN_20 của khách B, tra cho khách A | KHÔNG lấy giá của B |
| Bản ghi `validTo = NULL` | Được chọn |
| Hai bản ghi cùng khóa, khác `validFrom` | Lấy `validFrom` mới nhất ≤ ngày tra |
| Không có bản ghi nào | `TARIFF_NOT_FOUND` |
| Khách A có `isExcluded` cho `LIFT_FEE` | Không có `LIFT_FEE` trong kết quả |
| Ngày tra cứu sát nửa đêm theo giờ VN | Dùng ngày theo múi giờ tenant, không theo UTC |

**[BỔ SUNG] Ngày dùng để tra giá (`targetDate`):** mặc định là ngày của Stop đầu tiên theo kế hoạch (ngày thực hiện dịch vụ), không phải ngày tạo đơn. Cấu hình được theo tenant.
**[BỔ SUNG task 04] Khi Stop đầu chưa hẹn giờ (`windowStart` rỗng):** lấy `eta` của Order (Nhập, Nội địa) hoặc `cutOffAt` (Xuất); nếu cũng không có thì lấy ngày xác nhận Order. Mọi ngày tính theo múi giờ tenant. Order nháp hiện giá dự kiến bằng cùng cách tra nhưng không ghi gì; giá chỉ chốt (snapshot) khi xác nhận.

## 3. Tách biệt Doanh thu (Container/Order) và Chi phí (Consolidated Trip) khi Ghép/Kết hợp Cont
Khi Điều vận gom 2 đơn hàng vào 1 `consolidated_trips` (TWIN_20 hoặc COMBINED):

### Doanh thu (AR - Tính trên từng container, cộng lên Order)
**[SỬA]** Vì 1 Order có nhiều container (có thể khác loại cont, khác tuyến), Pricing Engine tra giá **cho từng `order_containers`** và lưu snapshot vào `order_containers.baseFreightAmount`; `orders.totalFreightAmount` là tổng.
- Nếu 2 container ghép chung chuyến thuộc cùng 1 khách hàng (cùng Order hoặc 2 Order khác nhau của cùng khách): Tra cứu `freight_tariffs` với `tripMode = 'TWIN_20'` (hoặc `'COMBINED'`) để áp giá ưu đãi cho khách.
- Nếu 2 container thuộc 2 khách hàng khác nhau (Nhà xe tự ghép để tối ưu xe): Giữ nguyên giá SINGLE của từng khách hàng.
- **[BỔ SUNG]** Kết quả này được ghi vào `order_containers.appliedTripMode`. Có cấu hình tenant `shareTwinDiscountWithCustomer` (mặc định `true` với cùng khách) — một số nhà xe không muốn tự động giảm giá khi chính họ chủ động ghép.

### Định mức Chi phí (COST_NORM - Tính trên consolidated_trips)
- Không bao giờ cộng đôi lương tài xế hay phí cầu đường của 2 đơn lẻ.
- Tra cứu `fee_tariffs` theo `tripMode` của `consolidated_trips` (TWIN_20 hoặc COMBINED) để lấy đúng 1 mức Lương tài xế chạy ghép và 1 mức Phí cầu đường cho cả chuyến xe. **[SỬA]** Kết quả ghi vào `trip_costs` (`costType = 'NORM'`), không ghi vào `order_fees` (bảng này chỉ còn phí thu khách).
- **[BỔ SUNG]** Với tra cứu chi phí của chuyến ghép 2 khách khác nhau, dùng `customerId = NULL` (bảng phí chung), vì định mức chi phí nội bộ không phụ thuộc khách.

### Chi phí thực tế (ACTUAL) [BỔ SUNG]
Ngoài định mức, chuyến còn có chi phí thực tế: dầu (phân bổ theo km, file 04), chi phí dọc đường đã duyệt (`trip_expenses`), thuê xe ngoài, cứu hộ. P&L dùng chi phí **thực tế** nếu đã chốt, còn định mức dùng để so sánh vượt/hụt.

### Phân bổ Chi phí về từng container (Cost Allocation) [SỬA theo PO 16/10]
Bản gốc để ngỏ "chia đều 50/50 hoặc theo tỷ lệ doanh thu". Đã chốt: **hệ thống tự phân bổ theo định mức chi phí, Kế toán có quyền sửa lại.**

**Bước 1 – Hệ thống đề xuất (tự động):**
- Phương pháp mặc định `COST_NORM_RATIO`: tỷ lệ theo **chi phí định mức nếu từng container chạy SINGLE** (tra `fee_tariffs` của từng cont với `tripMode = 'SINGLE'`). Công bằng hơn chia theo doanh thu (phụ thuộc giá bán cho từng khách) và hơn chia đều (cont Nhập và cont Xuất trong chuyến COMBINED có thể khác tuyến/quãng đường).
- Tenant có thể đổi phương pháp mặc định sang `REVENUE_RATIO`, `EQUAL`, `DISTANCE_RATIO`.
- Phân bổ **mọi** chi phí của chuyến (lương, cầu đường, dầu, chi phí dọc đường, thuê xe ngoài), không chỉ DRIVER_SALARY và TOLL_FEE.
- **Làm tròn:** tính bằng decimal, làm tròn từng phần tới đồng; phần dư dồn vào container cuối cùng sao cho tổng phân bổ **bằng đúng** tổng chi phí chuyến (bắt buộc có test).
- Chi phí chỉ gắn với 1 container (ví dụ phí nâng hạ của riêng cont đó) gán thẳng cho container đó, không đem chia.
- Kết quả lưu vào `trip_containers.systemRatio` / `systemAmount` và đồng thời là giá trị đang áp dụng (`allocationRatio` / `allocatedAmount`).

**Bước 2 – Kế toán sửa lại (tùy chọn):**
- Chỉ role `ACCOUNTANT` (hoặc `ADMIN`) được sửa, trên màn hình "Phân bổ chi phí chuyến": hiển thị từng container với số hệ thống đề xuất và ô nhập số áp dụng (nhập theo số tiền hoặc theo %).
- Ràng buộc khi lưu: tổng `allocatedAmount` của chuyến **phải bằng đúng** tổng chi phí chuyến (UI hiển thị phần chênh còn lại, không cho lưu khi lệch); không có số âm; bắt buộc nhập lý do (`overrideReason`).
- Khi lưu: `isManualOverride = true` cho dòng bị sửa, `consolidated_trips.allocationMethod = 'MANUAL'`, ghi `allocationAdjustedBy/At` và `audit_logs` (số trước → số sau).
- Có nút "Khôi phục số hệ thống" để quay về đề xuất.
- Nếu chi phí chuyến thay đổi **sau khi** Kế toán đã sửa (ví dụ duyệt thêm chi phí dọc đường): hệ thống **không** tự ghi đè số của Kế toán; phần chênh mới được phân bổ theo tỷ lệ Kế toán đang áp dụng, và chuyến được gắn cờ "cần Kế toán xem lại".
- Sửa được cho tới khi khóa chi phí (`costLockedAt`). Kỳ kế toán đã `CLOSED` thì không sửa được; muốn đổi phải làm bút toán điều chỉnh ở kỳ đang mở.

**Cập nhật số liệu:** `order_containers.allocatedCostAmount` = tổng `trip_containers.allocatedAmount` của cont đó (một cont có thể đi qua nhiều chuyến, ví dụ Drop & Hook hoặc cứu hộ); `orders.totalAllocatedCostAmount` = tổng của các container. Báo cáo P&L hiển thị cả số hệ thống và số Kế toán đã sửa để so sánh.

**Khóa chi phí:** khi chuyến `COMPLETED` và tất cả chi phí dọc đường đã duyệt, Kế toán bấm khóa; sau khi khóa chỉ điều chỉnh bằng bút toán điều chỉnh.

## 4. Tính lại giá (Re-pricing) [BỔ SUNG]
Giá được snapshot cho từng container khi Order `CONFIRMED`, nhưng việc ghép TWIN_20/COMBINED thường xảy ra **sau** đó. Quy tắc:
- Sự kiện làm đổi khóa tra giá (ghép, tách chuyến, đổi tuyến, đổi loại cont, đổi khách) → đánh dấu container đó `repriceRequired` (không tính lại các cont khác cùng Order nếu chúng không bị ảnh hưởng).
- Nếu container chưa nằm trên hóa đơn đã phát hành và không `isManualPrice`: tự tính lại `baseFreightAmount` và các phụ phí nguồn `TARIFF`, ghi audit `REPRICE` (giá cũ → giá mới, tariff cũ → mới).
- Nếu container đã được xuất hóa đơn: không sửa; tạo yêu cầu điều chỉnh hóa đơn cho Kế toán.
- Phụ phí nhập tay (`MANUAL`) và phí DEM/DET không bị tính lại.

## 5. Hóa đơn & Công nợ phải thu [BỔ SUNG]
- Order đủ điều kiện xuất hóa đơn khi `RECONCILED` (đã xác nhận ePOD và khách đồng ý bảng kê). **[BỔ SUNG]** Cho phép xuất hóa đơn từng phần theo các container đã đủ chứng từ, vì Order nhiều cont có thể kéo dài nhiều ngày.
- Hóa đơn gom nhiều Order của cùng khách theo kỳ. Dòng cước vận chuyển và phụ phí chịu VAT theo `vatRatePercent` snapshot; phí chi hộ theo cách xử lý kế toán tenant chọn (xuất hóa đơn riêng hoặc chuyển chứng từ gốc của bên thứ ba) — cần kế toán trưởng xác nhận cách làm trước khi code.
- Phát hành hóa đơn điện tử qua interface `EInvoiceProvider` (mỗi nhà cung cấp hóa đơn điện tử là một adapter); lưu mã tra cứu.
- Thanh toán khách (`payments`) cấn trừ vào hóa đơn; báo cáo tuổi nợ (aging) 0–30 / 31–60 / 61–90 / > 90 ngày theo `dueDate`.
- Kỳ kế toán `CLOSED` thì không cho tạo/sửa phí, hóa đơn có ngày thuộc kỳ đó.
