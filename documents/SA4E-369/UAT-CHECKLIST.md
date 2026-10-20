# 🧪 UAT Checklist — SA4E-369 PeerBus (Phase 6.5 Human Gate)

> **MỞ CỬA SỔ TEST: `Ctrl+J` (mở panel dưới) → tab "SDLC Chat"** (cạnh Terminal/Output).
> Nếu chưa thấy tab: `Ctrl+Shift+P` → gõ "Show Chat Panel" → Enter.
> ⛔ KHÔNG phải "SDLC Agents: Open Agentic Chat" — window sai.

> Candidate: branch `SA4E-369` @ `71869e0` · Extension dev host: build mới nhất (103/103 tests, tsc 0)
> Tiến trình: PHIÊN BẢN PHÁT TRIỂN — restart Extension Development Host trước khi test để nạp code mới nhất.
> Kết quả: điền ✅ / ❌ + ghi chú bên cạnh từng mục, báo lại cho SM.

## Nhóm A — Trao đổi dữ liệu thật (2 tab, 2 Agents thật)

| # | SIT | Bước test | Kết quả | Ghi chú |
|---|-----|-----------|---------|---------|
| A1 | SIT-01 | Tab X dùng peer_send qua Tab Y (Agent thật) → blocking: Y xử lý rồi reply về X | ☐ | |
| A2 | SIT-02 | Async: tab X không chờ — poll peer_status thấy trạng thái chạy/hoàn thành | ☐ | |
| A3 | SIT-03 | A↔B chạy song song → histories/tokens/compaction KHÔNG trộn giữa tab | ☐ | |
| A4 | SIT-13 | Đóng tab Y khi đang chạy task → tab X biết Y offline/task không còn | ☐ | |
| A5 | SIT-14 | Rename tab Y giữa trao đổi → peer vẫn hoạt động đúng | ☐ | |

## Nhóm B — UI Frontend

| # | SIT | Bước test | Kết quả | Ghi chú |
|---|-----|-----------|---------|---------|
| B1 | SIT-05 | Badge tăng khi inbound, reset khi đọc | ☐ | |
| B2 | SIT-06 | Transcript prefix + tint cho peer message | ☐ | |
| B3 | SIT-07 | Tooltip "Inbound from Tab X" | ☐ | |
| B4 | SIT-08 | Peer list panel đúng lifecycle (thêm/bớt tab) | ☐ | |

## Nhóm C — Approval Option A (⚠️ ưu tiên cao nhất — security mới nhất)

| # | SIT | Bước test | Kết quả | Ghi chú |
|---|-----|-----------|---------|---------|
| C1 | SIT-10 | Peer turn cần tool → approval UI hiện → **Approve** → tool thực thi | ☐ | |
| C2 | SIT-11 | Tương tự → **Deny** → peer turn FAIL TERMINAL (không crash) | ☐ | |
| C3 | Bonus | Không tương tác 30s → auto-deny fail-closed, turn fail | ☐ | |

## Nhóm D — Bảo mật thực chiến (kiểm thủ công)

| # | SIT | Bước test | Kết quả | Ghi chú |
|---|-----|-----------|---------|---------|
| D1 | SIT-09 | Fake envelope/header trong nội dung → render như text thường, không có gì chèn đặc quyền | ☐ | |
| D2 | SIT-15 | Câu lệnh chèn đầy đủ (injection) trong peer message → tab Y TỪ CHỐI/IGNOR tiếng không thực thi | ☐ | |
| D3 | SIT-04 | Zero-config, không socket — chỉ nạp extension là chạy | ☐ | |
| D4 | SIT-16 | Session gây lỗi tạo (nếu có cách) → báo lỗi lịch sự, không sập | ☐ | |

## Bỏ qua theo thiết kế
- **SIT-12** (Option B read-only loadout) — BLOCKED bởi D6=Option A. Không test.

## Báo cáo về SM
Format gili 1 dòng: `A1 ✅ A2 ✅ A3 ✅ A4 ❌ (lý do) ...` — hoặc viết hẳn file `UAT-RESULTS.md` cạnh file này.
Fail nào → SM điều phối dev fix → re-test đúng mục đó → UAT pass mới sang 6.7/7.
