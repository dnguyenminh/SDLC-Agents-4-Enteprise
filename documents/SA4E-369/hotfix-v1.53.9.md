# Hotfix v1.53.9 — Context window mis-detection (placeholder 8192 cached as "detected")

**Ticket:** SA4E-368/369 UAT follow-up (chat "Review toàn bộ các file của workspace", local lmstudio/qwen)
**Date:** 2026-10-18 | **Process:** L3 hotfix — SM plan + dev-agent (S1) + qa-agent (S2) + orchestrator verify/ship
**Version:** 1.53.8 → 1.53.9

## Root cause (reproduced via CDP manual test on real Kiro)

UAT 17/10 23:2x: tool pool bị cắt còn 12 tool + turn REJECT `PI_CONTEXT_BUDGET_EXCEEDED: 5572 > 5536, n_ctx=8192`
(trong khi llama-server thật `--ctx-size 131072`, gateway `/v1/models` báo `meta.n_ctx: 131072`).

Chuỗi lỗi trong code:

1. `openai-provider.ts:31` — constructor khởi tạo `contextWindowTokens = 8192` (placeholder) cho local server.
2. `pi-adapter-context-probe.ts` — `getDetectedContextWindowHelper()` fallback đọc `provider.getContextWindow()`
   (≈ 8192 placeholder) và **cache vào `state.detectedWindow` trước khi** async probe
   (`detectContextWindow()` → fetch `/v1/models`, timeout 5s, parser `openai-model-detect.ts` đọc `meta.n_ctx`)
   kịp chạy — và probe one-shot khóa `probeDone` kể cả khi fail.
3. Probe fail lúc model JIT-load (23:20:50 — `meta: null`) hoặc fetch timeout → 8192 giả bị coi là "detected"
   → `resolveContextBudget` usable ≈ 5.536 → lean tool loadout cắt toolset + turn-start REJECT.

## Fixes (F1–F3)

| # | File | Fix |
|---|------|-----|
| F1 | `pi-workflow/pi-adapter-context-probe.ts` | `getDetectedContextWindowHelper` chỉ đọc/cache `provider.getContextWindow()` khi `probeDone === true`; trước đó trả undefined (resolver chain tự xử) |
| F2 | `mcp/providers/openai-provider.ts` | Local server init `contextWindowTokens = 0` (0 = chưa detect); cloud giữ 128.000 |
| F3a | `pi-workflow/pi-adapter-context-probe.ts` | Probe fail → không khóa `probeDone`, retry tối đa 3 turn (`attempts` counter); provider không có `detectContextWindow` → one-shot lock như cũ |
| F3b | `mcp/providers/openai-model-detect.ts` | Fallback parse `--ctx-size` từ `status.args` (LM Studio gateway expose launch args — model đang JIT-load vẫn đọc được ctx) sau `context_length` → `meta.n_ctx` |

## Quality gates (L3)

| Gate | Kết quả |
|------|---------|
| GATE-dev (S1 dev-agent) | 6 files đúng scope, ≤200 dòng/file (max 197); targeted tests 12/12 + 46/46 PASS |
| GATE-verify | Full suite **389 files / 3.066 tests PASS**; tsc 0 errors; eslint 0 errors; smoke:bundle PASSED |
| Bundle check | `--ctx-size` fallback + `attempts` + zero-init đều có trong minified bundle |
| GATE-ship | vsix 1.53.9 packaged (1881 files) + `kiro --install-extension --force` OK |
| Gate-UAT | ✅ **PASSED** — MANUAL CDP UAT 18/10 trên Kiro thật (isolated profile `kiro-uat2`, seed cùng settings lmstudio/qwen-text): gửi prompt *"Review toàn bộ các file của workspace"* → **turn chạy thật**: `tabMaxTokens=131072` (DOM, trước fix là 8192 placeholder), **47 tool calls (44 ✓ / 3 ✗)**, 14 file, điểm activity "33 TOOL, 14 FILE", KHÔNG `PI_CONTEXT_BUDGET_EXCEEDED`, KHÔNG tombstone; backend "Logged in as admin" + MCP Wrapper :9181 Running. Note phụ: 1 bubble `HTTP 401` ở profile lạnh (KB/auth call trước khi auto-login xong — env-only, cửa sổ chính login sẵn không gặp; không thuộc scope v1.53.9) |

## Notes

- **Independent confirmation (second run, 18/10 16:26 ICT, isolated profile `kiro-uat3`)**: cùng prompt → Context Usage **3%** (arc dashoffset 48.762/50.27, class `safe` — chỉ khớp maxTokens≈131.072; 8.192 sẽ ~42% + class `critical`), **63 TOOL / 34 FILE / 1 CMD** giữa turn (98 calls: 86 ✓), 0 REJECT, 0 tombstone. Turn dừng chủ động sau khi đủ bằng chứng (turn thật chạy 100+ calls cần nhiều lượt Approve — profile sạch không có per-tool trust; cửa sổ thật có "Allow all" pattern nên không bị). Env note: fresh profile chưa login backend → KB/bridge tools giới hạn (env-only, như run 1).
- SM coordination artifact ban đầu đặt nhầm vào `documents/SA4E-370/` (Epic "Custom Agents" — workstream khác, đã có trên Jira id 14185); hotfix record chuyển về đây. Epic SA4E-370 không bị đụng đến.
- Svelte "Agentic Chat" panel 404 (`out/webview/main.js`) xác nhận là lỗi CŨ (thiếu trong VSIX cả v1.53.7) — SA4E-85 build Vite không nằm trong prepublish; theo dõi riêng, không thuộc hotfix này.
