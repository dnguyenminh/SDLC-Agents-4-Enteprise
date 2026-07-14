# TDD — SA4E-32: Server-side Document Conversion khi Ingest (qua Dynamic Tool)

| Field | Value |
|-------|-------|
| Ticket | SA4E-32 |
| Document | Technical Design Document (TDD) |
| Version | 1 |
| Author | sa-agent |
| Related FSD | FSD-v1-SA4E-32.docx |
| Related Spec | Kiro spec `.kiro/specs/ingest-document-conversion/design.md` |
| Status | Draft |

## 1. Architecture Overview

Bước convert được **dời khỏi client** và đặt sau `handleIngestFile` trên server, dựa hoàn toàn vào orchestration dynamic tools (`find_tools` + `execute_dynamic_tool`). Server KHÔNG nhúng thư viện convert. File md/text → Direct Ingest; binary → ConvertToolResolver; không có tool/convert fail → un-convertible (không index rác).

```
Client (extension)                         Server (backend)
 IndexingService.indexDocuments            POST /api/v1/memory/ingest-file
   discoverDocuments  -- upload -->          -> dispatcher (mem_ingest_file)
   IndexerHttpClient                          -> handleIngestFile (async)
   Output Channel <-- unconvertible --          -> FormatClassifier
                                                 -> md/text: MemoryEngine.insert
                                                 -> binary: ConvertToolResolver
                                                     -> OrchestrationGateway
                                                        -> find_tools / execute_dynamic_tool
                                                        -> (child convert server neu co)
```

## 2. Component / Module Design

### FormatClassifier (`backend/src/modules/memory/ingest/FormatClassifier.ts`)
- `classifyFormat({filePath, ext?, mime?}) -> 'markdown' | 'text' | 'binary'`
- `.md/.markdown` → markdown; `.txt/.csv/.json/.xml/.yaml/.yml/.log` + `text/*` mime → text; còn lại → binary.
- `normalizeExt(filePath, ext?)` → ext lowercase có dấu chấm.

### FileReader (logic trong handleIngestFile)
- text/markdown: `fs.promises.readFile(path, 'utf-8')`.
- binary: KHÔNG đọc utf-8 — chuyển path cho ConvertToolResolver.

### OrchestrationGateway (`OrchestrationGateway.ts`)
- Interface: `findTools(query, opts)`, `executeDynamicTool(toolName, args)`.
- `NullOrchestrationGateway`: luôn no-tool (khi orchestration chưa sẵn sàng).
- `RegistryOrchestrationGateway`: lazy-resolve handler `find_tools`/`execute_dynamic_tool` từ ModuleRegistry tại thời điểm ingest; parse `content[0].text`.

### ConvertToolResolver (`ConvertToolResolver.ts`)
- `resolve(req) -> ConvertResult` ({ok, markdown, toolName} | {ok:false, reason}).
- `buildQuery(ext, mime)` — map ext → query ("convert docx to markdown", "convert excel...", "convert image OCR...").
- `selectBestTool(tools, ext)` — ưu tiên tool khớp ext/convert/markdown.
- `buildArgs(req)` — cung cấp `{uri, path, filePath}` cho nhiều schema.
- `withTimeout(p, ms)` — timeout mặc định 30_000ms.
- `extractMarkdown(raw)` — raw hoặc JSON `{markdown|content|text}`.
- reason enum: `no-tool | convert-failed | empty-result | schema-error | timeout`.

### handleIngestFile async (`dispatchers/crud.ts`)
- md/text → Direct Ingest (đọc utf-8 hoặc dùng content injected).
- binary + có content (client convert sẵn) → dùng content (tương thích ngược).
- binary + không content → ConvertToolResolver; fail/no-tool → `unconvertibleMessage()` (marker), KHÔNG insert.
- Chèn KB theo section split heading; `dispatch` async; MemoryModule `await` + wire resolver qua registry; `index.ts` truyền registry.

## 3. API Design

### POST /api/v1/memory/ingest-file
- Request (per-file): `{ file_path, type, format, content? }`.
- Response: `{ data: { content:[{type:'text', text}], isError }, error }`. `text` = "Ingested: N entries..." hoặc marker "UNCONVERTIBLE: <file> (reason=<reason>) — not indexed".
- (Task tiếp theo) nâng lên response có cấu trúc `{ingested, unconvertible, summary}`.

### Dynamic tool
- `find_tools(query, {threshold:0.4, top_k:5})` → danh sách ToolDescriptor.
- `execute_dynamic_tool(toolName, arguments)` — arguments là object.

## 4. Data Model

| Field | Mô tả |
|-------|-------|
| content | markdown (direct/converted) — chỉ markdown hợp lệ |
| source | file path |
| type/tier/scope/tags | như hiện tại |
| convertedBy | tên tool (optional) |

**Không có migration DB.** Un-convertible KHÔNG tạo entry.

## 5. Error Handling

| reason | Khi nào |
|--------|---------|
| no-tool | find_tools rỗng / gateway lỗi |
| convert-failed | execute_dynamic_tool ném lỗi |
| empty-result | markdown rỗng |
| schema-error | buildArgs không tạo được args hợp lệ |
| timeout | vượt CONVERT_TIMEOUT_MS |

Nguyên tắc: không nuốt exception; không index rác; client hiển thị log.

## 6. Security Design

- Path-based read: BẮT BUỘC path traversal guard + giới hạn workspace root (file không tồn tại → un-convertible no-tool, không lỗi cứng).
- Size cap cho binary (tránh treo/DoS).
- KHÔNG log/echo nội dung file nhị phân hay giá trị nhạy cảm.
- Orchestration input hardening: validate tool name/args trước khi execute.

## 7. Implementation Checklist

| # | Task | Trace | Status |
|---|------|-------|--------|
| 1 | FormatClassifier | R5, R6 | done |
| 2 | FileReader async (no utf-8 binary) | R6 | done |
| 3 | OrchestrationGateway (Null + Registry) | R2, NFR-2 | done |
| 4 | ConvertToolResolver + tests | R2,R3,R4,NFR-3,NFR-5 | done |
| 5 | handleIngestFile async + wiring | R4,R5,R6,NFR-1,NFR-3 | done |
| 6 | Client log un-convertible | R1, NFR-5 | done |
| 7 | Client cutover convert | R1, R2 | pending |
| 8 | Binary upload contract + response schema | R1, NFR-3 | pending |
| 9 | Integration + PBT tests | R4,R6,NFR-1,NFR-3 | pending |
| 10 | Wiring child convert server | R2,NFR-2,NFR-4 | pending |

## Appendix — Diagrams

### Architecture

![Architecture](diagrams/architecture.png)

### Component

![Component](diagrams/component.png)

### Diagram Index

| # | Diagram | Image | Source (editable) |
|---|---------|-------|-------------------|
| 1 | Architecture | [architecture.png](diagrams/architecture.png) | [architecture.drawio](diagrams/architecture.drawio) |
| 2 | Component | [component.png](diagrams/component.png) | [component.drawio](diagrams/component.drawio) |
