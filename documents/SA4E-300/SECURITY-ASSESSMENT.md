# 🔒 Security Assessment — SA4E-300 (Phase 5.7, Implementation)

## Document Information

| Field | Value |
|-------|-------|
| Project | SDLC-Agents-4-Enterprise (Code Intelligence MCP Server + VS Code Extension) |
| Ticket | SA4E-300 — [Extension/Backend] Cải thiện error detail trong luồng ingest source code vào KB |
| Phase | 5.7 — Security Assessment of **implemented code** (post Round 3 + post-6.7 High fixes) |
| Date | Backfilled hồi tố ngày 2026-09-19 (code state sau fix 2 Highs + DPG/RLN, RUN-LOG 2026-09-19) |
| Assessor | Security Agent (static code review — report only, NO code changes) |
| Inputs | `backend/src/server/routes/api-index.ts` (sanitize/`resolveSafeTargetPath`/RBAC gates), `admin/kb-graph.ts`, `modules/memory/engine/edge-on-ingest.ts`, `extension/src/services/IndexerHttpClient.ts`, `IndexingService.ts`, `src/indexer.ts`, TEST-REPORT.md Round 3 (45/45), RUN-LOG 2026-09-19 |
| Outputs | `documents/SA4E-300/SECURITY-ASSESSMENT.md` (this file) |
| Relation to 6.7 | `SECURITY-DEPLOY-REVIEW.md` (2026-09-22) đã verdict GO WITH CONDITIONS staging với 13 findings trên code **trước** fix 2 Highs. Doc 5.7 này đánh giá code **sau** fix (gates đã land), cập nhật disposition từng finding + residual risks. Không lặp lại toàn văn 6.7 — chỉ điểm lại fix và phần còn lại. |

## Executive Summary

Code SA4E-300 sau Round 3 + post-6.7 fix có posture **GOOD, cải thiện rõ so với thời điểm 6.7**: path traversal bị chặn toàn diện (sanitize + normalize + relative-verify, base cross-platform, 18 tests), mọi `/api/index/*` handler có RBAC (`KB_WRITE` × 4 handlers, `GRAPH_MAINTAIN` cho `sync-pega-rules`), JWT ngoài grant bị 403, permission lookup fail-closed, token/secret không vào logs, error contract giữ `details ≤ 2000` / `error ≤ 500` và không stack trace. `npm audit --omit=dev` chạy mới trong assessment này: **backend 2 vulns (1 high adm-zip transitive via onnxruntime-node + 1 moderate qs)**, **extension 8 vulns (7 high: @xmldom/xmldom, adm-zip, extract-zip/puppeteer chain, multer + 1 moderate qs)** — đều nằm ở transitive/dev-tooling chain, không phải code SA4E-300 trực tiếp, nhưng cần DevOps `npm audit fix` có kiểm soát.

**Residual risk chính:** session-token (opaque admin session) của user có permission **vẫn ghi được mọi project** — thiếu membership infra (users ↔ access_groups, không có project-membership table). Code đã ghi rõ `NOTE (fallback, PO risk-accept)` tại `api-index.ts:163-167`. Cần PO risk-accept hoặc follow-up ticket. Các Medium/Low còn lại từ 6.7 (#3–#11) vẫn OPEN.

**Verdict phase 5.7 (hồi tố): PASS WITH CONDITIONS** — implementation đạt để lên staging; conditions = PO risk-accept residual BOLA-session + DevOps xử lý npm audit + mang Medium/Low sang hardening backlog (chi tiết §5).

**Risk rating (implementation): Medium** (2 Highs đã hạ cấp thành residual có kiểm soát; không Critical).

## 1. Scope & Method

- In scope: toàn bộ SA4E-300 deltas đã fix (path helpers, `indexError`, RBAC gates, JWT binding, singleton channel, token propagation, edge-on-ingest, kb-graph `relation`).
- Method: static review + grep verify + đối chiếu TEST-REPORT Round 3 (27 extension + 18 backend, 45/45) + test mới post-6.7 (`api-index-errors` +7 SEC = 25, `edge-on-ingest` 14, tự verify 39/39 per RUN-LOG) + `npm audit --omit=dev` chạy thực tế hai package.
- Không exploitation, không infra/network test.

## 2. Fix Verification (Point-by-Point)

### 2.1 Path safety — VERIFIED ✅

- `sanitizePathSegment` (`api-index.ts:51-55`): strip `[^A-Za-z0-9._-]`, fallback khi rỗng/`.`/`..`.
- `resolveIndexTempBase` (`:62-77`): `config.indexTempDir` → env `CODE_INTEL_INDEX_TEMP_DIR` → `os.tmpdir()/CodeIntel`; segments sanitized; giữ `{userId}/{projectId}/{subdir}`; không còn base cứng Windows.
- `resolveSafeTargetPath` (`:85-110`): null-byte reject, `decodeURIComponent` + dual-check raw/decoded, drive-letter (`C:`) reject, leading `/\` reject, `path.normalize` + `..`-segment check 3 lớp, `path.relative` containment verify, fail-closed `null` → caller ghi `rejectedReasons EACCES`.
- Tests: 18 backend cases (traversal `../`, absolute, backslash, encoded, drive-letter) — PASS per TEST-REPORT Round 3.

### 2.2 RBAC gates (post-6.7 High fixes) — VERIFIED ✅ (với residual ghi ở §3)

- `requireIndexPermission` (`api-index.ts:170-187`): `getUserPermissions(userId)` (cùng nguồn `AdminContext.requirePermission`), fail-closed 403 khi DB lỗi hoặc thiếu quyền, 403 enriched `{error: Forbidden, details: Missing required permission: X, action: Contact admin}`.
- Áp dụng: `KB_WRITE` tại 4 handlers (`:281` source, `:339` documents, `:369` ingest-docs, `:391` ingest path) + `GRAPH_MAINTAIN` cho `sync-pega-rules` (`:457-458`, cùng gate `populate-edges kb-graph.ts:104`).
- Tests mới: 403 thiếu quyền cho cả 4 route + 202/200 pass path + JWT grant — `api-index-errors.test.ts:315-379` (~25 tests).

### 2.3 JWT project binding — VERIFIED ✅ (partial, JWT path)

- `verifyIndexProjectBinding` (`api-index.ts:195-210`): pattern `verifyProjectBinding` SEC-03 từ `tools.ts`; `auth.startsWith('Bearer ')` (đúng prefix, khắc phục Finding #11 variant ở helper mới); `verifyJwtToken` + `allowedProjectsFromClaims`; project ngoài grant → 403 `No access to project`. Opaque token (không JWT / không claim) → cho qua (gate permission vẫn áp dụng).
- Import `verifyJwtToken, allowedProjectsFromClaims` tại `:17` — tái dùng infra hiện có, không framework mới (đúng No-Workaround).

### 2.4 JWT/session robustness — VERIFIED ✅

- Route-level `requireAuth` (`:145-151`, `:214-216` + mọi route): `validateSession`, 401 khi thiếu/sai — live probes Round 2 xác nhận (`GET /progress` → 401, `POST /source` → 401 trước mọi file write).
- Helper mới dùng `startsWith` thay cho `replace('Bearer ', '')` — variant cũ tại `requireAuth :147` vẫn còn (Finding #11 residual, fail-closed, Low).

### 2.5 Extension: singleton channel, token sync, no secret in logs — VERIFIED ✅

- `getIndexerOutput()` singleton (`IndexerHttpClient.ts:48`); ingest flow dùng channel, không `console.debug/warn` trong ingest files (grep TEST-REPORT §2.4).
- `setOnTokenRefreshed`/`getCurrentToken`/`notifyTokenRefreshed` (`:64-71`); propagation `uploadSourceFiles`+`httpPostJson`+`httpGet`; `IndexingService` sync `this.token = fresh` + `indexer.ts:75-83` wiring `setRefreshTokenFn` (GAP 4 fix).
- `error` slice 500 (`:489`), `details` forward ≤ 2000 từ backend; grep không thấy `appendLine(token)`/`console.log(token)` trong ingest flow.
- Timeouts: `IndexerHttpClient` có 5s/10s/30s/60s; `pollTaskWorkerProgress` vẫn thiếu `AbortSignal.timeout` (Finding #11 residual).

### 2.6 Graph/SQL — VERIFIED ✅ (sqlite path)

- `edge-on-ingest.ts`: `extractIngestEdges` pure + parameterized pagination/insert; `kb-graph.ts` dùng `getDbAdapter()` + cột `relation` (fix BUG-002, build xanh lần đầu 2026-09-19); RBAC `GRAPH_MAINTAIN`/`RBAC_MANAGE` giữ nguyên.
- Residual: SELECT vẫn hardcode `?` (pg break — Finding #7), `populate-edges` unbounded scan (Finding #6).

## 3. Residual Risks

### R-1 (High residual → Medium với kiểm soát): session-token permissioned user vẫn ghi mọi project — cần PO risk-accept

- **Cơ chế:** không có project-membership table (users ↔ access_groups). `verifyIndexProjectBinding` chỉ enforce với JWT có grant; opaque session token chỉ qua gate `KB_WRITE` toàn cục.
- **Impact:** horizontal write/KB-poisoning giữa các project bởi user đã có `KB_WRITE` (insider, không phải anonymous).
- **Disposition:** code đã document (`api-index.ts:163-167 NOTE fallback, PO risk-accept`); RUN-LOG 2026-09-19 ghi "cần PO risk-accept/follow-up membership". **Chấp nhận được cho staging** (trusted users, sqlite, non-sensitive data); **phải có follow-up ticket membership infra trước production**.
- Downgrade từ 6.7 #1 (High 7.1): JWT path đã đóng; phần còn lại là known-accepted risk, không phải lỗ hổng mới.

### R-2..R-5: Medium từ 6.7 vẫn OPEN (không đổi)

| # | Issue | Trạng thái |
|---|-------|-----------|
| #3 | `X-Project-Id` fallback silent default, `PROJECT_REQUIRED` dead code | OPEN — cần mandatory header fix (1 hàm) |
| #4 | Raw fs message echo absolute path (CWE-209) | OPEN — cần `safeFsMessage` basename-only |
| #5 | Không per-file/batch caps (`maxFileSize` 512KB chưa enforce) | OPEN — cần caps + 413 |
| #6 | Backpressure chỉ `/source`; `populate-edges` unbounded scan | OPEN — cần guard chung + paginate + transaction |

### R-6: Low/Info từ 6.7 vẫn OPEN

#7 pg placeholder (Low staging / High nếu deploy pg), #8 headers (HSTS/frame-ancestors/CSP), #9 JWT timing + anonymous-trust ngoài scope, #10 log/output newline sanitize, #11 `requireAuth` replace + poll timeout. INFO-1..3 (no-CORS fail-closed tốt, token handling tốt, SQL parameterized) giữ nguyên.

## 4. Dependency Vulnerabilities (`npm audit --omit=dev`, chạy thực tế trong assessment này)

### Backend (`backend/`) — 2 vulnerabilities (1 moderate, 1 high)

| Dependency | Via | Severity | Advisory | Note |
|-----------|-----|----------|----------|------|
| `adm-zip <=0.6.0` | `onnxruntime-node` transitive | High | GHSA-vwc7-r8mq-g2x9 (symlink overwrite), GHSA-7q85-xj36-vmfc (DoS) | Không chạm ingest flow; fix via `npm audit fix` cần test onnxruntime |
| `qs 2.2.5–6.15.3` | transitive | Moderate | GHSA-x5fp-wj9c-mxmx, GHSA-4mjr-xmp4-gh2g | Hono dùng riêng query parser; thực tế khó khai thác, vẫn nên fix |

### Extension (`extension/`) — 8 vulnerabilities (1 moderate, 7 high)

| Dependency | Via | Severity | Advisory |
|-----------|-----|----------|----------|
| `@xmldom/xmldom <=0.8.14` | transitive | High | 10× GHSA (injection/ReDoS/quadratic) |
| `adm-zip <=0.6.0` | `filetomarkdown` | High | GHSA-xcpc-8h2w-3j85 + symlink/DoS |
| `extract-zip` → `@puppeteer/browsers` → `puppeteer-core` | dev-e2e chain | High | GHSA-jmr9-qjv8-65gv, GHSA-7pqw-9j4j-h8q3 (`fix --force` breaking → cân nhắc, e2e-only) |
| `multer <=2.2.0` | transitive | High | 4× GHSA DoS/race/bypass |
| `qs` | transitive | Moderate | như backend |

**Disposition:** không finding mới thuộc code SA4E-300; tất cả là transitive/dev-chain. Không tự `npm audit fix` trong assessment (tránh đổi lockfile ngoài scope — đúng role-boundaries). Giao DevOps: chạy `npm audit fix` có kiểm soát + regression (đặc biệt onnxruntime/puppeteer breaking), ghi kết quả vào DPG.

## 5. Remediation Priority (cập nhật sau fix)

| Priority | Item | Effort | Status |
|----------|------|--------|--------|
| 1 | PO risk-accept R-1 (session cross-project) + mở follow-up membership infra | Low (quyết định) | OPEN — điều kiện staging |
| 2 | DevOps `npm audit fix` + regression + ghi DPG (§4) | Low-Medium | OPEN — mới từ assessment này |
| 3 | Mandatory `X-Project-Id` (#3) | Low | OPEN |
| 4 | Sanitize fs errors (#4) + log newline strip (#10) | Low | OPEN |
| 5 | Per-file/batch caps (#5) + backpressure mở rộng (#6) | Low-Medium | OPEN |
| 6 | pg placeholder (#7, nếu deploy pg), HSTS/frame-ancestors (#8), JWT timing (#9), poll timeout (#11) | Low | OPEN backlog |

## 6. Verdict & Limits

- **Verdict: PASS WITH CONDITIONS** — implementation chắc chắn cho staging (path safety + RBAC + JWT binding + token hygiene đã verify); conditions: (1) PO risk-accept R-1, (2) DevOps xử lý npm audit, (3) 5 NOT_RUN staging + Medium/Low vào backlog (chi tiết pentest ở PENTEST-REPORT.md 6.3).
- **Findings mới ngoài 13 findings 6.7:** chỉ có §4 `npm audit` (chưa từng chạy — 6.7 ghi "deferred to pipeline"). Không phát hiện lỗ hổng mới trong code SA4E-300.
- **Limits:** static-only; runtime/load/infra/network chưa test; 5 STC live cases NOT_RUN (thuộc 6.3); pg path chưa verify live.
