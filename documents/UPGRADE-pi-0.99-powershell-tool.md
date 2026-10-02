# Upgrade Guide — pi-coding-agent 0.80.10 → 0.99.1 + native PowerShell tool

> **Handoff document for the implementing AI/agent.** Goal: replace the fragile Windows Git-Bash workaround with PI's **native `powershell` tool** (available from pi-coding-agent ≥ ~0.9x, confirmed present in 0.99.1). This requires upgrading the whole `@earendil-works/*` cluster. Read §0 and §1 fully before touching code. Do the work on a branch; this is a high-risk major-ish bump (0.80 → 0.99, 19 minor releases).

---

## 0. Why (context)

- The chat `bash` tool comes from `@earendil-works/pi-coding-agent`. On this Windows machine there is **no Git Bash in Program Files**; `where bash.exe` resolves to WSL/other bash that does not understand `c:/...` drive paths → every path command failed → the model looped → the turn aborted. We already shipped stopgaps in 1.46.5/1.46.6 (pin scoop Git Bash via `shellPath`, and a `spawnHook` that rewrites `c:\`/`c:/` → `/c/`). These are workarounds.
- **Root-cause fix chosen by product owner:** use PI's **native PowerShell tool** so the model runs Windows-native commands (`pwsh.exe`, path `c:\...` or `c:/...` both work) with NO dialect translation. This tool does NOT exist in the installed **0.80.10**; it exists in **0.99.1** (`createPowerShellTool`, `ToolName` now includes `"powershell"`).

### Evidence (verified)
- Installed now: `@earendil-works/pi-coding-agent@0.80.10` (dist-tags `latest`=0.99.1, `legacy-node20`=0.74.2). Its `core/tools/index.d.ts` `ToolName = "read"|"bash"|"edit"|"write"|"grep"|"find"|"ls"` — **no powershell**.
- 0.99.1 `core/tools/index.d.ts` (via unpkg): exports `createPowerShellTool`, `createPowerShellToolDefinition`, `createLocalPowerShellOperations`, `PowerShellToolOptions`; `ToolName = "read"|"bash"|"powershell"|"edit"|"write"|"grep"|"find"|"ls"`.
- 0.99.1 `powershell.d.ts`: `createPowerShellTool(cwd, options?)` where `PowerShellToolOptions = Pick<BashToolOptions,"operations"|"exposeSessionEnvironment"|"spawnHook">` (⚠️ **no `shellPath`** — it self-resolves pwsh.exe → Windows PowerShell). System-prompt contribution: `powershellToolSystemPromptContribution` = "Execute PowerShell commands".
- 0.99.1 also exports `getPowerShellConfig`/`getShellConfig` (utils/shell), `isPowerShellToolResult`, event `PowerShellToolCallEvent`.
- PI CLI docs confirm the tool exists and its semantics (pwsh.exe → Windows PowerShell fallback, `-NoProfile -NonInteractive -ExecutionPolicy Bypass`): https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/windows.md . Note the CLI enables it via `~/.pi/agent/settings.json` `defaultTools` — but THIS project does NOT use the CLI; it calls the SDK factories directly, so we enable it by calling `createPowerShellTool(...)`.

---

## 1. Dependency bump (do first, all in lockstep)

0.99.1 pulls a LARGER cluster than 0.80.10. Bump ALL to the same `0.99.1` (or `^0.99.1`) so peers match — mismatched peers cause "two copies of pi-agent-core" type failures.

| package | 0.80.10 has | 0.99.1 requires |
|---|---|---|
| `@earendil-works/pi-coding-agent` | — | `0.99.1` |
| `@earendil-works/pi-agent-core` | `^0.80.10` | `^0.99.1` |
| `@earendil-works/pi-ai` | `^0.80.10` | `^0.99.1` |
| `@earendil-works/pi-tui` | `^0.80.10` | `^0.99.1` |
| `@earendil-works/chord` | (none) | `^0.99.1` (NEW transitive) |
| `@earendil-works/pi-mcp` | (none) | `^0.99.1` (NEW transitive) |
| `@earendil-works/pi-codemode` | (none) | `^0.99.1` (NEW transitive) |

Steps:
1. Find where these are declared. They are hoisted to the **repo-root** `node_modules` (extension/node_modules holds only `.vite`), so the dependency is likely declared in the **root `package.json`** (or a workspace). Check both `extension/package.json` and root `package.json` for `@earendil-works/*` entries; update whichever declares them to `0.99.1`.
2. Update the pinned version comments in code that say `0.80.10` (e.g. `pi-coding-tools.ts` "Static dep pinned to 0.80.10", `pi-extensions.config.ts` `version: '0.80.10'`, `pi-agent-session-host.ts` comments).
3. `npm install` (respect the repo's package manager / lockfile). Confirm a single resolved version: `npm ls @earendil-works/pi-agent-core` must show one version everywhere (no duplicate trees). Duplicate `pi-agent-core` = `instanceof`/type breakage in the `Agent`/tool wiring.
4. Verify Node engine: check 0.99.1 `engines.node`. The `legacy-node20` dist-tag hints 0.99.x may require Node ≥ 22. If the build/runtime is Node 20, either use `@0.99.1` only if it supports 20, or coordinate a Node bump. **Confirm before proceeding.**

---

## 2. API-surface risk audit (verify each still compiles at 0.99.1)

The project uses DEEP SDK API. After the bump, `tsc --noEmit` will flag breakage. Check these call sites (all still exported in 0.99.1 per the index.d.ts audit, but signatures/types may have shifted):

| API used | File | Notes for 0.99.1 |
|---|---|---|
| `new Agent({ streamFn, getApiKey, sessionId, beforeToolCall })` | `pi-provider.ts` | `Agent` from `pi-agent-core`; verify ctor options unchanged (esp. `beforeToolCall`, `streamFn(model,context,options)`). |
| `agent.subscribe`, `.prompt`, `.steer`, `.abort`, `.waitForIdle`, `.state.tools/.systemPrompt/.model/.isStreaming/.messages` | `pi-provider.ts` | Verify `AgentState` shape + event names (`message_update`, `tool_execution_start/end`) unchanged. 0.99.1 adds many typed events (`ToolExecutionStartEvent`, `PowerShellToolCallEvent`, …) — event payloads may be richer but should stay back-compat. |
| `BeforeToolCallContext`, `BeforeToolCallResult`, `AgentEvent` | `pi-provider.ts`, `pi-event-mapper.ts` | Confirm these types still exist in `pi-agent-core` 0.99.1. |
| `builtinModels`, `InMemoryCredentialStore`, `MutableModels`, `CredentialStore` | `pi-provider.ts` | from `pi-ai`. `builtinModels({credentials})`, `models.streamSimple/getModel/getModels/setProvider`. |
| `createProvider`, `envApiKeyAuth`, `Provider` | `pi-gateway-provider.ts` | from `pi-ai`. `createProvider({id,name,baseUrl,auth,models,api})` + `openAICompletionsApi()`/`anthropicMessagesApi()` lazy imports. |
| `createAgentSession({cwd,modelRuntime,model,resourceLoader,sessionManager,settingsManager,customTools})` | `pi-agent-session-host.ts` | 0.99.1 exports `createAgentSession` + `CreateAgentSessionOptions`/`CreateAgentSessionResult`. Verify the options object still matches (esp. `customTools`, `resourceLoader`). |
| `getAgentDir`, `ModelRuntime.create`, `SettingsManager.create`, `SessionManager.create`, `DefaultResourceLoader` | `pi-agent-session-host.ts` | all still exported in 0.99.1 index.d.ts. Verify `.create(...)` signatures. |
| `createEventBus`, `discoverAndLoadExtensions`, `wrapRegisteredTools` | `pi-extension-runtime.ts` | all still exported. `discoverAndLoadExtensions` signature may have changed — check args. |
| `createBashTool`, `createReadTool`, `createWriteTool`, `createEditTool`, `createGrepTool`, `createFindTool`, `createLsTool` | `pi-coding-tools.ts` | unchanged names; `BashToolOptions` still has `shellPath`/`spawnHook`. |
| `ToolDefinition`, `toSessionToolDefinition` shape | `workspace-info-tool.ts` | verify `ToolDefinition` fields (name/label/description/parameters/execute) unchanged. |

**Process:** bump → `npx tsc --noEmit -p extension/tsconfig.json` → fix each error against the 0.99.1 `.d.ts` (fetch from `https://unpkg.com/@earendil-works/pi-coding-agent@0.99.1/dist/...` and the peer packages). Do NOT `as any` past type errors — a silent shape change here reintroduces the "0 tools"/"no stream" class of bugs.

---

## 3. Wire the PowerShell tool (the actual feature)

Decision: on **Windows**, use `powershell` as the model-facing shell tool INSTEAD of `bash`. On non-Windows keep `bash`. PowerShell understands `c:\...` and `c:/...` natively → **remove the Git-Bash `shellPath` pin and the `normalizeBashCommandPaths` spawnHook workaround** for the Windows path (keep bash for Unix).

### 3a. `extension/src/pi-workflow/pi-coding-tools.ts` — `createWorkspaceTools`
Replace the bash-only shell tool with an OS-aware choice:
```ts
const m = await import('@earendil-works/pi-coding-agent');
const isWin = process.platform === 'win32';
// Windows → native PowerShell (pwsh.exe → Windows PowerShell). No shellPath,
// no path translation: PowerShell accepts c:\ and c:/ paths directly.
// Unix → bash.
const shellTool = isWin
  ? m.createPowerShellTool(workspaceRoot)
  : m.createBashTool(workspaceRoot);
const core = [
  m.createReadTool(workspaceRoot),
  m.createWriteTool(workspaceRoot),
  m.createEditTool(workspaceRoot),
  shellTool,
  m.createGrepTool(workspaceRoot),
  m.createFindTool(workspaceRoot),
  m.createLsTool(workspaceRoot),
].filter(Boolean) as unknown as AgentTool[];
```
- The tool's `name` will be `"powershell"` on Windows (was `"bash"`). **This is important** — every place keyed on the tool name `"bash"` must also handle `"powershell"` (see §4).
- **Delete/retire** `resolveGitBashPath()` + `normalizeBashCommandPaths()` + the `shellPath`/`spawnHook` bash wiring IF Windows now uses PowerShell. Keep them only if you still want a bash fallback. Recommended: keep bash for non-Windows, drop the Git-Bash workaround entirely on Windows.
- The `withBashDialectHint` (the "POSIX Git Bash … use ls not dir /b … forward-slash paths" note) is now WRONG for PowerShell. Replace with a PowerShell dialect note (or rely on the SDK's `powershellToolSystemPromptContribution` = "Execute PowerShell commands"). See §5.

### 3b. Approval gate — read-only + destructive classification
`pi-workflow-gate.ts` `READ_ONLY_TOOLS = {read,grep,find,ls}` auto-approve; `bash` was the gated shell. Now the shell tool may be `powershell`. Update the gate so `powershell` is treated exactly like `bash` was:
- Non-destructive under Autopilot → auto-approve (matches Fix J).
- Destructive PowerShell (e.g. `Remove-Item -Recurse`, `rm`, git push) → still require approval under both modes. Update `ToolApprovalClassifier`/`DANGEROUS_TOOLS` if it keys on tool name `bash`.

---

## 4. Every place that hardcodes the tool name `"bash"` (grep + fix)

Because the Windows shell tool becomes `"powershell"`, search the whole `extension/src` for `'bash'` / `"bash"` and handle both. Known spots to check:
- `pi-workflow-gate.ts` — READ_ONLY vs gated classification.
- `pi-event-mapper.ts` — `mapAgentEvent` / `ToolEventTracker` (tool name only used for display + failure signature; should be fine but verify the failure-steer note text isn't bash-specific).
- `turn-budget-guard.ts` — `buildFailureSteerCorrection` hardcodes a bash/Git-Bash message ("If it is bash: the shell is POSIX Git Bash…"). Make it shell-aware (PowerShell vs bash) or generic.
- `StreamProtocolAdapter.ts` `classifyTool` / `ChatEngineAdapter` — tool-type classification for the UI (shell icon). Add `powershell` → shell type.
- `webview` tool rendering — the UI shows `TOOL bash`; it will now show `TOOL powershell`. Confirm the webview renders arbitrary tool names (it does — it just prints `name`), no hardcoded `bash` filter.
- Any test asserting tool name `'bash'`.

---

## 5. System prompt (`buildWorkspaceSystemPrompt`)

Current prompt is Git-Bash specific (forward slashes, `ls` not `dir /b`, backslash-escape warning). For PowerShell this is WRONG. Make it OS-aware:
- Windows/PowerShell branch: "The shell tool is Windows PowerShell (pwsh). Use PowerShell cmdlets (Get-ChildItem/Get-Content/Test-Path) or their aliases (ls/cat/dir all work). Windows paths work as-is (c:\\... or c:/...). Prefer the read/grep/find/ls tools over the shell for file exploration."
- Non-Windows branch: keep the bash note.
- Keep the shared guidance: build absolute paths from the workspace root verbatim; never guess the drive letter; execute tools, don't print commands.

---

## 6. Session path (`pi-agent-session-host.ts`) — cloud providers

The session path (`createAgentSession`) is used for key-requiring cloud providers. It builds builtins from the SDK. In 0.99.1, ensure the session's tool loadout ALSO uses PowerShell on Windows. Fix J notes the session tools come via an allowlist (`createAllToolDefinitions(cwd)`); with 0.99.1 that set now includes `powershell`. Decide the loadout: include `powershell`, exclude `bash` on Windows (or include both and let the model pick — but two shell tools may confuse a weak model; prefer one). Update the allowlist accordingly and its test.

---

## 7. Verification (must all pass before packaging)

1. `npm ls @earendil-works/pi-agent-core` → exactly one version (0.99.1), no duplicates.
2. `npx tsc --noEmit -p extension/tsconfig.json` → 0 errors. Fix real type breakage; no `as any` shortcuts.
3. `npx vitest run` in `extension/` → green. Update tests that asserted tool name `'bash'` / Git-Bash behavior / the removed `resolveGitBashPath`/`normalizeBashCommandPaths` (delete those tests if the functions are removed).
4. Add tests: on `platform==='win32'`, `createWorkspaceTools` includes a tool named `powershell` and NOT `bash`; on non-win32 includes `bash`.
5. Build: bump `extension/package.json` version (→ 1.46.7 or next), `npm run package:prod`, install the `.vsix` into Kiro (`kiro --install-extension <vsix> --force`), FULLY restart Kiro.
6. **UAT:** "Review toàn bộ project nhé" with model on the local endpoint. Expect: tools show `TOOL powershell` and `FILE read`, commands run against `c:\...`/`c:/...` with NO "No such file or directory", the review completes, and the turn stops only on real repetition (wall-clock timeout stays disabled — Fix K1). Confirm the Output log shows `tools=7` (or 8 with powershell) and no `[PiCodingTools] create tools failed`.

---

## 8. Rollback

If 0.99.1 breaks too much (API drift, Node engine, duplicate peers):
- `git checkout` the dependency + code changes; reinstall to restore 0.80.10.
- Keep the 1.46.6 workaround (pinned scoop Git Bash + `normalizeBashCommandPaths`) as the fallback — it already works on this machine (46✓ 1✗). The upgrade is an improvement, not a hotfix; the machine is not blocked without it.

## 9. Key files

| File | Change |
|---|---|
| root `package.json` (and/or `extension/package.json`) | bump all `@earendil-works/*` → 0.99.1 |
| `extension/src/pi-workflow/pi-coding-tools.ts` | OS-aware shell tool (powershell on win32); retire Git-Bash pin + spawnHook; PowerShell dialect note |
| `extension/src/pi-workflow/pi-workflow-gate.ts` | classify `powershell` like `bash` (autopilot auto-approve, destructive gated) |
| `extension/src/pi-workflow/turn-budget-guard.ts` | make `buildFailureSteerCorrection` shell-aware |
| `extension/src/pi-workflow/pi-agent-session-host.ts` | session tool loadout includes `powershell` on win32 |
| `extension/src/chat/engine/StreamProtocolAdapter.ts` | `classifyTool` maps `powershell` → shell |
| `extension/src/pi-workflow/pi-provider.ts` / `pi-event-mapper.ts` | verify against 0.99.1 Agent/AgentEvent types |
| `extension/src/pi-workflow/__tests__/*` | update/remove Git-Bash tests; add powershell-tool tests |
