# STP — SA4E-32: Server-side Document Conversion khi Ingest

| Field | Value |
|-------|-------|
| Ticket | SA4E-32 |
| Document | Software Test Plan (STP) |
| Version | 1 |
| Author | qa-agent |
| Related | BRD/FSD/TDD SA4E-32, Kiro spec |
| Status | Draft |

## 1. Test Objectives
Xác minh server-side document conversion khi ingest: md/text direct, binary convert qua dynamic tool, un-convertible không index rác + báo client log; không thêm lib server; binary không đọc utf-8; handler async + timeout.

## 2. Scope
- In: FormatClassifier, ConvertToolResolver, OrchestrationGateway, handleIngestFile, client parseUnconvertible + IndexingService log.
- Out: child convert server thực tế; UI ngoài log; migration DB (không có).

## 3. Test Levels & Coverage

| Level | Mô tả | Trạng thái |
|-------|-------|-----------|
| PBT | Invariants: total = ingested + unconvertible; reason thuoc enum; no-garbage; binary không decode utf-8 | Planned (task 9) |
| UT (Unit) | FormatClassifier, ConvertToolResolver (no-tool/success/convert-failed/empty-result/timeout), helpers | done - 10 test pass |
| IT (Integration) | handleIngestFile async (md/binary/unconvertible); endpoint /api/v1/memory/ingest-file trả marker | partial (dispatcher tests pass); endpoint IT planned (task 9) |
| E2E-API | POST ingest-file batch (md + docx no-tool + png no-tool) → summary đúng, KB không rác | Planned (task 9) |
| E2E-UI | Index workspace từ extension → Output Channel "SDLC Indexing" hiển thị un-convertible | Planned (task 7-8) |
| SIT | Manual: index thư mục documents/ thật, kiểm tra log + KB entries | Planned |

## 4. Requirements Traceability Matrix (RTM)

| Req | Test cases |
|-----|-----------|
| R1 Server-side ownership | IT-05, E2E-UI-01 |
| R2 Tool resolution | UT-06..09, IT-02 |
| R3 No built-in lib | UT (no convert import), review |
| R4 Un-convertible | UT-06/08/10, IT-03, E2E-API-01 |
| R5 Direct ingest | UT-01, IT-01 |
| R6 Binary handling | UT-03, IT-02/03 (readBuffer, no utf-8) |
| R7 discoverDocuments | (đã test ở indexer.test.ts — 14/14) |
| NFR-1 no garbage | E2E-API-01 (KB không entry cho unconvertible) |
| NFR-3 timeout | UT-10 |
| NFR-5 observability | E2E-UI-01 (log) |

## 5. Test Environment
- Backend: Node + vitest + temp SQLite.
- Extension: vitest + esbuild bundle.
- Mock OrchestrationGateway cho unit test resolver.

## 6. Entry / Exit Criteria
- Entry: code compile (tsc/esbuild OK).
- Exit: UT + IT pass; PBT invariants hold; KB không chứa rác; log un-convertible hiển thị.

## 7. Test Data
CSV: xem STC. Fixtures: `.md` hợp lệ, `.docx` nhỏ, `.png` nhỏ, file rỗng, file lớn (size cap).

## Appendix — Diagrams

### Test Coverage

![Test Coverage](diagrams/test-coverage.png)

### Test Execution Flow

![Test Execution Flow](diagrams/test-execution-flow.png)

### Diagram Index

| # | Diagram | Image | Source (editable) |
|---|---------|-------|-------------------|
| 1 | Test Coverage | [test-coverage.png](diagrams/test-coverage.png) | [test-coverage.drawio](diagrams/test-coverage.drawio) |
| 2 | Test Execution Flow | [test-execution-flow.png](diagrams/test-execution-flow.png) | [test-execution-flow.drawio](diagrams/test-execution-flow.drawio) |
