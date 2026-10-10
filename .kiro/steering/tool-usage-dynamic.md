

# Dynamic Tool Execution Pattern

## Problem

The MCP server exposes tools from child servers (atlassian, markdown-exporter, etc.) via orchestration. These nested tools are NOT directly callable — they return "Unknown tool" if called directly. Additionally, MCP tools may not be available in the IDE session — the agent MUST bootstrap the connection via HTTP.

## Step 0: Bootstrap MCP Connection (MANDATORY — Every Session Start)

**Trigger:** At session start, OR when any MCP tool call fails with "tool not found" / "not connected".

**Goal:** Establish connection to MCP server and load available tools list via HTTP JSON-RPC.

### 0a. Read MCP URL (NO hardcoding — resolve from runtime settings)

1. **PRIMARY**: `.code-intel/settings.json` → `mcpUrl` — file tự động được server ghi lúc startup (chứa port thật, pid, version, startedAt).
2. **Fallback**: `.kiro/settings/mcp.json` → `mcpServers.code-intelligence.url`
3. **Không tồn tại file nào** → server chưa chạy → làm theo phần Server Startup, chờ 5-10s, đọc lại `.code-intel/settings.json`.
4. Kết nối tới URL thất bại → server DOWN → báo user. ⛔ KHÔNG loop restart.

**PowerShell — resolve URL một lần, dùng lại ở mọi bước sau:**
```powershell
$s = Get-Content ".code-intel/settings.json" -Raw | ConvertFrom-Json
$mcpUrl = $s.mcpUrl
if (-not $mcpUrl) { $mcpUrl = ((Get-Content ".kiro/settings/mcp.json" -Raw | ConvertFrom-Json).mcpServers.'code-intelligence').url }
$mcpUrl
```

**Linux/Mac:**
```bash
MCP_URL=$(jq -r '.mcpUrl // empty' .code-intel/settings.json)
[ -z "$MCP_URL" ] && MCP_URL=$(jq -r '.mcpServers["code-intelligence"].url // empty' .kiro/settings/mcp.json)
echo "$MCP_URL"
```

⛔ TUYỆT ĐỐI KHÔNG hardcode port/URL (cấm literal 9181/9186/9183 trong lệnh) — luôn resolve từ settings.

### 0b. Initialize MCP Session

**Windows (PowerShell):**
```powershell
$body = '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"SDLC-agent","version":"1.0"}},"id":1}'
$response = Invoke-WebRequest -Uri "$mcpUrl" -Method POST -ContentType "application/json" -Body $body -TimeoutSec 10
$response.Content
```

**Linux/Mac (curl):**
```bash
curl -s -X POST "$MCP_URL" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"SDLC-agent","version":"1.0"}},"id":1}'
```

**Expected response:** JSON with `result.serverInfo` and `result.capabilities`. If error or timeout → server is DOWN.

### 0c. List Available Tools

**Windows (PowerShell):**
```powershell
$body = '{"jsonrpc":"2.0","method":"tools/list","params":{},"id":2}'
$response = Invoke-WebRequest -Uri "$mcpUrl" -Method POST -ContentType "application/json" -Body $body -TimeoutSec 10
$response.Content
```

**Linux/Mac (curl):**
```bash
curl -s -X POST "$MCP_URL" \
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
$response = Invoke-WebRequest -Uri "$mcpUrl" -Method POST -ContentType "application/json" -Body $body -TimeoutSec 30
$response.Content
```

**Linux/Mac (curl):**
```bash
curl -s -X POST "$MCP_URL" \
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
- Server: $mcpUrl — {CONNECTED/DOWN}
- Tools loaded: {N} tools
- Core tools: {list first 5}
```

### 0f. Session Header for Streaming (SSE/HTTP Stream)

For servers using `httpStream` transport, the initial `initialize` call may return an SSE stream. Handle with:

**Windows (PowerShell — single request/response mode):**
```powershell
$headers = @{ "Accept" = "application/json" }
$response = Invoke-WebRequest -Uri "$mcpUrl" -Method POST -ContentType "application/json" -Headers $headers -Body $body -TimeoutSec 10
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
Invoke-WebRequest -Uri "$mcpUrl" -Method POST -ContentType "application/json" -Body $body -TimeoutSec 10
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
Invoke-WebRequest -Uri "$mcpUrl" -Method POST -ContentType "application/json" -Body $body -TimeoutSec 30
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
| Export | `find_tools("export docx")` | export_docx, embed_images |
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
| Connection refused (Step 0) | Server DOWN → start server (phần Server Startup), chờ 5-10s, đọc lại `.code-intel/settings.json`, retry TỐI ĐA 1 lần. Vẫn fail → BÁO USER, ⛔ KHÔNG loop restart. |
| Schema validation error | Check argument types against inputSchema from find_tools |
| Tool not found on server | Child server may be DEAD → check `orchestration_status` |
| Timeout | Retry once with simpler arguments |
| Empty tools/list | Server running but plugins not loaded → check orchestration_status |
| settings.json không tồn tại | Server chưa chạy HOẶC đã shutdown (file bị xoá lúc stop) → start server rồi đọc lại |

## Server Startup (if DOWN)

Server có thể start ở BẤT KỲ port nào — sau khi start nó sẽ **tự ghi `.code-intel/settings.json`** chứa port thật. Đừng đoán port, chỉ cần start rồi đọc file.

- **Extension mode (Kiro/VSCode — mặc định)**: server wrapper chạy trong extension host. Reload window (`Ctrl+Shift+P` → "Reload Window") → wrapper tự ghi `.code-intel/settings.json`.
- **Standalone backend**: `npx tsx backend/src/index.ts` (nếu chạy chế độ này).

**Windows (PowerShell):**
```powershell
$env:CODE_INTEL_WORKSPACE = "."
Start-Process -NoNewWindow npx -ArgumentList "tsx", "backend\src\index.ts" -WorkingDirectory "."
```

**Linux/Mac:**
```bash
CODE_INTEL_WORKSPACE=/path/to/project npx tsx backend/src/index.ts &
```

Wait 5-10 seconds, then re-read `.code-intel/settings.json` → retry Step 0 (tối đa 1 lần, vẫn fail → báo user).


