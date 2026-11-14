# TEST REPORT — SA4E-393 Addendum 4 bug fix "vscode is not defined"

Agent: qa-agent | Scope: working tree (uncommitted) | Independent run, dev report not trusted.

## Verdict: PARTIAL
Code-level verification PASS. E2E on a real VSIX via `execute_dynamic_tool` is PENDING (running MCP instance on port 9183 is the old build and still returns "vscode is not defined"; waiting for user reload).

## 1. Real command results (extension/)
| Command | Result |
|---|---|
| `npx tsc --noEmit` | exit 0, no errors |
| `npx eslint src/tools/design-gate src/__tests__/design-gate-*.test.ts` | exit 0, 0 errors, 1 warning: `design-gate-tools.test.ts` 300 lines (> max-lines 200) |
| vitest: no-vscode + tools + security-fix | 3 files / 21 tests passed |
| full `npx vitest run` | 435 files passed, 1 skipped; 3422 tests passed, 6 skipped; 0 failed (233 s) |

## 2. Mutation checks (restored byte-exact)
Hashes (first 12 hex) before == after: `design-gate-tool.ts` D3F91B3E0E0B, `design-gate-resolve.ts` 312682F91A11. `git status` unchanged (14 entries).
| Mutation | Expected | Observed |
|---|---|---|
| M1: append `declare const vscode: any;` + `vscode.workspace.workspaceFolders` use to design-gate-tool.ts | guard RED | RED: `regression guard — no bare declare const vscode in shipped source` failed (1 failed / 20 passed). Other tests stay green because the mutated function is never called; the static guard is the detector. |
| M2: replace realpath containment check in design-gate-resolve.ts with `&& false` | junction test RED | RED: `SEC-F02 ... rejects a junction pointing outside the workspace` failed (expected true to be false); 15 others passed |

Note: an earlier attempt overlapped with a parallel read, which briefly showed the mutated hash; the final state was re-verified clean.

## 3. STC / TDD Addendum 4 (D5/D6) evidence
Note: STC.md has no Addendum 4 section; criteria taken from TDD D5/D6.
| Criterion | Status | Evidence |
|---|---|---|
| D5 unit 1-8 (report shape, path outside, threshold, mode enum, findings_limit, list_rules 30, C6 error, rendered fetchStatus) | Evidenced | design-gate-tools.test.ts (passes); not individually remapped line by line |
| D5 unit 9 / D6 v size guard | PARTIAL | Files all ≤200 lines (max 111). Function limit violated: `mapReportToPayload` in design-gate-payload.ts is 42 lines of body. Pre-existing (42 lines at HEAD, not introduced by this fix). Test file design-gate-tools.test.ts is 300 lines (eslint warning). |
| Fix-specific: works without global vscode | Evidenced | design-gate-no-vscode.test.ts + M1 |
| SEC-F01/F02 path hygiene, junction escape | Evidenced | design-gate-security-fix.test.ts + M2 |
| D6 i: invocable via `execute_dynamic_tool` in real session, visible in tools/list | NOT evidenced | Pending reload; port 9183 old build still errors |
| D6 ii: report JSON matches D1 on real session | NOT evidenced (unit only) | |
| D6 iii: honest PASS/FAIL on fixtures via real session (Integration 2-5) | NOT evidenced e2e | |
| D6 iv: no absolute paths | Unit only | e2e pending |
| D6 v: lint + suite pass | Met for lint/suite; size rule PARTIAL (above) | |
| D6 vi: VSIX contains the tools | Partial | `sdlc-agents-4-enterprise-1.55.18.vsix` (21:39) `extension/out/extension.js` contains `design_gate_run`, no `declare const vscode` string. Not proven the VSIX is built from the final working tree. |
| D6 vii: AGENTS.md Key Rule 8 | Evidenced | AGENTS.md and .kiro/steering/ui-design-gate.md reference design_gate_run |
| Agent-loop demo (FR-AG2 transcripts) | NOT evidenced | needs live instance |

## 4. Pending to reach PASS
1. User reloads window / installs the rebuilt VSIX so the MCP instance runs the fixed build.
2. Run D5 Integration 1-6 and the agent-loop demo through `execute_dynamic_tool`; confirm no "vscode is not defined".
3. Confirm VSIX was built after the final change (rebuild if unsure).
4. Decide on pre-existing `mapReportToPayload` (>20 lines) and the 300-line test file: refactor or accept with justification.

No source files were modified (mutations reverted); nothing committed.

---

## Verify sau fix open issues

Ngày: QA re-run độc lập (không dùng số trong FIX-EVIDENCE). Working tree chưa commit, thư mục `extension/`.

| # | Kiểm tra | Kết quả |
|---|----------|---------|
| 1 | `npx tsc --noEmit` | PASS (exit 0, 0 lỗi) |
| 2 | `npx eslint --no-ignore` trên 42 file đổi/thêm (src/slash, src/tools/design-gate, src/__tests__/design-gate*, extension.ts; không có file đổi trong src/utils) | PASS (exit 0, 0 lỗi/warning) |
| 3 | `npx vitest run` full | PASS: 446 file passed, 1 skipped (447); 3480 tests passed, 6 skipped, 0 failed |
| 4 | design-gate-size-guard | PASS (3/3) |
| 5 | `git status` | Không có file rác mới (tmp, run_*.json, .bak, .log); so với baseline trước khi chạy không khác biệt |
| 6 | Mutation M1: `validateFilePath` về `startsWith` (path-guard.ts) | PASS (mutation bị bắt): `design-gate-fs-adapter-containment.test.ts` > "SEC-F07 containment > blocks sibling directory sharing the root prefix" đỏ (1 failed / 72 passed) |
| 7 | Mutation M2: bỏ `isValidRunId` check trong `loadReport` (report.store.ts) | **FAIL (mutant sống sót)**: toàn bộ 73 tests design-gate vẫn xanh, không test F05 nào đỏ |
| 8 | Hoàn tác mutation | Hash path-guard.ts và report.store.ts khớp bản gốc (SHA256 5BB7D934…B433 / 58FA1955…2091) |

### Finding

- **QA-M2 (Medium, test gap):** `design-gate-report-store.test.ts` chỉ kiểm `loadReport(root, "../x")` trả `undefined`. Kết quả này vẫn đúng khi bỏ regex check, vì `resolveInside` và `existsSync` đã chặn. Không test nào chứng minh rằng `loadReport` từ chối runId sai định dạng nhưng nằm trong store (ví dụ file `Run_1_A.json` hoặc `run_1_a.json.bak` tồn tại trong store, hoặc runId dài hơn 64 ký tự). Đề xuất cho DEV: thêm test tạo file hợp lệ về đường dẫn nhưng sai `RUN_ID_RE` (ví dụ `RUN_1_X.json`, hoặc runId 65 ký tự) và assert `loadReport` trả `undefined`.

### Verdict: **FAIL**

Các kiểm tra tsc, eslint, vitest full, size-guard, git sạch và M1 đều đạt. FAIL vì yêu cầu "M2 phải đỏ" không thỏa: mutant M2 sống sót, nên SEC-F05 trong `loadReport` chưa được test bảo vệ. Không sửa code sản phẩm; mọi mutation đã hoàn tác. Cần DEV bổ sung test rồi QA chạy lại M2.

---

### Lần 1 vs Lần 2

- **Lần 1: FAIL.** Mutant M2 sống sót (bỏ `isValidRunId` trong `loadReport` mà 73 tests design-gate vẫn xanh). Các kiểm tra còn lại đạt. Nội dung lần 1 giữ nguyên ở trên.
- **Lần 2:** dev-agent thêm `describe("loadReport enforces isValidRunId even when the file really exists (QA M2)")` vào `design-gate-report-store.test.ts` (5 case file có thật trong store nhưng sai định dạng: `RUN_1_X`, `run_1_A`, `run_1_a-b`, `run_1_`, runId hợp regex nhưng dài hơn 64 ký tự, cộng 1 control test). QA chạy lại độc lập.

| # | Kiểm tra (lần 2) | Kết quả |
|---|------------------|---------|
| 1 | Mutation M2: thay `if (!isValidRunId(runId)) return undefined;` trong `loadReport` (report.store.ts) bằng comment | **PASS (mutant bị bắt)**: `design-gate-report-store.test.ts` 14 tests, 5 failed, đều thuộc nhóm "loadReport enforces isValidRunId ... (QA M2)" (5 case on-disk, retry x2) |
| 2 | Hoàn tác M2, SHA256 `report.store.ts` | Trước = sau = `58FA19550CD467745951B330155DABF56783A41AF7FB9FAA76A46CE1800C2091` (khớp bản gốc lần 1) |
| 3 | `npx tsc --noEmit` | PASS (exit 0) |
| 4 | `npx eslint --no-ignore` trên 44 file `.ts` đổi/thêm trong `extension/` | PASS (exit 0) |
| 5 | `npx vitest run` full | PASS: 446 file passed, 1 skipped (447); **3486 tests passed**, 6 skipped, 0 failed (lần 1: 3480 passed, chênh +6 = test F05 mới) |
| 6 | design-gate-size-guard | PASS (3/3) |
| 7 | File rác (tmp, .bak, .log, run_*.json) trong `git status` | Không có |

M1 không chạy lại vì lần 1 đã PASS và `path-guard.ts` không được chạm; full vitest lần 2 vẫn xanh.

Không sửa code sản phẩm: mutation M2 chỉ áp tạm và hoàn tác bằng bản sao, hash khớp.

### Verdict cuối: **PASS**

Lỗ hổng test QA-M2 đã đóng: SEC-F05 trong `loadReport` hiện được test bảo vệ, mutant bị bắt. Toàn bộ tsc, eslint, vitest full, size-guard đạt. Chưa commit.
