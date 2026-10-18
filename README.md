# SDLC Agents for Enterprise

Multi-agent SDLC pipeline - 9 AI agents automate your software development workflow.
BA -> SA -> DEV -> QA -> DevOps, orchestrated by Scrum Master.

## Quick Start

### 1. Start Backend
Published on npm — no source download needed:
```bash
npx sdlc-agent-4-enterprise-server
# Server at http://localhost:48721
# Custom port: npx sdlc-agent-4-enterprise-server --port 9000
```

### 2. Install Extension
```bash
cd extension
npm ci && npm run esbuild && npx vsce package --no-dependencies
kiro --install-extension sdlc-agents-4-enterprise-1.53.4.vsix
```

### 3. Use
```
@sm-agent KSA-14              -> Full SDLC pipeline
@sm-agent KSA-14 status      -> Check progress
```

## Agent Pipeline

| Phase | Agent | Output |
|-------|-------|--------|
| 1. Requirements | BA | BRD.md |
| 2. Specification | BA + TA | FSD.md |
| 3. Design | SA | TDD.md |
| 4. Test Planning | QA | STP.md, STC.md |
| 5. Implementation | DEV | Source code |
| 5.5. User Guide | DEV + BA + QA | UG.md |
| 6. Testing | QA | Test results |
| 7. Deployment | DevOps | DPG.md, RLN.md |

## Key Features

- 9 SDLC Agents - Full pipeline from requirements to deployment
- Multi-IDE Support - Inject agents into Kiro, VSCode/Copilot, Claude Code, or Codex/OpenAI
- Knowledge Base - SQLite + ONNX embeddings, 30+ memory tools
- Multi-database Support - SQLite (default), PostgreSQL, MySQL with admin migration tool
- Sensitive Data Masking - Read-time PII/credential/business logic redaction
- Internet Tools - fetch_url, web_search, git_browse, download_file, api_call, read_webpage
- Code Intelligence - AST parsing, call graph, impact analysis
- Admin Portal - Web UI for KB management
- LangGraph Chat - Built-in chat with hooks, steering rules, agent workflows

## Structure

```
backend/    <- Backend server (start first)
extension/  <- Kiro/VS Code extension
```

## License

MIT

---

## Changelog

### v1.53.10 (2026-10-18)

**SA4E-372 — Chat blocks: tách block theo vòng loop (thinking ↔ tool-call), collapse semantics đúng, persist/restore per-workspace đầy đủ**

- 🔄 **Per-cycle blocks (R1)**: mỗi model response trong turn = 1 nhóm riêng — block Thinking + bubble answer text + nhóm tool-call của cycle đó; hết fuse cả turn vào 1 bubble/1 container (turn 103 calls cũ chỉ hiện 1 thinking + 1 bubble)
- 🎛 **Collapse semantics (R2)**: block đang update không tự collapse; tool expand default lúc gọi; tự collapse chỉ khi mọi tool terminal; user expand tay → sticky, không bao giờ auto-collapse nữa (flag data-user-managed, sống qua replay)
- 💾 **Persist per workspace (R3)**: entries per-cycle được lưu theo thứ tự thời gian vào tab.messages → workspaceState("chatPanel.state"); replay tái tạo đúng cấu trúc N nhóm; restore nền mà vẫn tương thích data cũ (1 entry/turn)
- 🧪 Engine không đổi (đã stream `thinking`/`token`/`toolCall` đủ chi tiết); renderer-side cycle machinery (chat-cycle.js + chat-blocks.css mới; chat.css không phình to)

### v1.53.9 (2026-10-18)

**SA4E-368/369 UAT follow-up — UAT 17/10: context window bị resolve nhầm 8192 (thật: 131.072) → tool pool bị cắt còn 12 tool + turn REJECT "mất tool"**

- 🔬 **Reproduce trong code (manual test CDP trên Kiro thật)**: `openai-provider.ts` khởi tạo `contextWindowTokens = 8192` placeholder cho local server; `getDetectedContextWindowHelper` cache luôn placeholder này vào `state.detectedWindow` **trước khi** async probe (fetch `/v1/models`, timeout 5s, parser `meta.n_ctx`) kịp chạy → budget co còn 5.536 → lean tool loadout cắt toolset + turn-start REJECT (5572 > 5536)
- 🛠 **F1 — probe không cache placeholder**: `getDetectedContextWindowHelper` chỉ được đọc/cache `provider.getContextWindow()` khi probe thật đã chạy (`probeDone === true`); trước đó trả undefined cho resolver chain xử lý
- 🛠 **F2 — hết placeholder 8192**: local server khởi tạo `contextWindowTokens = 0` (0 = chưa detect; registry → default 8192 của resolver chain đảm nhiệm fallback); cloud giữ 128.000
- 🛠 **F3 — probe tự hồi phục**: probe fail (vd. model đang JIT-load, `meta: null` như 23:20:50 tối qua) → **không khóa** `probeDone`, retry tối đa 3 turn; + fallback parse `--ctx-size` từ `status.args` của gateway LM Studio khi `meta.n_ctx` thiếu (model đang load vẫn đọc được ctx từ launch args)
- 🧪 Tests mới: model-detect (meta.n_ctx / context_length precedence / args-fallback / non-fatal), probe (placeholder-not-cached / probeDone gate / retry≤3 / no-detect-fn lock); full suite + tsc + eslint + smoke xanh; vsix 1.53.9 install Kiro

### v1.53.8 (2026-10-17)

**UAT 17/10 (run 20:19) — "bây giờ không chạy được luôn": model "trả bài" nguyên văn ghi chú nén context, turn kết thúc tức thì với 0 tool call**

- 🔬 **Reproduce 100% trên llama-server thật**: khi ghi chú nén (tombstone) là **message `assistant` đứng CUỐI transcript** (nhánh fallback khi mọi tool-unit đều rời đi), llama-server "continue" message assistant cuối → trả lại **nguyên văn tombstone** làm câu trả lời (finish=stop, 0 tool call, 0,1–0,6s — khớp chính xác 5 lần fail 20:19–20:37: byte-identical, 0 tool call). Ở giữa transcript (role assistant) model còn tuyên bố *"[context window full]"* và bỏ cuộc; còn message `system` giữa transcript làm llama-server `--jinja` trả **500 "System message must be at the beginning"**
- 🛠 **Fix gốc — tombstone thành message `user`, luôn đứng TRƯỚC câu hỏi user**: `buildTombstoneMessage` đổi `role: 'assistant'` → `role: 'user'`; `tombstoneUnitIndex` không còn fallback "sau pinned user" (nhánh cuối bảng) mà chèn **trước** message user mới nhất — bất biến mới: **note nén không bao giờ là message cuối cùng** (wire luôn kết thúc bằng câu hỏi thật). Chọn role user vì probe trên model thật: note user → model trả lời bình thường; note system → 500; note assistant → echo/đầu hàng
- 🧪 Tests: cập nhật 8 assertion tombstone + thêm test "note is never the LAST message" (pinned query đóng transcript) — `transcript-compaction` 37/37, pi-workflow 53 files / 486 tests PASS; full suite + tsc + eslint + smoke:bundle xanh

### v1.53.7 (2026-10-17)

**UAT 17/10 (run 19:12) follow-up — 3 lỗi lộ ra sau khi fix overflow: model đoán path rồi bỏ dở, steer bị hiểu thành lệnh dừng turn, và degeneration 71KB/11 phút**

- 🎯 **Not-found hint có "Did you mean"**: model đoán `handlers/backend-settings-handler.test.ts` sai 5 lần liên tiếp vì file thật nằm trong `handlers/__tests__/` (nó vừa `ls` ra tên đúng). Giờ lỗi not-found kèm gợi ý path gần đúng (exact trong parent → cùng tên sâu 1 cấp → fuzzy typo), và `ls` trên file giải thích rõ "dùng read" — module mới `path-suggestion.ts` + `not-found-hint.ts` (tách khỏi `workspace-info-tool.ts` theo chuẩn 200 dòng), prompt cũng dạy "list PARENT folder, copy exact names"
- 🧭 **Steer ≠ dừng turn**: sau khi loop-guard steer ("STOP retrying"), model viết *"I need to stop… provide a comprehensive summary without further retries"* và kết thúc review khi mới đọc 20/2.342 file. Mọi steer text (steer/failure/text/reread) giờ có câu **"This steer corrects ONE stuck call only — it is NOT a signal to end the turn"**; steer cho `ls` nêu đúng nguyên nhân "off by ONE level (__tests__/) / use read for files"
- 🛑 **Stream repetition breaker**: model lặp `PlanCanvasPanel.test.ts, plan-canvas-renderer.test.ts,` ~500 lần trong 1 đoạn văn (~71KB, 11 phút) — block-scan cũ không thấy vì đoạn văn không có dòng trống. Module mới `assistant-repetition-monitor.ts` soi delta stream trong cửa sổ 20KB: probe 64 ký tự lặp ≥ 20 lần (non-overlapping) → trip guard, abort turn + báo stop note, thay vì đợi hết 11 phút
- 🧪 Tests: +3 test files mới (18 tests) + test steer/tripNow; full suite 312 files / 3.046 tests PASS, tsc + eslint + smoke:bundle xanh

### v1.53.6 (2026-10-17)

**SA4E-369 follow-up — Fix gốc lỗi "vượt context" (raw 400) khi chat review toàn bộ workspace + export hết bị cắt**

- 🛡 **Context budget gate hết under-count (root cause của raw 400 69.352 tokens)**: gate đo request bằng heuristic `chars/4`, nhưng nội dung code/path/JSON thực tế tokenize ~3,3 chars/token (đo bằng `/tokenize` của chính llama-server) → request "tưởng fit" 57,8k trong usable 58.293 (n_ctx 65.536) nhưng thực tế **69.352 tokens** → provider trả 400 thô. Thêm `estimateWireTokens` (chars/3, conservative) vào `prompt-compressor.ts`; chuyển 3 module provider-facing sang dùng nó: `legacy-turn-governance.ts` (turn-start + history compaction), `intra-turn-budget-gate.ts` (mỗi request trong turn), `transcript-compaction.ts` (unit + tombstone) — gate giờ over-count thay vì under-count, tự compact trước khi chạm trần thật
- 🔌 **Gateway model registry dùng context window THẬT**: `pi-gateway-provider.ts` hardcode `contextWindow: 128000` cho mọi model gateway → gate tưởng llama-server 65.536 có 128k headroom. Giờ `fetchGatewayModels` đọc `context_length` (vLLM/OpenRouter) / `meta.n_ctx` (llama-server) và truyền vào registry; 128.000 chỉ còn là fallback khi gateway không báo metadata
- 📄 **Export chat giữ nguyên văn kết quả tool**: cap `MAX_TOOL_RESULT_CHARS` 16.000 → 100.000 — bản export UAT trước bị cắt 48.783 chars (≈14,7k tokens) của tool results, chính là bằng chứng của lỗi overflow; export giờ đúng nghĩa "transcript chính xác" để đưa AI ngoài phân tích
- 🧪 Tests: cập nhật 5 test files sang wire heuristic + 3 test mới (estimator, gateway đọc context từ metadata, registry giữ context thật); full suite 309 files / 3.025 tests PASS, tsc + eslint + smoke:bundle xanh

### v1.53.5 (2026-10-17)

**SA4E-369 — SDLC CHAT: export hội thoại cho phân tích lỗi bằng AI**

- 📤 **Export conversation + copy từng câu**: nút **⤓** trên toolbar chat → xuất toàn bộ hội thoại của tab ra **Markdown** hoặc **JSON** qua save dialog (`chat-{tab}-{timestamp}.md|json`) — gồm mọi message (user/assistant/error + timestamp), **đầy đủ tool call** (args/result/error/duration/status), thinking block; hover từng bubble/tool call → nút **⧉** copy nhanh dạng Markdown. Mục đích: đưa transcript chính xác cho AI ngoài phân tích lỗi chat (vd. loop SA4E-368)
- 🧱 Tách module theo chuẩn 200 lines/file: `conversation-exporter.ts` (normalize) + `conversation-export-render.ts` (markdown/JSON) + `conversation-export-io.ts` (save/clipboard); webview `export-ui.js` + `export.css` (không nhồi thêm chat.js/chat.css legacy)
- 🧪 Khôi phục 2 test block SA4E-368 bị rớt khỏi commit `50bd75c` (K2 errorMessage suppression + compaction tombstone) — giữ pi-workflow suite xanh

### v1.53.4 (2026-10-17)

**SA4E-363 — Patch release (WrapperServer body cap thực sự vào main)**

- 🛡 **WrapperServer body cap 1MB → 64MB + HTTP 413 sạch** — fix gốc nằm trên branch SA4E-363 nhưng **chưa từng vào ancestry main**: các release v1.53.2/v1.53.3 đều build từ source thiếu nó (chỉ bản build từ working-tree bẩn có). Cherry-pick `5194d8d` → main (`8fca2df`): `DEFAULT_MAX_BODY_SIZE` 64MB, setting mới `sdlcAgents.mcpMaxBodyBytes` (min 1MB), `BodyTooLargeError` + `Connection: close` + Content-Length pre-check trả JSON-RPC 413 đúng protocol. 53 wrapper tests PASS
- 📚 Docs về main: `documents/SA4E-365/` (59 files — pipeline thinking-forward) + SA4E-362 UAT closeout STATUS + `documents/SA4E-363/IMPLEMENTATION-NOTES.md` + `documents/SA4E-364/UAT-REPORT` vào đúng thư mục ticket
- 🔧 `.gitignore` `.pi/sessions/` (SDK persists reasoning transcripts — F-2, cherry-pick từ SA4E-365)

### v1.53.3 (2026-10-17)

**SA4E-367 + SA4E-362 — Merge release (chatbox gated tools + Pega ingest auth)**

- 🔐 **SA4E-367**: chatbox MCP bridge hoàn thiện — `buildMcpBridgeAgentTools` export + gated `find_tools`/`execute_dynamic_tool` pair (first-class cho LLM, giữ SEC-324-03 gating), live IDE verification PASS
- 🔑 **SA4E-362 (Pega ingest auth)**: refresh-on-401 giữa job dài — `IngestAuthProvider` + fetchWithAuthRetry + typed `IngestAuthError` + PegaBfsPipeline stop-hook (auth-dead graceful stop); +5 test suites (ingest-auth, crawl-plan-auth, auth-dead, schema-auth, auth-retry)
- 🔁 **Khôi phục nội dung bị merge bỏ sót**: thinking UI trong chat.js/chat.css + `documents/SA4E-364/` (13 items) + SA4E-364-FINDINGS.md — full suite 306 files / 2,967 tests PASS sau khôi phục
- 🧠 Thinking (reasoning) block: xác minh live trên Kiro IDE thật (llama-server `--reasoning-format deepseek`)

### v1.53.2 (2026-10-16)

**SA4E-364 — Patch release (SDLC CHAT: MCP tools wired + thinking display)**

- 🔌 **Wire MCP bridge tools into SDLC CHAT** (SA4E-364): `mem_search` / `mem_ingest` / `code_search` / `jira_get_issue` (SA4E-316 bridge — dead code since creation) giờ nằm trong tool pool của **cả hai** đường chat (legacy + session), kèm allowlist/approval/audit SEC-324-03; `execute_dynamic_tool` deny-by-default; fail-safe khi MCP server stopped. UAT API-level 4/4 PASS (tool call 84ms, graceful -32603/31ms khi down, recovery in-place 166ms)
- 🧠 **Thinking (reasoning) block trong SDLC CHAT**: pi-ai `thinking_delta` → engine `'thinking'` chunk → `THINKING_START/TOKEN/END` protocol → collapsible block UI (tự thu gọn khi answer bắt đầu, click header để xem lại). Hoạt động với llama-server `--reasoning-format deepseek` + mọi gateway trả thinking content
- 🛡 **WrapperServer body cap 1MB → 64MB + HTTP 413 sạch** (SA4E-363): body lớn không còn bị connection reset, trả JSON-RPC 413 đúng protocol
- 📋 Backend `CODE_INTEL_DATA_DIR` env hỗ trợ tách data dir khi chạy backend từ worktree khác
- 🧪 2,936 extension tests (thêm 8 thinking-display tests + 2 bridge-wiring suites 23 TCs); docs đầy đủ trong `documents/SA4E-364/` (BRD/FSD/TDD/STP/STC + 7 diagrams)

### v1.53.1 (2026-10-15)

**SA4E-360 — Patch release (CI security gates)**

- 🔒 Trivy image scan: 16 HIGH → **0** (pillow 12.3.0, setuptools 84.0.0 incl. vendored jaraco.context/wheel trong backend image)
- 🔒 npm audit runtime deps: 3 HIGH → **0** (pi-web-access 0.41.0 — MCP SDK fix; brace-expansion 5.0.12 qua postinstall patch)
- 🧪 Platform-agnostic tests: path-resolver, read-method-tool UT-24, code-extract BV vectors — xanh trên ubuntu + windows runners
- 📦 4/4 CI workflows green; tag v1.53.1, Publish (Extension + Backend) success

### v1.53.0 (2026-10-15)

- **SA4E-360: Multi-Resolution Context Supply P1 — Code Skeletonization + Agentic Context Loading (UAT PASSED 2026-10-15)** — the Pi harness now injects a token-budgeted code skeleton (signatures + structural outline) instead of whole files, with agentic on-demand detail loading via new `read_method` tool; backed by 2 new loopback-backend MCP tools (`code_symbol_locate` SQL-over-symbols, `code_extract_signatures` backend-side extraction with regex fallback) and a 2-level functional map (C-360-M1/M2). Fallback ladder (index missing/stale/bridge absent/budget pressure → pre-360 behavior, `PI_SKELETON_FALLBACK`/`PI_SKELETON_INDEX_STALE` telemetry) keeps turns completing; `PI_GATE_DECISION` enriched with skeleton audit fields (OI-5); secret redaction SEC-360-01..07 (redactSecretLike + secret-file exclusion) keeps credentials out of prompts. New module `extension/src/pi-workflow/skeleton/` (8 modules). UAT (CDP round 3, SDLC Chat panel): SIT-01/02/04/07 PASS — 6-turn journey 0 exceed, compaction 47k–56k ≤ usable 58,293; SIT-08 PASS with exception (Finding E: 2 files 211/229 lines, recorded); SIT-03/05/06 not run (harness-specific). Full suite at impl: ext 298 files / 2,896 tests + backend 330 / 3,461 + E2E-API real-server 180 — 0 fail; Phase-7 pre-tag re-run 298/2,899 green; pentest 120 attempts 0 Crit/High/Med (SECURE-WITH-NOTES); security fixes F-1/F-2/F-3 + dedicated regression tests verified. Known limitations: skeleton active on session path only (legacy chat path → SA4E-361), E2E-API-04 Postgres parity leg pending, rate-limit `/mcp` in security backlog, turn duration up to 421 s on 9B local models with large prompts. Full docs in `documents/SA4E-360/` (BRD/FSD/TDD/STP/STC/TEST-REPORT/DPG/RLN + 10 diagrams).

### v1.52.0 (2026-10-13)

- **SA4E-355: Context Budget Governance for Pi Harness** — 3-gate enforcement (turn-start gate + per-request intra-turn gate in Agent `streamFn` + REJECT claim `PI_CONTEXT_BUDGET_EXCEEDED`), auto-split (auto-chunk + incremental steering + lean tool loadout), and user-message pin in transcript compaction. Context Budget Resolver resolves real model n_ctx via 3-level fallback chain (provider `meta.n_ctx` → ModelRegistry → default 8192), 8% safety margin, 70/30 static/history split, model tiering (small/medium/large). UAT PASSED 2026-10-13 after bug-fix chain #1–#3 (legacy-path governance, intra-turn streamFn gate, user-message pin — journey 400→500→pass). Full suite 285 files / 2,748 tests green; governance regression 148/148. Known pending: E2E-UI wdio STC-500/501/703 (needs display env). Full docs in `documents/SA4E-355/` (BRD/FSD/TDD/STP/STC/TEST-REPORT/DPG/RLN + diagrams).
- **SA4E-356: Fix MCP tools path resolution (UAT PASSED 2026-10-14)** — relative `file_path` now resolves against the primary workspace folder (was: Kiro install dir CWD → ENOENT); shared `PathResolver` across 8 tools (workspace-root resolve, absolute passthrough, `../` escape blocked, Windows case-insensitive fold fixing false rejects on `C:\` paths, `PATH_NO_WORKSPACE` fail-loud when no workspace, payload limits 10MB/25MB, symlink realpath-parent guard); self-correcting errors print resolved path + hint. UAT PASS after REG-1/REG-2 replay; 2,660 tests green; coverage 100%; pentest 92 attempts 0 bypass. Follow-ups: PT-01 (Low), SA-07 transitive audit. Full docs in `documents/SA4E-356/`.
- **SA4E-358: CORS Origin/Host gate for loopback MCP wrapper (UAT PASSED 2026-10-14)** — closes SA-01 (cross-origin readback): removed unconditional `ACAO: *`; new pure `OriginGate` (7 phases) gates every route — web origins denied 403 with zero CORS headers, `vscode-webview://*` + localhost echoed RAW, Host validated on every request incl. no-Origin (DNS-rebinding defense), duplicate/malformed headers fail-closed, `Vary: Origin`; binding 127.0.0.1 asserted. Zero regression stdio/native (2,808 tests green, coverage 100%); pentest 53 attempts 0 bypass; live-verified on dev host (N-QA2 15/15). Public-marketplace publish gated on SD-01/02/03/09 (see DPG). Full docs in `documents/SA4E-358/`.

### v1.48.0 (2026-10-10)

- **SA4E-341: E2E testing framework** — New standalone `e2e/` package: WebdriverIO + wdio-vscode-service + Serenity/JS (Cucumber + Screenplay Pattern) for VSCode-based IDEs. 4 BDD Gherkin features (launch, open-editor, extension-command, chat-webview), Screenplay tasks/questions/interactions, 33 unit tests (all green), Serenity BDD HTML report + failure screenshots (Photographer), CI headless workflow (`.github/workflows/e2e-tests.yml`, xvfb-run on ubuntu-latest). Spike verified: Kiro 1.2.37 = GO (Chromium 152, chromedriver 152 manual via Chrome-for-Testing); 1006 flakiness on CI tracked in follow-up SA4E-351. Full docs in `documents/SA4E-341/` (BRD/FSD/TDD/STP/STC/UG/DPG/RLN/TEST-REPORT + 10 diagrams).
- **SA4E-349: Fix 3 bugs hiding auth 401 failures** — auth-aware Test Connection, hierarchy resolver fail-loud (no PegaApp fallback), fetchContext error reporting, discovery removes HRAppsV2 hardcode.
- **SA4E-350: Fix Pega rules/query strips '@baseclass' appliesTo** — passthrough verbatim + empty compat retry; handle-row follow-up fetches full rule via pzInsKey (6 unit tests + runtime verify 3/3).
- **SA4E-335: Fix 6 DB-layer bugs from review** — memoized id-column check (no tx poisoning), literal-safe placeholder translation, identifier quoting (SQLi guard), safeExec SQLSTATE filter, writable test-backend data dir, knexfile comment sync.
- **Enrichment: scope retry via X-Project-Id** — cap prompt tokens, skip binary Pega assets, register Pega project by app name; `fetchPegaContext` no longer overwrites held project id; runtime settings module added.

### v1.47.1 (2026-10-04)

- **Fix: Docker CI build fail** — Trivy scan detected `CVE-2026-103111` (HIGH) in `libpcre2-8-0 10.42-1+deb12u1`. Added `apt-get upgrade libpcre2-8-0` in production stage; package now at `10.42-1+deb12u2`. CI pipeline passes.
- **Fix: defensive JSON parse on `/auth/refresh`** — Malformed JSON body now returns clean 400 instead of unhandled throw.
- **SA4E-100: Pega BELONGS_TO edges** — New `PegaMembershipEdgeStrategy` extracts BELONGS_TO edges for Pega rules; `GraphSyncService.syncPegaClasses()` creates CLASS nodes as edge targets.

### v1.47.0 (2026-10-02)

- **KB ingest status visibility** — The "KB: Ready" status bar item is now clickable while idle (runs `sdlcAgents.showIndexStatus`), reporting index/parse progress plus LLM enrichment status in the Output channel. New backend endpoint `GET /api/v1/enrichment/failures?limit=N` (clamped 1–1000, default 200) returns the full list of FAILED enrichment tasks from `pending_tasks` — resolved source, error, retry count, timestamp — so users can see exactly which rules/symbols failed and why, instead of only the latest 10 in the status tooltip.
- **Fix: username not showing after login** — Race condition in `AuthManager.ts`: `transitionTo("AUTHENTICATED")` fired `onStateChange` event before `adoptTokens()` stored tokens in SecretStorage. `fetchCurrentUsername()` called `getAccessToken()` → token not yet persisted → `/me` returned 401 → sidebar showed "Logged in" with empty username. Fixed by awaiting `adoptTokens()` BEFORE `transitionTo("AUTHENTICATED")` in both password and SSO login paths. Also improved `fetchCurrentUsername()` to use `getAccessToken()` (auto-refresh) instead of `this.cachedToken`.
- **Cleanup: removed debug logging** from `unified.ts` (`/me` handler) and `sessions.ts` (`validateSession`) — `appendFileSync` to hardcoded `C:\...\backend\*debug.log` paths removed.

### v1.46.3 (2026-09-29)

- **Pega catalog download: migrate resumableDownload to POST with query params** — `PegaRuleCatalogClient.downloadCatalog` now builds `?filePath=` URL; `PegaCatalogDownloader.fetchAllChunks` uses `POST`, `Range` moved to query param, `Accept: application/json`. Fixes server-side POST requirement for `/file/resumableDownload`. Tests updated.

### v1.46.2 (2026-09-28)

- **Fix packaging: add missing direct `yargs` dependency** — Vendored chrome-devtools-mcp barrel (`extension/src/mcp/devtools/third_party/index.js`) re-exports `yargs`/`yargs/helpers`, but `yargs` was only available transitively. The publish workflow installs `extension/` standalone, so `esbuild-production` failed with `Could not resolve "yargs"`. Declared `yargs ^17.7.2` directly (matches upstream + lockfile `17.7.3`). No runtime code changes.

### v1.46.1 (2026-09-28)

- **Version sync patch** — Align all package versions (`root`, `backend`, `extension`) to `1.46.1`; update README badges, vsix install references (`sdlc-agents-4-enterprise-1.46.1.vsix`) and changelogs. No runtime code changes since `v1.46.0`.

### v1.46.0 (2026-09-27)

- **SA4E-289 epic (Option C): LangGraph decommission + Pi SDK cutover** — Legacy LangGraph engine, steering chain, dead hooks, chat/registry and Workflow Graph UI removed; Pi SDK sessions, phase router and checkpointer adapters wired in. Shared kernel extracted to `extension/src/mcp/` (`McpBridge`, providers, `stream-handler`, domain types) so no code outside `langgraph/` imports from it (SA4E-332, lint-frozen).
- **SA4E-324..330: small-model support wave** — `LlmProvider.countTokens()` per-provider API (Anthropic count_tokens, llama/LM Studio tokenize, Ollama prompt_eval_count, ONNX tokenizer.json; no hardcoded `len/4` estimates), context budget gate (REJECT >95%, WARN >85%), smart retrieval with workspace containment, prompt compression + role-scoped prompts, map-reduce for large repos, hallucination grader, model routing/fallback, session compaction + eval harness. Model registry covers phi-3-mini, smollm2, llama3.1, qwen-coder, lmstudio.
- **Security** — 4 High findings fixed and verified (provider baseUrl SSRF validation + `restrictedConfigurations`, ONNX `modelId` path traversal guard, Pi→MCP bridge allowlist + approval + audit, MCP path containment); 17 Medium findings fixed in Phase B hardening; `langgraph/` directory deleted entirely and Workflow Graph zombie removed (decommission complete); 0 Critical across SA4E-324..332.
- **Tests** — 20 former `test.todo` placeholders implemented (chat/E2E-UI logic + webview features); suites green: extension unit 221 files / 2077+ tests, backend unit, e2e-api; `tsc` + `eslint` clean.

### v1.45.0 (2026-09-26)

- **SA4E-234: Backend storage off better-sqlite3 → @sqlite.org/sqlite-wasm** — Async-first `DatabaseAdapter` everywhere; dead admin Express portal, `MemoryDb`, `DiskBackedSet` and native-binding resolver removed; taskWorker concurrency cap raised 8→64. Root-cause fixes from the wasm migration: `SqliteWasmAdapter` now shares one live in-memory DB per resolved file path (refcounted) so sibling adapters stop diverging (`no such table` in E2E); `runAsync` converts BigInt `lastInsertRowid` to Number (fixes `mem_ingest` JSON-serialize crash); graph-analysis stack (`GraphLoader` → `CircularDepDetector`/`HotPathAnalyzer`/`RelatedTestFinder`/`ModuleSummarizer`) fully async; `HttpServer.start` awaits schema bootstrap before serving. All better-sqlite3 remnants purged (dead shim, broken debug scripts, obsolete extension NativeAddonManager + release manifest, stale docs/comments).
- **SA4E-233/232: ANTLR-based Pega expression parser** — hand-written parser removed, callers migrated to ANTLR `ExprNodeEvaluator`; `ISNULL` unary operator added to `ExprOperators`.
- **SA4E-331: Cross-project memory isolation** — PROJECT scope filter + dispatcher updates; E2E tool forwarding now sends `X-Project-Id` (fail-closed reads respected).
- **Extension** — `PegaStreamIngester` accepts an auth manager and sends `Authorization: Bearer` on ingest-stream/job-poll/ingest-rule; indexing services auth headers updated.
- **CI** — E2E global setup boots the server on a dynamic port (no manual code-intel server start). All suites verified green locally before release: backend unit 284 files / 3079 tests, e2e-api 173/173, extension compile & tests.

### v1.44.0 (2026-09-23)

- **SA4E-320: Opt-in HTTPS bypass for remote backend** — New workspace-scoped setting `kiroSdlc.backend.allowInsecureRemote` (default off) lets users accept an HTTP remote backend URL on trusted private networks, with an explicit MITM warning; enforcement stays on by default (SEC-289-03). Backend URL changes now apply at runtime without an extension reload. Security hardening: `restrictedConfigurations` + workspace-trust gate block untrusted-repo abuse; Pega endpoint HTTPS enforcement (SEC-02).
- **SA4E-323: Per-workspace isolation for Pega/Atlassian settings** — Connection settings are isolated per workspace (secrets namespaced in the OS keychain), with a one-time migration of legacy global values. Internal refactor split `PegaHttpClient` and `SettingsMessageHandler` into focused ≤200-LOC modules.

### v1.43.0 (2026-09-22)

- **SA4E-262: Multi-provider SSO (Entra ID / Google / GitHub)** — Strategy-pattern SSO unified on a single source of truth (`sso_providers` table). Entra email verification now uses Microsoft's `xms_edov` claim (Entra omits standard `email_verified`); loopback (native-client) SSO sessions are no longer User-Agent-bound so the extension's `/api/admin/auth/me` works; the extension login screen renders provider buttons dynamically from `/auth/sso/providers` (no hardcoded Microsoft button); the sidebar shows the real signed-in user (password or SSO) instead of a hardcoded "admin". JIT provisioning rejections now return `403 provisioning_rejected` with a clear reason. Added SSO provider configuration guide.

### v1.42.3 (2026-09-11)

- **SA4E-257: Wire DB-backed MCP server config to McpClientManager** — `McpServerConfigRepository` reads `mcp_servers` table, `McpClientManager.initializeAll` loads enabled servers from DB with real-time connect/reconnect/disconnect hooks on CRUD, transport normalization `streamable-http → httpStream`, mock logs removed. Tests pass, no regression SA4E-215.

### v1.42.2 (2026-09-10)

- **Tenant scope stamping for tool execution** — `/api/tools/execute` and `/api/code/search` now stamp the trusted tenant scope onto tool arguments using the canonical `__projectId`/`__userId` keys (not only `_projectContext`). Code-intel tools read `__projectId` and are fail-closed when absent, which previously made `code_search` return "No results found". Covers the MCP call path (`mcpServer`) and the KB API route. Added regression tests (`tools-execute-scope`, orchestration dynamic IT, mcpServer calltool IT).
- **KB Graph edges (LWC dir-based)** — `FileContainsSymbolStrategy` now matches LWC/Aura component symbols to their code symbols by component **directory** (component lives in `.js-meta.xml`, code in `.js`), so LWC_COMPONENT nodes are no longer isolated (131/132 connected). Remaining isolated nodes are legitimate standalone entities (single-file metadata components).
- **Indexer/query hardening** — graph `migrator` idempotency additions, `query-layer` scope resolution, `indexing-engine` fixes.

### v1.42.0 (2026-09-08)

- **Multi-language tree-sitter parsers** — Real AST symbol extraction wired for C, C++, C#, PHP, Ruby, Scala, Swift and Kotlin (grammars bundled + copied to `dist` on build), plus a regex fallback for the same set. A shared `GenericTreeSitterParser` drives per-language node maps (`skipScopeNodes` moved to `grammar-config.json` and propagated to parsers). Symbol-kind fixes: correct name resolution for struct/enum (`type_identifier`), promote `method_declaration`/function-in-class to `method`, separate `variable`/`property`/`constant`, and dedupe symbols by name+kind+startLine.
- **Salesforce indexing** — SFDX projects now index Apex, LWC (`.js` + minimal `.html` template extractor), Aura, Visualforce and `*-meta.xml`; extension source-upload glob extended for SFDX; `CODE_KINDS` extended so Salesforce entities project into the KB Graph.
- **KB Graph edges** — Edge extraction rewritten to read from the `relationships` table (the tree-sitter source of truth) instead of the empty legacy tables. New `MembershipEdgeStrategy` (CONTAINS: class → members) and `FileContainsSymbolStrategy` (LWC component → file symbols); inherits/implements resolve-by-name (fan-out on `calls` avoided). Auto-heal job (`ensure-sa4e-301`) backfills edges for projects with none; unused `code_dependencies`/`code_call_graph` tables dropped; unique index ensured for idempotent edge inserts.
- **KB Graph renderer** — Continuous budget-driven LOD replaces the discrete FAR/MID/CLOSE modes: a reusable `InstancedMesh` renders the nearest `detailBudget` nodes with pixel-accurate sphere scaling, edges show when detail is active, and labels are budget-limited. Interactive minimap (zoom/rotate/pan/span), bottom-left legend with Excel-style filter, and draggable resizable legend window.
- **Enrichment dedup** — Removed the duplicate enrichment-queue path from graph-sync; `CodeEnrichmentTaskCreator` is now the single source with a PENDING/PROCESSING dedup guard; orphan `CODE_ENRICHMENT` tasks (`entry_id=0`/`project_id NULL`) cleaned on boot.
- **Indexing status UX** — Index status bar item opens a real "Kiro Indexer" output channel on click, distinguishes "backend unreachable" from in-progress, and stops swallowing trigger/poll errors.
- **Platform & CI** — Standardized on Node.js 22 LTS, upgraded GitHub Actions checkout/setup-node, and fixed rolldown native-binding install in CI.

### v1.41.1 (2026-09-06)

- **SA4E-242: KB Scope Auto-Detection based on VCS** — KB Scope Auto-Detection based on VCS, detectKbScope async refactor, 100% UAT pass.

### v1.41.0 (2026-08-29)

- **SA4E-6: Sandbox Execution (MCP Server Bridge)** — New `SandboxModule` exposing 5 MCP tools (`sandbox_session`, `sandbox_exec`, `sandbox_run`, `sandbox_install`, `sandbox_test`) so DEV/QA agents run bash, install packages, compile, and run test suites in isolated environments. Local + Docker executors (via `dockerode`), session TTL + background `Reaper`, orphan recovery, resource limits (memory/cpu/disk/pids), mount exclusion of sensitive files, and BR-01..BR-12 hardening (network=none, non-privileged, cap-drop, reuse of `SecurityModule`). Environment-aware default mode (docker on Linux, local on non-Linux; `SANDBOX_FULL_ISOLATION=true` opts into full isolation). Fixed `pending_tasks` schema drift (`priority` column). Tests 4 passed / 3 skipped.

### v1.38.0 (2026-08-25)

- **SA4E-214: Extension-driven Schema Creation for Pega Rule Types** — On-the-fly LLM-enriched schemas created automatically during BFS indexing (no separate "Index Pega Rule Schema" step). Dual-strategy harness analysis (rule-based `HarnessParser` + `LlmSectionExtractor` fallback for stream-rendered harnesses), recursive section discovery with depth/circuit-breaker safety, progressive schema enrichment, and schema-guided code enrichment for accurate summary/pseudo_code. Fixed: `TaskWorker` now delegates `CODE_ENRICHMENT` to `CodeEnrichmentHandler` (Pega flow rules now get summary + pseudo_code); enrichment progress uses `Math.floor`; admin static route serves vendor assets with correct MIME type. Backend 2634 tests ✓.

### v1.37.2 (2026-08-24)

- **Proxy Fix: global-fetch-patch defensive fallback** — Fixed silent proxy bypass in curl/powershell mode. Added cookie jar persistence, followRedirects support, workspace-scoped config, PowerShell CLM compatibility.
- **SA4E-204/205/206** — Parallel orchestration module docs and implementation.

### v1.37.0 (2026-08-24)

- **SA4E-190: SDLC Pipeline Autonomy L3 Reset & Rebuild** — Full SDLC pipeline reset from requirements to deployment with Autonomy Level L3. Rebuilt BRD, FSD, TDD, STP, STC, UG, TEST-REPORT, DPG, RLN. Implemented backend module `backend/src/sa4e-190/` with PipelineController, StatusManager, repository, unit/integration/e2e tests. All tests PASS (Backend 2617 passed, Extension 1561 passed). Merge origin/main into `dnguyenminh/SA4E-190`, lint fixes applied.
- **SA4E-193: Config Commands — 4 slash commands (/create-new-agent, hook, steering, skill)** — LLM-generated config files with ValidationGate schema enforcement (closes GAP-01, fixes D-1..D-7), template fallback offline-safe, hot-reload integration. Ext tests 1621 ✓ · Backend 2621 ✓

### v1.33.1 (2026-08-23)

- **SA4E-189: Hot-Reload System for .code-intel Agentics** — Extension `ChatStateManager` now watches `.code-intel/agents/**/*.md`, `.code-intel/steering/**/*.md`, `.code-intel/hooks/**/*`, `.code-intel/skills/**/*.md` with 300ms debounce. Agent/Steering/Hooks/Skills UI reloads without Kiro restart. Recursive watchers, unit+e2e tests added, docs updated and pushed to Jira SA4E-189.

### v1.33.0 (2026-08-20)

- **SA4E-185: LSP Diagnostics Feed — realtime errors into agent loop** — New `DiagnosticsFeedService` streams LSP diagnostics into LangGraph via `diagnosticsContext` channel (consume-once). Auto-fix advisory fires on severity-token lines. Security-hardened: prompt-injection fencing (fence delimiters + untrusted-data boundary), full approval gate for `fs_write`/`str_replace`/`fs_append`, path-containment for traversal (incl. in-root `..`). Full SDLC doc set (BRD/FSD/TDD/STP/STC/security review/pentest).

### v1.32.0 (2026-08-19)

- **SA4E-186: Agent Runtime Routing** — Dynamic slash menu from `.kiro/agents/*.md`, per-agent model/tool config, AgentSelector dropdown in ChatHeader, dual-path message protocol (runtime vs default).
- **SA4E-184: Web Search native in Extension** — Removed SearXNG dependency, ported `web_search` + `fetch_url` as native VS Code tools (DuckDuckGo Lite POST, no external service needed). Stronger system prompt for mandatory tool usage.

### v1.31.0 (2026-08-19)

- **SA4E-196: Fix GraphSyncService drops Pega symbols on re-index** — `readTopSymbols()` now includes `pega_*` kinds via `OR s.kind LIKE 'pega_%'` pattern. Prevents graph_nodes stale references causing "No content available" in KB Graph detail panel. 696 stale nodes cleaned, 1731 Pega nodes restored.

### v1.30.1 (2026-08-19)

- **SA4E-175: KB Offline resilience** — graceful fallback + user notification when MCP server unreachable
- **SA4E-176: Auth gate signaling** — explicit GRANTED/DENIED in preToolUse hook response, prevents infinite retry loops
- **SA4E-178: Orphan task cleanup** — cascade cancellation of child tasks when parent job terminates
- **SA4E-179: CODE_ENRICHMENT rename** — updated all references to new constant name across codebase
- **Index Jira Project in QuickPick** — added missing "Index Jira Project" option to workspace indexer UI

### v1.30.0 (2026-08-18)

- **SA4E-174: Simplify LangGraph Chat Agent Loop** — Remove verify node for large models, remove aggressive tool nudge, reduce max iterations 25→12, inject all MCP tools (not just 10), add auto-compact at 95% context usage. Chat agent now behaves like OpenCode — LLM decides when to use tools.
- **KSA-290: Collapsible Tool Call Groups in Chat UI** — Tool calls grouped into collapsible containers with summary header (category counts + status dots). Auto-collapses after 3+ calls.
- **SA4E-78: Decouple Code Intelligence Indexer from Local Filesystem** — New `IndexOperationManager`, cooperative cancellation, progress EventEmitter, `DependencyResolver` cleaned of `fs` imports, `FileWatcher` deprecated.
- **SA4E-77: Pega Knowledge Graph — Categorized Node Types, Pega-mode Colors, entry_id-based Code/KB Split** — Enhanced graph visualization with categorized node types.
- **.code-intel Injection Fix** — Extension now copies all chatbox artifacts (hooks, skills, AGENTS.md) to user workspace on inject.

### v1.27.0 (2025-08-16)

- **SA4E-171: Migrate Pega Rules from knowledge_entries to symbols table** — Internal data migration moving 1409 Pega rules into structured `symbols` table with proper metadata (class, ruleset, version). Dual-write/dual-read for zero-downtime transition, pega-mapping enrichment, unified pega-search across both stores. 54 new tests, security review clean.
- **SA4E-132: GateGuard Module** — Denylist, override, audit capabilities for tool approval gate.
- **SA4E-124: Pega rules as code nodes** — Graph integration for Pega rule symbols.
- **SA4E-106: Pega content extraction** — LLM enrichment on Pega rule body content.

### v1.26.0 (2026-08-14)

- **SA4E-155: On-demand KB Entry Enrichment** — Priority queue (HIGH/NORMAL), 15s configurable polling timeout, 3-tier LLM fallback (kiroSdlc.llmChat → Ollama → LMStudio), graceful degradation UX, extension-side enrichment save via COALESCE first-write-wins semantics.
- **SDLC Pipeline Docs** — Full BRD, FSD (TA-enriched with Zod schemas + pseudocode), TDD with 6-phase implementation checklist, 7 draw.io diagrams.

### v1.24.0 (2026-08-11)

- **SA4E-103: KB Document Ingestion Scope Fix** — `mem_ingest` now correctly uses project scope via `withScopeContext(__projectId)`. Documents ingested through pipeline get proper PROJECT scope instead of USER scope.
- **SA4E-104: PostgreSQL Adapter Parity** — Fixed `RETURNING id` in PG pool transactions (uses dedicated client via `pool.connect`), `transactionAsync` isolation, and `pg-schema-ensure` migration module for automatic table creation on PG.
- **Admin UI Improvements** — Zoom/orbit controls for graph visualization, KB entry filter, AJAX-style refresh button (preserves sidebar state), silent token refresh (no full webview reload).

### v1.21.0 (2026-08-02)

- **SA4E-85: ToolApprovalGate — Human-in-the-Loop for Dangerous Tools** — Graph execution pauses and awaits user approval before executing dangerous tools (write_file, shell_execute, git_*). Promise-based gate with idempotency guard, 2-phase escalation (warning + hard reject), retry mechanism (max 3), JSONL audit log, durable state callback, and real-time metrics. 100% open-design compliance. 40 tests.
- **SA4E-85: Chat UI Agentic (Svelte + LangGraph)** — Full chat module: Svelte webview components (ChatPanel, ActionableDiff, PermissionGuard, ToolSpinner, DiagramBlock), LangGraph ReAct agent loop with context-budget-aware messages, Corrective RAG grading for small models, agent registry with YAML parser, IPC bridge with service discovery, telemetry hooks.
- **Knowledge Module** — Backend knowledge service with SQLite-backed vector/BM25 hybrid search, REST API routes, schema management.
- **Steering: Reference Analysis** — Added mandatory Step 2.5 in Phase 1 (Requirements) for complex features: scan open-source reference projects before writing BRD.

### v1.20.0 (2026-08-01)

- **SA4E-84: [drawio] ELK Auto-Layout Fix Mode** — `drawio_auto_layout` tool upgraded to detect + auto-fix layout issues (node overlaps, edge crossings, diagonal edges) using ELK.js layout engine. Takes `file_path` only, writes fixed XML directly to file. For container/swimlane diagrams: edge-only fix (distributes ports without moving nodes). Minimal response (`{ status, message }`). Path traversal protection (SEC-01). Spacing capped at 500px. Env var bounds validation.
- **Steering update** — `shared-diagrams.md` rewritten with comprehensive XML authoring rules, edge routing best practices, port distribution, 7-color palette, container rules, self-check checklist (based on drawio-skill patterns).
- **16 bug fixes** — SQL parameter mismatch in graph/memory modules, tag normalization false matches, async test issues resolved.

### v1.19.1 (2026-07-31)

- **Proxy: leverage VS Code resolution (`@vscode/proxy-agent`)** — System mode now resolves proxy per-URL through VS Code's own proxy stack, reading `http.proxy`, `http.proxySupport`, `http.noProxy` and `HTTPS_PROXY`/`HTTP_PROXY`/`NO_PROXY` env vars, auto-bypassing localhost, with per-URL caching and OS-native fallback (netsh/scutil/gsettings). Proxy connectivity test uses the same resolution path. Fixes unreliable system proxy detection in enterprise networks (esp. PAC/WPAD setups).

### v1.19.0 (2026-07-31)

- **SA4E-81: Proxy Configuration Page** — Enterprise network proxy settings UI. Added Proxy tab to Settings Panel with: manual proxy config (host, port, bypass list), system proxy auto-detection, proxy authentication (SecretStorage), custom URL connectivity testing, and automatic proxy routing for all outbound HttpClient requests via undici ProxyAgent.
### v1.18.0 (2026-07-31)

- **SA4E-79: Client-Side LLM Knowledge Enrichment — bug fixes & hardening** — Client enrichment fallback now works end-to-end: `handleIngestFile` marks entries `pending` + enqueues TAG_ENRICHMENT (NEW-01/NEW-06/NEW-10), TaskWorker race guards (NEW-03), USER-scoped entries can be enriched without projectId (NEW-07), pending section limit raised 3→10 (NEW-09). **FTS fix**: `knowledge_fts` index auto-rebuilds at startup when empty — restores `mem_search` results for all 12,737 pre-existing KB entries.

### v1.17.0 (2026-07-30)

- **SA4E-77: Pega Knowledge Graph Enhancement** — Pega rules categorized by pxObjClass type (PROCESS, DECISION, DATA_MODEL, UI, TECHNICAL, etc.) in the knowledge graph with config-driven mapping via `pega-categories.json`. Graph legend auto-switches to Pega mode (16 category colors) when Pega project detected. Code/KB split now uses entry_id prefix (`code:*`/`pega:*`) instead of CODE_TYPES allowlist. Dashboard codeSymbols includes Pega rules. isPega flag in `/positions` API.

### v1.16.0 (2026-07-25)

- **Memory Evolution Levels L4-L6** — Replaced stub tools with database-backed services and graph algorithms:
  - **Level 6 (Collective Graph)**: DB-backed graph query, node/edge insertion, PageRank, community detection (label propagation), cross-tenant sync (`kb_graph_cross_sync`, `kb_graph_remove_cross`), and project merge (`kb_graph_merge`).
  - **Level 5 (Skill/Procedural Memory)**: Procedural memory CRUD (`mem_procedure`), auto-capturing tool execution sequences (`mem_skill_capture`), dynamic replay with variable substitution (`mem_skill_execute`), and cross-project sharing.
  - **Level 4 (Reflective Consolidation)**: Automated tier consolidation background worker (`TierConsolidationService`) triggering every 30 minutes, plus automated trigger hooks on code sync and bulk ingest operations.
- **Admin Portal & API Enhancements** — Configuration check resilience for Zen Upstream failures, TaskWorker stats and batch retry endpoints. User management updates with privilege escalation checks and password updates. Fully updated Admin Web UI for configuration edits and audit logs.

### v1.15.0 (2026-07-24)

- **SA4E-49: Multi-Database Backend** — PostgreSQL adapter with full async `DatabaseAdapter` methods. All admin/KB/graph modules migrated from raw SQLite to adapter interface. Consolidated `index.db` + `admin.db` into single unified DB. Sequence migration for PostgreSQL identity columns.
- **SA4E-49: Knowledge Base Tags** — Fixed tag scope isolation bug (6,251 entries were invisible due to `USER`-scoped tag entries). Taxonomy-enforced LLM prompts with `normalizeTags()` post-processing. Admin UI now shows 4,038 unique tags.
- **SA4E-49: Admin API & Auth** — JWT authentication with session management (`login`, `logout`, `refresh`, `change-password`). Config change tracking with audit log. RBAC tools (`list-users`, `list-groups`, `add/remove-user`). Database engine switch UI.
- **SA4E-49: Developer Infrastructure** — DI Container, DatabaseManager, ModuleFactory, MemoryModuleBuilder, EventBus, ToolHandlerDecorators. Async SqliteAdapter/PostgresAdapter. Repository pattern (`UserRepository`, `KbRepository`, `GraphRepository`, `AuditRepository`, `SymbolRepository`).
- **SA4E-50/51: RBAC & Graph Fixes** — Project isolation via `X-Project-Id` header, per-user KB scoping, access group permissions. GraphService now uses `DatabaseAdapter` instead of hardcoded SQLite. PostgreSQL insert ID fix for code symbols.
- **Agent Sync** — Agent prompts synced to `kiro`, `claude-code`, `codex-openai`, `github-copilot` conversion targets.

### v1.14.0 (2026-07-19)

- **SA4E-48: MCP Streamable HTTP Compliance** — `WrapperServer` implements the required MCP `initialize` handshake (plus `ping`, `notifications/initialized`, and `GET /mcp` SSE), fixing the VS Code `-32601 Method not supported: initialize` stop/restart loop. Added integration tests TC-32–TC-36.
- **OpenCode SSE Compatibility** — Added `event: endpoint` to SSE stream so OpenCode v1.17.15 SSE client connects properly (fixes `Non-200 status code (405)` error)

### v1.13.0 (2026-07-19)

- **Presentation Servers** — Added FastAPI (Python) + Next.js (React) presentation generation servers with full slide templates, LLM integration, and chat services
- **Electron Desktop App** — Added Electron wrapper with IPC and slide metadata support
- **Presentation Diagrams** — Architecture overview and agent pipeline draw.io diagrams
- **Scripts & Utilities** — `rebuild_notice_all.py`, `start.js`, `test_server.py`

### v1.12.0 (2026-07-19)

- **Version Bump** — All packages and README files updated to v1.12.0
- **Consistency Sync** — Version badges, install commands, and changelogs aligned across root, backend, and extension READMEs

### v1.11.0 (2026-07-18)

- **SA4E-42: DatabaseAdapter Refactoring** — Complete engine layer overhaul with consistent SQLite adapter patterns:
  - `DatabaseAdapter` interface with atomic `get()`, `list()`, `create()`, `update()`, `delete()`, `query()` methods
  - `SqliteDbAdapter` implements all CRUD with prepared statements, transactions, batch operations
  - Memory module (`MemoryAdapterWrapper`, `GraphNodeAdapter`, `IndexerAdapter`) refactored to use adapter
  - All 66 test files pass (570 tests, 0 failures)
- **SA4E-47: LLM Context Chain for Document Indexing** — Enhanced LLM pipeline with contextual reasoning:
  - `analyzer.ts` — chunking with context chain window, entity/actor/rule extraction, rich structured_map output
  - `ENHANCED_SYSTEM_PROMPT` in `prompts.ts` — expanded instruction set covering roles, relationships, priority, tags
  - `LLMService.ts` — maxTokens 300→2048 for deep analysis
  - `TaskWorker.ts` — context chain query path, structured_map merge into KB
  - `engine/crud.ts` — `updateStructuredMap()` for persistent structured_map storage
  - `dispatchers/crud.ts` — full content extraction, automatic task creation on `handleIngestFile`
  - 12 new unit test files for all added modules
- **drawio Test Fixes** — `drawio-export.test.ts` + `mcp-drawio-dispatch.test.ts` pass (content_base64 param); export-dependent tests skipped (requires drawio CLI)
- **Extension 1.11.0** — Packaged as `.vsix`, 30s HTTP timeout in `IndexerHttpClient`

### v1.9.0 (2026-07-15)

- **Agent Sync to All Platforms** — Synced 9 agent prompts from `.kiro/agents/prompts/` to all 5 conversion targets (Claude Code, OpenCode, GitHub Copilot, Codex OpenAI, Antigravity/Gemini) + root `.claude/` and `.opencode/` folders. Single source of truth maintained.

### v1.8.2 (2026-07-15)

- **SA4E-39: Extension Auth Warning** — Show warning + Login button when session expires, StatusBarManager wiring, HttpClient auth-guard prevents 401 spam and silent KB ingestion failures.
- **SA4E-40: Admin Dashboard 401 Fix** — Stop polling on token expiry, auto-redirect to LoginPage, prevent server log flood.
- **Version Sync** — All README badges + changelogs now consistent. Added `version-sync-check` hook to prevent future drift.

### v1.8.1 (2026-07-15)

- **SA4E-38: Smart KB Ingest — Local LLM Semantic Evaluation** — New MCP tools `mem_smart_ingest` + `mem_smart_ingest_cleanup` that use local Ollama LLM to evaluate user messages before KB ingestion:
  - `ClassifyService` — Strategy pattern for LLM-based binary classification (ingest/skip)
  - Fire-and-forget pattern — hook calls backend tool without consuming chat LLM tokens
  - Graceful fallback — Ollama unavailable → ingest raw with "unfiltered" tag, batch cleanup later
  - Deduplication — content hash prevents duplicate KB entries
  - Feature flag — `SMART_INGEST_ENABLED` env var for instant disable
  - 33 unit tests, 48 test cases planned (STP/STC)
  - Full SDLC documentation: BRD, FSD, TDD, STP, STC, UG + 10 draw.io diagrams

### v1.8.0 (2026-07-15)

- **KB Evolution System** — CompositeScorer with 5 scoring strategies (Temporal, Confidence, Superseded, Outcome, Predictive), DecayService, EpochService, StagnationDetector, and OutcomeService for knowledge lifecycle management
- **KB Supersession** — Entries can be marked superseded; old knowledge automatically deprioritized in search results
- **KB Evolution Dispatcher** — New MCP tools: `mem_decay_cycle`, `mem_epoch_trigger`, `mem_stagnation_report`, `mem_record_outcome`, `mem_supersede`
- **Security Phases in SDLC** — Added Phase 3.7 (Design Review), 5.7 (Code Review), 6.3 (Penetration Testing), 6.7 (Deployment Review) to pipeline
- **DevOps as Version Sync PIC** — Phase 7 release process now requires DevOps to scan and sync ALL version references (project-agnostic)
- **Architecture Pattern Detection** — 7 patterns (ai-agent, microservice, monolith, library, cli-tool, data-pipeline, plugin) with per-pattern pipeline adjustments
- **Document Templates Overhaul** — Updated BRD, FSD, TDD, STP, STC, UG, DPG, RLN, Security Report, UI-Spec, Design System, Test Report templates
- **Agent Prompt Improvements** — All 9 agents (SM, BA, TA, SA, QA, DEV, DevOps, Security, UI) updated with enhanced prompts and role boundaries
- **Steering Rules Expansion** — Added patterns/, role-boundaries, dev-bug-diagnosis, shared-diagrams, phase routing steering files
- **SA4E-36 BRD** — Business Requirements Document for new feature
- **SA4E-37 Updates** — Health Check & Auto-Reconnect run log updates
- **E2E Test Infrastructure** — Dynamic port allocation, env-setup module, separate vitest.e2e.config

### v1.7.1 (2026-07-15)

- **Bug Fix: Database Name empty on Configuration page** — `/api/admin/database/status` now returns connection params (host, port, username, database, ssl) for non-SQLite engines; frontend `loadDbStatus` populates form fields on page load
- **Enhancement: --port CLI argument** — Backend server port now configurable via `--port` CLI arg (priority: CLI > `CODE_INTEL_PORT` env > default 48721)
- **Enhancement: E2E tests use dynamic free port** — Test setup finds a free port via `net.createServer(0)` to avoid conflicts with running dev server; shared `e2e-config.ts` exports centralized test URLs

### v1.7.0 (2026-07-15)

- **SA4E-37: Health Check & Auto-Reconnect for Child MCP Servers** — Periodic monitoring and automatic recovery for child MCP server connections:
  - `HealthMonitor` — single global `setInterval`, parallel pings via `Promise.allSettled()` with 5s timeout
  - `ReconnectManager` — exponential backoff (1s→30s cap) with ±20% jitter, transport-specific reconnect (kill+respawn for stdio)
  - `ConnectionStateTracker` — per-server state machine (connected→unhealthy→reconnecting→failed), event emission via callback array
  - `TransportFactory` — shared transport creation (stdio/sse/httpStream)
  - Enhanced `getServersStatus()` — backward-compatible, adds state, lastHealthCheck, consecutiveFailures, reconnectAttempts
  - New APIs: `startHealthMonitor()`, `stopHealthMonitor()`, `reconnectServer(name)`, `onServerStateChange(cb)`, `setHealthCheckConfig(cfg)`
  - `McpClientManager` refactored as Facade coordinating health subsystem
  - `OrchestrationModule` lifecycle hooks added
  - 54 unit tests (Vitest + fake timers)

### v1.6.0 (2026-07-15)

- **SA4E-34: Multi-database Support** — Database abstraction layer with admin configuration:
  - Strategy pattern: `DatabaseAdapter` interface + `SqliteAdapter`, `PostgresAdapter`, `MysqlAdapter`
  - `DatabaseAdapterFactory` for engine selection from config
  - `DatabaseConfigService` — AES-256-GCM encrypted credentials in `database.json`
  - `MigrationService` — batch data copy (500 rows/batch), progress streaming (SSE), automatic rollback
  - Admin UI: Database Configuration tab with engine selector, connection form, Test Connection, Start Migration, Apply & Switch
  - New dependencies: `pg` (PostgreSQL), `mysql2` (optional)
  - API endpoints: `/api/admin/database/status`, `test-connection`, `migrate` (SSE), `migrate/cancel`, `switch`
- **SA4E-35: Global Toast Notification** — Fixed-position toast (bottom-right) replacing inline msg bars across all admin pages (KB, Tags, Users, Config, Profile)
- **SA4E-31: Cross-workspace Isolation** — Project-scoped graph nodes, spatial queries, and tag filtering by projectId

### v1.5.0 (2026-07-13)

- **SA4E-125: Pipeline Refactoring v2-v6** — Hardcoded → Data-Driven Architecture:
  - Index-based phase routing with `currentPhaseIndex` replacing string `order.indexOf()`
  - `PipelineDefinition` in state for per-thread isolation & checkpointing
  - Sandboxed hot-swap with 3-rule validation (non-empty, valid agents, no LLM errors)
  - `resolvePhaseIndex()` pure function for self-healing index realignment
  - State size optimization (~2-5KB per pipeline definition)
  - Orphaned phase detection → pipeline pause with human intervention
  - Skip/Cancel decisions via extended `ApprovalDecision` type
  - 3-Layer skip fix: `routeFromSm` → `advance_phase` → `buildSmTargets`
  - Ghost Context Barrier — system `ChatMessage` injected on orphaned skip
  - LangGraph source restructured: `core/`, `pipeline/`, `agents/`, `engine/`, `subgraphs/`, `steering/`, `workflow/`, `helpers/`, `hooks/`, `vscode/` modules
  - Full SDLC documentation: BRD, FSD, TDD, 13 draw.io diagrams (PNG + source)

### v1.3.0 (2026-07-09)

- **Multi-IDE Agent Injection** — IDE target picker (Kiro, VSCode/Copilot, Claude Code, Codex/OpenAI)
- **Pre-converted agent bundles** — Proper format per IDE (frontmatter, folder structure, hooks)
- **Codex/OpenAI conversion** — Full `conversions/codex-openai/` with 9 agents
- **Bundled backend** — No more Python/NodeJS/Kotlin runtime picker
- **IDE Adapter architecture** — Strategy pattern, pre-built files copied at inject time
- **LLM Provider Registry** — 135 providers (from 6) matching OpenCode/litellm ecosystem
- **Data-driven Settings dropdown** — Grouped by Cloud/Enterprise/Gateway/Local, dynamic from registry
- **SSRF fix** — Localhost LLM providers no longer blocked by SSRF protection
- **TagAnalyzer health check** — Only enables LLM tagging if provider is reachable at startup
- Updated CONVERSION-GUIDE.md and GAPS.md

### v1.2.1 (2026-07-08)

- **Loop Engineering Guardrails** — 6 items from [cobusgreyling/loop-engineering](https://github.com/cobusgreyling/loop-engineering):
  - Loop Constraints file (path denylist, execution limits, push safety)
  - Token Budget Tracking via KB (daily cap, 80% warning, hard stop)
  - Circuit Breaker (closed/open/half-open states, auto-cooldown)
  - Run Log per ticket (append-only audit trail)
  - Phased Autonomy Levels (L1 report / L2 assisted / L3 unattended)
  - Failure Mode Catalog (7 documented patterns)
- **Skills Integration** — 3 items from [mattpocock/skills](https://github.com/mattpocock/skills):
  - Domain Glossary via KB (BA extracts terms, all agents consume)
  - Two-Axis Code Review (Standards + Spec compliance, parallel)
  - Bug Diagnosis Loop (6-phase structured debugging for DEV)
- **41 steering files** bundled (up from 32)

### v1.2.0 (2026-07-08)

- **Local tools discoverable** — `stream_write_file` and `embed_image` now appear in MCP `tools/list` response with full description + inputSchema (LLM can discover them)
- **`embed_image` implemented** — Reads a markdown file, replaces local image references (`![](path.png)`) with base64 data URIs, writes self-contained `-embedded.md` file
- **`stream_write_file` param fix** — Accepts both `file_path` and `path` arguments (callers use `file_path`)
- **Local tools injected into wrapper** — `injectLocalTools()` deduplicates and merges local tool definitions into backend `tools/list` responses
- **Backend admin API** — Rate limiter, localhost-only middleware, admin routes
- **Code intelligence** — Updated analysis modules

### v1.1.0

- Thin client architecture (backend + extension separation)
- 9 SDLC agents with full pipeline
- Knowledge Base with 5 web panels
- Chat panel with multi-LLM support
- Salesforce project indexing
