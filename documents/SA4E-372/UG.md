# User Guide — SA4E-372 Chat Transcript Redesign

**Version**: 1.53.10  
**Audience**: End users of SDLC Agents chat panel  

---

## 1. What's New in v1.53.10

### 1.1 Per-Cycle Chat Blocks (R1)

Mỗi vòng hội thoại (turn) của AI giờ được chia thành **các block riêng biệt theo vòng loop**:

```
Vòng 1: [Thinking] → [Trả lời] → [Tool calls]
Vòng 2: [Thinking] → [Trả lời] → [Tool calls]
...
```

**Trước đây**: Tất cả thinking + tool calls + answer gộp chung 1 container.  
**Giờ**: Mỗi lần AI "suy nghĩ → trả lời → gọi tool" = 1 nhóm block độc lập.

### 1.2 Collapse Semantics Đúng Chuẩn (R2)

| Tính năng | Hành vi mới |
|-----------|-------------|
| **Không tự collapse khi đang stream** | Block thinking/tool KHÔNG bao giờ tự thu gọn trong lúc AI đang streaming hoặc tool đang chạy |
| **Mở rộng mặc định khi bắt đầu tool** | Khi AI bắt đầu gọi tool, block tool tự mở rộng (expanded) để bạn theo dõi |
| **Tự collapse chỉ khi tool xong hết** | Block chỉ tự thu gọn khi **TẤT CẢ** tool trong block đã xong (completed/failed) |
| **Sticky: Bạn mở thì luôn mở** | Click header block → block ghi nhớ lựa chọn → **không bao giờ tự collapse lại** (kể cả reload window) |

### 1.3 Full Transcript Persistence (R3)

- **Toàn bộ lịch sử chat** (messages, AI responses, tool blocks, thinking, error) được lưu **theo workspace**
- **Reload window / close tab / restart Kiro** → mở lại panel → **toàn bộ transcript khôi phục y nguyên**
- Block bạn đã click mở → vẫn mở; block chưa click → collapsed mặc định
- Dữ liệu cũ (phiên bản cũ) vẫn tương thích ngược

---

## 2. Hướng Dẫn Sử Dụng

### 2.1 Theo Dõi Vòng Loop Của AI

Khi AI làm nhiệm vụ phức tạp (ví dụ: "tìm file → đọc → phân tích → sửa"), bạn sẽ thấy:

```
┌─ USER ─────────────────────────────────────┐
│ "Tìm file chứa SA4E-369, đọc 10 dòng đầu"  │
└────────────────────────────────────────────┘
┌─ THINK (c1) ──────────────────────────────┐  ← Click để mở/đóng
│ "Người dùng muốn tìm file... Tôi sẽ dùng   │
│  grep để tìm..."                           │
└────────────────────────────────────────────┘
┌─ TOOLS [2] ──────────────────────────────┐  ← Auto-expanded khi chạy
│ ▼ grep "SA4E-369" in documents/     ✓    │
│ ▼ read documents/SA4E-369/STATUS.json ✓   │
└────────────────────────────────────────────┘
┌─ THINK (c2) ──────────────────────────────┐
│ "Đã tìm thấy file... Tóm tắt nội dung..."  │
└────────────────────────────────────────────┘
┌─ ASSISTANT ──────────────────────────────┐
│ File chứa SA4E-369: STATUS.json...         │
└────────────────────────────────────────────┘
```

- **Badge PI/c1, PI/c2**: Cho biết đây là vòng loop thứ mấy của agent Pipeline (PI)
- **Chevron (▶/▼)**: Click để mở/đóng thinking block
- **Tool container**: Click header (▼ Tool calls) để mở/đóng toàn bộ nhóm tool

### 2.2 Sticky Expand (Ghi Nhớ Lựa Chọn)

| Hành động | Kết quả |
|-----------|---------|
| Click header thinking block | Block mở rộng, **ghi nhớ** → reload window vẫn mở |
| Click header tool container | Container mở rộng, **ghi nhớ** → reload window vẫn mở |
| Không click gì | Mặc định: thinking collapsed, tool expanded khi chạy, auto-collapse khi xong |

> **Lưu ý**: Sticky flag lưu **riêng cho từng block**. Block A bạn click mở → Block A luôn mở. Block B bạn không đụng → Block B tuân theo quy tắc auto.

### 2.3 Reload / Restart Window

1. Close Kiro window hoặc reload (Ctrl+Shift+P → "Reload Window")
2. Mở lại Chat Panel (Ctrl+Shift+P → "SDLC Chat: Focus on Chat Panel View")
3. **Toàn bộ lịch sử khôi phục**:
   - Tin nhắn user/assistant theo thứ tự
   - Tool blocks với trạng thái expanded/collapsed bạn đã chọn
   - Thinking blocks với trạng thái bạn đã chọn
   - Dữ liệu cũ (phiên bản <1.53.10) vẫn render đúng

---

## 3. Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Focus Chat Panel | `Ctrl+Shift+P` → "SDLC Chat: Focus on Chat Panel View" |
| Toggle thinking block | Click header hoặc `Enter`/`Space` khi focus |
| Toggle tool container | Click header (▼ Tool calls) hoặc `Enter`/`Space` |
| Toggle tool block | Click tool header hoặc `Enter`/`Space` |
| Copy message | Hover message → click copy icon (góc phải) |
| Copy tool call | Click copy icon trên tool header |

---

## 4. Troubleshooting

| Vấn đề | Nguyên nhân | Khắc phục |
|--------|-------------|-----------|
| Block tool không auto-collapse sau khi xong | Bạn đã click header (sticky) | Click header lại để bỏ sticky, hoặc reload window |
| Thinking block không hiển thị | AI không sinh reasoning (model không hỗ trợ) | Kiểm tra model có hỗ trợ reasoning (qwen-text có) |
| Reload window mất lịch sử | WorkspaceState bị xóa (ít xảy ra) | Kiểm tra `workspaceState("chatPanel.state")` trong DevTools |
| Tool container không auto-collapse khi xong | Có tool bị failed/interrupted | Kiểm tra tool status; chỉ collapse khi TẤT CẢ completed/failed |

---

## 4. Known Limitations

| Limit | Description |
|-------|-------------|
| Cycle counter toàn cục | Số thứ tự cycle (c1, c2...) tăng liên tục trong phiên webview, không reset mỗi turn. Badge hiển thị "PI" (stripped suffix). |
| Prompt files SA4E-371 | Anti-hallucination prompts từ SA4E-371 chưa được đóng gói vào vsix (graceful fallback). Không ảnh hưởng chức năng chat. |
| Backend checkpoint | Nếu backend không login, checkpoint không lưu được (fail-open, log debug). Chat vẫn hoạt động bình thường. |

---

## 5. Feedback & Support

- **Báo lỗi**: Tạo issue trên repo hoặc Jira SA4E-372
- **Feature request**: Tạo Jira story mới
- **Logs**: Mở Output panel → "SDLC Agents Debug" để xem debug log

---

*Tài liệu này đi kèm SDLC Agents v1.53.10. Cập nhật lần cuối: 2026-10-18.*