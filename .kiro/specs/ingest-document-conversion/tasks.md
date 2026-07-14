# Implementation Plan

## Overview

Triển khai chuyển conversion tài liệu sang server-side qua dynamic tool, un-convertible trả về client để log. Tasks 1-6 đã hoàn thành và verify (backend tsc OK, extension esbuild OK, 15/15 unit test pass). Tasks 7-10 còn lại cần quyết định runtime + verify end-to-end.

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "tasks": ["1", "2", "3"] },
    { "wave": 2, "tasks": ["4"] },
    { "wave": 3, "tasks": ["5"] },
    { "wave": 4, "tasks": ["6", "10"] },
    { "wave": 5, "tasks": ["7"] },
    { "wave": 6, "tasks": ["8"] },
    { "wave": 7, "tasks": ["9"] }
  ],
  "dependencies": {
    "1": [],
    "2": [],
    "3": [],
    "4": ["3"],
    "5": ["1", "2", "4"],
    "6": ["5"],
    "7": ["6"],
    "8": ["7"],
    "9": ["5", "8"],
    "10": ["4"]
  }
}
```

## Tasks

- [x] 1. Tạo FormatClassifier (server)
  - `backend/src/modules/memory/ingest/FormatClassifier.ts` — phân loại markdown/text/binary theo ext/mime; unit test bảng ext→format
  - _Requirements: R5, R6_

- [x] 2. Đọc file async đúng cách
  - `fs.promises.readFile(path, 'utf-8')` cho text; KHÔNG đọc utf-8 cho binary trong `handleIngestFile`
  - _Requirements: R6_

- [x] 3. Tạo OrchestrationGateway (interface + Null + Registry adapter)
  - `RegistryOrchestrationGateway` lazy-resolve `find_tools`/`execute_dynamic_tool` từ ModuleRegistry
  - _Requirements: R2, NFR-2_

- [x] 4. Tạo ConvertToolResolver
  - buildQuery, selectBestTool, buildArgs, withTimeout, extractMarkdown; reason enum; unit tests (no-tool/success/convert-failed/empty-result/timeout)
  - _Requirements: R2, R3, R4, NFR-3, NFR-5_

- [x] 5. Refactor handleIngestFile async + format-aware
  - md/text → Direct Ingest; binary có content → dùng content (tương thích ngược); binary không content → resolver; fail/no-tool → marker UNCONVERTIBLE, không index rác
  - `dispatch` async; MemoryModule await + wire resolver qua registry; `index.ts` truyền registry; sửa test dispatcher sang async
  - _Requirements: R4, R5, R6, NFR-1, NFR-3_

- [x] 6. Client hiển thị log un-convertible
  - `IndexerHttpClient.ingestDocuments` + `parseUnconvertible` đọc marker, trả `unconvertible[]`; `IndexingService` log vào Output Channel
  - _Requirements: R1, NFR-5_

- [ ] 7. Client cutover: gỡ hẳn conversion client-side
  - Loại `RemoteConverter`/`LocalFallbackConverter` khỏi luồng ingest; client chỉ gửi file gốc
  - Chờ quyết định Binary Upload (A path vs B base64) — cần verify runtime workspace client-server
  - _Requirements: R1, R2_

- [ ] 8. Binary Upload contract + response schema có cấu trúc
  - Chọn A/B; đổi request/response `/api/v1/memory/ingest-file` sang `{ingested, unconvertible, summary}`; path traversal guard + size cap
  - _Requirements: R1, NFR-3_

- [ ] 9. Integration + PBT tests
  - Integration endpoint trả unconvertible; KB không rác; PBT invariants (tổng số, reason enum, no-garbage, no-utf8-binary)
  - _Requirements: R4, R6, NFR-1, NFR-3_

- [ ] 10. Wiring child convert server (khi có) + tài liệu
  - Cấu hình child MCP server cung cấp tool convert; `CONVERT_TIMEOUT_MS` cấu hình; binary tự động convert server-side khi có tool
  - _Requirements: R2, NFR-2, NFR-4_

## Notes

- Chưa có child convert server → file nhị phân KHÔNG có content = un-convertible (no-tool) theo đúng thiết kế.
- docx/xls do client convert (filetomarkdown) vẫn ingest được nhờ nhánh tương thích ngược ở task 5.
- Tasks 7-8 cần chạy cả client + server để verify, nên để lại cho phiên tương tác.
