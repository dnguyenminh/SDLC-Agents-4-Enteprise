# FROZEN — do not add new code or new importers (SA4E-332 / Epic SA4E-289 Option C)

This directory is the **legacy LangGraph tree** and is **FROZEN** as of SA4E-332:

- ❌ No new files, no new exports, no logic changes here.
- ❌ No new imports FROM `langgraph/` in code outside this directory — CI fails them
-   (`no-restricted-imports`, message points here). Shared code lives in:
-   - `extension/src/mcp/mcp-bridge.ts` (+ `mcp-types.ts`: `McpToolDefinition`)
-   - `extension/src/mcp/llm-provider.ts`, `stream-handler.ts`, `state-types.ts`
-   - `extension/src/mcp/providers/*`, shared `context-budget` module
-   (If the team chose `extension/src/shared/` or `mcp/bridge/` at implementation, read those paths instead — TDD records the final layout.)
- ✅ Pure-graph remainder (`workflow/`, graph executors, hooks, diagnostics) is deleted
-   phase-by-phase under SA4E-289 follow-ups — not in SA4E-332.
- 🔑 Tokens/credentials: only via VS Code SecretStorage (`getSecretKey` / `kiroSdlc.*ApiKey`)
-   and base URLs via `PROVIDER_BASE_URL_KEYS` + `kiroSdlc.*` settings; MCP endpoint via
-   `IServerManager.port` / `kiroSdlc.mcpServerPort` (default 9181) / `kiroSdlc.mcpServerUrl`.
-   Never hard-code tokens or `127.0.0.1:9181`.

Questions → BRD `documents/SA4E-332/BRD.md`, FSD `documents/SA4E-332/FSD.md` (§3.4 / §11.6).
