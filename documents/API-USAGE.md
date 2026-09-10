# Hướng dẫn: Export Rule Catalog qua API (end-to-end)

Hướng dẫn tuần tự từ lúc đăng ký export đến khi tải file kết quả thành công. Dành cho client/AI tự động thực hiện.

## Thông tin chung

- **Base URL**: `https://yyamtim5.pegaacademy.net/prweb/api/CodeIntelligence/v1`
- **Auth**: HTTP Basic — user `SSA@TGB`, password `pega123!`. Mọi request kèm `-u 'SSA@TGB:pega123!'`.
- **Luồng**: đăng ký export (nhận `jobId`) → poll status tới `DONE` → lấy tên file kết quả → tải file bằng resumable download → giải nén CSV.

---

## Bước 1 — Đăng ký export (enqueue job)

```bash
curl -X GET \
  'https://yyamtim5.pegaacademy.net/prweb/api/CodeIntelligence/v1/file/rulecatalog/export' \
  -H 'accept: text/plain' \
  -u 'SSA@TGB:pega123!'
```

- **Kết quả**: HTTP 200, body là `jobId` (UUID), ví dụ `e4d7d3d9-1aba-49ce-947a-9b4b63a730d4`.
- **Lưu lại `jobId`** cho các bước sau.

---

## Bước 2 — Poll trạng thái tới khi DONE

```bash
curl -X GET \
  'https://yyamtim5.pegaacademy.net/prweb/api/CodeIntelligence/v1/file/rulecatalog/export/{jobId}/status' \
  -H 'accept: text/plain' \
  -u 'SSA@TGB:pega123!'
```

- Thay `{jobId}` bằng giá trị Bước 1. Lặp mỗi **10–15 giây**.
- Trạng thái: `QUEUED` (đang chờ) → `RUNNING` (đang chạy, ~3 phút) → `DONE` (xong) hoặc `FAILED` (lỗi → xem Bước 6).
- Khi thấy `DONE` → sang Bước 3.

---

## Bước 3 — Lấy tên file kết quả

```bash
curl -X GET \
  'https://yyamtim5.pegaacademy.net/prweb/api/CodeIntelligence/v1/file/rulecatalog/export/{jobId}/result' \
  -H 'accept: text/plain' \
  -u 'SSA@TGB:pega123!'
```

- Khi DONE: trả **tên file** (relative path), ví dụ `rulecatalog_a1b2c3d4-....zip`. Lưu lại làm `{fileName}`.
- Nếu chưa xong: trả `Job not completed yet (status=RUNNING)...` → quay lại Bước 2.

---

## Bước 4 — Tải file bằng Resumable Download

Endpoint tải theo từng phần qua header **`Range: bytes=<start>-<end>`**, server trả **HTTP 206 Partial Content**.

> ⚠️ **HAI ĐIỂM QUAN TRỌNG (khác chuẩn HTTP thông thường):**
> 1. **Tổng kích thước file nằm ở header `x-file-size`**, KHÔNG phải trong `content-range`. Endpoint trả `content-range: bytes=0-4047` (không có `/total`). Phải đọc `x-file-size` để biết tổng bytes.
> 2. **Nội dung trả về là BASE64-ENCODED**, không phải binary thô. Kích thước tải về ≈ 1.33 × kích thước file thật. Phải **decode base64 TRƯỚC**, rồi mới có file ZIP hợp lệ.

### 4a. Tải chunk đầu + đọc tổng kích thước

```bash
curl -X GET \
  'https://yyamtim5.pegaacademy.net/prweb/api/CodeIntelligence/v1/file/resumableDownload/{fileName}' \
  -H 'accept: application/octet-stream' \
  -H 'Range: bytes=0-4047' \
  -u 'SSA@TGB:pega123!' \
  -D headers.txt \
  --output part_0.b64
```

- Đọc header **`x-file-size: <TOTAL>`** trong `headers.txt` → `<TOTAL>` là tổng số bytes của file ZIP thật (ví dụ `498963`).

### 4b. Tải toàn bộ (base64) — cách đơn giản

Gửi một range phủ hết file để lấy toàn bộ base64 trong một lần:

```bash
curl -X GET \
  'https://yyamtim5.pegaacademy.net/prweb/api/CodeIntelligence/v1/file/resumableDownload/{fileName}' \
  -H 'accept: application/octet-stream' \
  -H 'Range: bytes=0-{TOTAL-1}' \
  -u 'SSA@TGB:pega123!' \
  --output content.b64
```

Thay `{TOTAL-1}` = `x-file-size` − 1 (ví dụ `498962`).

> Nếu muốn tải phân mảnh: lặp `Range: bytes={start}-{end}` với `start += chunk` cho tới `start >= TOTAL`, lưu từng `part_n.b64`, rồi nối các part theo thứ tự thành `content.b64`. Lưu ý server có thể trả nhiều/ít hơn số bytes yêu cầu — theo dõi độ dài thực nhận.

### 4c. Decode base64 → file ZIP

```bash
# Linux/Mac
base64 -d content.b64 > rulecatalog.zip
```
```powershell
# Windows PowerShell
$b64 = [System.IO.File]::ReadAllText("content.b64").Trim()
$bytes = [System.Convert]::FromBase64String($b64)
[System.IO.File]::WriteAllBytes("rulecatalog.zip", $bytes)
# Kiểm tra: kích thước phải khớp x-file-size
(Get-Item "rulecatalog.zip").Length
```

- Sau decode, kích thước `rulecatalog.zip` phải **bằng đúng `x-file-size`**. Nếu khớp → file toàn vẹn.
- 4 byte đầu phải là `50 4B 03 04` (magic ZIP `PK\x03\x04`).

---

## Bước 5 — Giải nén

`rulecatalog.zip` → giải nén ra `rulecatalog.csv`. Đây là danh mục rule catalog hoàn chỉnh (header + mỗi rule 1 dòng).

```powershell
# Windows PowerShell
Expand-Archive "rulecatalog.zip" -DestinationPath "out" -Force
Get-Content "out\rulecatalog.csv" -TotalCount 1   # xem header
```

---

## Bước 6 — Nếu FAILED

1. Đọc message ngắn từ `/status` (Bước 2) — cho biết lý do vắn tắt.
2. Chi tiết đầy đủ (diagnostics) nằm trong file log cố định `rulecatalog_log.zip`. Tải nó bằng Bước 4 với `{fileName}` = `rulecatalog_log.zip` (cũng base64 → decode như 4c), giải nén đọc `rulecatalog_log.txt`.

---

## Lưu ý

- **Download trả base64** — phải decode (Bước 4c) trước khi giải nén. Đừng unzip thẳng file tải về.
- **Tổng size ở header `x-file-size`**, không phải `content-range`. Dùng nó để verify file sau decode.
- Luôn kèm `-u 'SSA@TGB:pega123!'` ở **mọi** request (không auth sẽ nhận HTTP 401).
- `jobId` từ Bước 1 dùng xuyên suốt Bước 2–3. `fileName` từ Bước 3 dùng cho Bước 4.
- Job chạy nền (~1–3 phút); đừng bỏ cuộc sớm khi còn `RUNNING`.
- Enqueue trả **HTTP 200** (không phải 202).
