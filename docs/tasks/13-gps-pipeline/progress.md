# Tiến độ 13-gps-pipeline

Trạng thái: ⬜ chưa làm · 🔄 đang làm · ❓ có code chưa rà soát · ⚠️ khác task.md · ❌ thiếu · ✅ xong

| Bước | Nội dung | Trạng thái | Commit |
|---|---|---|---|
| 1 | Schema `gps_devices`, migration partition `gps_logs` | ⬜ | |
| 2 | Xác thực thiết bị và endpoint ingest | ⬜ | |
| 3 | Hot path Redis | ⬜ | |
| 4 | Cold path worker và chống mất dữ liệu | ⬜ | |
| 5 | Bảo trì partition, quãng đường ngày và giám sát | ⬜ | |
| 6 | Thử tải và kịch bản kill worker | ⬜ | |
| 7 | Màn Live Fleet Map và Playback | ⬜ | |
| 8 | Hoàn tất | ⬜ | |

## Nhật ký
<!-- Sau mỗi bước: ngày, đã làm gì, kết quả Kiểm tra, việc người dùng cần làm thủ công. -->
