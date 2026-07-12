# Architecture-v6 — Ghost Context Barrier

Fix dư lượng ngữ cảnh khi skip orphaned phase.

---

## 1. Ghost Context Residue

### Kịch bản
User chat: *"Thiết kế sơ đồ kiến trúc và vẽ architecture.drawio"* (cho phase `design`).
Phase `design` bị xóa (orphan) → user Skip.
Agent phase tiếp theo (`qa-agent` cho `test_planning`) thấy tin nhắn cũ → bối rối, hallucination.

### So sánh với đề xuất review-5

| Review đề xuất | Implement thực tế | Vấn đề |
|---|---|---|
| `new SystemMessage(...)` (LangChain) | `ChatMessage { role: "system", ... }` (type có sẵn) | Sai type — hệ thống dùng `ChatMessage`, không phải LangChain Message |
| `messages: [contextBarrierMessage]` (thay thế toàn bộ) | `chatHistory: [...old, barrierMsg]` (append) | Thay thế làm mất toàn bộ lịch sử chat |
| `pipelineStatus: "active"` | `pipelineStatus: "running"` | `"active"` không tồn tại trong enum |
| `stepStatus: "ALL_PHASES_COMPLETED"` | Không dùng | Không có field `stepStatus` trong state |

---

## 2. Giải pháp: Context Barrier Message

Khi skip orphaned phase, inject system message vào `chatHistory`:

```typescript
const barrierMsg: ChatMessage = {
  id: `ctx-${Date.now()}-${random}`,
  role: "system",
  content: `[Context Barrier] Phase '${state.currentPhase}' was deleted and SKIPPED. ` +
    `Requests related to it are void. Current phase: '${nextPhaseId}'.`,
  timestamp: new Date().toISOString(),
};
return {
  currentPhaseIndex: targetIdx,
  currentPhase: nextPhaseId,
  pipelineStatus: "running",
  approvalDecision: null,
  approvalRequired: false,
  chatHistory: [...(state.chatHistory || []), barrierMsg],
};
```

### Tác động
- Agent đọc `chatHistory` thấy barrier → hiểu phase cũ đã bị hủy
- Không mất lịch sử chat gốc (append thay vì replace)
- Chỉ áp dụng cho orphaned skip, không ảnh hưởng normal flow

---

## 3. Lưu ý: Ghost Context tồn tại rộng hơn

Context từ phase trước tràn sang phase sau là **behavior mặc định** của multi-agent pipeline. Agent đã được thiết kế để xử lý context từ nhiều phase — chúng đọc `currentPhase` trong state để biết mình đang ở phase nào.

Ghost Context **chỉ thực sự nguy hiểm** khi:
- Phase bị **skip** (request chưa được xử lý)  
- Request có instruction mâu thuẫn với phase mới

Barrier message giải quyết case này. Normal phase transition không cần barrier vì request đã được phase trước xử lý xong.

---

## 4. Files thay đổi (v5 → v6)

| File | Thay đổi |
|---|---|
| `pipeline/sdlc-graph.ts` | Import `ChatMessage`. Skip handler inject barrier msg vào `chatHistory` |

---

## 5. Sequence (Skip with Barrier)

```
User: "Thiết kế architecture.drawio" → chatHistory
    ↓
design phase bị xóa
    ↓
advancePhaseNode → orphan → pause
    ↓
User chọn "Skip"
    ↓
advancePhaseNode:
  ├── skip logic
  ├── barrierMsg injected → chatHistory
  └── advance to next phase
    ↓
Agent (next phase) reads chatHistory:
  [...user request..., { role: "system", content: "[Context Barrier]..." }]
    ↓
Agent biết: request cũ cho design KHÔNG còn hiệu lực
```
