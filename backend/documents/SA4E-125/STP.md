# STP — Software Test Plan

**Ticket:** SA4E-125 | **Author:** QA Agent | **Version:** 1.0 | **Status:** Draft

---

## 1. Test Scope

### 1.1 In-Scope

| Area | FR | Arch | Description |
|------|----|------|-------------|
| Index-based Phase Routing | FR-1 | v2 | `currentPhaseIndex` replaces string lookup in `routeFromSm`, `advancePhaseNode`, `routeAfterAdvance` |
| PipelineDefinition in State | FR-2 | v2 | Per-thread `pipelineDefinition` snapshot, null fallback, checkpoint/resume |
| Sandboxed Hot-Swap | FR-3 | v2 | Transactional validation (3 rules) before applying config changes |
| Index Realignment | FR-4 | v3 | `resolvePhaseIndex()` pure function for self-healing realignment |
| State Size Optimization | FR-5 | v3 | Strip prompts/tools/config from `PipelineDefPhase`, checkpoint ≤ 5KB |
| Orphaned Phase Detection & Pause | FR-6 | v4 | `resolvePhaseIndex()` → -1 triggers `pipelineStatus: "paused"` |
| Skip/Cancel Phase Decisions | FR-7 | v5 | `ApprovalDecision` extended with `"skip"` | `"cancel"` |
| 3-Layer Skip Fix | FR-8 | v5 | `routeFromSm` → `advance_phase`, `advancePhaseNode` skip/cancel, `buildSmTargets` includes target |
| Ghost Context Barrier | FR-9 | v6 | `ChatMessage { role: "system" }` injected on skip |

### 1.2 Out-of-Scope

| Item | Rationale |
|------|-----------|
| UI rendering of pipeline dashboard | Separate extension task |
| LLM provider switching | Handled by `providers/` module |
| Performance/benchmark testing | Not required for correctness validation |
| Subgraph routing (hotfix, code-review, docs) | Subgraphs use independent routing |
| Frontend pipeline state visualization | Separate UI ticket |

---

## 2. Test Strategy

### 2.1 Unit Tests (Pure Functions)

| Function | Test Focus | Tools |
|----------|------------|-------|
| `resolvePhaseIndex()` | Normal match, realignment, orphan (-1), empty phases | Jest — pure function, no state mutation |
| `routeFromSm()` | Index route → agent ID, orphan → `"advance_phase"`, null fallback | Jest — returns string |
| `routeAfterAdvance()` | Running → `"sm"`, Paused → `END`, Cancelled → `END`, Done → `END` | Jest — returns string |

### 2.2 Integration Tests (Graph Routing)

| Node/Edge | Test Focus | Tools |
|-----------|------------|-------|
| `advancePhaseNode()` | 4 cases: Normal, Orphan-pause, Cancel, Skip+barrier | LangGraph `StateGraph` harness with mock state |
| `qualityGateRouter()` | Approve → `advance_phase`, Reject → `"reject"`, Revise → `"revise"` | Invoke with gate decision |
| `buildSmTargets()` | Includes `advance_phase`, agent graph keys | Verify map keys |
| `handleLiveSpecMutation()` | 3 validation rules, apply/reject, index realignment on threads | Mock LLM + file system events |

### 2.3 E2E Scenarios (Full Pipeline Flows)

| Scenario | Description |
|----------|-------------|
| Normal flow (v2) | Quality Gate → advance → SM → route → agent — phases complete → done |
| Hot-swap flow (v3) | Config change → sandbox validate → apply → `resolvePhaseIndex` realigns → continues |
| Orphan flow (v4) | Phase deleted → `resolvePhaseIndex` → -1 → pause → human skip → resume |
| Skip fix flow (v5) | Layer 1 + 2 + 3: `routeFromSm` → `advance_phase` → `advancePhaseNode` → barrier → next agent |
| Barrier flow (v6) | Skip → barrier injected → next agent reads `chatHistory` → interprets correctly |
| Barrier NOT injected (v6) | Normal transition → no barrier in `chatHistory` |

---

## 3. Test Environment

| Component | Specification |
|-----------|---------------|
| Runtime | Node.js 20 LTS |
| Test Framework | Jest (or Vitest) with `@langchain/langgraph` test harness |
| State Harness | `StateGraph` invoke with mock `PipelineState` objects |
| CI | GitHub Actions — trigger: PR to `main` |
| OS | Ubuntu 22.04 (CI), Windows 11 / macOS (local dev) |
| Code Coverage Target | ≥ 90% on `pipeline/edges.ts`, `pipeline/sdlc-graph.ts`, `core/state-types.ts` |

---

## 4. Test Deliverables

| Deliverable | Description |
|-------------|-------------|
| `STP.md` | This document — test plan |
| `STC.md` | Test cases (33 test cases across 9 FRs + edge cases) |
| Test execution evidence | Screenshots / logs in `evidence/` directory |
| Test data | Mock pipeline definitions in `test-data/` directory |

---

## 5. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Hot-swap timing race condition — concurrent file changes | Incorrect phase routing, checkpoint corruption | Per-thread isolation tests (TC-04, TC-32); each thread uses own `pipelineDefinition` snapshot |
| Ghost context not properly cleared after skip | Hallucination — agent acts on stale requests | Barrier injection verification tests (TC-26 — TC-30); assert `chatHistory` contains barrier with correct fields |
| Infinite loop on orphaned skip — `resolvePhaseIndex` keeps returning -1 | Pipeline never terminates | Edge case tests with -1 index (TC-15 — TC-18); verify `routeAfterAdvance` routes to `END` when paused |
| LLM extraction flakiness in hot-swap | Hot-swap false negatives | Mock LLM in unit tests (TC-06 — TC-09); real LLM in limited E2E only |
| Approval timeout — user never responds | Pipeline stuck in `paused` indefinitely | Application-level timeout test (TC-33); pipeline stays `paused`, explicit decision required |

---
