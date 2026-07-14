# BRD — SA4E-32: Server-side Document Conversion khi Ingest (qua Dynamic Tool)

| Field | Value |
|-------|-------|
| Ticket | SA4E-32 |
| Document | Business Requirements Document (BRD) |
| Version | 1 |
| Author | ba-agent |
| Related Spec | Kiro spec `.kiro/specs/ingest-document-conversion/requirements.md` |
| Status | Draft for Docs Review |

## 1. Overview & Business Context

Hệ thống Code Intelligence MCP Server cung cấp khả năng ingest tài liệu vào Knowledge Base (KB) để phục vụ semantic search cho các AI agent trong pipeline SDLC. Trước đây, việc chuyển đổi tài liệu (document conversion) từ các định dạng nhị phân (docx, xlsx, pdf, ảnh...) sang Markdown được thực hiện ở phía client (VSCode extension) bằng thư viện `filetomarkdown`.

Bối cảnh kiến trúc đã thay đổi: MCP đã chuyển sang mô hình REST API, và server sử dụng cơ chế **dynamic tool** (`find_tools` + `execute_dynamic_tool`) để gọi các tool từ các child server qua orchestration. Điều này mở ra khả năng chuyển trách nhiệm conversion về phía server, giúp thống nhất luồng xử lý, giảm phụ thuộc client, và tận dụng các convert tool có thể cắm thêm (pluggable) qua orchestration.

Hiện trạng: chưa có child convert server nào được đăng ký (số lượng = 0). Do đó, với các file nhị phân không có convert tool phù hợp, hệ thống phải xử lý an toàn thay vì index nội dung rác.

## 2. Problem Statement

- **Vấn đề 1 — Trách nhiệm conversion phân tán:** Conversion nằm ở client khiến logic bị trùng lặp, khó bảo trì, và không nhất quán khi có nhiều client.
- **Vấn đề 2 — Rủi ro index rác:** Nếu server đọc file nhị phân như UTF-8 text và index thẳng, KB sẽ chứa dữ liệu rác (binary garbage), làm giảm chất lượng semantic search.
- **Vấn đề 3 — Thiếu khả năng mở rộng:** Không có cơ chế chuẩn để thêm convert tool mới mà không phải nhúng thư viện convert trực tiếp vào server.
- **Vấn đề 4 — Thiếu khả năng quan sát (observability):** Khi một file không convert được, client/người dùng không nhận được phản hồi rõ ràng về lý do.

## 3. Goals & Success Metrics

### Business Goals
- G1: Chuyển trách nhiệm document conversion về phía server (server-side ownership) khi ingest.
- G2: Đảm bảo KB không bao giờ chứa nội dung rác từ file không convert được.
- G3: Cho phép mở rộng khả năng convert qua dynamic tool mà không nhúng thư viện convert vào server.
- G4: Cung cấp phản hồi rõ ràng (log + response) cho các file không convert được.

### Success Metrics
| # | Metric | Target |
|---|--------|--------|
| M1 | Tỷ lệ file rác được index vào KB | 0% |
| M2 | File md/text được ingest trực tiếp (không cần convert) | 100% |
| M3 | File có convert tool phù hợp được convert thành công và ingest | ≥ 95% (khi tool khả dụng) |
| M4 | File không có tool được đánh dấu `unconvertible` với `reason` rõ ràng | 100% |
| M5 | Không thêm thư viện convert mới vào server backend | 0 dependency mới |
| M6 | Mỗi thao tác ingest có log observability (bắt đầu/kết thúc/lý do) | 100% |

## 4. User Stories

### US-1 — Ingest tài liệu Markdown/text trực tiếp
> Là một **AI agent (hoặc người dùng)**, tôi muốn ingest file `.md`/text vào KB **không cần convert**, để tiết kiệm thời gian và tránh xử lý thừa.

**Acceptance Criteria:**
- AC-1.1: Khi ingest file có phần mở rộng `.md`, `.markdown`, `.txt`, server đọc nội dung và index trực tiếp, không gọi convert tool.
- AC-1.2: Response trả về đánh dấu file trong danh sách `ingested`.
- AC-1.3: Log ghi nhận đường đi "direct ingest" cho file đó.

### US-2 — Convert tài liệu nhị phân qua dynamic tool khi ingest
> Là một **AI agent**, tôi muốn server tự động convert file `.docx` (hoặc định dạng có convert tool) sang Markdown qua dynamic tool trước khi index, để nội dung có thể search được.

**Acceptance Criteria:**
- AC-2.1: Server dùng `find_tools` để phát hiện convert tool phù hợp với loại file.
- AC-2.2: Nếu tìm thấy tool, server gọi `execute_dynamic_tool` với `arguments` là object hợp lệ để convert.
- AC-2.3: Kết quả Markdown trả về được index vào KB, file được đánh dấu `ingested`.
- AC-2.4: Server KHÔNG nhúng/không dùng thư viện convert built-in — mọi conversion đi qua dynamic tool.
- AC-2.5: Nếu convert trả về kết quả rỗng hoặc lỗi schema, file bị đánh dấu `unconvertible` với `reason` tương ứng (không index rác).

### US-3 — Xử lý an toàn file không convert được (không có tool)
> Là một **AI agent**, tôi muốn server KHÔNG index nội dung rác cho file nhị phân không có convert tool (ví dụ ảnh khi chưa có convert server), và trả về log rõ ràng, để KB giữ được chất lượng.

**Acceptance Criteria:**
- AC-3.1: Khi ingest file nhị phân (ví dụ `.png`, `.jpg`) mà không tìm thấy convert tool, server KHÔNG đọc file như UTF-8 và KHÔNG index.
- AC-3.2: File được đánh dấu `unconvertible` với `reason = "no-tool"`.
- AC-3.3: Response chứa thông tin unconvertible để client log lại cho người dùng.
- AC-3.4: Log observability ghi nhận file bị bỏ qua và lý do.

### US-4 — Ingest theo batch từ danh sách tài liệu khám phá được
> Là một **AI agent**, tôi muốn ingest nhiều tài liệu cùng lúc dựa trên kết quả `discoverDocuments`, để nạp KB hiệu quả theo batch.

**Acceptance Criteria:**
- AC-4.1: Input ingest nhận danh sách file từ `discoverDocuments`.
- AC-4.2: Xử lý file nhị phân theo cơ chế async, không chặn (non-blocking), có timeout.
- AC-4.3: Response tổng hợp `summary` gồm số file `ingested` và `unconvertible`.

## 5. Scope

### In Scope
- Server-side conversion ownership khi ingest file (R1).
- Convert tool resolution qua `find_tools` + `execute_dynamic_tool` (R2).
- Direct ingest cho md/text (R5).
- Binary file handling: không đọc UTF-8, handler async, timeout (R6).
- Un-convertible handling: không index rác, trả về client log với `reason` (R4).
- Sử dụng `discoverDocuments` làm nguồn input (R7).
- Observability/logging cho toàn bộ luồng ingest (NFR-5).

### Out of Scope
- Nhúng/bổ sung thư viện convert built-in vào server (R3 cấm).
- Triển khai child convert server mới (công việc riêng; hiện tại = 0).
- Thay đổi luồng client convert hiện tại cho docx/xls (nhánh tương thích ngược — giữ nguyên).
- UI/UX của VSCode extension ngoài phần log output.

## 6. Dependencies

| # | Dependency | Mô tả |
|---|-----------|-------|
| D1 | Dynamic tool orchestration | `find_tools` + `execute_dynamic_tool` phải hoạt động (steering `tool-usage-dynamic.md`). |
| D2 | `discoverDocuments` | Cung cấp danh sách file làm input cho ingest. |
| D3 | Knowledge Base ingest API | Endpoint `/api/v1/memory/ingest-file` để index nội dung đã convert/đọc. |
| D4 | Child convert server (tương lai) | Cần để convert ảnh/nhị phân; hiện chưa có (0) → nhánh no-tool. |
| D5 | Client convert legacy (`filetomarkdown`) | docx/xls hiện được client convert — nhánh tương thích ngược cần bảo toàn. |

## 7. Non-Functional Requirements

| # | NFR | Yêu cầu | Nguồn |
|---|-----|---------|-------|
| NFR-1 | Data quality | KB KHÔNG được chứa nội dung rác — file không convert được phải bị loại khỏi index. | R4, M1 |
| NFR-2 | Maintainability | KHÔNG thêm thư viện convert vào server backend; conversion chỉ đi qua dynamic tool. | R3, M5 |
| NFR-3 | Performance | Xử lý batch với binary handler async + timeout để tránh block và treo tiến trình. | R6 |
| NFR-4 | Graceful degradation | Khi chưa có convert tool (ví dụ ảnh), xử lý log-only, không lỗi cứng, không index. | R4, R6 |
| NFR-5 | Observability | Mọi thao tác ingest phải được log trên Output Channel "SDLC Indexing". | Design.md |

## 8. Assumptions & Risks

### Assumptions
- A1: Cơ chế dynamic tool đã sẵn sàng và ổn định (theo steering workspace).
- A2: `discoverDocuments` trả về đường dẫn file hợp lệ và loại file (extension) xác định được.
- A3: Endpoint `/api/v1/memory/ingest-file` chấp nhận nội dung text/Markdown để index.
- A4: Nhánh client convert legacy (docx/xls qua `filetomarkdown`) vẫn được giữ để tương thích ngược.

### Risks
| # | Risk | Impact | Mitigation |
|---|------|--------|-----------|
| RK1 | Chưa có convert server → nhiều file nhị phân rơi vào `unconvertible` | Medium | Log rõ ràng `reason=no-tool`; hành vi kỳ vọng cho tới khi có convert server. |
| RK2 | Convert tool trả về schema sai/kết quả rỗng | Medium | Bắt lỗi, đánh dấu `reason=convert-failed`/`empty-result`, không index. |
| RK3 | File nhị phân lớn gây treo | High | Handler async + timeout (`reason=timeout`). |
| RK4 | Đọc nhầm file nhị phân như UTF-8 gây index rác | High | Chặn đọc UTF-8 cho binary; route qua convert hoặc unconvertible. |
| RK5 | Phá vỡ luồng client convert legacy | Medium | Giữ nhánh tương thích ngược, không thay đổi hành vi hiện có của client. |

## 9. Traceability (Requirements → User Stories)

| Requirement | Mô tả | User Story |
|-------------|-------|-----------|
| R1 | Server-side Conversion Ownership | US-2 |
| R2 | Convert Tool Resolution | US-2 |
| R3 | No Built-in Convert Library | US-2 (AC-2.4) |
| R4 | Un-convertible Handling | US-3 |
| R5 | Direct Ingest cho md/text | US-1 |
| R6 | Binary File Handling (async, no utf-8) | US-3, US-4 |
| R7 | discoverDocuments làm input | US-4 |

## Appendix — Diagrams

### Business Flow

![Business Flow](diagrams/business-flow.png)

### Use Case

![Use Case](diagrams/use-case.png)

### Diagram Index

| # | Diagram | Image | Source (editable) |
|---|---------|-------|-------------------|
| 1 | Business Flow | [business-flow.png](diagrams/business-flow.png) | [business-flow.drawio](diagrams/business-flow.drawio) |
| 2 | Use Case | [use-case.png](diagrams/use-case.png) | [use-case.drawio](diagrams/use-case.drawio) |
