# Security Code Assessment — SA4E-240

| Field | Value |
|-------|-------|
| Ticket | SA4E-240 |
| Phase | 5.7 — Security Code Review |
| Scope | branch SA4E-240 (commit 7d255f6) — 5 catalog services + IndexingService |
| Reviewer | Security (SM acting) |
| Date | 2025-01-27 |

---

## 1. Scope of Audit

Audit thực tế source code trên branch SA4E-240:
- PegaCatalogModels.ts, PegaRuleCatalogClient.ts, PegaCatalogDownloader.ts, PegaCatalogCsvParser.ts, PegaCatalogIndexer.ts
- IndexingService.ts (fast-path integration)

## 2. OWASP Top 10 Check

| OWASP | Áp dụng? | Kết quả |
|-------|----------|---------|
| A01 Broken Access Control | Read-only export, Basic auth | ✅ N/A rủi ro thấp |
| A02 Cryptographic Failures | Basic auth phụ thuộc HTTPS endpoint | ⚠️ SD-04 (Low) — đảm bảo https |
| A03 Injection | fileName encodeURIComponent; CSV parse thuần | ✅ Không có |
| A04 Insecure Design | Fallback + verify size/magic | ✅ Tốt |
| A05 Security Misconfiguration | Không hardcode secrets/URL | ✅ |
| A06 Vulnerable Components | Chỉ Node built-in, không dep mới | ✅ |
| A07 Auth Failures | Basic auth mỗi request, no session | ✅ |
| A08 Data Integrity Failures | Verify decoded size + ZIP magic | ✅ |
| A09 Logging Failures | Log qua OutputChannel, không log secrets | ✅ |
| A10 SSRF | URL từ config endpoint (không user-controlled path tùy ý) | ✅ |

## 3. Findings

| ID | Severity | File | Mô tả | Trạng thái |
|----|----------|------|-------|-----------|
| SC-01 | Medium → **RESOLVED** | PegaCatalogDownloader.ts `extractSingleCsv` | Zip-Slip / path traversal: `entry.name` từ ZIP dùng trực tiếp làm path. | ✅ **Đã fix**: dùng `path.basename(entry.name)` (commit 7d255f6). Test TC-UT-09 verify không escape destDir. |
| SC-02 | Low | PegaCatalogDownloader.ts `fetchAllChunks` | Base64 nối trong RAM; MAX_CHUNKS=5000 ceiling ~5GB (cao). | Chấp nhận (tech debt): file thực ~500KB. Khuyến nghị siết theo x-file-size ở lần sau. |
| SC-03 | Low | PegaRuleCatalogClient.ts | Basic auth phụ thuộc HTTPS. | Đảm bảo endpoint config https (SD-04). |
| SC-04 | Info | toàn bộ | Không hardcode secret; credentials từ SecretStorage; base URL từ config. | ✅ Pass |

## 4. Verification of Prior Design Findings (Phase 3.7)

| Design finding | Kết quả code |
|----------------|--------------|
| SD-01 (path traversal) | ✅ **Fixed + tested** (SC-01) |
| SD-02 (DoS memory) | ⚠️ Partial — ceiling có, chưa siết theo x-file-size (SC-02, Low, tech debt) |

## 5. Secrets / Credentials
- `getAuthHeader()` runtime từ SecretStorage — grep xác nhận không có literal password/token trong 5 file catalog. ✅

## 6. Dependency Vulnerabilities
- Không thêm dependency (fs/path/zlib/crypto/readline/fetch built-in). Không có CVE mới đưa vào. ✅

## 7. Overall Risk Rating

**LOW** — 0 Critical, 0 High (SC-01 Medium đã resolved). Còn lại Low/Info.

## 8. Verdict

**PASS — proceed to Phase 6 (Testing).**
Tech debt theo dõi: SC-02 (siết download size limit), SC-03 (cảnh báo nếu endpoint không https).

## 9. References
- SECURITY-REVIEW.md (Phase 3.7)
- Commit 7d255f6 (fix SD-01)
- Test TC-UT-09 (PegaCatalogDownloader.test.ts)
