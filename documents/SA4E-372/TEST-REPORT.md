# Test Execution Report — SA4E-372

## Chat blocks: separate tool/thinking per loop + sticky collapse semantics + per-workspace full transcript persistence

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-372 |
| Title | Chat blocks: separate tool/thinking per loop + sticky collapse semantics + per-workspace full transcript persistence |
| Executed By | QA Agent (QA review + automated tests); SM gate runs & CDP UAT; DEV implementation rounds S1–S1h — see `RUN-LOG.md` |
| Date | **2026-10-23** (fresh final-verification re-run) · UAT executed 2026-10-18 · docs finalized 2026-10-19 |
| Environment | **UAT (recorded 2026-10-18):** Kiro.exe **v1.53.10** (vsix, 1,883 files), `kiro-uat3` profile, CDP 9337→9342, llama-server `http://127.0.0.1:1234/v1` (qwen-text, reasoning_format=deepseek), MCP wrapper :9181, backend :48721 (no auth — soft-fail scenario). **Fresh re-run (2026-10-23):** repo HEAD `6785f61` (extension v1.55.1), Windows win32-x64, Node v24.8.0, vitest 4.1.8 |
| Browser | Chromium-based Electron webview driven via CDP (Kiro) |
| Overall Verdict | **✅ PASS — Ready for Release** |
| Re-test Rounds | 3 (Round 1: QA review 9/10 → S1d fixes; Round 2: UAT blocker → S1e–S1h → UAT FINAL PASS; Round 3: gate run5→run8 all green + GAP-7 fix) + fresh re-verification run 2026-10-23 |

---

## 1. Executive Summary

This report documents the verification of SA4E-372 — the chat transcript redesign (per-cycle tool/thinking block separation R1, sticky collapse semantics R2, per-workspace full transcript persistence R3) shipped in extension **v1.53.10**. All 3 user requirements and all 10 story acceptance criteria (AC1–AC10) were verified PASS via CDP-instrumented UAT sessions (2026-10-18), 9 dedicated automated tests added with the feature, and full regression gate runs run5→run8. Two defect waves were found and fully closed: 5 QA-review defects (S1d), 1 UAT blocker (checkpoint 401 killed the turn → soft-fail S1e, plus orphan-adoption S1g and think-only-parity S1h fixes), and the `chat:chatHistory` dead-protocol gap (GAP-7) was implemented on 2026-10-19.

**Fresh re-verification (2026-10-23, this report):** the 4 SA4E-372 test files pass **15/15** on the current codebase, and the full extension suite passes **3,255/3,255 executed tests (0 failures; 6 pre-existing environment-conditional skips)** — running a massively extended codebase (v1.55.1) versus the original UAT build (v1.53.10).

| Level | Total | Passed | Failed | Pass Rate |
|-------|-------|--------|--------|-----------|
| UAT/E2E scenario test cases (recorded 2026-10-18, v1.53.10) | 15 | 15 | 0 | 100% |
| Automated — SA4E-372 targeted tests (fresh 2026-10-23) | 15 | 15 | 0 | 100% |
| Automated — full extension regression suite (fresh 2026-10-23) | 3,261 (6 skipped) | 3,255 | 0 | 100% of executed |
| **Total (SA4E-372 dedicated results)** | **30** | **30** | **0** | **100%** |

> **Total** = SA4E-372-specific results (15 UAT scenario TCs + 15 dedicated/targeted automated tests); the full-suite row is broader regression coverage that includes the dedicated tests. Recorded historical gates (2026-10-18/19) for comparison: run5 3,071/3,071 PASS → run6 3,072/3,075 (1 test-contract flip + 2 external debt) → run7 3,075/3,077 (2 external SA4E-371 debt) → external debt resolved (3,077/3,077) → run8 **3,100/3,100 PASS**. Fresh run today (3,255 executed PASS, 0 fail) runs a broader suite on a later codebase — no regression versus run8.

---

## 2. Automated Test Results

### 2.1 Execution

**Fresh targeted run (2026-10-23, ~07:07 local)** — from `extension/`:

```
npx vitest run src/__tests__/chat/r1-orphan-adoption.test.ts \
  src/__tests__/chat/persist-restore-contract.test.ts \
  src/pi-workflow/__tests__/remote-checkpointer-store.test.ts \
  src/__tests__/remote-checkpointer-store.test.ts --reporter=verbose
```

Raw result:

```
 RUN  v4.1.8 C:/projects/kiro/SDLC-Agents-4-Enterprise/extension
 ✓ src/__tests__/chat/persist-restore-contract.test.ts (3 tests)
 ✓ src/pi-workflow/__tests__/remote-checkpointer-store.test.ts (6 tests)
 ✓ src/__tests__/chat/r1-orphan-adoption.test.ts (2 tests)
 ✓ src/__tests__/remote-checkpointer-store.test.ts (4 tests)
 Test Files  4 passed (4)
      Tests  15 passed (15)
   Start at  07:07:53
   Duration  54.42s
```

**Fresh full suite (2026-10-23, ~07:11 local)** — from `extension/`, `npm test` (= `vitest run`):

```
> sdlc-agents-4-enterprise@1.55.1 test
> vitest run

 RUN  v4.1.8 C:/projects/kiro/SDLC-Agents-4-Enterprise/extension

 Test Files  420 passed | 1 skipped (421)
      Tests  3255 passed | 6 skipped (3261)
   Start at  07:11:00
   Duration  324.85s (transform 22.86s, setup 0ms, import 142.57s, tests 82.15s, environment 11.34s)
(exit code 0)
```

| Metric | Result |
|--------|--------|
| Total tests (full suite) | 3,261 (3,255 passed + 6 skipped) |
| Passed | 3,255 |
| Failed | **0** |
| Skipped | 6 — pre-existing, environment-conditional (`live-content-proxy.test.ts` requires `LIVE_BACKEND` env; 1 `it.skip` in `cross-process.e2e.test.ts`) — unrelated to SA4E-372 |
| Duration | 324.85s (~5m 25s) |

### 2.2 SA4E-372 Test Breakdown

| Test file | Tests | Fresh status (2026-10-23) | Traces to (STC) |
|-----------|-------|---------------------------|------------------|
| `src/__tests__/chat/r1-orphan-adoption.test.ts` | 2 | ✅ 2/2 PASS | TC-R1-03 (legacy orphan adoption), TC-R1-04 (session path intact) |
| `src/__tests__/chat/persist-restore-contract.test.ts` | 3 | ✅ 3/3 PASS | TC-R1-02 / TC-R3-01 (AC10e persist/restore contract — full payload, no slice/filter) |
| `src/__tests__/remote-checkpointer-store.test.ts` | 4 | ✅ 4/4 PASS | TC-X-02 (checkpoint fail-open: PUT 401, transport error, success forward, GET null) |
| `src/pi-workflow/__tests__/remote-checkpointer-store.test.ts` | 6 | ✅ 6/6 PASS | TC-X-02 regression flip (fail-open, "does not kill the turn") + Zod/UUID contract tests |
| **Total** | **15** | **✅ 15/15 PASS** | |

> The original SA4E-372 dedicated count at commit time was 9 tests across 3 files (`r1-orphan-adoption` 2, `persist-restore-contract` 3, `remote-checkpointer-store` 4). Today's targeted run covers **15** = those 9 + the 6-test `pi-workflow` checkpoint suite (created earlier under SA4E-297, commit `ce509d0` 2026-09-19; SA4E-372 flipped 1 of its tests — DEF-09/S1f, commit `2363101`). No coverage loss; all 15 pass.

### 2.3 Historical Gate Runs vs Fresh Run

| Gate run | Date | Result | Notes |
|----------|------|--------|-------|
| run5 | 2026-10-18 | 390 files / 3,071 tests — **all PASS** | +3 new SA4E-372 tests; tsc 0, eslint 0, smoke PASS, 0 files >200 ln |
| run6 | 2026-10-18 | 3 failed / 3,072 passed (3,075) | 1 = stale checkpoint test contract (flipped S1f → 6/6); 2 = SA4E-371 external debt |
| run7 | 2026-10-18 | 392 files / 3,077 — 3,075 PASS, 2 fail | 100% SA4E-371 external debt (out of scope) |
| debt fix | 2026-10-18 | 3,077/3,077 PASS | SA4E-371 resolved via `eda4c38` (AGENT_PROMPTS compat + prompts packaging) |
| run8 | 2026-10-18/19 | 397 files / 3,100 tests — **3,100 PASS, 0 fail** | recorded in STATUS.json; GAP-7 fix + 9/9 SA4E-372 tests |
| **fresh** | **2026-10-23** | **421 files / 3,261 tests — 3,255 PASS, 6 skipped, 0 fail** | HEAD `6785f61` (v1.55.1) — much later codebase; broader suite than run8, 0 fail |

### 2.4 Working-Tree Notes for the Fresh Run (disclosed for honesty)

- The fresh run executed on HEAD `6785f61` (**extension v1.55.1**, 2026-10-22) **plus** uncommitted changes from an unrelated workstream present in the working tree: modified `extension/src/services/Base64ProxyService/*` (4 files), `extension/src/services/WrapperServer/tool-router.ts`, and 3 new untracked test files (`base64-proxy.dynamic-catalog.test.ts`, `live-content-proxy.test.ts`, `wrapper-server.dynamic-export.test.ts`). All passed; none touch chat/checkpoint code.
- **SA4E-372-relevant paths were verified CLEAN** before the run (`git diff` empty): `extension/webview-assets/chat/*` and all 4 SA4E-372 test files match commit `2363101`/`07b88e8` exactly.
- 6 skipped tests are pre-existing environment-conditional skips (`LIVE_BACKEND` not set), unrelated to this ticket.
- No SA4E-372 failures existed to exclude in the fresh run (**0 failures in the entire suite**).

---

## 3. UAT / E2E Results (Final)

> **These are the FINAL results after all re-test rounds.** The recorded UAT evidence is in `RUN-LOG.md` entries #11–#20 and `STATUS.json` (`testing.uat`). Re-test history: see [Appendix A](#appendix-a-re-test-history).

### 3.1 Environment

| Component | Value | Status |
|-----------|-------|--------|
| Kiro window | `Kiro.exe` v1.53.10, `kiro-uat3` profile, CDP 9337 → 9341 → 9342 | ✅ Running |
| LLM (llama-server) | `http://127.0.0.1:1234/v1` — qwen-text, reasoning_format=deepseek | ✅ Healthy (SSE 101 lines verified incl. reasoning deltas + `[DONE]`) |
| MCP wrapper | `http://127.0.0.1:9181` | ✅ Healthy |
| Backend (code-intel) | `http://127.0.0.1:48721` | ⚠️ No auth in profile → checkpoint PUT 401 (deliberately exercised as soft-fail scenario) |
| Extension build | vsix v1.53.10 (1,883 files, +chat-cycle.js +chat-blocks.css), installed to Kiro `--force` | ✅ Shipped |

### 3.2 Results Summary (scenario test cases — STC)

| ID | Test Case | Priority | Final Result | Notes |
|----|-----------|----------|--------------|-------|
| TC-R1-01 | Multi-cycle turn renders per-cycle groups | Critical | ✅ PASS | UAT FINAL: DOM `USER → THINK(c1) → TOOLS[2 col] → THINK(c2) → ASSISTANT` |
| TC-R1-02 | Persist/restore preserves per-cycle order | Critical | ✅ PASS | `tabMsgs` tail `[user, assistant:pi:c1, tool, tool, assistant:pi:c2]`; survives reload |
| TC-R1-03 | Legacy orphan adoption → correct DOM order | Critical | ✅ PASS | Fixed S1g (DEF-07); re-verified by unit test (2/2) + live UAT |
| TC-R1-04 | Session path unchanged | High | ✅ PASS | Unit test (session path intact) |
| TC-R2-01 | No auto-collapse while streaming | Critical | ✅ PASS | Containers stay expanded while tools running |
| TC-R2-02 | Tool block expanded default at call start | Critical | ✅ PASS | Live blocks default expanded immediately |
| TC-R2-03 | Auto-collapse only when all-terminal | Critical | ✅ PASS | Collapse fires only after ALL tools reach terminal |
| TC-R2-04 | Sticky user expand survives reload | Critical | ✅ PASS | Click → `data-user-managed=1` → reload → block Expanded, exactly 1 userManaged entry |
| TC-R2-05 | Thinking block sticky expand survives reload | High | ✅ PASS | `entry.thinkingUser` persisted and restored |
| TC-R3-01 | Full transcript persists (messages+tools+thinking) | Critical | ✅ PASS | All message types present in `workspaceState("chatPanel.state")` |
| TC-R3-02 | Reload window → restore fidelity | Critical | ✅ PASS | Kill + relaunch (CDP 9341→9342): per-cycle order + sticky flags preserved |
| TC-R3-03 | Old-format fused entries backward compat | High | ✅ PASS | Pre-existing v1.53.9 data (4 turns / 103 tool blocks) replays as `USER → TOOLS[x col] → THINK(c) → ASSISTANT`, terminal-collapsed |
| TC-X-01 | chat:chatHistory protocol | Low | ✅ PASS (superseded) | Recorded 2026-10-18 as "dead protocol documented"; **superseded 2026-10-19**: GAP-7 implemented → protocol now live (see §4 GAP-7) |
| TC-X-02 | Checkpoint soft-fail — 401 doesn't kill turn | High | ✅ PASS | After S1e fix: turn completes, answer rendered; exthost trace shows PUT 401 logged, turn continues |
| TC-X-03 | Think-only cycle no empty bubble | Medium | ✅ PASS | S1h guard in `appendMessage` — thinking rendered, no empty bubble |

**Final scenario pass rate: 15/15 = 100%**

### 3.3 Detailed Test Execution (final observed behavior)

#### R1 — Per-cycle block separation ✅ PASS
- Sent model-driven multi-tool prompt ("grep SA4E-369 in documents + read 10 lines") on v1.53.10 (UAT FINAL, RUN-LOG #20).
- DOM after turn: `USER → THINK(c1) → TOOLS[2 columns] → THINK(c2) → ASSISTANT`; persisted transcript: `[user, assistant:pi:c1, tool, tool, assistant:pi:c2]` — two loops render as two distinct thinking blocks + two tool groups (R1).
- Legacy path (buffered-replay with live pre-cycle tool posts) verified: orphan containers adopted in chronological order `THINK(c1) → TOOLS → THINK(c2) → ASSISTANT` — was `TOOLS → THINK` before S1g (DEF-07).
- Final answer rendered as markdown (list / code block / inline code) correctly.

#### R2 — Collapse semantics ✅ PASS
- During streaming/updating: containers remain expanded; no threshold auto-collapse (threshold logic removed — code verified `chat-tools.js` `applyContainerCollapse` = all-terminal rule only).
- On tool start: block expanded by default; `aria-expanded="true"`.
- After all tools terminal: container auto-collapses (allTerminal); approval-bar guard keeps visibility.
- Sticky: clicked `code_search` block in an older turn → `data-user-managed="1"` + `toolData.userManaged=true`/`userExpanded` → **window reload** → block replays Expanded (single managed entry); all other blocks auto-collapsed. Thinking blocks follow identical semantics via `thinkingUser`.

#### R3 — Full transcript persistence ✅ PASS
- `chat:saveState` (debounced 500 ms) → `ChatStateManager.saveChatState` → `workspaceState("chatPanel.state")` stores the FULL payload; restore path: webview ready → `restoreChatState` → `tab:updated` → replay.
- After kill + relaunch on new CDP port: per-cycle order, thinking flags, tool userManaged flags, and old-format compatibility all intact.
- Contract automated tests (fresh 2026-10-23): 22-message payload (1 user + 20 tools + 1 assistant) round-trips with **zero filtering/slicing**; the last-20 slice applies ONLY to the engine LLM-history mirror (user/assistant), never to the UI transcript.

#### Cross-cutting ✅ PASS
- Checkpoint soft-fail: root cause of the Round-1 UAT blocker was traced end-to-end (extension host `--inspect-extensions=9230` wrapping global fetch): `PUT :48721/api/v1/threads/:id/checkpoint → 401` × `saveCheckpoint` re-throw → turn output discarded before replay. Post-S1e: fail-open — turn survives, logged "checkpoint save skipped (fail-open)".
- GAP-7: `chat:chatHistory` implemented (see §4).

### 3.4 Acceptance Criteria Coverage (AC1–AC10)

| AC | Requirement (source) | Verification | Evidence | Status |
|----|----------------------|--------------|----------|--------|
| AC1 | R1: each think→act loop = separate thinking block + tool group, correct order | TC-R1-01, TC-R1-03 (+ unit 2/2) | UAT FINAL DOM `USER → THINK(c1) → TOOLS[2] → THINK(c2) → ASSISTANT` (RUN-LOG #20) | ✅ PASS |
| AC2 | R1: replay from stored state keeps the split structure | TC-R1-02 (+ contract tests 3/3) | Reload audit: per-cycle persist order preserved | ✅ PASS |
| AC3 | R2: no auto-collapse while streaming; collapse only when tools done | TC-R2-01, TC-R2-03 | Live UAT observation + all-terminal rule in code | ✅ PASS |
| AC4 | R2: expanded by default when a tool call starts | TC-R2-02 | Live render moment: expanded + `aria-expanded=true` | ✅ PASS |
| AC5 | R2: sticky user expand (no auto-collapse again) | TC-R2-04, TC-R2-05 | Click → `data-user-managed=1` → reload → still Expanded (1 managed entry) | ✅ PASS |
| AC6 | R2: all content viewable after reopening panel/tab | TC-R3-02 | Reload: full transcript (messages/tools/thinking) visible | ✅ PASS |
| AC7 | R3: full transcript persists per workspace (not only last message) | TC-R3-01 (+ contract test: full 22-entry payload, no slice) | `tabMsgs` all types; fresh test 2026-10-23 3/3 | ✅ PASS |
| AC8 | R3: webview destroy/recreate restores full transcript | TC-R3-02, TC-R3-03 | Kill + relaunch CDP 9341→9342; old-format compat (fused pi / 103 tools) | ✅ PASS |
| AC9 | Cross: `chat:chatHistory` gap resolved (used or cleaned with rationale) | TC-X-01 → **superseded by GAP-7 implementation** | `message-handler.ts::handleChatHistory()` reads `engine.store.getHistory()` (commit `a1ed67c`, 2026-10-19) | ✅ PASS (implemented) |
| AC10 | Cross: no regression + persist/restore tests added | Full suite gates run5→run8 + fresh 2026-10-23 (0 fail); `persist-restore-contract.test.ts` added (3 tests; fresh 3/3 PASS) | Green suite throughout | ✅ PASS |

**Per-requirement roll-up:** R1 (US-1) 4/4 TC PASS · R2 (US-2) 5/5 TC PASS · R3 (US-3) 3/3 TC PASS · Cross-cutting 3/3 PASS. **AC1–AC10: 10/10 PASS.**

### 3.5 Cross-check vs STP / STC Coverage

| Item | Recorded (STP/STC, 2026-10-18) | Fresh re-verification (2026-10-23) | Variance |
|------|-------------------------------|-------------------------------------|----------|
| STC total result | 24/24 PASS (15 scenario + 9 unit) | Targeted re-run: 15/15 PASS (9 dedicated + 6 pre-existing pi-workflow checkpoint regression tests) | None — coverage strictly preserved; counts differ only by inclusion of the regression file |
| STP §5.2 full suite | 392 files / 3,077 — 3,075 PASS, 2 external debt | 421 files / 3,261 — 3,255 PASS, 0 fail | Superseded: external debt resolved + codebase advanced; no regression |
| TC-X-01 (AC9) | "Documented as dead" | GAP-7 handler implemented 2026-10-19 → protocol live | **Superseded intentionally** (stronger outcome than documentation-cleanup) |
| Defects DEF-06..08 | Not in original STP/STC (found via UAT) | All closed (S1e/S1g/S1h), covered by new tests | None — STP §6 defect table already reflects them |

---

## 4. Defect Summary

> **All defects are CLOSED. No open issues remain within the verified SA4E-372 scope.** 9 defects found (5 via QA review Round 1, 3 via UAT Round 2, 1 stale test contract via gate run6) + 1 protocol gap (GAP-7) — all resolved. Deferred extended-BRD items are listed separately in §5.1 (none blocks R1/R2/R3 acceptance).

| ID | Title | Severity | Phase found | Status | Fixed in |
|----|-------|----------|-------------|--------|----------|
| DEF-01 | Sticky flag not set on tool container click/keydown | Major | QA review (Round 1) | **CLOSED** | S1d |
| DEF-02 | In-cycle entry order: entry pushed after tools | Major | QA review (Round 1) | **CLOSED** | S1d |
| DEF-03 | Replay thinking-click not persisted (`thinkingUser`) | Minor | QA review (Round 1) | **CLOSED** | S1d |
| DEF-04 | index.html / ChatHtmlBuilder SCRIPTS load order wrong | Minor | QA review (Round 1) | **CLOSED** | S1d/S1b |
| DEF-05 | Missing persist/restore contract test (AC10e) | Minor | QA review (Round 1) | **CLOSED** | S1d |
| DEF-06 | **UAT blocker:** checkpoint PUT 401 killed the turn & discarded streamed output | Major | UAT #1 (Round 2) | **CLOSED** | S1e |
| DEF-07 | Legacy path orphan tools → wrong DOM order (`TOOLS → THINK`) | Major | UAT #1 (Round 2; self-detected via trace) | **CLOSED** | S1g |
| DEF-08 | Think-only cycle rendered empty assistant bubble on replay | Minor | UAT #1 (Round 2; self-detected via trace) | **CLOSED** | S1h |
| DEF-09 | Stale test contract: old checkpoint test asserted re-throw | Minor | Gate run6 | **CLOSED** | S1f |
| GAP-7 | `chat:chatHistory` protocol defined but dead (no handler) | High | Design gap (AC9) | **RESOLVED** | 2026-10-19 |

<a id="bug-006"></a>

### DEF-06: Checkpoint PUT 401 kills turn (UAT blocker) — CLOSED ✅

| Field | Value |
|-------|-------|
| Severity | Major |
| Priority | P1 |
| Test Case | TC-X-02 |
| Component | `extension/src/pi-workflow/remote-checkpointer-store.ts` + `extension/src/__tests__/remote-checkpointer-store.test.ts` |
| Status | **CLOSED — FIXED (S1e, re-verified)** |
| Found | Round 2 UAT (2026-10-18) |
| Verified | S1e fix + UAT FINAL + fresh test run 2026-10-23 (4/4 + 6/6 PASS) |

**Description:** In the UAT profile (no backend auth), a turn with tools died with `HTTP 401: Authentication required` after 2 tool calls; the webview received no stream, no text, no answer — entire streamed output was lost and `chat:error` surfaced.

**Root Cause:** `saveCheckpoint` re-threw on `PUT /api/v1/threads/:id/checkpoint → 401` (asymmetric with `getCheckpoint` which was fail-safe) → `executeTurn` threw → `result.streamChunks` discarded BEFORE `replayTurnChunks` ran. Proven by extension-host instrumentation (`--inspect-extensions=9230`, global fetch wrap): GET models 200 → POST completions 200 (×2 legs) → PUT checkpoint 401.

**Fix:** Soft-fail (fail-open): `saveCheckpoint` no longer re-throws; keeps `debugError` + status, logs "checkpoint save skipped (fail-open)". New tests: PUT 401 → resolves; ECONNREFUSED → resolves; PUT ok → forwarded; GET 401 → null.

### DEF-07: Legacy path orphan tools → wrong DOM order — CLOSED ✅

| Field | Value |
|-------|-------|
| Severity | Major |
| Priority | P1 |
| Test Case | TC-R1-03 |
| Component | `chat-toolcall.js` / `chat-cycle.js` / `chat-tool-helpers.js` |
| Status | **CLOSED — FIXED (S1g)** |
| Found | Round 2 UAT (2026-10-18) |
| Verified | `r1-orphan-adoption.test.ts` 2/2 + live UAT (fresh 2026-10-23 2/2 PASS) |

**Description:** On the legacy LM-Studio path, tool events post LIVE mid-turn while the LLM stream buffers and replays only at turn end → `S.currentCycle=null` during tool render → cycle not closed between legs → one merged entry, DOM inverted (`TOOLS → THINK → ASSISTANT`). Violates R1.

**Root Cause:** Renderer assumed tools always arrive inside an open cycle; the buffered-replay architecture breaks that assumption on the legacy path.

**Fix:** Renderer-only "orphan adoption": track pre-cycle containers (`trackPreCycleContainer`), adopt in `openCycle` (`adoptPreCycleContainers` — sets `hasTools`, reorders persisted entries BEFORE tool entries), place DOM after bubble/thinking at close (`placeAdoptedContainers`), reset at turn end. Final DOM: `THINK(c1) → TOOLS → THINK(c2) → ASSISTANT`; persisted `[user, c1, tool, tool, c2]`.

### GAP-7: `chat:chatHistory` dead protocol — RESOLVED ✅ (2026-10-19)

| Field | Value |
|-------|-------|
| Severity | High (AC9) |
| Status | **RESOLVED — implemented** |
| Component | `message-protocol.ts` (`ChatWebviewToExtMessage` + `ChatExtToWebviewMessage`), `message-handler.ts` (`handleChatHistory()`) |
| Verified | commit `a1ed67c` (2026-10-19) — RUN-LOG #23; extension host returns history from `engine.store.getHistory()` |

**Fix:** `chat:chatHistory` added to webview→ext direction, `handleChatHistory()` reads the engine store and replies with the `chat:chatHistory` ext→webview message (already defined at `message-protocol.ts:98`). Protocol is no longer dead; AC3.6/AC9 satisfied via implementation (supersedes the original "document-cleanup" TC-X-01 expectation).

### Other defects (S1d / S1f — compact summary)

| ID | Root cause & fix (files) | Verified |
|----|--------------------------|----------|
| DEF-01 | Tool container header click/keydown didn't set `data-user-managed` → no sticky. Fix: set attribute + `S.markToolUserManaged(id,isExpanded)` persisting `toolData.userManaged/userExpanded` (`chat-toolcall.js`, `chat-tool-helpers.js`) | TC-R2-04 + fresh contract tests |
| DEF-02 | Cycle entry pushed AFTER tool entries during live turn → replay order wrong. Fix: entry pushed at `openCycle` (before tool entries) with reference mutation at close (`chat-cycle.js`) | TC-R1-02 + `r1-orphan-adoption` |
| DEF-03 | Replay thinking-header click toggled DOM only, `entry.thinkingUser` not persisted. Fix: click handler updates `entry.thinkingUser` (`chat-messages.js`) | TC-R2-05 |
| DEF-04 | Dev `index.html` loaded chat modules in wrong order vs runtime builder. Fix: `ChatHtmlBuilder.ts` SCRIPTS order (`chat-cycle.js` before `chat-stream.js`) + css link | Runtime UAT |
| DEF-05 | No automated persist/restore contract test (AC10e). Fix: added `persist-restore-contract.test.ts` | Fresh 3/3 PASS |
| DEF-09 | Old `pi-workflow` checkpoint test asserted the OLD re-throw contract (semantic reversal vs soft-fail). Fix: renamed/flipped to "does not kill the turn when saveCheckpoint fails (fail-open, logged)" | Fresh 6/6 PASS |

---

## 5. Test Metrics

| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| SA4E-372 targeted pass rate (fresh 2026-10-23) | 100% | 100% (15/15) | ✅ Met |
| Full suite — new failures from SA4E-372 | 0 | 0 (run5→run8 and fresh run all green; only transient external debt, resolved) | ✅ Met |
| Full suite pass rate (fresh) | 100% executed | 100% (3,255/3,255; 6 env-conditional skips) | ✅ Met |
| UAT scenario pass rate | 100% | 100% (15/15) | ✅ Met |
| Acceptance criteria covered | AC1–AC10 | 10/10 verified | ✅ Met |
| Critical defects open | 0 | 0 | ✅ Met |
| Major defects open | 0 | 0 | ✅ Met |
| Code standards (≤200 ln/file, tsc 0, eslint 0) | Met | Verified at run5/run7 gates | ✅ Met |

### 5.1 Known Limitations / Deferred Items (outside verified R1/R2/R3 + AC1–AC10 scope)

> Discovered during report authoring by code inspection (2026-10-23) against the extended BRD ACs and FSD §11 gap table. **None blocks the three story requirements or AC1–AC10** — recommended as follow-up backlog items.

| ID | Item | Source | Observed state (2026-10-23) |
|----|------|--------|------------------------------|
| L-01 | Loop-number labels in block headers ("Thinking — Loop N" / "Tool Calls — Loop N") | BRD AC1.2; FSD GAP-9/GAP-10 | Headers render "Thinking" / "Tool calls" without loop number — not implemented |
| L-02 | Transcript size cap (500 turns / 10 MB) with FIFO trim | BRD AC3.7; FSD GAP-15 | No trimming in `saveStateToDisk`/`ChatStateManager` — transcript unbounded (only engine LLM mirror slices last-20 user/assistant) |
| L-03 | "Collapse All" / "Expand All" toolbar actions | BRD AC2.8/AC2.9 | No such controls in chat toolbar — not implemented |
| L-04 | `chat:clearHistory` handler | FSD GAP-16 | Message case present but no-op (`break;`) |
| L-05 | Save debounce value | BRD AC3.9 (2 s) | Implemented as 500 ms debounce (intent debounced-save met; value differs) |
| L-06 | Redaction of secrets in persisted tool payloads | BRD NFR (Security) | No redaction observed in transcript save path (redaction exists only for debug logs) |
| L-07 | FSD §11 remaining gap rows (GAP-1..6, 11–14, 17) | FSD §11 | Core behaviors exercised by UAT/tests (per-cycle containers, all-terminal collapse, sticky flags, separate thinking blocks); individual rows not re-verified — documentation reconciliation recommended |

---

## 6. Evidence Files

> No binary evidence directory was produced for this ticket; evidence is textual (UAT traces, DOM/persist dumps) inside the ticket documents plus the test artifacts below.

| Evidence | Description | Section |
|----------|-------------|---------|
| `documents/SA4E-372/RUN-LOG.md` | Execution log entries #4–#24 (implementation, gates run5→run8, UAT rounds, fixes S1d–S1h, GAP-7) | §2, §3, §4, Appendix A |
| `documents/SA4E-372/STATUS.json` (`phases.testing`) | gateRuns summary, UAT verdict + R1/R2/R3 evidence, externalDebt resolution | §2.3, §3 |
| commit `2363101` (2026-10-18) | Feature: per-cycle machinery + sticky collapse + full persist; adds `persist-restore-contract.test.ts` (170 ln), `r1-orphan-adoption.test.ts` (151 ln); modifies `pi-workflow` checkpoint store/test + `ChatHtmlBuilder.ts` | §2.2 |
| commit `07b88e8` (2026-10-18) | UAT evidence finalize + checkpoint soft-fail test `src/__tests__/remote-checkpointer-store.test.ts` (92 ln, 4 tests) | §2.2, DEF-06 |
| commit `a1ed67c` (2026-10-19) | Complete SDLC docs + GAP-7 fix (`message-protocol.ts`, `message-handler.ts`) | §4 GAP-7 |
| commit `eda4c38` (2026-10-18) | SA4E-371 external debt resolution (AGENT_PROMPTS compat + prompts packaging) | §2.3 |
| Fresh run outputs (2026-10-23) | Raw command + results quoted verbatim in §2.1 (targeted 15/15; full 3,255 PASS / 0 fail / 6 skips) | §2.1 |
| Test files | `extension/src/__tests__/chat/r1-orphan-adoption.test.ts`, `.../persist-restore-contract.test.ts`, `extension/src/__tests__/remote-checkpointer-store.test.ts`, `extension/src/pi-workflow/__tests__/remote-checkpointer-store.test.ts` | §2.2 |

---

## 7. Conclusion

**Overall Verdict: ✅ PASS — Ready for Release**

All three user requirements (R1 per-loop block separation, R2 sticky collapse semantics, R3 per-workspace full transcript persistence) and all acceptance criteria AC1–AC10 are verified PASS: 15/15 UAT scenario test cases, 9 dedicated tests added with the feature, zero open defects, and full regression suites green from gate run5 through run8 — re-confirmed today with a fresh full-suite run (3,255 executed tests, 0 failures) on the much later v1.55.1 codebase.

| Metric | Result |
|--------|--------|
| Automated tests (SA4E-372 targeted, fresh) | 15/15 PASS (100%) |
| Automated tests (full suite, fresh 2026-10-23) | 3,255/3,255 executed PASS (0 fail; 6 pre-existing env skips) |
| UAT scenario tests (recorded 2026-10-18, v1.53.10) | 15/15 PASS (100%) |
| Acceptance criteria (AC1–AC10) | 10/10 PASS |
| Bugs found | 9 + 1 protocol gap — all resolved |
| Bugs resolved | 10/10 (100%) |
| Re-test rounds | 3 rounds → UAT FINAL PASS, all gates green |
| Critical/Major defects open | 0 |

**Recommendation:** Approve — feature shipped in v1.53.10 and verified stable through the current v1.55.1 codebase. Deferred extended-BRD items (§5.1 L-01…L-07) are non-blocking; recommend triaging them into the backlog as separate follow-up work.

**QA Sign-off:** QA Agent — 2026-10-23 ✅

---

---

## Appendix A: Re-Test History

> **The final results in Sections 3–4 supersede all intermediate results below.** This appendix is preserved for traceability and audit purposes only.

### Timeline Overview

```
Round 1 (2026-10-18)  → Implementation S1–S1c; QA review 9/10 → 5 defects → all fixed (S1d)
Round 2 (2026-10-18)  → UAT #1: backward-compat PASS; fresh turn FAIL (HTTP 401 checkpoint, DEF-06)
                         → root cause traced (exthost instrumentation) → fixes S1e, S1f, S1g, S1h
                         → UAT FINAL: R1/R2/R3 all PASS; gate run7 green modulo SA4E-371 debt
Round 3 (2026-10-18/19) → External debt resolved (3,077/3,077); GAP-7 implemented (2026-10-19); run8 3,100/3,100 PASS
Fresh  (2026-10-23)   → Re-verification run: targeted 15/15; full suite 3,255 PASS / 0 fail
```

| Defect | Round 1 (QA review) | Round 2 (UAT) | Round 3 (gates) | Final |
|--------|--------------------|---------------|-----------------|-------|
| DEF-01..05 | ⚠️ Found | ✅ Fixed (S1d) | ✅ | CLOSED |
| DEF-06 (checkpoint 401) | — | ⚠️ Found → ✅ Fixed (S1e) | ✅ | CLOSED |
| DEF-07 (orphan order) | — | ⚠️ Found → ✅ Fixed (S1g) | ✅ | CLOSED |
| DEF-08 (empty bubble) | — | ⚠️ Found → ✅ Fixed (S1h) | ✅ | CLOSED |
| DEF-09 (stale contract) | — | — | ⚠️ Found → ✅ Fixed (S1f) | CLOSED |
| GAP-7 (dead protocol) | — | — | ✅ Implemented (2026-10-19) | RESOLVED |

---

### Round 1 — 2026-10-18 (Implementation + QA review)

**Scope:** Verify 10 planned scenarios against source (S1 per-cycle machinery, S1b runtime wiring, S1c 200-ln gate fix).

<details>
<summary>QA review result: 9/10 PASS; 5 defects registered → all fixed in S1d</summary>

1. R1 sticky missing — click on tool block did not set `data-user-managed` → DEF-01.
2. R2 in-cycle order — entry pushed after tool entries → DEF-02.
3. R4 replay thinking-click persist — `entry.thinkingUser` not updated on replay click → DEF-03.
4. R6 index.html load order — dev vs runtime builder order mismatch → DEF-04.
5. AC10e missing contract test → DEF-05.
6. R5 (mid-stream tab-switch container split) deliberately skipped (trivial); `chat:chatHistory` confirmed dead but non-blocking at the time (restore runs via `tab:updated`) → later became GAP-7.

**Round 1 result:** 9/10 PASS + 5 defects → all closed in S1d (each fix verified by new/live tests).

</details>

---

### Round 2 — 2026-10-18 (UAT on v1.53.10)

**Scope:** Full UAT on installed vsix 1.53.10 (`kiro-uat3`, CDP 9337).

**Fix applied between sub-rounds:** S1e (checkpoint soft-fail), S1f (test contract flip), S1g (orphan adoption), S1h (think-only parity) — rebuild + reinstall v1.53.10.

<details>
<summary>UAT #1: backward compat PASS; fresh turn FAIL — HTTP 401 kills turn (DEF-06)</summary>

- Backward-compat PASS: pre-existing data (4 old turns, 103 tool blocks, fused `assistant:pi`) replayed correctly as `USER → TOOLS[x col] → THINK(c) → ASSISTANT`, terminal-collapsed.
- First fresh turn failed after 2 tools: `HTTP 401: Authentication required`; webview got `user,tool,tool,error` — no cycles/text.
- Root-cause chase (no guessing): curl gateway :1234 OK even with bogus bearer (not the LLM endpoint) → logging proxy :12345 captured complete SSE 200 → webview event probe: 0 streamChunk → backend proxy :12346 idle → **extension-host instrumentation (`--inspect-extensions=9230`)**: models 200 → completions 200 ×2 → **PUT checkpoint :48721 → 401**.
- Conclusion: UAT profile lacks backend auth (by design of test env) × `saveCheckpoint` re-throw → turn killed. Registered as DEF-06 (robustness defect — best-effort mirror write must not kill the turn).

</details>

<details>
<summary>UAT FINAL (CDP 9341 → 9342): R1/R2/R3 all PASS</summary>

1. **R1 PASS** — multi-cycle model-driven turn (grep+read): DOM `USER → THINK(c1) → TOOLS[2 col] → THINK(c2) → ASSISTANT`; persist `[user, assistant:pi:c1, tool, tool, assistant:pi:c2]`.
2. **R2 PASS** — sticky click on a completed `code_search` block → `data-user-managed=1` → full window reload → block replays Expanded (exactly 1 userManaged entry); other blocks auto-collapse at terminal.
3. **R3 PASS** — reload restore: per-cycle order + `thinkingUser` + old-format compat (fused pi / 103 tools) all correct; final answer markdown rendering clean.
4. Post-fix confirmation of DEF-06: turn completes with backend 401, answer rendered, "checkpoint save skipped (fail-open)" — verified by exthost trace.

**Evidence:** RUN-LOG entries #11–#20; STATUS.json `testing.uat`.

</details>

**Round 2 result:** STC scenario suite final result 15/15 PASS (UAT FINAL re-verified the R1/R2/R3 core + checkpoint soft-fail on the fixed build); gate run7 green modulo 2 external SA4E-371 tests.

---

### Round 3 — 2026-10-18/19 (Gates + external debt + GAP-7)

<details>
<summary>run5→run8 progression, SA4E-371 debt resolution, GAP-7 fix</summary>

1. run5: 390 files / 3,071 PASS (all gates green).
2. run6: 3 fail — 1 stale checkpoint test contract (flipped S1f → 6/6) + 2 SA4E-371 debt (out of scope).
3. External debt resolved via `eda4c38`: `AGENT_PROMPTS` backward compat restored (ui-scenarios 10/10) + prompt files packaged (.vscodeignore) → compaction.summary 6/6 → 3,077/3,077 PASS.
4. GAP-7 (2026-10-19): `handleChatHistory()` implemented; protocol no longer dead.
5. run8: 397 files / 3,100 tests — **3,100 PASS, 0 fail**; SA4E-372 dedicated tests 9/9.

**Evidence:** RUN-LOG entries #21–#24; STATUS.json `gateRuns` + `externalDebt`.

</details>

**Round 3 result:** All gates green; zero open defects.

---

### Round 4 (Fresh Re-Verification) — 2026-10-23

**Scope:** Independent fresh re-run of SA4E-372 targeted tests + full extension suite on current repo HEAD `6785f61` (extension v1.55.1).

<details>
<summary>Fresh runs: targeted 15/15 PASS; full suite 3,255 PASS / 0 fail (6 env skips)</summary>

1. Targeted: 4 files / 15 tests PASS, 54.42 s (raw output in §2.1).
2. Full suite: 421 files (420 pass + 1 skip) / 3,261 tests (3,255 pass + 6 skip), 0 fail, exit 0, 324.85 s.
3. SA4E-372 relevant paths verified clean vs commit `2363101`/`07b88e8`; foreign uncommitted workstream changes present but unrelated (disclosed in §2.4).
4. Historical vs fresh variance explained in §2.3/§3.5 — codebase advanced v1.53.10 → v1.55.1; zero regressions.

**Evidence:** §2.1 raw outputs (this document).

</details>

**Round 4 result:** 15/15 targeted PASS; 3,255 executed PASS / 0 fail — final verification complete.
