# User Guide (UG)

## Code Intelligence Extension — SA4E-241: Incremental Indexing bằng Checksum (Pega Rule Catalog + code non-Pega + document)

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-241 |
| Title | Incremental indexing — skip item không đổi bằng checksum (Pega rule + code non-Pega + document) |
| Author | DEV Agent |
| Reviewer | BA Agent |
| Version | 1.0 |
| Date | 2026-04-30 |
| Status | Draft |
| Related BRD | BRD-v1-SA4E-241.docx |
| Related FSD | FSD-v1-SA4E-241.docx |
| Related TDD | TDD-v1-SA4E-241.docx |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-04-30 | DEV Agent | Tài liệu hướng dẫn ban đầu cho tính năng incremental indexing (SA4E-241). |
| 1.1 | 2026-04-30 | BA Agent | Review: bổ sung setting `kiroSdlc.pega.useCatalogExport` (opt-out, default true) vào §3.3 + bảng VS Code settings mới (§4.7) gồm `kiroSdlc.pegaEndpoint`, `kiroSdlc.pegaUsername`. |

---

## 1. Tổng quan

### 1.1 Incremental indexing là gì?

Command **"Index Source Code"** trong extension Code Intelligence quét toàn bộ dự án và đưa dữ liệu (rule Pega, mã nguồn thường, tài liệu) vào Knowledge Base để phục vụ tìm kiếm và phân tích. Với dự án Pega lớn (khoảng **17.978 rule**), mỗi lần index đầy đủ mất nhiều phút vì phải tải lại toàn bộ.

**Incremental indexing** (index tăng dần) chỉ tải và index **những gì đã thay đổi** kể từ lần chạy trước, và **bỏ qua (skip)** những gì không đổi. Việc phát hiện "có đổi hay không" dựa trên **checksum** — một chuỗi băm ngắn đại diện cho trạng thái của từng rule/file.

### 1.2 Lợi ích

| Lợi ích | Mô tả |
|---------|-------|
| Lần index thứ 2+ gần như tức thì | Khi không có gì thay đổi, extension skip gần 100% số rule/file — không tải lại nội dung. |
| Tiết kiệm thời gian | Từ "nhiều phút" xuống chỉ còn thời gian export + so checksum. |
| Luôn chính xác | Mọi thay đổi (kể cả data rule) đều được phát hiện qua save-time → không bỏ sót. |
| An toàn khi lỗi | Nếu không so được checksum, extension **index lại cho chắc** (fail-safe) — không bao giờ bỏ sót dữ liệu đã đổi. |

### 1.3 Đối tượng đọc

| Đối tượng | Cần gì từ tài liệu này |
|-----------|-----------------------|
| Developer | Cách chạy index tăng dần, đọc log, xử lý sự cố thường gặp. |
| Quản trị / Vận hành (DevOps) | Cấu hình backend (auth, giới hạn tài nguyên), chạy migration sau deploy. |

---

## 2. Cách hoạt động (tóm tắt)

Incremental indexing dùng **checksum** làm khóa so sánh duy nhất. Có **3 nguồn** sinh checksum, mỗi nguồn một công thức riêng:

| Nguồn | Công thức checksum | Ai tính |
|-------|-------------------|---------|
| **Pega rule** | `sha256( trim(pzInsKey) + "\|" + trim(pxUpdateDateTime) + "\|" + trim(pxSaveDateTime) )` — hex chữ thường, giá trị null quy về chuỗi rỗng. | Pega tính sẵn (cột trong CSV) **và** extension tự tính lại để đối chiếu. |
| **Code non-Pega** | Git blob hash: `sha1("blob " + size + "\0" + content)`. Khi không có git → fallback `sha256(relativePath + "\0" + content)`. | Extension tự tính. |
| **Document** | Giống code non-Pega (git blob hash; fallback `sha256(relativePath + "\0" + content)`). | Extension tự tính. |

**Nguyên tắc phân chia vai trò:**

- **Extension (client)** luôn **tự tính** checksum từ dữ liệu gốc. Với Pega, cột `checksum` trong CSV chỉ là giá trị tối ưu do Pega tính sẵn; extension **verify** lại bằng chính công thức để phát hiện lệch cấu hình.
- **Backend** chỉ **lưu và so** checksum — **không tự tính**. Extension gửi tập checksum lên endpoint `/pega/rulecatalog/bulk-check`, backend trả về tập checksum **đã tồn tại** (`existing`).
- Từ đó extension suy ra: `skip = existing` (đã có → không đổi), `fetch = tất cả − existing` (mới hoặc đã đổi → cần tải + index).

Checksum của rule/file được lưu ở cột `files.content_hash` phía backend — dùng chung một cột cho cả 3 nguồn.

---

## 3. Cài đặt / Quick Start

> Phần này dành cho người **cài extension và chạy**. Extension thuộc VS Code / Kiro.

### 3.1 Yêu cầu trước khi chạy

| Thành phần | Bắt buộc | Ghi chú |
|-----------|----------|---------|
| Extension Code Intelligence đã cài | Có | Cung cấp command "Index Source Code". |
| Backend Code Intelligence đang chạy | Có | Mặc định cổng `48721` (xem §4). |
| Thông tin đăng nhập Pega (chỉ dự án Pega) | Có (dự án Pega) | Lưu trong VS Code SecretStorage — **không** hardcode. |
| Git (khuyến nghị, cho code/document) | Không | Có git → dùng git blob hash; không có → fallback sha256. |

### 3.2 Các bước chạy

```text
# Bước 1: Mở thư mục dự án trong VS Code / Kiro

# Bước 2 (chỉ dự án Pega): nhập thông tin đăng nhập Pega khi được nhắc
#   Extension lưu credential vào SecretStorage — không lưu vào file, không commit.

# Bước 3: Chạy command
#   Command Palette (Ctrl+Shift+P) → "Index Source Code"

# Bước 4: Theo dõi tiến trình trong Output channel của extension
```

### 3.3 Với dự án Pega — Rule Catalog Export

Với dự án Pega, extension tự động dùng **Rule Catalog Export** (tải CSV danh mục toàn bộ rule) làm đường nhanh. Đường nhanh này **bật sẵn theo mặc định** (opt-out) — không cần bật thủ công:

1. Extension yêu cầu Pega export catalog → chờ job hoàn tất (có thể mất vài phút).
2. Tải file CSV về `.pega-cache/rulecatalog/` trong thư mục dự án.
3. Parse CSV, đọc checksum từng rule.
4. Gọi backend bulk-check để biết rule nào đã có (skip) và rule nào cần tải (fetch).
5. Chỉ tải + index phần cần fetch.

> **Bật/tắt đường nhanh — setting `kiroSdlc.pega.useCatalogExport`:**
> Setting này là **boolean, mặc định `true`** (Rule Catalog Export bật sẵn). Muốn quay về cơ chế **BFS crawl** cũ, đặt `kiroSdlc.pega.useCatalogExport = false` trong VS Code settings (`settings.json`). Khi `false` — hoặc khi `true` nhưng không có credential / export lỗi / trả 0 rule — extension tự động **fallback** sang BFS crawl. Bạn không cần làm gì thêm; xem chi tiết setting ở §4.7.

---

## 4. Configuration Reference

Cấu hình gồm hai nhóm: (a) phía **backend** qua biến môi trường (file `.env`, copy từ `backend/.env.example` — §4.1–§4.6) và (b) phía **extension** qua VS Code settings (`settings.json` — §4.7). Không có secret nào được commit — các giá trị credential dùng **placeholder**.

### 4.1 Auth / Tenant isolation

| Biến môi trường | Kiểu | Mặc định | Mô tả |
|-----------------|------|----------|-------|
| `CODE_INTEL_REQUIRE_AUTH` | boolean | `false` | Khi `true`, mọi endpoint `/pega/*` **yêu cầu identity**: header `X-Project-Id` hoặc JWT có claim `pid`. `projectId` được suy ra từ identity đã xác thực — **không** tin `body.projectId`. |
| `KB_TOKEN_SECRET` | string | *(rỗng)* | Khóa ký/xác thực JWT. Đặt giá trị ngẫu nhiên mạnh ở môi trường thật. **Để rỗng trong file mẫu — KHÔNG commit secret thật**; dùng secret manager ở production. |

### 4.2 Thông tin đăng nhập Pega (không hardcode)

> ⚠️ Credential Pega **do extension cung cấp qua SecretStorage** và gửi kèm mỗi request (`authHeader`). Các key dưới đây chỉ để **test thủ công cục bộ** — luôn dùng **placeholder**, không commit giá trị thật.

| Biến môi trường | Mô tả | Ví dụ (placeholder) |
|-----------------|-------|---------------------|
| `PEGA_ENDPOINT` | URL prweb của Pega. | `http://localhost:8080/prweb` |
| `PEGA_USERNAME` | Operator ID Pega. | `<your-pega-operator-id>` |
| `PEGA_PASSWORD` | Mật khẩu Pega. | `<your-pega-password>` |

Nếu không có `authHeader` (và cũng không có `username`+`password`), backend trả lỗi **`MISSING_AUTH` (400)** — không có credential mặc định (fail-closed).

### 4.3 Giới hạn tải xuống / chống zip-bomb

| Biến môi trường | Kiểu | Mặc định | Mô tả |
|-----------------|------|----------|-------|
| `CHECKSUM_MAX_TOTAL_SIZE` | bytes | `209715200` (200 MB) | Trần tổng bytes tải về khi resumable download catalog. |
| `CHECKSUM_MAX_CHUNKS` | số | `4096` | Trần số chunk (chống vòng lặp tải vô hạn). |
| `CHECKSUM_MAX_UNCOMPRESSED_SIZE` | bytes | `524288000` (500 MB) | Trần tổng bytes sau khi giải nén ZIP (chống zip-bomb). |
| `CHECKSUM_MAX_ZIP_ENTRIES` | số | `50000` | Trần số entry trong file ZIP. |

### 4.4 Giới hạn bulk-check

| Biến môi trường | Kiểu | Mặc định | Mô tả |
|-----------------|------|----------|-------|
| `BULK_CHECK_MAX_CHECKSUMS` | số | `5000` | Trần số checksum mỗi request bulk-check phía server. Client tự chia batch ≤ 1000 checksum/request. |

### 4.5 Server / Database (liên quan)

| Biến môi trường | Mặc định | Mô tả |
|-----------------|----------|-------|
| `PORT` | `48721` | Cổng backend Code Intelligence. |
| `DATABASE_ADAPTER` | `postgresql` | `postgresql` (prod) hoặc để chạy SQLite cục bộ khi dev. |
| `DATABASE_URL` | *(xem .env.example)* | Chuỗi kết nối PostgreSQL. |

### 4.6 Migration sau khi deploy (bắt buộc chạy 1 lần)

SA4E-241 đổi **ý nghĩa** của cột `content_hash` (từ hash full-JSON cũ → checksum save-time / git-blob), và thêm một index hỗ trợ bulk-check. Chạy migration runner:

```bash
# Tự động phát hiện engine (Postgres nếu có DATABASE_URL/DATABASE_ADAPTER=postgresql, ngược lại SQLite)
node scripts/db/run-sa4e-241-migration.mjs

# Chỉ định Postgres
DATABASE_URL=postgresql://<user>:<password>@<host>:5432/<db> node scripts/db/run-sa4e-241-migration.mjs

# Chỉ định file SQLite cục bộ
SQLITE_DB_PATH=.code-intel/index.db node scripts/db/run-sa4e-241-migration.mjs
```

Migration này **chỉ thêm index** `idx_files_project_content_hash (project_id, content_hash)` — **không** backfill hay convert hash cũ.

> **Lưu ý — full re-index 1 lần:** Vì ý nghĩa `content_hash` đổi, **lần index đầu tiên sau deploy** sẽ coi mọi checksum mới là "chưa có" → index lại toàn bộ (đây là hành vi đúng, an toàn). **Từ lần thứ 2 trở đi**, incremental hoạt động chuẩn: skip gần 100% khi không có gì đổi.

### 4.7 VS Code / Kiro Extension settings (`settings.json`)

Cấu hình phía **extension** đặt trong VS Code settings (`settings.json`, hoặc UI Settings → tìm "kiroSdlc"). Đây là nơi bật/tắt đường nhanh Rule Catalog Export và khai báo endpoint Pega.

| Setting | Kiểu | Mặc định | Mô tả |
|---------|------|----------|-------|
| `kiroSdlc.pega.useCatalogExport` | boolean | `true` | Dùng **Rule Catalog Export API** (đường nhanh incremental — tải danh mục rule qua CSV) khi index dự án Pega. Bật sẵn (opt-out). Đặt `false` để buộc dùng **BFS crawl** cũ. Khi `true` nhưng thiếu credential / export lỗi → tự fallback BFS crawl. |
| `kiroSdlc.pegaEndpoint` | string | `http://localhost:8080/prweb` | URL REST API của Pega Platform mà extension gọi tới. |
| `kiroSdlc.pegaUsername` | string | *(rỗng)* | Pega Operator ID (username). Để trống → nhập credential qua SecretStorage khi được nhắc. |

**Ví dụ `settings.json` — tắt đường nhanh, về BFS crawl:**

```json
{
  "kiroSdlc.pega.useCatalogExport": false,
  "kiroSdlc.pegaEndpoint": "http://localhost:8080/prweb"
}
```

> Các giá trị credential nhạy cảm (mật khẩu Pega) **không** lưu trong `settings.json` — extension lưu qua **SecretStorage** (xem §4.2). Chỉ khai báo endpoint/username ở `settings.json`.

---

## 5. Usage

### 5.1 Lần index đầu tiên (full run)

Khi chưa có trạng thái đã-index (DB rỗng hoặc vừa migrate), toàn bộ rule/file được coi là mới → tải + index đầy đủ.

**Log ví dụ (Output channel):**

```text
[Catalog] 📌 Project "HRAppsV2" → projectId=a1b2c3d4e5f6, 17978 rules to fetch
[Catalog] ⚡ Incremental: 0 unchanged skipped, 17978 to fetch
```

### 5.2 Lần index sau (incremental)

Khi phần lớn rule/file không đổi, extension gọi bulk-check → backend trả tập `existing` → extension skip phần đó, chỉ fetch phần đã đổi/mới.

**Log ví dụ khi có ít thay đổi:**

```text
[Catalog] 📌 Project "HRAppsV2" → projectId=a1b2c3d4e5f6, 17978 rules to fetch
[Catalog] ⚡ Incremental: 17975 unchanged skipped, 3 to fetch
```

**Log ví dụ khi không có gì đổi (no-change run):**

```text
[Catalog] ⚡ Incremental: 17978 unchanged skipped, 0 to fetch
[Catalog] ✅ Nothing changed — index is up to date.
```

### 5.3 Đọc dòng log incremental

Dòng quan trọng nhất để biết incremental có hoạt động:

```text
[Catalog] ⚡ Incremental: <X> unchanged skipped, <Y> to fetch
```

| Trường | Ý nghĩa |
|--------|---------|
| `<X> unchanged skipped` | Số rule không đổi bị bỏ qua (không tải lại). Càng cao càng tốt ở lần chạy lặp lại. |
| `<Y> to fetch` | Số rule mới/đã đổi cần tải + index. Ở no-change run, giá trị này bằng `0`. |

---

## 6. Administration

### 6.1 Endpoint bulk-check

Đây là endpoint trung tâm của cơ chế incremental. Extension gọi tự động — mục này để quản trị/kiểm thử hiểu hành vi.

| Thuộc tính | Giá trị |
|-----------|---------|
| Method / URL | `POST /pega/rulecatalog/bulk-check` |
| Auth | Header `X-Project-Id: <projectId>` **hoặc** `Authorization: Bearer <JWT>` (claim `pid`) khi `CODE_INTEL_REQUIRE_AUTH=true`. |
| Vai trò backend | Chỉ **lưu + so** checksum. Không tự tính. |

**Request:**

```json
{
  "projectId": "a1b2c3d4e5f6",
  "checksums": ["9f2c...", "a13b...", "c845..."]
}
```

- `projectId` là **tùy chọn** — chỉ dùng để backend đối chiếu với identity; nếu khác identity → trả `PROJECT_MISMATCH` (403).
- `checksums`: mảng hex chữ thường (40 ký tự cho git-blob sha1, hoặc 64 ký tự cho sha256), tối thiểu 1, tối đa `BULK_CHECK_MAX_CHECKSUMS` (mặc định 5000).

**Response 200:**

```json
{
  "data": { "existing": ["9f2c..."] },
  "error": null
}
```

Extension suy ra: `skip = existing`; `fetch = checksums − existing`.

### 6.2 Tenant isolation (cô lập theo project)

- Khi bật auth, backend suy `projectId` **từ identity đã xác thực** (`X-Project-Id` header hoặc JWT `pid` claim), **không** tin `body.projectId`.
- Tập `existing` trả về **chỉ** chứa checksum thuộc đúng project của identity — không rò rỉ dữ liệu giữa các project, kể cả khi giá trị checksum trùng nhau.
- Thiếu identity → `MISSING_PROJECT_IDENTITY` (401). Body sai identity → `PROJECT_MISMATCH` (403).

### 6.3 Xóa index của một project

Khi cần re-index sạch một project (ví dụ sau khi đổi công thức), dùng `POST /pega/clear-project`. Endpoint này cũng scope theo identity (fail-closed, không có fallback cross-tenant).

---

## 7. Troubleshooting

### 7.1 Common Issues

| # | Triệu chứng | Nguyên nhân | Cách xử lý |
|---|-------------|-------------|-----------|
| 1 | Bulk-check lỗi/timeout, log cảnh báo, nhưng index vẫn chạy đầy đủ | Backend bulk-check không phản hồi → extension **fail-safe full run** (coi `existing = ∅`) để không bỏ sót (BR-15) | Kiểm tra backend đang chạy (cổng `48721`) và mạng. Index vẫn đúng, chỉ chậm hơn lần này. |
| 2 | Cảnh báo "checksum không khớp công thức" (E-03) | Cột `checksum` do Pega ghi khác giá trị extension tự tính → lệch công thức export phía Pega | Kiểm tra cấu hình Rule Catalog Export phía Pega (công thức, trim, null→"", separator `\|`). Extension vẫn dùng giá trị tự tính (nguồn sự thật) và index lại các rule liên quan. |
| 3 | Một số rule thiếu/sai cột checksum (E-02) | CSV thiếu cột `checksum` hoặc sai định dạng cho vài rule | Với Pega, extension **tự tính** từ 3 field (`pzInsKey`, `pxUpdateDateTime`, `pxSaveDateTime`) → vẫn index được. Không cần thao tác gì; chỉ là cảnh báo. |
| 4 | Lần đầu sau deploy index lại toàn bộ dù "không đổi" | Migration đổi ý nghĩa `content_hash` → full re-index 1 lần (đúng thiết kế) | Bình thường. Từ lần chạy thứ 2, incremental skip gần 100%. |
| 5 | Lỗi `MISSING_AUTH` khi fetch rule | Không có credential Pega (thiếu `authHeader`/`username`+`password`) | Nhập lại credential Pega (extension lưu vào SecretStorage). Không dùng credential mặc định (fail-closed). |
| 6 | Lỗi `MISSING_PROJECT_IDENTITY` (401) | Bật `CODE_INTEL_REQUIRE_AUTH=true` nhưng request thiếu `X-Project-Id`/JWT `pid` | Gửi header `X-Project-Id` hoặc JWT hợp lệ. |
| 7 | Catalog trả 0 rule, fallback sang crawl | Rule Catalog Export không có dữ liệu hoặc lỗi | Extension tự fallback BFS crawl. Kiểm tra quyền/cấu hình Rule Catalog Export phía Pega nếu muốn dùng đường nhanh. |

### 7.2 Error Codes

| Code | HTTP | Mô tả | Hành động |
|------|------|-------|-----------|
| `MISSING_PROJECT_IDENTITY` | 401 | Thiếu identity project (không có `X-Project-Id` header và không có JWT `pid` claim) khi auth bật. | Gửi header `X-Project-Id` hoặc `Authorization: Bearer <JWT>` hợp lệ. |
| `PROJECT_MISMATCH` | 403 | `body.projectId` khác với identity đã xác thực. | Bỏ `projectId` khỏi body, hoặc gửi đúng project của identity. |
| `VALIDATION_FAILED` | 400 | Body không hợp lệ (JSON hỏng, hoặc checksum sai định dạng / vượt số lượng cho phép). | Kiểm tra `checksums` là hex 40/64 ký tự chữ thường, 1..`BULK_CHECK_MAX_CHECKSUMS` phần tử. |
| `MISSING_AUTH` | 400 | Thiếu credential Pega khi fetch rule (không có `authHeader` và cũng không có `username`+`password`). | Cung cấp credential Pega qua SecretStorage / authHeader. |
| `BULK_CHECK_FAILED` | 500 | Lỗi backend khi xử lý bulk-check (ví dụ lỗi DB). | Kiểm tra log backend + kết nối database. Extension sẽ fail-safe full run. |
| `NOT_READY` | 503 | Memory module của backend chưa sẵn sàng. | Chờ backend khởi động xong rồi chạy lại. |
| `INTERNAL_ERROR` | 500 | Lỗi không xác định phía backend. | Xem chi tiết trong log backend. |
| `E-02` (cảnh báo) | — | Rule thiếu/sai cột `checksum` trong CSV. | Extension tự tính checksum từ 3 field → vẫn index. Chỉ là cảnh báo. |
| `E-03` (cảnh báo) | — | Lệch công thức: cột CSV ≠ giá trị extension tính. | Kiểm tra cấu hình công thức export phía Pega. Extension dùng giá trị tự tính. |
| `E-04` (cảnh báo) | — | Bulk-check lỗi/timeout → coi như không có state → full run lần này. | Kiểm tra backend/mạng. Kết quả index vẫn đúng. |

### 7.3 Logs

| Vị trí log | Nội dung | Dùng cho |
|-----------|----------|----------|
| Output channel của extension | Tiến trình catalog, dòng `[Catalog] ⚡ Incremental: X unchanged skipped, Y to fetch`, cảnh báo E-02/E-03/E-04 | Kiểm tra incremental hoạt động, chẩn đoán checksum. |
| Log backend (Pino) | `pega/rulecatalog/bulk-check` (số checksum requested/existing — không log giá trị), các lỗi endpoint | Chẩn đoán auth, DB, tenant isolation. |

### 7.4 FAQ

**Q: Vì sao lần index đầu sau deploy vẫn chạy full dù tôi chưa đổi rule nào?**
A: Vì migration đổi ý nghĩa cột `content_hash`. Giá trị hash cũ không khớp công thức mới → hệ thống index lại 1 lần cho chắc (fail-safe). Từ lần thứ 2, incremental sẽ skip gần 100%.

**Q: Data rule không có timestamp trong `pzInsKey` thì phát hiện đổi kiểu gì?**
A: Công thức checksum gộp cả `pxSaveDateTime` và `pxUpdateDateTime`. Khi data rule được lưu lại, save-time đổi → checksum đổi → được index lại.

**Q: Backend có tự tính checksum không?**
A: Không. Backend chỉ **lưu và so** checksum. Extension (client) mới là nơi tính. Đây là thiết kế cố định (NT-4).

**Q: Bulk-check lỗi có làm mất dữ liệu index không?**
A: Không. Khi bulk-check lỗi, extension coi như "chưa có gì" và index đầy đủ lần này (fail-safe). Dữ liệu vẫn đúng, chỉ chậm hơn.

**Q: Cột checksum trong CSV bị thiếu thì sao?**
A: Với Pega, extension **tự tính** checksum từ 3 field cơ bản (`pzInsKey`, `pxUpdateDateTime`, `pxSaveDateTime`) nên vẫn hoạt động. Cột CSV chỉ là giá trị tối ưu do Pega tính sẵn.

**Q: Code non-Pega và document có bị ảnh hưởng không?**
A: Vẫn hoạt động như trước, chỉ khác cách tính checksum (git blob hash, fallback `sha256(path + NUL + content)`). File không đổi sẽ được skip; file đổi được index lại.

---

## 8. API Reference

### 8.1 POST /pega/rulecatalog/bulk-check

| Thuộc tính | Giá trị |
|-----------|---------|
| Name | Rule Catalog Bulk Check |
| Description | Nhận tập checksum client-computed, trả tập đã tồn tại trong project (`existing`). Backend không tính checksum. |
| Auth | `X-Project-Id` header hoặc JWT `pid` claim (khi `CODE_INTEL_REQUIRE_AUTH=true`). |

**Request:**

```json
{
  "projectId": "a1b2c3d4e5f6",
  "checksums": ["9f2c1a...", "a13b47...", "c8450d..."]
}
```

**Response (200):**

```json
{
  "data": { "existing": ["9f2c1a..."] },
  "error": null
}
```

**Response (lỗi — ví dụ 401):**

```json
{
  "data": null,
  "error": { "code": "MISSING_PROJECT_IDENTITY", "message": "X-Project-Id header or JWT pid claim is required." }
}
```

### 8.2 POST /pega/fetch-rule (tham chiếu)

Fetch chi tiết 1 rule theo `insKey` để index. Yêu cầu credential Pega (fail-closed `MISSING_AUTH` nếu thiếu). Được extension gọi tự động cho phần `fetch` (rule mới/đổi).

---

## 9. Appendix

### 9.1 Glossary

| Term | Definition |
|------|------------|
| Incremental indexing | Index tăng dần — chỉ tải + index item mới/đã đổi, skip item không đổi. |
| Checksum | Chuỗi băm (sha256/sha1 hex) đại diện trạng thái của một rule/file; dùng để phát hiện thay đổi. |
| Rule Catalog Export | Tính năng Pega xuất toàn bộ danh mục rule ra CSV (đóng gói ZIP). |
| bulk-check | Endpoint backend nhận tập checksum, trả tập đã tồn tại (`existing`). |
| Skip-before-fetch | Bỏ qua item không đổi **trước khi** tốn công tải chi tiết. |
| Data rule | Loại rule mà `pzInsKey` không chứa timestamp; phát hiện đổi qua save-time. |
| content_hash | Cột backend lưu checksum (dùng chung cho Pega rule, code, document). |
| Fail-safe re-index | Khi không so được checksum, index lại cho chắc để không bỏ sót. |
| pzInsKey / pxUpdateDateTime / pxSaveDateTime | Các field Pega dùng trong công thức checksum của rule (prefix `px`). |

### 9.2 Related Documents

| Document | Location |
|----------|----------|
| BRD | BRD-v1-SA4E-241.docx |
| FSD | FSD-v1-SA4E-241.docx |
| TDD | TDD-v1-SA4E-241.docx |

### 9.3 Version Compatibility

| System Version | Config Version | Breaking Changes |
|---------------|---------------|-----------------|
| SA4E-241 | v1 | Đổi ý nghĩa `content_hash` → cần chạy migration + full re-index 1 lần sau deploy. |
