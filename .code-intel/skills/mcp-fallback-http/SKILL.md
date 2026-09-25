---
name: mcp-fallback-http
description: Fallback HTTP protocol for MCP when native MCP is disabled
---

## MCP Fallback via HTTP
When MCP is disabled at the organization level:
- Use `Invoke-RestMethod` to call the local HTTP endpoint
- Protocol: JSON-RPC 2.0
- Read the MCP URL from `opencode.json`

### JSON-RPC Request Format
```powershell
$body = @{
    jsonrpc = "2.0"
    id = 1
    method = "tools/call"
    params = @{
        name = "tool_name"
        arguments = @{
            key1 = "value1"
        }
    }
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:9181/mcp" -Method Post -Body $body -ContentType "application/json"
```

### Supported Methods
- `tools/list` — list available tools
- `tools/call` — invoke a tool
- `health` — check server health (GET /health)

### When to Use
- Only when native MCP tools are unavailable
- Check native MCP first with `find_tools`
- Fall back to HTTP if no results after 3 query variations

