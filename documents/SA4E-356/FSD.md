# Functional Specification Document (FSD)

## SA4E — SA4E-356: [Bug] MCP tools: relative file_path resolves against process CWD (Kiro install dir) instead of workspace root

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-356 |
| Title | [Bug] MCP tools: relative file_path resolves against process CWD (Kiro install dir) instead of workspace root |
| Author | BA Agent |
| Version | 1.0 (Draft — business sections; chờ TA enrich technical depth) |
| Date | 2026-10-12 |
| Status | Draft |
| Priority | High |
| Labels | bug, extension, mcp, path-resolution |
| Related BRD | documents/SA4E-356/BRD.md |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-10-12 | BA Agent | Initiate draft — business sections: Functional Requirements (FR-01..FR-11), Use Cases (UC-01..UC-05), Business Rules (BR-01..BR-12), bảng audit 8 tools (data specs), error handling theo AC-2, traceability matrix AC ↔ FR ↔ UC, 3 diagram (system-context, sequence, state). Kết quả audit code mở rộng từ BRD scope table. Chờ TA enrich API contracts + technical depth (xem §11.3). |

---

## 1. Introduction

### 1.1 Purpose

FSD này đặc tả hành vi chức năng của việc sửa bug SA4E-356: chuẩn hóa **Path Resolution** cho toàn bộ MCP Tool nhận tham số đường dẫn trong SA4E extension, thông qua một **shared helper duy nhất** (Path Resolver) thay cho 4 điểm resolve rải rác hiện nay. Tài liệu dịch BRD v1 (AC-1..AC-5) thành các yêu cầu chức năng chi tiết (FR), use case với luồng chính/biện thể/ngoại lệ (UC), business rules (BR), bảng audit hiện trạng từng tool, và format error message tự-sửa theo AC-2.

**Vấn đề nghiệp vụ being solved:** AI agent (MCP client) gọi extension MCP Tool với đường dẫn tương đối (relative) → tool resolve theo Process CWD (thư mục cài Kiro) thay vì Workspace Root → lỗi ENOENT, buộc retry bằng absolute path cho MỌI file operation — phá vỡ contract tool-agent và làm gián đoạn pipeline SDLC ở mức autonomy L3.

### 1.2 Scope

**In scope** (theo BRD §1.4, đã audit code chi tiết — xem bảng audit §3.1.4):

1. Xây dựng shared path-resolution helper (Path Resolver) — hợp nhất logic resolve từ 3 điểm hiện có trong Extension Host (`handleStreamWriteFile`, `ToolProxy.resolveWorkspacePath`, `Base64ProxyService.resolvePath`) + sửa containment check case-insensitive (R-1).
2. Áp dụng helper cho 6 tool chạy trong Extension Host: `stream_write_file` (refactor, hành vi tổng thể không đổi), `embed_image`, `jira_attach_file`, `confluence_add_attachment`, `mem_ingest_file` (2 đường gọi), `drawio_export_png` (qua Base64ProxyService).
3. Chuẩn hóa error message tự-sửa theo AC-2 (Format 1 / Format 2 — xem §9).
4. Enrich inputSchema description cho 100% tool trong audit list (AC-4).
5. Unit tests T1–T6 + integration test mỗi tool + regression replay repro SA4E-355 (AC-3, AC-5).

**Out of scope** (theo BRD §1.5):

- `drawio_auto_layout`: tool resolve phía backend child server (ngoài Extension Host) — kết quả audit ghi nhận tại §3.1.4; việc fix tách ticket riêng theo BRD R-2 (trừ yêu cầu tối thiểu: error message phải fail-loud và đúng ngữ nghĩa).
- `sandbox_run`: kết luận audit — path là sandbox-internal, không bị ảnh hưởng (§3.1.4).
- Không thay đổi MCP tool signature / protocol; không sửa tool không nhận `file_path`; không xây UI mới.

### 1.3 Definitions & Acronyms

| Term | Definition |
|------|------------|
| MCP Tool | Hàm nghiệp vụ do extension MCP server expose cho AI agent gọi qua Model Context Protocol (ví dụ: `jira_attach_file`, `embed_image`, `mem_ingest_file`). Tool có inputSchema (JSON) và trả về text/result. |
| Workspace Root | Thư mục gốc của project đang mở trong Kiro / VS Code (`vscode.workspace.workspaceFolders`) — gốc chuẩn để resolve relative `file_path` trong SA4E extension. |
| Primary Workspace Folder | Folder đầu tiên trong `vscode.workspace.workspaceFolders` — được chọn deterministic làm gốc resolve trong multi-root workspace (pattern `handleStreamWriteFile`). |
| Extension Host | Process riêng của Kiro / VS Code chạy extension code, nơi MCP server wrapper chạy; `process.cwd()` của nó trỏ vào thư mục cài Kiro — nguồn gốc của bug SA4E-356. |
| Path Resolution | Quy trình chuẩn hóa `file_path` do agent truyền (relative / absolute) thành absolute path cuối cùng trước khi gọi `fs.*`: absolute passthrough, relative resolve theo Primary Workspace Folder, escape bị chặn. |
| Path Escape | Relative path dùng `../` (hoặc absolute path) trỏ ra ngoài Workspace Root — bị chặn để chống arbitrary file read/write qua MCP tool. |
| Process CWD | Working directory của process MCP server (Extension Host) — hiện là thư mục cài Kiro, KHÔNG phải Workspace Root; là gốc resolve sai gây ENOENT trong bug SA4E-356. |
| ENOENT | Mã lỗi Node.js fs ("no such file or directory") — triệu chứng khi tool resolve path sai gốc (Process CWD thay vì Workspace Root). |

### 1.4 References

| Document | Location |
|----------|----------|
| BRD SA4E-356 (v1.0) | documents/SA4E-356/BRD.md (KB entry #510) |
| Jira ticket | SA4E-356 (Bug, Priority High) — epic SA4E-355 |
| KB lesson-learned | KB entry #501 (SA4E-355) — same bug + workaround absolute path |
| Pattern tham chiếu (resolve đúng) | extension/src/backend-local-tools.ts — `handleStreamWriteFile` (dòng 113–149) |
| Tool bị lỗi confirmed | extension/src/mcp/atlassian/jira-attachment-tools.ts — `jira_attach_file` (dòng 21) |
| Audit code chi tiết | Xem §3.1.4 — bảng audit 8 tools với vị trí code đã verify 2026-10-12 |
| Môi trường regression | documents/SA4E-355/ (BRD.md, FSD.md, TDD.md) |

---

## 2. System Overview

### 2.1 System Context Diagram

![System Context](diagrams/system-context.png)

*[Edit in draw.io](diagrams/system-context.drawio)*

AI Agent (MCP client) gọi extension MCP Tool với tham số `file_path` (relative hoặc absolute) qua MCP protocol. Tool chạy trong **Extension Host** (MCP server wrapper) hoặc được forward xuống **Backend Child Server**. Sau fix, mọi tool trong Extension Host phải đưa raw path qua **Path Resolver** (shared helper mới) trước khi chạm File System. Path Resolver lấy Primary Workspace Folder từ **VS Code Workspace API** (`vscode.workspace.workspaceFolders[0].uri.fsPath`), thực hiện containment check case-insensitive, và chỉ trả về resolved absolute path nằm trong Workspace Root. Tool ngoài Extension Host (`drawio_auto_layout`, `sandbox_run`) được đánh dấu là audit gap — xử lý theo BR-12.

### 2.2 System Architecture (hiện trạng — 4 điểm resolve rải rác)

Kiến trúc hiện tại: **LLM → Extension (MCP wrapper, port 9181) → Backend (child server, port 48721)**. Path resolution đang bị phân mảnh tại 4 điểm, không điểm nào đầy đủ:

| # | Điểm resolve | Vị trí code (verified 2026-10-12) | Hành vi | Thiếu sót |
|---|--------------|-----------------------------------|---------|-----------|
| 1 | `handleStreamWriteFile` | extension/src/backend-local-tools.ts:113–149 | Workspace Root → fallback Process CWD; absolute passthrough; containment check | Containment dùng `startsWith` **phân biệt hoa/thường** (R-1: từ chối `C:\` khi fsPath là `c:\`); logic gắn cứng trong tool, không tái sử dụng |
| 2 | `ToolProxy.resolveWorkspacePath` | extension/src/proxy/ToolProxy.ts:62–66 | Absolute passthrough; relative → Primary Workspace Folder; không mở workspace → trả raw path | Chỉ áp cho `mem_ingest_file` (đường chat); KHÔNG có containment check |
| 3 | `Base64ProxyService.resolvePath` | extension/src/services/Base64ProxyService.ts:135–138 | Absolute passthrough; relative → `workspaceRoot ?? process.cwd()` | KHÔNG có containment check; phụ thuộc constructor nhận workspaceRoot (được truyền tại remote-backend-client.ts:62) |
| 4 | `resolveFilePath` (backend) | backend/src/engine/tools/drawio-tool.ts:59–71 | Relative theo `config.workspace` của backend; containment case-sensitive → trả `null` | Chạy NGOÀI Extension Host; error "file_path is required" sai ngữ nghĩa (không phân biệt path escape với missing param) |

Ngoài ra 3 tool **không resolve gì** và truyền raw path thẳng vào `fs.*` (resolve ngầm theo Process CWD): `embed_image`, `jira_attach_file`, `confluence_add_attachment`.

**Hướng fix theo FSD:** hợp nhất điểm 1 + 2 + 3 thành **một shared helper** (Path Resolver —FR-01) với containment check case-insensitive (FR-04); áp cho 6 tool Extension Host; điểm 4 xử lý theo BR-12 (audit record + follow-up ticket).

---

## 3. Functional Requirements

### 3.1 Feature: Shared Path-Resolution Helper (Path Resolver)

**Source:** BRD Story 1, 3 — AC-1, AC-3

#### 3.1.1 Description

Xây dựng một shared helper duy nhất — `resolveWorkspacePath(rawPath)` — tách từ pattern của `handleStreamWriteFile` (backend-local-tools.ts:113–149), với pipeline: (1) nhận raw path từ tool call; (2) kiểm tra absolute → passthrough, relative → resolve theo Primary Workspace Folder (fallback Process CWD khi không mở workspace); (3) containment check case-insensitive trên Windows — chặn Path Escape; (4) trả resolved absolute path HOẶC error có cấu trúc theo AC-2. Mọi MCP Tool nhận `file_path` trong Extension Host PHẢI gọi helper này trước mọi thao tác `fs.*`; không tool nào được tự resolve raw path.

#### 3.1.2 Use Cases

---

**Use Case ID:** UC-01
**Tên:** Tool nhận relative path — resolve theo Workspace Root
**Actor:** SDLC AI Agent (MCP client)
**Preconditions:** Workspace đang mở trong Kiro (có `workspaceFolders`); agent gọi một MCP Tool nhận `file_path` với đường dẫn tương đối (ví dụ `documents/SA4E-355/FSD.md`).
**Postconditions:** Tool thao tác file tại absolute path nằm trong Workspace Root; agent nhận kết quả ngay lần gọi đầu — KHÔNG cần retry bằng absolute path.

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | AI Agent | | Gọi tool với `file_path` relative (ví dụ `jira_attach_file(issue_key="SA4E-355", file_path="documents/SA4E-355/FSD.md")`) |
| 2 | | Tool Handler | Nhận raw `file_path`, truyền qua shared helper `resolveWorkspacePath(rawPath)` |
| 3 | | Path Resolver | Lấy Primary Workspace Folder từ VS Code Workspace API (`workspaceFolders[0].uri.fsPath`) |
| 4 | | Path Resolver | Resolve: `path.resolve(workspaceRoot, rawPath)` → absolute path |
| 5 | | Path Resolver | Containment check case-insensitive (xem UC-03) → PASS |
| 6 | | Tool Handler | Thực hiện thao tác file (`readFile` / `writeFile` / attach) với resolved path |
| 7 | | Tool Handler | Trả kết quả thành công cho agent (isError: false) |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-1 | Không mở workspace (`workspaceFolders` rỗng/undefined) | Helper fallback gốc resolve theo Process CWD (`process.cwd()`). Khi thao tác file thất bại, error PHẢI ghi rõ "Resolved against process.cwd() fallback = [path]" để agent chẩn đoán chính xác gốc resolve (FR-06). |
| AF-2 | Workspace thay đổi giữa phiên (đổi folder / multi-root reorder) | Helper đọc Primary Workspace Folder **mỗi lần gọi** (không cache stale) — resolved path luôn theo workspace hiện tại. |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-1 | File không tồn tại tại resolved path (ENOENT) | Tool trả error theo Format 1 (UC-04) — chứa resolved absolute path + gốc resolve + gợi ý. Agent tự sửa trong đúng 1 lượt retry. |
| EF-2 | Helper từ chối path (containment fail) | Tool forward nguyên vẹn error Format 2 (UC-03) — không nuốt lỗi, không thử resolve khác. |

---

**Use Case ID:** UC-02
**Tên:** Tool nhận absolute path — passthrough (backward compatibility)
**Actor:** SDLC AI Agent (MCP client)
**Preconditions:** Agent gọi tool với `file_path` absolute (ví dụ `C:\projects\kiro\SDLC-Agents-4-Enterprise\documents\SA4E-355\FSD.md`).
**Postconditions:** Tool thao tác file tại đúng absolute path caller truyền — hành vi giống hệt trước fix (repro SA4E-355 từng thành công 18/18 với absolute path).

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | AI Agent | | Gọi tool với `file_path` absolute |
| 2 | | Path Resolver | `path.isAbsolute(rawPath)` → true → passthrough: `path.resolve(rawPath)` (chuẩn hóa, không đổi vị trí) |
| 3 | | Path Resolver | Containment check case-insensitive → absolute path nằm trong Workspace Root → PASS |
| 4 | | Tool Handler | Thao tác file tại resolved path → trả kết quả |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-1 | Drive letter viết thường (`c:\projects\...`) hoặc viết hoa (`C:\projects\...`) khác với casing của Workspace Root fsPath | Containment check so sánh **case-insensitive trên Windows** → path hợp lệ KHÔNG bị reject oan (FR-04, R-1, T6). Đây là bug đã quan sát thực tế 2026-10-12: `stream_write_file` từ chối `C:\projects\...` vì fsPath là `c:\projects\...`. |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-1 | Absolute path trỏ ra ngoài Workspace Root | Bị chặn — error Format 2 (UC-03). Backward compat: hành vi này đã tồn tại ở `stream_write_file` từ trước (BRD R-4, R-5); use case hợp lệ ngoài workspace (temp dir) nếu cần → ticket riêng kèm security review. |

---

**Use Case ID:** UC-03
**Tên:** Path Escape bị chặn (containment check)
**Actor:** SDLC AI Agent (MCP client) — bao gồm cả kịch bản lỗi dụng (prompt-injected agent)
**Preconditions:** Agent gọi tool với path chứa `../` vượt ra ngoài Workspace Root, hoặc absolute path ngoài Workspace Root.
**Postconditions:** Tool KHÔNG chạm file ngoài Workspace Root; agent nhận error fail-loud có cấu trúc; không có partial write/read.

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | AI Agent | | Gọi tool với `file_path` chứa escape (ví dụ `../../../Windows/System32/config`) |
| 2 | | Path Resolver | Normalize + resolve → absolute path vượt ra ngoài Workspace Root |
| 3 | | Path Resolver | Containment check case-insensitive → FAIL |
| 4 | | Path Resolver | Trả error **Format 2**: `Path rejected: [raw_path] resolves to [resolved_path] — outside workspace root [workspace_root].` |
| 5 | | Tool Handler | Forward error nguyên vẹn (isError: true) — KHÔNG fallback, KHÔNG nuốt lỗi |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-1 | Absolute path ngoài Workspace Root (không qua `../`) | Cùng bị chặn như Main Flow — containment áp cho MỌI resolved path, kể cả absolute passthrough (FR-05). |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-1 | So sánh path trên Windows với casing khác nhau (drive hoa/thường, tên folder hoa/thường) | So sánh case-insensitive trên Windows — tránh reject oan path hợp lệ (đây chính là R-1; NGƯỢC lại không được mở lỏng để cho path escape thật sự vượt qua). |

---

**Use Case ID:** UC-04
**Tên:** File không tồn tại — error message tự-sửa (self-correcting)
**Actor:** SDLC AI Agent (MCP client)
**Preconditions:** Tool được gọi với path resolve THÀNH CÔNG theo UC-01/UC-02 nhưng file thực sự chưa tồn tại (ví dụ artifact chưa được tạo).
**Postconditions:** Agent biết chính xác absolute path đã resolve + gốc resolve; tự sửa trong đúng 1 lượt retry hoặc dừng có căn cứ.

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | AI Agent | | Gọi tool với relative path — file chưa tồn tại |
| 2 | | Path Resolver | Resolve thành công theo UC-01 → resolved absolute path trong Workspace Root |
| 3 | | Tool Handler | `fs` thao tác → ENOENT |
| 4 | | Tool Handler | Trả error **Format 1** (isError: true): `File not found: [resolved_absolute_path]. Resolved against [workspace_root]. Gợi ý: dùng absolute path (nằm trong workspace root) hoặc kiểm tra lại đường dẫn tương đối tính từ workspace root.` |
| 5 | AI Agent | | Đọc error → biết path resolve ĐÚNG gốc rồi, file thật sự chưa có → retry đúng 1 lần với absolute path (hoặc tạo file nếu nghiệp vụ cho phép) |
| 6 | | Tool Handler | Lần retry thành công → trả kết quả |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-1 | Sau 1 lượt retry file vẫn không tồn tại | Agent dừng và báo cho user — KHÔNG retry vô hạn. Error đã đủ thông tin để kết luận "file chưa được tạo" (không còn nhầm lẫn "path resolve sai gốc" như trước fix). |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-1 | Lỗi fs khác (EACCES, EISDIR, EMFILE...) | Tool forward error gốc kèm resolved absolute path: `Failed [operation] [resolved_absolute_path]: [err.message]` — vẫn in resolved path để agent chẩn đoán (tinh thần AC-2). |
| EF-2 | Không mở workspace + thao tác fail (AF-1 của UC-01) | Error ghi rõ gốc fallback: `... Resolved against process.cwd() fallback = [path]. Gợi ý: mở workspace hoặc dùng absolute path trong workspace root.` |

**So sánh trước / sau fix (trùng repro SA4E-355):**

| | Trước fix | Sau fix |
|--|-----------|---------|
| Resolve gốc | Process CWD (`C:\Users\ASUS\AppData\Local\Programs\Kiro`) — sai | Workspace Root (`c:\projects\kiro\SDLC-Agents-4-Enterprise`) — đúng |
| Error message | `ENOENT: no such file or directory, open 'C:\Users\...\Kiro\documents\SA4E-355\FSD.md'` — absolute path sai gốc, KHÔNG gợi ý → agent tưởng file không tồn tại / đoán mò | `File not found: c:\projects\...\documents\SA4E-355\FSD.md. Resolved against workspace root c:\projects\.... Gợi ý: dùng absolute path...` — resolved path đúng gốc + gợi ý |
| Số lượt gọi | ≥ 2 (fail + retry absolute) | 1 (thành công ngay) hoặc 2 (ENOENT thật + 1 retry theo gợi ý) |

---

**Use Case ID:** UC-05
**Tên:** Multi-root workspace — Primary Workspace Folder deterministic
**Actor:** SDLC AI Agent (MCP client)
**Preconditions:** Kiro mở multi-root workspace với 2+ folders (ví dụ: folder 1 = `SDLC-Agents-4-Enterprise`, folder 2 = `another-project`).
**Postconditions:** Mọi relative path resolve deterministic theo folder đầu tiên (Primary Workspace Folder); rule được ghi rõ trong inputSchema description (AC-4) để agent biết trước hành vi.

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | AI Agent | | Đọc inputSchema description của tool — thấy rule "Relative paths resolve against the primary workspace folder" (FR-09) |
| 2 | AI Agent | | Gọi tool với relative path tính từ Primary Workspace Folder |
| 3 | | Path Resolver | `workspaceFolders[0].uri.fsPath` → resolve → containment → PASS |
| 4 | | Tool Handler | Thao tác file thành công tại folder đầu tiên |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-1 | File nằm ở folder thứ 2+ (agent tính path từ folder khác) | Resolve theo folder 1 → ENOENT → error Format 1 có resolved path + gợi ý → agent đổi sang absolute path trỏ đúng folder trong 1 lượt retry (FR-07, BR-07). |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-1 | Multi-root nhưng KHÔNG có folder nào mở được / list rỗng | Xử lý như UC-01 AF-1 (fallback Process CWD + error ghi rõ gốc). |

#### 3.1.3 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-01 | **Single source of truth:** shared helper `resolveWorkspacePath` là điểm Path Resolution duy nhất trong Extension Host. KHÔNG tool nào được tự gọi `resolve(file_path)` một đối số hoặc truyền raw path thẳng vào `fs.*`. | BRD Story 3 Validation |
| BR-02 | Relative path resolve theo **Primary Workspace Folder** (`vscode.workspace.workspaceFolders[0].uri.fsPath`). | BRD Story 1 Req 2 |
| BR-03 | Absolute path **passthrough nguyên vẹn**: `path.resolve(rawPath)` — không đổi vị trí; giữ backward compatibility (repro SA4E-355 absolute 18/18). | BRD Story 1 Req 5 |
| BR-04 | Containment check so sánh **case-insensitive trên Windows** — resolved path hợp lệ với drive letter hoa/thường khác casing của Workspace Root fsPath KHÔNG bị reject oan (bug R-1 đã quan sát thực tế 2026-10-12). | BRD Story 1 Req 6, Risk R-1, Test T6 |
| BR-05 | **Path Escape bị chặn**: resolved path phải nằm trong Workspace Root; escape (`../` ra ngoài hoặc absolute ngoài root) → error Format 2, fail-loud, không fallback. | BRD Story 1 Req 4, Test T3 |
| BR-06 | Không mở workspace → fallback **Process CWD** (`process.cwd()`); khi thao tác fail, error PHẢI ghi rõ "process.cwd() fallback = [path]". | BRD Story 1 Req 4, Test T5 |
| BR-07 | Multi-root workspace: **luôn dùng Primary Workspace Folder** (folder đầu tiên) — deterministic; rule ghi trong inputSchema description + error message khi fail. | BRD Story 1 Req 3, Risk R-3, Test T4 |
| BR-08 | Mọi error fail-loud (`isError: true`) PHẢI chứa: (a) absolute path ĐÃ resolve, (b) gốc resolve đã dùng (workspace root / process.cwd() fallback), (c) gợi ý action tiếp theo. Không nuốt lỗi âm thầm. | BRD Story 2 |
| BR-09 | Tool signature KHÔNG đổi (tên tool, tên tham số, required, type) — chỉ thay đổi resolution behavior nội bộ + description enrich. | BRD Out-of-scope |
| BR-10 | 100% tool trong audit list có `file_path.description` nêu rõ rule resolution (chuẩn hóa qua shared text, chứa từ khóa "workspace"). | BRD Story 4, AC-4 |
| BR-11 | Các tham số đường dẫn khác (`output_path` nếu có) áp **cùng rule resolution** với `file_path`. | BRD Story 4 Req 2 |
| BR-12 | Tool resolve ngoài Extension Host (`drawio_auto_layout` — backend child server; `sandbox_run` — sandbox-internal): kết quả audit ghi nhận trong FSD; việc fix tách ticket riêng; tối thiểu error message phải đúng ngữ nghĩa (không báo "file_path is required" cho path bị containment reject). | BRD Out-of-scope, Risk R-2 |

#### 3.1.4 Data Specifications

**Input Data của Path Resolver (helper):**

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| raw_path | string | Yes | Non-empty string; trim trước xử lý | Đường dẫn do agent truyền qua tool call (relative hoặc absolute). Ví dụ: `documents/SA4E-355/FSD.md` |
| workspace_root | string (computed) | No | Lấy từ `vscode.workspace.workspaceFolders[0].uri.fsPath` tại thời điểm gọi | Primary Workspace Folder — gốc resolve cho relative path |
| fallback_root | string (computed) | No | `process.cwd()` | Gốc fallback khi không mở workspace — PHẢI được ghi rõ trong error khi fail |

**Output Data của Path Resolver (helper):**

| Field | Type | Description |
|-------|------|-------------|
| resolved_path | string | Absolute path sau resolve — dùng cho MỌI `fs.*` call và error message (AC-2) |
| root_source | enum: `workspace` / `cwd_fallback` | Gốc resolve đã dùng — bắt buộc đưa vào error message khi fail |
| error | structured error (optional) | Format 1 (file not found / thao tác fail) hoặc Format 2 (path rejected) — xem §9 |

**Bảng audit đầy đủ — MCP tools nhận tham số đường dẫn** (mở rộng từ BRD §1.4 scope table; vị trí code đã verify trực tiếp 2026-10-12):

| # | Tool | Tham số nhận path | Điểm truy cập file system (verified) | Hành vi resolve hiện tại | Trạng thái | Hành động fix theo FSD |
|---|------|-------------------|--------------------------------------|---------------------------|-----------|--------------------------|
| 1 | `stream_write_file` | `file_path` (+ `content`, `mode`) | extension/src/backend-local-tools.ts:113–149 — `fs.writeFileSync`/`appendFileSync` trong Extension Host | Resolve ĐÚNG pattern: `workspaceFolders[0]` → fallback `process.cwd()`; absolute passthrough; containment check bằng `startsWith` | 🟡 Pattern tham chiếu — NHƯNG containment **phân biệt hoa/thường** (R-1): từ chối `C:\projects\...` khi fsPath là `c:\projects\...` | Refactor dùng shared helper; containment case-insensitive (FR-04); hành vi resolve tổng thể KHÔNG đổi (BRD out-of-scope) |
| 2 | `embed_image` | `file_path`, `output_path` | extension/src/backend-local-tools.ts:160–175 — `fs.readFileSync(filePath)` với **raw path** trong Extension Host | KHÔNG resolve — raw path truyền thẳng `fs.*` → fs hiểu theo Process CWD (Kiro install dir) | 🔴 Bug — relative path ENOENT | Áp shared helper cho cả `file_path` và `output_path` (BR-11) |
| 3 | `jira_attach_file` | `issue_key`, `file_path` | extension/src/mcp/atlassian/jira-attachment-tools.ts:21 — `readFile(resolve(file_path))` | `path.resolve(file_path)` **một đối số** → resolve theo Process CWD | 🔴 Bug CONFIRMED — repro SA4E-355: ENOENT `'C:\Users\ASUS\AppData\Local\Programs\Kiro\documents\SA4E-355\FSD.md'` | Áp shared helper; error Format 1 khi ENOENT |
| 4 | `confluence_add_attachment` | `page_id`, `file_path` | extension/src/mcp/atlassian/confluence-content-tools.ts:25 — `readFile(rs(file_path))` | `path.resolve(file_path)` một đối số → Process CWD (cùng pattern `jira_attach_file`) | 🔴 Bug (same-pattern, xác định qua audit code) | Áp shared helper; error Format 1 khi ENOENT |
| 5 | `mem_ingest_file` | `file_path` (+ `type`, `scope`) | **2 đường gọi:** (a) Chat: extension/src/proxy/ToolProxy.ts:42–50 — pre-read `fs.readFileSync` rồi gửi content + absolute path; (b) MCP wrapper: extension/src/services/Base64ProxyService.ts:64–77 — đọc file → `content_base64` (schema backend có `content_base64`: backend/src/modules/memory/tool-definitions.ts:9) | (a) `ToolProxy.resolveWorkspacePath` (ToolProxy.ts:62–66): absolute passthrough; relative → Primary Workspace Folder; không mở workspace → raw path. (b) `Base64ProxyService.resolvePath` (135–138): relative → `workspaceRoot ?? process.cwd()` | 🟡 Partial fix — resolve theo workspace root đã hoạt động (D2 regression test: extension/src/proxy/__tests__/tool-proxy.test.ts:76) nhưng KHÔNG có containment check; 2 đường trùng logic | Thay cả 2 đường bằng shared helper (thêm containment + error format mới); giữ hành vi pre-read content |
| 6 | `drawio_export_png` | `file_path`, `output_path` (schema do proxy rewrite thêm) | Extension proxy: Base64ProxyService.proxyInput (services/Base64ProxyService.ts:64–77) đọc file → `content_base64`; backend handler backend/src/engine/tools/drawio-export-png.ts chỉ render (`file_path` "reference only") | `resolvePath` (Base64ProxyService.ts:135–138): absolute passthrough; relative → `this.workspaceRoot ?? process.cwd()`; workspaceRoot được truyền từ RemoteBackendClient (extension/src/remote-backend-client.ts:62) | 🟡 Hoạt động khi workspaceRoot hợp lệ (wrapper-server test có case relative); thiếu containment check; nếu workspaceRoot undefined → fallback Process CWD (lỗi tiềm ẩn) | Áp shared helper trong `resolvePath` cho cả input lẫn `output_path`; verify workspaceRoot truyền đúng lifecycle |
| 7 | `drawio_auto_layout` | `file_path` (+ `algorithm`, `spacing`, `direction`) | **Backend process**: backend/src/engine/tools/drawio-tool.ts:34–50 — `fs` đọc trực tiếp phía backend child server (schema KHÔNG có `content_base64` → Base64Proxy KHÔNG chặn → raw `file_path` được forward xuống backend) | `resolveFilePath` (drawio-tool.ts:59–71): relative → `path.resolve(workspace, ...)` theo `config.workspace` backend; absolute passthrough; containment `startsWith` **case-sensitive** → trả `null` → handler trả `"file_path is required"` — sai ngữ nghĩa | 🔴 Bug — observed 2026-10-12: fail "file_path is required" với mọi biến thể path; resolve theo `config.workspace` backend (ngoài Extension Host) | Theo BR-12 / BRD R-2: ghi nhận audit; fix backend-side tách ticket riêng. **Tối thiểu trong ticket này:** sửa error message phân biệt "path null do escape" với "thiếu tham số" (đúng tinh thần AC-2) |
| 8 | `sandbox_run` | `file` (bắt buộc) (+ `runtime`, `sessionId`, `args`) | KHÔNG đọc file host — backend/src/modules/sandbox/tools/tool-handlers.ts:92–108: build command (`buildRunCommand`) rồi `manager.execute(sessionId, command)` chạy TRONG sandbox session | `file` là path **bên trong sandbox** (inputSchema: "Path to the file inside the sandbox") — không phải workspace-relative trên host | ⚪ KHÔNG bị ảnh hưởng (audit conclusion) | Không cần fix trong ticket này — ghi nhận audit theo BR-12 |

> **Ghi chú audit:** Toàn bộ vị trí dòng ở trên được verify trực tiếp từ source code branch main ngày 2026-10-12. Bảng này là căn cứ bắt buộc cho DEV khi implement và cho QA khi sinh integration test (mỗi tool 1 call relative path — FR-10, AC-5).

#### 3.1.5 UI Specifications

N/A — backend tool behavior, không có UI (theo BRD: không xây UI mới).

#### 3.1.6 API Contract (Functional View)

> **Note:** Đây là functional view của shared helper (business contract). Technical details (TS function signature, module placement, return type cụ thể, cách inject vscode API trong unit test) do **TA enrich** và **SA (TDD)** quy định.

**Contract:** `resolveWorkspacePath(rawPath)` — internal shared helper (không phải MCP endpoint)
**Purpose:** Chuẩn hóa Path Resolution cho mọi MCP Tool nhận đường dẫn trong Extension Host.

**Input Parameters:**

| Parameter | Type | Required | Business Rule | Description |
|-----------|------|----------|---------------|-------------|
| rawPath | string | Y | BR-02, BR-03 | Đường dẫn raw từ tool call (relative / absolute) |

**Output Data:**

| Field | Type | Description |
|-------|------|-------------|
| resolvedPath | string | Absolute path sau resolve + containment pass — dùng cho mọi `fs.*` |
| rootSource | enum | `workspace` hoặc `cwd_fallback` — gốc resolve đã dùng |
| error | structured | Format 1 / Format 2 (xem §9) khi fail — tool forward nguyên vẹn |

**Business Error Scenarios:**

| Scenario | User Message | Trigger Condition |
|----------|-------------|-------------------|
| Path escape | Format 2: `Path rejected: [raw] resolves to [resolved] — outside workspace root [root].` | Containment fail (BR-05) |
| Không xác định được gốc resolve hợp lệ | Format 2 variant — ghi rõ không mở workspace | `workspaceFolders` rỗng và `process.cwd()` là gốc fallback (BR-06) |

---
