# TDD — Technical Design Document
**Ticket:** SA4E-125 | **Author:** SA Agent | **Version:** 1.0 | **Architecture:** v2→v6

---

## 1. Module Structure & Class Hierarchy
### 1.1 Architecture Version → LangGraph Module Mapping
| Version | Feature | Module | Key Function |
|---------|---------|--------|-------------|
| **v2** | Index-based routing | `pipeline/edges.ts` | `routeFromSm()`, `routeAfterAdvance()`, `routeAfterQualityGate()` |
| **v2** | PipelineDef in State | `core/state.ts`, `core/state-types.ts` | `PipelineAnnotation` channels |
| **v2** | Sandboxed Hot-Swap | `engine/langgraph-engine.ts` | `handleLiveSpecMutation()` |
| **v2** | Graph wiring | `pipeline/sdlc-graph.ts` | `advancePhaseNode()`, `buildSmTargets()` |
| **v3** | Index Realignment | `pipeline/edges.ts` | `resolvePhaseIndex()` pure function |
| **v3** | Import path fix | `router/router-graph.ts` | Dynamic import paths |
| **v3** | State size optimization | `core/state-types.ts` | `PipelineDefPhase` trim |
| **v4** | Orphan Detection | `pipeline/edges.ts` | `resolvePhaseIndex()` → `-1` |
| **v4** | Pipeline Pause | `pipeline/sdlc-graph.ts` | `advancePhaseNode()` → `paused` |
| **v5** | Skip/Cancel decisions | `core/state-types.ts` | `ApprovalDecision` extended |
| **v5** | 3-layer fix | `pipeline/edges.ts`, `pipeline/sdlc-graph.ts` | `routeFromSm`, `advancePhaseNode`, `buildSmTargets` |
| **v5** | Approval handling | `engine/langgraph-engine.ts` | `handleApproval()` |
| **v6** | Context Barrier | `pipeline/sdlc-graph.ts` | Barrier injection in skip handler |

### 1.2 Class Hierarchy (Composition)
```
LangGraphEngine ──uses──→ AgentRegistry ──creates──→ PipelineExtractor
      │                         │
      │                         ▼
      │              buildSdlcSubgraph()
      │                 ├── advancePhaseNode()     [sdlc-graph.ts]
      │                 ├── routeFromSm()           [edges.ts: resolvePhaseIndex → agent | advance_phase]
      │                 ├── routeAfterAdvance()     [edges.ts: paused/cancelled → END]
      │                 └── buildSmTargets()        [sdlc-graph.ts: includes advance_phase]
      │
      └── DynamicAgentNode (extends BaseNode) — reads barrier from chatHistory
      └── ApprovalNode (extends BaseNode) — handles skip/cancel decisions
```
All routing functions read from `PipelineAnnotation` state (core/state.ts + state-types.ts).

### 1.3 Key Files Affected
| File | Lines | Changes (v2→v6) |
|------|-------|-----------------|
| `pipeline/edges.ts` | ~180 | +`resolvePhaseIndex()`, +`routeAfterAdvance()`, fix `routeFromSm()` |
| `pipeline/sdlc-graph.ts` | ~200 | +`advancePhaseNode()`, skip/cancel, barrier injection |
| `core/state.ts` | ~180 | +`currentPhaseIndex`, +`pipelineDefinition`, +`pipelineStatus` |
| `core/state-types.ts` | ~95 | +`PipelineDefState`, +`PipelineDefPhase`, +`ApprovalDecision` |
| `engine/langgraph-engine.ts` | ~250 | +`handleLiveSpecMutation()`, +`handleApproval()` |
| `agents/registry.ts` | ~120 | getPipeline() integration |
| `agents/pipeline-extractor.ts` | ~150 | PipelineDefinition extraction |
| `agents/approval-node.ts` | ~80 | skip/cancel handling |
| `agents/dynamic-agent-node.ts` | ~200 | Context barrier awareness |

---

## 2. State Machine Specification
### 2.1 Pipeline Lifecycle States
```
  idle ──invoke()──→ running ──idx>=len──→ done
                       │  ↑                  ↑
                  orphan│  │ skip      cancel│
                       ▼  │                  │
                     paused ──cancel──→ cancelled
```
### 2.2 State Transition Table
| From | To | Trigger | Condition |
|------|----|---------|-----------|
| `idle` | `running` | `LangGraphEngine.invoke()` | `pipelineDefinition` loaded |
| `running` | `paused` | `advancePhaseNode()` | `resolvePhaseIndex()` → `-1` no decision |
| `paused` | `running` | `handleApproval("skip")` | User skips orphaned phase |
| `paused` | `cancelled` | `handleApproval("cancel"\|"reject")` | User cancels |
| `running` | `done` | `advancePhaseNode()` | `currentPhaseIndex >= phases.length` |
| `running` | `cancelled` | `handleApproval("cancel"\|"reject")` | Any phase |

### 2.3 State Channel Definitions
```typescript
interface PipelineDefState { phases: PipelineDefPhase[]; }
interface PipelineDefPhase { id: string; agentIds: string[]; }
type ApprovalDecision = "approve" | "reject" | "revise" | "skip" | "cancel";
type PipelineStatus = "idle" | "running" | "paused" | "cancelled";
interface ChatMessage { id: string; role: "system"|"user"|"assistant"; content: string; timestamp: string; }
```
### 2.4 PipelineAnnotation Channels (New/Modified)
| Channel | Type | Default | Description |
|---------|------|---------|-------------|
| `currentPhaseIndex` | `number` | `0` | Integer pointer to current phase |
| `currentPhase` | `string` | `""` | Phase ID for realignment lookup |
| `pipelineDefinition` | `PipelineDefState\|null` | `null` | Per-thread pipeline snapshot |
| `pipelineStatus` | `PipelineStatus` | `"idle"` | Pipeline lifecycle state |
| `approvalDecision` | `ApprovalDecision\|null` | `null` | Human decision on pause |
| `approvalRequired` | `boolean` | `false` | Waiting for human input |
| `chatHistory` | `ChatMessage[]` | `[]` | Chat history + context barriers |
| `stepStatus` | `string` | `"INITIALIZED"` | Machine state log for routing |

---

## 3. Routing Decision Trees
### 3.1 `resolvePhaseIndex()` — Pure Function Decision Tree
```
resolvePhaseIndex(state)
  ├── !pd || pd.phases.length === 0 → return -1
  ├── phase = pd.phases[state.currentPhaseIndex]
  ├── phase && phase.id === state.currentPhase → return currentPhaseIndex  (normal)
  ├── phase && phase.id !== state.currentPhase
  │     realigned = pd.phases.findIndex(p => p.id === state.currentPhase)
  │     ├── realigned >= 0 → return realigned  (self-healing)
  │     └── realigned === -1 → return -1        (orphaned)
  └── !phase (null/undefined)
        realigned = pd.phases.findIndex(p => p.id === state.currentPhase)
        ├── realigned >= 0 → return realigned
        └── realigned === -1 → return -1        (orphaned)
```
### 3.2 `routeFromSm()` — Routing Paths
```
routeFromSm(state)
  ├── pd && pd.phases.length > 0
  │     idx = resolvePhaseIndex(state)
  │     ├── idx >= 0
  │     │     phase = pd.phases[idx]
  │     │     ├── phase.agentIds.length > 0 → return phase.agentIds[0]
  │     │     └── !phase.agentIds → return "advance_phase"
  │     └── idx === -1 → return "advance_phase"  (Layer 1 — NO agentRegistry)
  └── !pd → agentRegistry.getFirstAgentNode() or "sm" (legacy fallback)
```
### 3.3 `advancePhaseNode()` — 4 Cases
```
advancePhaseNode(state) [idx = resolvePhaseIndex(state)]
  ├── CASE A: NORMAL (idx >= 0)
  │     next = idx + 1; next < len → { currentPhaseIndex: next, ... }
  │     next >= len → { stepStatus: "ALL_DONE" }
  ├── CASE B: ORPHAN (idx == -1, decision == null)
  │     → { pipelineStatus: "paused", approvalRequired: true }
  ├── CASE C: CANCEL (idx == -1, decision == "cancel"|"reject")
  │     → { pipelineStatus: "cancelled" }
  └── CASE D: SKIP (idx == -1, decision == "skip"|"approve")
        targetIdx = clamp(currentPhaseIndex, 0, pd.phases.length-1)
        if targetIdx >= 0:
          nextPhase = pd.phases[targetIdx].id
          barrier = createBarrierMessage(currentPhase, nextPhase)
          → { currentPhaseIndex: targetIdx, currentPhase: nextPhase,
              pipelineStatus: "running", approvalDecision: null,
              chatHistory: [...old, barrier] }
```
### 3.4 `routeAfterAdvance()` — Routing to SM or END
```
routeAfterAdvance(state)
  ├── pipelineStatus === "paused"    → END
  ├── pipelineStatus === "cancelled" → END
  ├── currentPhaseIndex < len        → "sm"
  └── currentPhaseIndex >= len       → END
```

---

## 4. Hot-Swap Transaction Protocol
### 4.1 Lifecycle
```
Agent .md change → LiveMarkdownParser.parseLiveSpec() → PipelineExtractor.extract() [LLM]
  → Sandbox Validation (3 rules)
    ├── SUCCESS → apply, graph = null, realign indices, emit HOT_SWAP_SUCCESS
    └── FAILURE → preserve old spec, emit SPEC_COMPILE_ERROR
```
### 4.2 Sandbox Validation — 3 Rules
| Rule | Condition | Error |
|------|-----------|-------|
| R1 | `candidate.phases` MUST NOT be empty | `"Empty phase list"` |
| R2 | Each phase MUST have non-empty `id` and `agentIds[]` | `"Phase '{id}' missing agentIds"` |
| R3 | LLM extraction MUST NOT throw | `"LLM extraction failed: {message}"` |

### 4.3 Apply Protocol
```typescript
async function applyHotSwap(candidate: PipelineDefinition): void {
  agentRegistry.storePipeline(candidate);
  activeCompiledGraph = null;  // trigger rebuild on next invoke
  for (const thread of findThreadsUsingPipeline(specPath)) {
    const newIdx = candidate.phases.findIndex(p => p.id === thread.state.currentPhase);
    if (newIdx >= 0) thread.state.currentPhaseIndex = newIdx;  // self-healing
    // if newIdx === -1, thread will pause on next advancePhaseNode
  }
  streamHandler.emitToUi("HOT_SWAP_SUCCESS", { phases: candidate.phases });
}
```
### 4.4 Per-Thread Isolation
- Each `invoke()` captures: `pipelineDefinition = agentRegistry.getPipeline()` → stored in state
- Thread A hot-swaps → Thread B's `pipelineDefinition` unchanged
- Only threads using same `specPath` affected

---

## 5. Context Barrier Design
### 5.1 Message Structure
```typescript
function createBarrierMessage(skippedPhase: string, nextPhaseId: string): ChatMessage {
  return {
    id: `ctx-${Date.now()}-${randomUUID().substring(0, 8)}`,
    role: "system",
    content: `[Context Barrier] Phase '${skippedPhase}' was deleted and SKIPPED. ` +
      `Requests related to it are void. Current phase: '${nextPhaseId}'.`,
    timestamp: new Date().toISOString(),
  };
}
```
### 5.2 Injection Point
In `advancePhaseNode()`, Case D (skip):
```
decision === "skip"
  → createBarrierMessage(skippedPhase, nextPhaseId)
  → return { chatHistory: [...(state.chatHistory || []), barrierMsg], ... }
```
### 5.3 Downstream Consumption
```
Next DynamicAgentNode invoked → reads state.chatHistory
  → finds barrierMsg (role: "system")
  → infers previous phase requests are void
  → focuses on current phase task
```
### 5.4 Design Rules
| Rule | Description |
|------|-------------|
| BR-39 | `role: "system"` with `ChatMessage` type (NOT LangChain `SystemMessage`) |
| BR-40 | Append via immutable spread — never replace |
| BR-41 | Content states: skipped phase, void requests, current phase |
| BR-42 | ONLY for orphaned skip — NOT for normal transitions |
| BR-43 | Unique ID: `ctx-{timestamp}-{randomUUID8}` |
| BR-44 | Historic messages preserved |

---

## 6. Data Flow Diagrams Reference
All diagrams at `documents/SA4E-125/diagrams/tdd/`:
| File | Description |
|------|-------------|
| `normal-flow.drawio` | v2 — Quality Gate → advance_phase → routeAfterAdvance → SM → routeFromSm → Agent |
| `hot-swap-flow.drawio` | v3 — Spec mutation → LLM extract → sandbox validate → apply/reject |
| `orphan-flow.drawio` | v4 — resolvePhaseIndex(-1) → pause → human intervention (Skip/Cancel/Reconfigure) |
| `skip-resolution.drawio` | v5 — 3-layer fix: routeFromSm → advance_phase → advancePhaseNode skip → buildSmTargets |
| `context-barrier.drawio` | v6 — Skip → create barrier → inject into chatHistory → agent reads → ignores stale |
| `state-machine.drawio` | idle → running → paused/cancelled/done lifecycle with transitions |
| `class-hierarchy.drawio` | LangGraphEngine, AgentRegistry, edges.ts, sdlc-graph.ts, state types composition |
| `full-sequence.drawio` | Complete skip-with-barrier: user→SM→routeFromSm→advancePhaseNode→barrier→agent |

---

## 7. Error Handling Matrix
| Error | Where | Handling |
|-------|-------|----------|
| Orphaned phase | `resolvePhaseIndex()` → `-1` | Pause pipeline, `approvalRequired: true`, human via UI |
| OOB index | `advancePhaseNode()` | Clamp to `pd.phases.length - 1` |
| Invalid spec syntax | `handleLiveSpecMutation()` | Reject, preserve old spec, `SPEC_COMPILE_ERROR` |
| Context overflow | `advancePhaseNode()` | Append via spread — never replace |
| Approval timeout | `handleApproval()` | Pipeline stays `paused` — explicit user choice |
| Concurrent hot-swap | `handleLiveSpecMutation()` | Per-thread isolation — Thread A ≠ Thread B |
| LLM extraction fail | `handleLiveSpecMutation()` | Catch → reject → report error to UI |
