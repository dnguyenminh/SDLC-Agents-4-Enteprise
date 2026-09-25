# User Guide — Pega Rule Catalog Export Indexing (SA4E-240)

| Field | Value |
|-------|-------|
| Feature | Pega Rule Catalog Export fast-path indexing |
| Component | Kiro Extension (`extension/`) |
| Version | 1 |

---

## 1. Overview

Khi index một Pega project, extension mặc định dùng **Rule Catalog Export** — lấy toàn bộ danh sách rule (~17,979) qua một API duy nhất (nhanh, đầy đủ), rồi ingest vào Knowledge Base. Nếu API export không khả dụng, extension **tự động fallback** về cách crawl cũ (BFS). Bạn không cần làm gì thêm.

## 2. Quick Start

1. Mở Pega project trong Kiro (workspace có `pega-project.json` hoặc credentials Pega đã cấu hình).
2. Đảm bảo credentials Pega đã lưu (SecretStorage) — dùng lệnh cấu hình Pega của extension.
3. Chạy lệnh **Index Project**.
4. Theo dõi progress: bạn sẽ thấy các message dạng
   - `Rule Catalog: requesting export...`
   - `Rule Catalog: export running (this can take a few minutes)...`
   - `Rule Catalog: downloading <fileName>...`
   - `Rule Catalog: parsing rule list...`
5. Khi xong, log hiển thị: `🏛️ Pega (catalog): "<AppName>" — <N> rules in catalog, ingested <M>`.

## 3. Configuration Reference

| Setting | Type | Default | Mô tả |
|---------|------|---------|-------|
| `kiroSdlc.pega.useCatalogExport` | boolean | `true` | Bật fast-path Rule Catalog Export. Đặt `false` để dùng BFS crawl cũ. |
| `kiroSdlc.pega.endpoint` | string | — | Pega Platform REST API endpoint URL (dùng cho mọi API Pega). |

### Ví dụ (settings.json)
```json
{
  "kiroSdlc.pega.useCatalogExport": true,
  "kiroSdlc.pega.endpoint": "https://your-pega.example.net/prweb"
}
```

## 4. Usage

### 4.1 Index bình thường (fast-path)
Không cần cấu hình gì thêm ngoài credentials + endpoint. Chạy Index → catalog export tự chạy.

### 4.2 Tắt fast-path (dùng BFS crawl)
Đặt `kiroSdlc.pega.useCatalogExport = false` rồi chạy Index. Extension bỏ qua catalog export, crawl từng rule như trước.

### 4.3 Kết quả lưu ở đâu
- File tạm: `<workspace>/.pega-cache/rulecatalog/rulecatalog.zip` và `rulecatalog.csv`.
- Rule đã ingest: trong Knowledge Base (tìm bằng KB search).

## 5. How It Works (tóm tắt kỹ thuật)

1. Đăng ký export → nhận `jobId`.
2. Poll trạng thái (QUEUED → RUNNING → DONE), tối đa ~10 phút.
3. Lấy tên file zip kết quả.
4. Tải file (resumable, base64, HTTP 206), decode → zip → giải nén `rulecatalog.csv`.
5. Parse CSV (16 cột) → danh sách rule → đưa vào pipeline fetch+ingest hiện có → KB.

## 6. Troubleshooting

| Triệu chứng | Nguyên nhân | Cách xử lý |
|-------------|-------------|-----------|
| Log "Catalog export failed ... falling back to BFS crawl" | API export lỗi/timeout | Không cần làm gì — fallback tự chạy. Kiểm tra endpoint/credentials nếu muốn dùng fast-path. |
| Log "Catalog export job FAILED" | Job phía Pega lỗi | Xem `rulecatalog_log.zip` trên server (diagnostics). Extension đã fallback. |
| "Catalog download size mismatch" | File tải về không toàn vẹn | Chạy lại Index; kiểm tra kết nối mạng. |
| "not a valid ZIP" | Response bị hỏng | Chạy lại Index. |
| Index rất chậm nhưng không có message "Catalog" | `useCatalogExport=false` hoặc không có credentials | Bật setting + cấu hình credentials để dùng fast-path. |
| HTTP 401 | Credentials sai/thiếu | Cấu hình lại credentials Pega. |

## 7. Error Codes / Messages

| Message | Ý nghĩa | Hành động |
|---------|---------|-----------|
| `Catalog export enqueue failed: HTTP <status>` | Đăng ký export lỗi | Fallback tự động; kiểm tra endpoint |
| `Catalog export job <id> FAILED` | Job export thất bại | Fallback; xem log server |
| `Catalog export job <id> did not finish within 600s` | Timeout poll (10 phút) | Fallback; job có thể quá lớn/nghẽn |
| `Catalog download size mismatch` | Tải không đủ bytes | Chạy lại |
| `Catalog download is not a valid ZIP` | Base64/ZIP hỏng | Chạy lại |

## 8. FAQ

**Q: Tôi có phải bật gì để dùng tính năng này không?**
A: Không. Mặc định đã bật (`useCatalogExport=true`).

**Q: Nếu Pega version của tôi không có API export thì sao?**
A: Extension tự fallback về BFS crawl — vẫn index được, chỉ chậm hơn.

**Q: Dữ liệu rule có bị commit vào git không?**
A: File tạm nằm trong `.pega-cache/`. Nên thêm vào `.gitignore` để tránh commit.

**Q: Có tốn thêm dependency không?**
A: Không — chỉ dùng thư viện chuẩn của Node (fs, path, zlib, crypto).
