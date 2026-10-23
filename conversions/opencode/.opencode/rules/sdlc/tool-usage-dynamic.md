

# Dynamic Tool Execution Pattern

## Problem

The MCP server exposes tools from child servers (atlassian, markdown-exporter, etc.) via orchestration. These nested tools are NOT directly callable — they return "Unknown tool" if called directly. Additionally, MCP tools may not be available in the IDE session — the agent MUST bootstrap the connection via HTTP.

## Step 0: Bootstrap MCP Connection (MANDATORY — Every Session Start)

**Trigger:** At session start, OR when any MCP tool call fails with "tool not found" / "not connected".

**Goal:** Establish connection to MCP server and load available tools list via HTTP JSON-RPC.

### 0a. Detect OS and Read MCP URL

Read MCP server URL from `opencode.json` → `mcpServers.code-intelligence.url`
Default: `http://127.0.0.1:9181/mcp`

### 0b. Initialize MCP Session

**Windows (PowerShell):**
```powershell
$body = '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"SDLC-agent","version":"1.0"}},"id":1}'
$response = Invoke-WebRequest -Uri "http://127.0.0.1:9181/mcp" -Method POST -ContentType "application/json" -Body $body -TimeoutSec 10
$response.Content
```

**Linux/Mac (curl):**
```bash
curl -s -X POST http://127.0.0.1:9181/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"SDLC-agent","version":"1.0"}},"id":1}'
```

**Expected response:** JSON with `result.serverInfo` and `result.capabilities`. If error or timeout → server is DOWN.

### 0c. List Available Tools

**Windows (PowerShell):**
```powershell
$body = '{"jsonrpc":"2.0","method":"tools/list","params":{},"id":2}'
$response = Invoke-WebRequest -Uri "http://127.0.0.1:9181/mcp" -Method POST -ContentType "application/json" -Body $body -TimeoutSec 10
$response.Content
```

**Linux/Mac (curl):**
```bash
curl -s -X POST http://127.0.0.1:9181/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","params":{},"id":2}'
```

**Expected response:** `result.tools[]` — array of tool objects with `name`, `description`, `inputSchema`.

### 0d. Call a Tool

**Windows (PowerShell):**
```powershell
$body = @{
    jsonrpc = "2.0"
    method = "tools/call"
    params = @{
        name = "mem_search"
        arguments = @{ query = "test"; limit = 5 }
    }
    id = 3
} | ConvertTo-Json -Depth 5
$response = Invoke-WebRequest -Uri "http://127.0.0.1:9181/mcp" -Method POST -ContentType "application/json" -Body $body -TimeoutSec 30
$response.Content
```

**Linux/Mac (curl):**
```bash
curl -s -X POST http://127.0.0.1:9181/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"mem_search","arguments":{"query":"test","limit":5}},"id":3}'
```

### 0e. Verify Bootstrap Success

After `tools/list`:
- If response contains `result.tools` with ≥1 tool → ✅ MCP Connected
- If connection refused / timeout → ❌ Server DOWN — report to user
- If `tools/list` returns empty → ⚠️ Server running but no tools loaded

**Log bootstrap result:**
```
🔧 MCP Bootstrap:
- Server: http://127.0.0.1:9181/mcp — {CONNECTED/DOWN}
- Tools loaded: {N} tools
- Core tools: {list first 5}
```

### 0f. Session Header for Streaming (SSE/HTTP Stream)

For servers using `httpStream` transport, the initial `initialize` call may return an SSE stream. Handle with:

**Windows (PowerShell — single request/response mode):**
```powershell
$headers = @{ "Accept" = "application/json" }
$response = Invoke-WebRequest -Uri "http://127.0.0.1:9181/mcp" -Method POST -ContentType "application/json" -Headers $headers -Body $body -TimeoutSec 10
```

---

## Step 1: Discover Tools with `find_tools`

Once MCP is connected (Step 0 passed), use `find_tools` to discover nested tools from child servers:

**Via HTTP:**
```powershell
$body = @{
    jsonrpc = "2.0"
    method = "tools/call"
    params = @{
        name = "find_tools"
        arguments = @{ query = "jira issue"; threshold = 0.3; top_k = 5 }
    }
    id = 4
} | ConvertTo-Json -Depth 5
Invoke-WebRequest -Uri "http://127.0.0.1:9181/mcp" -Method POST -ContentType "application/json" -Body $body -TimeoutSec 10
```

**If MCP tools are available natively in IDE:**
```
find_tools(query: "jira issue", threshold: 0.3, top_k: 5)
```

This returns available tool names and their schemas.

## Step 2: Execute with `execute_dynamic_tool`

**Via HTTP:**
```powershell
$body = @{
    jsonrpc = "2.0"
    method = "tools/call"
    params = @{
        name = "execute_dynamic_tool"
        arguments = @{
            tool_name = "jira_get_issue"
            arguments = @{ issue_key = "KSA-123"; fields = "summary,description" }
        }
    }
    id = 5
} | ConvertTo-Json -Depth 5
Invoke-WebRequest -Uri "http://127.0.0.1:9181/mcp" -Method POST -ContentType "application/json" -Body $body -TimeoutSec 30
```

**If MCP tools are available natively:**
```
execute_dynamic_tool(
  tool_name: "jira_get_issue",
  arguments: { "issue_key": "KSA-123", "fields": "summary,description" }
)
```

**CRITICAL:** The `arguments` field MUST be an object (not a JSON string).

## Common Tool Categories

| Category | Discovery Query | Example Tools |
|----------|----------------|---------------|
| Jira | `find_tools("jira")` | jira_get_issue, jira_search, jira_create_issue |
| Export | `find_tools("export docx")` | export_docx, embed_image |
| Draw.io | `find_tools("drawio")` | drawio_auto_layout, drawio_export_png |
| Memory/KB | `find_tools("memory")` | mem_search, mem_ingest, mem_graph |
| Code | `find_tools("code")` | code_search, code_symbols, code_context |

## Rules

1. **ALWAYS run Step 0 (Bootstrap)** at session start or when tools are unavailable
2. **NEVER** call nested tools directly (they will return "Unknown tool")
3. **ALWAYS** use `execute_dynamic_tool` as the execution wrapper for nested tools
4. **Arguments must be objects** — `{"issue_key": "X"}` not `"{\"issue_key\": \"X\"}"`
5. If a tool fails with "Unknown tool", check if it needs `toggle_tool` first
6. Core tools (mem_search, mem_ingest, find_tools, code_search, agent_log) are directly callable — no need for execute_dynamic_tool
7. **Fallback to HTTP** — if IDE MCP integration is unavailable, use PowerShell/curl commands from Step 0

## Error Recovery

| Error | Action |
|-------|--------|
| Connection refused (Step 0) | Server DOWN → start server: `npx tsx backend/src/index.ts` |
| Schema validation error | Check argument types against inputSchema from find_tools |
| Tool not found on server | Child server may be DEAD → check `orchestration_status` |
| Timeout | Retry once with simpler arguments |
| Empty tools/list | Server running but plugins not loaded → check orchestration_status |

## Server Startup (if DOWN)

**Windows (PowerShell):**
```powershell
$env:CODE_INTEL_PORT = "9186"
$env:CODE_INTEL_WORKSPACE = "."
Start-Process -NoNewWindow npx -ArgumentList "tsx", "backend\src\index.ts" -WorkingDirectory "."
```

**Linux/Mac:**
```bash
CODE_INTEL_PORT=9186 CODE_INTEL_WORKSPACE=/path/to/project npx tsx backend/src/index.ts &
```

Wait 5-10 seconds, then retry Step 0.


