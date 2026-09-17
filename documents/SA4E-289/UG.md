# User Guide – Epic SA4E-289 Pi SDK Migration Option C

## 1. Mục đích
Hướng dẫn người dùng VS Code/Kiro sử dụng extension sau khi workflow engine được thay thế bằng Pi SDK. Giao diện không thay đổi, chỉ hiệu năng và tính ổn định được cải thiện.

## 2. Khởi động
1. Mở workspace trong VS Code/Kiro
2. Extension tự động khởi tạo PiProvider khi khởi động
3. Kiểm tra Status Bar: `Pi Workflow Connected`

## 3. Màn hình chính

### Dashboard / Worklist
- Hiển thị danh sách story SA4E-290…SA4E-297
- Lọc theo Status, Phase, Assignee
- Click vào story để mở Chat

### Agent Chat
- Toolbar: Session ID, Phase, PiProvider Status
- Left Pane: Conversation History, Tool Calls Log, State Snapshot
- Center Pane: Message Thread, Streaming Output
- Input Area: nhập tin nhắn, attach file, Send/Stop
- Approve/Reject khi có Tool Approval request

### Approval Panel
- Hiển thị queue yêu cầu approve
- Detail: Tool name, Parameters, Risk, Audit ID
- Hành động: Approve / Reject / Request Info

### Settings Pi Provider
- Transport Type: WebSocket / HTTP
- Base URL, Session ID, Timeout ms
- Test Connection, Save

## 4. Cấu hình
settings.json:
```json
{
  "pi.provider.transportType": "WebSocket",
  "pi.provider.baseUrl": "wss://pi.example.com",
  "pi.provider.sessionId": "auto"
}
```

## 5. Log & Troubleshooting
Output > SDLC Agents > Pi Workflow

Lỗi thường gặp:
- PI_TIMEOUT → tăng timeout
- ADAPTER-001 → mapping id lỗi, kiểm tra Approval Adapter
- SERIALIZATION_ERROR → state quá lớn >5MB

## 6. Thay đổi so với bản cũ
- Không cần thao tác thủ công, engine tự khởi tạo
- Latency giảm <2s p95
- Checkpoint consistency >99%
- Error codes mới rõ ràng

## 7. Hỗ trợ
Xem tài liệu: `documents/SA4E-289/INTEGRATION-OVERVIEW.md`
