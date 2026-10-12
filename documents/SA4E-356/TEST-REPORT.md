# Test Execution Report — SA4E-356

## [Bug] MCP tools: relative file_path resolves against process CWD (Kiro install dir) instead of workspace root — Phase 6

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-356 |
| Title | [Bug] MCP tools: relative file_path resolves against process CWD instead of workspace root |
| Executed By | QA Agent (Phase 6 test execution theo STP v1.1 + STC v1.1) |
| Date | 2026-10-12 |
| Environment | Vitest 4.1.8 (extension, `fileParallelism: false`, `retry: 2`, vscode-mock alias) + Vitest 4.1.9 (backend) |
| Commit under test | `7c525a8` (branch `main`; bao gồm DEV `bb17b39` + SA-02 fix `7c525a8`) |
| Overall Verdict | **⚠️ CONDITIONAL PASS — đủ đưa UAT; REG-1/REG-2 manual close-gate PENDING (chưa đủ điều kiện CLOSE ticket)** |
| Re-test Rounds | 0 (không có FAIL nào cần re-test) |

---

## 1. Executive Summary

Đã thực thi toàn bộ 33 test cases theo STC v1.1 (PBT 4, UT 15, IT 10, SCAN 2, E2E-API 2) + toàn bộ regression suite + 5 quality gates. **31/33 case PASS hoàn toàn** ở mức automated. 2 case E2E-API (REG-1/REG-2) có **vitest anti-regression harness PASS** (3/3 tests) nhưng **manual close-gate trên real Kiro host + Jira credentials KHÔNG chạy được trong session này** (MCP/extension host degraded, không có Jira access) → đánh dấu **PENDING**, không claim PASS.

**Không có defect mới nào được phát hiện trong Phase 6.** Toàn bộ các tiêu chí exit tự động (PBT/UT/IT/SCAN + N-7 coverage + N-8 scan + tsc + eslint) đều ĐẠT.

| Level | Total | Passed | Failed | Blocked/Pending | Pass Rate |
|-------|-------|--------|--------|-----------------|-----------|
| PBT | 4 | 4 | 0 | 0 | 100% |
| UT | 15 | 15 | 0 | 0 | 100% |
| IT | 10 | 10 | 0 | 0 | 100% |
| SCAN | 2 | 2 | 0 | 0 | 100% |
| E2E-API | 2 | 2 (CI harness) | 0 | **2 manual close-gate PENDING** | 100% automated / manual pending |
| **Tổng STC** | **33** | **31 full + 2 harness-PASS** | **0** | **2 (manual REG-1/2)** | — |
| SIT (manual exploratory) | 0 | — | — | — | N/A (STP §2.1 justification) |
| E2E-UI | 0 | — | — | — | N/A (no UI surface) |

---

## 2. Automated Test Results

### 2.1 Execution

```
cd extension && npm run test            # full regression suite
cd extension && npm run test:coverage   # N-7 gate (PathResolver.ts ≥95%)
cd backend  && npx vitest run src/engine/tools/__tests__/drawio-tool.test.ts   # UT-10/UT-15 + SA-02
cd backend  && npx tsc --noEmit         # backend compile gate
bash scripts/check-pathresolver-n8.sh --all / --staged   # N-8 gate
```

| Metric | Result |
|--------|--------|
| Tổng test files (extension) | **278 passed (278)** |
| Tổng tests (extension) | **2660 passed (2660)** |
| Backend drawio-tool suite | **19 passed (19)** |
| Failed | 0 |
| Thời gian full suite | 179.66s (vitest run) / 146.88s (coverage run) |

### 2.2 SA4E-356 Test Breakdown — Mapping STC ↔ test thực tế

#### 2.2.1 PBT (Property-Based) — file `src/services/__tests__/path-resolver.test.ts` — 70/70 tests PASS (363ms)

| STC Case | Test Name (vitest) | Result | Duration |
|----------|--------------------|--------|----------|
| PBT-01 | `PBT-01 absolute passthrough preserves location > resolve(p) === path.resolve(p) for absolute inputs under WS` (fast-check) | ✅ PASS | 6ms |
| PBT-02 | `PBT-02 idempotent + per-call provider > fixed point + provider consulted on every call` (fast-check) | ✅ PASS | 5ms |
| PBT-03 | `PBT-03 containment monotonicity (N-3, security) > arbitrary nesting under WS resolves ok` + `arbitrary escapes + prefix-collisions never yield ok:true` | ✅ PASS (2 tests) | 6ms |
| PBT-04 | `PBT-04 case-fold on win32 only > case mutations of a contained path stay contained on win32` + `case-differing paths are rejected on posix` | ✅ PASS (2 tests) | 4ms |

**4/4 properties hold — không có counterexample nào shrink thành leak.**

#### 2.2.2 UT — `path-resolver.test.ts` (14/15 case) + `backend/src/engine/tools/__tests__/drawio-tool.test.ts` (UT-10, UT-15)

| STC Case | File | Test Name (vitest) | Result |
|----------|------|--------------------|--------|
| UT-01 | path-resolver.test.ts | `UT-01 T1 relative resolves against workspace root` (2 tests: plain + nested) | ✅ PASS |
| UT-02 | path-resolver.test.ts | `UT-02 T2 absolute passthrough` (2 tests: passthrough + dot-segment normalize) | ✅ PASS |
| UT-03 | path-resolver.test.ts | `UT-03 T3 escape blocked (Format 2)` — 12 tests: 2 core + 8 boundary-corpus (`../../Windows/System32/config`, `../../secrets.env`, mixed-separator, dot-camouflage…) + inner-escape + trailing-separator | ✅ PASS |
| UT-04 | path-resolver.test.ts | `UT-04 T3b prefix-collision boundary` (3 tests: `WS-evil` sibling reject + Format 2 + genuine children/root-equal pass) | ✅ PASS |
| UT-05 | path-resolver.test.ts | `UT-05 T4 multi-root determinism` (2 tests: workspaceFolders[0] + reorder) | ✅ PASS |
| UT-06 | path-resolver.test.ts | `UT-06 T5 no workspace (BR-06b behavior lock)` — 6 tests: relative → `PATH_NO_WORKSPACE`; `workspaceFolders=[]` variant; absolute ngoài cwd pass (DISC-1); provider-never-throws; opts undefined/{} fallback | ✅ PASS |
| UT-07 | path-resolver.test.ts | `UT-07 T6 casing (R-1)` (4 tests: fold 2 vế win32 + posix strict + end-to-end) | ✅ PASS |
| UT-08 | path-resolver.test.ts | `UT-08 T7 per-call provider (C-3, no cache)` (5 tests: per-call read + throwing provider + blank roots + idempotence spot-check) | ✅ PASS |
| UT-09 | path-resolver.test.ts | `UT-09 T8 UNC / empty / non-string (C-1)` (7 tests: UNC + `""` + whitespace + null + undefined + 123 + {}) | ✅ PASS |
| UT-10 | backend drawio-tool.test.ts | `handleDrawioLayout — input validation` (file_path missing / blank / path-rejected) | ✅ PASS |
| UT-11 | path-resolver.test.ts | `UT-11 T5b BR-06b discrimination + Format 3` (3 tests: Format 3 shape + absolute-inside-cwd pass + zero side-effects) | ✅ PASS |
| UT-12 | path-resolver.test.ts | `UT-12 T8-ext NUL / CRLF (SEC-05)` (3 tests: NUL → PATH_INVALID; NUL-hidden escape; CR/LF sanitized echo) | ✅ PASS |
| UT-13 | backend-local-tools.test.ts | `T-SEC01: outside refs are skipped verbatim, in-root refs embedded` | ✅ PASS |
| UT-14 | backend-local-tools.test.ts | `T-size` ×4: content >10MB refuse + exactly-10MB boundary + pre-read >25MB refuse + exactly-25MB boundary | ✅ PASS |
| UT-15 | backend drawio-tool.test.ts | `resolveFilePath win32 fold (STC UT-15, SEC-04)` (3 tests: C:/c: variants + genuine-outside still rejected + posix strict) | ✅ PASS |

**15/15 UT PASS.** Bổ sung trong path-resolver.test.ts (70 tests tổng): 9 N-QA2 quirk-corpus tests (trailing-dot/space, 8.3, `\\?\`, drive-relative, forward-slash — SEC-06) + 5 Format-1 builder tests + N-1 latency benchmark — toàn PASS.

#### 2.2.3 IT — `backend-local-tools.test.ts` (42/42 PASS, 586ms) + `attachment-tools.test.ts` (7/7 PASS, 389ms) + `tool-proxy.test.ts` (12/12 PASS, 358ms) + `wrapper-server.test.ts` (26/26 PASS, 898ms) + `stream-write-reject.test.ts` (3/3 PASS, 294ms)

| STC Case | File | Test Name (vitest) | Result |
|----------|------|--------------------|--------|
| IT-01 | backend-local-tools.test.ts | `INT-1: writes and appends with preserved success text` + `INT-1 alias: args.path resolves through the same helper (SEC-08b)` + TC-01..TC-07 (create/overwrite/append/PATH_EMPTY/absolute/cwd_fallback×2) | ✅ PASS |
| IT-01 (variants) | stream-write-reject.test.ts | `rejects empty file_path with PATH_EMPTY (single validation point)` + `rejects relative path with PATH_NO_WORKSPACE on fallback` + `passes absolute paths through on fallback` | ✅ PASS |
| IT-02 | backend-local-tools.test.ts | `INT-2: embeds via resolved baseDir next to the input` + `INT-2: explicit absolute output_path is honored` + `INT-2: relative output_path is rejected on fallback (BR-06b for outputs)` | ✅ PASS |
| IT-03 | attachment-tools.test.ts | `jira_attach_file (STC IT-03)`: reads-from-resolved-path + `PATH_NO_WORKSPACE before HTTP` + `PATH_INVALID before HTTP` + `FILE_NOT_FOUND with resolved path` | ✅ PASS |
| IT-04 | attachment-tools.test.ts | `confluence_add_attachment (STC IT-04)`: resolved path + `returns before FormData/HTTP for escape-shaped input` + FILE_NOT_FOUND wrap | ✅ PASS |
| IT-05 (chat) | tool-proxy.test.ts | `callTool resolves mem_ingest_file against the workspace root (D2 regression)` + `rejects relative mem_ingest_file with Wrapper Error + PATH_NO_WORKSPACE on fallback (BR-06b)` + `wraps unreadable files in an error payload` + `accepts args.path alias (no bypass)` + `rejects escape-shaped input via the path alias identically` | ✅ PASS |
| IT-05 (wrapper) | wrapper-server.test.ts | `INT-5 wrapper: mem_ingest_file relative resolves + pre-reads` + `INT-5 wrapper: escape yields a tool error result, never -32603` + `INT-5 wrapper: provider-mode proxy agrees with string mode` (+ TC-29 envelope + TC-42/43 D2) | ✅ PASS |
| IT-06 | wrapper-server.test.ts | `INT-6: relative output_path resolves under the workspace root` + `INT-6: derived output for non-drawio input appends .out` (+ TC-22 full-proxy-chain, TC-24 unwrap dynamic) | ✅ PASS |
| IT-07 | backend-local-tools.test.ts + attachment-tools.test.ts | `TC-ERR-01: missing file read yields Format 1 with resolved path` + FILE_NOT_FOUND wraps (jira/confluence) + Format-1 builders workspace/fallback/FS_ERROR variants (path-resolver.test.ts) | ✅ PASS |
| IT-08 | attachment-tools.test.ts + tool-proxy.test.ts + wrapper-server.test.ts | escape trước HTTP (jira/confluence) + `Wrapper Error` verbatim (C-5) + TC-43 `relative file_path outside the workspace root fails with resolved path in error` | ✅ PASS |
| IT-09 | backend-local-tools.test.ts | `IT-09: handler keeps outside refs verbatim and embeds in-root` | ✅ PASS |
| IT-10 (SQ-1) | backend-local-tools.test.ts | `checkSymlinkGuard (STC IT-10 SQ-1 guard unit, SEC-03)` ×4: normal in-root pass + cwd_fallback skip + missing-parent FS_ERROR + `blocks symlink escapes but passes internal links (or skips gracefully)` | ✅ PASS (không cần skip — symlink guard test chạy thật trên Windows) |

**10/10 IT PASS.** I-3 (0 HTTP trên resolve-fail) verified qua assertion `client.request not.toHaveBeenCalled()` trong attachment-tools + regression e2e. D2 regression (TC-42/43/44/45) intact.

#### 2.2.4 SCAN — `schema-description-scan.test.ts` — 8/8 PASS (546ms)

| STC Case | Test Name (vitest) | Result |
|----------|--------------------|--------|
| SCAN-01 | `static tool definitions describe file_path with the workspace rule` + `rewriteSchemasForLlm always overwrites file_path (M-1) and keeps shape (M-3)` + `find_tools responses carry the rule (via WrapperServer)` + `output_path descriptions keep the rule plus derived-info suffix (M-2)` | ✅ PASS (4 tests) |
| SCAN-02 | `has no single-argument resolve(<...file_path...>) (N-8a)` + `has no raw fs.*(<...file_path...>) (N-8b, C-4)` + `ToolProxy delegates to the shared helper (no private resolver)` + `Base64ProxyService string and provider modes agree (back-compat)` | ✅ PASS (4 tests) |

#### 2.2.5 E2E-API — `regression-sa4e-356.e2e.test.ts` — 3/3 harness PASS (363ms); manual close-gate PENDING

| STC Case | Level của bằng chứng | Test | Result |
|----------|---------------------|------|--------|
| E2E-API-01 (REG-1) | CI anti-regression harness | `relative repro never touches process.cwd() or the network on fallback`: relative `jira_attach_file("SA4E-355", "documents/SA4E-355/FSD.md")` → fail-CLOSED `PATH_NO_WORKSPACE`, message KHÔNG chứa `Programs\Kiro`, 0 HTTP calls | ✅ PASS (harness) |
| E2E-API-01 (REG-1) | **Manual close-gate trên real Kiro host** | attach thành công lần đầu + Jira evidence + call count ≤2/file (N-6) | ⏳ **PENDING** (bấm mục 4) |
| E2E-API-02 (REG-2) | CI harness | `absolute attach succeeds with the resolved location` (buffer byte-identical + FormData basename `FSD.md`) + `absolute attach tolerates drive-letter casing on win32` | ✅ PASS (harness) |
| E2E-API-02 (REG-2) | **Manual confirmation trên real host** | absolute path 2 dạng `C:\` + `c:\` trên Jira thật | ⏳ **PENDING** (bấm mục 4) |

> **Lưu ý quan trọng (không claim PASS):** Harness CI chứng minh *anti-regression by construction* — relative path KHÔNG THỂ resolve vào `process.cwd()` nữa. Nhưng nó KHÔNG thay thế được ý nghĩa "attach thành công lần đầu tiên trên extension host thật với workspace mở + Jira thật" của close-gate trong BRD Story 5. Ticket chỉ CLOSE khi REG-1 manual PASS.

### 2.3 Non-SA4E-356 Failures (Excluded)

**Không có.** 0 test FAIL trong toàn bộ 2660 + 19 tests.

---

## 3. Manual SIT Results

**N/A — 0 SIT cases** theo STP §2.1 / STC §6: toàn bộ hành vi deterministic đã được automate; không có UI surface; không có exploratory scope. Không có kết quả SIT nào trong report này.

---

## 4. REG-1 / REG-2 Manual Close-Gate — ⏳ PENDING (không claim pass)

### 4.1 Lý do PENDING

REG-1/REG-2 close-gate yêu cầu: (1) real Kiro/VS Code extension host với extension SA4E-356 đã build+install và workspace `C:\projects\kiro\SDLC-Agents-4-Enterprise` mở; (2) Jira credentials thật để attach evidence lên issue SA4E-355. Cả hai điều kiện không khả dụng trong session test execution này (MCP/extension host degraded, Jira tools không cấu hình trên standalone backend — xem RUN-LOG #7/#8, STATUS.json INC-1). Theo chỉ đạo SM: đánh dấu PENDING, ghi rõ steps, KHÔNG claim pass.

### 4.2 Manual Steps cho User/QA (nguồn: STC §5 + STP §2.4 + file `regression-sa4e-356.e2e.test.ts` header comment)

**REG-1 (E2E-API-01 — relative replay, P1 Critical):**
1. Build & install extension mới (`cd extension && npm run esbuild-production` rồi install VSIX vào Kiro) — extension SA4E-356 (commit ≥ `7c525a8`).
2. Mở Kiro/VS Code với workspace `C:\projects\kiro\SDLC-Agents-4-Enterprise` (workspace MỞ — precondition bắt buộc).
3. Gọi MCP tool: `jira_attach_file(issue_key="SA4E-355", file_path="documents/SA4E-355/FSD.md")` — **relative, KHÔNG fallback absolute**.
4. ✅ Expected: thành công ở **lần gọi đầu tiên** (không retry); attachment xuất hiện trên issue SA4E-355 với đúng tên + nội dung; ghi lại attachment ID làm evidence.
5. Mở rộng sang bộ docs SA4E-355 còn lại (BRD.md, TDD.md, … mô phỏng 18-file run trước đây) — tất cả attach thành công bằng relative path.
6. Đếm tổng tool calls: **≤ 2 call/file** (N-6 — pattern "fail-then-absolute-retry" hệ thống phải biến mất).
7. Spot-check 1 relative call mỗi tool còn lại: `embed_image` (markdown+PNG thật), `mem_ingest_file` (text file thật), `drawio_export_png` (.drawio thật) — tất cả thành công từ workspace root.

**REG-2 (E2E-API-02 — absolute control, backward compat):**
1. Cùng host như REG-1.
2. Gọi `jira_attach_file(issue_key="SA4E-355", file_path="C:\projects\kiro\SDLC-Agents-4-Enterprise\documents\SA4E-355\FSD.md")` — absolute → thành công, vị trí resolve giống hệt pre-fix.
3. Lặp với dạng lowercase-drive `c:\projects\…` → thành công (R-1 robustness).
4. Spot-check 1 absolute call mỗi tool còn lại → tất cả thành công.

**Redaction evidence trước khi attach lên Jira (STP §4.4, N-QA5):** redact OS username trong mọi path (`C:\Users\<name>` → `C:\Users\<redacted>`); KHÔNG forward raw log fields (`rawPath`/`resolvedPath`/`rootPath`) vào Jira/Confluence — chỉ attach evidence đã redact + `CODE:` prefix. SM verify redaction tại close gate.

**Quy tắc đóng ticket:** REG-1 FAIL → ticket KHÔNG đóng (quay lại audit helper + wiring). REG-1 PENDING → ticket CHƯA đủ điều kiện đóng (trạng thái hiện tại).

---

## 5. Defect Summary

**Không có defect nào được phát hiện trong Phase 6 test execution** (0 Critical, 0 Major, 0 Minor, 0 Trivial). Không có re-test round nào cần thiết.

Ghi chú phân loại (không phải defect Phase 6):
- **SA-02** (log-forging gap backend, Low) — đã được DEV fix trước Phase 6 (commit `7c525a8`); verified trong session này qua backend `tsc` 0 errors + **drawio-tool suite 19/19 PASS** (bao gồm 2 assert branch (b) sanitize).
- **SA-01 / SA-03..SA-07** — security findings pre-existing/follow-up từ Phase 5.7, ngoài phạm vi test ticket này; SM đã có kế hoạch follow-up (SECURITY-ASSESSMENT §6–7).

---

## 6. Quality Gates & NFR Verification

| Gate / NFR | Target | Actual | Status |
|------------|--------|--------|--------|
| N-7 Coverage `PathResolver.ts` | ≥95% statements+branches+functions+lines | **100%** (38/38 stmts, 36/36 branches, 7/7 funcs, 38/38 lines) | ✅ Met |
| N-8 Scan `--all` | 0 raw-resolve remnants trong `extension/src/` | **0 violations** (523 production files scanned) | ✅ Met |
| N-8 Scan `--staged` | Gate pass | **PASS** (không có staged file — working tree clean tại `7c525a8`) | ✅ Met |
| tsc extension (`--noEmit`) | 0 errors | 0 errors | ✅ Met |
| tsc backend (`--noEmit`) | 0 errors | 0 errors | ✅ Met |
| eslint extension (`src/`) | 0 errors | 0 errors (exit 0) | ✅ Met |
| N-1 Resolution latency | mean <1ms/10k resolves (p95 <0.1ms) | Benchmark test `resolves 10k paths with mean < 1 ms` PASS (22ms/10k ≈ 2.2µs mean) | ✅ Met |
| N-3 0 escape leaks | 0/24 corpus rows + 0 fuzz counterexample | 0 leaks (PBT-03 + UT-03 corpus 8 rows + N-QA2 quirks 9 tests) | ✅ Met |
| N-4 Absolute position preservation | byte-identical | UT-02 + PBT-01 + E2E-API-02 harness PASS | ✅ Met |
| N-5 Description-only schema diff | empty diff excl. `description` | SCAN-01 test asserts shape/required/type untouched (M-3) — PASS | ✅ Met |
| N-6 Agent retries | ≤2 calls/file | **CHƯA đo được** — chỉ đo được tại REG-1 manual trên real host | ⏳ PENDING |
| N-9 Payload caps 10/25 MB | fail-loud + boundary ±1 | UT-14 ×4 PASS | ✅ Met |
| N-2 Activation ≤ +50 ms | extension host profiling | Không đo được trong session (cần real host) — đánh giá qua benchmark N-1 (resolve chi phí ~µs, không có thay đổi activation-path khác ngoài import tĩnh) | ⚠️ Deferred (risk thấp) |

---

## 7. Test Metrics (STP §9.1)

| Metric | Formula | Target | Actual | Status |
|--------|---------|--------|--------|--------|
| Test Execution Rate | Executed/Total | 100% (33/33) | 33/33 case được thực thi (31 automated full + 2 harness) | ✅ |
| Pass Rate | Passed/Executed | 100% | 100% automated (0 FAIL); 2 manual gate PENDING | ✅ (với pending) |
| AC Coverage | ACs covered/5 | 100% | 5/5 (AC-5 partial — pending manual REG) | ✅ / ⏳ AC-5 |
| FR Coverage | FRs/11 | 100% | 11/11 | ✅ |
| BR Coverage | BRs/13 (+BR-06b) | 100% | 13/13 | ✅ |
| Module Coverage (N-7) | stmts+branches PathResolver.ts | ≥95% | 100% | ✅ |
| Escape Leakage (N-3) | leaks/corpus | 0 | 0 | ✅ |
| Payload Cap (N-9) | boundary ±1 cả 2 caps | 100% | 4/4 | ✅ |
| Agent Retries (N-6) | calls/files REG-1 | ≤2.0 | chưa đo (manual) | ⏳ |
| Critical Defects | count | 0 | 0 | ✅ |
| Defect Fix Rate | fixed/total | 100% | N/A (0 defects) | ✅ |

---

## 8. Exit Criteria Assessment (STP §2.5 — đánh giá từng criterion)

| # | Exit Criterion (STP §2.5) | Trạng thái | Bằng chứng |
|---|---------------------------|------------|------------|
| 1 | **PBT:** 4/4 properties hold, 0 counterexample shrunk to leak | ✅ ĐẠT | §2.2.1 — PBT-01..04 PASS (fast-check, 0 counterexample) |
| 2 | **UT:** 15/15 pass + coverage PathResolver.ts ≥95% | ✅ ĐẠT | §2.2.2 — 15/15 PASS; N-7 = 100% |
| 3 | **IT:** 10/10 pass; resolve-fail không HTTP/fs side-effect; D2 vẫn pass; SQ-1 skip logged nếu không tạo được symlink | ✅ ĐẠT | §2.2.3 — 10/10 PASS; I-3 verified (`request` not called); D2 TC-42..45 PASS; SQ-1 chạy thật không cần skip |
| 4 | **E2E-API:** REG-1 relative replay attach thành công; REG-2 absolute control pass; call count ≤36/18 files | ⚠️ **CHƯA ĐẠT (PENDING)** | CI harness 3/3 PASS (anti-regression by construction) nhưng **manual close-gate trên real host CHƯA chạy** → mục 4 của report; N-6 chưa đo |
| 5 | **SCAN:** SCAN-01 100% tools carry "workspace" rule trên 4 surfaces; N-5 diff description-only; SCAN-02 0 forbidden patterns | ✅ ĐẠT | §2.2.4 — 8/8 PASS; N-8 gate `--all` 0 violations/523 files |
| 6 | **Ticket close:** tất cả trên + full suite green + OI-1 follow-up ticket created/cross-linked | ⚠️ **CHƯA ĐỦ ĐIỀU KIỆN** | Full suite green ✅; REG-1/2 pending ⚠️; OI-1 follow-up ticket (drawio_auto_layout proxy-route) do SM tạo/cross-link trước close |

---

## 9. Evidence Files

| File | Description | Section |
|------|-------------|---------|
| TEST-REPORT-SA4E-356.csv | Bảng 33 case + mapping file:test + result + duration | Toàn report |
| Vitest output (full suite) | 278 files / 2660 tests PASS — 179.66s | §2.1 |
| Vitest coverage output | PathResolver.ts 100% (4 metrics) | §6 N-7 |
| N-8 script output | `PASSED: scanned 523 in-scope production file(s); no N-8 violations` | §6 N-8 |
| Backend drawio-tool output | 19/19 PASS (695ms) | §2.2.2 UT-10/UT-15 + SA-02 verify |
| (PENDING) Jira attachment IDs | Sẽ có sau REG-1/REG-2 manual — attach lên issue theo redaction §4.2 | §4 |

> PNG/DOCX export DEFERRED theo chỉ đạo SM (MCP degraded) — không export report này ra DOCX, không ingest KB trong session này.

---

## 10. Conclusion

**Overall Verdict: ⚠️ CONDITIONAL PASS — Chấp nhận được đưa UAT, với điều kiện REG-1/REG-2 manual close-gate phải PASS trên real host trước khi CLOSE ticket.**

Phần cốt lõi của fix đã được chứng minh toàn diện: helper `resolveWorkspacePath` đúng contract (relative→workspace root, absolute passthrough, escape fail-loud 0-leak, BR-06b, R-1 casing, NUL sanitize, payload caps, symlink guard), wiring đủ 6 tools + 2 mem_ingest_file paths + 4 schema surfaces, và zero regression trên 2660 test hiện có. Riêng close-gate AC-5 (replay repro trên real Kiro host với Jira evidence + N-6 call-count) là tiêu chí duy nhất chưa chứng minh được — đúng như thiết kế, nó bắt buộc chạy manual và không thể substitute bằng harness CI.

| Metric | Result |
|--------|--------|
| Automated tests (PBT + UT + IT + SCAN) | 31/33 case PASS; 2770 tests (2660 ext + 19 backend + thêm per-file) 0 FAIL |
| E2E-API harness | 3/3 PASS; manual close-gate 0/2 (PENDING) |
| Manual SIT | 0/0 (N/A theo STP §2.1) |
| Bugs found | 0 |
| Re-test rounds | 0 |
| Critical/Major defects | 0 |
| Gates | N-7 ✅ · N-8 ✅ · tsc×2 ✅ · eslint ✅ · N-9 ✅ · N-6 ⏳ |

**Recommendation:**
1. **Cho phép chuyển sang UAT** — toàn bộ chức năng in-scope đã xanh ở mọi mức có thể tự động hóa; không có defect mở.
2. **KHÔNG đóng ticket** cho đến khi: (a) REG-1 + REG-2 manual PASS trên real Kiro host theo steps §4.2 (ai chạy: user/QA có Jira credentials; evidence redact theo STP §4.4); (b) SM tạo + cross-link follow-up ticket OI-1 (STP §2.5 constraint).
3. SM cập nhật STATUS.json/testing + attach report này + CSV lên Jira khi MCP restore.

---
---

## Appendix A: Re-Test History

**No re-test rounds required** — 0 test FAIL trong cả hai lần chạy (full suite lần 1 và các per-file re-runs lấy bằng chứng mapping), không có bug nào cần fix/retest.

```
Round 1 (2026-10-12) → 2660/2660 extension PASS · 19/19 backend PASS · 0 FAIL · 0 defects
```

## Appendix B: Execution Log (thứ tự theo STP)

| # | Step (SM directive) | Command | Kết quả | Duration |
|---|---------------------|---------|---------|----------|
| 1 | Full suite | `cd extension && npm run test` | 278 files / 2660 tests PASS, 0 FAIL | 179.66s |
| 2 | Coverage gate N-7 | `cd extension && npm run test:coverage` | 278/2660 PASS + PathResolver.ts **100%** (≥95% thresholds) | 146.88s |
| 3 | Per-file evidence | `npx vitest run <file>` ×8 + backend drawio-tool | path-resolver 70, schema-scan 8, backend-local-tools 42, attachment 7, tool-proxy 12, wrapper-server 26, regression-e2e 3, stream-write-reject 3, backend drawio-tool 19 — tất cả PASS | 363–898ms/file |
| 4 | Backend | `npx tsc --noEmit` + `npx vitest run drawio-tool.test.ts` | tsc 0 errors; 19/19 PASS (SA-02 included) | ~1s |
| 5 | Gates | `check-pathresolver-n8.sh --all` / `--staged` · extension tsc · eslint | N-8: 0 violations (523 files) / PASS; tsc 0; eslint 0 | ~2min |
| 6 | REG-1/REG-2 | manual trên real Kiro host | **PENDING** — precondition không khả dụng (extension host + Jira credentials) | — |

## Appendix C: Chi tiết phân bổ test counts per file (đối chiếu STP §2.7)

| File test | Tests | Thuộc STC case |
|-----------|-------|----------------|
| `src/services/__tests__/path-resolver.test.ts` | 70 | PBT-01..04, UT-01..09, UT-11, UT-12, N-QA2 corpus, Format-1 builders, N-1 |
| `src/__tests__/backend-local-tools.test.ts` | 42 | IT-01, IT-02, IT-07, IT-09, IT-10, UT-13, UT-14, D2 (TC-44/45) |
| `src/__tests__/wrapper-server.test.ts` | 26 | IT-05 (wrapper), IT-06, TC-29 envelope, D2 (TC-42/43) |
| `src/mcp/atlassian/__tests__/attachment-tools.test.ts` | 7 | IT-03, IT-04, IT-08 |
| `src/proxy/__tests__/tool-proxy.test.ts` | 12 | IT-05 (chat), IT-08, D2 |
| `src/__tests__/schema-description-scan.test.ts` | 8 | SCAN-01, SCAN-02 |
| `src/__tests__/regression-sa4e-356.e2e.test.ts` | 3 | E2E-API-01/02 (CI harness) |
| `src/__tests__/stream-write-reject.test.ts` | 3 | IT-01 variants |
| `backend/src/engine/tools/__tests__/drawio-tool.test.ts` | 19 | UT-10, UT-15 (+SA-02 assert) |
| **Còn lại 270 file test khác** | 2,470 | Regression suite (zero regression) |
| **Tổng extension** | **2,660** | 278/278 files |

---

*— Hết Test Execution Report SA4E-356 (Phase 6) — Verdict: CONDITIONAL PASS · 0 defects · REG-1/REG-2 manual close-gate PENDING —*
