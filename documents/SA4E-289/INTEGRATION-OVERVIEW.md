# Epic SA4E-289 Integration Overview – Pi SDK Migration Option C

## Mục tiêu tổng thể
Thay thế LangGraph Workflow Engine bằng Pi SDK `@earendil-works/pi-agent-core` trong VS Code extension. Giữ nguyên UI và trải nghiệm người dùng, chỉ thay engine xử lý workflow phía backend extension.

## Kiến trúc tích hợp
```
VS Code Webview UI (Svelte 4)
   ↓
Extension Host – PiWorkflowEngine
   ↓
PiProvider → PiAgent Executor
   ↓
Phase Router → State Adapter → Checkpointer Adapter
   ↓
RemoteCheckpointer Backend
   ↓
Approval Adapter / ToolApprovalGate
```

LangGraph Engine cũ vẫn tồn tại trong `extension/src/langgraph/` trong giai đoạn chuyển đổi. Sau Phase 7 sẽ được đánh dấu deprecated và dọn dẹp.

## Màn hình & trải nghiệm
* **Không thay đổi UI trực quan.** Người dùng vẫn làm việc trên Webview Svelte 4 như hiện tại.

![VS Code UI Layout](vscode-ui-mockup.png)

![UI Flow](ui-flow.png)

### Agent Chat chi tiết
![Chat Screen Detail](chat-screen-detail.png)

#### Nội dung bên trong cửa sổ Chat
![Chat Window Internal](chat-window-internal.png)

### Dashboard / Worklist
![Dashboard Detail](dashboard-detail.png)

### Approval Panel
![Approval Detail](approval-detail.png)

### Settings Pi Provider
![Settings Detail](settings-detail.png)
* Các màn hình chính:
  - Dashboard / Worklist: hiển thị work items từ RemoteCheckpointer
  - Agent Chat: giao diện chat với PiAgent, streaming chunk như trước
  - Approval Panel: hộp thoại yêu cầu approve tool_use, do Approval Adapter chuẩn hoá `id` sang Pi format
  - Settings: cấu hình transport WebSocket/HTTP cho PiProvider

* **Dòng chảy mới:**
  1. User gửi yêu cầu từ Webview → PiWorkflowEngine
  2. Phase Router xác định phase hiện tại, validate Zod schema
  3. State Adapter chuyển `PipelineState` ↔ `PiInternalState`
  4. Checkpointer Adapter persist checkpoint qua RemoteCheckpointer
  5. PiAgent Executor gọi Pi SDK, trả streaming về UI
  6. Nếu cần approval, Approval Adapter request approval và log audit

## Cách sử dụng
* Không cần thao tác thủ công. Engine khởi tạo tự động khi extension start.
* Cấu hình Pi Provider:
  ```json
  {
    "pi.provider.transportType": "WebSocket",
    "pi.provider.baseUrl": "wss://pi.example.com",
    "pi.provider.sessionId": "auto"
  }
  ```
* Log và trạng thái: `Output > SDLC Agents > Pi Workflow` trong VS Code.

## Thay đổi quan sát được
* Latency p95 giảm mục tiêu <2s cho executeTurn
* Checkpoint consistency >99%
* Approval mapping chuẩn hoá id, không còn xung đột LangGraph vs Pi
* Error codes mới: ADAPTER-001/002, PI_TIMEOUT, INVALID_INPUT, SERIALIZATION_ERROR

## Tài liệu chi tiết
* BRD/FSD/TDD cho 8 story: SA4E-290 → SA4E-297
* Migration plan: `documents/pi-migration-plan.md`
* Code: `extension/src/pi-workflow/`
* Test: `documents/SA4E-29x/STP.md` / `STC.md`

## Rủi ro & mitigation
* Pi SDK version lock: BR-001 theo migration plan
* Transport unsupported: Phase Router fallback error rõ ràng
* State mapping loss: State Adapter round-trip test lossless 100%
