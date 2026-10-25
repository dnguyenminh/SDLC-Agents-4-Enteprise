# STP — SA4E-381-chat-ux: Chat Transcript Redesign (Test Plan)

**Ticket:** SA4E-381-chat-ux
**Document:** Software Test Plan (STP) — v1.0
**Status:** Draft (Phase 6 Testing — QA)
**Author:** QA Agent
**Date:** 2026-10-25
**Autonomy Level:** L3 (per STATUS.json)

---

## 1. Introduction

### 1.1 Purpose

This Test Plan defines the strategy, scope, approach, resources, schedule, and deliverables for testing the **SDLC CHAT Transcript Redesign** (ticket SA4E-381-chat-ux). The redesign covers:

- **Issue 2 — Thinking block 3 states** (collapsed/expanded/streaming) with metadata (chars + duration), sticky user direction, chevron convention fix (▸ collapsed / ▼ expanded), follow-only-at-bottom scrolling, whitespace-only thinking drop, keyboard accessibility.
- **Issue 3 — Work-trace container per assistant turn** grouping all thinking blocks and tool-call blocks of a turn into one collapsible trace, with auto-collapse on `chat:streamComplete`, sticky user-toggle (data-user-managed), peer rows at root, approval force-open, failed-tool count, replay grouping, byte-identical export/copy.

Issue 1 (cross-tab stream bleed) host/protocol changes are **OUT OF SCOPE** for this TDD per TDD §1.1 — `originTabId` already stamped by SA4E-381 Issue 1. This ticket's Issues 2 & 3 are webview-only.

### 1.2 References

| Ref | Document | Role |
|-----|----------|------|
| [R1] | `documents/SA4E-381-chat-ux/UI-SPEC.md` v1.0 | Requirements — AC2-1..AC2-7 (§3.5), AC3-1..AC3-9 (§4.4), cross-cutting §5 |
| [R2] | `documents/SA4E-381-chat-ux/TDD.md` v1.0 | Technical design — module contracts, file-size budget, regression blast radius |
| [R3] | `documents/SA4E-381-chat-ux/IMPLEMENTATION-HANDOFF.md` | Manual happy-path script (7 steps), work map, regression blast radius groups |
| [R4] | `documents/SA4E-381-chat-ux/STATUS.json` | SM status — currentPhase=testing, autonomyLevel=L3 |

### 1.3 Test Objectives

1. Verify **AC2-1..AC2-7** (Issue 2 thinking block) pass 1:1 — UI + keyboard + persistence + edge cases.
2. Verify **AC3-1..AC3-9** (Issue 3 work-trace) pass 1:1 — grouping, sticky, live, peer-root, approval, export/copy, failed-count, replay.
3. Verify **cross-cutting §5** — performance (no per-chunk re-create), persistence round-trip, a11y WCAG 2.1 AA, responsive 300–800px, file-size budget ≤200 lines/file, ≤20 lines/function.
4. Verify **regression blast radius** groups stay green: export/copy, peer rows (SA4E-369), approval bars, empty cycles, context compaction/graphviz.
5. Confirm existing test suite remains green: **3,272/3,272 PASS**, `tsc` 0 errors, VSIX baseline 1.55.6 unchanged.
6. Produce go/no-go recommendation for deployment.

---

## 2. Test Strategy

### 2.1 Test Levels

| Level | Scope | Automation | Tools |
|-------|-------|------------|-------|
| PBT | Correctness properties (random inputs, whitespace-only thinking, multi-cycle stacking, persistence round-trip) | Automated | fast-check (vitest) |
| UT | Unit/edge case tests on webview modules (chat-thinking.js, chat-trace.js, chat-tabroute.js, chat-stream.js) | Automated | vitest |
| IT | Webview module integration (in-memory ChatState) | Automated | vitest |
| E2E-API | REST endpoint E2E (real server) | N/A — no host protocol change; webview-only ticket | vitest + fetch |
| E2E-UI | Browser UI E2E (Playwright against VS Code extension webview) | Automated | Playwright |
| SIT | Manual exploratory / edge cases only (visual, timing, UX) | Manual | Browser / VS Code extension host |

**E2E-API count = 0** for this ticket (per TDD §3.1: "NO CHANGES REQUIRED" to host protocol; `originTabId` already exists). All runtime behavior is verified via E2E-UI (Playwright against the running extension webview) and SIT (manual).

### 2.2 E2E Automation Coverage (SIT → E2E Conversion)

| Scenario Type | Classify As | Rationale |
|--------------|-------------|-----------|
| CRUD of trace/thinking (toggle expand/collapse via UI) | E2E-UI | Deterministic, click + verify DOM |
| Form validation (empty thinking, whitespace-only) | E2E-UI + UT | Input/output clearly defined |
| State persistence (reload/replay honors direction) | E2E-UI + PBT | Reload cycle is automatable via Playwright |
| RBAC/auth checks | N/A | Webview ticket — no auth boundary |
| Status changes (trace collapse/expand) | E2E-UI | Click + verify attribute |
| Confirmation dialogs | N/A | Not applicable |
| Regression — existing features (export/copy, peer rows) | E2E-UI | Automate để chạy lại nhanh |
| Blocking overlay timing | SIT (manual) | Visual timing hard to automate |
| Complex UX flows (drag-drop, animations) | SIT (manual) | Needs human judgment |
| Visual/layout verification (chevron ▸/▼, ellipsis, hover) | SIT (manual) | Needs human eyes |

Goal: minimize manual SIT to visual/UX/timing tests only. Automate all deterministic DOM/state assertions as E2E-UI.

### 2.3 Test Types

| Type | Coverage | Level |
|------|----------|-------|
| Functional | AC2-1..AC2-7, AC3-1..AC3-9 happy + alt + exception | UT, E2E-UI, SIT |
| Non-functional | Performance (no per-chunk re-create), responsive 300–800px | E2E-UI, SIT |
| Accessibility (WCAG 2.1 AA) | role=button, aria-expanded, keyboard toggle, focus-visible, aria-label | UT, E2E-UI, SIT |
| Security | No new attack surface (webview-only, no protocol change) | N/A (review only) |
| Regression | Export/copy byte-identical, peer rows at root, approval bars, empty cycles, context compaction | E2E-UI, SIT |

### 2.4 Entry / Exit Criteria per Level

| Level | Entry Criteria | Exit Criteria |
|-------|---------------|---------------|
| PBT/UT/IT | Module source compiled (tsc 0 errors), vitest config ready | All tests pass, coverage ≥ 80% on changed modules |
| E2E-UI | Extension activated, webview `ready` handshake, VSIX 1.55.6 loaded | All E2E-UI cases pass, no console errors |
| SIT | Build deployed, admin credentials, localhost VS Code instance | All manual cases executed, defects triaged |

### 2.5 Test Cases Summary

| Level | Count | Automated | Manual |
|-------|-------|-----------|--------|
| PBT | 6 | 6 | 0 |
| UT | 12 | 12 | 0 |
| IT | 8 | 8 | 0 |
| E2E-API | 0 | 0 | 0 |
| E2E-UI | 24 | 24 | 0 |
| SIT | 10 | 0 | 10 |
| **Total** | **60** | **50 (83%)** | **10 (17%)** |

*(Final counts updated in STC.md RTM.)*

---

## 3. Test Scope

### 3.1 In Scope

| Area | Source | Priority |
|------|--------|----------|
| Issue 2 — Thinking block: collapsed state (chevron ▸ + chars + duration, min-height 28px, hover) | UI-SPEC AC2-1 | High |
| Issue 2 — Thinking block: expand via click/Enter/Space, aria-expanded, chevron ▼ | UI-SPEC AC2-2 | High |
| Issue 2 — Thinking block: collapse again, thinkingCollapsed persisted, survives reload | UI-SPEC AC2-3 | High |
| Issue 2 — Multi-cycle: only trace summary visible, no bare thinking stack | UI-SPEC AC2-4 | High |
| Issue 2 — Live thinking: follow-only-at-bottom, no scroll fight | UI-SPEC AC2-5 | High |
| Issue 2 — Whitespace-only thinking dropped | UI-SPEC AC2-6 | Medium |
| Issue 2 — Keyboard: focus-visible, Enter/Space toggle | UI-SPEC AC2-7 | High |
| Issue 3 — Trace auto-collapse at streamComplete, one summary line | UI-SPEC AC3-1 | High |
| Issue 3 — Trace sticky: user toggle persists across turn end | UI-SPEC AC3-2 | High |
| Issue 3 — Live turn: thinking + tools inside trace body, live progress | UI-SPEC AC3-3 | High |
| Issue 3 — Peer rows at root, never inside trace | UI-SPEC AC3-4 | High |
| Issue 3 — Approval force-opens trace | UI-SPEC AC3-5 | High |
| Issue 3 — Reload/replay grouping identical, per-block choices honored | UI-SPEC AC3-6 | High |
| Issue 3 — Export/copy byte-identical | UI-SPEC AC3-7 | High |
| Issue 3 — Failed tool shows red ✗ count | UI-SPEC AC3-8 | Medium |
| Issue 3 — Trace summary keyboard | UI-SPEC AC3-9 | High |
| Cross-cutting §5 — Performance, persistence, a11y, responsive, file-size budget | UI-SPEC §5 | Medium |
| Regression — export/copy, peer rows, approval bars, empty cycles, context compaction/graphviz | IMPLEMENTATION-HANDOFF §4 | High |

### 3.2 Out of Scope

| Item | Reason |
|------|--------|
| Issue 1 host/protocol changes (`message-protocol.ts`, `stream-handler.ts`) | TDD §1.1: host protocol unchanged; `originTabId` already stamped by SA4E-381 Issue 1 |
| Background-tab streaming UX (tab pill badge, jump pill) | Issue 1 UX half — out of scope for this ticket's TDD |
| Token metric in trace summary | UI-SPEC §4.2.1: optional phase-2, omitted if unavailable |
| New CI/CD pipelines | TDD §1.3: no CI/CD change for this ticket |
| Mobile / non-VS-Code clients | VS Code extension webview only |
| Visual pixel-perfect comparison against wireframes | Wireframes are draw.io; UG evidence rule requires running build screenshots (ui-agent owns diagrams) |

---

## 4. Test Environment

| Component | Requirement |
|-----------|-------------|
| OS | Windows 10/11 (dev machine) |
| VS Code | Insider/Stable supporting webview extension host |
| Extension | VSIX 1.55.6 (baseline unchanged) |
| Webview | Chromium-based VS Code webview |
| Browsers (E2E-UI) | Chromium via Playwright |
| Test data | Pre-seeded tabs, messages, thinking content, tool calls, peer rows, approval flows |
| Persistence | VS Code context (`chat:saveState` / `tab:updated`) debounce 500ms |
| External dependencies | None (no host protocol change; no network port) |

---

## 5. Test Schedule (Estimated)

| Phase | Activity | Est. Effort |
|-------|----------|-------------|
| Test planning | STP + STC authoring, BA review gate | 0.5 d |
| Test automation | UT/IT/PBT + E2E-UI implementation | 2 d |
| SIT manual execution | 10 manual cases incl. visual/UX/timing | 1 d |
| Regression pass | Blast radius groups re-verified | 0.5 d |
| Defect triage & fix verification | QA + DEV loop | 0.5 d |
| Test reporting | TEST-REPORT.md + go/no-go | 0.25 d |
| **Total** | | **≈ 4.75 d** |

---

## 6. Resource & Responsibilities

| Role | Responsibility |
|------|----------------|
| QA Agent (this agent) | Author STP/STC/TEST-REPORT, execute SIT, triage defects, ingest KB |
| BA Agent | Review test coverage against BRD/FSD (business-correctness gate) |
| SM Agent | Orchestrate, verify quality gates, update STATUS.json |
| Dev Agent | Fix defects found during testing (production code only) |
| SA Agent | Clarify technical discrepancies if any |

**Tools:** vitest, fast-check, Playwright, VS Code extension host, Jira (defect tracking), KB (mem_ingest).

---

## 7. Risk & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Sticky persistence direction lost on reload | Medium | High | PBT round-trip tests + SIT reload case (AC2-3, AC3-6) |
| Trace re-created per chunk causing layout thrash | Low | Medium | Performance UT on `openTrace`/`adoptIntoTrace` parent-node checks |
| Export/copy byte-identity broken by DOM moves | Low | High | AC3-7 E2E-UI + SIT byte-compare against baseline |
| Peer rows leak inside trace | Low | Medium | AC3-4 render-order test with peer rows between turns |
| Approval bar force-open misses | Low | High | AC3-5 SIT case with pending approval |
| Visual/chevron convention not verifiable by automation | Medium | Low | SIT manual visual check (human eyes) |
| Existing suite regressions (3,272 tests) | Low | High | Full suite run before/after; baseline 1.55.6 green |

---

## 8. Defect Management

| Severity | Definition | SLA |
|----------|------------|-----|
| Critical | Crash, data loss, AC blocked, suite red | Immediate (same day) |
| Major | AC partially failed, workaround unavailable | 2 days |
| Minor | Cosmetic, workaround available | 5 days |
| Trivial | Typos, alignment | Next release |

**Lifecycle:** New → Open → In Progress → Fixed → Verified → Closed.

Defects from SIT manual execution logged in Jira with evidence path (`evidence/SIT-{NNN}-{name}.png`).

---

## 9. Test Metrics

- Test execution progress: % of 60 TC executed
- Pass/Fail rate per level (PBT/UT/IT/E2E-UI/SIT)
- Defect density: defects per 10 TC
- Test coverage: % of AC2/AC3 covered by ≥1 TC (target 100%)
- Automation ratio: 83% (50/60 automated)

---

**End of STP.** See `STC.md` for detailed test cases and `TEST-REPORT.md` for execution results.
