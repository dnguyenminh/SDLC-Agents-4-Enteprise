# Pi SDK vs LangGraph Migration Plan - Option C

## 📌 Overview

This document outlines the complete plan to replace the LangGraph-based workflow engine in the SDLC Agents 4 Enterprise VS Code extension with the Pi SDK (`@earendil-works/pi-agent-core`), following **Option C: Full Replacement** strategy.

**Goal**: Replace the entire LangGraph workflow execution engine while preserving the SDLC pipeline logic, state management, and integration points, but using Pi SDK primitives as the foundation.

---

## 🏗️ Architecture Analysis

### Current LangGraph Components

| Component | Role | Lines of Code |
|-----------|------|---------------|
| `LangGraphEngine` | Main orchestration engine, graph execution, checkpoint management | ~2,000 |
| Subgraphs (sdlc-graph, chat-graph, etc.) | Phase-specific workflows | ~1,500 |
| State management (`PipelineState`) | Pipeline state with checkpoints | ~500 |
| LLM Providers (Anthropic, OpenAI, etc.) | Text generation, tool use handling | ~300 each |
| Tool Approval Gate | Human-in-the-loop approval logic | ~200 |

### Pi SDK Capabilities

| Feature | Pi SDK (@earendil-works/pi-agent-core) |
|---------|----------------------------------------|
| Transport abstraction | WebSocket/HTTP |
| State management | Session/turn tracking |
| Agent fundamentals | Tool use, message handling |
| **Does NOT include** | Compiled workflow engine, phase transitions, automatic checkpointing |

---

## 🎯 Option Comparison

### Option A: Wrap Pi into LangGraph **(Recommended Start)**
- **Change**: Only LLM provider layer
- **Keep**: Entire LangGraph engine, graphs, state management
- **Risk**: Low
- **Effort**: ~200 lines

### Option B: Pi-Driven Workflow **(Medium)**
- **Change**: New workflow engine using Pi building blocks
- **Keep**: Some state concepts, adapt PipelineState
- **Risk**: Medium
- **Effort**: ~500-800 lines

### Option C: Full Replacement **(This Plan)**
- **Change**: Rewrite workflow engine using Pi SDK primitives
- **Keep**: RemoteCheckpointer backend, some adapter patterns
- **Risk**: High (but controlled)
- **Effort**: ~1,400 lines, 6-9 weeks

---

## 📋 Option C: Full Replacement Detailed Plan

### 1. Architecture: "PiWorkflow Engine"

```
User Input
    ↓
Intent Classification (Zod + LLM via Pi SDK)
    ↓
Phase Selection
    ↓
Agent Assignment (from registry)
    ↓
Tool Use Loop (Pi SDK agent ↔ tools)
    ↓
Phase Transition Check
    ↓
Next Phase hoặc Finish
    ↓
Persistence (RemoteCheckpointer backend)
```

**Key Difference**: Instead of `graph.invoke(state)`, we use `workflow.execute(ticket, phase, input)` with custom loop logic.

### 2. Mapping: LangGraph → Pi SDK Primitives

| LangGraph Concept | Pi SDK Equivalent | Implementation |
|-------------------|-------------------|----------------|
| Compiled graph | `PiAgent` instance + custom executor | Build custom executor |
| State snapshot | `PiAgent` internal state + custom checkpoint | Serialize/deserialize for RemoteCheckpointer |
| Edge routing (phase transitions) | `workflow.executor` routing logic | Write router functions like LangGraph edges |
| Checkpointing | `RemoteCheckpointer` (unchanged) | Serialize Pi state to DB-compatible format |
| Human approval | `ToolApprovalGate` + Pi tool result handling | Normalize tool_use_id format |
| Streaming | `PiAgent.stream()` + custom reader | Adapt SSE/NDJSON format |
| Context window | `PiAgent.contextWindow` tokens | DetectEarly before execution |

### 3. New Code Structure: `src/pi-workflow/`

```
src/pi-workflow/
├── pi-workflow.ts          # Main engine orchestrator
├── pi-agent-executor.ts    # Single agent turn executor
├── phase-router.ts         # Phase transition logic (like edges)
├── state-adapter.ts        # PipelineState <-> Pi SDK state mapping
├── approval-adapter.ts     # ToolApprovalGate adaptation
├── kb-client.ts            # KB search via MCP (unchanged)
├── checkpointer-adapter.ts # RemoteCheckpointer adaptation
└── types/
    └── pi-workflow-state.ts # Custom state schema
```

### 4. State Schema Adaptation

**Keep fields** (critical for backward compatibility):
- `ticketKey`, `threadId`, `currentPhase`, `pipelineStatus`
- `chatHistory`, `agentOutputs`, `errors`
- `pipelineDefinition`, `autonomyLevel`

**Add fields** (Pi SDK compatibility):
- `piSessionId` - Internal Pi session ID
- `currentAgentId` - Agent currently executing
- `toolCallCount` - Tracking tool calls

**Adapter pattern**:
```typescript
class StateAdapter {
  toPiState(pipelineState: PipelineState): PiInternalState { ... }
  fromPiState(piState: PiInternalState): PipelineState { ... }
}
```

### 5. Migration Roadmap (6 Steps)

| Bước | Mô tả | Estimated Time |
|------|-------|----------------|
| **Bước 1** | Cài Pi SDK + tạo Pi Provider | 0.5 ngày |
| **Bước 2** | Xây dựng PiAgent Executor (single turn) | 1 ngày |
| **Bước 3** user wants the content saved as a markdown file. I'll save the migration plan to a file.---

```
{
  "guidance": "Save the migration plan as a markdown file at the recommended path",
  "content": "# Pi...t...u...n...g...\n\n## 📌 Overview\n\nThis document outlines the complete plan to replace the LangGraph-based workflow engine in the SDLC Agents 4 Enterprise VS Code extension with the Pi SDK (`@earendil-works/pi-agent-core`), following **Option C: Full Replacement** strategy.\n\n**Goal**: Swap out the entire LangGraph workflow execution engine while preserving the SDLC pipeline logic, state management, and integration points, but using Pi SDK primitives as the foundation.\n\n---",