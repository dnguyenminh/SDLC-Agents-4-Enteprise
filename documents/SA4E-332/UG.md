# User Guide — SA4E-332 Shared Kernel (`extension/src/mcp/`)

> Scope: where shared code lives after SA4E-332, how to import it, and how the
> `langgraph/` freeze is enforced. No behavior changed in this ticket (move-as-is).
>
> **Scope-narrow (SM decision 2026-09-27, decommission merge-first):**
> SA4E-332 YIELDS the Workflow Graph UI panel to SA4E-289 decommission.
> SA4E-332 scope is now kernel move (`langgraph/` → `mcp/`) + Pi cutover + freeze only.
> It does NOT re-point, move, or claim panel UI. Pure-graph data
> `workflow-graph-data.ts` stays at `extension/src/langgraph/workflow/workflow-graph-data.ts`
> for SA4E-289 to delete phase-by-phase; `panels/workflow-panel.ts` keeps its legacy
> `../langgraph/workflow/workflow-graph-data` import (temporary ESLint allowlist) until
> SA4E-289 deletes both files. BRD/FSD/TDD/STP/STC are NOT edited for this narrowing —
> the deviation (TDD DISC-04 panel relocation superseded) will be recorded in TEST-REPORT
> Phase 6 as a known deviation per SM.

## 1. Kernel layout

| Module | Path | Notes |
|--------|------|-------|
| Tool transport | `extension/src/mcp/mcp-bridge.ts` | `McpBridge`, `McpToolTimeoutError`; 60 s call / 10 s list timeouts |
| Canonical types | `extension/src/mcp/mcp-types.ts` | **Single owner** of `McpToolDefinition` |
| Pi adapter | `extension/src/mcp/mcp-bridge-caller.ts` | `McpBridgeCaller` adapts `callTool` → `callMcpWrapper` contract |
| LLM interface | `extension/src/mcp/llm-provider.ts` | `LlmProvider`, `LlmMessage`, `LlmResponse`, … |
| Streaming | `extension/src/mcp/stream-handler.ts` | `StreamHandler` (50 ms debounce, 100-msg cap) |
| Domain types | `extension/src/mcp/state-types.ts` | `SDLCPhase`, `PipelineStatus`, … |
| Providers | `extension/src/mcp/providers/*` | Factories + registry + SSRF URL guard |
| Context budget | `extension/src/mcp/context-budget.ts` | `BudgetCalculator`, `ThresholdGate` (WARN 85 % / REJECT 95 %) |

No barrel `index.ts` — use explicit deep imports (avoids re-export cycles).

## 2. How to import (cheat sheet)

```ts
import { McpBridge } from "../mcp/mcp-bridge";            // from src/pi-workflow/, src/chat-panel/, …
import { McpBridge } from "../../mcp/mcp-bridge";         // from src/panels/settings/
import type { McpToolDefinition } from "../mcp/mcp-types"; // from src/mcp/*.ts
import { createLlmProvider } from "../mcp/providers";     // factories
```

Chat-panel and settings-panel consumers (`ChatStatusManager.ts`, `chat-panel-provider.ts`,
`message-routing.ts`, `message-protocol.ts`, `SettingsPanel.ts`) import shared kernel
from `src/mcp/…` — these are mechanical consequences of the kernel move and stay.
They are NOT panel ownership; SA4E-289 may rewrite surrounding panel wiring freely.

`tool-registry.ts` (`langgraph/vscode/`) was kept by SA4E-332 for backward-compat during
phased deletion (`export type { McpToolDefinition };`) but has since been deleted by
SA4E-289 decommission (commit 1721971, merge-first). SA4E-332 does not own it.

`workflow-graph-data.ts` (pure-graph data, sole consumer `WorkflowPanel`) is NOT moved
to `panels/` — it stays at `src/langgraph/workflow/workflow-graph-data.ts` for SA4E-289
to delete. `WorkflowPanel` is orphan (unregistered from `WebviewPanelManager` by SA4E-289)
and pending deletion by SA4E-289.

## 3. Pi wiring (fail-closed)

```ts
import mcpBridgeExtension from "../pi-agent/extensions/mcp-bridge-extension";

mcpBridgeExtension({ pi }, {
  serverManager,        // REQUIRED — throws without it (no hardcoded-URL fallback)
  allowDynamicChaining, // default false → execute_dynamic_tool denied
  approvalHook,         // consent callback; mem_ingest + dynamic tool always gated
  auditLog,             // receives { toolName, argKeys, decision } (keys only, never values)
});
```

Policy order is frozen (SEC-324-03): chaining-deny → validate → chained-target
allowlist → approval → audit → transport (`McpBridge.callTool`).

## 4. Freeze rule (`langgraph/` is FROZEN)

- `extension/src/langgraph/README.md` — frozen notice.
- ESLint `no-restricted-imports` bans any new `langgraph/` import outside
  `src/langgraph/` (intra-legacy allowlisted until phased deletion; test dirs gated).
- Temporary exclusion (scope-narrow): `src/panels/workflow-panel.ts` keeps its legacy
  `../langgraph/workflow/workflow-graph-data` import until SA4E-289 deletes both files
  (explicit override in `eslint.config.js`, DO NOT extend).
- `npm run lint` = `npx eslint src/` (fixed for ESLint v9+ flat config, no `--ext`).
- A fixture import from `langgraph/` outside the allowlist FAILS lint with the
  `SA4E-332: langgraph/ is FROZEN …` message (proven in PR).

## 5. Troubleshooting

| Symptom | Cause / Fix |
|---------|-------------|
| `MCP Server is not running.` | `IServerManager.status !== "running"` (or null `port` for `listTools`); start/reconnect backend |
| `MCP tool '{name}' timed out after {ms}ms` | Default 60 s per call, 10 s for `tools/list`; caller sees Pi `mcp_error` with cause |
| `Tool call denied by approval: {tool}` | `approvalHook` resolved false (or missing → auto-approved except gated tools stay gated) |
| `Dynamic tool chaining is disabled/denied` | Opt in via `allowDynamicChaining: true` AND use an allowlisted inner `tool_name` |
| `Validation failed: …` | Params violate tool schema (e.g. missing required, >4000-char strings) |
| `Proxy Error: Cannot save base64 file …` | `_base64_file` response but no workspace open / disk write failed; no base64 leaked |
| Lint `no-restricted-imports` on your PR | Import from `extension/src/mcp/…` instead (see §2) |
| `Unknown LLM provider type` | Register in `provider-registry.ts` or pass a custom base URL |

## 6. FAQ

**Q: Where did `McpWrapperClient` go?**
A: Deleted. Pi transport is `McpBridge` (timeout + interceptors + availability
guard). `McpBridgeCaller` bridges the old `McpCaller` method name.

**Q: Can I add a file under `langgraph/`?**
A: No — FROZEN. Shared code goes to `src/mcp/`; pure-graph code is deleted
phase-by-phase under SA4E-289 follow-ups.

**Q: Who owns `McpToolDefinition`?**
A: `src/mcp/mcp-types.ts` only. Never re-declare it (test gate IT-10).

**Q: History of a moved file?**
A: All moves used `git mv`: `git log --follow -- <path>` shows full history.

## 7. Scope-narrow — files yielded to SA4E-289 decommission (free to delete/rewrite)

SA4E-332 does NOT touch these; SA4E-289 (merge-first) owns them:

| File | SA4E-332 position | Decommission action |
|------|-------------------|---------------------|
| `extension/src/panels/workflow-panel.ts` | Reverted to legacy `../langgraph/workflow/workflow-graph-data` import; orphan, ESLint-allowlisted until deletion | Delete (1721971 unregistered; next commit deletes file) |
| `extension/src/langgraph/workflow/workflow-graph-data.ts` | Restored to legacy location (revert of 5b05539 `panels/` move); pure-graph data | Delete phase-by-phase with `langgraph/` tree |
| `extension/webview-assets/workflow-graph.js` | Never touched by SA4E-332 | Deleted by SA4E-289 (1721971) |
| `extension/webview-assets/workflow-graph.css` | Never touched by SA4E-332 | Deleted by SA4E-289 (1721971) |
| `extension/src/chat-panel/ChatHtmlBuilder.ts` | Never touched by SA4E-332 | SA4E-289 removed Workflow button (1721971) |
| `extension/src/chat-panel/message-handler.ts` | Never touched by SA4E-332 | SA4E-289 removed `chat:openWorkflowGraph` case (1721971) |
| `extension/src/chat-panel/message-protocol.ts` | SA4E-332 only re-pointed `../mcp/state-types` import (kernel, retained); `chat:openWorkflowGraph` type removal is SA4E-289 (1721971) | SA4E-289 owns message-type surface |
| `extension/src/commands/CommandRegistrar.ts` | Never touched by SA4E-332 | SA4E-289 removed `openWorkflowGraph` command (1721971) |
| `extension/src/sidebar/tree-view-provider.ts` | Never touched by SA4E-332 | SA4E-289 removed Workflow tree item (1721971) |
| `extension/src/webview-panel-manager.ts` | Never touched by SA4E-332 | SA4E-289 removed `workflow` registration (1721971) |
| `extension/src/langgraph/vscode/tool-registry.ts` | SA4E-332 modified in place (mcp imports); superseded | Deleted by SA4E-289 (1721971) |
| `extension/src/langgraph/__tests__/anthropic-provider-content-guard.test.ts` | SA4E-332 modified in place; superseded | Moved to `mcp/__tests__/` by SA4E-289 (1721971) |

Grep gate after narrow: `0` `langgraph/` imports outside `src/langgraph/` EXCEPT
`src/panels/workflow-panel.ts` (1 hit, listed above, pending SA4E-289 deletion).
