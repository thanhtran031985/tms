# Tiến độ 03-pricing-engine

Trạng thái: ⬜ chưa làm · 🔄 đang làm · ❓ có code chưa rà soát · ⚠️ khác task.md · ❌ thiếu · ✅ xong

| Bước | Nội dung | Trạng thái | Commit |
|---|---|---|---|
| 1 | Schema bảng giá, migration, seed và tenant isolation | ✅ | |
| 2 | Bảng test bắt buộc của Pricing Engine (đỏ) | ✅ | |
| 3 | resolveFreight và resolveFees | ✅ | |
| 4 | Lưu bảng giá: chặn chồng lấn, đóng và tạo mới, audit | ✅ | |
| 5 | Import Excel có xem trước | ✅ | |
| 6 | Server Action và màn danh sách, form bảng giá | ✅ | |
| 7 | Màn import Excel | ✅ | |
| 8 | Hoàn tất | ✅ | |

## Nhật ký
<!-- Sau mỗi bước: ngày, đã làm gì, kết quả Kiểm tra, việc người dùng cần làm thủ công. -->

### Bước 1 — Schema, migration, seed, cách ly tenant (22/10/2026)
- `schema/tariffs.ts` (`freight_tariffs`, `fee_tariffs`, `idx_freight_4d`, `idx_fee_4d`), migration `0003_tariffs.sql` đã review; `TenantDb.select` mở rộng `orderBy`, `limit`, `forUpdate` (có test, vẫn chặn theo tenant); `modules/billing/repo.ts`; seed `seeds/tariffs.ts` (Phúc An 4 giá cước + 7 phí gồm một dòng miễn phí, Sao Việt 1 + 1).
- Kiểm tra: test repo billing, seed (hai lần không trùng), `tenant-db` xanh; migrate và seed trên DB dev có dữ liệu task 02 chạy được, seed hai lần cho 5 giá cước và 8 phí.

### Bước 2–3 — Bảng test và `pricing-engine.ts` (22/10/2026)
- Viết `pricing-engine.int.test.ts` trước (7 dòng bảng spec 06 mục 2 + 4 mức priority + điều kiện lọc + bảng phí), rồi `resolveFreight`, `resolveFees`, `tariffDateOf`. Kết quả kèm `tariffId`.
- Kiểm tra: 25 test xanh, gồm test `EXPLAIN` xác nhận câu truy vấn tra giá cước dùng `idx_freight_4d`. Phí có `routeId = NULL` áp mọi tuyến nên các test phí dùng loại cont riêng để không lẫn nhau.

### Bước 4 — Lưu bảng giá (22/10/2026)
- `shared/schemas/tariffs.ts`, `tariffs.service.ts` (tạo, sửa bản chưa hiệu lực, điều chỉnh giá đang hiệu lực, đóng, ngừng dùng), `TARIFF_NOT_FOUND` và `TARIFF_OVERLAP`, quyền `tariff.view`/`tariff.write`.
- Chặn chồng lấn: khóa mutex theo khóa 4D (`nextNumber`) rồi `SELECT … FOR UPDATE`.
- Kiểm tra: 25 test xanh; hai giao dịch song song tạo giá chồng nhau chạy lặp 5 lần luôn chỉ một thành công; 8 giao dịch cùng khóa phí chỉ một thành công; điều chỉnh giá đóng bản cũ đúng ngày; rollback cả bản đóng khi bản mới chồng; audit trước/sau; vai trò không đủ quyền bị `FORBIDDEN`.

### Bước 5 — Import (core) (22/10/2026)
- `tariff-import-parse.ts` (đọc ma trận: tiêu đề không dấu, số kiểu Việt Nam, ngày dd/mm/yyyy, Date, số serial Excel) và `previewImport`, `commitImport` trong `tariffs.service.ts`.
- Kiểm tra: 16 test xanh (lỗi đúng dòng và cột, chồng trong file, chồng với giá có sẵn, thiếu cột, > 2000 dòng, ghi atomic, kiểm tra lại dữ liệu từ client, nhập song song, xem trước 200 dòng dưới 3 giây).

### Bước 6 — Server Action và màn danh sách, form (22/10/2026)
- `features/billing/{tariff-actions,tariff-types,tariff-page,tariff-view,tariff-form}`, trang `/billing/tariffs` và `/billing/fees` (+ `loading.tsx`, `error.tsx`, layout có `LinkTabs`), mục menu "Bảng giá", `StatusChip`, `formatMoney`/`formatDate`, `link-tabs` dùng chung (EntityTabs dùng lại).
- Màn: tab hiệu lực có số đếm (Đang hiệu lực, Sắp hiệu lực, Hết hiệu lực, Tất cả), bộ lọc tuyến, loại cont, chế độ chạy, khách (có "Giá chung"); ngăn kéo có 4 chế độ (tạo, sửa giá chưa hiệu lực, điều chỉnh giá đang hiệu lực kèm Alert info, chỉ xem); lỗi `TARIFF_OVERLAP` hiện dưới ô ngày kèm khoảng của giá đang chồng; đủ 4 trạng thái.
- Kiểm tra: test action (`VIEWER`, `DISPATCHER` bị `FORBIDDEN` ở mọi action ghi; Kế toán/Chủ công ty không điều chỉnh được; zod chặn giá 0, ngày sai) cùng toàn bộ web test 54 xanh; e2e `tariff.spec.ts` 13 test xanh (lọc, tạo, chặn chồng, giá 0, điều chỉnh bởi Quản trị, quyền Kế toán/Chỉ xem, 1366×768).
- Sửa khi chạy e2e: locator trùng nhãn giữa ô lọc của bảng và form trong ngăn kéo (giới hạn trong `dialog`); tăng `timeout` mỗi test e2e lên 60 giây vì `next dev` biên dịch chậm khi chạy song song; giá "xóa" chỉ chuyển sang "Đã ngừng" nên test kiểm chip thay vì biến mất.

### Bước 7 — Màn import Excel (22/10/2026)
- `server/excel.ts` (đọc sheet đầu thành ma trận, sinh file mẫu), Route Handler `POST /api/billing/tariff-import` (multipart, ≤ 5 MB, chỉ `.xlsx`, kiểm `tariff.write`, không lưu file) và `GET /api/billing/tariff-template?kind=`, trang `/billing/import`, `features/billing/tariff-import.tsx` (chọn loại + file, tab Tất cả/Hợp lệ/Có lỗi có số đếm, cột Kết quả nêu lỗi theo dòng, nút "Nhập N dòng" chỉ bật khi hết lỗi, xác nhận bằng Server Action `commitTariffImport`; trạng thái Trống, Lỗi, Đang đọc, Hoàn tất). `next.config.ts` thêm hai thư viện Excel vào `serverExternalPackages`.
- Kiểm tra: `tariff-import.spec.ts` 7 test xanh (file có lỗi: 3 dòng lỗi đúng lý do và nút nhập khóa; file sạch: xác nhận rồi thấy giá "Sắp hiệu lực" trong danh sách; tải file mẫu giá cước, chọn lại nguyên vẹn thì hai dòng ví dụ bị báo chồng giá seed; file mẫu phí; sai định dạng và thiếu cột; file chỉ có tiêu đề; Chỉ xem không vào được màn).
- Phát sinh: file tải về từ trình duyệt thử nằm ở đường dẫn tạm không đuôi `.xlsx` nên test chọn lại bằng buffer có tên đúng; server chỉ nhận tên file `.xlsx`.

### Bước 8 — Hoàn tất (22/10/2026)
- `pnpm typecheck`, `lint`, `build` sạch (build có thêm 2 Route Handler và 4 trang `/billing/*`); Prettier sạch cho `apps`, `packages`, `docs`, `scripts`. `pnpm test` 249 test xanh (core 194, web 54, worker 1). `pnpm e2e` 62 test xanh (20 test mới: `tariff.spec.ts` 13, `tariff-import.spec.ts` 7). Migration `0003` chạy được trên DB trống (Testcontainers) và DB dev đã có dữ liệu task 02; `db:seed` hai lần không trùng. `scripts/audit.mjs` không có lỗ hổng mức cao mới (1 mức trung bình `uuid` có từ trước, cài thêm hai thư viện Excel không làm tăng).
- Đạt "Chấp nhận khi": toàn bộ bảng test spec 06 mục 2 xanh; hai giao dịch song song không lọt giá chồng; mọi Server Action có `requireRole` + zod (rào chắn `actions-guard` xanh) và `VIEWER`/`DISPATCHER` bị `FORBIDDEN`; repo billing có test cách ly tenant.
- Việc người dùng cần làm: xác nhận `pricing.editActive` giữ ADMIN-only (task.md ghi "và OWNER", PRD A4 chỉ Admin); xem lại giá seed (chỉ là số mẫu, VAT mẫu 8%); sửa `DATABASE_URL` trong `.env` sang cổng 3307.
- Lưu ý môi trường: thư mục `.fleet/` ở gốc repo là git worktree của task 05 (nhánh `feat/05-fleet-drivers`, bị `.git/info/exclude`), không thuộc task này; `pnpm format:check` chạy trên toàn repo sẽ báo các file trong đó chưa định dạng, nên tôi kiểm Prettier riêng cho các thư mục của task.

### Hoàn tất — CI (22/10/2026)
- Commit `33b1004` đã đẩy lên `feat/03-pricing-engine`; GitHub Actions run 39750975908 xanh cả 4 job (typecheck/lint/test/build, Playwright e2e, migration trên DB tạm, quét lỗ hổng).
