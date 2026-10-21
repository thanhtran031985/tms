---
description: Vẽ sơ đồ bằng archify cho một task và vẽ lại sơ đồ tổng quan cả app
argument-hint: <NN-slug, vd 07-lesson-player | tong-quan>
---
Vẽ sơ đồ cho $ARGUMENTS. Mục đích: tôi không đọc code, nên cần sơ đồ để hình dung app
chạy thế nào và thấy code có làm đúng task.md, PRD không.

## Chuẩn bị
- Cần skill archify. Nếu chưa có skill archify → DỪNG và báo tôi chạy
  `npx skills add tt-a1i/archify -g` rồi mở lại Claude Code. KHÔNG tự cài.
- Đọc SKILL.md của archify và làm đúng quy trình của nó: viết JSON nguồn, chạy
  `finalize ... --quality showcase`, sửa theo biên nhận khi không đạt. Chỉ báo "xong"
  khi finalize đạt; không đạt sau giới hạn sửa của archify thì báo rõ.
- Bước kiểm tra trình duyệt của archify cần Chrome hoặc Edge. Nếu báo không tìm thấy,
  đặt biến ARCHIFY_CHROME tới chrome.exe, hoặc
  `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`.
- Đọc: docs/tasks/$ARGUMENTS/task.md (nếu không phải tong-quan), docs/PRD.md Phần C,
  D, E, F, docs/tasks/README.md, và code thật trong src/, prisma/.
- Nguồn sự thật là CODE. task.md và PRD chỉ dùng để so sánh và để vẽ phần "chưa làm"
  ở sơ đồ tổng quan. Không vẽ thứ code không có mà không đánh dấu.
- Gắn nguồn (file + dòng) cho các ô chính theo hướng dẫn repository của archify. Repo
  không công khai thì dùng chế độ liên kết cục bộ (local-only) mà schema của archify cho
  phép, với `--repo-root .`.
- Nhãn, ghi chú bằng tiếng Việt; giữ nguyên tên trong code (tên file, bảng, hàm, route).
- KHÔNG đọc .env, KHÔNG cài package vào dự án, KHÔNG sửa code trong lệnh này.

## 1. Sơ đồ của task (bỏ qua khi đối số là tong-quan)
Lưu ở docs/so-do/$ARGUMENTS/. Vẽ 1–3 sơ đồ, mỗi sơ đồ trả lời một câu hỏi về chức năng
của task. Chọn loại hợp với chức năng, không vẽ đủ mọi loại cho có:
- workflow: người dùng (bé hoặc bố mẹ) bấm gì, đi tới màn nào, nhánh lỗi, trạng thái trống.
- sequence: một thao tác chính đi qua các lớp: màn → server action → kiểm tra hồ sơ thuộc
  tài khoản → src/lib/rules → Prisma → bảng nào → trả gì về màn.
- lifecycle: khi chức năng có trạng thái (bài khóa/mở, 5 hộp ôn tập, Chưa có bài/Nháp/Xuất
  bản, số lần trả lời sai, giờ học còn/hết).
- dataflow: khi dữ liệu được nhập, biến đổi, xuất (seed, Excel, báo cáo bố mẹ).
Tên tệp: `<loai>-<ten-ngan>.html`, kèm tệp JSON nguồn cùng tên.

## 2. Sơ đồ tổng quan cả app (luôn làm, vẽ lại từ đầu mỗi lần)
Lưu ở docs/so-do/tong-quan/:
- `workflow-hanh-trinh-cua-be.html`: hành trình của bé theo sơ đồ điều hướng ở PRD
  Phần C: đăng nhập → chọn hồ sơ → tạo hồ sơ → xếp lớp → trang chủ → bản đồ → bài học →
  kết thúc bài, cùng ôn tập, sổ từ, hết giờ.
- `workflow-khu-nguoi-lon.html`: cổng bố mẹ → khu bố mẹ → quản trị nội dung.
- `architecture-he-thong.html`: các khối đã có trong code (nhóm màn, server actions,
  NextAuth, src/lib/rules, Prisma, MySQL, storage/uploads) và quan hệ giữa chúng.
Quy ước:
- Phần đã có code: vẽ bình thường, có nguồn.
- Phần đã có trong designs/ hoặc PRD nhưng chưa có code: vẽ nét đứt (variant "dashed")
  và gắn nhãn phụ "chưa làm · task NN" theo docs/tasks/README.md. Mỗi lần xong một task,
  sơ đồ tổng quan có thêm một phần nét liền.
- Giai đoạn sau (GĐ2 trở đi): chỉ một ô nét đứt cho mỗi nhóm, không vẽ chi tiết.
- Sơ đồ quá rối thì tách tiếp theo khu (vd hành trình học, phần thưởng), không nhồi.

## 3. So sánh với task.md và PRD
Ghi vào `so-sanh.md` trong cùng thư mục: mỗi điểm code khác task.md hoặc PRD (thiếu
nhánh, thứ tự khác, trạng thái thừa hoặc thiếu, quy tắc khác Phần F), kèm file:dòng và
mức độ (quan trọng / nhỏ). KHÔNG tự sửa code; nêu khác biệt quan trọng trong báo cáo để
tôi quyết.

## 4. Mục lục và git
- Cập nhật docs/so-do/README.md: bảng `| Sơ đồ | Loại | Task | Cập nhật |`, cột Sơ đồ là
  link tương đối tới tệp .html. Giữ các dòng cũ, sửa ngày ở dòng được vẽ lại.
- Chỉ giữ trong git: tệp .html, tệp JSON nguồn, .md. Thêm vào .gitignore các tệp biên
  nhận archify sinh ra trong docs/so-do (xem tên thực tế sau lần chạy đầu) và `.archify/`.

## 5. Báo cáo
- Danh sách sơ đồ đã vẽ (đường dẫn), kết quả finalize từng sơ đồ, số điểm khác biệt
  (quan trọng / nhỏ).
- Một câu: tôi nên mở sơ đồ nào trước.
- Không tự commit. Đề xuất commit "docs: sơ đồ $ARGUMENTS". Khi được gọi từ /finish-task
  thì gộp vào commit đóng task.
