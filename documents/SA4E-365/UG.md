# User Guide (UG)

## SDLC Agents 4 Enterprise — SA4E-365: Thinking (Reasoning) trong SDLC CHAT

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | [SA4E-365](https://jiraassist.atlassian.net/browse/SA4E-365) |
| Title | [SDLC Chat] Hiển thị Thinking (reasoning) trong SDLC CHAT |
| Author | DEV Agent |
| Reviewer | BA Agent |
| Version | 1.0 |
| Date | 2026-10-16 |
| Status | Draft |
| Related BRD | documents/SA4E-365/BRD.md |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-10-16 | DEV Agent | Initial document — Thinking (Reasoning) section trong SDLC CHAT |

---

## 1. Tính năng mới

Từ bản sửa lỗi này, cửa sổ chat **SDLC CHAT** hiển thị section **Thinking (Reasoning)** — luồng suy luận của model, stream trực tiếp bên trong bubble của turn đang chạy:

- **Khi model trả reasoning** (qua gateway hỗ trợ reasoning, vd `qwen-text`): một block `💭 Thinking...` xuất hiện trong bubble trả lời và stream nội dung suy luận **live** (icon 💭 nhấp nháy nhẹ).
- **Khi câu trả lời bắt đầu** (token text đầu tiên đến): block **tự collapse** thành nhãn `💭 Reasoning`; answer stream tiếp tục bình thường bên dưới.
- **Click vào header block** (hoặc nhấn Enter khi focus) để expand/collapse nội dung reasoning lại bất cứ lúc nào — chevron ▸ xoay 90° khi mở.

Không tạo bubble mới, không đổi thứ tự hội thoại — thinking là thuộc tính của message hiện tại (**1 turn = 1 bubble**).

### Trạng thái của block

| # | Trạng thái | Khi nào | Hành vi |
|---|-----------|---------|---------|
| 1 | `💭 Thinking...` (live) | Model đang stream reasoning | Block tự mở, nội dung stream liên tục |
| 2 | `💭 Reasoning` (collapsed) | Token answer đầu tiên đến, hoặc stream complete/error | Tự đóng sau ~1 giây (hiệu ứng slide), nội dung vẫn xem lại được |
| 3 | Ẩn hoàn toàn | Turn không có reasoning | Không render block rỗng, UI giữ nguyên như cũ |

---

## 2. Điều kiện để thấy Thinking

| Điều kiện | Chi tiết |
|-----------|----------|
| Model/provider hỗ trợ reasoning | Gateway trả `reasoning_content` / `reasoning` / `reasoning_text` trong stream (OpenAI-compatible). Ví dụ đã verify: `qwen-text` |
| Không cần cấu hình thêm | Hoàn toàn tự động: model trả reasoning → block hiện; không trả → UI không thay đổi |

> pi-ai SDK chuẩn hóa mọi format reasoning trên thành một event duy nhất (`thinking_delta`), nên bạn không cần quan tâm model trả reasoning theo format nào.

---

## 3. Troubleshooting

| # | Triệu chứng | Nguyên nhân | Cách xử lý |
|---|-------------|-------------|------------|
| 1 | Không thấy block Thinking | Model không hỗ trợ reasoning, hoặc gateway không trả `reasoning_content` | Chọn reasoning model (vd `qwen-text`); kiểm tra cấu hình model gateway |
| 2 | Turn không reasoning → không có block | **Hành vi đúng** theo thiết kế | Không cần làm gì — chỉ reasoning model mới có block |
| 3 | Block kẹt ở "Thinking..." không bao giờ đóng | Lỗi hiếm gặp ở error path | Report bug kèm log extension host (liên quan stream-handler / THINKING_*) |
| 4 | Thinking biến mất sau khi turn kết thúc | By design — thinking không persist vào session file | Copy nội dung ngay trong turn nếu cần giữ lại |

---

## 4. FAQ

**Q1: Tôi có cần bật config gì để hiện Thinking không?**
A: Không. Tính năng tự động — model trả reasoning thì block hiện, không trả thì UI như cũ.

**Q2: Vì sao block tự collapse khi answer bắt đầu?**
A: Thiết kế để màn hình tập trung vào câu trả lời. Click vào header `💭 Reasoning` để mở lại nội dung suy luận bất cứ lúc nào.

**Q3: Model nào sẽ hiển thị Thinking?**
A: Mọi model mà gateway trả reasoning (vd `qwen-text`). Model thường (không reasoning) hoặc turn chỉ gọi tool sẽ không có block — đó là hành vi đúng.

**Q4: Thinking có làm chậm hiển thị answer không?**
A: Không. Token reasoning được buffer + debounce 50ms trước khi render — không gây lag webview, không ảnh hưởng luồng answer.

**Q5: Nội dung Thinking có được lưu vào lịch sử hội thoại không?**
A: Không — chỉ hiển thị trong turn hiện tại. Persist thinking là scope khác (xem BRD SA4E-365, Out of Scope).

---

## 5. Changelog

- **Shipped:** Thinking (Reasoning) section trong SDLC CHAT — fix forward `thinking_delta` end-to-end (pi-event-mapper → session host → legacy adapter → stream-handler → webview `ThinkingBlock`).
- **Commit:** [`498f9c1`](https://jiraassist.atlassian.net/browse/SA4E-365) trên branch `SA4E-365` — *fix(chat): forward thinking_delta to webview ThinkingBlock (SA4E-365)*.
- **Nền tảng UI:** `ThinkingBlock.svelte` deliver từ SA4E-85; bản này chỉ nối dây streaming (F1–F8), không đổi thiết kế block. Block luôn đóng khi stream complete **hoặc** error — không bao giờ kẹt "Thinking...".

---

*End of Document — SA4E-365 UG v1.0 (DEV Agent, 2026-10-16)*
