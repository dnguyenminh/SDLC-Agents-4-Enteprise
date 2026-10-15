# UAT LẦN 2 — SA4E-360: SDLC Chat Panel (sdlcChatPanel)

**Date:** 2026-10-14 22:29 → 23:28 UTC
**Target:** SDLC Chat panel — view `sdlcChatPanel` (ChatPanelProvider), bottom panel container title "SDLC Chat"
**Environment:** Kiro 1.3.0 (CDP http://127.0.0.1:50972), llama-server port 1234 (model qwen-text), ext sdlc-agents-4-enterprise-1.53.0
**Verdict:** ⛔ **BLOCKED** — SIT không chạy sạch được do môi trường bị tranh chấp (subagent khác đang chạy driver UAT song song trên cùng window). Không có SIT nào đạt PASS/FAIL hợp lệ.

---

## 1. Frame Identification (BƯỚC 1 — THÀNH CÔNG ✅)

Enumerated TẤT CẢ frames của 3 workbench pages (evidence: `frame-identification.log`, `frame-identification.json`, screenshots `identify-*.png`):

| Frame (id) | DOM `<title>` | Header | Kết luận |
|------------|---------------|--------|----------|
| `b1e02341` (vscode-webview://1calk2ii…) | **"Chat Panel"** | `#chat-header .header-title` = **"SDLC Pipeline"** | ✅ **FRAME TARGET** (sdlcChatPanel). Status `connected`, có `#tab-add-btn`, `#chat-input`, `#send-btn` |
| `ab1a7829` | **"Agentic Chat"** | — | ⛔ Frame CẤM (SA4E-85) — driver không hề chạm vào bằng selector; chỉ bị nhiễu qua page.keyboard (đã fix bằng frame-CDP insertText) |
| `0e226591` | "CUSTOM WEBVIEW TITLE" | — | Kiro Agent side panel (không liên quan) |
| `268145bf` / `7acfc18a` | "CUSTOM WEBVIEW TITLE" | — | Kiro Agent panels ở 2 windows khác |

**Định danh bằng content-match** (title="Chat Panel" AND header="SDLC Pipeline" AND input visible), KHÔNG ghim origin vì VS Code random-origin mỗi lần webview re-create.

---

## 2. Chronology — 6 Attempts, Root Cause Từng Lần

| # | Time (UTC) | Script | Kết quả | Root cause |
|---|-----------|--------|---------|------------|
| 1 | 22:33–22:44 | uat2-run v1 | SIT-01 turn timeout, respLen=0, 1 error banner; exit 1 không FATAL log | (a) webview disposed giữa turn (panel tab là TERMINAL, không phải SDLC Chat); (b) `ElementHandle.click` treo 180s (protocol timeout); (c) ConsoleCapture crash khi webview dispose |
| — | 22:50 | uat2-probe | ✅ Phát hiện tab "SDLC Chat" active=false (Terminal active). Click label → webview LIVE input=1066×34 | Root cause chính: **panel tab không active → VS Code dispose webview** |
| 2 | 22:53–22:56 | uat2-run v2 | newTab OK (fresh=true); SIT-01 respLen=0; SIT-02 FATAL "chat busy" ngay sau newTab | Typing qua `page.keyboard` (OOPIF) leak vào panel Agentic Chat (page-level focus); webview lại off-screen (iframe 300×150 tại y=1232 > đáy window) |
| — | 22:58 | uat2-probe2 | ✅ Map iframe: SDLC webview `inPanel=false, x=0, y=1232, w=300, h=150` (off-screen); Agentic Chat mở như editor tab 1092×490 | VS Code đẩy iframe off-screen khi panel tab không active |
| 3 | 23:00 | uat2-probe3 | ✅ Panel rect 1092×644; nút "Maximize Panel" (`codicon-panel-maximize`) tồn tại; tabs là `.action-label` không phải `.tab` | Chọn sai selector tab |
| 4 | 23:01–23:05 | uat2-single | Send OK users 0→1; busy 12→72s; **respLen=0 suốt 240s**; iframe off-screen toàn turn | Typing land vào 2 nơi: SDLC input (verify OK) VÀ Agentic Chat (page-level focus) |
| — | 23:06 | 📸 Screenshot | **"Agentic Chat" editor tab chứa 3 prompt của driver** (05:52, 05:55, 05:58) + Terminal có **2 subagent khác đang Running** ("Qa-Agent: UAT corrected - SDLC Chat panel", "Qa-Agent: UAT round 3 - single window") | **Môi trường bị chiếm dụng** |
| 5 | 23:09 | uat2-run v3 (sits=1, ×2) | ✅ insertText qua frame-CDP hoạt động; newTab OK; send users 0→1. Nhưng **busy vĩnh viễn: "Finishing previous message — your message is queued next."** 90s+ | Hàng đợi SEND_PROMPT Extension Host kẹt (turn cũ của các driver + retry sau dispose) |
| 6 | 23:11–23:28 | uat2-wait + final-evidence | Frame Chat Panel mất dấu nhiều đợt; **SEND_PROMPT loop của agent khác: 23:14, 23:17, 23:20, 23:24** (mỗi ~3.5 phút); frame Agentic Chat chứa prompt "Đọc method ModuleFactory.ts hàm creat…" (06:01) — **prompt SIT-04-t1 mà driver của tôi CHƯA TỪNG GỬI** | Xác nhận cuối: driver song song của subagent khác đang thao tác cùng UI |

File evidence chi tiết: `uat2-driver.log`, `uat2-probe.log`, `uat2-probe2.log`, `uat2-probe3.log`, `console-uat2.log`, `pi-uat2.log`, `pi-wait.log`, `final-state-*.png`, `probe3-after-maximize.png`, `single-*.png`, `sit01-*.png`.

---

## 3. SIT Results — TẤT CẢ BLOCKED (không có PASS/FAIL hợp lệ)

| SIT | Kỳ vọng | Kết quả | Lý do |
|-----|---------|---------|-------|
| SIT-01 (tab mới + "Hãy review source code") | PI_SKELETON_BUILT?, Context budget resolved, response, 0 error banner | ⛔ BLOCKED | Send OK (users 0→1, frame đúng) nhưng stream không render (webview disposed/off-screen giữa turn do tranh chấp); hàng đợi host kẹt |
| SIT-02 (get_workspace_info + cache) | functionalMap + cache lần 2 | ⛔ BLOCKED | Không bắt đầu được turn sạch (busy "queued next" vô hạn) |
| SIT-04 (8 turns xen kẽ) | 0 × exceed_context_size_error, PI_LEGACY_HISTORY_COMPACTED | ⛔ BLOCKED | Không chạy được chuỗi 8 turn sạch trong môi trường tranh chấp |
| SIT-07 (review .svelte) | PI_SKELETON_FALLBACK?, log không chứa code/secrets | ⛔ BLOCKED | Phụ thuộc turn sạch |

**Số exceed_context_size_error trên ĐÚNG panel: 0** — không có HTTP 400 / exceed nào trong toàn bộ console capture (mọi errors là `Webview is disposed` của VS Code webview API, KHÔNG phải lỗi của SA4E-360 pipeline).

---

## 4. Dữ Liệu Có Giá Trị Thu Được (cho SA4E-360)

1. **PI_LEGACY_HISTORY_COMPACTED hoạt động đúng**: 5 lần ghi nhận, historyMessages 78–90, totalTokens 55.4K–57.9K → compact về usable=58,293. **KHÔNG exceed_context_size** dù history rất lớn → compaction của SA4E-360 làm việc tốt ở mức này.
2. **Context budget resolved đúng cấu hình**: nCtx=65536, reserveOutput=2000, safetyMargin=5243, staticBudget=40805, historyBudget=17488 (model qwen-text).
3. **LLM latency**: mỗi turn với history ~55–58K tokens mất **~50–140s** (qwen-text trên CPU) — khuyến nghị timeout ≥180s theo spec, dùng 240s cho turn nặng.
4. ⚠️ **Lỗi sản phẩm tiềm năng (chỉ báo, chưa xác nhận):** khi webview bị ẩn/disposed giữa turn, Extension Host vẫn xử lý SEND_PROMPT toàn phần (LLM call tốn tài nguyên) rồi mới fail `postToWebview` → "Webview is disposed" + trạng thái "Finishing previous message — your message is queued next." treo vô hạn. **Khuyến nghị backlog**: (a) cân nhắc `retainContextWhenHidden` cho webviewView, (b) hủy/đánh dấu turn failed khi webview disposed thay vì retry ngầm, (c) timeout cho hàng đợi queued.

---

## 5. Nguyên Nhân BLOCKED (tóm tắt)

1. **Tranh chấp UI**: ≥1 subagent khác ("Qa-Agent: UAT round 3 - single window") đang chạy driver UAT riêng trên cùng window Kiro — gửi SEND_PROMPT mỗi ~3.5 phút, switch panel tab, khiến webview SDLC Chat liên tục bị disposed/off-screen.
2. **Hàng đợi SEND_PROMPT kẹt** ở trạng thái "Finishing previous message — your message is queued next." không xong trong toàn bộ quan sát (90s+).
3. Mọi SIT thêm sẽ bị trộn context với turns của agent khác → **kết quả sẽ INVALID** (giống lần UAT 1 gõ nhầm panel).

## 6. Điều Kiện Tái Chạy (BẮT BUỘC)

1. **Chỉ MỘT driver UAT chạy tại một thời điểm** — các subagent khác phải kết thúc trước (kiểm tra Terminal panel không còn "Subagents … Running").
2. Panel "SDLC Chat" phải active trong suốt turn (driver v3 đã có layout-guard + content-match frame + insertText frame-CDP — dùng lại `uat2-run.mjs`).
3. Trước khi chạy: xác nhận hàng đợi rỗng (`#working-bar` không active, không có PI events trong 60s).
4. Script đã sẵn sàng: `node uat2-run.mjs` (full) hoặc `node uat2-run.mjs --sits=1,2,4,7`.
