# Software Test Plan (STP) — SA4E-240

| Field | Value |
|-------|-------|
| Ticket | SA4E-240 |
| Title | Pega Rule Catalog Export — nguồn load rule nhanh cho index Pega vào KB |
| Pattern | Plugin / Extension (Vitest) |
| Related | BRD.md v1, FSD.md v1, TDD.md v1 |
| Version | 1 |

---

## 1. Test Objectives

Xác minh fast-path catalog export index đúng, đầy đủ (~17,979 rule), và **fallback an toàn** khi lỗi. Trọng tâm plugin: lifecycle command, fallback path, compatibility, download đặc thù (base64/x-file-size/206).

## 2. Test Strategy & Levels

| Level | Mã | Phạm vi | Công cụ |
|-------|-----|---------|---------|
| PBT (Property-based) | PBT | splitCsvLine RFC-4180 với input ngẫu nhiên | Vitest |
| UT (Unit) | UT | Từng hàm: parser, downloader helpers, models adapter, client status parse | Vitest + mock fetch |
| IT (Integration) | IT | Client ↔ mock Pega server (nock/msw hoặc fetch stub); downloader end-to-end với ZIP thật | Vitest |
| E2E-API | E2E-API | run() fast-path với mock server trả CSV thật → verify CrawlPlanItem count | Vitest |
| E2E-UI | E2E-UI | Toggle setting trong VS Code (manual/scripted) | Manual/VS Code |
| SIT | SIT | Chạy thật với Pega sandbox (visual verify KB có rule) | Manual |

## 3. Scope

### In Scope
- 5 service mới + integration IndexingService fast-path/fallback.
- Download base64 + x-file-size + 206 handling.
- CSV parse (RFC-4180, skip invalid rows).
- Fallback trigger (FAILED, 0 rule, exception, setting=false).

### Out of Scope
- PegaBfsIndexer/PegaStreamIngester internals (đã test riêng, reuse).
- Backend ingest/KB.

## 4. Test Environment

- Node + Vitest, mock `fetch` (global) cho API.
- ZIP thật tạo bằng `zlib.deflateRawSync` để test downloader/parser.
- Không gọi Pega server thật trong CI (chỉ SIT manual).

## 5. Requirements Traceability Matrix (RTM)

| Req (AC/BR) | Test Cases | Level |
|-------------|-----------|-------|
| AC1.1 fast-path default | TC-INT-01, TC-E2E-01 | IT/E2E |
| AC1.3 all rules queued | TC-E2E-01 | E2E-API |
| AC2.1 fallback on FAILED | TC-INT-02 | IT |
| AC2.2 fallback on 0 rule | TC-UT-08, TC-INT-03 | UT/IT |
| AC2.3 setting=false skip | TC-INT-04 | IT |
| AC3.1 x-file-size | TC-UT-04 | UT |
| AC3.2 decode base64 + verify | TC-UT-05 | UT |
| AC3.3 magic ZIP | TC-UT-06 | UT |
| AC3.4 HTTP 206 | TC-UT-04 | UT |
| AC3.5 unzip CSV | TC-INT-05 | IT |
| AC4.1 skip invalid row | TC-UT-01 | UT |
| AC4.2 RFC-4180 | TC-PBT-01, TC-UT-02 | PBT/UT |
| AC4.3 row→CrawlPlanItem | TC-UT-03 | UT |
| AC4.4 stream parse | TC-INT-06 | IT |
| BR-06 poll ceiling | TC-UT-07 | UT |
| BR-07 size mismatch throw | TC-UT-05b | UT |
| SD-01 path traversal (sec) | TC-UT-09 | UT |

RTM coverage: 100% AC + key BR + security finding.

## 6. Entry / Exit Criteria

**Entry:** Code build sạch (tsc), TDD approved.
**Exit:** Tất cả UT/IT/E2E-API pass; fallback verified; SD-01 fix + test pass.

## 7. Risks

| Risk | Mitigation |
|------|------------|
| Mock ZIP không giống server thật | Dùng zlib tạo ZIP hợp lệ + magic bytes |
| Fallback khó test | Inject client ném lỗi/trả null |

---

## 8. Appendix

### Diagram Index

| # | Diagram | Image | Source |
|---|---------|-------|--------|
| 1 | Test Coverage | [test-coverage.png](diagrams/test-coverage.png) | [test-coverage.drawio](diagrams/test-coverage.drawio) |
| 2 | Test Execution Flow | [test-execution-flow.png](diagrams/test-execution-flow.png) | [test-execution-flow.drawio](diagrams/test-execution-flow.drawio) |
