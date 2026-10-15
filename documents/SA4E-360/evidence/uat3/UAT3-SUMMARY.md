# UAT3-SUMMARY — SA4E-360 (LẦN 3)

**Date:** 2026-10-14 22:54 → 2026-10-15 00:38 (UTC)
**Environment:** Kiro 1.3.0 (Electron 44.4.3 / Chrome 152) — MỘT cửa sổ duy nhất `"Agentic Chat - Untitled (Workspace) - Kiro"`
**CDP:** `http://127.0.0.1:50972` ✅ alive | **llama-server:** qwen-text @ `127.0.0.1:60666` ✅ (health ok) | **Backend KB:** `127.0.0.1:48721` (đã start lúc 23:26 — xem Incidents) | **Extension:** dnguyenminh.sdlc-agents-4-enterprise-1.53.0
**Driver:** `C:\Users\ASUS\AppData\Local\Temp\uat-driver\uat3-run.mjs` + `uat3-retry.mjs` (puppeteer-core từ `extension/node_modules`)

---

## 1. Frame Verification (target đã chốt)

| Check | Result |
|---|---|
| Bottom panel tab "SDLC Chat" (workbench DOM, aria-label) | ✅ visible (`identify-*.png`, frame-identification.json) |
| Webview frame `document.title` | ✅ **"Chat Panel"** |
| Header `#chat-header .header-title` | ✅ **"SDLC Pipeline"** |
| Status indicator | ✅ `connected` |
| `#chat-input` / `#chat-messages` / `#send-btn` / `#tab-add-btn` | ✅ all present & visible |
| Webview URL | `vscode-webview://1calk2iig…/index.html?id=b1e023` (view sdlcChatPanel) |
| Frame scan phạm vi | 3 workbench pages quét song song — chỉ MỘT frame khớp target; frame "Agentic Chat" (SA4E-85) đã bị loại rõ ràng |

## 2. Typing Method (fix bắt buộc của lần 3)

- ✅ **KHÔNG dùng `page.keyboard` global** trong toàn bộ driver.
- ✅ Frame-anchored: thao tác trên `#chat-input`/`#send-btn` **trong target frame**, sau mỗi lần type **VERIFY giá trị input khớp exact** trước khi send; nếu lệch → không send (turn BLOCKED), retry tối đa 3.
- ⚠️ Thích nghi môi trường: `ElementHandle.click()/type()` trên OOPIF webview này **timeout 20s rồi thực thi TRỄ**, đè lên text gây corrupt ("caauss Review…", "gi…"). Verify-gate đã chặn đúng (0 message sai được gửi). 2 turn BLOCKED (sit04-turn5, sit07) đã **retry bằng JS-only typing** (`execCommand insertText` trong frame + hard-clear DOM + verify) → PASS. Ghi trong `results-uat3.json` (`retryMode: "js-only-typing"`).

## 3. Kết quả SIT — Bảng PASS/FAIL

| SIT | Verdict | Bằng chứng chính |
|---|---|---|
| **SIT-01** — new session + turn-1 review | **PASS (partial telemetry)** | New-session ✅ (tab mới fresh 0/0 → gửi "Hãy review source code"); turn hoàn thành **138s**, response 7,034 chars review architecture-level (Strategy Pattern, DatabaseAdapter ISP split…) không whole-file dump; **0 err, 0 exceed**. ⚠️ `PI_SKELETON_BUILT` **không xuất hiện** (xem F1) — thay vào đó `PI_LEGACY_HISTORY_COMPACTED` (new session kế thừa legacy history 60 msgs); budget resolver chạy nCtx=65536 (không phải scenario 32k trong STC — xem F6) |
| **SIT-02** — get_workspace_info + cache | **PARTIAL FAIL** | Layout ✅ (root + 73 entries + phân loại Backend/Extension/…) trong CẢ 2 lần gọi; bounds ✅ (response ~1,0xx chars ≪ 16,000); repeat-call gửi trong **~1s** sau khi t1 xong (< 60s) ✅, nội dung identical ✅. ❌ **Functional-map section (module → summary → keySymbols) KHÔNG xuất hiện** trong tool output (F2). ⚠️ Cache-hit không chứng minh được ở mức turn (t1=421s vs t2=422s — durations bị nhiễu bởi F4; `PI_TOOL` không log — F1) |
| **SIT-04** — 6 turns xen kẽ, 0 × exceed | **PASS** | **0 × exceed_context_size_error end-to-end** ✅ (assertion chính); 6/6 turns ok; gate #3 compaction hoạt động: **23 × PI_LEGACY_HISTORY_COMPACTED**, historyMessages 60→92, totalTokens **47,073→57,176 — luôn < usable 58,293** (nCtx 65,536); tool calls thực thi thật (read_method/get_workspace_info output trong responses); KB persistence `PUT /api/v1/threads/{id}` mỗi turn (backend log). ⚠️ Skeleton stability INV-1: không verify trực tiếp được do thiếu skeleton telemetry (F1) |
| **SIT-07** — review svelte dir + privacy | **PARTIAL PASS** | Privacy hygiene **PASS**: quét `uat3-console.log` + `pi-uat3.log` → **0 secret-like, 0 code-body-like** (counts/decisions only — SEC-360-01) ✅. ⚠️ `PI_SKELETON_FALLBACK`/`PI_SKELETON_FILE_SKIPPED` không quan sát được (F1 — skeleton không build trong window capture). Lưu ý: `extension/svelte/` **không chứa file .svelte nào** (chỉ `store.ts`/`store.js`/`store.js.map`) — agent review `store.ts` (self-described test mock) là thích nghi hợp lý |

**Tổng exceed_context_size_error: 0 / 0 kỳ vọng ✅**
**Turns: 10/10 hoàn thành có response (asstIncreased verified từng turn) — 0 thiếu response, 0 DOM error banner.**

## 4. Turn Durations

| Turn | Mode | Duration | respLen | exceed | DOM err | Ghi chú |
|---|---|---|---|---|---|---|
| SIT-01 | new-session | **138s** | 7,034 | 0 | 0 | skeleton-path không fire (F1) |
| SIT-02-t1 | same session | 421s* | 1,067 | 0 | 0 | (*): hoàn thành nhưng stable-detect không kịp trong 420s window |
| SIT-02-t2 | same session | 422s* | 1,021 | 0 | 0 | gửi 1s sau t1 (cache window ✅) |
| SIT-04-turn1 | same session | 421s* | 708 | 0 | 0 | agent báo đúng: `backend/src/modules/ModuleFactory.ts` không có `createModule` (prompt thiếu path — F7) |
| SIT-04-turn2 | same session | **92s** | 2,565 | 0 | 0 | MemoryModule overview |
| SIT-04-turn3 | same session | 422s* | 1,006 | 0 | 0 | get_workspace_info |
| SIT-04-turn4 | same session | **27s** | 1,112 | 0 | 0 | ModuleRegistry.register — giải thích + code |
| SIT-04-turn5 | same session | **88s** | 2,191 | 0 | 0 | retry JS-only (lần đầu BLOCKED bởi verify-gate) |
| SIT-04-turn6 | same session | 421s* | 1,000 | 0 | 0 | get_workspace_info |
| SIT-07 | same session | 421s* | 2,167 | 0 | 0 | retry JS-only; store.ts review |

*Tổng duration: ~2,874s. Pattern 421–422s ≈ 2 × chu kỳ stale-retry-loop (191s) + processing → turns bị xếp hàng sau turn-stale (F4); các turn chạy trong gap chỉ mất 27–138s.*

## 5. PI Telemetry Summary (console capture, toàn bộ window run3+retry)

| Marker | Count | Ghi chú |
|---|---|---|
| `Context budget resolved` | 33 | nCtx=65,536; staticBudget=40,805; historyBudget=17,488; reserveOutput=2,000; safetyMargin=5,243 |
| `PI_LEGACY_HISTORY_COMPACTED` | 23 | usable=58,293; tt 47,073→57,176; hist 60→92 — **không lần nào vượt usable** |
| `PI_SKELETON_BUILT` | **0** | ⚠️ F1 — không thấy ở MỌI vòng UAT (uat1, uat2, uat3 + retry) |
| `PI_SKELETON_FALLBACK` / `PI_SKELETON_FILE_SKIPPED` | **0** | ⚠️ F1 |
| `PI_GATE_DECISION` / `PI_TOOL` | **0** | ⚠️ F1 |

## 6. Incidents Timeline (evidence quý)

1. **22:59–23:02 (run1)** — `#tab-add-btn` click → panel auto-switch sang session stale (có queued msg) → busy → FATAL. Evidence: `archive-run1/` (driver log + `sit01-newtab.png` + `fatal-*.png`). Ở run3 tab-add hoạt động fresh bình thường (F8).
2. **23:01–23:32 — Stale retry-loop (nhiễu nền):** session uat2 còn queued msg tự retry ~3m11s/lần → console: `[MessageRouter] Handler error for "SEND_PROMPT": Error: Webview is disposed` + compaction events mỗi ~50s. Đóng tab stale (cleanup 23:32, `cleanup-*.png`) không dừng được loop trong extension host (F4).
3. **23:08 (run2) — Backend KB DOWN:** mọi turn fail với DOM error **"Backend KB unreachable after 3 attempts: fetch failed"** — pipeline đứt TRƯỚC khi gọi LLM (0 request tới llama). Evidence: `archive-run2-backend-down/`.
4. **23:26 — Fix môi trường (không sửa code):** start Backend KB (`backend/` — PORT=48721, DATABASE_URL=postgresql@pgvector-db:5432 theo `.env.dev`) → `/health` 200 healthy → extension tự auth (enrichment/status 401→200) → turns hoạt động trở lại.
5. **23:38–00:26 (run3)** — 8/10 turns ok; 2 BLOCKED bởi TYPE-VERIFY-FAIL (F5 — verify gate hoạt động đúng).
6. **00:30–00:38 (retry)** — JS-only typing → 10/10 turns ok.

## 7. Findings & Khuyến nghị

| # | Severity | Finding | Action |
|---|---|---|---|
| F1 | **Major** | Skeleton telemetry family (`PI_SKELETON_BUILT/FALLBACK/FILE_SKIPPED`, `PI_GATE_DECISION`, `PI_TOOL`) **0 xuất hiện** trong toàn bộ console capture mọi vòng → các assertion M5/M6 (SIT-01 step2-3, SIT-07 step1-2, skeleton INV-1) không chứng minh được trên field | DEV xác nhận: marker có được emit ở build 1.53.0? chỉ emit lúc (re)build skeleton (cache từ trước khi capture gắn)? logging level? |
| F2 | **Major** | `get_workspace_info` **thiếu functional-map section** (UC-360-03) — chỉ trả layout ở cả 4 lần gọi. Source: map chỉ xuất hiện khi `mapProvider` được đăng ký + `buildSection` thành công; layout-only = EF-2 degradation hợp lệ (BR-360-03 "never blocks" ✅) | DEV/BA xác định điều kiện kích hoạt `mapProvider` trong env này (workspace "Untitled (Workspace)" index state / project registry?) |
| F3 | Medium (ENV) | Backend KB (48721) không chạy khi bắt đầu UAT → mọi turn fail | Bổ sung pre-flight checklist vào UG: llama-server + backend KB + postgres + extension auth (enrichment/status 200) |
| F4 | Medium (ENV) | Stale session retry-loop vô hạn (~3m/lần, "Webview is disposed") chiếm runner → kéo dài 6/10 turns tới 421s | DEV: retry cap + nút Cancel khả dụng ở queue-state ("Finishing previous message — queued next" hiện ẩn cancel) |
| F5 | Low (tooling) | ElementHandle CDP ops trên OOPIF timeout-20s-then-late → corrupt input | Đã xử lý bằng verify-gate + JS-only retry; ghi nhận cho driver tương lai |
| F6 | Info (STC) | STC SIT-01 so khớp scenario 32k (staticBudget 19,668) nhưng env chạy nCtx=65,536 (staticBudget 40,805) | Cập nhật STC theo env thực tế hoặc cấu hình model 32k nếu cần so khớp tuyệt đối |
| F7 | Info | SIT-04 turn1 prompt không có path → agent đoán sai file và báo честно "không có createModule" (file đúng: `extension/src/core/ModuleFactory.ts`) | Dùng path đầy đủ trong prompt |
| F8 | Info | `#tab-add-btn` click lần run1 → auto-switch sang session stale (flaky); run3 → fresh OK | DEV review tab-add logic (auto-select session sau tạo tab?) |

## 8. Evidence Index (`documents/SA4E-360/evidence/uat3/`)

- `frame-identification.{json,log}` + `identify-*.png` — target frame verification
- `results-uat3.json` — kết quả đầy đủ 10 turns + rollup + tokensTrend + retryMode
- `uat3-driver.log`, `uat3-console.log`, `pi-uat3.log` — driver trace, extension console, PI markers
- `responses/sit01.txt … sit07.txt` — full assistant responses từng turn
- Screenshots: `sit01-*`, `sit02-t1-*`, `sit02-t2-*`, `sit04-turn1..6-*` (start/sent/done + 2 type-verify-fail), `sit07-*`, `cleanup-*.png`, `turn-timeout-*.png`
- `archive-run1/` — tab-add flaky + FATAL (evidence F8)
- `archive-run2-backend-down/` — Backend-KB-down diagnosis (evidence F3)
- Backend KB log: shell output `sh_13cbcf539001DZtw8P8rZEl1yn.out` (health 200, `PUT /api/v1/threads/*`)

## 9. Kết luận

**Core governance của SA4E-360 hoạt động end-to-end trên live UI:** 10/10 turns hoàn thành, **0 × exceed_context_size_error**, compaction gate giữ totalTokens 47–57k < usable 58,293 dù history tăng 60→92 msgs, tool calls (read_method/get_workspace_info) thực thi thật, KB persistence hoạt động, privacy log hygiene sạch.

**Chưa chứng minh được (cần DEV follow-up trước khi đóng UAT):** skeleton telemetry (F1) và functional-map section (F2) — hai assertion thuộc UC-360-01/03/04. Không phải lỗi blocking của pipeline, nhưng là khoảng trống evidence so với STC.
