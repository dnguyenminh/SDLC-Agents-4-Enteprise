# FSD — SA4E-32: Server-side Document Conversion khi Ingest (qua Dynamic Tool)

| Field | Value |
|-------|-------|
| Ticket | SA4E-32 |
| Document | Functional Specification Document (FSD) |
| Version | 1 |
| Author | ba-agent (draft) |
| Related BRD | BRD-v1-SA4E-32.docx |
| Related Spec | Kiro spec `.kiro/specs/ingest-document-conversion/design.md` |
| Status | Draft for TA enrichment |

## 1. Overview

Tài liệu này đặc tả chức năng cho tính năng **Server-side Document Conversion khi Ingest**. Khi một tài liệu được ingest vào Knowledge Base, server chịu trách nhiệm xác định cách xử lý dựa trên loại file:

- File Markdown/text → **direct ingest** (index trực tiếp).
- File nhị phân có convert tool → **convert qua dynamic tool** rồi index.
- File nhị phân không có convert tool → **unconvertible** (không index, trả log).

Server KHÔNG nhúng thư viện convert; mọi conversion đi qua `find_tools` + `execute_dynamic_tool`. Input ingest lấy từ `discoverDocuments`. Kết quả trả về gồm danh sách `ingested`, `unconvertible`, và `summary`.

## 2. Actors

| Actor | Mô tả |
|-------|-------|
| AI Agent / User | Kích hoạt ingest tài liệu vào KB. |
| Ingest Service (server) | Điều phối phân loại file, conversion, và index. |
| Dynamic Tool Orchestrator | Cung cấp `find_tools` và `execute_dynamic_tool`. |
| Convert Tool (child server) | Thực hiện conversion; có thể không tồn tại (0 hiện tại). |
| Knowledge Base | Lưu trữ và index nội dung. |

## 3. Use Cases

### UC-1 — Ingest file Markdown (direct)

**Precondition:** File có extension `.md`/`.markdown`/`.txt` nằm trong danh sách từ `discoverDocuments`.

**Main Flow:**
1. Ingest Service nhận file path và xác định file type = text/markdown.
2. Service đọc nội dung file dưới dạng text (UTF-8).
3. Service gọi `/api/v1/memory/ingest-file` để index nội dung.
4. Service thêm file vào danh sách `ingested`.
5. Ghi log "direct ingest" trên Output Channel "SDLC Indexing".

**Alternative Flow:**
- A1 (file text rỗng): vẫn index (hoặc bỏ qua theo cấu hình) nhưng ghi log cảnh báo; không đánh dấu unconvertible.

**Exception Flow:**
- E1 (đọc file thất bại — IO error): đánh dấu `unconvertible` với `reason = "convert-failed"`, ghi log lỗi, không index.

### UC-2 — Ingest file docx có convert tool (convert)

**Precondition:** File nhị phân (ví dụ `.docx`) có convert tool khả dụng qua orchestration.

**Main Flow:**
1. Ingest Service phát hiện file type = binary cần convert.
2. Service gọi `find_tools(query, threshold, top_k)` để tìm convert tool.
3. Tìm thấy tool phù hợp; Service gọi `execute_dynamic_tool(tool_name, arguments: { file_path, ... })` với `arguments` là object.
4. Convert tool trả về Markdown.
5. Service gọi `/api/v1/memory/ingest-file` để index Markdown.
6. Service thêm file vào `ingested`; ghi log "converted + ingested".

**Alternative Flow:**
- A1 (nhiều tool trả về): chọn tool có score cao nhất phù hợp với file type.
- A2 (legacy client convert docx/xls): nếu file đã được client convert (`filetomarkdown`) và gửi Markdown, server đi theo nhánh direct ingest — tương thích ngược.

**Exception Flow:**
- E1 (convert trả về rỗng): `unconvertible`, `reason = "empty-result"`, không index.
- E2 (schema arguments sai): `unconvertible`, `reason = "schema-error"`, ghi log; retry một lần với arguments đơn giản hơn.
- E3 (convert tool lỗi/exception): `unconvertible`, `reason = "convert-failed"`.
- E4 (convert quá thời gian): `unconvertible`, `reason = "timeout"`.

### UC-3 — Ingest ảnh không có tool (un-convertible → log)

**Precondition:** File nhị phân (ví dụ `.png`, `.jpg`) và KHÔNG có convert tool (hiện tại chưa có convert server → 0).

**Main Flow:**
1. Ingest Service phát hiện file type = binary (ảnh).
2. Service gọi `find_tools` để tìm convert tool cho ảnh.
3. Không tìm thấy tool phù hợp.
4. Service KHÔNG đọc file như UTF-8 và KHÔNG index.
5. Service đánh dấu file `unconvertible` với `reason = "no-tool"`.
6. Response chứa entry unconvertible để client log cho người dùng.
7. Ghi log "skipped (no-tool)" trên Output Channel "SDLC Indexing".

**Alternative Flow:**
- A1 (tương lai có convert server ảnh): khi convert tool xuất hiện, luồng chuyển sang UC-2.

**Exception Flow:**
- E1 (`find_tools` lỗi orchestration): đánh dấu `unconvertible` với `reason = "no-tool"`, ghi log lỗi; không index.

## 4. Business Rules

| BR ID | Rule | Nguồn |
|-------|------|-------|
| BR-01 | File `.md`/`.markdown`/`.txt` PHẢI được ingest trực tiếp, không gọi convert tool. | R5 |
| BR-02 | File nhị phân KHÔNG được đọc dưới dạng UTF-8 text để index trực tiếp. | R6 |
| BR-03 | Mọi conversion PHẢI đi qua `find_tools` + `execute_dynamic_tool`; server KHÔNG dùng thư viện convert built-in. | R2, R3 |
| BR-04 | `arguments` truyền vào `execute_dynamic_tool` PHẢI là object (không phải JSON string). | tool-usage-dynamic.md |
| BR-05 | File không convert được KHÔNG được index vào KB. | R4, NFR-1 |
| BR-06 | File không convert được PHẢI được đánh dấu `unconvertible` với `reason` thuộc enum xác định. | R4 |
| BR-07 | Binary file handler PHẢI chạy async và có timeout. | R6, NFR-3 |
| BR-08 | Input ingest PHẢI lấy từ `discoverDocuments`. | R7 |
| BR-09 | Mọi thao tác ingest PHẢI ghi log observability (start/result/reason). | NFR-5 |
| BR-10 | Nhánh client convert legacy (docx/xls qua `filetomarkdown`) PHẢI được bảo toàn. | BRD D5 |
| BR-11 | Khi `execute_dynamic_tool` trả schema-error, retry MỘT lần với arguments đơn giản hơn trước khi đánh dấu unconvertible. | tool-usage-dynamic.md |

## 5. Data Specifications

### 5.1 KB Entry (nội dung index)

| Field | Type | Mô tả |
|-------|------|-------|
| content | string (Markdown/text) | Nội dung đã convert hoặc đọc trực tiếp. |
| source | string | Đường dẫn file gốc (từ discoverDocuments). |
| type | enum | Loại nội dung (ví dụ DOCUMENT/CONTEXT). |
| tags | string | Nhãn để phục vụ search. |
| scope | enum | Phạm vi (ví dụ PROJECT). |
| convertedBy | string? | Tên convert tool (chỉ khi convert). |

### 5.2 Ingest Response

```json
{
  "ingested": ["docs/readme.md", "docs/spec.docx"],
  "unconvertible": [
    { "file": "assets/logo.png", "reason": "no-tool" },
    { "file": "docs/broken.docx", "reason": "convert-failed" }
  ],
  "summary": { "total": 4, "ingested": 2, "unconvertible": 2 }
}
```

| Field | Type | Mô tả |
|-------|------|-------|
| ingested | string[] | Danh sách file đã index (direct hoặc converted). |
| unconvertible | array | Danh sách file không index được. |
| unconvertible[].file | string | Đường dẫn file. |
| unconvertible[].reason | enum | `no-tool` \| `convert-failed` \| `empty-result` \| `schema-error` \| `timeout`. |
| summary | object | Tổng hợp: total / ingested / unconvertible. |

## 6. API / Integration Specifications

### 6.1 Ingest Endpoint

```
POST /api/v1/memory/ingest-file
Content-Type: application/json
```
Request (per-file): `{ file_path, type, format, content? }`. Response bọc `{ data, error }`; text kết quả chứa marker `UNCONVERTIBLE: <file> (reason=<reason>)` khi file không convert được (hiện tại — sẽ nâng lên response có cấu trúc ở task tiếp theo).

> Lưu ý bảo mật: path-based read cho phép server đọc file theo path client cung cấp ⇒ cần path traversal guard + giới hạn workspace root. Xác định cơ chế auth cho môi trường triển khai.

### 6.2 Dynamic Tool Integration

**Step 1 — Discover convert tool:**
```
find_tools(query: "convert <file-type> to markdown", threshold: 0.4, top_k: 5)
```
Trả về danh sách tool + schema. Nếu rỗng → route sang unconvertible (`no-tool`).

**Step 2 — Execute convert:**
```
execute_dynamic_tool(tool_name: "<convert_tool>", arguments: { uri, path, file_path })  // arguments PHẢI là object
```

**Error Recovery (theo steering):**
- Schema validation error → kiểm tra kiểu argument theo `inputSchema`; retry 1 lần đơn giản hóa (BR-11) → nếu vẫn lỗi: `schema-error`.
- Tool not found / child server DEAD → `no-tool`; kiểm tra `orchestration_status`.
- Timeout → `timeout`.

## 7. Error Handling — Reason Enum

| reason | Ý nghĩa | Khi nào |
|--------|---------|---------|
| `no-tool` | Không tìm thấy convert tool phù hợp | `find_tools` rỗng / không có convert server (hiện tại ảnh). |
| `convert-failed` | Convert tool lỗi/exception | `execute_dynamic_tool` ném lỗi hoặc IO error khi đọc. |
| `empty-result` | Convert trả về rỗng | Tool chạy xong nhưng Markdown rỗng. |
| `schema-error` | Sai schema arguments | Validation error sau khi retry đơn giản hóa. |
| `timeout` | Convert vượt thời gian | Handler async vượt timeout. |

Nguyên tắc: không nuốt exception (log + reflect vào reason); không index rác; người dùng được thông báo qua response + Output Channel.

## 8. UI / Logging Specification

- Log trên **Output Channel "SDLC Indexing"**:
  - Direct: `[ingest] direct <source>`
  - Converted: `[ingest] converted <source> via <tool>`
  - Unconvertible: `⚠️ <source> (reason=<reason>)`
- Kết thúc batch: log `summary` (total / ingested / unconvertible).
- Client dùng `unconvertible` từ response để hiển thị (log-only — NFR-4).

## 9. Traceability (Requirement → UC / BR)

| Requirement | Use Case | Business Rule |
|-------------|----------|---------------|
| R1 Server-side Ownership | UC-2 | BR-03 |
| R2 Tool Resolution | UC-2 | BR-03, BR-04, BR-11 |
| R3 No Built-in Lib | UC-2 | BR-03 |
| R4 Un-convertible Handling | UC-3 | BR-05, BR-06 |
| R5 Direct Ingest md/text | UC-1 | BR-01 |
| R6 Binary Handling | UC-2, UC-3 | BR-02, BR-07 |
| R7 discoverDocuments input | UC-1..3 | BR-08 |

## Appendix — Diagrams

### System Context

![System Context](diagrams/system-context.png)

### Sequence — Ingest & Convert

![Sequence Ingest](diagrams/sequence-ingest.png)

### State — File Ingest Lifecycle

![State Ingest](diagrams/state-ingest.png)

### Diagram Index

| # | Diagram | Image | Source (editable) |
|---|---------|-------|-------------------|
| 1 | System Context | [system-context.png](diagrams/system-context.png) | [system-context.drawio](diagrams/system-context.drawio) |
| 2 | Sequence — Ingest & Convert | [sequence-ingest.png](diagrams/sequence-ingest.png) | [sequence-ingest.drawio](diagrams/sequence-ingest.drawio) |
| 3 | State — File Ingest Lifecycle | [state-ingest.png](diagrams/state-ingest.png) | [state-ingest.drawio](diagrams/state-ingest.drawio) |
