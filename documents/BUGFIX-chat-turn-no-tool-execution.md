# Bug Analysis — Chat turn ends early, model narrates commands instead of calling tools

> **Handoff document for the implementing AI/agent.** Root-cause analysis, runtime evidence, and a prioritized fix plan. Read §0 (TL;DR) and §5 (investigation checklist) before writing any code.

---

## 0. TL;DR (for the implementing agent)

- **Symptom:** In the SDLC Chat panel, a task like "Review toàn bộ project" makes the assistant print shell commands as **plain text** (```bash / ```powershell fences: `cat ...`, `Get-Content ...`, `ls ...`), sometimes **repeating the same block ~6 times**, then the turn stops. No file is read, no command runs.
- **Runtime proof:** the turn ends with `Stopped early: Stopped after the turn timeout with 0 tool calls.` — i.e. it ran the full `chatTimeout` (default 120s) and made **zero tool calls**.
- **⚠️ ROOT CAUSE CORRECTED (2026-09-30) — the earlier "model can't use tools" conclusion is WRONG.** The user's model is **Ornith-1.0-9B** (`ornith-1.0-9b-Q4_K_M.gguf`), a purpose-built **agentic coding model** post-trained with RL to emit tool calls and self-scaffold; it drives Claude Code / Codex / opencode locally ([ornith.site](https://ornith.site/), [ollama ornith-claude-coder](https://ollama.com/rafw007/ornith-claude-coder)). It IS tool-capable. So the failure is on the **HOST side**: the request reaching the model carries no tool schemas, or the tool list is empty at turn time. Offering/executing tools is the harness's job (pi-ai + our gateway wiring), not the model's. *(Model capability info rephrased for licensing compliance.)*
- **✅ CONFIRMED BY RUNTIME LOG (2026-09-30) — bundling defect, `tools=0`:**
  ```
  [PiCodingTools] create tools failed (non-fatal): The "path" argument must be of type string or an instance of URL. Received undefined
  [PiExtensionRuntime] load failed (non-fatal): The "path" argument must be of type string or an instance of URL. Received undefined
  [Chat] turn via=legacy ext=1.46.3 workspace=c:\projects\kiro\SDLC-Agents-4-Enterprise tools=0 used=0 systemPrompt=1135ch
  [PiProvider] turn stopped early (timeout, 0 tool calls)
  ```
  `createWorkspaceTools()` threw (`path...Received undefined`) → its `catch → return []` → **`tools=0`** → pi-ai omits the `tools` param (openai-completions L481) → the tool-capable Ornith model has nothing to call → narrates commands → 120s timeout, 0 tool calls. **The model is not at fault; the host shipped 0 tools.**
- **Why `path...undefined` — esbuild CJS output empties `import.meta` (mechanism PROVEN 2026-09-30, corrected).** `extension/esbuild.js` bundles everything into one `out/extension.js` with `format: 'cjs'`. esbuild turns `import.meta` into `var import_meta = {}` (warning: *`import.meta is not available with the "cjs" output format and will be empty`*), so pi-coding-agent's `dist/config.js:10` ran `fileURLToPath(import.meta.url)` with `undefined` → `The "path" argument must be of type string or an instance of URL. Received undefined` **at module top level**. The throw happens during the static `import` of `@earendil-works/pi-coding-agent`, so `createWorkspaceTools()` (`catch → return []` → `tools=0`) and `PiExtensionRuntime` both failed. *(Earlier claim that `require.resolve(...)` returned undefined → `path.dirname/join(undefined)` was WRONG — node's `path.dirname(undefined)` and `createRequire(undefined)` produce different messages; `fileURLToPath(undefined)` is the exact match. Reproduced by bundling a minimal `await import('@earendil-works/pi-coding-agent')` entry with plain esbuild → identical error.)*
- **✅ FIX IMPLEMENTED (2026-09-30, bundle-side — NOT the originally planned "externalize"):** `extension/scripts/esbuild-plugins/pi-import-meta.js` adds an esbuild **banner** (`var __PI_IMPORT_META_URL = require("url").pathToFileURL(__filename).href;` + `__PI_IMPORT_META_RESOLVE` helper) and **`define`** entries rewriting `import.meta.url` → `__PI_IMPORT_META_URL` and `import.meta.resolve` → `__PI_IMPORT_META_RESOLVE`, wired into both `esbuild.js` and the `smoke:bundle` harness (the old onLoad text-shim plugin was deleted). The resolve helper additionally handles: (a) pi packages export only the `import` condition → resolve with `conditions: new Set(['import','node','default'])`; (b) `pi-tui`/`typebox` are nested under `pi-coding-agent/node_modules` → second attempt resolves from pi-coding-agent's package dir; (c) always returns a `file://` href (loader wraps it in `fileURLToPath`). The originally planned **Fix E (externalize + ship node_modules in the vsix) was rejected**: deps are hoisted to the monorepo root, outside vsce's package dir, and `.vscodeignore` excludes `node_modules/**` + `../**` — shipping would require restructuring packaging. Verified: `npm run smoke:bundle` 10/10 green (package import + 7 tools + jiti extension loader), vitest 44 files/314 tests green, tsc clean, vsix 1.46.3 packaged + installed.
- **NOT a regression of the earlier fixes.** Streaming-identity / duplicate-bubble / swallowed-`chat:error` are fixed and verified in build ≥ 1.46.3 (the stop-note rendering proves the running build is current).
- **Independent latent bug found:** the **session turn path** registered only 1 tool (`workspace_info`) instead of the full 7 — any cloud-provider (key-requiring) turn would hit the same "can't act" failure. Fix regardless.
- **Status of Fix B (2026-09-30, build 1.46.3): IMPLEMENTED via allowlist, not via `customTools`.** Verified in pi 0.80.10 sources (`agent-session.js` `_refreshToolRegistry` + `createAllToolDefinitions(cwd)` = all 7 cwd-bound builtins; allowlist only toggles names): `createHost` passes `tools: [read,write,edit,bash,grep,find,ls, ...extNames, get_workspace_info]` (deduped, unconditional — degraded mode keeps the 7 core tools and only drops enhancement tools). Passing the 7 as `customTools` instead would have DUPLICATED same-named builtins. Test: `pi-agent-session-host.test.ts` ("allowlist covers 7 builtins…").
- **What to build:** (A) detect a zero-tool-call turn early and show the user a clear notice (their model can't use tools) instead of hanging 120s; (B) register the full tool set on the session path; (C) capability guard; (D) system-prompt hardening. **Never auto-execute commands parsed from model text (security).**

---

## 1. Symptom (observed)

Model **`qwen-text`**, Autopilot ON. User: "Review toàn bộ project nhé". The assistant streams text that *describes* shell commands as markdown code fences, e.g.

```
echo "===== 1. AGENTS.md =====" && cat "c:/projects/kiro/SDLC-Agents-4-Enterprise/AGENTS.md" 2>/dev/null | head -100
```

…then the turn **ends** with the task incomplete: no file is read, no command runs. The bubble closes normally (cursor stops), so this is NOT the earlier streaming-identity freeze — the turn genuinely completed on the host side after producing only text.

This is distinct from the previously fixed bugs (stream identity / duplicated bubbles / swallowed `chat:error`). Those are fixed and verified.

## 2. How a turn executes (ground truth from code)

Both turn paths delegate the **tool loop to the pi-agent SDK**. Tools run only when the model emits a structured `tool_use` (surfaced as SDK event `tool_execution_start`). Plain-text/markdown commands are never executed.

### Legacy path (used for local / OpenAI-compatible providers like `qwen-text`)
- `extension/src/pi-workflow/pi-workflow-adapter.ts` → `runTurnOnce` builds tools + system prompt, calls `engine.executeTurn(...)`, then streams `result.streamChunks` and always emits complete (streaming-identity fix present at ~line 404-410).
- `extension/src/pi-workflow/pi-provider.ts` → `promptOnCurrentModel` (~line 280): subscribes to `agent` events, calls `await agent.prompt(prompt); await agent.waitForIdle();`. Tool execution is owned by the SDK loop; the code only *observes* `tool_execution_start/end` events.
- `collectResult` (~line 370): when the agent goes idle it pushes a `{type:'done'}` chunk. **If the model produced only text and no `tool_use`, the agent goes idle immediately after the text → turn ends "successfully" with zero tools run.** This is exactly the observed behavior.

### Session path (used only for key-requiring cloud providers)
- `extension/src/pi-workflow/pi-workflow-adapter.ts` → `trySessionTurn` (~line 230). Guarded by `providerRequiresApiKey(providerId)` (`pi-provider-config-bridge.ts`): local providers (`lmstudio`/`ollama`/`onnx`) return `false` → **legacy path**. So `qwen-text` on a local endpoint does NOT use the session path.

### Tool registration (IMPORTANT discrepancy — separate bug)
- Legacy path registers **7 tools**: `read/write/edit/bash/grep/find/ls` + `workspace_info` — `pi-coding-tools.ts` `createWorkspaceTools` (composes `createReadTool`…`createLsTool`).
- Session path registers **only 1 tool**: `workspace_info` — `pi-agent-session-host.ts` `createAgentSession({ customTools: [ toSessionToolDefinition(createWorkspaceInfoTool(...)) ] })`. No read/write/bash/grep/find/ls.
- ⇒ Any turn that DOES take the session path (cloud providers with an API key) has **no file/shell tools**, guaranteeing the same "narrate, don't execute" failure. This is a real latent bug even though it's not the cause for `qwen-text`.

## 2a. RUNTIME CONFIRMATION (decisive evidence)

A repro turn ended with this exact host-emitted note:

> **"Stopped early: Stopped after the turn timeout with 0 tool calls. Partial results above are complete. Narrow the scope (one folder at a time) or ask for a summary so far to continue." — Request was aborted.**

This is `buildStopNote(...)` from `TurnBudgetGuard` (`turn-budget-guard.ts` / `pi-provider.ts collectResult`) firing on **timeout with `totalCalls === 0`**. It confirms, at runtime:

- The model produced only text and made **zero tool calls** for the entire turn (the guard's `stats.totalCalls` was 0).
- The turn did not "silently" end — it ran until `sdlcAgents.backend.chatTimeout` (default 120s) then the guard aborted it.
- The streaming-identity + stop-note plumbing is working (the note rendered), so the **running build is ≥ 1.46.3** — the "stale build" hypothesis is RULED OUT. The repeated-block symptom is therefore **model self-repetition**: a text-only model with no tool to make progress keeps re-emitting its plan until the timeout guard stops it.

⇒ Root cause §3 is confirmed. Priorities: (1) detect zero-tool-call turns and tell the user their model can't use tools BEFORE burning the full 120s timeout; (2) Fix B (session tool set) still stands independently.

## 2b. Repeated-block symptom — analysis

A repro (PowerShell variant: `Get-Content "...AGENTS.md"` etc.) showed the intro line "Tôi sẽ review… Get-Content …" **repeated ~6 times** in one turn, then stopped at timeout. This is **model self-repetition** (a text-only model with no tool to make progress loops on its plan). It is **not** the fallback chain: `runOnce`/`buildRunChain` only retries when `errorMessage` is set AND `isRetryableLlmError` is true (5xx/timeout/network); a text-only success has no error, so fallback never fires. Address via Fix A (repeat detection → early abort) + Fix C/D.

## 3. Root cause (primary) — HOST does not offer tools (corrected)

**CORRECTED — the primary cause is HOST-side, not the model.** The running model **Ornith-1.0-9B** is a tool-capable agentic coder (see §0). The turn made 0 tool calls because **the request sent to the model did not offer any tools**, or the model's structured `tool_use` output was not surfaced. Offering tools is the harness's responsibility, verified against the pi-ai source:

- pi-ai only adds `params.tools` to the request when `context.tools` is non-empty (`openai-completions.js` L480-489). No tools in context ⇒ no tools in request ⇒ the model literally has nothing to call and can only describe commands in prose. **This matches the symptom exactly.**
- The tool list flows: `runTurnOnce` (adapter) → `createWorkspaceTools()` (7 tools) → `executeTurn` → `provider.run({tools})` → `runOnce`: `agent.state.tools = input.tools` → SDK `context.tools` → request. **Any break in this chain yields 0 tools.** The break was confirmed: `createWorkspaceTools()` swallowed the `@earendil-works/pi-coding-agent` load failure (`fileURLToPath(import.meta.url)` → `undefined`, see §0) and returned `[]`. The `[Chat] turn via=legacy ... tools=N` log reveals N at runtime.

Secondary / to-still-verify:
- **Model output parsing.** If tools ARE sent (N>0 in the log) but the model still produces text-form calls, check whether the gateway/`openai-completions` adapter parses this model's `tool_calls` shape (some GGUF/llama.cpp servers emit tool calls in a non-standard field or inside content). The pi harness must translate that into `tool_execution_start`.
- **No capability feedback.** When a turn ends with 0 tool calls the user gets a half-answer with no explanation (see Fix A).
- **System prompt** (`buildWorkspaceSystemPrompt`) says "explore with your file tools" but does not force tool use (see Fix D).

## 4. Secondary bug (fixed in 1.46.3 — do NOT "fix" again)

~~Session path tool set is missing the file/shell tools. `createWorkspaceTools(workspaceRoot)` must also be passed to `createAgentSession` (converted via `toSessionToolDefinition`), not just `workspace_info`. Otherwise cloud-provider turns silently can't act.~~

**Update:** implemented via explicit `tools` allowlist in `createHost` (`pi-agent-session-host.ts`), NOT by duplicating the 7 builtins into `customTools` (that would double-register same-named tools next to the session's own cwd-bound builtins). Verified: pi 0.80.10 builds `_baseToolDefinitions` from `createAllToolDefinitions(cwd)` (all 7) and the allowlist merely enables names. Locked by test "allowlist covers 7 builtins + discovered extensions + orientation (deduped)".

## 5. Investigation checklist (confirm at runtime before/while fixing)

1. **Confirm the path taken.** Inspect the existing debug log `[Chat] turn via=legacy|session ...` (logged in `runTurnOnce` and `pi-agent-session-host`). Reproduce the "review" prompt and capture it from the extension Output channel / debug log. Expected: `via=legacy` for `qwen-text` on a local endpoint.
2. **Confirm zero tool calls.** In the same repro, check for any `tool_execution_start` event (log in `promptOnCurrentModel`/`ToolEventTracker`). Expected: none.
3. **Confirm model capability.** Check the provider config for `qwen-text`: which provider id + baseUrl (`sdlcAgents.llmProvider`, `sdlcAgents.<provider>BaseUrl`, `sdlcAgents.llmModel`). Verify whether that endpoint/model supports OpenAI `tools`/function calling at all. Test by pointing at a known tool-capable model and re-running the same prompt — it should call `read`/`ls`.
4. **Verify tool schemas are actually sent.** Inspect the OpenAI-compatible request body (`openai-provider.ts`) to confirm the `tools` array is included for the legacy path. If tools are NOT being sent, that is a different (and higher-priority) bug than model capability — a tool-capable model would still fail.

## 5b. NEXT BUG (after Fix E lands) — tool RESPONSE never renders ("(waiting...)")

**Observed (2026-09-30, build with Fix E):** tools now RUN (`read`, `bash ls ...` show ✓ + duration like 182ms/289ms) but every **RESPONSE panel stays "(waiting...)"** — the tool output never reaches the UI. A "Waiting approval: bash (auto-rejects on timeout)" banner also appears (separate approval-gate concern).

**Root cause (confirmed via code + SDK types):** the SDK provides the result, but the host drops it.
- pi-agent-core `AgentEvent` `tool_execution_end` shape (verified in `node_modules/@earendil-works/pi-agent-core/dist/types.d.ts` L395-401): `{ type:"tool_execution_end"; toolCallId; toolName; result: any; isError }` — **`result` carries the content** (`AgentToolResult.content: (TextContent|ImageContent)[]`).
- `pi-event-mapper.ts` `ToolEventTracker.observe()` reads only `toolCallId/toolName/isError` — **ignores `result`**. `mapAgentEvent()` handles `tool_execution_end` only when `isError`; on success it captures **nothing**.
- `pi-workflow-adapter.ts` `postToolLiveEvent()` emits `chat:toolCall` (start) + `chat:toolCallUpdate` (`id/status/duration`) — **no result content**.
- `ChatEngineAdapter.toStreamEvent()` maps only `chat:toolCall → TOOL_CALL_REQUEST`; it does NOT map `chat:toolCallUpdate`, and nothing ever emits **`MCP_TOOL_RESULT`**.
- Webview needs `MCP_TOOL_RESULT{toolId, result:{content}}` → `completeToolCall(toolId, output)` (`messageListener.ts` + `toolStore.ts`). It never arrives → RESPONSE stays "(waiting...)".

**Fix F — plumb tool results to the webview ✅ IMPLEMENTED (2026-09-30, build 1.46.3):**
1. `ToolEventTracker`/`ToolLiveEvent`: on `tool_execution_end`, `extractToolResultText(event.result)` joins `TextContent.text` parts (skips images, plain-string tolerant, capped at `MAX_TOOL_RESULT_CHARS=16000` with `… [truncated N chars]`); `result?: string` added to `ToolLiveEvent` (`pi-event-mapper.ts`).
2. `postToolLiveEvent`: end phase now carries `result` on `chat:toolCallUpdate` (`pi-workflow-adapter.ts`) — protocol field `result?: string` already existed in `message-protocol.ts`.
3. `ChatEngineAdapter.toStreamEvent`: maps `chat:toolCallUpdate` → new `ToolCallUpdateEvent` (id-less updates dropped); `StreamProtocolAdapter.handleToolUpdate` → `MCP_TOOL_RESULT{toolId, result:{content,isError,duration}, error?}` (completed → `content: result ?? ''`; failed → `error: result || 'Tool execution failed'`); `running` emits nothing.
4. **Two consumers, both covered:** (a) the served chat.js webview receives `chat:toolCallUpdate` DIRECTLY (fan-out in `chat-panel-provider.getEngine().onEvent` → `sendToWebview` + `engineListeners`) — `updateToolCall` now ALWAYS writes the Response section on terminal status with fallback `msg.error || msg.result || "(no output)"/"(failed — no output)"` (previously `if (msg.result || msg.error)` left "(waiting...)" for zero-output tools); (b) the Svelte path: `ChatEngineAdapter` → `MCP_TOOL_RESULT` → `messageListener` → `completeToolCall`/`failToolCall`.
5. **⚠️ File gotcha — TWO chat.js copies exist:** the SERVED file is `extension/webview-assets/chat/chat.js` (`ChatHtmlBuilder.ts` line 14 → `extensionUri/webview-assets/...`); `extension/resources/webview-assets/chat/chat.js` is a STALE v1.33 copy whose copy-resources source (`kiro-sdlc-agents/webview-assets/chat`) no longer exists — edit the served file only.
6. Tests: `tool-event-tracker.test.ts` (extraction/truncation/join), `chat/engine/__tests__/tool-result-mapping.test.ts` (5 mapping cases incl. empty-result + id-less), `webview/__tests__/tool-result-store.test.ts` (completeToolCall/failToolCall semantics). Green: 64 files/571 tests, tsc, eslint.
7. **Approval banner (separate, NOT done):** "Waiting approval: bash" comes from `ToolApprovalGate`/`createToolApprovalGateHandler`. Ensure read-only commands (`ls`) aren't force-blocked under Autopilot; verify `DANGEROUS_TOOLS` classification + session auto-approve.

**Acceptance for Fix F (PENDING UAT):** each finished tool shows its real output in RESPONSE (file contents for `read`, stdout for `bash ls`), not "(waiting...)"; failed tools show the error; zero-output tools show "(no output)".

## 5c. NEW BUGS after Fix F lands (2026-09-30) — tool results now render, but 3 new issues

Fix F worked: RESPONSE panels now show real output (README contents, bash stdout). Three follow-up bugs observed:

### Bug G — model emits Windows `cmd` syntax into the Git-Bash `bash` tool + path backslashes are lost
Evidence: `REQUEST {"command":"dir /b c:\\projects\\kiro\\SDLC-Agents-4-Enterprise"}` →
```
dir: cannot access '/b': No such file or directory
dir: cannot access 'c:projectskiroSDLC-Agents-4-Enterprise': No such file or directory
Command exited with code 2
```
Two faults: (a) `dir /b` is cmd.exe; the `bash` tool runs **Git Bash**, where `dir` is the Unix coreutil (no `/b`, and `/b` is read as a path). (b) The Windows backslashes collapsed (`c:\\projects` → `c:projectskiro…`) — backslash is an escape char in bash. Result: 11 of 35 tool calls failed (UI header "24✓ 11✗").
**Fix G (prompt + guidance):** in `buildWorkspaceSystemPrompt` and/or the bash tool description, instruct: the shell is **POSIX Git Bash on Windows** — use `ls`/forward-slash paths, never `dir`/`cmd` syntax; prefer the dedicated `ls`/`read`/`grep`/`find` tools over `bash` for file exploration (the prompt already says this — reinforce and add the shell-dialect note + a path example). Do NOT try to auto-translate cmd→bash (fragile). This is guidance, not a hard code path.

### Bug H — every failed tool spawns a big message-level red "Error: Tool 'X' failed" bubble (spam)
Evidence: screens full of standalone `PI  Error: Tool 'bash' failed` / `Tool 'ls' failed` bubbles.
**Root cause:** `pi-event-mapper.ts` `mapAgentEvent()` last branch pushes a message-level `error` chunk for EVERY `tool_execution_end && isError`:
```ts
if (event.type === 'tool_execution_end' && event.isError) {
  collector.errorMessage = collector.errorMessage || msg;
  collector.chunks.push({ type: 'error', error: msg });  // ← becomes a STREAM_ERROR bubble per failed tool
}
```
That `error` chunk is streamed (`runTurnOnce` → `emitError` → `STREAM_ERROR`) as a top-level bubble. With Fix F, the failure ALSO travels via `chat:toolCallUpdate{isError}` → should become `MCP_TOOL_RESULT{error}` attached to the tool's own RESPONSE. So the error is now double-surfaced, and the message-level bubble is noise.
**Fix H:** stop pushing the per-tool `error` chunk in `mapAgentEvent` — a failed tool must show its error INSIDE its own tool block RESPONSE (via `MCP_TOOL_RESULT{error}`), not as a separate message bubble. Keep `collector.errorMessage` only for a genuine turn-fatal error (if needed), not per-tool. Verify `failToolCall` fills the tool's RESPONSE with the error text.

### Bug I — still hits the 35-tool-call / turn timeout "Stopped early"
This is a CONSEQUENCE of Bug G: the model repeats the same malformed `dir`/`ls` command, each fails, it retries → burns the tool budget → timeout. Fixing G (correct shell guidance) should largely resolve it. Additionally consider: the existing `TurnBudgetGuard` steer/abort on repeated identical tool calls should catch repeated FAILING calls too — verify a tool that fails the same way N times triggers steer/abort early instead of looping to the 35-call cap.

**Acceptance for G/H/I:** commands succeed under Git Bash (no `dir`/backslash failures); a failed tool shows its error in its own RESPONSE with NO separate message bubble; repeated identical failures steer/abort early instead of timing out at the tool-call cap.

**✅ G/H/I IMPLEMENTED (2026-09-30):**
1. **Fix G (prompt + tool description):** `buildWorkspaceSystemPrompt` now states the shell contract explicitly — `POSIX Git Bash on Windows — NOT cmd.exe/PowerShell`, `use ls (never dir /b)`, `FORWARD slashes (c:/projects/...) — backslashes are escape characters and get eaten`, plus a worked example (`ls 'c:/projects/my-repo' instead of dir /b c:\projects\my-repo`) and the prefer-ls/read/grep/find line (`pi-coding-tools.ts`). New `withBashDialectHint(tool)` (same spread-wrapper pattern as `withNotFoundHint`) prepends the same note to the **bash tool description** so it reaches the model at tool-selection time (idempotent; legacy path only — the session path creates tools by name, but it receives the shared system prompt via `appendSystemPrompt`, so both paths are covered). No cmd→bash auto-translation (fragile; explicitly rejected).
2. **Fix H (no message-level bubble per failed tool):** `mapAgentEvent()`'s `tool_execution_end && isError` branch **removed entirely** (`pi-event-mapper.ts`) — it pushed a `{type:'error'}` chunk (→ `runTurnOnce` `emitError` → red `STREAM_ERROR` bubble per failure) AND set `collector.errorMessage` (→ executor `PI_EXECUTION_ERROR` → a SECOND `chat:error` bubble + the assistant reply being dropped from history). The failure now surfaces ONLY via Fix F's chain: `ToolEventTracker` → `chat:toolCallUpdate{isError}` → `MCP_TOOL_RESULT{error}` inside the tool's own RESPONSE. Genuine turn-fatal errors still flow via `agent.state.errorMessage`. Applies to BOTH paths (legacy + session) since both call `mapAgentEvent`.
3. **Fix I (repeated identical FAILURES trip the guard):** `TurnBudgetGuard.observeToolFailure(name, errorText)` — signature = `fail:<tool>:<first error line>` (normalized, first line only, ≤160 chars) so the same failure trips **even when the model varies the args** (the 11× `dir /b <varying path>` case never matched the identical-args signature). Same two-tier ladder: steer at N (`buildFailureSteerCorrection` — names the tool, the Git-Bash dialect, ls-not-dir, forward slashes, prefer ls/read/grep/find), abort on persistence. Wired in `PiProvider.promptOnCurrentModel` subscribe on `tool_execution_end && isError` (`extractToolResultText(event.result)`); steer/abort effectors refactored into shared `steerWith`/`abortRun` closures. **Known gap:** the session path (`pi-agent-session-host.ts`) has NO TurnBudgetGuard at all (pre-existing) — failure guard is legacy-path only for now.
4. Tests: `tool-event-tracker.test.ts` BUG H describe (3), `turn-budget-guard.test.ts` (5: varying-args ladder, first-line keying, no-text keying, per-tool independence, correction content), new `pi-coding-tools.test.ts` (5: prompt contract + wrapper prepend/idempotent/pass-through), `pi-provider-runtime-smoke.test.ts` Bug I integration (real SDK + faux model + always-failing tool with VARYING args → stop note "Stopped early … loop guard", <10 calls). Green: **65 files / 584 tests**, tsc clean, eslint clean.

**Acceptance (2026-09-30, code-level):** all four test suites above green; full subset 65/584; tsc + lint clean. **PENDING UAT:** no red `Error: Tool 'X' failed` message bubbles (failures render only inside the tool RESPONSE); no `dir /b`-style failures after prompt reload (else steer note appears after N identical failures instead of the 120s timeout); turn does NOT reach the 35-call timeout on repeated failures.

## 5d. CURRENT BLOCKER (2026-09-30, after Fix F/H) — turn "stops" mid-way waiting for bash approval

Fix H worked (failed tools no longer spawn message-level red bubbles; errors show in the tool's own RESPONSE). But the turn now **hangs** with a persistent top banner **"Waiting approval: bash (auto-rejects on timeout)"** (Cancel / Follow buttons only). read/ls/find/grep run fine; every `bash` call blocks.

**Root cause (confirmed via code) — Autopilot mode is never wired to the approval gate:**
- `pi-workflow-gate.ts` `createToolApprovalGateHandler`: only `READ_ONLY_TOOLS = {read,grep,find,ls}` auto-approve. `bash` (not read-only) ALWAYS goes to `approvalGate.requestApproval()` and blocks. **The handler does not receive the Autopilot/Supervised mode at all.**
- `message-handler.ts` stores `currentMode: AutopilotMode = "autopilot"` and updates it on `chat:setMode`, but that mode is **never passed to the gate handler** (built once in `PiWorkflowAdapter` ctor with no mode). So even in Autopilot, `bash` blocks.
- The UI banner offers no working **Approve** action wired to `chat:toolApproval → gate.resolveApproval(toolId,'approve')` (only Cancel/Follow). So the pending promise is never resolved by the user.
- `ToolApprovalGate` then hits `handleTimeout` → auto-**reject** → `bash` fails → the model retries another `bash` → blocks again → the turn stalls until the turn/tool-budget timeout. That is the observed "stops mid-way".

**Fix J — honor Autopilot in the gate (primary):**
1. Thread the current mode into the gate handler. Options: pass a `getMode()` callback into `createToolApprovalGateHandler` (read the live `currentMode`), or have `MessageHandler.chat:setMode` update a shared flag the adapter/gate reads. In **Autopilot**, `requestApproval` returns `{approved:true, reason:'autopilot'}` for non-destructive tools (`bash`, `write`, `edit`) — matching Kiro's Autopilot semantics (user can revert). In **Supervised**, keep the block-and-ask behavior.
2. Even in Supervised, the UI MUST expose a working **Approve/Reject** control that sends `chat:toolApproval{toolId, decision}` → `gate.resolveApproval`. Verify the banner buttons are wired (currently only Cancel/Follow are visible). Without this, Supervised is unusable (always times out to reject).
3. Keep read-only tools auto-approved in both modes (already correct).
4. Consider still requiring explicit approval for truly destructive ops (`delete_file`, `git_push`, `shell rm -rf …`) even under Autopilot — align with `DANGEROUS_TOOLS`/`ToolApprovalClassifier`. `bash ls`/`bash cat` should NOT be treated as destructive.

**Acceptance for Fix J:** under Autopilot, `bash` runs without a pending-approval banner; the turn completes without stalling on approval. Under Supervised, the banner shows Approve/Reject and clicking Approve runs the tool. read/ls/grep/find still auto-approve.

**✅ Fix J IMPLEMENTED (2026-09-30):** approval moved to **PRE-execution** via the pi-agent-core SDK's native `beforeToolCall` hook + mode-aware gate:
1. **Mode wiring:** `PiWorkflowAdapter.setAutopilotMode()` (default `autopilot`) + `getMode` callback into `createToolApprovalGateHandler`; `MessageHandler` forwards `chat:setMode` → `engine.setAutopilotMode()`. Decision order in the gate (`pi-workflow-gate.ts`): read-only (`read/grep/find/ls/get_workspace_info`) → auto in BOTH modes → remembered patterns → auto → **destructive (`ToolApprovalClassifier`: delete_file, git_push, git_*) → block even under Autopilot** → **Autopilot + non-destructive (bash/write/edit) → auto-approve, gate never touched** → Supervised → block-and-ask. No `getMode` wired = defaults to **supervised** (fail-secure).
2. **True pre-execution gating:** `PiProvider.setToolApproval()` + `beforeToolCall: (ctx) => this.gateBeforeToolCall(ctx)` in `new Agent({...})` — hook runs after `tool_execution_start` but BEFORE the tool body; `{block:true, reason}` turns into an error tool result the model sees (and Fix F renders in the RESPONSE). Fail-closed on approval-system errors. Engine ctor wires `gateHandler → createReplaySafeApprovalHandler (ApprovalAdapter replay guard, SEC-289-02) → provider.setToolApproval`. **Removed the old POST-turn approval loop** in `PiWorkflowEngine.executeTurn` (tools had already executed; each pending bash then serially blocked until gate timeout → the UAT "stops mid-way" hang; also produced `TOOL_APPROVAL_REJECTED` turn errors).
3. **Supervised UI (Approve/Reject on the banner):** new ext→webview `chat:toolApprovalPending {toolId, toolName}` emitted from `onApprovalPending` (which now also receives `toolUseId`); `ChatHtmlBuilder` working bar gains hidden `#approve-btn`/`#reject-btn` (`webview-assets/chat/index.html` kept in sync — ChatHtmlBuilder is the served HTML); `chat.js` shows them on the pending message, posts `chat:toolApproval{toolId, decision}` on click (existing handler → `gate.resolveApproval`), refreshes the stale "Waiting approval" label, and hides them on turn end / terminal tool status / timeout. ids align: gate key = `toolCall.id` = `tool_execution_start.toolCallId` = `chat:toolCall.id`.
4. Tests: `pi-workflow-gate.test.ts` +5 (Autopilot approves bash/write/edit without gate, Supervised still blocks, destructive blocks in Autopilot, read-only incl. get_workspace_info both modes, default-supervised fail-secure) + pending-callback 2-arg fix; `pi-provider.test.ts` +5 (pass-through, approve→undefined, reject→block+reason, toolUseId/input threading, fail-closed on throw); `pi-workflow.test.ts` rewritten (engine wires gate into provider, replay guard rejects 2nd use of same toolUseId, toolCalls pass through, no TOOL_APPROVAL_REJECTED). Green: **65 files / 594 tests**, tsc + eslint clean.

**Acceptance (2026-09-30, code-level):** all Fix J tests green; full subset 65/594; tsc + lint clean. **PENDING UAT:** under Autopilot a `bash` call executes immediately with NO "Waiting approval" banner and the turn finishes; destructive tools (delete/git push) still prompt; under Supervised the bar shows Approve/Reject — Approve runs the tool, Reject produces "Rejected" in the tool RESPONSE and the turn continues; read/ls/grep/find never prompt. **Known gaps:** session path (`createAgentSession`) has no approval gate (pre-existing, same class of gap as TurnBudgetGuard — legacy path covered); gate default is supervised when `getMode` is unwired (tests/DI only — the adapter always wires it).

## 5e. CURRENT STATE (2026-09-30, after Fix J) — tools work; two remaining issues

Fix J confirmed by UAT: NO approval banner, `bash` runs under Autopilot, **35 TOOL / 9 FILE — 42✓ 2✗** (tool execution is healthy now). Two remaining, both minor vs. earlier bugs:

### Bug K1 — ✅ RESOLVED (2026-09-30): wall-clock timeout DISABLED by default (repeat-only stop)
**Product decision:** a turn must NOT be stopped by elapsed time — only when the result stops changing (repetition). Implemented:
- `turn-budget-guard.ts`: `DEFAULT_TURN_TIMEOUT_MS = 0` (was 120_000). `resolveDefaults` now honors `timeoutMs >= 0` verbatim (0 = disabled). `startTimeout()` no-ops (arms no timer) when `timeoutMs <= 0`. The repetition guard (`observeToolCall`/`observeToolFailure`/`observeTextBlock` → steer then abort) is unchanged and remains the ONLY stop condition by default.
- `pi-workflow-adapter.ts`: `sdlcAgents.backend.chatTimeout` now defaults to **0** (was 120000); `turnBudget.timeoutMs=0`. `trySessionTurn` only races a `PI_SESSION_TIMEOUT` when `timeoutMs > 0` (otherwise awaits the prompt directly — no backstop), so `timeoutMs=0` no longer instant-rejects.
- `package.json`: `sdlcAgents.backend.chatTimeout` default 0 + description "0 = DISABLED; stops only on loop guard; set >0 to opt into a wall-clock backstop".
- Tests: `turn-budget-guard.test.ts` +2 (timeout disabled at 0 and by default never trips over 10 min; repeat guard still trips with timeout off). Full `src/pi-workflow` green (26 files / 176 tests); tsc clean.
- **Trade-off (accepted):** with no wall-clock backstop, a genuinely hung provider (SDK never returns, no repeat signal) would run indefinitely. Mitigation: the repeat guard catches looping models; a user can Cancel; opt back into a backstop via `chatTimeout > 0`.

<details><summary>Original K1 analysis (superseded)</summary>

Evidence was `Stopped early: Stopped after the turn timeout with 44 tool calls.` — the guard's stop reason was `timeout` (wall-clock), NOT `repeat`; 44 legit calls (42✓) simply exceeded 120s. Options considered: raise default / make it configurable / keep 120s. Final decision above: disable by default.
</details>

#### (historical) Bug K1 — 120s turn timeout is too short for a whole-repo review
Evidence: `Stopped early: Stopped after the turn timeout with 44 tool calls.` The guard's stop reason is **`timeout`** (wall-clock), NOT `repeat` — the 44 calls are legit and mostly succeed (42✓). `TurnBudgetGuard` has **no fixed tool-call cap**; it only trips on identical-signature repeats or `DEFAULT_TURN_TIMEOUT_MS = 120_000` (120s). A full "review toàn bộ project" of a large repo simply needs >120s / a chunked strategy.
**Options (pick per product intent):**
- Raise the default (or let `sdlcAgents.backend.chatTimeout` — already read in `runTurnOnce` — drive it; verify the setting is actually plumbed into `turnBudget.timeoutMs`). A large-repo review may need 300-600s.
- Keep 120s but make the stop-note actionable (it already suggests "narrow the scope / ask for a summary"). This is arguably WORKING AS INTENDED — a whole-repo review is genuinely large; the guard prevents an unbounded turn. Consider a repo-review pattern that works folder-by-folder instead of one mega-turn.
- Do NOT remove the timeout backstop entirely (it prevents true runaway hangs).

### Bug K2 — "Request was aborted" red bubble duplicates the friendly stop-note
Evidence: after the "Stopped early…" note (correct, from `buildStopNote`), a separate red **"Request was aborted"** bubble also appears.
**Root cause:** on guard timeout, `trip('timeout')` → `onAbort()` → `agent.abort()`. `promptOnCurrentModel`'s catch returns partial+note WHEN `guard.stoppedReason` is set — but the abort rejection also surfaces elsewhere as a `chat:error` ("Request was aborted", an undici/SDK abort message), producing a SECOND, error-styled bubble on top of the intended stop-note.
**Fix K2:** when the turn ended due to a guard trip (`guard.stoppedReason` set) OR the error is an abort triggered by our own `agent.abort()`, **suppress the `chat:error`** — the friendly `buildStopNote` already communicates it. Detect via `guard.stoppedReason` in `runTurnOnce`/`collectResult`, or classify the abort message (name === 'AbortError' / "Request was aborted" / "aborted") and skip emitting `chat:error` when the abort was self-initiated. Acceptance: a guard-stopped turn shows ONLY the "Stopped early…" note, no red "Request was aborted" bubble.

## 6. Fix plan (prioritized)

### Fix E — ~~Make `@earendil-works/*` disk-resolvable~~ SUPERSEDED 2026-09-30 by the bundle-side fix below (both implemented as one; the externalize option was REJECTED)

**Original plan (rejected):** externalize `@earendil-works/*` to `external` in `esbuild.js` + ship `node_modules/` inside the `.vsix`. **Why rejected:** the monorepo hoists all deps to the *repo-root* `node_modules` (extension/node_modules contains only `.vite`), which is outside vsce's package directory (`../**` is excluded), and `.vscodeignore` excludes `node_modules/**`. Shipping would require restructuring the packaging layout — higher risk than the bundle-side fix.

**✅ Implemented instead — `import.meta` banner + define (`extension/scripts/esbuild-plugins/pi-import-meta.js`):**
1. esbuild `banner` declares `__PI_IMPORT_META_URL = require("url").pathToFileURL(__filename).href` (real bundle path, valid in CJS) and `__PI_IMPORT_META_RESOLVE` (resolves with pi's `import` conditions, falls back to pi-coding-agent's package dir for nested `pi-tui`/`typebox`, returns `file://` href).
2. esbuild `define` rewrites `import.meta.url` / `import.meta.resolve` bundle-wide (`extension/src` has zero `import.meta` usage → safe). Wired in `esbuild.js` (dev + `--production`) and `scripts/smoke-bundle/run-smoke.js`.
3. Smoke bundle is emitted *inside the repo* (`scripts/smoke-bundle/out/`, vsix-excluded) so runtime `require.resolve` from `createRequire(import.meta.url)` walks up into root `node_modules`, same as `out/extension.js` does in dev.
4. Regression gate: `npm run smoke:bundle` must stay 10/10 green — **re-verify when bumping `@earendil-works/pi-coding-agent`** (banner mirrors pi's internal path logic: `config.js` fileURLToPath, `loader.js` createRequire/`getAliases`/`resolveWorkspaceOrImport`).

**Acceptance (2026-09-30):** `npm run smoke:bundle` → `SMOKE PASSED` (import + 7 tools + loader trivial .js/.ts extensions, errors empty); vitest 44 files/314 tests green; tsc clean; `sdlc-agents-4-enterprise-1.46.3.vsix` packaged + installed. **PENDING UAT:** `[Chat] turn via=legacy ... tools=7`, no `[PiCodingTools] create tools failed` / `[PiExtensionRuntime] load failed` in the Output log, review task actually reads files.

**Known limitation (NOT part of this fix — enhancement packages only, core 7 tools unaffected):** the 6 `PI_EXTENSION_PACKAGES` (webfetch/todo/subagents/aft-pi/…) load in **dev** (bundle's `require.resolve` walks up to repo-root `node_modules`) but **skip in the installed VSIX** — `.vscodeignore` ships no `node_modules`, so pi loader's `getAliases()` can't resolve `typebox`/pi packages on disk from `out/extension.js`, and `loader.js`'s `piCodingAgentEntry = path.resolve(__dirname,'../..','index.js')` derives a garbage path when bundled (no existence check in pi's source). Full fix = ship a minimal `out/node_modules` subset + make pi's alias derivation bundle-aware (or externalize pi) — separate task. Extensions importing `@earendil-works/pi-coding-agent` are skipped in both modes for the same reason. Skip is logged per-package (`skipped[]`), never throws — chat + the 7 built-ins are unaffected.

### Fix A — Detect zero-tool turns EARLY + tell the user (defensive, after Fix E)
Runtime shows the turn wastes the full 120s timeout with 0 tool calls (§2a). Two parts:

1. **Confirm tool schemas are sent — DO THIS FIRST (checklist #4 + §0 item 1).** Read the `[Chat] turn via=legacy ... tools=N` log. If **N == 0**, the harness built no tools (likely `createWorkspaceTools()` swallowed a `@earendil-works/pi-coding-agent` load error → `[]`) — fix the wiring so N == 7. A tool-capable model (Ornith IS one) cannot call tools that were never offered. Only if **N > 0** and the model still doesn't call them, inspect the actual `/v1/chat/completions` request body (does it contain `tools`?) and the tool-call parsing on the response.
2. **Early exit + clear notice instead of a 120s hang.** In `promptOnCurrentModel` / `collectResult`, when a turn ends (or is about to time out) with `guard.stats.totalCalls === 0` AND the assistant text contains shell/markdown command fences (heuristic: fenced ```bash / ```sh / ```powershell, or lines like `cat `/`ls `/`Get-Content `/`echo ... &&`):
   - Surface a non-blocking notice via the existing `chat:error`→`STREAM_ERROR` path (mapped in `ChatEngineAdapter.toStreamEvent`, ~line 253). Word it around the ACTUAL cause: if N==0 → "no tools were offered to the model this turn (harness/tool-load issue)"; if N>0 → "the model returned commands as text; check tool-call parsing for this endpoint / model".
   - Consider detecting repeated identical text blocks (model self-repetition, §2b) to abort BEFORE the timeout rather than after 120s — a simple "same assistant paragraph emitted N times" guard.
- Do NOT auto-execute commands parsed from text (security: never run model-emitted shell strings implicitly).

### Fix B — Session path must register the full tool set ✅ DONE (1.46.3)

Implemented as an explicit `tools` allowlist (`read,write,edit,bash,grep,find,ls` + discovered extension names + `get_workspace_info`, deduped, unconditional), NOT as 7 extra `customTools` (that would duplicate same-named builtins the session already creates cwd-bound). Degraded mode (extension discovery fails) keeps the 7 core tools and only drops enhancement tools. Test: `pi-agent-session-host.test.ts` allowlist cases.

### Fix C — Model capability guard (defensive)
- Maintain a small allow/deny hint: known text-only model id patterns (e.g. `-text`, plain `qwen`/`llama` instruct ids without tool support) → on turn start, if the configured model matches and the provider can't do tools, warn the user up front instead of after a wasted turn.
- Keep it a hint, not a hard block (endpoints vary).

### Fix D — System prompt hardening (cheap)
- In `buildWorkspaceSystemPrompt`, add an explicit instruction: "Use the provided tools (function calls) to read files and run commands. Do NOT print shell commands as text; call the tools instead." Helps borderline models; no effect on truly incapable ones.

## 7. Acceptance criteria

- With a **tool-capable** model: "Review toàn bộ project" triggers real `read`/`ls`/`grep` tool calls and produces a complete review (no bare bash narration).
- With a **non-tool** model (`qwen-text`): the turn still completes quickly (does not burn the full 120s), and the user sees a clear notice that the model can't use tools + how to fix. No silent half-answer.
- Session path (cloud provider) exposes the full 7-tool set via allowlist; test passes. ✅ (1.46.3)
- No model-emitted shell text is ever auto-executed.
- `tsc --noEmit` clean; affected vitest suites green; add tests for the zero-tool notice and session tool registration.

## 8. Note on workaround — switching model does NOT help

The root cause is `tools=0` from a **bundling defect** (`import.meta` emptied by esbuild CJS output — fixed 2026-09-30 via banner+define, §6 Fix E), not model capability. Ornith-1.0-9B is already tool-capable. Switching to another local model would have hit the same `tools=0` (the harness shipped no tools to ANY model on the legacy path in the packaged build). There is **no user-side workaround** — the fix must ship. (Running from source / unbundled dev mode worked because `import.meta.url` is preserved in plain ESM — which is why this was not caught before packaging.)

## 9. Key files

| File | Role |
|------|------|
| `extension/src/pi-workflow/pi-workflow-adapter.ts` | `runTurnOnce` (legacy), `trySessionTurn` (session), streaming emit |
| `extension/src/pi-workflow/pi-provider.ts` | `promptOnCurrentModel`, `collectResult` — SDK tool loop + done chunk |
| `extension/src/pi-workflow/turn-budget-guard.ts` | `TurnBudgetGuard`, `buildStopNote` — the "0 tool calls" timeout note |
| `extension/src/pi-workflow/pi-agent-session-host.ts` | session `createAgentSession` — **allowlist carries the full 7 (fixed 1.46.3; do NOT add 7 customTools duplicates)** |
| `extension/src/pi-workflow/pi-coding-tools.ts` | `createWorkspaceTools` (7 tools), `buildWorkspaceSystemPrompt` |
| `extension/src/pi-workflow/pi-event-mapper.ts` | maps SDK events → chunks/toolCalls (only `tool_execution_start` counts) |
| `extension/src/pi-workflow/pi-provider-config-bridge.ts` | `providerRequiresApiKey` → path selection |
| `extension/src/chat/engine/ChatEngineAdapter.ts` | `chat:error` → `STREAM_ERROR` mapping (use for the user notice) |
| `extension/src/mcp/providers/openai-provider.ts` | confirm tool schemas are sent in the request body |
