# Test Execution Report — SA4E-360 (Phase 6, Round 2)

## Multi-Resolution Context Supply for Pi Harness — P1: Code Skeletonization + Agentic Context Loading

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-360 |
| Title | Multi-Resolution Context Supply — P1: Code Skeletonization + Agentic Context Loading |
| Executed By | QA Agent (Phase 6 — Round 2: fresh re-execution SAU security fixes F-1/F-2/F-3) |
| Date | 2026-10-15 |
| Environment | Node 22 + vitest 4.1.8 (extension) / 4.1.9 (backend); real loopback backend server (dynamic port, isolated temp DB) cho E2E-API |
| Commit under test | `0d33706` (branch `main` — bao gồm 3da3376 Phase-6 Round 1 + 1b822b0 bump 1.53.0 + **0d33706 fix F-1/F-2/F-3**) |
| Working tree note | 5 file production đang modified CHƯA commit thuộc **WIP SA4E-266** (rbac.middleware.ts, MemoryModule.ts, HttpServer.ts, EventBus.ts, AuthManager.ts) — KHÔNG thuộc SA4E-360; toàn bộ suites vẫn xanh (không ghi nhận nhiễu). SM lưu ý khi review diff |
| Overall Verdict | **⚠️ CONDITIONAL PASS — đủ đưa UAT; 13 case PENDING + 1 defect test-implementation mới (DEFECT-QA-01) cần DEV bổ sung test cho F-fixes** |
| Re-test Rounds | 2 (Round 1 pre-fix 65/65 PASS — report TEST-REPORT-SA4E-360.md; Round 2 post-0d33706 65/65 PASS + verification F-fixes) |
| Inputs | STP.md v1.1 · STC.md v1.0 (78 cases) · TDD.md v1.1 · SECURITY-ASSESSMENT.md (F-1/F-2/F-3) · RUN-LOG.md · testdata/ (16 CSV) |

> Report này **thay thế (supersedes)** `TEST-REPORT-SA4E-360.md` (Round 1, 2026-10-14) — được giữ lại làm lịch sử. Round 1 chạy TRƯỚC commit 0d33706 nên không có bằng chứng F-1/F-2/F-3.

---

## 1. Executive Summary

Round 2 tái thực thi toàn bộ automated suites **SAU** security fixes F-1/F-2/F-3 (commit 0d33706): extension full suite **298 files / 2,896 tests**, backend focused (tools + query-layer) **17 files / 161 tests**, E2E-API trên **real server** **8 files / 180 tests** — tất cả **0 FAIL**. Toàn bộ 5 quality gates xanh (tsc ×2, eslint, N-8 pathresolver 540 files, CORS-gate 541 files). Kết quả per-level giữ nguyên Round 1: **65/78 PASS (100% executed pass rate), 13 PENDING (không FAIL)**.

**Đóng góp mới của Round 2 — verification F-1/F-2/F-3:**
1. Cả 3 fix đã được verify **hoạt động đúng bằng thực thi thật** (QA ad-hoc scripts ngoài suite, không sửa repo): F-1 **3/3**, F-2 **14/14**, F-3 **5/5** — mỗi script đều có bước "pre-fix replay" chứng minh scenario **phân biệt được bug** (pre-fix → leak/rỗng).
2. Phát hiện **DEFECT-QA-01 (Major, test-implementation)**: commit 0d33706 là **code-only fix** — KHÔNG có test assertion dedicated nào cho F-1/F-2/F-3 trong committed suite (chỉ có 1 dòng import REDACTED_MARKER chưa dùng trong skeleton-provider.test.ts). Test mandate trong SECURITY-ASSESSMENT F-1 ("+ Thêm STC: extractSignatures trả candidate.signature chứa 'sk-live-...' → skeleton phải chứa [REDACTED]") **chưa được thực hiện**. Hệ quả: 3 security fixes Medium/Low hiện KHÔNG có regression protection — refactor tương lai có thể vô tình xóa sanitizeCandidate mapping / deny-list entries / bind order mà không test nào fail.

| Level | Total | Passed | Failed | Pending | Pass Rate (executed) |
|-------|-------|--------|--------|---------|----------------------|
| PBT | 10 | 10 | 0 | 0 | 100% |
| UT | 34 | 34 | 0 | 0 | 100% |
| IT | 12 | 12 | 0 | 0 | 100% |
| E2E-API | 12 | 9 | 0 | 3 | 100% |
| E2E-UI | 2 | 0 | 0 | 2 | — |
| SIT | 8 | 0 | 0 | 8 | — |
| **Total** | **78** | **65** | **0** | **13** | **100% (65/65 executed)** |

---

## 2. Automated Test Results (Round 2 — post 0d33706)

### 2.1 Execution

```
# 1. Extension full suite                              → 22:57:59 (2026-10-14)
cd extension && npm run test
# 2. Backend focused: code tools + query-layer (F-3 scope) → 23:10
cd backend && npx vitest run src/engine/tools src/engine/query
# 3. pi-workflow suite (F-1/F-2 scope)                  → 23:29
cd extension && npx vitest run src/pi-workflow
# 4. E2E-API suite trên REAL server (vitest.e2e.config.ts) → 23:55
cd backend && npm run test:e2e-api
# 5. Gates: tsc ×2, eslint, check-pathresolver-n8 --all, check-cors-gate-sa4e358 --all
# 6. F-fix verifications (QA ad-hoc tsx scripts — evidence/f-fix-verification-2026-10-15.log)
```

### 2.2 Full-suite numbers (Round 2)

| Suite | Result | Duration | Expected (STP/Round 1) | Delta note |
|-------|--------|----------|------------------------|------------|
| Extension vitest | **298 files / 2,896 tests — 0 failed** | 220.98 s | ~298 files / 2,896 | ✅ exact match — F-fix commit KHÔNG thêm test mới (chỉ +1 dòng import) |
| Backend focused (tools + query) | **17 files / 161 tests — 0 failed** | 11.50 s | 15 files / 150 (Round 1: 3 tools files + 2 query files + suites khác) | ✅ Query-layer 2 files / **11 tests** (SA4E-41 tenant isolation — pre-existing, KHÔNG phải test F-3) |
| pi-workflow (F-1/F-2 scope) | **47 files / 417 tests — 0 failed** | 67.15 s | ~47 files / 417 | ✅ khớp con số DEV báo sau F-fixes |
| Backend E2E-API (real server) | **8 files / 180 tests — 0 failed** | 66.98 s | 8 files / 180 | ✅ Real server bootstrapped, isolated temp DB, teardown clean ("close timed out" là warning cosmetic — tests đã pass) |
| Gates | tsc ext ✅ · eslint ext ✅ · tsc backend ✅ · N-8 ✅ (540 files, 0 violations) · CORS ✅ (541 files) | — | 5/5 PASS | ✅ |

**Đối chiếu claim của DEV/SM sau F-fixes:** "pi-workflow 417 PASS, backend query-layer 11 PASS" — xác nhận ĐÚNG về số, NHƯNG đây là số test **hiện có** (không tăng so với Round 1). **Không có test mới nào được thêm cho F-1/F-2/F-3** — chi tiết tại §2.3.

### 2.3 Per-level mapping STC 78 cases ↔ committed tests (verify lại sau F-fixes)

Kết quả đếm lại sau commit 0d33706: **KHÔNG có test committed mới nào map vào STC** (diff 3da3376..0d33706 trên test files = đúng 1 dòng import `REDACTED_MARKER` chưa dùng). Mapping per-level giữ nguyên Round 1 (chi tiết đầy đủ trong TEST-REPORT-SA4E-360.md §2.3 + TEST-REPORT-SA4E-360.csv):

| Level | STC cases | Executed PASS | Pending | Ghi chú Round 2 |
|-------|-----------|---------------|---------|-----------------|
| PBT | PBT-01..10 | 10 | 0 | PBT-09 corpus VẪN 8 họ secret CŨ — các họ mới F-2 chưa vào corpus |
| UT | UT-01..34 | 34 | 0 | UT-13 chạy REGEX rung nhưng signature sạch (không assert redaction); UT-30/32/33 cover 2/3 vectors redaction (grammar + RAW_HEAD) — vector REGEX (F-1) chưa có assertion |
| IT | IT-01..12 | 12 | 0 | Real createHost/QueryLayer/HTTP — không đổi |
| E2E-API | E2E-API-01..12 | 9 | 3 (04/08/10) | E2E-API-02/03 lifecycle: chỉ assert NEGATIVE classMethods (ghost → undefined) — positive classMethods-with-projectId chưa được assert trên real DB |
| E2E-UI | E2E-UI-01/02 | 0 | 2 | Không Playwright harness cho extension webview |
| SIT | SIT-01..08 | 0 | 8 | Cần llama-server qwen 32k + VS Code host |

### 2.4 F-1/F-2/F-3 Coverage Verification (phần bắt buộc của Round 2)

| Finding | Fix (commit 0d33706) | Test dedicated trong committed suite? | Bằng chứng committed suite | Verification QA Round 2 (thực thi thật) | Verdict |
|---------|----------------------|----------------------------------------|----------------------------|------------------------------------------|---------|
| **F-1** (Medium) — REGEX_SIGNATURES fallback bypass secret redaction (SEC-360-01, vector 3/3) | ✅ `skeleton-fallback.ts:95-103` — `candidates.map(sanitizeCandidate)` trước `extractOutline`, đúng remediation spec | ❌ **KHÔNG** — skeleton-provider.test.ts chỉ thêm **1 dòng import `REDACTED_MARKER` KHÔNG dùng** (dấu hiệu test viết dở, không commit assertions); STC mandate từ SECURITY-ASSESSMENT F-1 chưa thực hiện | UT-13 chạy được REGEX rung (render `function load` đúng post-fix → không vỡ hành vi) nhưng signature fixture **sạch** — không assert redaction; UT-32 (grammar path) + UT-33 (RAW_HEAD) = 2/3 vectors | **3/3 PASS** (evidence/f-fix-verification-2026-10-15.log §1): (a) FIXED pipeline → `[REDACTED]`, không còn secret; (b) control non-secret giữ nguyên; (c) **PRE-FIX replay LEAK thật** (`const API_KEY = 'sk-live-...'` trong outline) → chứng minh vector có thật + scenario phân biệt được bug | ⚠️ Fix ĐÚNG + verified — NHƯNG zero regression protection |
| **F-2** (Medium) — Deny-list thiếu họ phổ biến (JWT, connection-string, sk_live_, github_pat_, npm_, AIza, AccountKey, pwd...) | ✅ `secret-redaction.ts:28-38` — +8 regex patterns, khớp remediation spec (+aws_secret_access_key) | ❌ **KHÔNG** — không test nào tham chiếu các họ mới; PBT-09 corpus (SECRET_SAMPLES) vẫn 8 họ cũ (sk-live-, AKIA, ghp_, xoxb, PRIVATE KEY, password, API_KEY, token) | UT-30..34 + PBT-09 pass = không regression trên họ cũ | **14/14 PASS** (evidence §2): 11 họ mới đều → `[REDACTED]` (JWT, postgres://user:pass@, sk_live_, github_pat_, glpat-, npm_, AIza, AccountKey, pwd, passphrase, aws_secret_access_key); 3 SEC-L controls byte-identical (không over-redact) | ⚠️ Fix ĐÚNG + verified — NHƯNG zero regression protection |
| **F-3** (Low) — listClassMethods param misalignment → AF-4 enrichment silent-empty | ✅ `query-layer.ts:298-304` — bind order `...scope.params, cls, cls, ...subScope.params, bounded`, đúng remediation spec | ❌ **KHÔNG** — query-isolation (11 tests) là tenant-isolation SA4E-41 pre-existing; code-locate.test.ts:87-95 dùng **mocked adapter** (`capture()` + `respond()` — trả rows canned bất kể params); E2E-API-02/03 chỉ assert NEGATIVE (ghost class → classMethods undefined) | Không test nào chạy listClassMethods trên real DB với projectId defined | **5/5 PASS** (evidence §3, real SQLite + real QueryLayer): (a) projectId defined → 4 method names alphabetical; (b) tenant-scoped (p2 decoy không leak); (c) same-file membership theo design; (d) bounded ≤10; (e) **PRE-FIX param-order replay → rỗng** → scenario phân biệt được bug | ⚠️ Fix ĐÚNG + verified — NHƯNG zero regression protection |

**Kết luận F-fixes:** 3/3 fixes là code ĐÚNG theo remediation spec và đã được QA verify hoạt động thật (22/22 checks). Tuy nhiên **không test nào trong committed suite assert hành vi đã fix** → mỗi fix hiện chỉ được bảo vệ bởi "đã được nhìn thấy một lần". → **DEFECT-QA-01** (§5).

---

## 3. Manual SIT + E2E-UI Results — ⏳ PENDING (handoff, không claim PASS)

> SIT-01..08 + E2E-UI-01/02 yêu cầu llama-server (qwen 32k), live VS Code extension host và quyền start/stop backend — không khả dụng trong môi trường execute Round 2 (giống Round 1). Handoff theo STP §2.4 dùng checklist đóng băng `documents/SA4E-360/testdata/sit-checklist-testdata.csv` (rows SIT-A..H, UI-A/B). Bước chạy chi tiết tại §4.

| ID | Test Case | Priority | Result | Automated proxy đã PASS |
|----|-----------|----------|--------|--------------------------|
| SIT-01 | Skeleton injection visible in system context (M6 manual leg) | High | ⏳ PENDING | PBT-07, IT-02 (usagePercent ≤ 0.70) |
| SIT-02 | Functional map inside get_workspace_info | High | ⏳ PENDING | UT-26..29, IT-10 |
| SIT-03 | Degraded mode — stale index recovery | High | ⏳ PENDING | UT-06..10, IT-09 |
| SIT-04 | Multi-turn review qwen 32k — 0 exceed (M5) | High | ⏳ PENDING | TC-360-01/20, IT-03, IT-05 |
| SIT-05 | REJECT surface + provider never called | High | ⏳ PENDING | IT-03 (PiContextBudgetExceededError, no provider call) |
| SIT-06 | Findings parity M3 (manual-only metric) | High | ⏳ PENDING | **none — M3 manual-only by design (STP §9.2); metric duy nhất chưa có bằng chứng executed nào** |
| SIT-07 | PI_SKELETON_* observability + fallback share | Medium | ⏳ PENDING | UT-03, UT-14 |
| SIT-08 | Code standards compliance | Medium | ⏳ PENDING | eslint + tsc + N-8/CORS gates (5/5 PASS Round 2) |
| E2E-UI-01 | Usage indicators zero regression | Medium | ⏳ PENDING | — (không webview Playwright harness) |
| E2E-UI-02 | Transcript tool-activity rendering | Medium | ⏳ PENDING | IT-05 (compaction mechanics) |

**SIT Pass Rate: 0/8 executed — handoff issued, không phải defect.**

---

## 4. PENDING Documentation — 13 cases: lý do + steps chạy sau

### 4.1 SIT-01..08 (manual, llama-server qwen 32k) — 8 cases

**Lý do PENDING:** cần (1) llama-server qwen 32k; (2) VS Code extension host với extension 1.53.0 (lưu ý: VSIX build tại 1b822b0 TRƯỚC F-fixes — cần rebuild VSIX từ 0d33706 nếu muốn SIT trên code đã fix); (3) backend start/stop control.

**Steps (nguồn: STC §SIT + sit-checklist-testdata.csv):**
1. Start llama-server với model qwen 32k (n_ctx 32768); start backend; mở VS Code + workspace indexed.
2. **SIT-01 (SIT-A):** gửi 1 review turn → câu trả lời không whole-file reads; `PI_SKELETON_BUILT` trong log; skeletonTokens ≤ 13,767; staticBudget = 19,668; 0 exceed.
3. **SIT-02 (SIT-B):** yêu cầu agent gọi get_workspace_info → layout + functionalMap present, real paths, ≤ 1500 tokens, cache hit trong 60s.
4. **SIT-03 (SIT-C):** edit 1 file → session mới → `PI_SKELETON_INDEX_STALE` rồi skeleton đúng; stop backend → session mới → `DEGRADED_NO_SKELETON` + steering, không REJECT.
5. **SIT-04 (SIT-D):** chạy ≥ 10 turns trộn read_method + get_workspace_info → grep log: **0 exceed_context_size_error**; atomic tool-unit drops; pinned user preserved.
6. **SIT-05 (SIT-E):** debug harness force oversized skeleton → chat:error `PI_CONTEXT_BUDGET_EXCEEDED`; **ZERO inference requests** trong llama-server log.
7. **SIT-06 (SIT-F):** frozen 10-file subset — pass A (skeleton + targeted reads) vs pass B (full context) → findings parity ≥ 80%; worksheet lưu evidence. **(M3 — metric duy nhất không có proxy automated)**
8. **SIT-07 (SIT-G):** workspace có file Svelte → inspect `PI_SKELETON_FALLBACK` per file + fallbackFiles count; payload chỉ counts/paths/modes, không code bodies/secrets.
9. **SIT-08 (SIT-H):** audit line-count ≤ 200/file, functions ≤ 20 dòng, TSDoc, 0 dependency mới.
10. Ghi kết quả vào TEST-REPORT-SA4E-360.csv (Status/Actual_Result/Evidence_Path) + screenshot vào evidence/.

### 4.2 E2E-UI-01/02 — 2 cases

**Lý do PENDING:** không có Playwright harness cho extension webview trong repo (Playwright configs của backend chỉ cover admin pages); webview cần live VS Code host.

**Steps:** chạy rows UI-A/UI-B trong sit-checklist-testdata.csv trong cùng SIT window (snapshot indicator region + transcript tool-activity; đối chiếu baseline SA4E-355). Khuyến nghị follow-up: dựng webview Playwright harness (P2).

### 4.3 E2E-API-04 (dual-engine PostgreSQL parity, P-8) — deferred automated

**Lý do PENDING:** SA4E-360 E2E file chỉ cover 01..03, 05..07, 09, 11, 12 — không có leg PostgreSQL. Mitigation một phần: QueryLayer UT chứng minh SQL path engine-agnostic (code-locate.test.ts); PostgresAdapter factory/schema/pg-memory tests xanh. STP §10.2 đã dự kiến: "if no CI Postgres, E2E-API-04 runs in the nightly job with a containerized Postgres".

**Steps:** boot server thứ 2 trên PostgreSQL (Testcontainers — khả dụng trong env này), seed cùng FIX-12 fixture set, chạy cùng locate set, diff rows row-for-row SQLite vs PostgreSQL.

### 4.4 E2E-API-08 (loopback wrapper timeout/retry) — deferred automated

**Lý do PENDING:** cần cross-package real-delay-stub E2E harness. Retry semantics đã unit-proven: UT-23 (McpSymbolLocator retry ONCE — 2 attempts, 200ms backoff, INDEX_UNAVAILABLE steering).

**Steps:** dựng stub HTTP server delay 3s; trỏ McpSymbolLocator vào stub; assert timeout 2s + 1 retry + steering envelope.

### 4.5 E2E-API-10 (/mcp rate limit, SEC-360-03 #1) — deferred (security backlog)

**Lý do PENDING:** scope decision (PROGRESS-Wave3) — rate-limiting /mcp là security backlog item riêng, KHÔNG phải blocker của SA4E-360. Nửa cooldown của SEC-360-03 (UT-10) ĐÃ verified. Lưu ý: justification "HttpServer.ts locked by SA4E-356 WIP" đã STALE (SA4E-356 DONE, commit a9b7751) — lý do trung thực là scope. ⚠️ Forward-note: working tree hiện có WIP SA4E-266 đụng HttpServer.ts — khi implement rate limiter cần rebase cẩn thận.

**Steps:** burst requests /mcp vượt threshold → assert 429 + rate-limit headers; cấu hình threshold qua middleware config.

---

## 5. Defect Summary

**0 product defects** trong Phase 6 (Round 1 + Round 2). Toàn bộ 65 executed cases PASS cả 2 rounds, không có re-test do FAIL.

### 5.1 DEFECT-QA-01 (MỚI — Round 2) — Major (test-implementation): F-1/F-2/F-3 không có test assertions trong committed suite

| Field | Value |
|-------|-------|
| Severity | 🟠 **Major (test-implementation — KHÔNG phải product defect)** |
| Phát hiện bởi | QA Agent — mandatory test-implementation review (Phase 6 Round 2) |
| Bằng chứng | git diff 3da3376..0d33706 trên test files = **+1 dòng** (import `REDACTED_MARKER` KHÔNG dùng — skeleton-provider.test.ts:13); grep toàn bộ extension tests: 0 tham chiếu JWT/sk_live/github_pat/AIza/AccountKey/AccountKey-fallback-redaction; query-isolation (11 tests) là tenant-isolation SA4E-41 pre-existing; listClassMethods chỉ test qua **mocked adapter** (code-locate.test.ts:87-95 — `capture()` + `respond()` trả rows canned bất kể params); E2E-API-02/03 chỉ assert NEGATIVE classMethods (ghost → undefined) |
| Mandate bị miss | SECURITY-ASSESSMENT F-1 Remediation: *"+ Thêm STC: extractSignatures trả candidate.signature chứa 'sk-live-...' → skeleton phải chứa [REDACTED]"* — CHƯA có trong STC/suite |
| Impact | 3 security fixes (2 Medium + 1 Low) không có regression protection — verify hiện tại chỉ là "được nhìn thấy đúng một lần" (QA ad-hoc 22/22). Refactor tương lai có thể lặng lẽ phá fix mà mọi suite vẫn xanh |
| Khuyến nghị | **Trả về DEV bổ sung 3 test** (nhỏ, đã có sẵn fixture patterns): (1) **UT-35** — fallback REGEX path: candidate.signature chứa 'sk-live-...' → skeleton chứa `[REDACTED]` (import REDACTED_MARKER đã có sẵn trong file!); (2) mở rộng UT-30 + PBT-09 corpus với 11 họ mới F-2; (3) query-layer test real SQLite: seed Parser + methods (projectId defined) → listClassMethods trả non-empty (pattern theo query-isolation.test.ts). Cả 3 scenario đã được QA verify là **bug-discriminating** (pre-fix replay → leak/rỗng) — script tham khảo: evidence/f-fix-verification-2026-10-15.log |
| SLA | Trước khi CLOSE ticket (có thể song song UAT — không block UAT vì fixes đã verified hoạt động đúng bằng thực thi thật) |

### 5.2 Observations Minor (carry-over từ Round 1)

1. **E2E-API-12 sample hẹp hơn STC spec** — 2 golden queries × 10 iterations (20 latencies) vs STC 12 × 20; property p95 ≤ 300 ms vẫn proven end-to-end. Khuyến nghị mở rộng sample trong follow-up.
2. **Unused import `REDACTED_MARKER`** (skeleton-provider.test.ts:13) — eslint không flag (config test file nới); là artifact của DEFECT-QA-01, sẽ có chủ khi UT-35 được bổ sung.

---

## 6. Security Tests Verification (SEC-360-01..08) — cập nhật sau F-fixes

| SEC ID | Requirement | Test evidence (executed ✓) | Result |
|--------|-------------|----------------------------|--------|
| **SEC-360-01** | Secret redaction + secret-file exclusion | PBT-09 ×3 (corpus 8 họ cũ) + UT-30 (deny-list cũ, case-insensitive) + UT-31 (secret-file names) + UT-32 (grammar vector) + UT-33 (RAW_HEAD vector). **F-1:** REGEX vector đã fix + **QA ad-hoc verified 3/3 (pre-fix replay leak thật)** — chưa có committed test (DEFECT-QA-01). **F-2:** 11 họ mới — **QA ad-hoc verified 14/14** — chưa có committed test | ⚠️ **3/3 vectors FIXED + verified bằng thực thi thật; 2/3 vectors có committed test assertion** |
| **SEC-360-02** | Global budget bound + O(parts) + termination | PBT-10 ×2 + PBT-04/05 + UT-01..05 | ✅ PASS |
| **SEC-360-03** | Rate limit /mcp + reindex cooldown | UT-10 ✓ (cooldown; distinct-args không bypass). E2E-API-10 (/mcp rate limit) PENDING — security backlog | ⚠️ HALF VERIFIED (unchanged) |
| **SEC-360-04** | Backend path-containment twin — 4 vectors | UT-24 (extension leg) + E2E-API-07 (real server: BV-03..06 → skipped[], zero signature lines) | ✅ PASS |
| **SEC-360-05** | LIKE wildcard sanitization | E2E-API-11 (real server) + QueryLayer UTs | ✅ PASS |
| **SEC-360-06** | MAX_SLICE cap cho read_method | UT-25 (5000-line → sliceTruncated, ≤ 2000 lines) | ✅ PASS |
| **SEC-360-07** | Control-character / zero-width strip | UT-34 ×3 | ✅ PASS |
| **SEC-360-08** | Inherited controls re-verified | UT-24 + IT-03 + IT-08 + E2E-API-09 (tenant fail-closed) | ✅ PASS |

**Security verdict: 6.5/7.5 fully verified (unchanged từ Round 1). SEC-360-01: 3/3 vectors ĐÃ FIX + verified ad-hoc, 1 vector (REGEX) thiếu committed test (DEFECT-QA-01). SEC-360-03 half-verified (cooldown ✓ / rate-limit backlog).**

---

## 7. Quality Gates (Round 2)

| Gate | Target | Actual | Status |
|------|--------|--------|--------|
| tsc extension (--noEmit) | 0 errors | 0 errors | ✅ |
| tsc backend (--noEmit) | 0 errors | 0 errors | ✅ |
| eslint extension (src/) | 0 errors | 0 errors (exit 0; warning cosmetic MODULE_TYPELESS_PACKAGE_JSON) | ✅ |
| check-pathresolver-n8 --all (SA4E-356 gate) | 0 raw-resolve remnants | **PASSED — 540 files, 0 violations** | ✅ |
| check-cors-gate-sa4e358 --all (SA4E-358 gate) | gate-first CORS emission | **PASSED — 541 files** (script đúng tên: check-cors-gate-sa4e358.sh) | ✅ |
| SIT-08 code standards (≤200 lines/file, ≤20 lines/function) | 0 violations | eslint/tsc/N-8/CORS proxies xanh; line-count audit manual PENDING (SIT window) | ⏳ partial |

---

## 8. Test Metrics (STP §9.1 + BRD M1–M6)

### 8.1 Execution metrics

| Metric | Formula | Target | Actual | Status |
|--------|---------|--------|--------|--------|
| Test Execution Rate | Executed / 78 | 100% | 65/78 = 83.3% (13 PENDING per plan/deferral) | ⚠️ Partial (by design) |
| Pass Rate (automated) | Passed / executed automated | 100% | **65/65 = 100%** (2 rounds liền nhau) | ✅ Met |
| Automation Ratio | Automated / Total | ≥ 89% | 70/78 = 89.7% planned | ✅ Met (planning) |
| Requirement Coverage (RTM) | Covered / 48 | 100% | 48/48 = 100% (M3 = manual-only, PENDING) | ✅ Met |
| Defect Density | Product defects / 78 | ≤ 0.15 | **0** product defects (1 Major test-impl + 2 Minor obs.) | ✅ Met |
| Critical Defects | Count | 0 | **0** | ✅ Met |

### 8.2 BRD metrics M1–M6 (bằng chứng Round 2)

| Metric | Target | Measurement test | Result |
|--------|--------|------------------|--------|
| M1 Skeleton coverage | ≥ 95% exported symbols | IT-12 | ✅ Measured (PASS Round 2) |
| M2 read_method hit-rate | ≥ 80% top-5 | IT-11 | ✅ **91.7%** (11 ok + 1 designed miss / 12 golden) |
| M3 Findings parity | ≥ 80% | SIT-06 (manual-only) | ❌ Not measured — SIT window |
| M4 Retrieval p95 | FTS5 ≤ 300 ms | E2E-API-12 | ✅ ≤ 300 ms (real server; sample hẹp — §5.2.1) |
| M5 Zero context overflow | 0 × exceed | SIT-04 (+IT-03/05, TC-360-20) | ⚠️ Automated-proven (0 exceed); manual leg PENDING |
| M6 Skeleton token share | ≤ 70% staticBudget | PBT-07 + IT-02 | ✅ 13,767 / 19,668 = 0.70 @32k |


---

## 9. Requirements Traceability Matrix (final — 48/48)

Full mapping: STC.md §7 (RTM). Trạng thái Round 2 — **47/48 requirements có executed PASS evidence; duy nhất M3 chờ SIT-06 manual:**

| Requirement group | Requirements | Covering tests (status) | Coverage |
|-------------------|--------------|--------------------------|----------|
| Use cases (BRD Stories 1–5) | UC-360-01..05 | PBT/UT/IT/E2E-API (65 PASS Round 2); SIT legs PENDING | ✅ 5/5 |
| New business rules | BR-360-01..05 | PBT-01..07, UT-01/04, IT-01..07/09 | ✅ 5/5 |
| Inherited rules (SA4E-355) | BR-01, BR-02, BR-09, BR-11 | PBT-03, IT-03/05/06 | ✅ 4/4 |
| API contracts | C-360-S1..S3, R1/R2, M1/M2, F1 | UT-11/12/17..23/26/27, IT-01/02/04/10, E2E-API-01/02/03/05/06 | ✅ 8/8 |
| Security | SEC-360-01..08 | PBT-09/10, UT-10/24/25/30..34, E2E-API-07/09/11 + **F-verify ad-hoc 22/22**; E2E-API-10 PENDING | ✅ 8/8 (SEC-360-03 half; SEC-360-01 committed-test gap = DEFECT-QA-01) |
| Success metrics | M1–M6 | IT-11 (91.7%), IT-12, E2E-API-12, PBT-07/IT-02, IT-03/05+TC-360-20; M3 → SIT-06 PENDING | ⚠️ 5/6 measured |
| Error scenarios (FSD §9.1) | ES-1..12 | UT-04/09/13..15/17..23, IT-03/05/06/09, E2E-API-06 | ✅ 12/12 |

---

## 10. Exit Criteria Assessment (STP §2.5/§2.6)

| Level | Exit criterion (STP §2.6) | Assessment |
|-------|---------------------------|------------|
| PBT | 10/10 pass; 0 unresolved counterexample | ✅ 10/10 PASS (Round 2) |
| UT | 34/34 pass; mọi error envelope asserted | ✅ 34/34 PASS (INVALID_ARGS / NOT_FOUND / AMBIGUOUS / INDEX_STALE / FILE_UNREADABLE / INDEX_UNAVAILABLE) |
| IT | 12/12 pass; measure==inject byte-identical; REJECT proves provider never called | ✅ 12/12 PASS |
| E2E-API | 12/12 trên BOTH engines; containment 4-vector rejection | ⚠️ 9/12 PASS (SQLite); 3 PENDING (04 dual-engine, 08, 10); 4-vector containment proven trên real server |
| E2E-UI | 2/2 pass; zero indicator diff | ❌ PENDING — no harness (manual handoff) |
| SIT | 8/8 executed với evidence; M1–M6 recorded; 0 Crit/Major open | ❌ PENDING — environment unavailable; handoff issued |
| Overall | Full suite green; RTM 100%; sign-off | ✅ Suites green ×2 rounds (2,896 ext + 161 backend + 417 pi-workflow + 180 E2E-API); RTM 48/48; **CONDITIONAL** — điều kiện close tại §12 |

**Entry criteria (STP §2.5):** ĐẠT — T1–T9 merged, 16 fixture CSVs, real-server bootstrap hoạt động, F-fixes đã commit (0d33706) trước Round 2.

---

## 11. Evidence Files

| File | Description | Section |
|------|-------------|---------|
| evidence/f-fix-verification-2026-10-15.log | **F-1 3/3 + F-2 14/14 + F-3 5/5** — QA ad-hoc real-execution verification (tsx, pre-fix replay discriminators) | §2.4, §5.1, §6 |
| evidence/round2-ext-full-suite.log | Extension full suite Round 2 tail (298/2,896, 220.98s) | §2.2 |
| evidence/round2-backend-focused.log | Backend tools+query focused (17/161, 11.50s) | §2.2 |
| evidence/round2-e2e-api.log | E2E-API Round 2 full log (8/180; real server, teardown clean) | §2.2 |
| evidence/suite-summary-2026-10-14.md | Round 1 consolidated numbers + per-file mapping (pre-F-fix baseline) | §2.3 |
| evidence/sa4e360-focused-ext-verbose.log | Round 1 verbose names — 88 skeleton tests (PBT/UT/IT mapping + security names) | §2.3 |
| evidence/backend-e2e-api-suite.log + sa4e360-backend-focused-e2e.log | Round 1 E2E logs (8 files / 180; port 60317) | §2.3 |
| TEST-REPORT-SA4E-360.csv | 78-case execution tracker (65 PASS / 13 PENDING / 0 FAIL) — cập nhật Round 2 | §1 |
| documents/SA4E-360/testdata/sit-checklist-testdata.csv | Frozen manual checklist (SIT-A..H, UI-A/B) cho SIT window | §3, §4 |

> Verification scripts F-1/F-2/F-3 chạy từ %TEMP% (không tạo file trong repo); transcript đầy đủ lưu tại evidence/f-fix-verification-2026-10-15.log — DEV có thể tái sử dụng làm pattern cho 3 test bổ sung (DEFECT-QA-01).

---

## 12. Conclusion

**Overall Verdict: ⚠️ CONDITIONAL PASS — ĐỦ ĐƯA UAT, CHƯA ĐỦ ĐIỀU KIỆN CLOSE TICKET**

| Metric | Result |
|--------|--------|
| Automated tests (PBT + UT + IT + E2E-API) | 65/65 PASS (100%) — 2 rounds liền (pre-fix + post-0d33706) |
| F-1/F-2/F-3 (security fixes commit 0d33706) | ✅ Fix đúng remediation spec + ✅ verified hoạt động thật (22/22 ad-hoc checks, có pre-fix discriminators) / ⚠️ thiếu committed tests (DEFECT-QA-01 Major test-impl) |
| Manual SIT tests | 0/8 executed (handoff issued) |
| Bugs found (product) | 0 |
| Defects (test-implementation) | 1 Major (DEFECT-QA-01) + 2 Minor observations |
| Critical/Major product defects | 0 |
| Gates | tsc ×2 ✅ · eslint ✅ · N-8 (540 files) ✅ · CORS (541 files) ✅ |

**Recommendation cho SM:**
1. **CHO PHÉP CHUYỂN SANG UAT** — toàn bộ chức năng in-scope xanh ở mọi mức có thể tự động hóa qua 2 rounds; F-fixes hoạt động đúng (verified thực thi thật); 0 product defects.
2. **KHÓA CLOSE ticket** cho đến khi: (a) SIT-01..08 + E2E-UI-01/02 chạy trong llama-server window (đặc biệt **SIT-06/M3** — metric duy nhất chưa có bằng chứng executed nào) — rebuild VSIX từ 0d33706 trước khi SIT; (b) **DEV bổ sung 3 test cho DEFECT-QA-01** (UT-35 fallback-redaction + mở rộng deny-list corpus + listClassMethods real-DB test); (c) track E2E-API-04/08/10 làm follow-up tickets.
3. Lưu ý working tree đang có **WIP SA4E-266** (5 production files chưa commit) — SM xác nhận phạm vi trước khi commit tiếp theo.

---
---

## Appendix A: Re-Test History

**Round 1 (2026-10-14, pre-F-fix, commit 3da3376):** fresh full execution → 65/65 executed PASS, 0 FAIL, 13 NOT_RUN — báo cáo tại TEST-REPORT-SA4E-360.md.

**Round 2 (2026-10-14 22:57 → 2026-10-15, post-F-fix, commit 0d33706):** re-execution toàn bộ suites + gates + F-fix verifications → 65/65 executed PASS, 0 FAIL, 13 PENDING (cùng mapping Round 1); F-1 3/3 + F-2 14/14 + F-3 5/5 ad-hoc PASS; phát hiện DEFECT-QA-01.

```
Round 1 (2026-10-14, @3da3376)      → 65/65 executed PASS · 0 FAIL · 13 NOT_RUN
Round 2 (2026-10-15,    @0d33706)   → 65/65 executed PASS · 0 FAIL · 13 PENDING + F-verify 22/22 ad-hoc
```

Không có FAIL nào cần re-test trong cả 2 rounds.

## Appendix B: Working-Tree Note (SA4E-266 WIP)

Tại thời điểm test Round 2, working tree chứa các thay đổi CHƯA commit **không thuộc SA4E-360**:

| File | WIP content (tóm tắt diff) |
|------|----------------------------|
| backend/src/admin/middleware/rbac.middleware.ts (+11) | SA4E-266: EventBus subscription invalidate RBAC cache |
| backend/src/modules/memory/MemoryModule.ts (+17/-5) | SA4E-266: reinitLLM async + error handling |
| backend/src/server/HttpServer.ts (+29/-12) | SA4E-266 WIP (cần SM xác nhận phạm vi) |
| backend/src/shared/EventBus.ts (+4) | SA4E-266: thêm events |
| extension/src/auth/AuthManager.ts | SA4E-266 WIP |

Các suites đã chạy TRÊN working tree này và vẫn 0 FAIL — không ghi nhận nhiễu lên SA4E-360 scope (skeleton/query-layer/E2E-API không import các file này theo cách ảnh hưởng kết quả assertion). Lưu ý điều này vào RUN-LOG để tránh nhầm khi audit sau.

---

*— Hết Test Execution Report SA4E-360 (Phase 6, Round 2) — Verdict: CONDITIONAL PASS · 0 product defects · DEFECT-QA-01 (Major test-impl) · 13 PENDING · Sufficient for UAT —*

