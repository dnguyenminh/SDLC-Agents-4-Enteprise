# Functional Specification Document — SA4E-125

**Title:** Pipeline Refactoring: Hardcoded → Data-Driven Architecture (v2-v6)
**Author:** BA Agent / TA Agent
**Version:** 1.0
**Status:** Draft
**Related BRD:** SA4E-125/BRD.md

---

## 1. Introduction

### 1.1 Purpose
Specify functional requirements for transforming the SDLC pipeline from hardcoded static routing to a data-driven virtual machine where graph topology is compiled once at startup and all routing decisions are driven by runtime state (`currentPhaseIndex`, `pipelineDefinition`).

### 1.2 Scope
Covers 9 functional requirements across 5 architecture versions (v2–v6) that address: index-based routing, pipeline state isolation, sandboxed hot-swap, index realignment, state size optimization, orphaned phase handling, skip/cancel decisions, 3-layer skip fix, and ghost context barrier.

### 1.3 Definitions & Acronyms

| Term | Definition |
|------|------------|
| PipelineDefinition | Per-thread snapshot of phase order and agent assignments stored in state |
| currentPhaseIndex | Integer pointer replacing string-based phase lookup |
| resolvePhaseIndex | Pure function that realigns index or returns -1 for orphaned phases |
| Orphaned Phase | Phase that existed at checkpoint but was deleted from pipeline config |
| Ghost Context | Stale chat messages from a skipped phase that confuse downstream agents |
| Context Barrier | System ChatMessage injected on skip to nullify stale requests |
| Sandboxed Hot-Swap | Transactional validation before applying runtime config changes |

### 1.4 References

| Document | Location |
|----------|----------|
| BRD | SA4E-125/BRD.md |
| Architecture-v2 | Architecture-v2.md |
| Architecture-v3 | Architecture-v3.md |
| Architecture-v4 | Architecture-v4.md |
| Architecture-v5 | Architecture-v5.md |
| Architecture-v6 | Architecture-v6.md |
| Langgraph Module Reference | Langgraph-Module-Reference.md |
| Review 1-6 | review-1.md through review-6.md |

---

## 2. Functional Requirements

### FR-1: Index-based Phase Routing

**Architecture Version:** v2
**Source:** BRD US-4

#### Description
Replace string-based phase lookup (`order.indexOf(currentPhase)`) with integer-index pointer `currentPhaseIndex` in pipeline state. Routing decisions read `pipelineDefinition.phases[currentPhaseIndex]` instead of scanning the phase list.

#### Input/Output
- **Input:** `currentPhaseIndex: number` (default 0), `pipelineDefinition.phases: PipelineDefPhase[]`
- **Output:** Resolved agent ID from `phases[idx].agentIds[0]`

#### Business Rules

| Rule ID | Rule |
|---------|------|
| BR-01 | `routeFromSm()` MUST read `state.pipelineDefinition.phases[idx]` using `currentPhaseIndex` |
| BR-02 | `advancePhaseNode()` MUST increment `currentPhaseIndex` by 1 on gate approval |
| BR-03 | `routeAfterAdvance()` MUST route to `"sm"` if `idx < phases.length`, else `"__end__"` |
| BR-04 | `routeAfterQualityGate("approve")` MUST route to `"advance_phase"` |

#### Main Flow
```
Gate approve → advance_phase (idx++) → routeAfterAdvance → SM → routeFromSm (by idx) → agent
```

#### Alternative/Exception Flows
- **AF-1 (Pipeline Complete):** If `currentPhaseIndex >= phases.length`, route to `__end__`

---

### FR-2: PipelineDefinition in State

**Architecture Version:** v2
**Source:** BRD US-1

#### Description
Move pipeline definition from `AgentRegistry` singleton into `PipelineAnnotation` state channel for per-thread isolation and checkpoint/resume capability.

#### Input/Output
- **Input:** None (injected at `invoke()` from `agentRegistry.getPipeline()`)
- **Output:** `PipelineDefState { phases: PipelineDefPhase[] }` in state

#### Business Rules

| Rule ID | Rule |
|---------|------|
| BR-05 | `pipelineDefinition: PipelineDefState | null` MUST be a state channel |
| BR-06 | Each thread MUST have its own `pipelineDefinition` snapshot (per-thread isolation) |
| BR-07 | When `pipelineDefinition === null`, fallback to `agentRegistry.getFirstAgentNode()` |
| BR-08 | PipelineDefinition MUST be checkpointed alongside state for resume |

#### Main Flow
```
LangGraphEngine.invoke() → agentRegistry.getPipeline() → inject pipelineDefinition → pipeline runs with isolated config
```

#### Alternative/Exception Flows
- **AF-1 (Null Fallback):** `pipelineDefinition === null` → use `agentRegistry.getFirstAgentNode(state.currentPhase)` (legacy)

---

### FR-3: Sandboxed Hot-Swap

**Architecture Version:** v2
**Source:** BRD US-1

#### Description
Validate agent spec file changes in a sandbox before applying to live pipeline. On validation failure, preserve existing config and report error.

#### Input/Output
- **Input:** Agent spec `.md` file change event
- **Output:** `boolean` — true if hot-swap succeeded, false if rejected

#### Business Rules

| Rule ID | Rule |
|---------|------|
| BR-09 | `handleLiveSpecMutation()` MUST extract phases via LLM before applying |
| BR-10 | Validation rule 1: `phases` MUST NOT be empty |
| BR-11 | Validation rule 2: Each phase MUST have non-empty `id` and `agentIds[]` |
| BR-12 | Validation rule 3: LLM extraction MUST NOT throw exception |
| BR-13 | On validation failure, MUST preserve old config and report error to UI |
| BR-14 | On success, MUST set `graph = null` to trigger rebuild on next invoke |

#### Main Flow
```
Agent file change → LLM extract → validate (3 rules) → apply OR reject + report error
```

#### Alternative/Exception Flows
- **AF-1 (Validation Failure):** Any rule violated → keep old spec, `return false`, emit `SPEC_COMPILE_ERROR` to UI

---

### FR-4: Index Realignment via resolvePhaseIndex()

**Architecture Version:** v3
**Source:** BRD US-4, Review-2

#### Description
When pipeline config is hot-swapped (phase insert/delete/reorder), `resolvePhaseIndex()` realigns `currentPhaseIndex` by matching `currentPhase` ID against the new phase array.

#### Input/Output
- **Input:** `PipelineState` (reads `pipelineDefinition`, `currentPhaseIndex`, `currentPhase`)
- **Output:** Realigned index `number` (≥ 0 if valid, -1 if orphaned)

#### Business Rules

| Rule ID | Rule |
|---------|------|
| BR-15 | `resolvePhaseIndex()` MUST be a pure function — no state mutation |
| BR-16 | If `phase.id !== state.currentPhase`, search `pd.phases.findIndex(p => p.id === state.currentPhase)` |
| BR-17 | If realigned index found, return it (self-healing realignment) |
| BR-18 | `routeFromSm()` MUST call `resolvePhaseIndex()` instead of raw `currentPhaseIndex` |
| BR-19 | `getPhaseNode()` MUST call `resolvePhaseIndex()` instead of raw `currentPhaseIndex` |
| BR-20 | `advancePhaseNode()` MUST continue using `++currentPhaseIndex` from already-re aligned state |

#### Main Flow
```
Hot-swap changes phases → routeFromSm() calls resolvePhaseIndex()
  ├── phase.id matches → return current index (no change)
  └── phase.id differs → findIndex realign → return new index
```

#### Alternative/Exception Flows
- **AF-1 (No match):** Phase deleted → return -1 (see FR-6)

---

### FR-5: State Size Optimization

**Architecture Version:** v3
**Source:** Review-2

#### Description
Strip prompts, tools, and config from `PipelineDefState` to keep checkpoint size at ~2-5KB. Only store `id` and `agentIds` per phase.

#### Input/Output
- **Input:** Full agent config from LLM extraction
- **Output:** Trimmed `PipelineDefState { phases: PipelineDefPhase[] }` where each phase has only `{ id: string, agentIds: string[] }`

#### Business Rules

| Rule ID | Rule |
|---------|------|
| BR-21 | `PipelineDefPhase` MUST NOT contain prompts, tools, or config fields |
| BR-22 | Agent prompts MUST be loaded from spec file at runtime via `specPath`, not from state |
| BR-23 | Checkpoint size MUST be ≤ 5KB per pipeline definition |

---

### FR-6: Orphaned Phase Detection & Pause

**Architecture Version:** v4
**Source:** BRD US-2, Review-3

#### Description
When `resolvePhaseIndex()` returns -1 (current phase deleted from config), the pipeline pauses with `pipelineStatus: "paused"` and waits for human intervention.

#### Input/Output
- **Input:** `resolvePhaseIndex(state) === -1`
- **Output:** `{ pipelineStatus: "paused", approvalRequired: true, approvalDecision: null }`

#### Business Rules

| Rule ID | Rule |
|---------|------|
| BR-24 | `resolvePhaseIndex()` MUST return -1 when `!phase` or `phase.id !== currentPhase` AND no realignment found |
| BR-25 | `advancePhaseNode()` MUST set `pipelineStatus: "paused"` when `idx === -1` and `approvalDecision === null` |
| BR-26 | `routeAfterAdvance()` MUST route to `__end__` when `pipelineStatus === "paused"` |
| BR-27 | `routeFromSm()` MUST NOT use `agentRegistry` as fallback for orphaned phases |
| BR-28 | The agent registry MUST NOT be consulted when `resolvePhaseIndex` returns -1 |
| BR-29 | User MUST be notified: "Phase '{name}' no longer exists in pipeline config." |

#### Main Flow
```
advancePhaseNode → resolvePhaseIndex returns -1 → pause pipeline → human intervention (skip/reconfigure/cancel)
```

#### Alternative/Exception Flows
- **AF-1 (Normal advance):** `idx !== -1` → advance normally, no pause
- **AF-2 (Out of bounds guard):** If `!phase` check added to prevent array OOB

---

### FR-7: Skip/Cancel Phase Decisions

**Architecture Version:** v5
**Source:** BRD US-2, Review-4

#### Description
Extend `ApprovalDecision` type with `"skip"` and `"cancel"`. When pipeline is paused due to orphan, user can skip (advance past the deleted phase) or cancel (terminate pipeline).

#### Input/Output
- **Input:** `ApprovalDecision: "skip" | "cancel" | "approve" | "reject" | "revise"`
- **Output:** Resume or terminate pipeline

#### Business Rules

| Rule ID | Rule |
|---------|------|
| BR-30 | `ApprovalDecision` type MUST include `"skip" | "cancel"` in union |
| BR-31 | `handleApproval("cancel")` MUST set `pipelineStatus: "cancelled"` |
| BR-32 | `handleApproval("skip")` MUST set `pipelineStatus: "running"`, `approvalDecision: "skip"` |
| BR-33 | On skip: `advancePhaseNode()` MUST re-target index to the phase at the old position |

#### Main Flow
```
Pipeline paused → user clicks "Skip" → handleApproval("skip") → advancePhaseNode repositions → continues
Pipeline paused → user clicks "Cancel" → handleApproval("cancel") → pipelineStatus: "cancelled" → __end__
```

#### Alternative/Exception Flows
- **AF-1 (Reject):** `"reject"` treated same as cancel → `pipelineStatus: "cancelled"`

---

### FR-8: 3-Layer Skip Fix

**Architecture Version:** v5
**Source:** BRD US-2, Review-4

#### Description
Three coordinated fixes to prevent infinite loop when skipping orphaned phases: Layer 1 (`routeFromSm` routes to `advance_phase` not agent), Layer 2 (`advancePhaseNode` handles skip/cancel), Layer 3 (`buildSmTargets` includes `advance_phase`).

#### Input/Output
- **Input:** Orphaned state + `approvalDecision: "skip"`
- **Output:** Correctly positioned next phase agent

#### Business Rules

| Rule ID | Rule |
|---------|------|
| BR-34 | Layer 1: `routeFromSm()` MUST return `"advance_phase"` when orphaned (NOT `agentRegistry` fallback) |
| BR-35 | Layer 2: `advancePhaseNode()` MUST handle `approvalDecision === "skip"` by setting `currentPhaseIndex` to old position |
| BR-36 | Layer 2: `advancePhaseNode()` MUST handle `approvalDecision === "cancel"` by setting `pipelineStatus: "cancelled"` |
| BR-37 | Layer 3: `buildSmTargets()` MUST include `advance_phase: "advance_phase"` as a valid routing target |
| BR-38 | Skip flow: `resolvePhaseIndex(-1)` → route to `advance_phase` → `advancePhaseNode` repositions → next phase runs |

#### Main Flow
```
resolvePhaseIndex(-1) → routeFromSm → "advance_phase" (not agent) → advancePhaseNode (skip logic) → targetIdx = currentPhaseIndex → phase = phases[targetIdx] → running
```

#### Alternative/Exception Flows
- **AF-1 (Cancel flow):** `approvalDecision: "cancel"` → `pipelineStatus: "cancelled"` → `__end__`

---

### FR-9: Ghost Context Barrier

**Architecture Version:** v6
**Source:** BRD US-3, Review-5

#### Description
When a phase is skipped due to orphan, inject a `ChatMessage` with `role: "system"` into `chatHistory` to signal to downstream agents that stale requests from the deleted phase are void.

#### Input/Output
- **Input:** Orphaned skip event, `state.currentPhase`, `nextPhaseId`
- **Output:** `chatHistory: [...old, barrierMsg]` with barrier message appended

#### Business Rules

| Rule ID | Rule |
|---------|------|
| BR-39 | Barrier message MUST use `role: "system"` and type `ChatMessage` (not LangChain `SystemMessage`) |
| BR-40 | Barrier MUST append to existing `chatHistory` (immutable spread) — NOT replace |
| BR-41 | Barrier message MUST contain: (a) which phase was skipped, (b) that its requests are void, (c) what the current phase is |
| BR-42 | Barrier MUST be injected ONLY for orphaned skip, NOT for normal phase transitions |
| BR-43 | Message ID MUST use unique format: `ctx-{timestamp}-{randomUUID}` |
| BR-44 | Historic chat messages MUST be preserved (append only) |

#### Main Flow
```
advancePhaseNode (skip) → create barrierMsg with role: "system" → chatHistory: [...old, barrierMsg] → agent reads barrier → ignores stale requests
```

#### Barrier Message Structure
```typescript
{
  id: `ctx-${Date.now()}-${randomUUID().substring(0, 8)}`,
  role: "system",
  content: `[Context Barrier] Phase '${skippedPhase}' was deleted and SKIPPED. ` +
    `Requests related to it are void. Current phase: '${nextPhaseId}'.`,
  timestamp: new Date().toISOString(),
}
```

#### Alternative/Exception Flows
- **AF-1 (Normal transition):** No barrier injected — context bleeding across phases is intended behavior

---

## 3. Business Rules Table

| Rule ID | Description | FR | Arch |
|---------|-------------|----|------|
| BR-01 | `routeFromSm()` reads state by `currentPhaseIndex` | FR-1 | v2 |
| BR-02 | `advancePhaseNode()` increments index on approval | FR-1 | v2 |
| BR-03 | `routeAfterAdvance()` routes `"sm"` if idx < len, else `"__end__"` | FR-1 | v2 |
| BR-04 | `routeAfterQualityGate("approve")` routes to `"advance_phase"` | FR-1 | v2 |
| BR-05 | `pipelineDefinition` is a state channel (typed `PipelineDefState | null`) | FR-2 | v2 |
| BR-06 | Per-thread isolation of pipeline definition | FR-2 | v2 |
| BR-07 | Fallback to `agentRegistry.getFirstAgentNode()` when null | FR-2 | v2 |
| BR-08 | PipelineDefinition checkpointed with state for resume | FR-2 | v2 |
| BR-09 | `handleLiveSpecMutation()` extracts via LLM before apply | FR-3 | v2 |
| BR-10 | Validation: phases non-empty | FR-3 | v2 |
| BR-11 | Validation: each phase has non-empty id + agentIds | FR-3 | v2 |
| BR-12 | Validation: LLM extract must not throw | FR-3 | v2 |
| BR-13 | Validation failure: preserve old config, report error | FR-3 | v2 |
| BR-14 | Validation success: set `graph = null` for rebuild | FR-3 | v2 |
| BR-15 | `resolvePhaseIndex()` is pure (no mutation) | FR-4 | v3 |
| BR-16 | Realign by `findIndex(p => p.id === currentPhase)` on mismatch | FR-4 | v3 |
| BR-17 | Return realigned index if found | FR-4 | v3 |
| BR-18 | `routeFromSm()` uses `resolvePhaseIndex()` | FR-4 | v3 |
| BR-19 | `getPhaseNode()` uses `resolvePhaseIndex()` | FR-4 | v3 |
| BR-20 | `advancePhaseNode()` uses `++currentPhaseIndex` from re-aligned state | FR-4 | v3 |
| BR-21 | `PipelineDefPhase` excludes prompts/tools/config | FR-5 | v3 |
| BR-22 | Agent prompts loaded from spec file at runtime | FR-5 | v3 |
| BR-23 | Checkpoint size ≤ 5KB | FR-5 | v3 |
| BR-24 | `resolvePhaseIndex()` returns -1 for orphaned phase | FR-6 | v4 |
| BR-25 | `advancePhaseNode()` sets `paused` when idx=-1 and no decision | FR-6 | v4 |
| BR-26 | `routeAfterAdvance()` routes to `__end__` when paused | FR-6 | v4 |
| BR-27 | `routeFromSm()` no agentRegistry fallback when orphaned | FR-6 | v4 |
| BR-28 | Agent registry not consulted when idx=-1 | FR-6 | v4 |
| BR-29 | User notified of orphaned phase | FR-6 | v4 |
| BR-30 | `ApprovalDecision` includes `"skip" | "cancel"` | FR-7 | v5 |
| BR-31 | `handleApproval("cancel")` → `pipelineStatus: "cancelled"` | FR-7 | v5 |
| BR-32 | `handleApproval("skip")` → running + decision=skip | FR-7 | v5 |
| BR-33 | Skip repositions index at old position | FR-7 | v5 |
| BR-34 | Layer 1: orphan routes to `"advance_phase"` not agent | FR-8 | v5 |
| BR-35 | Layer 2: skip uses old position for index | FR-8 | v5 |
| BR-36 | Layer 2: cancel sets `pipelineStatus: "cancelled"` | FR-8 | v5 |
| BR-37 | Layer 3: `buildSmTargets()` includes `advance_phase` | FR-8 | v5 |
| BR-38 | Skip flow complete: -1 → advance_phase → reposition → next phase | FR-8 | v5 |
| BR-39 | Barrier uses `ChatMessage { role: "system" }` not LangChain type | FR-9 | v6 |
| BR-40 | Barrier appends (immutable spread), never replaces | FR-9 | v6 |
| BR-41 | Barrier states skipped phase, void requests, and current phase | FR-9 | v6 |
| BR-42 | Barrier only for orphaned skip, not normal transitions | FR-9 | v6 |
| BR-43 | Message ID format: `ctx-{ts}-{uuid8}` | FR-9 | v6 |
| BR-44 | Historic messages preserved | FR-9 | v6 |

---

## 4. Data Dictionary

### State Channels

| Field | Type | Default | Description | FR |
|-------|------|---------|-------------|----|
| `currentPhaseIndex` | `number` | `0` | Integer pointer to current phase in `phases[]` | FR-1 |
| `pipelineDefinition` | `PipelineDefState \| null` | `null` | Per-thread snapshot of pipeline config | FR-2 |
| `pipelineStatus` | `"idle" \| "running" \| "paused" \| "cancelled"` | `"idle"` | Current state of pipeline execution | FR-6, FR-7 |
| `approvalDecision` | `ApprovalDecision` | `null` | User decision on pause: approve/reject/revise/skip/cancel | FR-7 |
| `approvalRequired` | `boolean` | `false` | Whether pipeline is waiting for human input | FR-6 |
| `chatHistory` | `ChatMessage[]` | `[]` | Full conversation history including context barriers | FR-9 |
| `currentPhase` | `string` | `""` | Current phase ID string (for realignment lookup) | FR-4 |
| `stepStatus` | `string` | `"INITIALIZED"` | Machine state log for edge routing | FR-1 |

### Supporting Types

| Type | Shape | Description |
|------|-------|-------------|
| `PipelineDefState` | `{ phases: PipelineDefPhase[] }` | Pipeline config in state |
| `PipelineDefPhase` | `{ id: string, agentIds: string[] }` | Minimal phase definition (no prompts/tools) |
| `ApprovalDecision` | `"approve" \| "reject" \| "revise" \| "skip" \| "cancel"` | Human decision enum |
| `ChatMessage` | `{ id, role, content, timestamp }` | Custom message type (NOT LangChain BaseMessage) |
| `PipelineState` | Aggregation of all above | Full Runtime state type |

### Key Functions

| Function | Signature | Description |
|----------|-----------|-------------|
| `resolvePhaseIndex` | `(state) => number` | Pure function returning realigned index or -1 |
| `routeFromSm` | `(state) => string` | Route to agent by index, or `advance_phase` if orphaned |
| `advancePhaseNode` | `(state) => Partial<PipelineState>` | Advance index, handle skip/cancel, inject barrier |
| `routeAfterAdvance` | `(state) => string` | Route to SM or END based on status |
| `handleLiveSpecMutation` | `() => Promise<boolean>` | Sandboxed hot-swap with transactional validation |
| `handleApproval` | `(threadId, decision) => void` | Process human approval/skip/cancel decision |

---

## 5. System Context Diagram

![System Context](diagrams/system-context.png)
*[Edit in draw.io](diagrams/system-context.drawio)*

The system context diagram shows the Pipeline Engine at the center, interacting with:
- **DevOps Engineer** — modifies agent `.md` spec files triggering hot-swap
- **Scrum Master** — makes skip/cancel/reconfigure decisions on orphaned phases
- **VS Code Extension** — provides UI for pipeline state visualization and human-in-the-loop interventions
- **File System** — persists `pipelineDefinition` in checkpoints via `WorkspaceCheckpointer`
- **Agent Registry** — provides agent metadata during initial pipeline load (not for routing)

---

## 6. Sequence Diagrams

![Sequence](diagrams/sequence.png)
*[Edit in draw.io](diagrams/sequence.drawio)*

The sequence diagram illustrates the full skip-with-barrier flow:
1. User sends chat request to `design` phase
2. Config hot-swap deletes `design` phase
3. `advancePhaseNode` detects orphan → pipeline pauses
4. User clicks "Skip" → `handleApproval("skip")`
5. `routeFromSm` routes to `advance_phase` (Layer 1)
6. `advancePhaseNode` repositions index (Layer 2) and injects context barrier into `chatHistory`
7. Next agent reads `chatHistory`, sees barrier, ignores stale requests

---

## 7. State Diagrams

![State](diagrams/state.png)
*[Edit in draw.io](diagrams/state.drawio)*

The state diagram covers pipeline lifecycle states:
- **idle** → initial state before pipeline starts
- **running** → pipeline is executing phases normally
- **paused** → orphaned phase detected, awaiting human decision
- **cancelled** → pipeline terminated by user or on reject
- **done** → all phases completed successfully

Transitions:
- `idle → running`: on `invoke()`
- `running → paused`: orphan detected (`resolvePhaseIndex` returns -1)
- `paused → running`: user selects "Skip" or pipeline reconfigured
- `paused → cancelled`: user selects "Cancel" or reject decision
- `running → done`: all phases completed
- `running → cancelled`: on cancel/reject during normal flow

---

## 8. API Contracts (TypeScript Signatures)

All functions operate over `PipelineState` defined in `core/state.ts`:

```typescript
export function resolvePhaseIndex(state: PipelineState): number;

export function advancePhaseNode(
  state: PipelineStateType
): Partial<PipelineStateType>;

export function routeFromSm(state: PipelineState): string;

export function routeAfterAdvance(state: PipelineState): string;

export function handleLiveSpecMutation(
  workspaceRoot: string,
  specPath: string
): Promise<void>;

export function qualityGateRouter(
  state: PipelineStateType
): string;

export function handleApproval(
  threadId: string,
  decision: ApprovalDecision
): Promise<void>;
```

---

## 9. Integration Specifications

### 9.1 LangGraphEngine ↔ pipeline/edges.ts ↔ pipeline/sdlc-graph.ts

```
LangGraphEngine.ensureGraph()
  └── buildSdlcSubgraph()              [pipeline/sdlc-graph.ts]
      ├── addNode("advance_phase", advancePhaseNode)
      └── addConditionalEdges(
            "sm",
            routeFromSm,               [pipeline/edges.ts: routeFromSm]
            buildSmTargets()           [pipeline/sdlc-graph.ts]
          )
          addConditionalEdges(
            "advance_phase",
            routeAfterAdvance,         [pipeline/edges.ts: routeAfterAdvance]
            { sm: "sm", __end__: END }
          )
```

### 9.2 State ↔ Routing Functions

`PipelineAnnotation` channels consumed by routing functions:

| Function | Reads | Writes |
|----------|-------|--------|
| `resolvePhaseIndex` | `pipelineDefinition`, `currentPhaseIndex`, `currentPhase` | — (pure) |
| `advancePhaseNode` | `pipelineDefinition`, `currentPhaseIndex`, `approvalDecision` | `currentPhaseIndex`, `currentPhase`, `pipelineStatus`, `chatHistory` |
| `routeFromSm` | `pipelineDefinition`, result of `resolvePhaseIndex` | — |
| `routeAfterAdvance` | `pipelineStatus`, `currentPhaseIndex`, `phases.length` | — |

### 9.3 ApprovalNode ↔ advancePhaseNode ↔ routeFromSm

```
handleApproval(threadId, "skip")
  → updateState({ approvalDecision: "skip", pipelineStatus: "running" })
  → routeAfterAdvance sees "running" → routes to "sm"
  → routeFromSm calls resolvePhaseIndex → -1 yet → returns "advance_phase"
  → advancePhaseNode reads approvalDecision === "skip"
    → repositions index, injects context barrier
    → returns { currentPhaseIndex, currentPhase, pipelineStatus: "running",
                chatHistory: [...old, barrierMsg] }
```

### 9.4 Context Barrier Message Flow

```
advancePhaseNode (decision === "skip")
  → creates ChatMessage with role: "system"
  → appends via immutable spread: chatHistory: [...(state.chatHistory || []), barrierMsg]
  → next agent reads chatHistory on invocation
  → agent sees barrier, infers stale requests are void
```

---

## 10. Pseudocode for Critical Paths

### 10.1 Skip Orphaned Phase

```
function advancePhaseNode(state):
  pd = state.pipelineDefinition
  idx = resolvePhaseIndex(state)

  // CASE A: Normal advance
  if idx >= 0:
    next = idx + 1
    if next < pd.phases.length:
      return { currentPhaseIndex: next, currentPhase: pd.phases[next].id }
    return { stepStatus: "ALL_DONE" }

  // CASE B: Orphan — no decision yet
  if state.approvalDecision == null:
    return { pipelineStatus: "paused", approvalRequired: true }

  // CASE C: Cancel
  if decision in ["cancel", "reject"]:
    return { pipelineStatus: "cancelled" }

  // CASE D: Skip
  if decision == "skip":
    target = state.currentPhaseIndex
    if target >= pd.phases.length:
      target = pd.phases.length - 1
    if target >= 0:
      nextPhase = pd.phases[target].id
      barrier = ChatMessage(
        id: `ctx-${Date.now()}-${randomUUID().substring(0,8)}`,
        role: "system",
        content: `[Context Barrier] Phase '${state.currentPhase}' SKIPPED. ` +
                 `Requests void. Current: '${nextPhase}'.`,
        timestamp: new Date().toISOString()
      )
      return {
        currentPhaseIndex: target,
        currentPhase: nextPhase,
        pipelineStatus: "running",
        approvalDecision: null,
        approvalRequired: false,
        chatHistory: [...(state.chatHistory || []), barrier]
      }
```

```
function routeFromSm(state):
  if state.pipelineDefinition?.phases.length > 0:
    idx = resolvePhaseIndex(state)
    if idx >= 0:
      phase = pd.phases[idx]
      if phase.agentIds.length > 0:
        return phase.agentIds[0]
    return "advance_phase"       // Layer 1: never fallback to agentRegistry
  return agentRegistry fallback (legacy)
```

```
function routeAfterAdvance(state):
  if state.pipelineStatus == "paused":
    return END
  if state.pipelineStatus == "cancelled":
    return END
  if state.currentPhaseIndex < state.pipelineDefinition.phases.length:
    return "sm"
  return END
```

### 10.2 Hot-Swap Validation

```
async function handleLiveSpecMutation(workspaceRoot, specPath):
  try:
    rawSpec = LiveMarkdownParser.parseLiveSpec(specPath)
    candidate = await PipelineExtractor.extract(rawSpec)

    // Validation rules
    if !candidate.phases || candidate.phases.length == 0:
      throw Error("Empty phase list")
    for phase in candidate.phases:
      if !phase.id || !phase.agentIds || phase.agentIds.length == 0:
        throw Error(`Phase '${phase.id}' missing agentIds`)

    // Sandbox passed → apply
    activeCompiledGraph = null     // trigger rebuild
    streamHandler.emitToUi("HOT_SWAP_SUCCESS", { phases: candidate.phases })

    // Index realignment guard
    triggeredThreads = findThreadsUsingPipeline(specPath)
    for thread in triggeredThreads:
      newIdx = candidate.phases.findIndex(p => p.id == thread.state.currentPhase)
      if newIdx >= 0:
        thread.state.currentPhaseIndex = newIdx
      // if -1, thread will pause on next advancePhaseNode

  catch error:
    streamHandler.emitToUi("SPEC_COMPILE_ERROR", { message: error.message })
```

### 10.3 Index Realignment with Orphan Detection

```
function resolvePhaseIndex(state):
  pd = state.pipelineDefinition
  if !pd || pd.phases.length == 0:
    return -1

  idx = state.currentPhaseIndex
  phase = pd.phases[idx]

  // Phase at pointer matches — normal case
  if phase && phase.id == state.currentPhase:
    return idx

  // Phase at pointer does NOT match — try realignment
  if phase && phase.id != state.currentPhase:
    realigned = pd.phases.findIndex(p => p.id == state.currentPhase)
    if realigned >= 0:
      return realigned              // self-healing
    return -1                        // orphaned — caller handles

  // Pointer is null/undefined — try realignment
  realigned = pd.phases.findIndex(p => p.id == state.currentPhase)
  if realigned >= 0:
    return realigned
  return -1                          // orphaned
```

---

## 11. Type Definitions Reference

```typescript
interface PipelineDefState {
  phases: PipelineDefPhase[];
}

interface PipelineDefPhase {
  id: string;
  agentIds: string[];
}

type ApprovalDecision =
  | "approve" | "reject" | "revise" | "skip" | "cancel";

type PipelineStatus =
  | "idle" | "running" | "paused" | "cancelled";

interface ChatMessage {
  id: string;
  role: "system" | "user" | "assistant";
  content: string;
  timestamp: string;       // ISO 8601
}
```

---

## 12. Error Handling Matrix

| Error | Where | Handling |
|-------|-------|----------|
| Orphaned phase detected | `resolvePhaseIndex()` → `-1` | Pause pipeline (`paused`), `approvalRequired: true`, human intervention via UI |
| Out-of-bounds index | `advancePhaseNode()` | Clamp to `pd.phases.length - 1`; if empty, skip to done |
| Invalid spec syntax | `handleLiveSpecMutation()` | Reject swap, preserve old spec, emit `SPEC_COMPILE_ERROR` to UI |
| Context barrier overflow | `advancePhaseNode()` | Append only via immutable spread `[...old, barrierMsg]` — never replace |
| Approval timeout | `handleApproval()` | Application-level timeout; pipeline stays `paused`; user must explicitly choose |
| Concurrent hot-swap race | `handleLiveSpecMutation()` | Per-thread `pipelineDefinition` isolation — Thread A swap does not affect Thread B |
| LLM extraction failure | `handleLiveSpecMutation()` | Catch block rejects mutation, returns error to UI, preserves original config |
