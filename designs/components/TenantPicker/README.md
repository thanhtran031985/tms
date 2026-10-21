# TenantPicker

Danh sách công ty mà tài khoản có quyền, hiện ngay sau đăng nhập và mở lại từ nút đổi công ty trên thanh trên.

## Mỗi dòng
`a.tms-tenant` trong `ul.tms-tenants` (cách nhau `space-12`):
- Khối cao tối thiểu 72px, đệm `space-16`, nền `surface`, viền 1px `line`, bo `radius-card` (12px).
- Chữ tắt `.ini` 44×44px, nền `surface-2`, bo `radius-control`, 700.
- Tên công ty `.name` (17px/600) và lần đăng nhập cuối `.last` (14px, `ink-soft`).
- Vai trò là `tms-pill` (`info-soft` / `info`, bo `radius-pill`).
- Mũi tên phải `ink-soft`.
- Hover: viền `primary`, nền `info-soft`. Focus: viền 3px `focus`.

## Quy tắc
- Sắp theo lần đăng nhập gần nhất; công ty chưa vào lần nào ghi "Chưa đăng nhập lần nào".
- Phía trên có nút ghost "Đổi tài khoản", H2 "Chọn công ty để làm việc" và câu nói số công ty kèm email.
- Tài khoản chỉ có một công ty thì bỏ qua bước này.
