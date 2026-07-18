# Architecture-v2 — Data-Driven Pipeline & Hot-Swap

Tài liệu mô tả 3 cải tiến kiến trúc từ review-1: **Index-based Phase Routing**, **PipelineDef in State**, và **Sandboxed Hot-Swap**.

---

## 1. Index-Based Phase Routing

### Vấn đề
`advancedToNextPhase()` lookup bằng `order.indexOf(currentPhase)` mỗi lần route — không scale, không hỗ trợ skip/reorder.

### Giải pháp
Dùng `currentPhaseIndex` (con trỏ số) trong state:

```
Quality Gate (approve) → advance_phase (++index) → SM → routeFromSm (dùng index)
```

### Files thay đổi

| File | Thay đổi |
|---|---|
| `core/state.ts` | Thêm channel `currentPhaseIndex: Annotation<number>` (default 0) |
| `pipeline/edges.ts` | `routeFromSm()` dùng `state.pipelineDefinition.phases[idx]`; xoá `advanceToNextPhase()` |
| `pipeline/edges.ts` | `routeAfterQualityGate()` — "approve" → `"advance_phase"` |
| `pipeline/edges.ts` | `routeAfterAnalyzeInput()` — "APPROVE" → `"advance_phase"` |
| `pipeline/sdlc-graph.ts` | `advancePhaseNode()` — increment index, set `currentPhase`; register as graph node |
| `pipeline/sdlc-graph.ts` | Edge `advance_phase → routeAfterAdvance → sm\|__end__` |

### Data Flow

```
SM ──routeFromSm──→ Agent ──→ Verify ──→ Gate
                                            │
                                       approve?
                                            │
                                     advance_phase
                                      (index + 1)
                                            │
                                    routeAfterAdvance
                                      ┌─────┴─────┐
                                      sm        __end__
                                 (next phase)  (pipeline done)
```

---

## 2. PipelineDefinition in State

### Vấn đề
Pipeline definition lưu trong `AgentRegistry` singleton — không per-thread isolation, không checkpoint được.

### Giải pháp
Đưa `pipelineDefinition: PipelineDefState` vào `PipelineAnnotation` state channel.

```typescript
interface PipelineDefState {
  phases: PipelineDefPhase[];
}
// PipelineDefPhase: { id: string; agentIds: string[] }
```

### Files thay đổi

| File | Thay đổi |
|---|---|
| `core/state-types.ts` | Thêm `PipelineDefState`, `PipelineDefPhase` |
| `core/state.ts` | Thêm channel `pipelineDefinition: Annotation<PipelineDefState \| null>` |
| `engine/langgraph-engine.ts` | `invoke()` inject `pipelineDefinition` từ `agentRegistry.getPipeline()` |

### Lợi ích
- **Per-thread isolation**: mỗi thread có pipeline def riêng
- **Checkpoint/Resume**: pipeline cấu hình được persist cùng state
- **Routing**: `routeFromSm()` đọc trực tiếp từ state, không cần registry

### Fallback
Khi `pipelineDefinition === null`, hệ thống fallback về `agentRegistry.getFirstAgentNode(state.currentPhase)` (cơ chế cũ).

---

## 3. Sandboxed Hot-Swap

### Vấn đề
Mutation agent files → không có cơ chế validate + hot-swap pipeline spec. Chỉ có `graph = null` khi đổi LLM provider.

### Giải pháp
`LangGraphEngine.handleLiveSpecMutation()` — validate rồi mới áp dụng:

```
Agent files change → LLM extract → validate phases
    ↓ success                  ↓ failure
loadPipeline()              giữ nguyên spec cũ
graph = null (rebuild)      report error
```

### Files thay đổi

| File | Thay đổi |
|---|---|
| `engine/langgraph-engine.ts` | `handleLiveSpecMutation()` — extract → validate (phases non-empty, agents non-empty) → apply |
| `agents/registry.ts` | `loadPipeline()` giữ nguyên (gọi từ hot-swap) |

### Validation rules
1. `phases` không empty
2. Mỗi phase có `id` string và `agentIds` non-empty
3. LLM extract không throw exception

### Usage
```typescript
const engine = new LangGraphEngine(...);
const ok = await engine.handleLiveSpecMutation();
// ok === true: pipeline reloaded, graph sẽ rebuild ở lần invoke kế tiếp
```

---

## 4. Pipeline Routing (State Diagram)

```
                    ┌────────────────────────────────────────────┐
                    │              state.pipelineDefinition       │
                    │  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
                    │  │ phase[0] │→│ phase[1] │→│ phase[2] │→...│
                    │  │ req      │  │ spec     │  │ design   │   │
                    │  └──────────┘  └──────────┘  └──────────┘  │
                    └────────────────────────────────────────────┘
                                 ▲            │
                                 │            │ advance_phase
                                 │            ▼
                               SM ←── routeFromSm(state)
                                     idx = state.currentPhaseIndex
                                     agent = state.pipelineDefinition.phases[idx].agentIds[0]
```

---

## 5. Type Changes

| Type | Old | New |
|---|---|---|
| `PipelineAnnotation` | 30 channels | 32 channels (+`currentPhaseIndex`, +`pipelineDefinition`) |
| `PipelineState` | `currentPhase: SDLCPhase` string | + `currentPhaseIndex: number`, `pipelineDefinition: PipelineDefState \| null` |
| `edges.ts` | 2 helpers (`getPhaseNode`, `advanceToNextPhase`) | 3 functions + `routeAfterAdvance` |

---

## 6. API Reference

### New exports from `core/state.ts`
```typescript
PipelineDefState  // { phases: PipelineDefPhase[] }
PipelineDefPhase  // { id: string; agentIds: string[] }
```

### New export from `pipeline/edges.ts`
```typescript
routeAfterAdvance(state: PipelineState): string
// Routes to "sm" if currentPhaseIndex < phases.length, else "__end__"
```

### New method on `LangGraphEngine`
```typescript
handleLiveSpecMutation(): Promise<boolean>
// Returns true if pipeline was hot-swapped successfully
```
