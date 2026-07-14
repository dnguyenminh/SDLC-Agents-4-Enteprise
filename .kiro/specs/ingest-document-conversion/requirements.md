# Requirements Document

## Introduction

Khi index tài liệu vào knowledge base, hệ thống cần convert các định dạng file (docx, xls/xlsx, ảnh, pdf...) sang Markdown để tokenize và index chính xác. Hiện tại việc convert đang diễn ra ở phía client (VSCode extension) thông qua chuỗi `TextConverter → RemoteConverter → LocalFallbackConverter`, trong đó:

- `RemoteConverter` gọi tool `convert_to_markdown` — tool này KHÔNG tồn tại trên server.
- `LocalFallbackConverter` dùng `filetomarkdown`, KHÔNG hỗ trợ ảnh và cho kết quả không nhất quán.
- Phía server, `crud.ts:handleIngestFile()` đọc file bằng `fs.readFileSync(resolved, 'utf-8')` — SAI với file nhị phân (docx/xls/ảnh) → tạo entry rác trong index. Handler hiện là đồng bộ (sync) và chưa gọi convert.

Giải pháp: chuyển việc convert thành NGHIỆP VỤ CỦA SERVER. Server sử dụng cơ chế dynamic tool (`find_tools` + `execute_dynamic_tool`) để tìm và gọi tool convert phù hợp cho từng loại file, thay vì nhồi thư viện convert built-in (mammoth/xlsx/pdf-parse/OCR) vào server. Client chỉ chịu trách nhiệm phát hiện tài liệu (`discoverDocuments`), upload file, và hiển thị log. Nếu không có tool nào convert được một file, server trả file đó về danh sách "un-convertible" để client log ra; server KHÔNG index nội dung rác. File markdown/text được ingest trực tiếp, bỏ qua bước convert.

## Glossary

| Term | Definition | Avoid |
|------|------------|-------|
| Ingest Pipeline | Toàn bộ luồng đưa tài liệu vào knowledge base: client discover → upload → server convert (nếu cần) → tokenize → index. | indexing job, import flow |
| Document Conversion | Quá trình chuyển một file nguồn (docx, xls/xlsx, ảnh, pdf...) sang Markdown để tokenize/index. Là nghiệp vụ của SERVER. | parsing, transform |
| Convert Tool Resolution | Quá trình server dùng `find_tools(query)` để tìm tool convert phù hợp với loại file, rồi gọi qua `execute_dynamic_tool`. | tool lookup, resolver |
| Dynamic Tool | Tool thuộc child MCP server, không callable trực tiếp; phải gọi qua `execute_dynamic_tool(toolName, arguments)`. `find_tools` dùng để khám phá. | plugin, nested tool call |
| Built-in Convert Library | Thư viện convert nhúng thẳng vào server (mammoth, xlsx, pdf-parse, OCR engine). Bị CẤM thêm vào server. | embedded parser, native converter |
| Un-convertible File | File mà server KHÔNG tìm được tool convert phù hợp, hoặc convert thất bại. File này KHÔNG được index; được trả về client để log. | failed file, skipped file |
| Binary File | File không phải text/markdown (docx, xls/xlsx, ảnh, pdf...). KHÔNG được đọc bằng `utf-8`. | non-text file |
| Direct Ingest | Luồng ingest cho file markdown/text: đọc nội dung và index trực tiếp, bỏ qua Document Conversion. | passthrough, raw ingest |
| discoverDocuments | Hàm client quét mọi subfolder trong `documents/` (denylist: diagrams/testdata/templates/node_modules/.git) để tạo danh sách file input cho Ingest Pipeline. | file scan, crawler |

## Requirements

### Requirement 1: Server-side Conversion Ownership

**User Story:** As a knowledge base operator, I want document conversion to be performed entirely on the server, so that indexing quality does not depend on the client and the client only needs to display logs.

#### Acceptance Criteria

1. WHEN client gửi một file lên endpoint ingest THE ingest server SHALL chịu trách nhiệm thực hiện Document Conversion trước khi index, KHÔNG yêu cầu client convert.
2. THE ingest client SHALL KHÔNG thực hiện Document Conversion cho file nhị phân và SHALL chỉ upload file gốc kèm metadata rồi hiển thị log kết quả từ server.
3. WHEN server hoàn tất xử lý một batch ingest THE ingest server SHALL trả về cho client kết quả gồm: danh sách file đã index thành công và danh sách Un-convertible File.
4. IF client vẫn còn chain converter cũ (RemoteConverter/LocalFallbackConverter) THEN client SHALL KHÔNG dùng chúng để convert nội dung mà chỉ chuyển file gốc cho server.

### Requirement 2: Convert Tool Resolution qua Dynamic Tool

**User Story:** As a server ingest process, I want to discover and invoke a convert tool dynamically, so that I can convert docx, xls/xlsx and image files without embedding converters.

#### Acceptance Criteria

1. WHEN server cần convert một Binary File THE ingest server SHALL gọi `find_tools(query)` với query mô tả loại convert cần thiết (ví dụ "convert docx to markdown") để thực hiện Convert Tool Resolution.
2. WHEN `find_tools` trả về một tool phù hợp THE ingest server SHALL gọi tool đó qua `execute_dynamic_tool(toolName, arguments)` với `arguments` là object hợp lệ theo inputSchema của tool.
3. WHEN convert một file `.docx` THE ingest server SHALL resolve tool convert docx→markdown qua Convert Tool Resolution.
4. WHEN convert một file `.xls` hoặc `.xlsx` THE ingest server SHALL resolve tool convert spreadsheet→markdown qua Convert Tool Resolution.
5. WHEN convert một file ảnh (jpg/png/...) THE ingest server SHALL resolve tool convert image→markdown/text (ví dụ OCR/embed) qua Convert Tool Resolution.
6. IF `execute_dynamic_tool` trả về lỗi schema validation THEN THE ingest server SHALL log lỗi và coi file đó là Un-convertible File, KHÔNG index nội dung rác.
7. WHEN tool convert trả về Markdown hợp lệ THE ingest server SHALL dùng nội dung Markdown đó để tokenize và index.

### Requirement 3: No Built-in Convert Library trên Server

**User Story:** As a server maintainer, I want the server to avoid embedding conversion libraries, so that the server stays lean and conversion capability is provided by pluggable dynamic tools.

#### Acceptance Criteria

1. THE ingest server SHALL KHÔNG thêm hoặc import các thư viện convert built-in (mammoth, xlsx, pdf-parse, OCR engine) vào codebase server.
2. WHEN cần bất kỳ khả năng convert nào THE ingest server SHALL lấy khả năng đó qua Convert Tool Resolution (dynamic tool), KHÔNG dùng logic convert nội bộ.
3. IF không có Dynamic Tool nào cung cấp khả năng convert cần thiết THEN THE ingest server SHALL coi file là Un-convertible File thay vì fallback sang built-in library.

### Requirement 4: Un-convertible File Handling

**User Story:** As a knowledge base operator, I want files that cannot be converted to be reported instead of indexed, so that garbage content never enters the index.

#### Acceptance Criteria

1. WHEN Convert Tool Resolution KHÔNG tìm được tool phù hợp cho một file THE ingest server SHALL đánh dấu file đó là Un-convertible File.
2. WHEN convert một file thất bại (tool lỗi, timeout, hoặc trả nội dung rỗng/không hợp lệ) THE ingest server SHALL đánh dấu file đó là Un-convertible File.
3. THE ingest server SHALL KHÔNG index nội dung của bất kỳ Un-convertible File nào.
4. WHEN kết thúc batch ingest THE ingest server SHALL trả về client danh sách Un-convertible File kèm lý do (no-tool / convert-failed) cho mỗi file.
5. WHEN client nhận danh sách Un-convertible File THE ingest client SHALL log rõ ràng từng file kèm lý do để user thấy.
6. IF một hoặc nhiều file trong batch là Un-convertible File THEN THE ingest server SHALL vẫn index các file convert thành công còn lại, KHÔNG fail toàn bộ batch.

### Requirement 5: Direct Ingest cho Markdown/Text

**User Story:** As a server ingest process, I want markdown and text files to bypass conversion, so that ingestion stays fast and lossless for already-textual content.

#### Acceptance Criteria

1. WHEN file có định dạng markdown (`.md`) hoặc text (`.txt` và tương đương) THE ingest server SHALL thực hiện Direct Ingest, bỏ qua bước Document Conversion.
2. WHEN thực hiện Direct Ingest THE ingest server SHALL đọc nội dung file dạng text và index trực tiếp.
3. THE ingest server SHALL KHÔNG gọi `find_tools`/`execute_dynamic_tool` cho file thuộc luồng Direct Ingest.

### Requirement 6: Binary File Handling đúng cách

**User Story:** As a server ingest process, I want binary files handled correctly, so that reading them never produces corrupted index entries.

#### Acceptance Criteria

1. THE ingest server SHALL KHÔNG đọc Binary File bằng `fs.readFileSync(path, 'utf-8')`.
2. WHEN xử lý một Binary File THE ingest server SHALL đọc file dưới dạng buffer/binary và truyền cho tool convert qua Convert Tool Resolution.
3. THE ingest server (`handleIngestFile`) SHALL hỗ trợ xử lý bất đồng bộ (async) để có thể gọi convert tool trước khi index.
4. IF một file được xác định là Binary File nhưng không có tool convert THEN THE ingest server SHALL coi file đó là Un-convertible File, KHÔNG tạo entry rác.

### Requirement 7: discoverDocuments làm Input cho Ingest

**User Story:** As an ingest client, I want document discovery to feed the pipeline, so that all relevant files across folders are considered for ingestion.

#### Acceptance Criteria

1. WHEN client bắt đầu index THE ingest client SHALL dùng `discoverDocuments()` để quét mọi subfolder trong `documents/` làm danh sách file input.
2. THE `discoverDocuments` SHALL loại trừ các thư mục trong denylist: `diagrams`, `testdata`, `templates`, `node_modules`, `.git`.
3. WHEN `discoverDocuments` trả về danh sách file THE ingest client SHALL upload từng file (giữ nguyên định dạng gốc) cho server để server quyết định Direct Ingest hay Document Conversion.

## Non-Functional Requirements

### NFR-1: Không index nội dung rác
1. THE ingest server SHALL đảm bảo chỉ nội dung Markdown/text hợp lệ (từ Direct Ingest hoặc convert thành công) được đưa vào index.
2. THE ingest server SHALL KHÔNG tạo index entry cho bất kỳ Un-convertible File nào.

### NFR-2: Không thêm built-in convert library
1. THE ingest server SHALL giữ khả năng convert hoàn toàn ở dạng pluggable dynamic tool và SHALL KHÔNG phụ thuộc thư viện convert nhúng.

### NFR-3: Hiệu năng khi index nhiều file
1. WHEN xử lý nhiều file THE ingest server SHALL xử lý theo hướng batch/bất đồng bộ để KHÔNG block toàn bộ pipeline khi convert một file chậm.
2. WHEN một tool convert bị timeout THE ingest server SHALL giới hạn thời gian chờ và chuyển file sang Un-convertible File thay vì treo pipeline.

### NFR-4: Xử lý ảnh khi chưa có tool = log-only
1. IF chưa có tool convert ảnh khả dụng THEN THE ingest server SHALL coi file ảnh là Un-convertible File và trả về client để log, KHÔNG fail toàn bộ pipeline.

### NFR-5: Observability / Logging
1. THE ingest client SHALL log mọi Un-convertible File kèm lý do một cách dễ đọc cho user.
2. THE ingest server SHALL log kết quả Convert Tool Resolution (tool được chọn, thành công/thất bại) cho mỗi file để phục vụ debug.

## Out of Scope

1. Tự viết engine OCR trong server.
2. Cài đặt/nhúng các thư viện convert built-in (mammoth, xlsx, pdf-parse, OCR) vào server.
3. Xây dựng hoặc triển khai bản thân child MCP server cung cấp tool convert (chỉ tiêu thụ tool nếu có sẵn qua dynamic tool).
4. Client-side conversion logic (chuyển hẳn nghiệp vụ convert sang server; client chỉ discover/upload/log).
5. Thay đổi định dạng lưu trữ index hoặc thuật toán tokenize.
6. Hỗ trợ các định dạng nằm ngoài docx, xls/xlsx, ảnh, markdown/text trong phạm vi feature này (pdf và định dạng khác chỉ được xử lý nếu có tool convert tương ứng, không cam kết).
