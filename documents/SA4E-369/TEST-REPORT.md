# Test Execution Report — SA4E-369

## Pi Chatbox Extension — Intra-instance agent-to-agent messaging between chatbox tabs (local PeerBus, zero-config)

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-369 |
| Title | Intra-instance agent-to-agent messaging between chatbox tabs (local PeerBus, zero-config) |
| Executed By | QA Agent (Phase 6 — independent verification run) |
| Date | 2026-10-20 |
| Environment | vitest 4.1.8 headless (extension/), branch `SA4E-369` @ HEAD `53506d2`, Node ≥ 18, Windows |
| Browser | N/A for automated scope (VS Code webview UI is not Playwright-automatable — STP §2.1, TDD §11.1) |
| Overall Verdict | **⚠️ CONDITIONAL PASS** — all executable automated tests PASS (82/82, 100%); 16 manual SIT scenarios remain NOT_RUN awaiting the Phase 6.5 UAT human gate (real Kiro runtime). No open defects. |
| Re-test Rounds | 1 formal execution round in Phase 6 (historical DEV-side green-ups 52→54→82 recorded in RUN-LOG rows 34–42, pre-phase 6) |
| Automated item pass rate | **82/82 executed test cases = 100.0%**; STC coverage with executable evidence = 66/88 item-level (51 FULL + 15 PARTIAL) — see §5 |

---

## 1. Executive Summary

Phase 6 executed the automated portion of the SA4E-369 test plan (STP v1.0). The targeted peer suite was re-run independently by QA for fresh evidence: **15 test files / 82 tests / 82 pass / 0 fail (7.67 s total wall, 325 ms test time)** plus `tsc --noEmit` clean (exit 0). STC automated items map onto the on-disk suite at two fidelity levels: **51 STC items have full 1:1 executable coverage** (file + case cited in §2.2) and **15 have partial coverage** whose residual face (visual prompt appearance, real-instance exchanges, per-tab isolation on-disk artifacts) is, by STP design, gated on the manual SIT track (SIT-01…SIT-16). The automated pass rate of executed tests is **100%**; the full regression sweep TC-800/TC-801 is NOT_RUN due to pre-existing, out-of-scope suite debt (documented in RUN-LOG rows 35–36; 0/22 failing files touch the peer module), and one track is explicitly BLOCKED in-process: **TC-109 (Option B read-only loadout) BLOCKED by D6 = Option A**.

| Level | Total (STP) | Passed | Failed | Pass Rate |
|-------|-------------|--------|--------|-----------|
| Automated (PBT + UT + IT + scan) | 80 planned items / 82 executable cases on disk | 82 cases | 0 | **100.0%** (of executed) |
| Manual SIT | 16 | 0 | 0 (NOT_RUN) | not executed — UAT gate |
| **Total executed** | **82** | **82** | **0** | **100.0%** |

Item-level STC accounting (of 83 TC + 6 PBT = 89 automated item definitions): **51 FULL PASS**, **15 PASS-PARTIAL** (residual requires real runtime — assigned below), **22 NOT RUN** (8 of them are SIT-gated by design; 14 are pure automation gaps listed in §6), **1 BLOCKED** (TC-109, D6). No fabricated results — every PASS in §2.2 traces to a test file and case name on disk at HEAD `53506d2`.

---

## 2. Automated Test Results

### 2.1 Execution

```
cd extension
npx vitest run --reporter=verbose src/__tests__/peer/   # dedicated peer suite (15 files / 82 tests)
npx tsc --noEmit                                        # type-level gate
```

Evidence: `evidence/sa4e-369-peer-suite-final.txt` (verbose capture + tsc section; vitest Start 2026-10-20T11:11:39, branch SA4E-369 @ 53506d2).

| Metric | Result |
|--------|--------|
| Total tests | 82 |
| Passed | 82 |
| Failed | 0 |
| Duration | 7.67 s wall (325 ms test time, transform 938 ms, import 3.76 s) |
| Test files | 15 / 15 passed |
| `tsc --noEmit` | exit 0 |

### 2.2 SA4E-369 Test Breakdown (file → STC mapping, PASS evidence)

| # | Test file (extension/src/__tests__/peer/) | Tests | STC items covered (PASS evidence: file + case names) |
|---|-------------------------------------------|-------|------------------------------------------------------|
| 1 | registry.unit.test.ts | 6 | TC-003, TC-102, TC-300 (BR-1, ×3 cases), TC-411 (I-1), TC-412 (I-4/SEC-08, ×2) |
| 2 | guards.unit.test.ts | 9 | TC-104 (BR-9 reset), TC-105 (roll-off recovery), TC-203 (cap pair-normalized), TC-302 (BR-7 cap 5 LOCKED ×3), TC-303 (per-TAB rate), TC-402 (BR-8 10th/11th boundary), TC-410/TC-605 (I-6a prune-then-check) |
| 3 | threads.unit.test.ts | 6 | TC-306 (BR-11 bound 50, pair isolation), TC-403 (boundary 50th/51st ×2), TC-414 (normalized pair key), I-4 deep copy, I-8 dropThreadsInvolving |
| 4 | task-manager.unit.test.ts | 8 | TC-002/TC-103 (create→get deep copy, poll side-effect-free), TC-106 (header), TC-205 (PEER_006 caller-only, task survives + pollable), TC-207 (unknown taskId PEER_008), TC-208/TC-310 (cancelQueuedFor PEER_009), TC-212 (disposeAll), TC-413 (exactly-once settlement), TC-404 (retention 60 s), PBT-06 (terminal closure) |
| 5 | tools.unit.test.ts | 10 | TC-003/TC-102 (caller-relative rows), TC-200 (PEER_001), TC-207/TC-309 + TC-607/TC-610 (non-owner same-code PEER_008, no existence oracle), TC-601 (3 a2a tools bound), TC-602 (async queued SendResult + rejection envelope), TC-306 (peer_status unknown), TC-401 (queue-cap PEER_005), S-05a–d (BR-10 [PEER REPLY] verbatim frame) |
| 6 | envelope.unit.test.ts | 4 | TC-007 (exact frame ×2, BR-10 verbatim pass-through), TC-505/TC-603 (identity claims never alter header), PBT-04 (fast-check property) |
| 7 | message-size.unit.test.ts | 7 | TC-209 (16,001 zero-state), TC-210 (validation order — PEER_001/002 win, size wins over guards, 4 steps), TC-400 (16,000 accepted / 16,001 rejected), TC-401 (queue-cap step), TC-405 (empty/whitespace), TC-602 (oversized envelope), TC-604 (10× blocked) |
| 8 | marker-forgery.unit.test.ts | 6 | S-04 zero-state forgery (PEER_010 framing violations ×3, lookalike false-positive check, size-before-forgery order, guard-state untouched) — header-mapped TC-201/TC-603; supplements C1 L0 |
| 9 | approval.unit.test.ts | 6 | TC-603 (fail-closed ×4: approve/deny/malformed/pending-throw), TC-802 (user turns bypass gate, turnOrigin default 'user'), TC-108 (approved proceeds / rejected blocks + terminates) |
| 10 | approval-loop.integration.test.ts | 6 | S-02 real ToolApprovalGate loop: AC-S02a (approve → executes, pending event — TC-107 approve path), AC-S02b (deny → {block, terminate: true}, settles FAILED PEER_003 terminal — TC-108), AC-S02c (timeout auto-deny fail-closed), AC-S02d (30 s gate constants), AC-S02e (bridge forwards chat:toolApprovalPending), AC-S02f (real runtime gate resolution) — header STC: TC-603, TC-108 |
| 11 | dispatch.integration.test.ts | 3 | AC-D1 (envelope header-first + verbatim, real §6.2 dispatch loop), AC-D2 (turnOrigin 'peer' — TC-008), AC-D3 (fail-closed gate at host creation — S-02a wiring) — header STC: TC-101 (session request integrity), TC-603 |
| 12 | reply-envelope.integration.test.ts | 2 | S-05e/f (inbound thread entry carries [PEER REPLY] frame; failure marker records PEER_003 frame without internals leak — TC-606 partial) |
| 13 | lifecycle.integration.test.ts | 5 | AC-S01a (tab close → registry empty + queued task cancelled PEER_009 + threads dropped + guards released + host evicted with `evictCalls` assert — TC-310, TC-409 evict half, TC-701), AC-S01b (BR-9 user-activity reset recoverable — TC-104/TC-304), AC-S01c (tab-created → real runtime singleton registration — TC-300/TC-304), ConversationManager closeTab/createTab forwarding (TC-701), I-8 same-wiring cleanup |
| 14 | single-flight.unit.test.ts | 2 | S-03 (SEC-01 L2): AC-S03a (concurrent promptTurn FIFO-chain sequential, tracker stays 'peer'), AC-S03b (failed turn never poisons the chain) — real turn-executor module under test |
| 15 | no-socket.test.ts | 2 | AC7 mechanical scan: no import of net/http/https/dgram/ws/socket.io (bare/node:-prefix/subpath/multiline) + no fetch()/XMLHttpRequest reference — TC-307 (network surface), TC-609 |
### 2.3 Planned vs Implemented Suite Re-leveling (STP §10.1 → disk)

The implemented suite differs from the planned suite list; every planned case remains accountable:

| STP planned suite | Planned level | On-disk realization | Note |
|-------------------|---------------|--------------------|------|
| bus.integration.test.ts (17 ids) | IT | Partially realized across dispatch/approval-loop/lifecycle/reply-envelope integration + harness suites | In-process harness is real-singleton (see mock policy §2.4) |
| governance-passthrough.it.test.ts | IT | Covered compositionally: envelope verbatim (BR-10) + dispatch into real `promptTurn` seam | PEER_007 negative (TC-206) still missing — §6 |
| peer-bus.e2e / peer-guards.e2e / peer-provenance.e2e | E2E | Re-leveled to IT under `helpers.ts` harness (real peer singletons; only the LLM session gateway mocked — permitted seam per TDD §11.3) | Same cases, lower level; runtime pieces → SIT |
| no-network.e2e.test.ts | E2E | no-socket.test.ts (scan-based — same mechanic the planned suite prescribed) | |
| peer-regression.e2e.test.ts | E2E | NOT realized — TC-800/801 (§2.4 + §6) | Out-of-scope debt documented |
| PBT properties 1–6 | PBT | PBT-04 (fast-check in envelope), PBT-06 (task-manager property) executed; PBT-01/02/03/05 not realized | §6; deterministic equivalents executed |

**Mock-policy compliance check (STP §2.1 / TDD §11.3):** `helpers.ts` builds REAL `PeerRegistry` / `AntiLoopGuards` / `PeerThreadStore` / `PeerTaskManager` / `PeerBus` / `dispatchPeerTurn` singletons; the ONLY mock is `PeerSessionGateway.promptTurn` (LLM-backed seam — the explicitly mockable boundary). `approval-loop.integration` exercises the REAL ToolApprovalGate; `single-flight.unit` tests the REAL turn-executor module; `lifecycle.integration` drives the REAL runtime singleton for registration. No local infrastructure is illegally mocked — STC IT discipline satisfied. Each suite rebuilds fresh singletons (I-9).

### 2.4 Non-SA4E-369 Failures (Excluded)

Per SM forensic census (RUN-LOG rows 35–36 — independent baseline worktree 9ae9968 + wiring-revert experiment):

| Test | File | Reason |
|------|------|--------|
| 77 fails / 22 files in the broader full suite | various (TabBar/webview/tabStore WIP areas) | PRE-EXISTING debt of other tickets' work-in-progress landing in the same tree; 0/22 files touch peer; conversation-manager/create-host wiring revert did not change the result (identical fail set) → not an SA4E-369 defect |
| per-tab-session suite 5/6 fail | pi-workflow/__tests__/per-tab-session.test.ts | SA4E-370 test-side bug (mock path './create-host.js' must be '../create-host.js'); out-of-scope, logged to SA4E-370 (RUN-LOG row 37) |

**TC-800/TC-801 implication:** the AC8 "full sweep green" exit criterion cannot be met while the shared tree carries this in-flight WIP. The pass criterion is re-scoped in this report to "peer module introduces no new failures" — satisfied (15/15 files, 82/82). Recommendation: re-run TC-800 on the integration branch once WIP lands. TC-803 (single-tab behavior unaffected) is runtime behavior → UAT observation.

---

## 3. Manual SIT Results (Phase 6.5 — NOT RUN, awaiting UAT human gate)

> **16/16 SIT scenarios remain NOT_RUN. These cannot execute in CI by design and are deferred to the Phase 6.5 UAT human gate.** Rows tracked in `TEST-REPORT-SA4E-369.csv` (Status=NOT_RUN, Notes="waiting UAT — Phase 6.5 human gate"); evidence discipline per `documents/KB/MANUAL-TEST-GUIDE.md` (file:line + screenshots, no fabrication).

### 3.1 Environment (pending)

| Component | Status |
|-----------|--------|
| Real Kiro instance + sideloaded extension build (HEAD 53506d2) | pending UAT session |
| ≥2 chat tabs in one window + webview CDP inspector | pending UAT session |
| Human approver for C1-L3 Option A gate interactions | human gate |

### 3.2 Results Summary

| ID | Test Case | Priority | Final Result | Notes |
|----|-----------|----------|--------------|-------|
| SIT-01 | Real two-tab blocking exchange | High | NOT_RUN | Real-model turn + rendering only executable on live Kiro; automated face = AC-S05a/AC-D1 PASS |
| SIT-02 | Real async dispatch + poll | High | NOT_RUN | Automated face = task-manager/tools async PASS |
| SIT-03 | Real per-tab isolation | High | NOT_RUN | Inspects real .pi/sessions artifacts — TC-006 automated half absent |
| SIT-04 | Zero-config & no-socket | High | NOT_RUN | Automated scan face PASS (no-socket.test.ts); netstat/settings-untouched check is live-instance |
| SIT-05 | Badge visual increment/clear | High | NOT_RUN | Visual webview behavior (TC-500 automation half absent) |
| SIT-06 | Transcript prefix + tint | High | NOT_RUN | Visual (TC-501 automation half absent; envelope logic PASS) |
| SIT-07 | Tooltip "Inbound from Tab X" | Low | NOT_RUN | Visual |
| SIT-08 | Peer list panel lifecycle | Low | NOT_RUN | Visual |
| SIT-09 | Visual envelope-spoof attempt | High | NOT_RUN | Envelope logic PASS (TC-505/TC-603 + S-04); visual attribution face is human-gated |
| SIT-10 | Approval UX — Option A approve | High | NOT_RUN | Full approve path automated (AC-S02a); human-visible prompt + click on VSCode webview = UAT face |
| SIT-11 | Approval UX — Option A reject | High | NOT_RUN | Reject path automated (AC-S02b/TC-108); UI face = UAT |
| SIT-12 | Option B read-only loadout UX | High | BLOCKED (D6) | **Option B not implemented (D6 = Option A locked)**; re-evaluate only if Option B is approved later |
| SIT-13 | Tab closed mid-task | High | NOT_RUN | Cancelled-queued face automated (AC-S01a); mid-TURN running-task cancel UX is runtime-only |
| SIT-14 | Tab rename during exchange | Medium | NOT_RUN | Requires live exchange across rename |
| SIT-15 | Full injection attempt, real instance | High | NOT_RUN | Envelope + gate + loadout automated; defense-in-depth with real model = UAT |
| SIT-16 | Session creation failure resilience | Medium | NOT_RUN | PEER_003 failure settle automated (AC-S02b/AC-S05f); broken-provider live face = UAT |

**Final SIT Pass Rate: 0/16 executed (0%) — gate: Phase 6.5 UAT.**

### 3.3 Why E2E/integration runtime evidence is deferred (not fabricated)

- **Approval UX (Option A)** requires the real VS Code extension host + webview: the pending-approval prompt is surfaced through `peer:approval-pending` → bridge → `chat:toolApprovalPending` (automated at bridge level, AC-S02e), but the human approve/reject **click** and the visible tool-execution outcome exist only in the live UI. CI cannot fabricate a human decision; TC-107/TC-108 UI faces PASS or FAIL via SIT-10/SIT-11 at UAT.
- **Visual UI markers** (badge count/clear, `[Peer inbound] from <tab>` prefix + tint, tooltip, panel rows — TC-500…503/505 visual face) render inside a webview that TDD §11.1 explicitly excludes from browser automation; CDP screenshot evidence at UAT is the designed medium.
- **Real two-tab exchange lifecycle** (SIT-01/02/03/13/14/16) needs a live model turn and real `.pi/` session artifacts; determinism rules out CI (STP §7 risk 5).
- **Zero-config runtime face** (no new settings entries, no host sockets via netstat — SIT-04) is a live-host observation; the mechanical import-scan face is already green in CI.

---
### 3.4 Item-Level STC Accounting (definitive status per STC automated item)

Automated candidate items = 83 TC + 6 PBT = 89 (TC-109 BLOCKED separately). Status legend: **FULL** = complete executable coverage on disk; **PARTIAL** = executable face on disk, residual face requires live runtime (SIT supplement listed); **NOT_RUN** = no executable coverage on disk; **BLOCKED** = in-process decision.

**FULL PASS — 51 items (57.3% of 89).** Every one traced in Section 2.2 to file + case names: TC-003, TC-007, TC-008, TC-101, TC-102, TC-103, TC-104, TC-105, TC-106, TC-107, TC-108, TC-200, TC-201, TC-203, TC-204, TC-205, TC-207, TC-208, TC-209, TC-210, TC-212, TC-300, TC-302, TC-303, TC-304, TC-306, TC-308, TC-309, TC-310, TC-400, TC-401, TC-402, TC-403, TC-404, TC-405, TC-410, TC-411, TC-412, TC-413, TC-414, TC-602, TC-603, TC-604, TC-605, TC-607, TC-609, TC-610, TC-701, TC-802, PBT-04, PBT-06.

**PASS-PARTIAL — 15 items (16.9%).** Executable face green; the deferred face is explicitly the UAT/SIT face (STP design):

| Item | Automated face (PASS) | Deferred face -> SIT gate |
|------|----------------------|--------------------------|
| TC-001 | Blocking exchange through real bus/dispatch (AC-S05a, AC-D1) | Real-model rendering -> SIT-01 |
| TC-002 | Async queued + poll + reply re-wrap (task-manager, tools, AC-S05b) | Live-task UX -> SIT-02 |
| TC-004 | Auto-run inbound executes target turn (AC-D1/AC-D3, AC-S02a) | Auto-run visibility -> SIT-01 |
| TC-005 | 16,000-char accepted, verbatim pass (message-size) | Auto-chunk inside governance module = out-of-peer regression domain |
| TC-060 | No network surface in source (no-socket scan) | Live zero-config observation -> SIT-04 |
| TC-202 | Failure settles FAILED PEER_003, terminal (AC-S02b, AC-S05f) | Provider-error source vs gate-deny source conflation noted |
| TC-305 | Peer prompt enters same turn API, verbatim, turnOrigin=peer | No negative "separate path" assertion (structurally unfalsifiable) |
| TC-307 | No socket import / API reference (scan) | fs-write negative assertion absent; state in-memory by code inspection -> SIT-04 |
| TC-409 | Tab close evicts host (AC-S01a evictCalls) | Fresh-host-reopen not asserted -> SIT spot check |
| TC-505 | Header immune to content claims (envelope, S-04) | Visual spoof experiment -> SIT-09 |
| TC-601 | 3 tools bound, caller-relative rows (tools) | Latency <= 1 ms NOT measured (perf assertion absent) |
| TC-606 | Failure marker without internals leak (AC-S05f) | Curated-reason matrix incomplete |
| TC-608 | getEntry deep copy = dispatch input isolation (TC-412) | Full isolation round-trip matrix not asserted |
| TC-700 | ensure receives workspaceRoot+tabId request (AC-D3/AC-S01a) | workspaceRoot+tabId dedup itself is D1 landed domain |
| TC-702 | Peer prompt traverses real promptTurn seam | Real governance hook points inside turn -> SIT-15 |

**NOT_RUN — 22 items (24.7%).**

| Sub-group | Items | Reason (specific) |
|-----------|-------|-------------------|
| SIT-gated by STP design (8 TC) | TC-006 (SIT-03), TC-211 (SIT-16), TC-407 (SIT-13), TC-408 (SIT-14), TC-500 (SIT-05), TC-501 (SIT-06), TC-502 (SIT-07), TC-503 (SIT-08) | Core scenario is live-runtime/visual; task-manager test even documents "running untouched (TC-407 separate)" |
| Blocked by out-of-scope debt (2 TC) | TC-800, TC-801 | Full suite carries 77 pre-existing fails of other tickets (RUN-LOG rows 35-36; 0/22 files touch peer); per-tab-session suite broken test-side by SA4E-370 mock-path bug (row 37). Re-run TC-800 on integration branch after WIP lands |
| Pure automation gaps - correctness (4 TC) | TC-100 (busy-target FIFO queue order), TC-206 (PEER_007 governance rejection), TC-301 (default tabId rejection, unique tabIds), TC-406 (validateTabId throw) | Planned for bus.integration/registry suites not realized on disk; PEER_007 has zero references in peer test code |
| Pure automation gaps - UI payload (2 TC) | TC-504 (peer:inbound -> webview payload), TC-703 (message-handler -> badge/prefix/panel forwarding) | Only approval-pending bridge mapping automated (AC-S02e); peer UI event path absent |
| Pure automation gaps - performance (1 TC) | TC-600 (bus dispatch + guard eval <= 50 ms p95) | No latency assertion; TC-601 latency half also unmeasured |
| PBT properties (4 PBT) | PBT-01, PBT-02, PBT-03, PBT-05 | Only PBT-04 implemented as fast-check; deterministic equivalents of 01-03 ARE executed (AC-S04f, TC-403, TC-410/605, TC-402) - the randomized property harness is missing |

**BLOCKED — 1 item (1.1%).**

| Item | Reason |
|------|--------|
| TC-109 (Option B read-only loadout, zero approval prompts) | **D6 = Option A locked** (full ToolApprovalGate fail-closed implemented; read-only loadout is future config). STP Section 2.4 #3 explicitly marks the non-chosen track BLOCKED, not failed. Re-open the STC track only if Option B is approved later |

---

## 4. Defect Summary

> **No defects found.** 0 open Critical/Major/Minor defects in the automated SA4E-369 scope (82/82 PASS). Manual SIT has not run yet (no defect discovery gate passed).

No BUG-NNN entries. Out-of-scope observations recorded to their owning tickets — none are SA4E-369 defects:

| Observation | Holder | Evidence |
|-------------|--------|----------|
| 77 full-suite fails / 22 files (18 tracked + 3 untracked WIP dirs) | other tickets' WIP (SA4E-370 et al.) | RUN-LOG rows 35-36, baseline worktree 9ae9968 + wiring-revert experiment |
| per-tab-session test mock-path bug (5/6 fail) | SA4E-370 | RUN-LOG row 37 |
| message-handler 234 lines / adapter-core 288 lines (200-line standard) | pre-existing debt, disclaimer in commit log | RUN-LOG row 42 |

---

## 5. Test Metrics

| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| Executed test pass rate | 100% | 82/82 = 100% (peer suite, 15 files) | Met |
| PBT coverage | 6/6 properties | 2/6 (PBT-04 fast-check; PBT-06 scripted property) | Not met — 4 randomized properties missing (deterministic equivalents executed) |
| UT pass rate (registry/guards/threads/task-manager/tools/envelope/message-size/marker-forgery/approval/single-flight) | 100% | 64/64 | Met |
| IT pass rate (dispatch/approval-loop/lifecycle/reply-envelope, real singletons) | 100% | 16/16 | Met |
| Scan suite (AC7) | 2/2 | 2/2 | Met |
| STC item coverage (FULL) | 100% | 51/89 FULL; +15 PARTIAL = 66/89 (74.2%) file+case evidence | Partially met — gap list in Section 6 |
| Error matrix PEER_001-010 | 10/10 executed | 9/10 (PEER_007/TC-206 absent) | Not met |
| Security conditions C1-C3 (chosen Option A) | All closed | C1 (L0 forgery + L1 envelope + L2 turnOrigin/single-flight + L3 Option A real gate), C2 16k, C3 I-6a — all executed green | Met |
| SIT pass rate | 100% | 0/16 executed — Phase 6.5 UAT gate | Pending |
| Defect density | <= 0.1 | 0 open defects | Met |
| Automation ratio | >= 80% | 100% of executed scope automated (16 SIT manual by design) | Met |
| AC1-AC8 automated faces | -- | AC2/AC3/AC7 full; AC1/AC4/AC5/AC6 partial (SIT faces); AC8 blocked-by-debt (documented) | Partially met |
---

## 6. Evidence Files

| File | Description | Section |
|------|-------------|---------|
| evidence/sa4e-369-peer-suite-final.txt | Independent QA re-run: verbose vitest capture (15 files / 82 tests per-case PASS lines) + tsc --noEmit exit 0, branch SA4E-369 @ HEAD 53506d2, vitest Start 2026-10-20T11:11:39 | 2.1 |
| evidence/ (directory) | UAT screenshot drop-zone for SIT-01..16 at the Phase 6.5 human gate (naming: SIT-NN-short-name.png) | 3 |
| TEST-REPORT-SA4E-369.csv | Execution tracker — 16 SIT rows NOT_RUN with "waiting UAT — Phase 6.5 human gate" notes (SIT-12 carries the D6 Option-A-BLOCKED reason) | 3.2 |
| RUN-LOG.md rows 35-42 | 77-fail forensics, AC8 debt census, remediation S-01..S-05 commits, SM independent verifications | 2.4, 4 |
| lines TEST-REPORT.md Section 2.2 | PASS mapping: each green STC item -> file + case name (no fabrication) | 2.2 |

## 6.1 Gap List — Recommended Follow-ups (post-UAT candidates)

| # | Gap | STC items | Severity of risk | Recommended action |
|---|-----|-----------|------------------|--------------------|
| G1 | UI event-to-payload path untested in automation | TC-504, TC-703 | Medium — badge/prefix/panel are primary AC4 deliverables; SIT-05..08 cover visually only | Unit/IT suite around message-handler payload mapping (peer:inbound -> webview payload); ~1 day |
| G2 | Busy-target FIFO queue-order unasserted | TC-100 | Medium-low — queue CAP (TC-401) is proven; ordering is not | Harness test: queue 3 tasks on a busy target, assert execution order FIFO |
| G3 | PEER_007 / governance rejection never exercised | TC-206 | Medium — AC5 negative face; AC5 positive face (TC-305) is green | Harness test: mocking (allowed) promptTurn to throw governance-shaped error, assert PEER_007 envelope + zero state |
| G4 | Input invariants: "default" tabId + validateTabId throw | TC-301, TC-406 | Low — D1 landed owns session-key validation; registry does not re-validate | Registry unit test for invalid ids (empty/default) only if the peer-owned validator remains |
| G5 | Session creation failure -> PEER_003 face | TC-211 | Low-medium — failure-settle path automated (AC-S02b/AC-S03b); source differs | Harness test with ensureSessionHost throwing |
| G6 | Performance budgets unmeasured | TC-600, TC-601 latency | Low — logic complexity is O(1)/O(n) small n | Micro-benchmark (performance.now loop over 1,000 dispatches) if AC budget evidence requested |
| G7 | 4 randomized PBT properties missing | PBT-01/02/03/05 | Low — deterministic equivalents executed | fast-check harness on guards/threads/task-manager queue, mirroring PBT-04 style |
| G8 | Full regression sweep unrun on this tree | TC-800, TC-801 | Documented exception — 0/22 peer involvement | Re-run when SA4E-370 WIP lands on integration branch (CI already wired: .github/workflows/ci-sa4e-369.yml) |

---

## 7. Conclusion

**Overall Verdict: CONDITIONAL PASS**

All executable automated tests pass (82/82 = 100%, tsc clean) and every PASS is traceable to a file + case name at HEAD 53506d2. The 51 STC items with full coverage plus 15 with automated-face coverage (66/89 = 74.2%) validate the peer module's deterministic core: anti-loop guards and bounds (cap 5 LOCKED, rate 10/60s, queue 20, thread 50, timeout 300s, retention 60s, 16k char cap with forgery framing), envelope provenance (anti-spoof, verbatim pass-through, reply re-framing), task state machine (exactly-once, terminal closure, retention), approval gate Option A fail-closed end-to-end with a REAL ToolApprovalGate, lifecycle cleanup wiring (I-8 single point), and the AC7 no-network scan. Two conditions hold the complete gate: (1) 16 manual SIT scenarios (Phase 6.5 UAT human gate — real Kiro runtime, real model turns, approval UX clicks, visual evidence) remain NOT_RUN; (2) the 14 pure automation gaps of Section 6.1 are accepted as follow-ups with SIT/UAT or follow-up suites as their disposition.

| Metric | Result |
|--------|--------|
| Automated tests (PBT + UT + IT + scan) | 82/82 PASS (100%) |
| Manual SIT tests | 0/16 executed (0%) — awaiting Phase 6.5 UAT |
| Bugs found | 0 (0 open) |
| Bugs resolved | N/A — no in-scope defect |
| Re-test rounds | 1 rounds -> stable green |
| Critical/Major defects | 0 |

**Recommendation:** Proceed to Phase 6.5 UAT human gate with the 16 SIT scenarios (manual, evidence per MANUAL-TEST-GUIDE); TC-109 track stays BLOCKED under D6 = Option A. Defer Section 6.1 gaps G1-G7 to a follow-up hardening round; re-run TC-800 on the integration branch once out-of-scope WIP lands (G8, CI already armed).

---
---

## Appendix A: Re-Test History

> The final results in Section 2 and Section 7 supersede the intermediate states below. Preserved for traceability and audit only.

### Timeline Overview

    Round 0 (DEV build-up, 2026-10-20, pre-Phase 6) -> RUN-LOG rows 34-42: attempt counts 33 pass/7 fail -> 52/52 -> 54/54 -> 82/82 (+28 tests, 6 new files from S-01..S-05 remediation acceptance); SM independently verified each gate; commits e8df2ee (code) + 53506d2 (remediation)
    Round 1 (Phase 6 formal execution, 2026-10-20) -> independent QA re-run: 82/82 PASS, tsc 0 — 0 new defects, no fixes required

| Bug | Round 0 | Round 1 | Final |
|-----|---------|---------|-------|
| (no in-scope defect) | -- | -- | N/A |

**Round 1 Result:** 82/82 PASS (100%). No re-test rounds required.

Round 0 detail (historical, non-QA-executed — DEV-side acceptance iterations documented in RUN-LOG):
- 33 pass/7 fail initial targeted run (anti-loop guard vs queue-cap test clusters, settle exactly-once TC-413) — diagnosed as 6 test-design bugs + 1 impl cosmetic (RUN-LOG row 33)
- Surgical session fixed 7/7; 52/52 (RUN-LOG row 34)
- Stretch suites added: tools.unit (D4 a2a shape), approval.unit (Option A fail-closed TC-802/TC-108); 54/54 (RUN-LOG row 37)
- Remediation S-01..S-05 added lifecycle/approval-loop/single-flight/marker-forgery/reply-envelope suites (+28 tests) -> 82/82 (RUN-LOG rows 41-42)
- Evidence: none fabricated; per-case verbose output available in evidence/sa4e-369-peer-suite-final.txt for Round 1 only (Round 0 counts are SM-verified RUN-LOG records)

*End of Test Execution Report — SA4E-369 v1.0 (2026-10-20)*

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-10-20 | QA Agent | Phase 6 formal execution — automated 82/82 PASS (100%), SIT 16/16 pending Phase 6.5 UAT human gate, gap list G1-G8, verdict CONDITIONAL PASS |
