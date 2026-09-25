# 🔒 Security Code Review (Phase 5.7) — SA4E-241

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-241 |
| Feature | Incremental indexing bằng checksum (Pega rule + code non-Pega + document) |
| Phase | 5.7 — Security Code Review (verify implementation) |
| Branch / Commit | `SA4E-241` @ `9a6fded` (đã push `origin/SA4E-241`) |
| Nguồn audit | `git diff SA4E-240..SA4E-241` + đọc trực tiếp source |
| Kiến trúc | Plugin/Extension (VS Code/Kiro) + Monolith backend (Hono/TypeScript) |
| Đối chiếu | SECURITY-REVIEW.md (Phase 3.7) — SEC-01..SEC-12; TDD.md §8 |
| Assessor | Security Agent |
| Ngày | 2026-05-02 |
| Version | 1.0 |

---

## 1. Executive Summary (Tiếng Việt)

Bản review Phase 5.7 xác minh trên **source code thật** rằng các fix bảo mật đã thiết kế ở Phase 3.7 (SECURITY-REVIEW.md) đã được **triển khai đúng và triệt để**, không chỉ trên giấy tờ. Kết luận verify:

- **SEC-01 (Critical — Broken Access Control / Tenant Isolation): ✅ RESOLVED.** Nhóm route `/api/v1/pega/*` nay được bảo vệ bằng `jwtAuth` (`HttpServer.ts:81`). Endpoint mới `bulk-check`, cùng `discover` và `clear-project`, lấy `projectId` từ **danh tính đã xác thực** (`c.get('projectContext').projectId`), **không** từ body. Fail-closed **401** khi thiếu identity, **403** khi `body.projectId` ≠ identity. Không còn default `'PegaCollProj'`. Fix đúng gốc theo No-Workaround: single source of truth = identity.
- **SEC-02 (High — cross-tenant mutation): ✅ RESOLVED.** Toàn repo production **không còn** mệnh đề `OR project_id = 'PegaCollProj'` và **không còn** default `|| 'PegaCollProj'`. `clear-project` scope mọi DELETE theo `pid` (identity). Có test khẳng định (SEC-02) là SQL không chứa OR-clause + tenant khác không bị xoá.
- **SEC-03 (High — hardcoded credential): ✅ RESOLVED.** Không còn `|| 'SSA@TGB'` / `|| 'pega123!'` trong code production. `fetch-rule` fail-closed `MISSING_AUTH` khi thiếu credential; extension đọc từ VS Code SecretStorage; `resolveDeterministicPegaHierarchy` fail-closed khi thiếu operator id. **`scripts/check-secrets.sh --all` PASS** (1319 file production quét, 0 secret).
- **SEC-04 (Medium — zod validation): ✅ RESOLVED.** `pegaBulkCheckSchema.ts` có schema top-level strict: `projectId` regex `^[A-Za-z0-9_-]+$` max128, `checksums` hex `40|64` min1/max5000, dùng `safeParse` → 400.
- **SEC-07 (checksum in-process): ✅ CONFIRMED.** Cả 3 strategy (`GitBlobChecksumStrategy`, `PegaRuleChecksumStrategy`, `FileContentFallbackStrategy`) tính bằng `crypto.createHash` in-process — **không** shell-out `git hash-object` → không command injection.
- **OWASP Top 10 trên code mới:** SQL parameterized 100% (`ChecksumStore` dùng `IN (placeholders)` + positional params); protocol/API deserialization validate bằng zod safeParse cả 2 phía; logging redact (log `.length` thay vì mảng checksum); không lộ credential.

**Phát hiện mới ở phase này:** không có Critical/High mới. Còn **1 Medium carry-over (SEC-05, defense-in-depth)** và **1 Low (dependency `qs`)** — cả hai **KHÔNG thuộc phạm vi thay đổi của SA4E-241** (SEC-05 nằm trong `PegaCatalogDownloader.ts` thuộc SA4E-240; `qs` là transitive dep có sẵn) và **không chặn Phase 6**.

**Overall Risk Rating:** 🟢 **LOW** (sau khi các Critical/High của Phase 3.7 đã được implement & verify).

### Tổng hợp mức độ (Phase 5.7)

| Severity | Count | Ghi chú |
|----------|-------|---------|
| 🔴 Critical | 0 | SEC-01 đã resolved |
| 🟠 High | 0 | SEC-02, SEC-03 đã resolved |
| 🟡 Medium | 1 | SEC-05 carry-over (SA4E-240 code, defense-in-depth) |
| 🔵 Low | 2 | Dependency `qs`; SEC-07-adjacent `mcp-config-builder.ts` (ngoài scope) |
| ℹ️ Informational | 2 | SEC-11 (rule content transport), SEC-12 (migration spike) |

---

## 2. Verify Status của SEC-01/02/03/04 (bằng chứng cụ thể)

### SEC-01 — Broken Access Control / Tenant Isolation → ✅ RESOLVED

| Yêu cầu (Phase 3.7) | Bằng chứng trên source | Kết luận |
|---------------------|------------------------|----------|
| `/api/v1/pega/*` áp `jwtAuth` | `backend/src/server/HttpServer.ts:81` → `app.use('/api/v1/pega/*', jwtAuth);` (comment "SA4E-241 SEC-01") | ✅ |
| bulk-check: projectId từ identity, KHÔNG từ body | `pega-api.ts` bulk-check: `const identityProjectId = c.get('projectContext')?.projectId ?? '';` → `findExisting(identityProjectId, ...)`. Body chỉ dùng cross-check. | ✅ |
| Fail-closed 401 khi thiếu identity | bulk-check + discover + clear-project: `if (!identityProjectId) return c.json({... 'MISSING_PROJECT_IDENTITY'}, 401)` | ✅ |
| body.projectId ≠ identity → 403 | cả 3 route: `if (parsed.data.projectId && parsed.data.projectId !== identityProjectId) → 403 'PROJECT_MISMATCH'` | ✅ |
| Bỏ default `'PegaCollProj'` | Grep production: **0 match** cho `\|\| '...PegaCollProj'` (fail-closed) | ✅ |
| Rate limit `/pega/*` (SEC-08) | `HttpServer.ts:84` → `app.use('/api/v1/pega/*', rateLimiter);` | ✅ |
| Test coverage | `pega-bulk-check.test.ts`: API-02/SEC-01a (401), API-03/SEC-01b (403), API-04/SEC-01c/SEC-10 (no cross-tenant leak) | ✅ |

### SEC-02 — Cross-tenant write/delete → ✅ RESOLVED

| Yêu cầu | Bằng chứng | Kết luận |
|---------|-----------|----------|
| Bỏ mệnh đề `OR project_id = 'PegaCollProj'` | Grep toàn repo: không còn OR-clause trong DELETE/UPDATE production. Test `SEC-02: clear-project SQL has no hard-coded PegaCollProj OR clause` assert `src.not.toMatch(/OR project_id = 'PegaCollProj'/)` | ✅ |
| Mutation scope theo identity | `clear-project`: 4 lệnh DELETE đều `WHERE project_id = $1` với `[pid]` (identity), không dùng `body.projectId` | ✅ |
| Test isolation ghi/xoá | `SEC-02: mutation scoped to identity only` — tenant `PegaCollProj` còn nguyên khi identity=`OtherProj` clear | ✅ |

### SEC-03 — Hardcoded credential → ✅ RESOLVED

| Yêu cầu | Bằng chứng | Kết luận |
|---------|-----------|----------|
| Xoá default `SSA@TGB`/`pega123!` trong code | Grep `\|\|\s*['\"](SSA@TGB\|pega123)`: **0 match** production. `fetch-rule`: `if (!body.authHeader && !hasBasic) return ... 'MISSING_AUTH' ... 'no default credentials.'` | ✅ |
| Extension đọc SecretStorage | `PegaHttpClient.getAuthHeader()`: `password = await this.secrets.get(SECRET_KEYS.pega)`; `getConfiguredUsername()`/`resolveDeterministicPegaHierarchy` fail-closed khi thiếu `pegaUsername` | ✅ |
| check-secrets gate | **`bash scripts/check-secrets.sh --all` → PASSED** (exit 0, "scanned 1319 in-scope production file(s); no hardcoded secrets found") | ✅ |
| Rotate `pega123!` | ⚠️ Action **vận hành (DevOps)** — nằm ngoài code; cần thực hiện trước production (không chặn Phase 6). | ⏳ Ops |

> Lưu ý: các match `SSA@TGB` còn lại chỉ nằm trong **dữ liệu Pega export** (`rulecatalog.csv`, `Pega/**` rule files — đây là `pxCreateOperator`/`pxUpdateOperator` metadata hợp lệ trong rule, không phải secret app), **test/docs**, và chính `check-secrets.sh` (mô tả pattern). Không có trong code production.

### SEC-04 — Input validation (zod) → ✅ RESOLVED

`backend/src/modules/pega/pegaBulkCheckSchema.ts`:
- `ProjectIdSchema = z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/)`
- `ChecksumSchema = z.string().regex(/^[0-9a-f]{40}$|^[0-9a-f]{64}$/)`
- `BulkCheckRequestSchema`: `checksums: z.array(ChecksumSchema).min(1).max(5000)`, `projectId` optional (chỉ cross-check)
- Route dùng `safeParse` → `VALIDATION_FAILED` 400 khi fail; JSON malformed cũng → 400
- Test: API-06 (projectId xấu→400), API-07 (non-hex→400), API-08 (5000 OK / 5001→400), empty array→400

---

## 3. Findings Table (Phase 5.7)

| ID | Severity | Category (OWASP/CWE) | File:line | Mô tả | Remediation |
|----|----------|----------------------|-----------|-------|-------------|
| **VF-01** | ℹ️ Info (verified fix) | A01 Broken Access Control | `HttpServer.ts:81,84`; `pega-api.ts` bulk-check/discover/clear-project | SEC-01 đã fix: `jwtAuth`+`rateLimiter` cho `/api/v1/pega/*`; projectId=identity; 401/403 fail-closed. | Không cần — verified resolved. |
| **VF-02** | ℹ️ Info (verified fix) | A01 | `pega-api.ts` clear-project | SEC-02: DELETE scope `WHERE project_id = $1` (identity); không còn OR-clause. | Verified resolved. |
| **VF-03** | ℹ️ Info (verified fix) | A02/A07 Secrets | `pega-api.ts` fetch-rule; `PegaHttpClient.ts` | SEC-03: fail-closed `MISSING_AUTH`, SecretStorage, không default credential. | Verified. Còn action ops: rotate `pega123!`. |
| **VF-04** | ℹ️ Info (verified fix) | A03 Injection | `pegaBulkCheckSchema.ts`; `ChecksumStore.ts:53` | SEC-04 zod strict + SQL parameterized (`IN (${placeholders})` positional). | Verified resolved. |
| **VF-05** | ℹ️ Info (verified fix) | A03 OS Command | `checksum/*Strategy.ts` | SEC-07: checksum tính in-process `crypto.createHash`, không shell-out. | Verified resolved. |
| **SEC-05** | 🟡 Medium | A05 / CWE-400 Resource Exhaustion | `extension/src/services/PegaCatalogDownloader.ts:18,115` | Có `MAX_CHUNKS=5000` + verify decoded size == `x-file-size` + magic ZIP, NHƯNG **thiếu** `MAX_TOTAL_SIZE` tuyệt đối và **decompression-ratio / `MAX_UNCOMPRESSED_SIZE` guard** cho `zlib.inflateRawSync`. Server Pega bị compromise/MITM khai `x-file-size` lớn (tới ~5GiB) hoặc deflate ratio cao → OOM client. **Ngoài diff SA4E-241** (thuộc SA4E-240). | Thêm hằng số `MAX_TOTAL_SIZE` (VD 200MB) abort sớm khi `x-file-size` vượt; giới hạn uncompressed size khi inflate (streaming inflate + đếm byte, abort khi vượt ngưỡng/ratio). Defense-in-depth — không chặn Phase 6. |
| **DEP-01** | 🔵 Low | A06 Vulnerable Components / CWE-770,248 | `backend/node_modules/qs` (transitive) | `qs` 2.2.5–6.15.3: (a) array-limit bypass GHSA-x5fp-wj9c-mxmx (CVSS 3.7); (b) DoS via isBuffer GHSA-4mjr-xmp4-gh2g (CVSS 5.3). **Không do SA4E-241 thêm** (package.json chỉ đổi 1 script line, không thêm dep). Fix có sẵn. | `cd backend && npm audit fix` (nâng `qs` ≥ 6.16.0). Tech-debt — không chặn Phase 6. |
| **SEC-07b** | 🔵 Low | A03 OS Command (adjacent) | `extension/src/mcp-config-builder.ts:105` | PowerShell `Expand-Archive` build bằng string interpolation có escape `''` cho path. An toàn với input hiện tại (path nội bộ) nhưng khuyến nghị `execFile` array-args. **Ngoài scope SA4E-241.** | Chuyển sang `execFile`/spawn với args tách rời; không chặn. |
| **SEC-09** | ℹ️ Info (verified) | A09 Logging | `pega-api.ts` bulk-check | Log `{ requested: .length, existing: .length }` — không log mảng checksum/credential. | Verified OK. |
| **SEC-11** | ℹ️ Info | A02 Data Protection | luồng ingest (tái dùng) | Checksum không lộ nội dung (digest). Luồng `ingest` gửi `ruleJson` đầy đủ — cần TLS transport + access control DB. Ngoài scope so-checksum. | Đảm bảo HTTPS cho ingest ở production; không chặn. |
| **SEC-12** | ℹ️ Info | A04 Insecure Design | migration full-re-index | Spike tải 1 lần/project sau deploy; sau SEC-01/02 fix chỉ trong tenant hợp lệ → chấp nhận được. | Cân nhắc throttle lần full re-index đầu. |

---

## 4. OWASP Top 10 (2021) — Code mới SA4E-241

| Category | Kết luận |
|----------|----------|
| A01 Broken Access Control | ✅ SEC-01/02 resolved — identity-bound projectId, 401/403 fail-closed, scope theo identity, no cross-tenant (test SEC-10). |
| A02 Cryptographic Failures | ✅ Checksum sha256/sha1 in-process; SEC-03 credential resolved; ℹ️ SEC-11 ingest cần TLS. |
| A03 Injection | ✅ SQL 100% parameterized (`ChecksumStore`); OS command in-process (SEC-07); zod strict (SEC-04). |
| A04 Insecure Design | ✅ Fail-safe degradation (`StateComparer` → full run khi bulk-check fail, không false-negative — BR-15). ℹ️ SEC-12 migration spike. |
| A05 Security Misconfiguration | ✅ `rateLimiter` áp `/pega/*`; body-limit 100MB global. 🟡 SEC-05 (download size cap) carry-over. |
| A06 Vulnerable Components | 🔵 DEP-01 `qs` moderate (pre-existing, fix available). Không dep mới trong SA4E-241. |
| A07 Auth Failures | ✅ `jwtAuth` cho `/pega/*`; credential fail-closed. |
| A08 Data Integrity | ✅ Response validate zod safeParse cả 2 phía (`BulkCheckResponseSchema`); checksum verify độc lập (Cách B — không tin column). |
| A09 Logging Failures | ✅ SEC-09 redact — log length, không log checksum array/credential. |
| A10 SSRF | ✅ Không có URL do user điều khiển đi vào server-side fetch mới; endpoint Pega từ config/env. |

---

## 5. Kết quả `scripts/check-secrets.sh --all`

```
== hardcoded-secret gate (SA4E-241 / SEC-03) ==
mode=all
PASSED: scanned 1319 in-scope production file(s); no hardcoded secrets found.
=== EXIT: 0 ===
```

✅ Gate PASS — không có `SSA@TGB` / `pega123!` / `|| 'PegaCollProj'` / default-credential fallback trong bất kỳ file production nào.

---

## 6. Dependency Audit

```
cd backend && npm audit --omit=dev
→ 1 moderate (qs 2.2.5–6.15.3): GHSA-x5fp-wj9c-mxmx (CVSS 3.7) + GHSA-4mjr-xmp4-gh2g (CVSS 5.3)
   fixAvailable: true (npm audit fix → qs ≥ 6.16.0)
```

- `git diff SA4E-240..SA4E-241 -- backend/package.json extension/package.json`: chỉ đổi 1 dòng script (`pega:generate` removed), **KHÔNG thêm dependency mới**.
- `qs` là **transitive dep có sẵn** (không do ticket này introduce). Xếp Low tech-debt.

---

## 7. Overall Risk Rating & Verdict

**Overall Risk Rating:** 🟢 **LOW**

| Gate | Kết quả |
|------|---------|
| Critical unresolved | **0** ✅ |
| High unresolved | **0** ✅ |
| SEC-01 (Critical Phase 3.7) | ✅ Verified RESOLVED trên source + test |
| SEC-02 / SEC-03 (High Phase 3.7) | ✅ Verified RESOLVED + check-secrets PASS |
| SEC-04 / SEC-07 | ✅ Verified |

### ✅ VERDICT: PASS — CHO PHÉP SANG PHASE 6 (Testing)

Không còn Critical/High chưa xử lý. Các findings còn lại đều là Medium/Low **defense-in-depth / tech-debt** và **nằm ngoài phạm vi thay đổi của SA4E-241** (code SA4E-240 hoặc transitive dep), do đó **không chặn** Phase 6.

### Điều kiện carry-over (không chặn — theo dõi tech-debt/ops)

1. **DEP-01 (Low):** chạy `cd backend && npm audit fix` để nâng `qs` ≥ 6.16.0 (nên gộp vào lần dọn dep kế tiếp).
2. **SEC-05 (Medium, SA4E-240):** bổ sung `MAX_TOTAL_SIZE` + decompression-ratio guard cho `PegaCatalogDownloader.ts` — tạo ticket tech-debt riêng.
3. **SEC-03 ops:** DevOps rotate `pega123!` trước production (credential đã lộ trong lịch sử repo/docs).
4. **SEC-07b (Low, ngoài scope):** cân nhắc `execFile` array-args cho `mcp-config-builder.ts`.

---

## Appendix — Methodology & Scope

- **Phương pháp:** Static code review (manual) trên `git diff SA4E-240..SA4E-241` @ `9a6fded` + đọc trực tiếp file; grep toàn repo cho pattern secret/cross-tenant; chạy `check-secrets.sh --all` và `npm audit --omit=dev`; đối chiếu SECURITY-REVIEW.md (3.7) + TDD §8.
- **File audit chính:** `HttpServer.ts`, `routes/pega-api.ts`, `modules/pega/ChecksumStore.ts`, `pegaBulkCheckSchema.ts`, `checksum/{GitBlob,PegaRule,FileContentFallback}ChecksumStrategy.ts` + `ChecksumStrategyFactory.ts` + `models/ChecksumModels.ts`, `delta/{BulkCheckClient,BackendHttpPoster,DeltaClassifier,StateComparer}.ts` + models, `services/{PegaCatalogCsvParser,PegaCatalogChecksumResolver,PegaHttpClient,PegaCatalogDownloader}.ts`, test `pega-bulk-check.test.ts`.
- **Scope limitations:** Đây là static analysis — KHÔNG chạy dynamic/penetration test (dành cho Phase 6.3). Không kiểm thử runtime JWT stack thực tế (test dùng middleware giả lập identity). Không đánh giá infra/network deployment (Phase 6.7).
- **Glossary:** CVSS (Common Vulnerability Scoring System), CWE (Common Weakness Enumeration), OWASP (Open Web Application Security Project), Zip-Slip (path-traversal khi giải nén archive).
