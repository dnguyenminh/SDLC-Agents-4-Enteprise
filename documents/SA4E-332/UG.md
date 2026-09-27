# User Guide — SA4E-332 Shared Kernel (`extension/src/mcp/`)

> Scope: where shared code lives after SA4E-332, how to import it, and how the
> `langgraph/` freeze is enforced. No behavior changed in this ticket (move-as-is).

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
import { McpBridge } from "../../mcp/mcp-bridge";         // from src/langgraph/vscode/, src/panels/settings/
import type { McpToolDefinition } from "../mcp/mcp-types"; // from src/mcp/*.ts
import type { McpToolDefinition } from "../../mcp/mcp-types"; // from src/langgraph/vscode/tool-registry.ts
import { createLlmProvider } from "../mcp/providers";     // factories
```

`tool-registry.ts` (stays in `langgraph/vscode/`) re-exports the type for
backward-compat during phased deletion: `export type { McpToolDefinition };`

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
