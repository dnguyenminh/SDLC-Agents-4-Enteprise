# User Guide (UG) — SA4E-362: Tự động refresh token & dừng ingest sạch khi phiên hết hạn

> Ticket: SA4E-362 · Linked: SA4E-99, SA4E-300 · Date: 2026-10-16

## 1. Tổng quan

Khi chạy **"Index Source Code"** cho dự án Pega, extension đẩy rule vào Knowledge Base backend qua các request bảo vệ bằng JWT. Trước bản fix này, nếu access token hết hạn **giữa chừng job** (job lớn chạy nhiều phút), mọi request sau đó đều nhận 401 "Invalid or expired token" và rule bị **skip hàng loạt** (25.000+ rule) — job kết thúc "xong" nhưng thiếu dữ liệu mà không có cảnh báo rõ ràng. SA4E-362 sửa hành vi này.

## 2. Thay đổi (user-visible)

| Trước | Sau |
|-------|-----|
| Token hết hạn giữa job → hàng loạt log `Ingest POST failed (skipping): Invalid or expired token`, hàng nghìn rule bị skip | Extension **tự refresh token đúng 1 lần** rồi retry request — job **tiếp tục** bình thường |
| Session chết (refresh token cũng hết hạn) → job vẫn chạy tiếp và skip hàng nghìn rule một cách âm thầm | Ingest **dừng sớm, sạch sẽ** + notification cảnh báo rõ ràng; state local được **preserve** → chạy lại sau là incremental |
| Log spam `bulk-check HTTP 401 Unauthorized` | Bulk-check tự refresh-retry, không còn spam |

## 3. Thông báo mới trên màn hình / log

| Thông báo | Ý nghĩa |
|-----------|---------|
| `⛔ Auth hết hạn và refresh thất bại — dừng ingest. Hãy login lại rồi chạy lại (state đã preserve).` (notification + log `[Pega Ingester]`) | Phiên đăng nhập backend đã chết (refresh token không dùng được). Ingest đã dừng sạch — không skip thêm rule nào. |
| `[Pega Ingester] ⏸️ Paused due to auth` (log Output channel) | Vòng crawl dừng do auth — cùng sự kiện với notification ở trên. |

## 4. Troubleshooting

| Triệu chứng | Ý nghĩa | Hành động |
|-------------|---------|-----------|
| Notification `⛔ Auth hết hạn và refresh thất bại — dừng ingest. Hãy login lại rồi chạy lại (state đã preserve).` | Refresh token đã chết (phiên hết hạn hoàn toàn) | **Đăng nhập lại** backend, sau đó chạy lại "Index Source Code". Các rule đã ingest trước đó bị skip qua local index — chỉ phần còn dở được ingest tiếp. |
| Job dừng giữa chừng, log có `⏸️ Paused due to auth` | Cùng nguyên nhân auth ở trên | Như trên: login lại rồi chạy lại. |
| Job có một khoảng dừng ngắn rồi chạy tiếp bình thường | Extension vừa **tự refresh token** (kịch bản thiết kế) | **Không cần hành động gì** — đây là hành vi bình thường. |
| Vẫn thấy log cũ `Ingest POST failed (skipping): Invalid or expired token` lặp hàng loạt | Bản fix chưa có trong extension đang chạy | Update/reload extension lên bản chứa SA4E-362. |

## 5. Câu hỏi thường gặp

**Q: Chạy lại sau khi login có ingest lại toàn bộ từ đầu không?**
A: Không. State đã preserve — rule đã ingest thành công được skip qua local index; chỉ phần còn lại tiếp tục (incremental).

**Q: Tôi thấy log có một lần "refresh token" rồi job chạy tiếp — có lỗi không?**
A: Bình thường. Token hết hạn giữa job là kịch bản thiết kế: refresh đúng 1 lần rồi retry, job không bị gián đoạn.

**Q: Tại sao trước đây job "xong" mà KB vẫn thiếu rule?**
A: Bản cũ skip rule lỗi auth một cách âm thầm. Bản mới dừng sớm + cảnh báo, nên không còn tình trạng "xong ảo".

## 6. Tài liệu liên quan

| Tài liệu | Vị trí |
|----------|--------|
| UG luồng indexing tổng thể (incremental, checksum) | `documents/SA4E-241/UG.md` |
| BRD / FSD / TDD ticket này | `documents/SA4E-362/` |
