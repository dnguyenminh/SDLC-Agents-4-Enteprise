# User Guide — Pipeline Refactoring: Hardcoded → Data-Driven Architecture (v2-v6)

**Ticket:** SA4E-125 | **Version:** 1.0

---

## 1. Overview

This guide covers setup, configuration, and usage of the new **data-driven pipeline** features:
- Index-based phase routing (replacing string lookups)
- Sandboxed hot-swap of agent configurations
- Orphaned phase detection and skip/cancel
- Ghost context barrier injection

---

## 2. Setup

### 2.1 Prerequisites

- Node.js ≥ 18, VS Code extension with LangGraph engine
- Workspace with `.kiro/agents/*.md` agent spec files
- `STATUS.json` per ticket in `documents/{TICKET}/`

### 2.2 Configuration

Agent spec files (`.kiro/agents/*.md`) define the pipeline. The new architecture uses **runtime pipeline definition** extracted by LLM from these files:

```yaml
---
name: ba-agent
---
## Workflow
- Phase: requirements
- Output: BRD.md
```

The `PipelineExtractor` reads all `.kiro/agents/*.md` files and produces a `PipelineDefinition` with phases and their order.

---

## 3. Key Features

### 3.1 Index-Based Routing (v2)

The pipeline no longer uses `order.indexOf(currentPhase)` string lookups. Instead, it reads `pipelineDefinition.phases[currentPhaseIndex]`.

**What changed for you:** Nothing visible. Routing is deterministic and faster.

**Check current index:**
```typescript
// State channel
state.currentPhaseIndex  // number, 0-based
state.pipelineDefinition.phases[state.currentPhaseIndex].id  // current phase ID
```

### 3.2 Hot-Swap Agent Config (v2)

You can modify agent `.md` files at runtime. The system validates changes in a sandbox before applying.

**How to use:**
1. Open `.kiro/agents/{agent}.md`
2. Edit the file (add/remove phases, change agent IDs)
3. Save — the system automatically detects the change
4. If valid: hot-swap succeeds, next `invoke()` uses the new config
5. If invalid: old config is preserved, error shown in VS Code notification

**Validation rules:**
- Phases list must not be empty
- Each phase must have non-empty `id` and `agentIds[]`
- LLM extraction must not throw

**Per-thread isolation:** Thread A's hot-swap does NOT affect Thread B's running pipeline.

### 3.3 Orphaned Phase Resolution (v4)

When a phase you were currently in gets deleted from the pipeline config:

1. Pipeline **pauses** automatically
2. VS Code shows: *"Phase '{name}' no longer exists in pipeline config."*
3. You have 3 choices:
   - **Skip** — bypass the deleted phase, continue with the phase at the same position
   - **Reconfigure** — edit the config file to restore or reorder phases
   - **Cancel** — terminate the pipeline

**Behind the scenes:** `resolvePhaseIndex()` returns `-1`, triggering `pipelineStatus: "paused"`.

### 3.4 Skip Resolution (v5)

When you choose **Skip**:
1. Pipeline resumes (`pipelineStatus: "running"`)
2. The index repositions to the phase that now occupies the old position
3. No infinite loops — the `advancePhaseNode` handles the skip deterministically

### 3.5 Context Barrier (v6)

When a phase is skipped due to orphan, a **context barrier message** is injected into the agent's chat history:

```
[Context Barrier] Phase 'design' was deleted and SKIPPED.
Requests related to it are void. Current phase: 'test_planning'.
```

This prevents downstream agents from acting on stale requests.

**What you see:** Nothing extra. The barrier is internal. Agents automatically read it and ignore stale context.

---

## 4. API Reference

### State Channels (new)

| Channel | Type | Description |
|---------|------|-------------|
| `currentPhaseIndex` | `number` | Integer pointer to current phase (default 0) |
| `pipelineDefinition` | `PipelineDefState \| null` | Per-thread pipeline config snapshot |
| `pipelineStatus` | `"idle" \| "running" \| "paused" \| "cancelled"` | Pipeline lifecycle state |
| `approvalDecision` | `ApprovalDecision` | Human decision on pause |
| `approvalRequired` | `boolean` | Whether waiting for human input |

### Routing Functions

| Function | Purpose | Called By |
|----------|---------|-----------|
| `resolvePhaseIndex(state)` | Realign index or detect orphan | `routeFromSm`, `getPhaseNode` |
| `routeFromSm(state)` | Route to current phase agent or `advance_phase` | Conditional edge from SM node |
| `advancePhaseNode(state)` | Advance index, handle skip/cancel, inject barrier | Graph node |
| `routeAfterAdvance(state)` | Route to SM or END after advance | Conditional edge from advance_phase |
| `handleLiveSpecMutation()` | Sandboxed hot-swap with validation | File watcher |

---

## 5. Troubleshooting

| Symptom | Cause | Solution |
|---------|-------|----------|
| Pipeline pauses unexpectedly | Orphaned phase detected | Check config — phase may have been deleted. Choose Skip or Reconfigure |
| "SPEC_COMPILE_ERROR" in notification | Invalid agent spec change | Revert or fix the `.md` file. Old config preserved |
| Agent seems confused by old requests | Ghost context from skipped phase (pre-v6) | Upgrade to v6 architecture. Barrier auto-injected on skip |
| Pipeline doesn't advance | `currentPhaseIndex` out of bounds | `resolvePhaseIndex` clamps automatically. Check `pipelineDefinition.phases` |

---

## 6. Architecture Versions Quick Reference

| Version | Feature | Key File |
|---------|---------|----------|
| v2 | Index routing + PipelineDefinition in state + Sandboxed hot-swap | `pipeline/edges.ts`, `core/state.ts` |
| v3 | resolvePhaseIndex realignment + State size optimization | `pipeline/edges.ts` |
| v4 | Orphan detection + Pipeline pause | `pipeline/sdlc-graph.ts` |
| v5 | 3-layer skip fix (routeFromSm, advancePhaseNode, buildSmTargets) | `pipeline/edges.ts`, `pipeline/sdlc-graph.ts` |
| v6 | Ghost context barrier injection | `pipeline/sdlc-graph.ts` |
