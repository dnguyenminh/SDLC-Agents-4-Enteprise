# SA4E-364 — UAT Report (API-level, executed 2026-10-16 ~07:00)

> Thực hiện bởi OpenCode agent theo yêu cầu user ("Bạn tự test đi"). 4 case E2E-UI của STC được chạy ở mức API — đúng đường đi nội bộ của SDLC CHAT (McpBridge → mcpManager.invokeTool → backend 48721), cộng 1 đường wrapper (9183) cho client ngoài.

## Môi trường lúc test

| Thành phần | Trạng thái |
|---|---|
| Extension 1.53.1 (chứa fix `180b150`) | ✅ Cài trong Kiro, bundle verified (string-literal `bridge tool skipped` trong `out/extension.js`) |
| Backend MCP | ✅ `Backend MCP Server ready` port 48721 (pid 45492), code từ worktree SA4E-364 @ 47c3977, DATA_DIR = repo `.code-intel` |
| WrapperServer (extension) | ✅ port 9183 `{"status":"ok","mode":"wrapper"}` — sống lại sau user restart Kiro |
| KB | ✅ Project `22b039993db3` — mem_search trả KB thật (BRD/TDD/STC của chính SA4E-364, LESSON #640) |

## Kết quả 4 case

| Case | Kết quả | Bằng chứng |
|---|---|---|
| **E2E-UI-01** — tool call qua đúng đường chat | ✅ **PASS** | `tools/call mem_search` → backend 48721 (X-Project-Id) → **4,594 chars / 3 results / 84ms**. Cả wrapper path khớp kết quả |
| **E2E-UI-02** — server stopped → fail gracefully | ✅ **PASS** | Kill backend → tool call → **JSON-RPC `-32603 "fetch failed"` sạch trong 31ms**, HTTP 200 với MCP error object — KHÔNG treo, KHÔNG crash (chat sẽ hiển thị error text, conversation tiếp tục) |
| **E2E-UI-03** — wiring trong allowlist | ✅ **PASS (bằng chứng gián tiếp + test)** | (a) Wrapper `tools/list` trả đủ 12 tools; (b) `bridge-wiring-legacy.test.ts` + `bridge-wiring-session.test.ts` (trong 23/23 PASS) assert trực tiếp registry 2 đường wiring; (c) bundle chứa code wiring. Output-channel log cần đọc thủ công trong Kiro nếu muốn pixel-proof |
| **E2E-UI-04** — recovery in-place | ✅ **PASS** | Restart backend → **166ms** sau cả 2 đường (`X-Project-Id` direct + wrapper) trả kết quả KB đầy đủ. KHÔNG cần restart session/window/extension nào |

## Ghi chú vận hành trong quá trình test

1. Sự cố môi trường sáng nay (không phải bug của SA4E-364): Kiro app crash 05:50 (đợt manifest-sync xóa file do session khác phân tích) → backend + wrapper + extension host chết đồng loạt. Đã phục hồi: backend tái tạo từ worktree sạch SA4E-364 (`C:\projects\kiro\wt-sa4e-364-server`), user restart Kiro → wrapper tự hồi sinh.
2. Lưu ý cấu hình: backend cần `CODE_INTEL_DATA_DIR` trỏ đúng repo `.code-intel` (lần chạy đầu thiếu env → KB rỗng, đã sửa và verify).
3. Wrapper `tools/list` hiện 12 tools trực tiếp; `jira_*`, `ide_*` là nested qua `execute_dynamic_tool`/`find_tools` (orchestration child của backend).

## Kết luận

**4/4 case PASS ở mức API/protocol.** Chuỗi "chat → McpBridge → backend → KB" hoạt động đầy đủ: tool call thành công (01), fail gracefully (02), wiring có mặt (03), recovery in-place (04). Phần hiển thị webview (tool card + MCP_TOOL_RESULT render) khớp logic StreamProtocolAdapter đã được cover bởi tool-result-mapping tests — khuyến nghị user xác nhận thị giác 1 lần khi mở SDLC CHAT (E2E-UI-01 tương đương: hỏi "search KB: personalized rules").
