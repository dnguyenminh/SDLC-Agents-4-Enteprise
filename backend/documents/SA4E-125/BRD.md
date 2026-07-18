# BRD — Pipeline Refactoring: Hardcoded → Data-Driven Architecture (v2-v6)

**Ticket:** SA4E-125
**Author:** BA Agent
**Version:** v1

---

## 1. Executive Summary

The current SDLC pipeline uses hardcoded phase routing with string-based lookups (`order.indexOf(currentPhase)`) and a static graph topology that cannot tolerate runtime configuration changes. When users modify agent specification files (`.md`) or pipeline definitions at runtime, the system either crashes (nondeterministic bootstrapping) or produces incorrect routing behavior (index shift, orphan phases, infinite loops, ghost context pollution).

This refactoring transforms the pipeline from a **hardcoded static architecture** to a **data-driven virtual machine (VM)** where the graph topology is compiled once at startup (deterministic, crash-proof) while all routing decisions are driven by runtime state: `currentPhaseIndex` (integer pointer) and `pipelineDefinition` (per-thread snapshot). The refactoring spans 5 incremental architecture versions (v2–v6) that progressively address edge cases discovered through 6 rounds of architectural review.

---

## 2. Business Objectives

| ID | Objective | Metric | Priority |
|---|---|---|---|
| BO-1 | Eliminate pipeline crashes from runtime config changes | Zero crash incidents from hot-swap operations | Critical |
| BO-2 | Enable per-thread pipeline isolation | Each thread uses its own `pipelineDefinition` snapshot | High |
| BO-3 | Support hot-swap of agent spec files without pipeline interruption | Hot-swap acceptance rate > 99% | High |
| BO-4 | Eliminate infinite loops from orphaned phases | Zero infinite loop incidents post-deployment | Critical |
| BO-5 | Prevent cross-phase context pollution when skipping phases | Zero hallucination incidents traceable to ghost context | Medium |
| BO-6 | Reduce checkpoint state size for pipeline definitions | Checkpoint size ≤ 5KB per pipeline definition | Medium |

---

## 3. Scope

### In-Scope

| Item | Architecture Version |
|---|---|
| Index-based phase routing (replace string lookup with `currentPhaseIndex`) | v2 |
| PipelineDefinition in state (per-thread isolation, checkpoint/resume) | v2 |
| Sandboxed hot-swap with transactional validation (3 rules) | v2 |
| `resolvePhaseIndex()` self-healing guard for index realignment | v3 |
| Router import path fixes (dynamic import paths after module reorganization) | v3 |
| State size optimization (strip prompts/tools/config from PipelineDefState) | v3 |
| Orphaned phase detection — `resolvePhaseIndex()` returns -1 | v4 |
| Pipeline pause mechanism with `pipelineStatus: "paused"` | v4 |
| Skip phase ambiguity fix — 3-layer fix (route to advance_phase, skip/cancel decisions, build targets) | v5 |
| Ghost context barrier — inject `ChatMessage` with `role: "system"` on skip | v6 |

### Out-of-Scope

| Item | Rationale |
|---|---|
| UI redesign of VS Code pipeline dashboard | Handled by separate extension task |
| Subgraph routing improvements (hotfix, code-review, docs) | Subgraphs use their own routing, unaffected |
| LLM provider switching mechanism | Already handled by providers/ module |
| Frontend rendering of pipeline state visualization | Separate UI ticket |
| Performance optimization of LLM token consumption | Covered by context-budget module |

---

## 4. Stakeholders

| Stakeholder | Role | Impact |
|---|---|---|
| **DevOps Engineer** | Manages pipeline configuration files | Hot-swap enables live config changes without restart |
| **SDLC Developer** | Uses pipeline to generate artifacts | No more crashes from config changes, smooth phase transitions |
| **Scrum Master (SM)** | Reviews phase outputs and manages quality gates | Skip/cancel orphan phases without system confusion |
| **VS Code Extension Users** | End users of the IDE pipeline | Uninterrupted workflow, contextually correct agent responses |
| **QA Team** | Validates pipeline behavior | Easier to test with deterministic, data-driven routing |
| **Technical Architect (TA)** | Designs system architecture | Modular, extensible, enterprise-grade BPM-like architecture |

---

## 5. User Stories

### US-1: Hot-Swap Agent Configuration Without Pipeline Crash

> **As a** DevOps Engineer  
> **I want** to modify agent specification `.md` files at runtime  
> **So that** pipeline configuration can be updated without restarting the extension.

**Acceptance Criteria:**
- New spec files are validated in a sandbox before applying
- Invalid spec files do not disrupt running pipelines
- Each thread maintains its own pipeline definition snapshot
- Concurrency: Thread A hot-swaps without affecting Thread B's pipeline

### US-2: Skip Deleted Phase Without Infinite Loop

> **As a** Scrum Master  
> **I want** to skip a phase that was deleted from the pipeline configuration  
> **So that** the pipeline continues to subsequent phases without getting stuck in an infinite loop.

**Acceptance Criteria:**
- When `resolvePhaseIndex()` returns -1, pipeline pauses with `pipelineStatus: "paused"`
- SM can choose "Skip" from the UI to bypass the orphaned phase
- `advancePhaseNode()` repositions the index to the phase at the old position
- The agent registry is NOT used as fallback for orphaned phases
- Skipping does NOT cause infinite pause/resume cycles

### US-3: Receive Context Barrier When Phase Is Skipped

> **As a** SDLC Developer (using `qa-agent`)  
> **I want** to see a context barrier message when a previous phase was skipped  
> **So that** I don't get confused by stale requests from the deleted phase.

**Acceptance Criteria:**
- When a phase is skipped, a `ChatMessage` with `role: "system"` is appended to `chatHistory`
- The barrier message clearly states which phase was skipped and what the current phase is
- Historic chat messages are preserved (append, not replace)
- The barrier is ONLY injected for orphaned skip, NOT for normal phase transitions
- The next agent reads the barrier and understands previous requests are void

### US-4: Resume Pipeline After Index Realignment

> **As a** VS Code Extension User  
> **I want** the pipeline to correctly identify my current phase after I reorder phases in the config  
> **So that** I don't lose progress when adjusting the pipeline structure.

**Acceptance Criteria:**
- `resolvePhaseIndex()` realigns `currentPhaseIndex` if the phase ID matches at a new position
- If the current phase was deleted, the pipeline pauses for human decision (not silently fails)
- Checkpoint/Resume preserves the realigned index correctly
- No out-of-bounds array access occurs

---

## 6. Business Flow Diagrams

![Business Flow](diagrams/business-flow.png)
*[Edit in draw.io](diagrams/business-flow.drawio)*

The business flow diagram illustrates the end-to-end pipeline lifecycle across all 5 architecture versions:

- **v2 Flow**: Quality Gate → advance_phase (index+1) → SM → routeFromSm (by index) → next agent
- **v3 Flow**: Hot-swap triggers `resolvePhaseIndex()` realignment before routing
- **v4 Flow**: Orphan detection → pipeline pause → human intervention (Skip/Reconfigure/Cancel)
- **v5 Flow**: 3-layer fix — SM routes to advance_phase (not agent registry) when orphaned → skip advances to phase at old index position
- **v6 Flow**: Ghost context barrier injected into chatHistory on skip → next agent sees barrier → ignores stale requests

---

## 7. Use Case Diagrams

![Use Case](diagrams/use-case.png)
*[Edit in draw.io](diagrams/use-case.drawio)*

Primary use cases:

1. **Manage Pipeline Configuration**
   - Modify agent `.md` files (DevOps)
   - Hot-swap pipeline definition (System)
   - Validate config in sandbox (System)

2. **Execute Pipeline**
   - Start pipeline with per-thread state (System)
   - Route by index to current phase (System)
   - Verify phase output (VerifyNode)
   - Approve/reject phase (ApprovalNode)

3. **Handle Pipeline Exceptions**
   - Detect orphaned phase (System)
   - Pause pipeline for intervention (System)
   - Skip orphaned phase (SM)
   - Reconfigure pipeline (DevOps)
   - Cancel pipeline (SM)

4. **Manage Context Integrity**
   - Inject context barrier on skip (System)
   - Read barrier and ignore stale requests (Agent)
