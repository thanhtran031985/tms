# TMS Container — Hướng dẫn cho Claude

## Dự án
TMS Container là phần mềm điều hành vận tải container cho nhiều doanh nghiệp (multi-tenant), chạy trên
trình duyệt máy tính, kèm app điện thoại cho tài xế.
- Người dùng: Điều vận, Kế toán, Quản lý đội xe, Quản trị tenant (web) và tài xế (app Expo).
- Nghiệp vụ chính: Order nhiều container, bảng giá 4D, điều vận Kanban, ghép chuyến, app tài xế và ePOD,
  GPS và geofence, phiếu dầu, chi phí chuyến và phân bổ, DEM/DET, đối soát, lương tài xế, hóa đơn.
- Stack: pnpm workspace. Next.js (App Router) + React 19 + TypeScript strict + Tailwind + shadcn/ui,
  Drizzle ORM + MariaDB, Redis, BullMQ, Auth.js hoặc better-auth, zod, decimal.js, dnd-kit, TanStack Table,
  Vitest + Testcontainers, Playwright, Expo (app tài xế).
- Tài liệu sản phẩm: `docs/PRD.md` (bản đặc tả chức năng, chia giai đoạn GĐ0–GĐ6),
  `docs/DESIGN_SYSTEM.md` (token và quy tắc giao diện), `docs/specs/00–08` (kiến trúc, ADR, schema,
  thuật toán; spec là nguồn chi tiết, PRD là bản tóm tắt theo màn hình).
- Thiết kế giao diện: `designs/`, bản tải về từ hệ thống giao diện "TMS Container" trên Claude Design
  (`tokens.json`, `tokens.css`, `README.md`, `components/<Tên>/README.md` + `preview.html`, `components/bundle.css`).
  Mỗi `task.md` tự liệt kê các thư mục `designs/components/Screen…` và thành phần nó dùng.

Cấu trúc mã:
```
apps/web            Next.js: src/app (chỉ định tuyến), src/features/<module> (view + Server Action), src/components/ui
apps/worker         BullMQ: cron, GPS flush, OCR, DEM/DET, thông báo
apps/driver-app     Expo
packages/shared     zod schema, enum, mã lỗi dùng chung
packages/core       modules/<module>/{service.ts, repo.ts, schema.ts, *.test.ts}, lib/{db, redis, storage, ai, audit, time, money}
designs/            Thiết kế tải về từ Claude Design (CHỈ ĐỌC)
docs/               PRD.md, DESIGN_SYSTEM.md, specs/, tasks/
scripts/            tasks-dashboard.mjs
```

## Cấu trúc task
```
docs/tasks/
├── README.md            ← bảng tổng tất cả task + trạng thái
├── _template/           ← mẫu cho task mới (task.md, progress.md, plan.md, decisions.md, _archive/)
├── dashboard.html       ← SINH RA bởi `pnpm tasks:dashboard`, KHÔNG sửa tay
└── NN-slug/             ← mỗi task một thư mục, NN = số thứ tự 2 chữ số
    ├── task.md          ← yêu cầu của task (do tôi viết, KHÔNG tự sửa)
    ├── progress.md      ← tiến độ, Claude cập nhật sau mỗi bước
    ├── plan.md          ← kế hoạch đã duyệt từ Plan mode
    ├── decisions.md     ← quyết định đã chốt, vấn đề phát sinh
    └── _archive/        ← bản cũ của task.md (nếu có)
```
Quy ước đặt tên:
- Thư mục task: `NN-slug`, slug viết thường, kebab-case, tiếng Anh, ngắn (vd `03-pricing-engine`, `07-dispatch-kanban`).
- Nhánh git tương ứng: `feat/NN-slug`.
- Task xong vẫn giữ nguyên thư mục, chỉ đổi trạng thái trong README. Không di chuyển, không xóa.

Ký hiệu trạng thái (dùng trong README và progress.md; dashboard tô màu theo đó):
⬜ chưa làm · 🔄 đang làm · ❓ có code chưa rà soát · ⚠️ khác task.md · ❌ thiếu · ✅ xong.
Ký hiệu khác sẽ hiện màu xám trên dashboard kèm cảnh báo.

## Khi tôi yêu cầu tạo task mới
1. Đọc `docs/tasks/README.md`, lấy số lớn nhất hiện có + 1 làm NN.
2. Đề xuất slug, hỏi tôi xác nhận nếu tên chưa rõ.
3. Copy `docs/tasks/_template/` sang `docs/tasks/NN-slug/`, điền tiêu đề và ngày.
4. Nếu tôi đưa nội dung yêu cầu thì ghi vào `task.md`; nếu chưa thì để khung trống.
5. Thêm một dòng vào bảng trong `docs/tasks/README.md` (trạng thái ⬜, phụ thuộc nếu có).
6. Nếu task có giao diện: liệt kê các thư mục `designs/components/*` liên quan trong mục
   "Thiết kế" của `task.md` (hỏi tôi nếu không chắc file nào thuộc task).
7. Chạy `pnpm tasks:dashboard`.
Không bắt đầu làm task khi tôi chưa yêu cầu.

## Quy trình khi làm một task
- Khi bắt đầu, khi mở phiên mới, hoặc sau khi compact: ĐỌC theo thứ tự
  `docs/tasks/README.md` → `task.md` → `progress.md` → `decisions.md` của task đó,
  rồi tiếp tục từ bước đang dở. Không làm lại bước đã ✅.
- Luôn chạy Plan mode để lên kế hoạch trước khi làm một task. Khi tôi duyệt kế hoạch:
  lưu nguyên văn vào `plan.md` của task, tạo nhánh `feat/NN-slug`.
- Làm lần lượt từng bước theo đúng thứ tự trong `task.md`. Test hành vi viết trước (thấy đỏ), rồi code cho xanh.
- Sau MỖI bước:
  1. Tự chạy phần "Kiểm tra" của bước đó.
  2. Cập nhật `progress.md` (bảng trạng thái + nhật ký của bước), rồi chạy `pnpm tasks:dashboard`.
  3. Báo cáo ngắn: đã làm gì, kết quả kiểm tra, việc tôi cần làm thủ công.
  4. Đề xuất commit message dạng `NN-slug: step N — <mô tả>`. Chỉ commit khi tôi đồng ý.
  5. DỪNG và chờ tôi trả lời "continue".
- Khi có quyết định mới hoặc thay đổi so với `task.md`, spec hay thiết kế: ghi vào `decisions.md`.
  Nếu quyết định làm spec sai đi thì nêu trong báo cáo để tôi sửa spec.
- Khi task hoàn thành: đổi trạng thái trong `docs/tasks/README.md` thành ✅.
- Quyết định mơ hồ → DỪNG và hỏi. Spec, PRD và thiết kế mâu thuẫn nhau → DỪNG và hỏi.
  Thiếu chi tiết nhỏ → tự suy ra từ spec và thiết kế, báo cho tôi đã suy ra gì (không cần dừng).
- KHÔNG cài package mới khi chưa hỏi tôi (trừ các package đã ghi ở Stack khi làm task 00).

## Quy tắc code (áp dụng cho mọi task)
- Nghiệp vụ chỉ nằm trong `packages/core/modules/*/service.ts`. Server Action và Route Handler chỉ
  kiểm quyền, validate zod rồi gọi service. `src/app` chỉ định tuyến.
- Mọi thao tác ghi DB đều validate bằng zod. Schema zod đặt trong `packages/shared`, dùng chung server và client.
- Server Action không throw ra client: trả `{ ok: true, data } | { ok: false, code, message }`,
  `code` là mã lỗi cố định trong `packages/shared`, `message` tiếng Việt có dấu.
- Mật khẩu hash, không bao giờ lưu, log hay trả về dạng văn bản thuần.
- Không có secret, Drizzle hay `packages/core` trong client component.
- Chỉ dùng design token, không dùng mã màu hex hay px cố định. Thiếu token thì thêm vào theme
  (Tailwind v4: `@theme`, v3: `tailwind.config`) và liệt kê trong báo cáo.
- Chỉ sửa trong phạm vi của task đang làm. Không tự thêm tính năng ngoài `task.md`.
- Trước khi báo hoàn thành một task: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`
  đều phải chạy không lỗi; task có giao diện chạy thêm `pnpm e2e` cho luồng chính.

## Quy tắc riêng của dự án này
Tenant và quyền:
- Mọi Server Action và Route Handler bắt đầu bằng `requireRole([...])`, rồi validate input bằng zod
  trước khi mở transaction.
- Mọi truy vấn đi qua `getTenantDb(ctx)` hoặc repo có điều kiện `tenantId`. Mỗi repo mới phải có
  test tenant isolation (tenant A không đọc, không sửa được dữ liệu tenant B).
- Thay đổi Order, Assignment, Tariff, Fee, Ledger, Invoice ghi `audit_logs` trong cùng transaction.

Tiền và thời gian:
- Tiền dùng `DECIMAL(18,2)` + `currency`, tính bằng decimal.js trong `packages/core/lib/money`,
  không dùng `number`. Thời gian lưu `DATETIME(3)` UTC, hiển thị giờ Việt Nam.
- Không tìm thấy giá thì trả `TARIFF_NOT_FOUND` và bắt nhập giá tay, không bao giờ để 0.

Đơn hàng và điều vận:
- 1 Order = 1 Booking/B/L có nhiều container (`order_containers`). Container là đơn vị điều vận,
  tính giá, DEM/DET và ePOD.
- Điều vận khóa theo thứ tự cố định (tài xế → đầu kéo → rơ moóc) bằng `SELECT … FOR UPDATE` và kiểm tra
  chồng lấn thời gian, không chỉ dựa vào `status` (spec 03).
- Phân bổ chi phí chuyến: mặc định theo định mức, Kế toán sửa được, tổng phải khớp, bắt buộc lý do,
  lưu cả số hệ thống và số đã sửa, ghi audit (spec 06).
- Kỳ đã khóa (hóa đơn, lương) không sửa được; điều chỉnh bằng bút toán ở kỳ mở.

Database:
- Schema theo `docs/specs/02_database_schema.md`, dùng đúng tên bảng và cột. Migration bằng drizzle-kit,
  chạy được trên DB trống và DB đã có dữ liệu. utf8mb4, collation `utf8mb4_unicode_ci`.
- Dữ liệu mẫu nằm trong seed (`pnpm db:seed`), có ít nhất 2 tenant để thử tách dữ liệu.

Giao diện:
- Máy tính trước: bố cục chuẩn 1440×900, phải dùng được ở 1366×768. App tài xế thiết kế cho điện thoại,
  vùng bấm ≥ 48px.
- Theo `docs/DESIGN_SYSTEM.md`: xanh dương chủ đạo, Fira Sans + Fira Code, chữ thân 16px, vùng bấm ≥ 44px,
  tương phản ≥ 4,5:1, màu trạng thái luôn kèm icon và chữ, không emoji, không dấu chấm than.
- Mỗi bảng hoặc màn có đủ 4 trạng thái: đang tải (skeleton), trống (lý do + 1 hành động),
  lỗi (giữ dữ liệu cũ + Thử lại), có dữ liệu.
- Chữ trên giao diện bằng tiếng Việt có dấu, giữ thuật ngữ ngành (Order, Container, B/L, Cut-off, DEM, DET,
  ePOD…). Tên biến, hàm, bảng, route bằng tiếng Anh. Số container, biển số, mã chứng từ dùng font mono.

## Chuyển thiết kế Claude Design sang Next.js
Quy tắc cho thư mục `designs/`:
- KHÔNG di chuyển, đổi tên hay sửa file trong `designs/`. Đây là bản tải về từ Claude Design
  và có thể bị tải đè khi thiết kế cập nhật.
- `docs/DESIGN_SYSTEM.md` là bản tóm tắt token và quy tắc, sinh từ `designs/tokens.json` và
  `designs/README.md`. Token thay đổi thì sửa theo `designs/tokens.json`.
- Chỉ ĐỌC các `designs/components/<Tên>/README.md` và `preview.html` mà task cần.

Các `preview.html` KHÔNG phải React: đó là HTML tĩnh dùng biến CSS của `tokens.css` (`var(--primary)`,
`var(--font-ui)`…), lớp CSS tiền tố `tms`, và một đoạn JS nhỏ đổi thuộc tính `data-state` trên
`#root` (normal · loading · empty · error) để xem 4 trạng thái. Khi chuyển:
- 11 thành phần (Button, Field, StatusChip, Alert, FilterTabs, WorkTable, ContainerCard, DeadlineTimeline,
  AppShell, TenantPicker, EmptyState) thành React component trong `apps/web/src/components/ui/`, props theo
  README của từng thành phần, kiểu dáng theo `components/bundle.css`.
- Màn `Screen01`–`Screen09` thành view trong `apps/web/src/features/<module>/`, route trong `src/app`.
  `Screen09-DriverApp` chuyển sang `apps/driver-app` (React Native), giữ token và bố cục.
- CSS chuyển thành class Tailwind dùng token, hoặc CSS module dùng biến CSS; không chép giá trị hex/px.
  `designs/tokens.css` được nạp làm biến CSS gốc (task 00).
- Mỗi trạng thái `data-state` thành trạng thái thật: `loading.tsx` hoặc skeleton, trạng thái trống,
  `error.tsx` hoặc khối lỗi giữ dữ liệu cũ.
- Bỏ dữ liệu mẫu trong preview; thay bằng dữ liệu và điều hướng thật.
- Khớp thiết kế CHÍNH XÁC: bố cục, khoảng cách, thành phần, chữ trên nút. Chỗ nào code buộc phải khác
  thiết kế thì ghi `decisions.md`.

## Bảo mật môi trường
- KHÔNG đọc file `.env`. Danh sách biến môi trường nằm trong `.env.example`
  (giá trị giữ chỗ, không có secret thật). Khi cần biến mới: thêm vào `.env.example`
  và nói tôi điền vào `.env`.

## Lệnh thường dùng
Cần Docker Desktop đang chạy cho `docker compose`, `pnpm dev` (worker cần Redis) và `pnpm test` (Testcontainers).
- `docker compose up -d`: bật MariaDB (cổng máy chủ 3307), Redis (6379), MinIO (API 9000, console 9001) và tạo bucket `tms-dev`.
- `pnpm dev`: chạy song song web Next.js (cổng 3000) và worker BullMQ; `apps/driver-app` chạy riêng bằng Expo.
- `pnpm test`: chạy mọi test đơn vị và tích hợp của workspace (test tích hợp tự dựng MariaDB và Redis bằng Testcontainers).
- `pnpm test --filter core -- <tên>`: chạy test của một package theo tên file hoặc tên test (vd. `money`).
- `pnpm typecheck`: kiểm tra kiểu TypeScript cho cả 5 package.
- `pnpm lint`: ESLint cho cả repo (có luật chặn import client db thô trong `packages/core/modules`).
- `pnpm format` · `pnpm format:check`: Prettier ghi lại hoặc chỉ kiểm tra định dạng.
- `pnpm build`: build các package có script build (hiện là `apps/web`).
- `pnpm db:generate`: sinh migration SQL từ schema Drizzle (review SQL rồi mới commit; không dùng `drizzle-kit push`).
- `pnpm db:migrate`: chạy migration trên DB trong `DATABASE_URL`; chạy lại nhiều lần an toàn.
- `pnpm db:seed`: nạp dữ liệu mẫu, chạy lại không sinh bản ghi trùng.
- `pnpm e2e`: Playwright cho `apps/web` (tự bật `next dev` ở cổng 3100; lần đầu cần `pnpm --filter web exec playwright install chromium`).
- `pnpm tasks:dashboard`: sinh `docs/tasks/dashboard.html` từ `docs/tasks/README.md` và các `progress.md`.
- `node scripts/design-system.mjs`: sinh lại `docs/DESIGN_SYSTEM.md` sau khi tải thiết kế mới về `designs/`.
- `node scripts/fetch-fonts.mjs`: tải lại Fira Sans, Fira Code về `apps/web/public/fonts` và sinh `fonts.css` (hiếm khi cần).
