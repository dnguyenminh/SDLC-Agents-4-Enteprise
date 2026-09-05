# Technical Design Document (TDD) — SA4E-240

| Field | Value |
|-------|-------|
| Ticket | SA4E-240 |
| Title | Pega Rule Catalog Export — nguồn load rule nhanh cho index Pega vào KB |
| Architecture Pattern | Plugin / Extension (VS Code / Kiro), TypeScript |
| Related FSD | FSD.md (v1) |
| Version | 1 |
| Status | Draft |

---

## 1. Architecture Overview

Giải pháp thêm một **fast-path** vào luồng index Pega của extension. Fast-path dùng Rule Catalog Export API lấy toàn bộ danh sách rule (CSV) rồi **tái dùng** pipeline fetch+ingest hiện có. Nếu fast-path không khả dụng/lỗi → **fallback** BFS crawl (không đổi).

### 1.1 Design Principles (Plugin pattern)
- **Host API abstraction**: mọi truy cập Pega qua `PegaHttpClient` (endpoint + Basic auth) — không hardcode URL/secret.
- **Facade**: `PegaCatalogIndexer` ẩn chuỗi export→download→parse→ingest.
- **Reuse over rewrite**: `PegaBfsIndexer`/`PegaCrawlHelper`/`PegaStreamIngester` giữ nguyên (no-workaround: không tạo pipeline song song).
- **Graceful degradation**: mọi lỗi fast-path → fallback, không mất chức năng.
- **SRP + file ≤200 dòng, hàm ≤20 dòng**: mỗi service một trách nhiệm.

### 1.2 Component Responsibilities

| Component | Trách nhiệm | LOC (thực tế) |
|-----------|-------------|-----|
| PegaCatalogModels.ts | Types: ExportStatus, CATALOG_COLUMNS, RuleCatalogRow, catalogRowToSummary | ~60 |
| PegaRuleCatalogClient.ts | 4-step API (start/poll/result/download) | ~95 |
| PegaCatalogDownloader.ts | Resumable base64 download + verify + unzip | ~130 |
| PegaCatalogCsvParser.ts | Stream parse CSV (RFC-4180) → CrawlPlanItem[] | ~95 |
| PegaCatalogIndexer.ts | Facade orchestrator, reuse PegaBfsIndexer | ~90 |
| IndexingService.ts (mod) | fast-path + fallback trong runPegaProjectIndexer | +~25 |

## 2. Module Design

### 2.1 PegaRuleCatalogClient (Host API facade)
```
class PegaRuleCatalogClient {
  constructor(pegaClient: PegaHttpClient, log: LogFn)
  baseUrl(): string                     // {endpoint}/api/CodeIntelligence/v1
  startExport(): Promise<string>        // step1 → jobId
  pollStatus(jobId): Promise<void>      // step2 → loop 12s, ceiling 50
  getResultFileName(jobId): Promise<string> // step3
  downloadCatalog(fileName, destDir): Promise<string> // step4 → csvPath
}
```
Constants: `POLL_INTERVAL_MS=12_000`, `MAX_POLL_ATTEMPTS=50`.

### 2.2 PegaCatalogDownloader (pure functions)
```
downloadCatalogCsv(url, auth, destDir, log): Promise<{csvPath, zipBytes}>
  fetchAllChunks(url, auth, log)        // Range loop, đọc x-file-size
  extractSingleCsv(zipBuf, destDir, log)
  readFirstZipEntry(buf)                // minimal ZIP reader (no ext dep)
```
Constants: `CHUNK_BYTES=1_048_576`, `MAX_CHUNKS=5_000` (CWE-400 guard).

Verify: `zipBuf.length === x-file-size` + magic `PK\x03\x04`.

### 2.3 PegaCatalogCsvParser
```
parseCatalogCsv(csvPath, log): Promise<{items, totalRows, skippedRows}>
  rowFromLine(line)     // skip nếu thiếu pzInsKey/pxObjClass
  splitCsvLine(line)    // RFC-4180 quote handling
```
Stream qua `readline` — memory-safe cho ~18k dòng.

### 2.4 PegaCatalogIndexer (Facade)
```
class PegaCatalogIndexer {
  run(root, report, secrets): Promise<CatalogIndexResult | null>
    // null = không chạy được → caller fallback
    // steps 1–6 + resolveAppName + projectId(sha256)
  resolveAppName(root)  // pega-project.json.applicationName || basename
}
```
projectId = `sha256("pega:"+appName)[:12]` — **cùng cách derive** với `fetchAndSavePegaContext` (single source of truth, no divergence).

### 2.5 IndexingService.runPegaProjectIndexer (integration)
```
useCatalog = config.get("pega.useCatalogExport", true)
if (useCatalog && secrets) {
  try {
    result = await new PegaCatalogIndexer(...).run(root, report, secrets)
    if (result) return `🏛️ Pega (catalog): ... ingested ${result.totalIngested}`
    // result==null → log + fall through
  } catch (err) { log warn + fall through }
}
// fallback: PegaProjectIndexer(...).run(...)  [BFS crawl]
```

## 3. API Design (consumed)

Xem FSD §6. Client tuân thủ: Basic auth header mọi request; xử lý HTTP 200 (enqueue), text status, 206 (download).

## 4. Data Flow

```
export → jobId → poll(DONE) → result(fileName) → download(base64→zip→csv)
→ parse(csv→CrawlPlanItem[]) → PegaBfsIndexer.run → PegaStreamIngester → backend → KB
```

## 5. Design Patterns Applied

| Pattern | Nơi dùng |
|---------|----------|
| Facade | PegaCatalogIndexer (ẩn chuỗi phức tạp) |
| Adapter | catalogRowToSummary / summaryToCrawlItem (CSV → pipeline shape) |
| Strategy (implicit) | fast-path vs fallback chọn tại runtime theo setting/kết quả |
| Dependency Injection | PegaHttpClient, IndexerHttpClient inject vào services |

## 6. Integration / External Systems

| System | Tương tác |
|--------|-----------|
| Pega CodeIntelligence API | 4 endpoint (FSD §6), Basic auth qua PegaHttpClient |
| Backend ingest → KB | qua PegaStreamIngester (không đổi) |
| VS Code config | setting `kiroSdlc.pega.useCatalogExport` |
| SecretStorage | Pega credentials |
| Disk | `.pega-cache/rulecatalog/` (zip + csv), DiskBackedSet dedup |

## 7. Error Handling (design)

- Client ném lỗi có ngữ cảnh (HTTP status, jobId, gợi ý rulecatalog_log.zip).
- Downloader verify size + magic → ném lỗi rõ ràng.
- `run()` trả `null` khi 0 rule (không phải ném) → caller phân biệt "không chạy được" vs "lỗi".
- IndexingService bọc try/catch → **luôn fallback**, log cảnh báo (không nuốt lỗi im lặng — báo qua log + fallback).

## 8. Security Design

| Concern | Xử lý |
|---------|-------|
| Credentials | SecretStorage, không hardcode; auth header lấy runtime |
| Base URL | Từ config (PegaHttpClient.getPegaEndpoint), không hardcode |
| DoS/loop | MAX_CHUNKS=5000, MAX_POLL_ATTEMPTS=50 |
| Integrity | Verify decoded size + ZIP magic trước khi unzip |
| Path | destDir dưới workspace `.pega-cache`; tên entry từ ZIP (cần đề phòng path traversal — xem Security Review) |
| Base64 decode | Buffer.from an toàn; kích thước verify chống truncation |

## 9. Implementation Checklist

- [x] PegaCatalogModels.ts (types + adapter)
- [x] PegaRuleCatalogClient.ts (4 API)
- [x] PegaCatalogDownloader.ts (download + unzip)
- [x] PegaCatalogCsvParser.ts (parse)
- [x] PegaCatalogIndexer.ts (facade)
- [x] IndexingService.ts (fast-path + fallback)
- [x] package.json setting
- [x] models/index.ts exports
- [ ] Unit tests (Phase 6)
- [ ] Integration test fallback path (Phase 6)

## 10. Version Compatibility (Plugin)

- Setting mặc định `true` → hành vi mới bật cho mọi user; opt-out an toàn.
- Fallback đảm bảo tương thích ngược 100% khi API export vắng mặt (Pega version cũ).
- Không đổi contract downstream (PegaStreamIngester/KB) → không breaking.

---

## 11. Appendix

### Diagram Index

| # | Diagram | Image | Source (editable) |
|---|---------|-------|-------------------|
| 1 | Architecture | [architecture.png](diagrams/architecture.png) | [architecture.drawio](diagrams/architecture.drawio) |
| 2 | Component | [component.png](diagrams/component.png) | [component.drawio](diagrams/component.drawio) |

### Related Documents
| Document | Reference |
|----------|-----------|
| FSD | FSD.md (v1) |
| BRD | BRD.md (v1) |
| API Usage | documents/API-USAGE.md |
