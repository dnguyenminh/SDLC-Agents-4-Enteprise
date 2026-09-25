# Functional Specification Document (FSD) — SA4E-240

| Field | Value |
|-------|-------|
| Ticket | SA4E-240 |
| Title | Pega Rule Catalog Export — nguồn load rule nhanh cho index Pega vào KB |
| Architecture Pattern | Plugin / Extension (VS Code / Kiro) |
| Related BRD | BRD.md (v1) |
| Version | 1 |
| Status | Draft |

---

## 1. Introduction

### 1.1 Purpose
Đặc tả chức năng cho fast-path index Pega dùng Rule Catalog Export API, thay thế BFS crawl chậm bằng nguồn catalog CSV toàn diện, tái dùng pipeline ingest hiện có.

### 1.2 Scope
Extension `extension/` (TypeScript). Thêm 5 service mới + sửa `IndexingService` + thêm 1 setting. Không đổi backend/KB.

### 1.3 Glossary (Domain Terms)

| Term | Definition | Avoid |
|------|------------|-------|
| Rule Catalog Export | API Pega CodeIntelligence trả toàn bộ danh mục rule dưới dạng CSV (metadata). | dump, snapshot |
| Catalog CSV (rulecatalog.csv) | File 16 cột, mỗi rule 1 dòng (pzInsKey, pxObjClass, pyClassName, pyRuleSet, ...). | export file |
| CrawlPlanItem | Đơn vị công việc trong queue fetch+ingest hiện có. | task, job |
| Fast-path | Đường index qua catalog export (mặc định bật). | shortcut |
| Fallback (BFS crawl) | Đường index cũ qua RuleSet enumeration + discovery, dùng khi fast-path lỗi. | backup, legacy |
| Resumable Download | Endpoint tải file theo Range, trả base64, size ở x-file-size, HTTP 206. | chunked download |
| jobId | Định danh (UUID) job export, dùng cho poll status + result. | taskId |

## 2. Plugin Lifecycle Context

Fast-path được kích hoạt trong lifecycle lệnh index của extension:

```
Extension activate → command "Index Project" → IndexingService.runProjectIndexer()
  → detect Pega project → runPegaProjectIndexer()
     → [useCatalogExport=true] PegaCatalogIndexer.run()   (fast-path)
     → [lỗi/false/0 rule] PegaProjectIndexer.run()         (fallback BFS)
```

Không có hook install/uninstall riêng; setting `kiroSdlc.pega.useCatalogExport` đọc runtime qua `vscode.workspace.getConfiguration`.

## 3. Use Cases

### UC-01 — Index Pega bằng Catalog Export (fast-path)

| Field | Detail |
|-------|--------|
| Actor | Developer |
| Precondition | Là Pega project, credentials có trong SecretStorage, `useCatalogExport=true` |
| Trigger | Developer chạy lệnh Index |

**Main Flow:**
1. `IndexingService.runPegaProjectIndexer` đọc setting `useCatalogExport` (default true).
2. Khởi tạo `PegaCatalogIndexer.run(root, report, secrets)`.
3. `PegaRuleCatalogClient.startExport()` → GET `/file/rulecatalog/export` → nhận `jobId` (HTTP 200).
4. `pollStatus(jobId)` → GET `.../status` lặp 12s tới `DONE`.
5. `getResultFileName(jobId)` → GET `.../result` → tên file zip.
6. `downloadCatalog(fileName, destDir)` → tải + decode base64 + unzip → `rulecatalog.csv`.
7. `parseCatalogCsv(csvPath)` → `CrawlPlanItem[]`.
8. Resolve appName + projectId (sha256("pega:"+appName)[:12]).
9. `PegaBfsIndexer.run(projectId, items, dedupSet, report, root)` → fetch + ingest.
10. Trả summary `{appName, catalogRules, totalIngested}`.

**Alternative Flow A1 (job RUNNING lâu):** poll tiếp tới ceiling 50 lần (10 phút).

**Exception Flow E1 (job FAILED):** ném lỗi → caller catch → fallback BFS crawl (UC-05).
**Exception Flow E2 (0 rule parse được):** `run()` trả `null` → fallback BFS crawl.
**Exception Flow E3 (lỗi mạng/HTTP):** ném lỗi → caller catch → fallback.

**Postcondition:** ~17,979 rule được đưa vào pipeline ingest → KB.

### UC-02 — Tải + giải nén catalog CSV

| Field | Detail |
|-------|--------|
| Actor | Extension (PegaCatalogDownloader) |
| Precondition | Có fileName từ UC-01 bước 5 |

**Main Flow:**
1. GET `/file/resumableDownload/{fileName}` với `Range: bytes=0-1048575`.
2. Đọc `x-file-size` header → `totalBytes` (kích thước ZIP thật).
3. Nối base64 các chunk cho tới khi `floor(base64Len*3/4) >= totalBytes` hoặc chunk cuối < CHUNK_BYTES.
4. `Buffer.from(base64, "base64")` → verify `length === totalBytes`.
5. Verify magic `PK\x03\x04`.
6. Ghi `rulecatalog.zip`, giải nén entry đầu (inflateRaw nếu method=8) → `rulecatalog.csv`.

**Exception E1:** size mismatch → ném lỗi.
**Exception E2:** magic bytes sai → ném lỗi "not a valid ZIP".
**Exception E3:** HTTP không 206/200 → ném lỗi.

### UC-03 — Parse CSV thành CrawlPlanItem

| Field | Detail |
|-------|--------|
| Actor | Extension (PegaCatalogCsvParser) |

**Main Flow:**
1. Stream đọc CSV (readline), bỏ dòng header đầu.
2. Với mỗi dòng: `splitCsvLine` (RFC-4180) → lấy cột theo `CATALOG_COLUMNS`.
3. Nếu thiếu `pzInsKey`/`pxObjClass` → skip (đếm skipped).
4. `catalogRowToSummary` → `summaryToCrawlItem` → push vào items.
5. Trả `{items, totalRows, skippedRows}`.

### UC-04 — Ingest rule vào KB (reuse pipeline)

| Field | Detail |
|-------|--------|
| Actor | Extension (PegaBfsIndexer) |

**Main Flow:** `PegaBfsIndexer.run` fetch nội dung rule (PegaCrawlHelper) + phát hiện relative + đẩy vào `PegaStreamIngester` → backend ingest → KB. Dedup qua DiskBackedSet.

### UC-05 — Fallback BFS crawl khi export lỗi

**Main Flow:**
1. Fast-path `run()` trả `null` HOẶC ném lỗi (đã catch).
2. Log cảnh báo "falling back to BFS crawl".
3. `PegaProjectIndexer.run(root, report, secrets)` chạy như cũ.

### UC-06 — Cấu hình opt-out

**Main Flow:** Developer đặt `kiroSdlc.pega.useCatalogExport = false` → fast-path bị bỏ qua, dùng BFS crawl trực tiếp.

## 4. Business Rules

| ID | Rule | Enforced in |
|----|------|-------------|
| BR-01 | Fast-path mặc định bật, opt-out qua setting | IndexingService.runPegaProjectIndexer |
| BR-02 | Mọi request kèm Basic auth | PegaRuleCatalogClient (getAuthHeader) |
| BR-03 | Size lấy từ x-file-size, không content-range | PegaCatalogDownloader.fetchAllChunks |
| BR-04 | Decode base64 trước khi coi là ZIP | PegaCatalogDownloader |
| BR-05 | Chỉ row đủ pzInsKey+pxObjClass mới vào queue | PegaCatalogCsvParser.rowFromLine |
| BR-06 | Poll ceiling 50×12s (10 phút) | PegaRuleCatalogClient.pollStatus |
| BR-07 | Verify decoded size = x-file-size + magic ZIP | PegaCatalogDownloader |
| BR-08 | MAX_CHUNKS=5000 guard chống loop | PegaCatalogDownloader (CWE-400) |

## 5. Data Specifications

### 5.1 rulecatalog.csv (16 cột)

| Idx | Column | Dùng |
|-----|--------|------|
| 0 | pzInsKey | ✅ required (insKey để fetch) |
| 1 | pxObjClass | ✅ required (rule class) |
| 2 | pyClassName | ✅ applies-to |
| 3 | pyRuleSet | ✅ ruleset |
| 4 | pyRuleSetVersion | ✅ version |
| 5–13 | pyRuleAvailable, pyBaseRule, pyCircumstance* | (bỏ qua) |
| 14 | pyLabel | ✅ derive pyRuleName (best-effort) |
| 15 | pxCreateDateTime | (bỏ qua) |

### 5.2 RuleCatalogRow → RuleSetRuleSummary → CrawlPlanItem
- `catalogRowToSummary(row)`: map trực tiếp; `pyRuleName = pyLabel || ""` (crawl fetch theo insKey khi pyRuleName rỗng).
- `summaryToCrawlItem(summary)`: hàm hiện có (models), tái dùng nguyên trạng.

## 6. API Specifications (Pega CodeIntelligence/v1)

Base: `{pegaEndpoint}/api/CodeIntelligence/v1`. Auth: HTTP Basic.

| # | Method | Path | Request | Response |
|---|--------|------|---------|----------|
| 1 | GET | `/file/rulecatalog/export` | Accept: text/plain | 200, body = jobId (UUID) |
| 2 | GET | `/file/rulecatalog/export/{jobId}/status` | — | 200, body = QUEUED\|RUNNING\|DONE\|FAILED |
| 3 | GET | `/file/rulecatalog/export/{jobId}/result` | — | 200, body = fileName (zip) hoặc "not completed..." |
| 4 | GET | `/file/resumableDownload/{fileName}` | Range: bytes=start-end | 206, body = base64; header `x-file-size` = tổng bytes |

## 7. Error Handling

| Error | Xử lý | User-facing |
|-------|-------|-------------|
| Enqueue HTTP != 200 | throw → fallback | Log warn + fallback BFS |
| jobId rỗng | throw | Log + fallback |
| status FAILED | throw (kèm gợi ý rulecatalog_log.zip) | Log + fallback |
| Poll timeout (>10 phút) | throw | Log + fallback |
| Download size mismatch | throw | Log + fallback |
| ZIP magic sai | throw | Log + fallback |
| 0 rule parse | return null | Log + fallback |

Nguyên tắc: mọi lỗi fast-path đều được caller catch và **fallback**, không mất chức năng (BR-01, NFR-04).

## 8. Non-Functional Requirements

| ID | NFR | Target |
|----|-----|--------|
| NFR-01 | Discovery time | ~1–3 phút (job export) |
| NFR-03 | Memory | Stream parse CSV |
| NFR-04 | Reliability | Fallback 100% |
| NFR-05 | Security | SecretStorage, no hardcoded secrets |
| NFR-06 | Loop guard | MAX_CHUNKS=5000, MAX_POLL=50 |

## 9. Open Issues

| # | Issue | Trạng thái |
|---|-------|-----------|
| OI-1 | pyRuleName không có trong catalog → derive từ pyLabel | Chấp nhận: crawl fetch theo insKey khi rỗng |
| OI-2 | ZIP streamed compSize=0 | Xử lý: dò central-dir marker |

---

## 10. Appendix

### Diagram Index

| # | Diagram | Image | Source (editable) |
|---|---------|-------|-------------------|
| 1 | System Context | [system-context.png](diagrams/system-context.png) | [system-context.drawio](diagrams/system-context.drawio) |
| 2 | Sequence — Catalog Export Flow | [sequence-catalog.png](diagrams/sequence-catalog.png) | [sequence-catalog.drawio](diagrams/sequence-catalog.drawio) |
| 3 | State — Export Job Lifecycle | [state-export.png](diagrams/state-export.png) | [state-export.drawio](diagrams/state-export.drawio) |

### Related Documents
| Document | Reference |
|----------|-----------|
| BRD | BRD.md (v1) |
| API Usage | documents/API-USAGE.md |
| TDD | TDD.md (Phase 3) |
