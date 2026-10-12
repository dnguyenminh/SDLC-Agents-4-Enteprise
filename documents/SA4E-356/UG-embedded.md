# User Guide (UG)

## SA4E Extension MCP File Tools — SA4E-356: Path Resolution theo Workspace Root

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-356 |
| Title | [Bug] MCP tools: relative file_path resolves against process CWD (Kiro install dir) instead of workspace root |
| Author | DEV Agent |
| Reviewer | BA Agent |
| Version | 1.0 |
| Date | 2026-10-12 |
| Status | Draft |
| Related BRD | documents/SA4E-356/BRD.md (v1.0.2) |
| Related FSD | documents/SA4E-356/FSD.md (v1.3) |
| Related TDD | documents/SA4E-356/TDD.md (v1.2) |
| Related STC | documents/SA4E-356/STC.md (v1.1 — error behaviors đã verify bằng tests) |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-10-12 | DEV Agent | Initial document — UG cho các MCP file tools sau fix path resolution (SA4E-356): Path Rules, Error Codes + Format 1/2/3, troubleshooting, FAQ, behavior changes |

---

## 1. Introduction

### 1.1 Purpose

Guide này mô tả **cách dùng đúng** các MCP file tools của SA4E extension sau khi fix bug SA4E-356: trước đây, relative `file_path` bị resolve theo **process CWD của extension host** (= thư mục cài Kiro, ví dụ `C:\Users\ASUS\AppData\Local\Programs\Kiro`) thay vì **workspace root** của project đang mở — gây `ENOENT` cho mọi file-based call với relative path và buộc agent phải retry bằng absolute path.

Sau fix, toàn bộ MCP tools nhận tham số đường dẫn (`file_path` / `output_path`) đi qua **một shared helper duy nhất** — `PathResolver` (`extension/src/services/PathResolver.ts`) — với quy tắc resolve nhất quán, containment check chống path escape, và error message **tự-sửa được** (chứa absolute path đã resolve + gốc resolve + gợi ý).

**Đối tượng chính của guide này:** AI agents (MCP clients — BA / SA / QA / DEV / DevOps trong pipeline SDLC) và developers làm việc với extension. Guide giúp agent: (1) biết chính xác cách path được interpret trước khi gọi tool, (2) đọc error và **tự-heal trong ≤ 1 lượt retry** (AC-2), (3) hiểu các behavior change so với phiên bản cũ.

### 1.2 Audience

| Audience | What They Need |
|----------|---------------|
| AI Agent (MCP client) | Quy tắc path resolution (§3), cách gọi từng tool (§5), bảng error codes + self-heal (§7), behavior changes (§10) |
| Extension Developer | Chi tiết hành vi từng tool, symlink edge case (§8), log locations (§8.3), FAQ triển khai (§9) |
| System Administrator | Phần này N/A — không có config/triển khai mới (xem §4, §6) |

### 1.3 Prerequisites

| Prerequisite | Version | Required |
|-------------|---------|----------|
| Kiro (hoặc VS Code) với SA4E extension đã cài | phiên bản chứa fix SA4E-356 | Yes |
| Workspace đã mở trong Kiro | bất kỳ (folder project của bạn) | Bắt buộc cho **relative** path; optional cho absolute |
| Node.js `fs` / `path` | built-in (không cài thêm) | Yes |

> **Không có dependency, config hay cài đặt mới** cho fix này. Toàn bộ thay đổi là behavior nội bộ của extension (chi tiết §10).

---

## 2. Getting Started

> **Lưu ý:** Extension đã có sẵn trong Kiro — **KHÔNG cần cài thêm gì** cho fix SA4E-356. Đây là behavior change nội bộ: sau khi Kiro nạp phiên bản extension chứa fix (reload window nếu cần), mọi file-based MCP tool tự động hành xử theo các quy tắc trong §3.

### 2.1 Quick Start

```text
# Bước 1: Mở workspace project của bạn trong Kiro
#   (vd: C:\projects\kiro\SDLC-Agents-4-Enterprise)

# Bước 2: Gọi thử một file tool với RELATIVE path tính từ workspace root
stream_write_file(file_path="documents/SA4E-356/notes.md", content="# Notes")

# Bước 3: Kiểm tra kết quả — THÀNH CÔNG nếu thấy:
#   "Wrote file: C:\projects\kiro\SDLC-Agents-4-Enterprise\documents\SA4E-356\notes.md"
#   → relative path đã được resolve đúng theo workspace root, KHÔNG còn
#     resolve vào thư mục cài Kiro như bug cũ.
```

**Verification nhanh (replay repro gốc SA4E-355):**

```text
jira_attach_file(issue_key="SA4E-355", file_path="documents/SA4E-355/FSD.md")
# Trước fix: ENOENT 'C:\Users\...\Kiro\documents\SA4E-355\FSD.md' → phải retry absolute
# Sau fix:   attach thành công NGAY LẦN ĐẦU với relative path (AC-5)
```

### 2.2 System Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| Kiro / VS Code | phiên bản đang chạy extension | mới nhất |
| Workspace | ít nhất 1 folder mở (cho relative path) | 1 folder chính + dùng absolute cho file ngoài folder chính |
| File size | content ≤ 10 MB (`stream_write_file`); file pre-read ≤ 25 MB (proxy tools) | nhỏ hơn nhiều giới hạn |

### 2.3 Distribution Formats

N/A — không có artifact phân phối mới. Fix nằm trong extension source (`extension/src/`), được nạp cùng extension host của Kiro.

### 2.4 Configuration Methods

N/A — không có config mới. Tool tự đọc primary workspace folder từ VS Code/Kiro Workspace API (`vscode.workspace.workspaceFolders[0].uri.fsPath`) **mỗi lần gọi** (không cache — đổi workspace giữa phiên có hiệu lực ngay). Xem §4.

---

## 3. Path Rules (TRỌNG TÂM — đọc trước khi gọi bất kỳ file tool nào)

Đây là phần quan trọng nhất của guide. Mọi MCP tool nhận `file_path` / `output_path` áp **cùng một bộ quy tắc** qua shared helper `resolveWorkspacePath`:

### 3.1 Quy tắc resolve

| # | Input | Hành vi | Kết quả |
|---|-------|---------|---------|
| 1 | **Relative path** (vd `documents/SA4E-356/FSD.md`) | Resolve theo **primary workspace folder** = folder **ĐẦU TIÊN** trong `workspaceFolders` (multi-root: luôn folder 1 — deterministic) | `<workspace_root>\<relative>` — ví dụ `C:\projects\kiro\SDLC-Agents-4-Enterprise\documents\SA4E-356\FSD.md` |
| 2 | **Absolute path** (vd `C:\projects\...\FSD.md`) | **Passthrough** — `path.resolve()` chỉ chuẩn hóa separator (`/` ↔ `\`) và dot-segment, **vị trí không đổi** (backward compatible) | Đúng path bạn truyền |
| 3 | Path chứa `../` **escape ra ngoài** workspace root | **BỊ CHẶN** — `PATH_REJECTED_OUTSIDE_WORKSPACE` (Format 2) | Không chạm file system, không có side-effect |
| 4 | Absolute path **ngoài** workspace root (khi ĐANG mở workspace) | **BỊ CHẶN** — cùng code trên (containment áp cho cả absolute) | Error Format 2 kèm raw + resolved + root |
| 5 | Drive letter / tên folder **hoa-thường khác nhau** trên Windows (`C:\` vs `c:\`) | So sánh **case-insensitive trên Windows** → path hợp lệ KHÔNG bị reject oan (fix R-1) | PASS như path thường |
| 6 | Relative path khi **KHÔNG mở workspace** | **TỪ CHỐI fail-loud** — `PATH_NO_WORKSPACE` (Format 3). KHÔNG còn resolve âm thầm vào thư mục cài Kiro | Error kèm gợi ý dùng absolute hoặc mở workspace |
| 7 | Absolute path khi **KHÔNG mở workspace** | Passthrough (không containment — không có workspace root để so) | Đúng path bạn truyền |
| 8 | `file_path` rỗng / chỉ whitespace / không phải string / chứa NUL byte | **BỊ CHẶN trước khi resolve** — `PATH_EMPTY` / `PATH_INVALID` | Error fail-loud |

### 3.2 Payload limits (fail-loud, chống self-DoS)

| Tool | Giới hạn | Message khi vượt |
|------|----------|------------------|
| `stream_write_file` — `content` | **10 MB** (byte length UTF-8) | `FS_ERROR: payload too large (limit 10 MB): refusing to write '<path>'. Split the write into smaller chunks.` |
| Proxy pre-read (`drawio_export_png`, `mem_ingest_file` đường MCP wrapper) | **25 MB** per file | `FS_ERROR: file too large for proxy pre-read (limit 25 MB): <resolvedPath> — attach a smaller file or read a slice.` |

### 3.3 Quy tắc phụ

- **`output_path` áp cùng quy tắc** với `file_path`. Khi không truyền:
  - `embed_image` → default `<file_path>` chèn `-embedded` trước extension (vd `BRD.md` → `BRD-embedded.md`), derived từ **resolved** input nên luôn nằm trong workspace.
  - `drawio_export_png` → default hoán đổi `.drawio` → `.png`; input không phải `.drawio` → nối thêm `.out`.
- **Image refs bên trong markdown** (`embed_image`): mỗi ref (`![alt](path)`) được containment-check **riêng lẻ**. Ref resolve ra ngoài workspace root → bị **skip** (giữ nguyên trong output, đếm vào `skipped`) — **không throw**, không ghi file ra ngoài (SEC-01, fail-closed).
- **Alias legacy `args.path`**: vẫn được chấp nhận ở `stream_write_file`, `embed_image`, `mem_ingest_file` (chat) nhưng **KHÔNG nằm trong inputSchema** — hãy dùng `file_path`.
- **Invariant quan trọng:** tool **không bao giờ** đưa raw path của bạn thẳng vào `fs.*` — mọi thao tác file dùng absolute path ĐÃ resolve. Do đó error message luôn in **resolved path** (không phải raw path bạn truyền) — dùng nó để chẩn đoán.

---

## 4. Configuration Reference

**KHÔNG có configuration mới cho fix SA4E-356.** Bảng dưới ghi nhận rõ trạng thái để tránh nhầm lẫn:

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| *(none)* | — | — | Fix này không thêm/sửa bất kỳ config nào. Workspace root được đọc trực tiếp từ VS Code/Kiro Workspace API mỗi tool call; fallback `process.cwd()` chỉ dùng ở nhánh không-mở-workspace (và khi đó relative path bị từ chối — xem §3.1 row 6) |

**Cách hệ thống xác định workspace root (tự động, không config):**

1. Đọc `vscode.workspace.workspaceFolders[0].uri.fsPath` **mỗi lần gọi** — không cache → bạn đổi/add workspace folder giữa phiên là có hiệu lực ngay ở call tiếp theo.
2. Nếu không mở workspace (list rỗng/undefined, hoặc đọc `fsPath` throw — vd untitled/virtual workspace) → `rootSource = cwd_fallback`: relative path bị từ chối `PATH_NO_WORKSPACE`; absolute path passthrough không containment.
3. Root được dùng cho cả resolve lẫn containment check (so sánh case-insensitive trên Windows).

---

## 5. Usage

### 5.1 `stream_write_file` — ghi/nối file (tạo parent dirs)

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `file_path` | string | Yes | Relative (theo workspace root) hoặc absolute |
| `content` | string | Yes | Nội dung ghi (≤ 10 MB) |
| `mode` | `"write"` \| `"append"` | No (default `write`) | Ghi đè hoặc nối thêm |

**Ví dụ — relative:**

```
stream_write_file(file_path="documents/SA4E-356/notes.md", content="# Notes\nHello")
```

**Expected Output (success):**

```text
Wrote file: C:\projects\kiro\SDLC-Agents-4-Enterprise\documents\SA4E-356\notes.md
```

**Ví dụ — absolute (kết quả giống hệt):**

```
stream_write_file(file_path="C:\projects\kiro\SDLC-Agents-4-Enterprise\documents\SA4E-356\notes.md", content="More", mode="append")
```

**Expected Output (append):**

```text
Appended to: C:\projects\kiro\SDLC-Agents-4-Enterprise\documents\SA4E-356\notes.md
```

**Lỗi thường gặp:**

- `content` > 10 MB → `FS_ERROR: payload too large (limit 10 MB): refusing to write '<path>'. Split the write into smaller chunks.` → chia nhỏ thành nhiều lượt `append`.
- `file_path` thiếu `content` → `'file_path' and 'content' required.`
- Ghi ra ngoài workspace root (khi có workspace) → `PATH_REJECTED_OUTSIDE_WORKSPACE` (§7).

### 5.2 `jira_attach_file` — attach file lên Jira issue

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `issue_key` | string | Yes | Issue key (vd `SA4E-355`) |
| `file_path` | string | Yes | File local để upload |

**Ví dụ — relative (repro gốc của bug, giờ đã fix):**

```
jira_attach_file(issue_key="SA4E-355", file_path="documents/SA4E-355/FSD.md")
```

**Expected Output (success):** JSON response của Atlassian REST kèm attachment mới (id, filename lấy từ **basename của resolved path**).

**Hành vi quan trọng:** nếu resolve path fail → tool trả error NGAY và **KHÔNG gọi HTTP** — không bao giờ có attachment "mồ côi" sinh ra từ path sai.

**Lỗi thường gặp:** file không tồn tại → `FILE_NOT_FOUND: File not found: <resolvedPath>. Resolved against workspace root <root>. Gợi ý: dùng absolute path (nằm trong workspace root) hoặc kiểm tra lại đường dẫn tương đối tính từ workspace root.` (§7.2 Format 1).

### 5.3 `embed_image` — nhúng ảnh local trong markdown thành base64 data URI

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `file_path` | string | Yes | File markdown input |
| `output_path` | string | No | Default `<file_path>` chèn `-embedded` trước extension |

**Ví dụ — relative:**

```
embed_image(file_path="documents/SA4E-356/BRD.md")
```

**Expected Output (success):**

```text
Embedded 3 image(s), skipped 0 → C:\projects\kiro\SDLC-Agents-4-Enterprise\documents\SA4E-356\BRD-embedded.md
```

**Hành vi quan trọng:**

- Image refs (`![alt](path)`) **trong workspace** → được thay bằng `data:image/...;base64,...`.
- Image refs **ngoài workspace** (vd `../../../../etc/passwd`, absolute `C:\Windows\file.png`) → **giữ nguyên** trong output, tăng `skipped` — tool không fail, không đọc file ngoài workspace (SEC-01).
- Ref `http(s)://` / `data:` → giữ nguyên (không phải file local).

### 5.4 `drawio_export_png` — export diagram draw.io sang PNG

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `file_path` | string | Yes | File `.drawio` input (≤ 25 MB cho pre-read) |
| `output_path` | string | No | Default: `.drawio` → `.png`; input không phải `.drawio` → nối `.out` |

**Ví dụ — relative:**

```
drawio_export_png(file_path="documents/SA4E-356/diagrams/use-case.drawio")
```

**Expected Output (success):** JSON với `file_path` = resolved PNG path + `size_bytes`:

```json
{ "file_path": "C:\\projects\\kiro\\SDLC-Agents-4-Enterprise\\documents\\SA4E-356\\diagrams\\use-case.png", "size_bytes": 48213 }
```

**Ghi chú:** tool này chạy qua **extension proxy** — extension đọc file (qua PathResolver) rồi gửi `content_base64` xuống backend render. Gọi qua `execute_dynamic_tool(drawio_export_png, ...)` (nested path) cũng được cover cùng quy tắc.

### 5.5 `mem_ingest_file` — ingest document vào memory/KB

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `file_path` | string | Yes | File markdown/text cần ingest (≤ 25 MB pre-read — áp cho đường **wrapper**; đường chat đọc toàn bộ, không cap) |
| `type` | string | No | `CONTEXT` (default) / `REQUIREMENT` / `ARCHITECTURE` / `DECISION` / `PROCEDURE` |
| `scope` | string | No | `USER` / `PROJECT` / `SHARED` |

**Ví dụ — relative:**

```
mem_ingest_file(file_path="documents/SA4E-356/UG.md", type="CONTEXT", scope="PROJECT")
```

**Expected Output (success):** JSON xác nhận entry đã ingest từ backend memory service.

**Hai đường gọi — cùng quy tắc path:**

- **MCP wrapper path** (tools/call): extension pre-read file → gửi `content_base64`; file được gửi kèm **resolved absolute path** để backend dedup nhất quán.
- **Chat path** (ToolProxy): extension pre-read nội dung + gửi absolute path. Lưu ý riêng: error trên đường chat trả text với prefix **`Wrapper Error:`** — chat ToolResult không có field `isError`, nên consumer **PHẢI coi text bắt đầu bằng `Wrapper Error:` là FAILURE**.

### 5.6 `confluence_add_attachment` — upload file lên Confluence page

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `page_id` | string | Yes | Confluence page ID |
| `file_path` | string | Yes | File local để upload |

**Ví dụ — relative:**

```
confluence_add_attachment(page_id="123456789", file_path="documents/SA4E-356/UG.md")
```

**Expected Output (success):** JSON response của Confluence REST kèm attachment mới. Resolve fail → error NGAY, không build FormData, không gọi HTTP (giống §5.2).

### 5.7 `drawio_auto_layout` — tự sắp xếp layout diagram (LƯU Ý: resolve phía backend)

Tool này **vẫn resolve phía backend child server** theo `config.workspace` của backend — KHÔNG qua PathResolver của extension (audit gap BR-12; fix resolve tách ticket riêng OI-1). Trong scope SA4E-356 chỉ có **error disambiguation**:

| Trường hợp | Message |
|-----------|---------|
| Thiếu/rỗng `file_path` | `file_path is required` |
| Path bị reject (escape / lệch backend workspace) | `Path rejected: <raw> resolves to <resolved> — outside backend workspace <workspace>. Hint: use a path inside the backend workspace, or route file-content tools through the extension proxy.` |

**Khuyến nghị cho agent:** với file `.drawio` trong workspace, ưu tiên `drawio_export_png` (đi qua proxy, path resolve đúng theo workspace). Nếu bắt buộc dùng `drawio_auto_layout` mà gặp "outside backend workspace" → kiểm tra `config.workspace` của backend hoặc dùng đường proxy.

### 5.8 `sandbox_run` — KHÔNG ảnh hưởng

Tham số `file` của `sandbox_run` là path **bên trong sandbox session**, không phải workspace-relative path trên host — không thuộc phạm vi quy tắc §3 (kết luận audit row #8).

---

## 6. Administration

**N/A** — fix này không có tác vụ admin: không config mới, không service mới, không cần restart hạ tầng. Hai điểm đáng nhớ:

1. **Multi-root workspace:** hệ thống luôn dùng folder đầu tiên (primary) — deterministic. Không có lựa chọn "folder nào làm gốc" qua config.
2. **Không cần hot-reload config:** workspace root được đọc lại mỗi tool call; việc mở/đóng/đổi workspace có hiệu lực tức thì ở call kế tiếp.

---

## 7. Error Codes

### 7.1 Bảng error codes đầy đủ

Mọi error fail-loud (`isError: true`) với prefix `CODE:` — tool forward message **nguyên vẹn** (không cắt prefix, không wrap thêm). Agent parse code này để quyết định hành động tiếp theo.

| Code | Sinh tại | Message (template) | Ý nghĩa | Agent self-heal |
|------|----------|--------------------|---------|-----------------|
| `PATH_EMPTY` | Helper Step 1 | `PATH_EMPTY: 'file_path' must be a non-empty string.` | `file_path` rỗng / chỉ whitespace / không phải string | Truyền path hợp lệ. KHÔNG retry với `""` (helper cố tình không resolve `""` về workspace root) |
| `PATH_INVALID` | Helper Step 1 | `PATH_INVALID: 'file_path' contains invalid characters (NUL byte).` | Path chứa NUL byte (`\0`) — fs sẽ throw lỗi không đọc được nếu để lọt | Xóa ký tự NUL khỏi path rồi gọi lại |
| `PATH_NO_WORKSPACE` | Helper Step 2b | **Format 3** (§7.2) | Relative path khi **không mở workspace** — hệ thống cố tình KHÔNG resolve vào thư mục cài Kiro | **Retry bằng absolute path** nằm trong folder bạn muốn, HOẶC mở workspace rồi gọi lại relative (AC-2) |
| `PATH_REJECTED_OUTSIDE_WORKSPACE` | Helper Step 4 (+ guard symlink) | **Format 2** (§7.2); guard variant thêm `via symlink/junction.` | Path escape (`../` ra ngoài) hoặc absolute/realpath ngoài workspace root — chống arbitrary file read/write | Sửa path nằm **trong** workspace root. KHÔNG retry với biến thể escape khác — đây là dead end có chủ đích |
| `FILE_NOT_FOUND` | Tool handler (sau resolve OK) | **Format 1** (§7.2) | Path resolve ĐÚNG gốc rồi nhưng file thật sự **chưa tồn tại** | Retry đúng **1 lần**: dùng absolute path theo gợi ý, hoặc **tạo file trước** (`stream_write_file`) nếu nghiệp vụ cho phép. Vẫn fail → dừng và báo user — KHÔNG retry vô hạn (N-6: ≤ 1 retry / file operation) |
| `FS_ERROR` | Tool handler / proxy | Format 1 variant: `FS_ERROR: Failed <operation> <resolvedPath>: <err.message>`; payload: `FS_ERROR: payload too large (limit 10 MB)...`; pre-read: `FS_ERROR: file too large for proxy pre-read (limit 25 MB)...` | Lỗi fs khác (EACCES, EISDIR, EMFILE...) hoặc vượt payload limit | Chẩn đoán theo `resolvedPath` + err.message; payload → split/slice |

> **Phân biệt quan trọng** (trái với bug cũ): `FILE_NOT_FOUND` nghĩa là **path resolve đúng rồi, file chưa có** — đừng kết luận "file không tồn tại" vội khi gặp `PATH_*`: đó là **path của bạn bị từ chối/quy tắc**, không phải file missing.

### 7.2 Message templates — Format 1 / 2 / 3

**Format 1 — file không tồn tại (ENOENT) sau resolve đúng** (sinh tại tool layer):

```text
FILE_NOT_FOUND: File not found: <resolved_absolute_path>. Resolved against workspace root <workspace_root>. Gợi ý: dùng absolute path (nằm trong workspace root) hoặc kiểm tra lại đường dẫn tương đối tính từ workspace root.
```

Variant **không mở workspace** (resolve theo fallback):

```text
FILE_NOT_FOUND: File not found: <path>. Resolved against process.cwd() fallback = <cwd>. Gợi ý: mở workspace hoặc dùng absolute path trong workspace root.
```

**Format 2 — path bị chặn (containment fail):**

```text
PATH_REJECTED_OUTSIDE_WORKSPACE: Path rejected: <raw_path> resolves to <resolved_path> — outside workspace root <workspace_root>.
```

**Format 3 — không mở workspace + relative path (BR-06b):**

```text
PATH_NO_WORKSPACE: no workspace open — use an absolute path inside the intended folder or open a workspace. (got relative '<raw_path>', fallback root <cwd>)
```

### 7.3 Self-heal loop chuẩn cho agent (theo AC-2)

```text
1. Gọi tool với relative path.
2. Đọc error:
   - PATH_NO_WORKSPACE  → retry 1 lần bằng ABSOLUTE path (hoặc mở workspace).
   - PATH_REJECTED_*    → path của bạn nằm ngoài workspace → sửa path trong workspace root. Đừng thử biến thể escape khác.
   - FILE_NOT_FOUND     → resolve ĐÚNG rồi, file chưa có → retry 1 lần (absolute / tạo file nếu hợp lệ) → vẫn fail thì dừng + báo user.
   - FS_ERROR           → đọc err.message + resolvedPath → sửa nguyên nhân (permission, size...).
3. TỐI ĐA 1 lượt retry cho mỗi file operation — không có lượt gọi thứ 3 (N-6).
```

> **Lưu ý đường chat (`mem_ingest_file` qua ToolProxy):** failure được đánh dấu bằng prefix `Wrapper Error:` (vd `Wrapper Error: PATH_NO_WORKSPACE: ...`) — code `CODE:` vẫn giữ nguyên bên trong.

---

## 8. Troubleshooting

### 8.1 Common Issues

| # | Symptom | Cause | Solution |
|---|---------|-------|----------|
| 1 | `ENOENT: no such file or directory, open 'C:\Users\...\Programs\Kiro\documents\...'` | **Bug cũ (trước fix)** — relative path resolve theo thư mục cài Kiro | **ĐÃ FIX.** Nếu còn gặp: extension chưa nạp version chứa SA4E-356 → reload/restart Kiro. Tạm thời: dùng absolute path |
| 2 | `Path rejected: outside workspace` với absolute path `C:\projects\...` **hợp lệ** (drive letter hoa) | **Bug cũ R-1** — containment check phân biệt hoa/thường (`c:\` fsPath vs `C:\` caller) | **ĐÃ FIX** (case-insensitive trên Windows). Nếu vẫn gặp: kiểm tra path có **thật sự** nằm trong workspace root không (đừng nhầm với case #3) |
| 3 | `PATH_REJECTED_OUTSIDE_WORKSPACE` với absolute path | Path thực sự nằm ngoài workspace root (containment áp cho cả absolute khi có workspace) | Dùng path trong workspace root. Cần thao tác file ngoài workspace → không được hỗ trợ khi đang mở workspace (thiết kế bảo mật); file ở đó không phải là use case được hỗ trợ trong ticket này |
| 4 | `PATH_NO_WORKSPACE` khi gọi relative path | Đang **không mở workspace** nào trong Kiro (hoặc workspace là virtual/untitled khiến `fsPath` đọc không được) | Mở workspace folder, hoặc retry bằng **absolute path** (khuyến nghị cho agent chạy headless/không workspace) |
| 5 | `FILE_NOT_FOUND` dù file "có mà" | File nằm ở **folder thứ 2+** của multi-root workspace (relative luôn resolve theo folder đầu tiên), hoặc file thật sự chưa được tạo | Dùng absolute path trỏ đúng folder; hoặc tạo file trước bằng `stream_write_file` |
| 6 | `FS_ERROR: payload too large (limit 10 MB)` | `content` của `stream_write_file` > 10 MB | Chia nhỏ: nhiều lượt `mode="append"` |
| 7 | `FS_ERROR: file too large for proxy pre-read (limit 25 MB)` | File input của `drawio_export_png` / `mem_ingest_file` (wrapper) > 25 MB | Attach file nhỏ hơn, hoặc đọc/ghi theo slice — không có đường silent-fail |
| 8 | `...via symlink/junction.` trong PATH_REJECTED | Symlink/junction/subst **trong** workspace trỏ ra ngoài root — bị chặn bởi parent-dir realpath guard (I-7, SEC-03) | Dùng path thật (không qua symlink out-of-root). Symlink/link **nội bộ** workspace (vd `node_modules/.bin`) vẫn hoạt động bình thường |
| 9 | `Wrapper Error: ...` trong chat | Chat ToolResult không có field `isError` — đây là **marker failure** | Coi mọi text bắt đầu bằng `Wrapper Error:` là lỗi; đọc code `CODE:` bên trong và self-heal như §7.3 |
| 10 | `drawio_auto_layout` báo "outside backend workspace" | Tool này resolve phía **backend** theo `config.workspace` riêng (audit gap BR-12 — chưa fix resolve trong ticket này) | Ưu tiên `drawio_export_png` (đi proxy); hoặc align `config.workspace` của backend; hoặc chờ follow-up ticket OI-1 |

### 8.2 Khi nào nên dùng absolute path

- Agent chạy khi **không có workspace** mở (nhánh `cwd_fallback`) — relative bị từ chối, absolute là lối thoát có chủ đích.
- File nằm ở **folder thứ 2+** trong multi-root workspace.
- File nằm ngoài folder chính nhưng **trong workspace root** (absolute vẫn pass containment).
- Sau khi gặp `FILE_NOT_FOUND`/`PATH_*` — error message đã in resolved path, dùng ngay nó cho retry.

> **Chú ý:** khi ĐANG mở workspace, absolute path **ngoài** workspace root vẫn bị chặn (§3.1 row 4) — khác với nhánh không-workspace (row 7, không containment). Đây là khác biệt có chủ đích giữa 2 nhánh.

### 8.3 Logs

| Log Location | Content | Useful For |
|-------------|---------|------------|
| Extension host console (Kiro Developer Tools / Output) | `console.warn` từ các module: `[backend-local-tools] <tool> resolve failed: ...`, `[jira-attachment-tools] ...`, `[confluence-content-tools] ...`, `[ToolProxy] ...`, `[Base64ProxyService] proxyOutput failed ...` | Truy vết path bị reject, fallback cwd, fs error — message log khớp error agent nhận được |
| Error message trả về agent | Luôn chứa: `CODE:` prefix + resolved absolute path + rootPhrase (gốc resolve — vd `workspace root <path>` hoặc `process.cwd() fallback = <path>`) + gợi ý | Chẩn đoán trực tiếp không cần log — thiết kế self-correcting (AC-2) |

### 8.4 Symlink / junction edge case (accepted limitation, có guard)

- **Containment check trong helper là string-compare** (lexical, không I/O) — symlink trỏ ra ngoài root **lọt qua** check lexical.
- **Lớp bảo vệ thứ 2 ở handler layer (I-7):** trước khi chạm `fs.*`, tool realpath **thư mục cha** (`path.dirname(resolvedPath)`) rồi re-check containment — symlink/junction/subst trỏ ra ngoài sẽ bị chặn với error `PATH_REJECTED_OUTSIDE_WORKSPACE ... via symlink/junction.`
- **Realpath PARENT (không realpath file)** → ghi file MỚI (`stream_write_file`) vẫn hoạt động vì parent được `ensureDir` trước.
- Symlink/link nội bộ workspace (trỏ vào trong root) → không bị chặn.
- Hạn chế còn lại: hardlink hoặc cấu hình exoticher — chấp nhận rủi ro có điều kiện (AD-17), hardening full-realpath là follow-up (OI-2).

---

## 9. FAQ

**Q1: Tại sao relative path bị từ chối (`PATH_NO_WORKSPACE`) khi tôi không mở workspace? Trước đây nó vẫn "chạy"?**
A: Trước đây relative path âm thầm resolve vào `process.cwd()` của extension host — tức **thư mục cài Kiro** — vô nghĩa (file không bao giờ ở đó → ENOENT) và nguy hiểm (ghi file có thể pollute install dir / EACCES khó hiểu). Giờ hệ thống **fail-loud** để agent dùng absolute path có chủ đích hoặc mở workspace (BR-06b / SEC-02). Đây là behavior change được approve trong scope ticket.

**Q2: Sao content 10 MB của tôi bị từ chối? Trước đây ghi được.**
A: Giới hạn 10 MB (content) / 25 MB (pre-read) là policy bảo mật mới (N-9/SEC-07): chống self-DoS cục bộ — disk-fill, block event-loop, OOM khi base64 (+33% size). Fix: chia nhỏ writes (`append`) hoặc đọc theo slice. Không có đường silent-fail.

**Q3: Legacy absolute path của tôi còn hoạt động không?**
A: **Có** — absolute path passthrough, vị trí không đổi (backward compatible; repro SA4E-355 với absolute 18/18 không bị break). Khác biệt duy nhất: khi ĐANG mở workspace, absolute path phải nằm **trong** workspace root (containment); và drive letter hoa/thường không còn bị reject oan (fix R-1).

**Q4: `file_path` của tôi là absolute mà sao vẫn bị chặn?**
A: Containment áp cho **mọi** resolved path khi có workspace root — kể cả absolute passthrough. Path của bạn đang trỏ ra ngoài workspace root. Dùng path trong workspace; nếu cần file ngoài workspace, hiện không được hỗ trợ khi có workspace mở (thiết kế bảo mật chống arbitrary read/write).

**Q5: Relative path trong multi-root workspace resolve theo folder nào?**
A: Luôn theo **folder đầu tiên** (primary workspace folder) — deterministic, không config. File ở folder khác → dùng absolute path. Rule này cũng nằm trong `inputSchema description` của mọi tool (AC-4) để agent đọc trước khi gọi.

**Q6: `Wrapper Error:` là gì? Tôi có cần parse nó không?**
A: Đó là marker failure của đường chat (`mem_ingest_file` qua ToolProxy) — chat ToolResult không có field `isError` nên consumer phân biệt failure bằng prefix này. Code lỗi thật (`PATH_NO_WORKSPACE`, `FS_ERROR`...) nằm ngay sau marker — giữ nguyên để parse như §7.

**Q7: Sao `output_path` default của `embed_image` và `drawio_export_png` khác nhau?**
A: Theo hành vi nghiệp vụ của từng tool: `embed_image` chèn `-embedded` trước extension (`BRD.md` → `BRD-embedded.md`); `drawio_export_png` hoán đổi `.drawio` → `.png`, còn input không phải `.drawio` thì nối `.out`. Cả hai đều derived từ **resolved** input path nên luôn nằm trong workspace.

**Q8: Alias `path` (thay vì `file_path`) còn dùng được không?**
A: Vẫn được chấp nhận ở `stream_write_file`, `embed_image` và `mem_ingest_file` (chat) cho caller cũ — và đi qua cùng helper nên không bypass. Tuy nhiên nó **không nằm trong inputSchema**: hãy dùng `file_path` trong code mới.

**Q9: `drawio_auto_layout` vẫn lỗi path?**
A: Resolve behavior của tool này nằm ở **backend child server** (ngoài extension host) — chưa fix trong SA4E-356 (audit gap BR-12, follow-up ticket OI-1). Đã fix trong scope này: error message đúng ngữ nghĩa (phân biệt thiếu param với path bị reject). Workaround: dùng `drawio_export_png` (đi qua proxy) hoặc align `config.workspace` backend.

**Q10: Làm sao biết extension của tôi đã chứa fix?**
A: Test nhanh §2.1: `stream_write_file` với relative path thành công ngay lần đầu và success message in absolute path **dưới workspace root** (không phải dưới thư mục cài Kiro). Thêm nữa: error messages có prefix `PATH_*:` / `FILE_NOT_FOUND:` / `FS_ERROR:` — format mới chỉ có sau fix.

---

## 10. Behavior Changes (cho user cũ — đọc kỹ trước khi nâng cấp)

Bốn behavior change chính, tất cả được approve trong scope ticket (BRD §1.5 — BA ack v1.0.1/v1.0.2):

| # | Hành vi | Trước fix | Sau fix | Ảnh hưởng đến bạn |
|---|---------|-----------|---------|-------------------|
| 1 | **Relative path** | Resolve theo `process.cwd()` của extension host = **thư mục cài Kiro** → `ENOENT`, phải retry absolute | Resolve theo **primary workspace folder** → thành công ngay lần đầu | Gọi relative path bình thường; bỏ work-around absolute path (BO-1, AC-5) |
| 2 | **Absolute path `C:\...` (drive hoa) khi fsPath là `c:\`** | Bị **reject oan** bởi containment case-sensitive của `stream_write_file` (`"Path rejected: outside workspace"`) | **PASS** — containment so sánh case-insensitive trên Windows (fix R-1) | Không còn false-reject; escape strictness không đổi |
| 3 | **Relative path khi KHÔNG mở workspace** | Âm thầm resolve vào thư mục cài Kiro (vô nghĩa — ENOENT hoặc ghi nhầm chỗ). Lưu ý: `stream_write_file` cũ còn containment theo `process.cwd()` → absolute ngoài install dir cũng bị chặn oan | **FAIL LOUD** `PATH_NO_WORKSPACE` (Format 3) cho relative; absolute passthrough **không containment** (DISC-1) | Agent phải dùng absolute path hoặc mở workspace; đừng kỳ vọng relative "tự chạy" |
| 4 | **Image refs ngoài workspace trong markdown (`embed_image`)** | Ref được resolve theo baseDir relative (cũng broken) và KHÔNG có containment — markdown độc hại có thể kéo file ngoài workspace vào output | Mỗi ref được containment-check riêng; ref ngoài root → **skip fail-closed** (giữ nguyên ref, `skipped++`), không throw (SEC-01) | Output giữ nguyên các ref ngoài workspace; kiểm tra `skipped` nếu thiếu ảnh trong kết quả |

**Thay đổi bổ sung đáng chú ý (cùng release):**

- **Containment mở rộng:** trước chỉ `stream_write_file` chặn escape; giờ **100% file tools** chặn (`embed_image`, `jira_attach_file`, `confluence_add_attachment`, `mem_ingest_file`, `drawio_export_png`) — không tool nào còn đọc/ghi được file ngoài workspace.
- **Error format chuẩn hóa:** mọi path/fs error có prefix `PATH_EMPTY:` / `PATH_INVALID:` / `PATH_NO_WORKSPACE:` / `PATH_REJECTED_OUTSIDE_WORKSPACE:` / `FILE_NOT_FOUND:` / `FS_ERROR:` + resolved path + gốc resolve + gợi ý (trước: fs error thô, sai ngữ nghĩa — vd `drawio_auto_layout` báo "file_path is required" cho path bị escape).
- **Payload limits mới:** 10 MB content / 25 MB pre-read (§3.2) — trước không giới hạn.
- **Symlink guard:** path qua symlink/junction trỏ ra ngoài workspace bị chặn ở handler layer (I-7).
- **InputSchema descriptions:** mọi tool nêu rõ rule resolution (từ khóa "workspace") — agent đọc schema là biết hành vi (AC-4).
- **Không đổi:** tool signature (tên tool, tham số, required, type), MCP protocol, absolute-path passthrough vị trí.

---

## 11. Appendix

### 11.1 Glossary

| Term | Definition |
|------|------------|
| MCP Tool | Hàm nghiệp vụ extension expose cho AI agent qua Model Context Protocol (vd `jira_attach_file`, `embed_image`) |
| Workspace Root | Thư mục gốc project đang mở trong Kiro (`vscode.workspace.workspaceFolders`) — gốc resolve chuẩn cho relative path |
| Primary Workspace Folder | Folder **đầu tiên** trong `workspaceFolders` — được chọn deterministic làm gốc resolve trong multi-root workspace |
| PathResolver | Shared helper `extension/src/services/PathResolver.ts` — single source of truth cho path resolution sau fix (validate → root per-call → resolve → containment → result) |
| Path Escape | Relative path dùng `../` (hoặc absolute/symlink) trỏ ra ngoài Workspace Root — bị chặn |
| Process CWD | Working directory của extension host process = thư mục cài Kiro — gốc resolve SAI gây bug SA4E-356; giờ chỉ còn là fallback root ở nhánh không-workspace (và relative bị từ chối ở nhánh đó) |
| rootSource | `workspace` (có workspace thật) hoặc `cwd_fallback` (không có) — luôn xuất hiện trong error message khi fail để agent biết gốc resolve đã dùng |
| Format 1 / 2 / 3 | Ba template error message chuẩn: file-not-found / path-rejected / no-workspace (§7.2) |
| Self-correcting error | Error chứa resolved path + gốc + gợi ý, cho phép agent tự sửa trong ≤ 1 lượt retry (AC-2, N-6) |

### 11.2 Related Documents

| Document | Location |
|----------|----------|
| BRD SA4E-356 (v1.0.2) | documents/SA4E-356/BRD.md |
| FSD SA4E-356 (v1.3) | documents/SA4E-356/FSD.md |
| TDD SA4E-356 (v1.2) | documents/SA4E-356/TDD.md |
| STC SA4E-356 (v1.1 — error behaviors đã verify bằng tests) | documents/SA4E-356/STC.md |
| STP SA4E-356 | documents/SA4E-356/STP.md |
| Security Review (PASS WITH FIXES — SEC-01..08) | documents/SA4E-356/SECURITY-REVIEW.md |
| PathResolver source (single source of truth) | extension/src/services/PathResolver.ts |

### 11.3 Version Compatibility

| System Version | Config Version | Breaking Changes |
|---------------|---------------|-----------------|
| Extension chứa fix SA4E-356 (commit `bb17b39`) | Không có config version (không đổi config) | Xem §10 — 4 behavior changes chính (đều là mục đích của fix; absolute passthrough + tool signature giữ nguyên backward compatible) |
| Extension trước fix | — | Không đọc guide này được khuyến nghị gọi relative path — dùng absolute work-around theo KB lesson-learned #501 |

### 11.4 Quick Reference — Tool × Path Rule

| Tool | Relative (có workspace) | Absolute (có workspace) | Relative (không workspace) | Limit |
|------|------------------------|------------------------|---------------------------|-------|
| `stream_write_file` | ✅ workspace root | ✅ nếu trong root | ❌ `PATH_NO_WORKSPACE` | content ≤ 10 MB |
| `embed_image` | ✅ | ✅ nếu trong root | ❌ `PATH_NO_WORKSPACE` | refs ngoài root → skip |
| `jira_attach_file` | ✅ | ✅ nếu trong root | ❌ `PATH_NO_WORKSPACE` | — |
| `confluence_add_attachment` | ✅ | ✅ nếu trong root | ❌ `PATH_NO_WORKSPACE` | — |
| `mem_ingest_file` (wrapper + chat) | ✅ | ✅ nếu trong root | ❌ `PATH_NO_WORKSPACE` | pre-read ≤ 25 MB |
| `drawio_export_png` (+ nested dynamic) | ✅ | ✅ nếu trong root | ❌ `PATH_NO_WORKSPACE` | pre-read ≤ 25 MB |
| `drawio_auto_layout` | ⚠️ resolve phía **backend** (`config.workspace`) — error đã đúng ngữ nghĩa | ⚠️ | ⚠️ | — (follow-up OI-1) |
| `sandbox_run` | N/A — path sandbox-internal | N/A | N/A | — |
