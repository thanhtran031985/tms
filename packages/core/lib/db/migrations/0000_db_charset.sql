-- Đặt bộ ký tự và collation mặc định của DB theo quy ước dự án (CLAUDE.md): utf8mb4, utf8mb4_unicode_ci.
-- Các bảng tạo sau đó kế thừa mặc định này, không phụ thuộc cấu hình máy chủ (CI, Testcontainers, production).
ALTER DATABASE CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
