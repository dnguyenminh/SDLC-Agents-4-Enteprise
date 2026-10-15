# Test Execution Report — SA4E-364

## [SDLC Chat] Wire MCP tools của extension vào chat agent (mcp-bridge-extension)

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-364 |
| Title | [SDLC Chat] Wire MCP tools của extension vào chat agent (mcp-bridge-extension là dead code) |
| Executed By | QA Agent (Phase 6 Testing) |
| Date | 2026-10-16 |
| Environment | Windows 11, VS Code extension workspace `extension/`, branch **SA4E-364** (uncommitted working tree: hunks SA4E-364 + user WIP SA4E-THINKING + WIP SA4E-362), vitest 4.1.8, npm/tsc |
| Linked Documents | STP.md v1.0, STC.md v1.0 (30 TCs), TDD.md, FSD.md v1.1, BRD.md v1.0, testdata/*.csv (5 files), evidence/implementation-notes.md (DEV) |
| Overall Verdict | **✅ PASS — 23/23 automated in-scope cases green; build + lint exit 0; ready for manual UAT (human gate)** |
| Re-test Rounds | 1 (single execution round; no in-scope re-tests needed) |

---

## 1. Executive Summary

Phase 6 testing for SA4E-364 executed the full STC v1.0 suite: **23 automated cases (PBT-2, UT-18, IT-3) all PASS** across the 4 target test files (53/53 individual test runs green), full regression suite **2949/2950 PASS** with the single failure verified as **out-of-scope** (caused by the user's uncommitted `SA4E-THINKING` WIP hunk, not SA4E-364 hunks), `npm run build` and `npm run lint` both exit 0. Test implementation was reviewed against the STC spec — **no red flags** (real McpBridge in IT, real entry-point seams in wiring tests, AC-3 asserted on the tool registry per the DISCOVERY_TOOLS trap guidance). 4 documented DEV deviations were each verified against the real code and **accepted**.

| Level | Total | Passed | Failed | Pass Rate |
|-------|-------|--------|--------|-----------|
| Automated (PBT + UT + IT) | 23 | 23 | 0 | 100% |
| SIT (suite + build, automated) | 3 | 3 | 0 | 100% (SIT-01 with 1 out-of-scope fail, see §2.3) |
| Manual UAT (E2E-UI) | 4 | 0 | 0 | NOT RUN — reserved for human gate |
| **In-scope total** | **30** | **26** | **0** | **100% of executed** |

> Out-of-scope note: 1 suite failure (`pi-session-routing.test.ts`) and 3 previously-failing `Pega*` tests (SA4E-362 WIP, now green) are excluded from the SA4E-364 verdict — analysis in §2.3.

---

## 2. Automated Test Results

### 2.1 Execution

Commands run from `extension/` (per CICD-CHECK.md §3), executed fresh by QA on 2026-10-16 (not trusted from DEV report):

| Command | Result |
|---------|--------|
| `npx vitest run src/pi-agent/extensions/__tests__/mcp-bridge-extension.test.ts` | ✅ 26/26 pass (603ms) |
| `npx vitest run src/pi-workflow/__tests__/bridge-wiring-legacy.test.ts` | ✅ 3/3 pass (1.88s) |
| `npx vitest run src/pi-workflow/__tests__/bridge-wiring-session.test.ts` | ✅ 6/6 pass (1.53s) |
| `npx vitest run src/mcp/__tests__/mcp-bridge.test.ts` | ✅ 18/18 pass (515ms) |
| `npm test` (full suite) | ⚠️ 2949/2950 pass (136s) — 1 fail, out-of-scope (§2.3) |
| `npm run build` (tsc -p ./) | ✅ exit 0; `buildMcpBridgeAgentTools` present in `out/pi-agent/extensions/mcp-bridge-extension.js` (SIT-02 verify) |
| `npm run lint` (eslint src/) | ✅ exit 0 |

### 2.2 SA4E-364 Test Breakdown

**Per-file results (STC target files):**

| STC File | STC Cases Contained | Individual Run |
|----------|--------------------:|----------------|
| `src/pi-agent/extensions/__tests__/mcp-bridge-extension.test.ts` (append describe) | UT-01..03, UT-11..18, PBT-01 (12 new) | ✅ 26/26 (14 pre-existing + 12 new) |
| `src/pi-workflow/__tests__/bridge-wiring-legacy.test.ts` (new) | UT-04, UT-05, PBT-02 (3 new) | ✅ 3/3 |
| `src/pi-workflow/__tests__/bridge-wiring-session.test.ts` (new) | UT-06..10, IT-03 (6 new) | ✅ 6/6 |
| `src/mcp/__tests__/mcp-bridge.test.ts` (append) | IT-01, IT-02 (2 new) | ✅ 18/18 (16 pre-existing + 2 new) |
| **Total new STC cases** | **23 (PBT-2, UT-18, IT-3)** | **✅ 23/23** |

New-case count matches STC exactly (STP §5 counts: 23 automated + 4 manual UAT + 3 SIT = 30 TCs). No test removed or skipped.

**Detailed per-case results (all executed this round):**

| TC | Title | Result | Evidence |
|----|-------|--------|----------|
| PBT-01 | Property — build mọi tổ hợp options (200 runs, fast-check) | ✅ PASS | vitest run log |
| PBT-02 | Property — merge skip-if-exists qua adapter thật (40 runs) | ✅ PASS | vitest run log |
| UT-01 | buildMcpBridgeAgentTools trả đúng 4 tool | ✅ PASS | vitest run log |
| UT-02 | Shape AgentTool — parameters toBe same-reference từ TOOLS | ✅ PASS | vitest run log |
| UT-03 | execute success + audit auto-approved, không leak param | ✅ PASS | vitest run log |
| UT-04 | Legacy merge — collision ext thắng + warn (qua engineSpy) | ✅ PASS | vitest run log |
| UT-05 | Legacy — ext runtime fail vẫn merge bridge | ✅ PASS | vitest run log |
| UT-06 | Session customTools 2+4 + allowlist (qua createAgentSession capture) | ✅ PASS | vitest run log |
| UT-07 | FR-09 — promptSnippet/promptGuidelines undefined cho bridge | ✅ PASS | vitest run log |
| UT-08 | Loadout schemaTokens tăng đúng name-only, ≤ cap | ✅ PASS | vitest run log |
| UT-09 | Role filter BA/QA/undefined | ✅ PASS | vitest run log |
| UT-10 | Escalation minimal drop bridge, giữ core | ✅ PASS | vitest run log |
| UT-11 | AC-3 mặc định — không execute_dynamic_tool trong registry | ✅ PASS | vitest run log |
| UT-12 | AC-3 opt-in === true → 5 tools; false/0/undefined → 4 | ✅ PASS | vitest run log |
| UT-13 | AC-4 — McpServerNotRunningError → text chính xác, resolve | ✅ PASS | vitest run log |
| UT-14 | EC-2 — validation fail + boundary 4000/4001 + no audit | ✅ PASS | vitest run log |
| UT-15 | EC-4 — approvalHook false → approval_denied + audit | ✅ PASS | vitest run log |
| UT-16 | EC-6/EC-7 — timeout + generic error text | ✅ PASS | vitest run log |
| UT-17 | EC-1 defense-in-depth — chaining_denied khi chưa opt-in | ✅ PASS | vitest run log |
| UT-18 | EC-3 — target ngoài TOOL_ALLOWLIST → denied + control case | ✅ PASS | vitest run log |
| IT-01 | Real McpBridge stopped → fail-closed, invokeTool 0 lần, <50ms | ✅ PASS | vitest run log |
| IT-02 | Real McpBridge running → success qua transport thật | ✅ PASS | vitest run log |
| IT-03 | Session type-guard real/undefined/foreign — fail-safe | ✅ PASS | vitest run log |
| SIT-01 | Full suite npm test | ✅ PASS* | §2.3 (*1 out-of-scope fail) |
| SIT-02 | Build tsc + export trong compile output | ✅ PASS | §2.1 |
| SIT-03 | Invariants N-1/N-7/N-8 giữ nguyên + đúng số test mới (+23) | ✅ PASS | tool-loadout-invariants + audit + skeleton tests green trong suite |
| E2E-UI-01..04 | Manual UAT (Extension Development Host) | ⏸️ NOT RUN | Reserved for human gate (§7) |

### 2.3 Non-SA4E-364 Failures (Excluded)

**Full suite: 2950 tests / 2950 executed, 2949 passed, 1 failed** (304 files: 303 passed, 1 failed).

| # | Failing test | Analysis | Classification |
|---|--------------|----------|----------------|
| 1 | `src/pi-workflow/__tests__/pi-session-routing.test.ts` → "cloud provider with key routes to the session path" (line 116: expects `promptTurn('hi', Any<Function>, Any<Function>)` — 3 args; production now passes 4) | Git diff of `src/pi-workflow/pi-workflow-adapter.ts` verified by QA: the 4th `promptTurn` argument (lines 311–315, reasoning-deltas callback) carries the comment `// SA4E-THINKING: ...` — a **user WIP hunk**, not an SA4E-364 hunk. SA4E-364 hunks in this file are limited to (a) the `buildMcpBridgeAgentTools` import and (b) the legacy-pool merge block, neither of which touches the `promptTurn` call signature. | **Out of scope — pre-existing/user WIP (SA4E-THINKING)**. Not counted against SA4E-364. |
| — | `PegaBfsPipeline.auth-dead.test.ts` (2) + `PegaStreamIngester.auth-retry.test.ts` (3 total) — failed at DEV run time | QA re-run shows these **now pass** in the current working tree (transient SA4E-362 concurrent WIP at the time of the DEV run). | **Out of scope — SA4E-362 WIP, resolved in current tree.** |

**Module dependency analysis for the exclusion:** `pi-session-routing.test.ts` exercises `PiWorkflowAdapter` session/legacy routing — the same module SA4E-364 touches — but the failing assertion pins the `promptTurn` **argument count** of the session-host call, which only the SA4E-THINKING hunk modifies (verified via `git diff` hunks and the `// SA4E-THINKING` marker at the exact added argument). SA4E-364's hunks in that file (import + legacy merge block) are covered green by `bridge-wiring-legacy.test.ts` (UT-04/05/PBT-02), which asserts the merge output through the same `engine.executeTurn` seam.

---

## 3. Manual SIT Results (Final)

### 3.1 Environment

Manual UAT (E2E-UI-01..04) requires the Extension Development Host (F5 or VSIX), a configured LLM provider + API key, and the code-intel MCP server running — per STC §E2E-UI preconditions and `testdata/uat-steps.csv`.

### 3.2 Results Summary

| E2E-UI ID | Scenario | Status |
|-----------|----------|--------|
| E2E-UI-01 | Chat "search KB: personalized rules" → mem_search + MCP_TOOL_RESULT | ⏸️ NOT RUN (manual UAT) |
| E2E-UI-02 | MCP server stopped → error text, chat không crash | ⏸️ NOT RUN (manual UAT) |
| E2E-UI-03 | Debug log xác nhận wiring cả 2 path | ⏸️ NOT RUN (manual UAT) |
| E2E-UI-04 | Recovery — server start lại giữa conversation | ⏸️ NOT RUN (manual UAT) |

### 3.3 Detailed Test Execution

Not executed in this phase. These 4 scenarios validate real-LLM + real-MCP-server behavior inside the VS Code webview (tool call items, MCP_TOOL_RESULT rendering, badge state, in-place recovery) — inherently human-gate tests per STP §4 (E2E-UI = Manual). Automated equivalents already cover the logic: error text (UT-13/IT-01), wiring evidence (UT-04/UT-06/E2E-UI-03's log assertions are covered by UT-04's debugLog assert + UT-06's capture), fail-safe turn continuation (UT-05/UT-16/BR-08 asserts).

---

## 4. Defect Summary

**No defects found in SA4E-364 scope.** All 23 automated in-scope cases passed on first execution; build and lint clean.

Out-of-scope finding (not a SA4E-364 defect, no Jira defect raised by QA): `pi-session-routing.test.ts` fails against the user's uncommitted `SA4E-THINKING` hunk (4th `promptTurn` callback not reflected in the test's 3-arg assertion). Recommended: the SA4E-THINKING ticket (or the user's local WIP) must update that test's assertion to 4 args before merge, otherwise the suite stays red independent of SA4E-364.

---

## 5. Test Metrics

| Metric | Value |
|--------|-------|
| In-scope automated cases executed | 26 (23 STC automated + SIT-01..03) |
| Passed / Failed | 26 / 0 |
| Execution duration | ~140s total (suite 136s; target files <7s combined) |
| Requirement coverage (STC RTM) | AC 6/6, FR 9/9, BR 8/8, EC 7/7, UC 4/4 = 100% mapped to executed cases |
| Defect density (in scope) | 0 |
| New test cases added by DEV vs STC plan | 23 / 23 (exact match — STP §5) |
| Pre-existing security/regression suites (SEC-324-03, SEC-332-09, tool-loadout-*, pi-agent-session-host, adapter-legacy-governance) | All green in full suite (SIT-01 step 2–3 verified) |

---

## 6. Test Code Quality Review (STC Conformance — Phase 6.2 mandatory review)

QA read the actual test source of all 4 files and compared implementation vs STC spec, per the mandatory test-implementation-review rule. Findings per check:

| # | Check (STC requirement) | Verdict | Evidence |
|---|-------------------------|---------|----------|
| 1 | **IT-01/IT-02 use real `McpBridge` + mock `IServerManager`** (STC: "new McpBridge(mockManager)" — not all-mock) | ✅ PASS | `mcp-bridge.test.ts:244-273` — `new McpBridge(manager as never)` with real class; only the manager is a spy (`{ status, invokeTool: vi.fn() }`). IT-01 asserts fail-closed from the real `isAvailable` check (`invokeTool` 0 calls, <50ms); IT-02 asserts real transport pass-through. No mock of bridge/transport. |
| 2 | **Wiring tests drive the real entry point** (engineSpy `executeTurn` / `createAgentSession` capture), not direct service-method calls | ✅ PASS | Legacy: `bridge-wiring-legacy.test.ts:96-108` — `vi.spyOn(adapter.engine, 'executeTurn')` driven by real `adapter.invoke()` (faux provider forces LEGACY path); tools captured from `input.options.tools`. Session: `bridge-wiring-session.test.ts:62-65` — mocked `createAgentSession` captures `opts`, driven by real `ensureSessionHost()`. Both assert on what the production wiring actually hands to the engine/SDK. |
| 3 | **AC-3 asserted on tool registry / build output** (NOT the allowlist string array — DISCOVERY_TOOLS trap, FSD §8.1/OI-04) | ✅ PASS | UT-11 (`mcp-bridge-extension.test.ts:239-244`) asserts the **built array** with an explicit warning comment naming the DISCOVERY_TOOLS trap; UT-04/05 assert the real merged pool via `executeTurn` input (`names).not.toContain('execute_dynamic_tool')`); UT-06 (`bridge-wiring-session.test.ts:130`) asserts `customTools` names (registry), with the allowlist assertion kept **separate** as FR-03 evidence (`opts.tools` contains bridge names — a positive assertion, not the AC-3 target). |
| 4 | **Fail-safe EC-5: invokeTool not called + error text + <50ms** | ✅ PASS | IT-01 (`mcp-bridge.test.ts:255-256`): `expect(manager.invokeTool).not.toHaveBeenCalled()` + `expect(dtMs).toBeLessThan(50)` + exact text `'Error invoking mem_search: MCP Server is not running.'`. UT-13 covers the mock-bridge path with the same exact text and promise-resolve semantics. |
| 5 | **FR-09 promptSnippet/promptGuidelines override asserted** | ✅ PASS | UT-07 (`bridge-wiring-session.test.ts:136-154`): bridge entries → `promptSnippet`/`promptGuidelines` `toBeUndefined()`; `get_workspace_info` **keeps** `'Workspace orientation'` + guidelines (no bleed to existing tools). Matches production `pi-agent-session-host.ts:439-441` (call-site spread override). |
| 6 | **Duplicate / redundant cases across levels** | ✅ PASS (none) | Apparent overlaps are complementary by design: UT-13 (mock bridge reject) vs IT-01 (real bridge error path — different layer per STC); UT-04 (one collision scenario) vs PBT-02 (property over arbitrary pools through the same real seam); UT-01 (FR-01 inventory) vs UT-11 (AC-3 security target). No case re-asserts the same seam+target twice. |

**Red flags searched for and NOT found:** all-mock IT tests (none — IT uses real bridge), tests calling build-then-assert-own-array instead of the real seam (none — STC §5 note 3 "test pass ảo" rule respected), AC-3 asserted on allowlist strings (none), missing negative coverage (none — EC-1..EC-7 each has ≥1 passing case).

**Minor observations (non-blocking, no action required):**
- UT-10 does not explicitly re-assert discovery names (`find_tools`/`execute_dynamic_tool`) kept under `minimal` (STC UT-10 step 3 mentions them); core-6 + minimal flag + bridge-drop are asserted. Discovery retention is pre-existing behavior covered by the tool-loadout suite (green in SIT-01). Severity: Trivial.
- UT-02 step 5 (shape comparison vs `getPiExtensionAgentTools()`) omitted — STC marked it conditional ("nếu khả dụng trong test env"); the 5-field shape pin covers the intent. Severity: Trivial.

**Overall test quality verdict: PASS — test implementation matches STC technique spec.**

---

## 7. Deviations Assessment (4 DEV-reported items, verified against real code)

| # | Deviation | QA Verification | Verdict |
|---|-----------|-----------------|---------|
| 1 | UT-16 timeout text asserted without trailing dot (STC expected `'...60000ms.'`) | Real message at `mcp-bridge.ts:179`: `MCP tool '${toolName}' timed out after ${timeoutMs}ms` — **no trailing dot**. Test asserts `toContain('timed out after 60000ms')` = verbatim `err.message`. STC's expected string was wrong, not the code. | ✅ ACCEPT |
| 2 | Type casts (`as never` / `as unknown as …`) on options/manager in tests | Handler `createExecuteHandler` reads only the 3 picked `BridgeToolOptions` fields (`allowDynamicChaining`, `approvalHook`, `auditLog` — `mcp-bridge-extension.ts:57-60`); casts are type-level only, runtime-safe. Needed for UT-12's non-true values (false/0/undefined) and PBT-01's `fc.record`. | ✅ ACCEPT |
| 3 | PBT-02 runs 40 iterations (STC silent on count for PBT-02; PBT-01's 200 kept) | Each PBT-02 run drives a **full real `adapter.invoke()`** (adapter + engine + merge), ~10x heavier than PBT-01's pure build call. 40 runs still cover 0..4 collisions × sentinel pools per fast-check shrinking. | ✅ ACCEPT |
| 4 | UT-02 pins 5 fields (`name, label, description, parameters, execute`) | All 5 STC-mandated fields asserted; `parameters` asserted `toBe` same-reference (BR-01 evidence); async `execute(id, params)` signature proven by real calls in UT-03/13-18. Step 5 (comparison with ext tools) was STC-conditional. | ✅ ACCEPT |

---

## 8. Conclusion & UAT Readiness

**SA4E-364 verdict: ✅ PASS (automated scope).**

- 23/23 STC automated cases green; SIT-01 suite green except 1 verified out-of-scope failure (user's `SA4E-THINKING` hunk); SIT-02 build + export verified; lint clean.
- Test implementation conforms to the STC technique spec (real seams, real bridge in IT, registry-level AC-3 asserts, FR-09 override, fail-safe latency bound) — quality review PASS with 2 trivial observations.
- All 4 DEV deviations verified against real code and accepted.

**UAT readiness — human gate (mục đích: human gate):** the feature is ready for manual UAT. Remaining manual cases for the UAT gate (STC E2E-UI-01..04, evidence into `documents/SA4E-364/evidence/`):

1. **E2E-UI-01** — chat `search KB: personalized rules` → `mem_search` tool call + `MCP_TOOL_RESULT` rendering + LLM reply citing KB; plus `jira_get_issue` with `SA4E-364`.
2. **E2E-UI-02** — MCP server stopped → tool call returns exact error text inline, chat graceful, follow-up plain chat unaffected (AC-4 real-world).
3. **E2E-UI-03** — debug logs confirm wiring on both paths (session allowlist contains 4 bridge names; legacy `tools=M` +4; no skip-warn in clean env).
4. **E2E-UI-04** — in-place recovery: server restart mid-conversation → next tool call succeeds without chat/extension restart.

These validate behaviors that only exist with a real LLM + real MCP server + webview rendering and cannot be meaningfully automated in vitest (per STP §4 classification).

---

## Appendix A: Re-Test History

### Timeline Overview

| Round | Date | Scope | Result |
|-------|------|-------|--------|
| DEV self-run (pre-handover) | 2026-10-16 | 4 target files 53/53; full suite 2946/2950 (4 fail: 1 SA4E-THINKING + 3 SA4E-362 WIP) | Passed in scope |
| QA execution (this report) | 2026-10-16 | 4 target files 53/53; full suite 2949/2950 (1 fail: SA4E-THINKING; 3 SA4E-362 WIP fails now green) | **Passed — no re-test needed** |

### Round 1 — 2026-10-16 (QA)

- No in-scope failures → no re-test rounds required.
- Environment delta vs DEV run: SA4E-362 concurrent WIP stabilized between the DEV run and the QA run, turning the 3 `Pega*` failures green; the single remaining failure is unchanged and attributed (see §2.3).
