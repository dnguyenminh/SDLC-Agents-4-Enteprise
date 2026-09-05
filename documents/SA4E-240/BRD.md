# Business Requirements Document (BRD) — SA4E-240

| Field | Value |
|-------|-------|
| Ticket | SA4E-240 |
| Title | Pega Rule Catalog Export — nguồn load rule nhanh cho index Pega vào KB |
| Type | Story |
| Architecture Pattern | Plugin / Extension (VS Code / Kiro extension) |
| Author | SM (acting) |
| Version | 1 |
| Status | Draft |

---

## 1. Executive Summary

Extension Kiro index mã nguồn Pega bằng cách **crawl từng rule qua REST** (BFS discovery + RuleSet enumeration). Với ứng dụng Pega lớn (~17,979 rule) cách này **chậm, mong manh, và dễ sót rule**. Tài liệu này mô tả yêu cầu nghiệp vụ cho giải pháp **Pega Rule Catalog Export**: dùng API Rule Catalog Export của Pega để lấy toàn bộ danh sách rule một lần dưới dạng CSV, sau đó tái dùng pipeline fetch+ingest hiện có để đưa vào Knowledge Base (KB).

Giải pháp là một **fast-path** (bật mặc định) có **fallback** an toàn về cơ chế BFS crawl cũ — không làm mất chức năng nếu API export không khả dụng.

## 2. Business Context & Problem Statement

### 2.1 Vấn đề hiện tại

| # | Vấn đề | Tác động |
|---|--------|----------|
| P1 | BFS crawl từng rule qua REST — nhiều round-trip | Index chậm (nhiều giờ với app lớn) |
| P2 | Discovery dựa trên enumeration RuleSet + relative traversal | Mong manh, phụ thuộc thứ tự khám phá |
| P3 | Dễ sót rule khi graph rule phức tạp | KB không đầy đủ → kết quả tìm kiếm/AI thiếu chính xác |
| P4 | Không có "nguồn chân lý" duy nhất về tập rule | Khó verify độ phủ index |

### 2.2 Cơ hội

Pega cung cấp **CodeIntelligence Rule Catalog Export API** trả về **toàn bộ** danh mục rule (metadata) trong một file CSV. Dùng nguồn này làm "authoritative list" → loại bỏ discovery mong manh, đảm bảo độ phủ, và giảm số round-trip khám phá.

## 3. Business Goals & Success Metrics

| Goal | Metric | Target |
|------|--------|--------|
| Tăng tốc index Pega | Thời gian discovery tập rule | Từ hàng giờ → dưới ~3 phút (thời gian job export) |
| Đảm bảo độ phủ | Tỷ lệ rule được đưa vào queue index | 100% rule trong catalog (~17,979) |
| Không suy giảm độ tin cậy | Fallback tự động khi export lỗi | 100% (không mất chức năng cũ) |
| Không thay đổi downstream | Pipeline ingest → KB giữ nguyên | Tái dùng PegaBfsIndexer/PegaStreamIngester |

## 4. Stakeholders

| Vai trò | Quan tâm |
|---------|----------|
| Developer dùng extension | Index nhanh, đầy đủ, đáng tin |
| AI Agents (đọc KB) | Dữ liệu rule đầy đủ để trả lời chính xác |
| Pega Platform (host) | API CodeIntelligence được gọi đúng chuẩn, auth Basic |
| Maintainer extension | Fallback an toàn, cấu hình opt-out |

## 5. Host System Constraints (Plugin Pattern)

Vì đây là **extension** chạy trong host (VS Code/Kiro) và giao tiếp với host Pega, các ràng buộc:

| # | Ràng buộc | Mô tả |
|---|-----------|-------|
| HC1 | Host API giới hạn | Chỉ dùng REST API CodeIntelligence/v1 Pega cung cấp |
| HC2 | Auth | HTTP Basic auth, credentials lưu trong VS Code SecretStorage |
| HC3 | Lifecycle | Chạy trong lệnh index của extension (activate → command) |
| HC4 | Cấu hình | Setting `kiroSdlc.pega.useCatalogExport` (default true) trong package.json contributes |
| HC5 | Non-binary transfer | Download endpoint trả BASE64, kích thước thật ở header `x-file-size`, HTTP 206 |
| HC6 | Không phá pipeline | Phải tái dùng PegaBfsIndexer → PegaStreamIngester → backend ingest → KB |

## 6. User Stories

### STORY-1 — Index nhanh bằng catalog export
**As a** developer dùng extension Kiro
**I want** index Pega dùng Rule Catalog Export mặc định
**So that** toàn bộ rule được index nhanh và đầy đủ vào KB

**Acceptance Criteria:**
- AC1.1: Khi setting `kiroSdlc.pega.useCatalogExport = true` (mặc định), lệnh index chạy fast-path catalog.
- AC1.2: Fast-path thực hiện đủ 4-bước API (export → poll → result → download) và parse CSV.
- AC1.3: Toàn bộ rule trong catalog (~17,979) được đưa vào queue fetch+ingest.
- AC1.4: Kết quả báo cáo số rule trong catalog và số đã ingest.

### STORY-2 — Fallback an toàn khi export lỗi
**As a** maintainer extension
**I want** hệ thống tự fallback về BFS crawl khi catalog export không khả dụng/lỗi
**So that** chức năng index không bao giờ bị mất

**Acceptance Criteria:**
- AC2.1: Nếu catalog job trả FAILED, hoặc lỗi mạng/HTTP, hệ thống log cảnh báo và chạy BFS crawl cũ.
- AC2.2: Nếu catalog parse ra 0 rule, hệ thống fallback về BFS crawl.
- AC2.3: Nếu setting `useCatalogExport = false`, hệ thống bỏ qua fast-path, dùng BFS crawl.
- AC2.4: Fallback không yêu cầu can thiệp thủ công.

### STORY-3 — Tải file catalog đúng chuẩn Pega
**As a** extension
**I want** tải file catalog theo đúng cơ chế resumable download đặc thù của Pega
**So that** file ZIP toàn vẹn và giải nén được CSV

**Acceptance Criteria:**
- AC3.1: Đọc tổng kích thước từ header `x-file-size` (không phải `content-range`).
- AC3.2: Decode BASE64 trước khi ghi ZIP; verify kích thước decode = `x-file-size`.
- AC3.3: Kiểm tra magic bytes ZIP `PK\x03\x04` sau decode.
- AC3.4: Chấp nhận HTTP 206 (Partial Content) cho các chunk Range.
- AC3.5: Giải nén được `rulecatalog.csv` (16 cột) từ ZIP.

### STORY-4 — Parse catalog thành crawl items
**As a** extension
**I want** parse CSV 16 cột thành CrawlPlanItem tái dùng pipeline hiện có
**So that** không phải viết lại logic ingest

**Acceptance Criteria:**
- AC4.1: Bỏ qua dòng header (16 cột), bỏ qua dòng thiếu `pzInsKey`/`pxObjClass`.
- AC4.2: Parse tuân RFC-4180 (xử lý field có dấu phẩy trong ngoặc kép).
- AC4.3: Mỗi row → RuleSetRuleSummary → CrawlPlanItem đưa vào PegaBfsIndexer.
- AC4.4: Stream-parse (memory-safe) cho file lớn.

## 7. Business Rules

| ID | Rule |
|----|------|
| BR-01 | Fast-path catalog export là mặc định (opt-out qua setting), fallback BFS crawl luôn sẵn sàng. |
| BR-02 | Mọi request tới Pega CodeIntelligence API PHẢI kèm HTTP Basic auth. |
| BR-03 | Kích thước file catalog thật lấy từ header `x-file-size`, KHÔNG từ `content-range`. |
| BR-04 | Nội dung download là base64 — PHẢI decode trước khi coi là ZIP. |
| BR-05 | Chỉ rule có đủ `pzInsKey` và `pxObjClass` mới được đưa vào queue index. |
| BR-06 | Poll status tối đa ~10 phút (50 lần × 12s); quá hạn → lỗi → fallback. |

## 8. Scope

### 8.1 In Scope
- 4-bước API client (`PegaRuleCatalogClient`).
- Resumable base64 download + unzip (`PegaCatalogDownloader`).
- CSV parser 16 cột (`PegaCatalogCsvParser`).
- Orchestrator tái dùng BFS (`PegaCatalogIndexer`).
- Fast-path + fallback trong `IndexingService.runPegaProjectIndexer`.
- Setting `kiroSdlc.pega.useCatalogExport`.

### 8.2 Out of Scope
- Thay đổi pipeline ingest backend/KB.
- Thay đổi cơ chế fetch nội dung rule (PegaCrawlHelper) — tái dùng nguyên trạng.
- UI mới (chỉ thêm 1 setting boolean).

## 9. Dependencies

| Dependency | Mô tả |
|-----------|-------|
| Pega CodeIntelligence/v1 API | Endpoint export/status/result/resumableDownload |
| PegaHttpClient | Cung cấp endpoint + auth header |
| PegaBfsIndexer / PegaCrawlHelper / PegaStreamIngester | Pipeline fetch + ingest hiện có |
| DiskBackedSet | Dedup set cho crawl |
| Backend ingest → KB | Đích cuối của dữ liệu |
| documents/API-USAGE.md | Tài liệu tham chiếu chi tiết 4-bước API |

## 10. Non-Functional Requirements

| ID | NFR | Target |
|----|-----|--------|
| NFR-01 (Performance) | Thời gian discovery tập rule | ≈ thời gian job export (~1–3 phút) thay vì nhiều giờ |
| NFR-02 (Startup impact) | Fast-path chỉ chạy khi lệnh index được gọi | Không ảnh hưởng activation extension |
| NFR-03 (Memory) | Parse CSV stream-based | Không load toàn bộ file vào RAM |
| NFR-04 (Reliability) | Fallback tự động | 100% khi fast-path lỗi |
| NFR-05 (Security) | Không hardcode secrets | Credentials từ SecretStorage; base URL từ config |
| NFR-06 (Safety) | Guard chống loop vô hạn | MAX_CHUNKS=5000, MAX_POLL_ATTEMPTS=50 |

## 11. Risks & Assumptions

| # | Risk/Assumption | Mitigation |
|---|-----------------|------------|
| R1 | API export có thể chậm/timeout | Poll ceiling + fallback BFS |
| R2 | Format CSV thay đổi (số/thứ tự cột) | Parser dùng chỉ số cột cố định; nếu thiếu field → skip row |
| R3 | ZIP streamed (compSize=0) | Reader dò central-dir marker để bound |
| A1 | Server luôn trả base64 + x-file-size | Đã kiểm chứng thực tế (API-USAGE.md) |

---

## 12. Appendix

### Diagram Index

| # | Diagram | Image | Source (editable) |
|---|---------|-------|-------------------|
| 1 | Business Flow — Catalog Export Indexing | [business-flow.png](diagrams/business-flow.png) | [business-flow.drawio](diagrams/business-flow.drawio) |
| 2 | Use Case Diagram | [use-case.png](diagrams/use-case.png) | [use-case.drawio](diagrams/use-case.drawio) |

### Related Documents

| Document | Reference |
|----------|-----------|
| API Usage Guide | documents/API-USAGE.md |
| FSD | FSD.md (Phase 2) |
| TDD | TDD.md (Phase 3) |
