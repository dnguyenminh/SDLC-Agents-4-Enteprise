# Architecture-v5 — Skip Phase Ambiguity Fix

Fix infinite loop khi user skip orphaned phase.

---

## 1. The Skip Phase Ambiguity Trap

### Kịch bản
1. Phase `design` bị xóa khỏi pipeline (orphan)
2. `advancePhaseNode` → pause
3. User chọn "Skip" → `handleApproval("skip")` resume
4. `routeFromSm` → tìm agent cho `design` (còn trong registry) → chạy agent
5. Gate approve → `advancePhaseNode` → orphan again → pause
6. **Infinite loop!**

### Nguyên nhân gốc
`routeFromSm()` fallback về `agentRegistry.getFirstAgentNode()` khi orphan → agent vẫn còn trong registry (chỉ phase bị xóa khỏi pipeline definition) → agent chạy → gate → advance → orphan → pause → loop.

---

## 2. Giải pháp: 3-layer fix

### Layer 1 — `routeFromSm()`: route về advance_phase, không về agent

```typescript
export function routeFromSm(state: PipelineState): string {
  const pd = state.pipelineDefinition;
  if (pd && pd.phases.length > 0) {
    const idx = resolvePhaseIndex(state);
    if (idx >= 0) {
      const phase = pd.phases[idx];
      if (phase && phase.agentIds.length > 0) return phase.agentIds[0];
    }
    // Orphaned — không fallback về agentRegistry, route về advance_phase
    return "advance_phase";
  }
  const firstNode = agentRegistry.getFirstAgentNode(state.currentPhase);
  return firstNode || "sm";
}
```

### Layer 2 — `advancePhaseNode()`: xử lý skip/cancel decisions

```typescript
// Orphaned + skip/approve → tái định vị index từ vị trí cũ
if (state.approvalDecision === "skip" || state.approvalDecision === "approve") {
  let targetIdx = state.currentPhaseIndex;
  if (targetIdx >= pd.phases.length) targetIdx = pd.phases.length - 1;
  if (targetIdx >= 0) {
    return {
      currentPhaseIndex: targetIdx,
      currentPhase: pd.phases[targetIdx].id,
      pipelineStatus: "running",
      approvalDecision: null,
      approvalRequired: false,
    };
  }
}
// Orphaned + cancel/reject → kết thúc pipeline
if (state.approvalDecision === "cancel" || state.approvalDecision === "reject") {
  return { pipelineStatus: "cancelled" };
}
// First orphan → pause
return { pipelineStatus: "paused", approvalRequired: true };
```

### Layer 3 — `buildSmTargets()`: cho phép SM route đến advance_phase

```typescript
function buildSmTargets(): Record<string, string> {
  const targets: Record<string, string> = { advance_phase: "advance_phase" };
  ...
}
```

---

## 3. Luồng Skip hoàn chỉnh

```
advancePhaseNode ← orphan lần 1
    │
    ├── approvalDecision = null → PAUSE
    │
    ▼
handleApproval("skip")
    │  pipelineStatus: "running"
    │  approvalDecision: "skip"
    ▼
routeAfterAdvance
    │  pipelineStatus === "running" → "sm"
    ▼
routeFromSm
    │  resolvePhaseIndex → -1 (orphan)
    │  → "advance_phase" (KHÔNG fallback agentRegistry)
    ▼
advancePhaseNode (lần 2)
    │  idx = -1, approvalDecision === "skip"
    │  targetIdx = currentPhaseIndex (old position)
    │  currentPhase = pd.phases[targetIdx].id (new phase at old position)
    │  pipelineStatus: "running"
    ▼
routeAfterAdvance
    │  currentPhaseIndex < length → "sm"
    ▼
routeFromSm (lần 2)
    │  resolvePhaseIndex → targetIdx (valid)
    │  → agent cho phase mới ✅
```

### Cancel flow
```
advancePhaseNode
    │  idx = -1, approvalDecision === "cancel"
    │  pipelineStatus: "cancelled"
    ▼
routeAfterAdvance
    │  pipelineStatus === "cancelled" → __end__ ✅
```

---

## 4. Type Changes

| File | Thay đổi |
|---|---|
| `core/state-types.ts` | `ApprovalDecision` = `"approve" \| "reject" \| "revise" \| "skip" \| "cancel"` |
| `engine/langgraph-engine.ts` | `handleApproval()` — `"cancel"` → `"cancelled"` status |

## 5. Files thay đổi (v4 → v5)

| File | Thay đổi |
|---|---|
| `core/state-types.ts` | +`"skip" \| "cancel"` trong `ApprovalDecision` |
| `pipeline/edges.ts` | `routeFromSm()` orphan → `"advance_phase"` |
| `pipeline/edges.ts` | `routeAfterAdvance()` check `"cancelled"` status |
| `pipeline/sdlc-graph.ts` | `advancePhaseNode()` xử lý skip/cancel decisions |
| `pipeline/sdlc-graph.ts` | `buildSmTargets()` include `advance_phase` |
| `engine/langgraph-engine.ts` | `handleApproval()` handle cancel decision |
