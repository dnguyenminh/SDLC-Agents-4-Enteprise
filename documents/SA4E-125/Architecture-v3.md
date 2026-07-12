# Architecture-v3 — Index Realignment & Router Fixes

Cập nhật từ review-2: fix Index Shift edge case, sửa router import paths lỗi.

---

## 1. Index Shift Problem — Giải pháp

### Vấn đề
Hot-swap pipeline spec (thêm/xóa/reorder phase) → `currentPhaseIndex` trỏ sai phase.
Ví dụ: index `2` đang trỏ `Design`, sau khi chèn `UI_Design` trước nó → index `2` trỏ `UI_Design`.

### Giải pháp: `resolvePhaseIndex()`

```typescript
function resolvePhaseIndex(state: PipelineState): number {
  const pd = state.pipelineDefinition;
  if (!pd || pd.phases.length === 0) return -1;
  let idx = state.currentPhaseIndex;
  const phase = pd.phases[idx];
  // Realign nếu phase tại index không khớp currentPhase
  if (phase && phase.id !== state.currentPhase) {
    const realigned = pd.phases.findIndex(p => p.id === state.currentPhase);
    if (realigned !== -1) idx = realigned;
  }
  return idx;
}
```

### Tác động
| Hàm | Thay đổi |
|---|---|
| `routeFromSm()` | Thay `pd.phases[state.currentPhaseIndex]` → `pd.phases[resolvePhaseIndex(state)]` |
| `getPhaseNode()` | Dùng `resolvePhaseIndex(state)` thay `state.currentPhaseIndex` |
| `advancePhaseNode()` | Giữ nguyên — dùng `++currentPhaseIndex` từ state đã realign |

### Luồng realignment
```
Hot-swap → pipelineDefinition.phases thay đổi
    ↓
routeFromSm() gọi resolvePhaseIndex()
    ├── phase.id === state.currentPhase → OK, giữ index
    └── phase.id !== state.currentPhase → findIndex realign
        ↓
    agentIds[index] → SM routing đúng phase
```

---

## 2. Router Import Path Fix

### Vấn đề
`router-graph.ts` dynamic imports trỏ sai paths từ module reorganization:

| Import cũ | Import mới |
|---|---|
| `../graphs/sdlc-graph` | `../pipeline/sdlc-graph` |
| `../graphs/hotfix-graph` | `../subgraphs/hotfix-graph` |
| `../graphs/code-review-graph` | `../subgraphs/code-review-graph` |
| `../graphs/docs-graph` | `../subgraphs/docs-graph` |
| `../graphs/security-audit-graph` | `../subgraphs/security-audit-graph` |
| `../subgraphs/chat-graph` | ✅ đã đúng |

### Cấu trúc thư mục thực tế
```
langgraph/
├── pipeline/       ← sdlc-graph.ts (SDLC workflow)
├── subgraphs/      ← hotfix, code-review, docs, security-audit, chat
├── router/         ← router-graph.ts (intent classification + dynamic import)
```

---

## 3. State Size Optimization

`PipelineDefState` chỉ lưu tối thiểu:
```typescript
interface PipelineDefState {
  phases: PipelineDefPhase[];
}
interface PipelineDefPhase {
  id: string;
  agentIds: string[];
}
```

Không lưu prompts, tools, config → checkpoint size ~2-5KB.

---

## 4. Danh sách Files thay đổi (v2 → v3)

| File | Thay đổi |
|---|---|
| `pipeline/edges.ts` | Thêm `resolvePhaseIndex()`, fix `routeFromSm` + `getPhaseNode` |
| `router/router-graph.ts` | Fix 5 dynamic import paths |

## 5. Backend sync
Copy files: edges.ts, router-graph.ts → `backend/extension/src/langgraph/`
