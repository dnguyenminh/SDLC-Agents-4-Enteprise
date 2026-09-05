# Security Design Review — SA4E-240

| Field | Value |
|-------|-------|
| Ticket | SA4E-240 |
| Phase | 3.7 — Security Design Review |
| Reviewed artifact | TDD.md (v1) |
| Reviewer | Security (SM acting) |
| Date | 2025-01-27 |

---

## 1. Scope

Review thiết kế fast-path Pega Rule Catalog Export: 4-step API client, base64 resumable download + unzip, CSV parse, orchestrator. Trọng tâm: auth, data protection, injection, dependency, infra, session.

## 2. Findings Summary

| Severity | Count |
|----------|-------|
| Critical | 0 |
| High | 0 |
| Medium | 2 |
| Low | 2 |
| Info | 2 |

Không có Critical/High → **được phép proceed sang Phase 4** (theo quy trình).

## 3. Findings

| ID | Severity | Category | Mô tả | Khuyến nghị |
|----|----------|----------|-------|-------------|
| SD-01 | Medium | Path Traversal | `extractSingleCsv` dùng `entry.name` từ ZIP làm tên file ghi ra đĩa (`path.join(destDir, entry.name)`). ZIP độc hại có thể chứa entry name kiểu `../../evil.csv`. | Sanitize: dùng `path.basename(entry.name)` hoặc validate không chứa `..`/separator. Ghi cứng tên `rulecatalog.csv`. → chuyển thành yêu cầu DEV (Phase 5.7 verify). |
| SD-02 | Medium | Resource / DoS | Toàn bộ base64 nối vào 1 biến string trong RAM (`base64 += chunkB64`) + `Buffer.from`. File ~500KB OK, nhưng nếu server trả file cực lớn → memory spike. | Có MAX_CHUNKS=5000 (≈5GB ceiling) là quá cao. Cân nhắc giới hạn theo `x-file-size` hợp lý (vd ≤100MB) và stream-decode. |
| SD-03 | Low | Error disclosure | Thông điệp lỗi log `HTTP {status}` + jobId — mức thấp, chỉ log local (OutputChannel). | Chấp nhận; đảm bảo không log credentials/auth header. |
| SD-04 | Low | Transport | API dùng Basic auth — bảo mật phụ thuộc HTTPS của pegaEndpoint. | Đảm bảo endpoint config luôn `https://`; cân nhắc cảnh báo nếu `http://`. |
| SD-05 | Info | Secrets | Credentials từ SecretStorage, auth header lấy runtime, không hardcode. | ✅ Tuân thủ NFR-05. |
| SD-06 | Info | Integrity | Verify decoded size = x-file-size + magic ZIP `PK\x03\x04` trước unzip. | ✅ Tốt — chống truncation/corruption. |

## 4. Category Analysis

### 4.1 Authentication / Authorization
- Basic auth qua `PegaHttpClient.getAuthHeader()` cho mọi request. Không có authz phía extension (chỉ đọc). ✅ Adequate cho read-only export.

### 4.2 Data Protection
- Dữ liệu rule là metadata catalog (không PII). Lưu tạm `.pega-cache/` trong workspace. Khuyến nghị: không commit `.pega-cache/` (thêm .gitignore nếu chưa có) — **Low**.

### 4.3 API Security
- Input duy nhất từ ngoài: response server (jobId, status, fileName, base64). fileName đi vào URL `resumableDownload/{fileName}` — đã `encodeURIComponent`. ✅
- Injection: không có SQL/command; CSV parse thuần chuỗi. ✅

### 4.4 Dependency Risks
- Chỉ dùng Node built-in: `fs`, `path`, `zlib`, `crypto`, `readline`, `fetch`. Không thêm dependency mới → **giảm supply-chain risk**. ✅

### 4.5 Infrastructure / Secrets
- Không secrets trong config/code. base URL từ config. ✅

### 4.6 Injection (SQL/command/LDAP)
- Không có. ✅

### 4.7 Session Management
- Không có session/token lifecycle (mỗi request Basic auth độc lập). ✅

## 5. Verdict

**PASS (proceed to Phase 4).** Không có Critical/High.

**Yêu cầu chuyển cho DEV (theo dõi tại Phase 5.7 Security Code Review):**
- SD-01 (Medium — Path Traversal): sanitize entry.name khi unzip. **PHẢI verify/fix**.
- SD-02 (Medium — DoS): siết giới hạn kích thước download.

## 6. References
- TDD.md §8 (Security Design)
- FSD.md §6, §7
