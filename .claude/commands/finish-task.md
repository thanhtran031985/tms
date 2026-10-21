---
description: Rà soát code đã có so với task.md, sửa, kiểm tra và đóng task
argument-hint: <NN-slug, vd 01-setup>
---
Hoàn thành task $ARGUMENTS. Đọc @docs/tasks/$ARGUMENTS/ và docs/tasks/README.md trước.

Code của task này có thể ĐÃ được viết (một phần hoặc toàn bộ), có thể theo bản
yêu cầu cũ (xem _archive/ nếu có). task.md là bản chuẩn hiện tại. KHÔNG code lại
từ đầu — chỉ rà soát, sửa phần khác biệt, kiểm tra và đóng task.

## Dashboard tiến độ (docs/tasks/dashboard.html)
Dashboard được SINH RA từ docs/tasks/README.md và docs/tasks/NN-slug/progress.md
bằng `npm run tasks:dashboard` (scripts/tasks-dashboard.mjs). Đặc tả nằm ở
docs/prompts/dashboard.md.
- Nếu package.json chưa có script "tasks:dashboard": đề xuất tạo dashboard theo
  docs/prompts/dashboard.md (lập kế hoạch, DỪNG chờ duyệt). Không tự tạo khi chưa
  được duyệt. Chưa có script thì bỏ qua các bước chạy dashboard bên dưới.
- KHÔNG sửa tay dashboard.html. Muốn đổi nội dung thì sửa README.md/progress.md
  rồi chạy lại script.
- Giữ progress.md đúng định dạng mà script đọc:
  - Dòng `Trạng thái chung: <ký hiệu> · Cập nhật lần cuối: <ngày>`.
  - Bảng bước là bảng ĐẦU TIÊN có cả cột "Bước" và "Trạng thái" (thêm "Tên",
    "Ghi chú"). Bảng phụ (rà soát, theo dõi mục sửa…) KHÔNG được có đồng thời
    hai cột đó: dùng "Mục", "Đánh giá"… để script không đọc nhầm.
  - Cột trạng thái chỉ dùng: ⬜ chưa làm · 🔄 đang làm · ❓ có code chưa rà soát ·
    ⚠️ khác task.md · ❌ thiếu · ✅ xong. Ký hiệu lạ bị tô xám kèm cảnh báo.
  - "Trạng thái chung" trong progress.md phải khớp cột Trạng thái của task trong
    README.md.
- Sau MỖI lần cập nhật README.md/progress.md: chạy `npm run tasks:dashboard`, đọc
  kết quả in ra. Phải là "Cảnh báo: 0"; nếu có cảnh báo thì sửa file .md cho hết
  rồi chạy lại. Ghi dòng tóm tắt của task (vd "02 slug: 6/6 bước ✅ · README ✅")
  vào báo cáo.
- dashboard.html thay đổi mỗi lần chạy: commit nó cùng các file .md trong cùng
  commit.

## Giai đoạn A — Rà soát (không sửa code)
0. Đánh dấu task đang được rà soát: "Trạng thái chung" trong progress.md và dòng
   của task trong README.md → 🔄. Chạy dashboard.
1. Với từng mục "Quyết định kiến trúc" và từng bước trong task.md, đánh giá
   ✅ đúng / ⚠️ có nhưng khác / ❌ thiếu, kèm bằng chứng (file + dòng).
2. Kiểm tra thêm theo quy tắc code trong CLAUDE.md: validate Zod, không secret
   hay Prisma trong client component, không mã màu hex cố định, xử lý lỗi.
   Và theo "Quy tắc riêng của dự án này": mọi truy cập dữ liệu học sinh có kiểm
   tra hồ sơ thuộc tài khoản đang đăng nhập; PIN được hash; không viết cứng nội
   dung học trong component; file tải lên nằm ngoài public/; quy tắc PRD Phần F
   nằm trong src/lib/; màn có dữ liệu đủ 4 trạng thái; phím tắt bài học hoạt động.
3. Chạy npx tsc --noEmit, npm run lint, npm run build.
4. Cập nhật bảng bước trong progress.md theo kết quả thực tế (ký hiệu + ghi chú).
   Ghi khác biệt vào decisions.md. Chạy dashboard.
5. Đưa danh sách cần sửa, đánh số, xếp theo: bảo mật → lỗi chức năng → khác biệt
   nhỏ. Mỗi mục nêu rủi ro nếu KHÔNG sửa.
DỪNG, chờ tôi chọn mục nào sửa.

## Giai đoạn B — Sửa
- Chỉ sửa các mục tôi chọn, mỗi lần một mục (hoặc một nhóm nhỏ liên quan).
- Sau mỗi mục: chạy tsc, cập nhật progress.md, ghi decisions.md nếu có quyết
  định mới, chạy dashboard (Cảnh báo: 0), đề xuất commit message
  "$ARGUMENTS: fix — <mô tả>". DỪNG chờ "continue".
- Mục tôi quyết định KHÔNG sửa: ghi vào decisions.md kèm lý do.
Nếu Giai đoạn A không có gì cần sửa, sang thẳng Giai đoạn C.

## Giai đoạn C — Kiểm tra
1. npx tsc --noEmit, npm run lint, npm run build — phải không lỗi.
2. Nếu task.md có phần kiểm tra tự động: viết và chạy script tương ứng (không
   cài thêm thư viện nếu chưa hỏi), dọn dữ liệu test sau khi chạy.
3. **Tự test giao diện bằng Playwright trước khi báo hoàn thành** (bộ test ở `tests/e2e/`,
   cách chạy ở `docs/test/README.md`). Task có giao diện (màn, route, thành phần nhìn thấy) thì bắt buộc:
   - Thêm hoặc cập nhật test cho task trong `tests/e2e/NN-*.spec.ts` (tên test bằng tiếng Việt,
     ghi dòng "Kiểm tra" của task.md đang kiểm), thêm màn mới vào danh sách của `chung.spec.ts`
     (không cuộn, Tab + viền focus, trợ năng, 4 trạng thái) và `thiet-ke.spec.ts`.
   - Tắt `npm run dev`, rồi chạy `npm run test:e2e` (hoặc ít nhất `npx playwright test NN- chung`).
     Test hỏng vì lỗi của app: KHÔNG nới test cho qua; ghi lỗi vào progress.md, sửa trong
     Giai đoạn B nếu thuộc phạm vi task, nếu không thì báo tôi quyết.
   - Ghi kết quả (số đạt / hỏng, lỗi còn lại) vào progress.md và báo cáo cuối task.
   Task không có giao diện (vd 03-db-core) thì ghi rõ "không có giao diện" và bỏ qua mục này.
   Claude Code chạy lệnh có `prisma migrate reset` cần tôi đồng ý riêng (Prisma chặn); báo tôi khi gặp.
4. Ghi checklist test thủ công vào progress.md dưới dạng ô tích [ ], kèm lệnh
   cần thiết (vd SQL/Prisma để tạo dữ liệu test). Chạy dashboard.
DỪNG. Tôi tự test và báo kết quả. Nếu tôi báo lỗi, quay lại Giai đoạn B.

## Giai đoạn D — Đóng task (chỉ khi tôi báo "test ok")
1. progress.md: mọi bước ✅, trạng thái chung ✅, tích hết checklist, mục
   "Bước tiếp theo" ghi "Hoàn thành". Test giao diện Playwright của task đạt hết, hoặc
   lỗi còn lại đã ghi trong decisions.md kèm quyết định của tôi.
2. docs/tasks/README.md: dòng của task → ✅, nhánh đúng với nhánh thực tế.
3. decisions.md: thêm mục tổng kết ngắn những gì khác với task.md gốc.
4. Chạy npm run tasks:dashboard. Kết quả phải cho task này "x/x bước ✅ · README ✅"
   và "Cảnh báo: 0"; nếu không, sửa progress.md/README.md rồi chạy lại.
5. Đề xuất commit "$ARGUMENTS: complete task" (gồm cả dashboard.html).
   Chỉ commit và push khi tôi đồng ý.
6. Soạn tiêu đề và mô tả Pull Request (tóm tắt tính năng, sửa đổi sau rà soát,
   cách test, biến môi trường cần thiết) để tôi dán lên GitHub. Không tự merge.
