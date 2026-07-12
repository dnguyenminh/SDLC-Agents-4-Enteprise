# Architecture-v4 — Orphaned Phase Handler

Fix Orphaned Phase Trap từ review-3: phase bị xóa khỏi pipeline spec khi đang chạy.

---

## 1. Orphaned Phase Problem

### Kịch bản
Pipeline đang ở phase `design` (`currentPhaseIndex=2`, `currentPhase="design"`). Hot-swap xóa `design` khỏi pipeline definition.

Mảng mới: `[requirements, specification, test_planning, ...]` — 3 phần tử.

### Vấn đề
`resolvePhaseIndex()` cũ trả về `idx=2` → `pd.phases[2]` = `test_planning` (sai phase) hoặc out-of-bounds.

---

## 2. Giải pháp: Orphan Detection + Pause

### `resolvePhaseIndex()` — pure function, trả về -1 khi orphan

```typescript
export function resolvePhaseIndex(state: PipelineState): number {
  const pd = state.pipelineDefinition;
  if (!pd || pd.phases.length === 0) return -1;
  let idx = state.currentPhaseIndex;
  const phase = pd.phases[idx];
  if (!phase || phase.id !== state.currentPhase) {
    const realigned = pd.phases.findIndex(p => p.id === state.currentPhase);
    if (realigned !== -1) idx = realigned;
    else return -1; // Orphaned phase
  }
  return idx;
}
```

### Caller xử lý fallback

| Hàm | Khi idx < 0 |
|---|---|
| `routeFromSm()` | Fallback `agentRegistry.getFirstAgentNode(state.currentPhase)` → `"sm"` |
| `getPhaseNode()` | Fallback `agentRegistry` → `"sm"` |
| `advancePhaseNode()` | `pipelineStatus: "paused"`, `approvalRequired: true` |
| `routeAfterAdvance()` | Check `pipelineStatus === "paused"` → `__end__` |

### Luồng Orphan
```
advancePhaseNode ← Gate approve (currentPhase = "design" bị xóa)
    │  idx = resolvePhaseIndex(state) → -1
    │  return { pipelineStatus: "paused", approvalRequired: true }
    ▼
routeAfterAdvance ← pipelineStatus === "paused"? → __end__
    │
    ▼
Pipeline dừng. Human intervention required.
User được thông báo: "Phase 'design' không còn tồn tại trong pipeline config."
```

### So sánh với đề xuất review-3

| Review đề xuất | Implement thực tế | Lý do |
|---|---|---|
| Mutate `state.currentPhase` trong `resolvePhaseIndex` | Không mutate state | Pure function, LangGraph không checkpoint side effect |
| Fallback: giữ index cũ, ép phase mới | Pause pipeline + human intervention | Không tự ý quyết định thay user |
| `if (idx >= length) idx = length - 1` | `return -1` → caller xử lý | Trách nhiệm tách biệt |

---

## 3. Files thay đổi (v3 → v4)

| File | Thay đổi |
|---|---|
| `pipeline/edges.ts` | `resolvePhaseIndex()` — `!phase` check + `return -1` cho orphan. Export function. |
| `pipeline/edges.ts` | `routeFromSm()` — guard `idx >= 0` |
| `pipeline/edges.ts` | `getPhaseNode()` — guard `idx >= 0` |
| `pipeline/edges.ts` | `routeAfterAdvance()` — check `pipelineStatus === "paused"` |
| `pipeline/sdlc-graph.ts` | Import `resolvePhaseIndex`. `advancePhaseNode()` dùng `resolvePhaseIndex` thay `++`, pause khi orphan |

---

## 4. Type & API Changes

| Export | Từ | Đến |
|---|---|---|
| `resolvePhaseIndex()` | không export | `export function` |

---

## 5. Trạng thái Orphan

Khi orphan detected:
- `pipelineStatus: "paused"`
- `approvalRequired: true`
- `approvalDecision: null`
- Không checkpoint index mới
- User resume với decision: skip phase hoặc reconfigure

---

## 6. State Diagram (Orphan Flow)

```
                    ┌──────────────┐
                    │   advance    │
                    │  phase node  │
                    └──────┬───────┘
                           │ resolvePhaseIndex = -1
                           ▼
                    ┌──────────────┐
                    │   paused     │
                    │  pipeline    │
                    └──────┬───────┘
                           │
                    ┌──────┴───────┐
                    │  user decide │
                    ├──────────────┤
                    │ Skip phase   │──→ advancePhaseNode (advance past)
                    │ Reconfigure  │──→ hot-swap lại config
                    │ Cancel       │──→ __end__
                    └──────────────┘
```
