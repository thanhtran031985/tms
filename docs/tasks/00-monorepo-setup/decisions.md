# Quyết định 00-monorepo-setup

## Đã chốt
<!-- Quyết định đã chốt trước khi làm (nếu có), kèm ngày. -->
- Cấu trúc mã nguồn: `apps/web/src/features/<module>` chứa view và Server Action, `apps/web/src/app` chỉ định tuyến, `apps/web/src/components/ui` chứa component dựng theo `designs/`; `designs/` chỉ đọc; mỗi ticket một thư mục trong `docs/tasks/` (21/10/2026, spec 01 mục 2 "[BỔ SUNG 21/10]").
- Giao diện theo Design System "TMS Container" phiên bản token 2, hướng xanh dương thiết kế lại theo ui-ux-pro-max (21/10/2026, `docs/DESIGN_SYSTEM.md`); chỉ dùng token, không tự đặt mã màu.

## Phát sinh khi làm
<!-- Chỗ làm khác task.md, spec hoặc thiết kế: lý do, ai đồng ý, đã sửa spec chưa. -->
- 21/10/2026, Bước 1 — TypeScript ghim `~6.0` (cài 6.0.3), không dùng 7.0.2: `typescript-eslint` 8.72 chặn TS 7 (peer `<6.1.0`, báo "does not support TS 7.0"). Nâng lên TS 7 khi typescript-eslint hỗ trợ (issue typescript-eslint#10940). Spec không nhắc phiên bản TS nên không cần sửa spec.
- 21/10/2026, Bước 1 — Phiên bản công cụ trên máy: Node 25.2.1 đang cài, repo chốt Node 24 LTS trong `.nvmrc` (`engines` `>=24`); pnpm 12.10.1 ghi ở `packageManager`; ESLint 10.13, Prettier 3.9, `@types/node` 26.
- 21/10/2026, Bước 1 — `packages/shared` và `packages/core` để file nguồn ở gốc package (không có `src/`), vì spec 02 dùng đường dẫn `packages/shared/enums.ts` và alias `@shared/enums`, `@core/lib/…`. `apps/*` dùng `src/`.
- 21/10/2026, Bước 1 — Luật chặn client db thô trong `modules/**` khớp các đường dẫn `**/lib/db`, `**/lib/db/client` và `@core/lib/db/client`; import từ `lib/db/schema` vẫn được phép.
- 21/10/2026, Bước 1 — `.gitignore` đã bị ghi đè khi tôi tạo bản tối thiểu trước đó (không xác minh được nội dung cũ), nay là bản đầy đủ của Bước 1. Có thêm `apps/web/public/brand/` để chứa bản chép logo ở Bước 4.
- 21/10/2026, Bước 2 — MinIO: ảnh `minio/minio` trên Docker Hub và `quay.io/minio/minio` không kéo được (từ chối truy cập). Dùng `cgr.dev/chainguard/minio` và `cgr.dev/chainguard/minio-client` (không có shell, không có healthcheck). Bucket và versioning tạo bằng hai container một lần dùng biến `MC_HOST_local`. Phiên bản `latest` chưa ghim; ghim digest khi chuẩn bị production (task 24).
- 21/10/2026, Bước 2 — Cổng MariaDB trên máy chủ là **3307** (không phải 3306) vì XAMPP MySQL (`mysqld.exe`) đang chiếm 3306; đổi bằng `MARIADB_PORT` trong `.env`. Trong container và CI vẫn là 3306.
- 21/10/2026, Bước 2 — Lệnh `db:migrate`/`db:seed` nạp `.env` bằng `node --env-file-if-exists=../../.env --import tsx` (không cài dotenv); biến đã có sẵn trong môi trường (CI) không bị ghi đè. `schema/index.ts` rỗng nên `drizzle-kit generate` không sinh SQL, chỉ sinh `meta/_journal.json` rỗng để migrator chạy được trên DB trống.
- 21/10/2026, Bước 2 — Thêm `.gitattributes` (`* text=auto eol=lf`) để hết cảnh báo LF/CRLF trên Windows. Biến `DATABASE_URL` mẫu trong `.env.example` đổi sang cổng 3307.
