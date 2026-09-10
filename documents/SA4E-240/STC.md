# Software Test Cases (STC) — SA4E-240

| Field | Value |
|-------|-------|
| Ticket | SA4E-240 |
| Related | STP.md v1 |
| Framework | Vitest |
| Version | 1 |

---

## 1. Unit Tests (UT)

### TC-UT-01 — Parser skip invalid rows
- **Level:** UT | **Target:** `rowFromLine` / `parseCatalogCsv`
- **Precondition:** CSV có 1 header + 3 rows (1 thiếu pzInsKey, 1 thiếu pxObjClass, 1 hợp lệ)
- **Steps:** parseCatalogCsv(csvPath)
- **Expected:** items.length=1, skippedRows=2, totalRows=3

### TC-UT-02 — splitCsvLine RFC-4180 quoted commas
- **Level:** UT | **Target:** `splitCsvLine`
- **Input:** `a,"b,c","d""e",f`
- **Expected:** `["a","b,c","d\"e","f"]`

### TC-UT-03 — catalogRowToSummary → summaryToCrawlItem
- **Level:** UT | **Target:** models adapter
- **Input:** RuleCatalogRow{pzInsKey:"RULE-X A!B", pxObjClass:"Rule-Obj-Activity", pyLabel:"MyRule"}
- **Expected:** summary.pyRuleName="MyRule"; CrawlPlanItem chứa insKey; pyRuleName="" khi pyLabel undefined

### TC-UT-04 — Download reads x-file-size + accepts 206
- **Level:** UT | **Target:** `fetchAllChunks`
- **Precondition:** mock fetch trả 206, header `x-file-size=<N>`, body base64 của ZIP
- **Expected:** totalBytes=N; base64 nối đúng; loop dừng khi decoded ≥ N

### TC-UT-05 — Decode base64 + verify size match
- **Level:** UT | **Target:** `downloadCatalogCsv`
- **Expected:** zipBuf.length === x-file-size → không ném; trả csvPath

### TC-UT-05b — Size mismatch throws (BR-07)
- **Level:** UT
- **Precondition:** x-file-size khác độ dài decode thật
- **Expected:** throw "size mismatch"

### TC-UT-06 — Bad ZIP magic throws
- **Level:** UT
- **Precondition:** base64 decode ra bytes không bắt đầu `50 4B 03 04`
- **Expected:** throw "not a valid ZIP"

### TC-UT-07 — pollStatus ceiling + FAILED (BR-06)
- **Level:** UT | **Target:** `pollStatus`
- **Case A:** status luôn RUNNING → sau 50 lần throw "did not finish"
- **Case B:** status FAILED → throw "FAILED"
- **Case C:** status DONE → return void

### TC-UT-08 — 0 rule → run() returns null
- **Level:** UT | **Target:** `PegaCatalogIndexer.run`
- **Precondition:** parse trả items=[]
- **Expected:** run() trả null (không ném)

### TC-UT-09 — Path traversal sanitized (SD-01, SECURITY)
- **Level:** UT | **Target:** `extractSingleCsv`
- **Precondition:** ZIP entry name = `../../evil.csv`
- **Expected (sau fix SD-01):** file ghi ra dưới destDir với basename an toàn, KHÔNG ghi ngoài destDir

## 2. Property-Based Tests (PBT)

### TC-PBT-01 — splitCsvLine round-trip
- **Level:** PBT | **Target:** `splitCsvLine`
- **Property:** với chuỗi fields ngẫu nhiên (không chứa ký tự điều khiển), join CSV rồi split → bằng fields gốc (escape quote đúng)
- **Iterations:** ≥100

## 3. Integration Tests (IT)

### TC-INT-01 — Fast-path happy path (mock server)
- **Level:** IT | **Target:** `PegaCatalogIndexer.run` + client
- **Precondition:** mock server: export→jobId, status→DONE, result→file.zip, download→base64(ZIP có CSV 3 rule); stub PegaBfsIndexer.run trả {totalIngested:3}
- **Expected:** result={catalogRules:3, totalIngested:3}

### TC-INT-02 — Fallback on job FAILED (AC2.1)
- **Level:** IT | **Target:** IndexingService.runPegaProjectIndexer
- **Precondition:** client.pollStatus ném (FAILED); stub PegaProjectIndexer.run
- **Expected:** log cảnh báo; PegaProjectIndexer.run được gọi (fallback)

### TC-INT-03 — Fallback on 0 rule (AC2.2)
- **Level:** IT
- **Precondition:** run() trả null
- **Expected:** fallback BFS được gọi

### TC-INT-04 — Setting useCatalogExport=false (AC2.3)
- **Level:** IT
- **Precondition:** config.get trả false
- **Expected:** PegaCatalogIndexer KHÔNG được khởi tạo; đi thẳng BFS

### TC-INT-05 — Download+unzip ZIP thật (AC3.5)
- **Level:** IT | **Target:** downloader
- **Precondition:** ZIP tạo bằng zlib.deflateRaw chứa rulecatalog.csv
- **Expected:** csvPath tồn tại, nội dung = CSV gốc

### TC-INT-06 — Stream parse file lớn (AC4.4)
- **Level:** IT
- **Precondition:** CSV 20,000 dòng
- **Expected:** parse xong không OOM; items≈20,000; thời gian hợp lý

## 4. E2E-API Tests

### TC-E2E-01 — Full fast-path với CSV 16 cột thật
- **Level:** E2E-API
- **Precondition:** mock server trả CSV 16 cột (giống format thật, ~50 rule sample)
- **Steps:** IndexingService.runPegaProjectIndexer (useCatalog=true)
- **Expected:** summary chứa "catalog", catalogRules=50, tất cả rule hợp lệ vào queue; header row bị skip

## 5. E2E-UI (Gherkin)

### TC-E2E-UI-01 — Toggle setting
```gherkin
Feature: Catalog export opt-out
  Scenario: Developer tắt catalog export
    Given extension đã cài, Pega project mở
    When developer đặt kiroSdlc.pega.useCatalogExport = false
    And chạy lệnh Index Project
    Then extension dùng BFS crawl (không gọi catalog export API)
```

## 6. SIT (Manual)

### TC-SIT-01 — Chạy thật với Pega sandbox
- **Level:** SIT (manual)
- **Steps:** Cấu hình credentials thật, chạy Index; đợi job export DONE; verify KB có rule
- **Expected:** ~17,979 rule ingested; thời gian discovery ~1–3 phút; log hiển thị "Pega (catalog)"

## 7. Test Data (CSV)

File: `testdata/rulecatalog-sample.csv` — header 16 cột + 5 rows (3 hợp lệ, 1 thiếu pzInsKey, 1 có comma trong quotes).
File: `testdata/rulecatalog-invalid.csv` — chỉ header (0 data row) → test 0-rule fallback.

## 8. Summary

| Level | Count |
|-------|-------|
| UT | 9 |
| PBT | 1 |
| IT | 6 |
| E2E-API | 1 |
| E2E-UI | 1 |
| SIT | 1 |
| **Total** | **19** |
