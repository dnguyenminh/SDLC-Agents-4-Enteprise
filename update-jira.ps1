$body = @{
    jsonrpc = "2.0"
    method = "tools/call"
    id = 1
    params = @{
        name = "execute_dynamic_tool"
        arguments = @{
            toolName = "jira_add_comment"
            arguments = @{
                issue_key = "SA4E-12"
                body = "Session summary of changes implemented before this ticket:\n\nF1 TagAnalyzerService created + integrated into ingest pipeline.\nF3 McpConfigService + McpConfigRoutes + Admin UI CRUD (Add/Edit/Remove/Restart).\nRBAC: MCP_MANAGE per-server table, MCP_ACCESS per-tool nested table.\nConfig page: tabs + LLM section added.\nAccess groups seeded: Developers, Viewers, MCP Operators.\n\nRemaining for SA4E-12: Rich LLM config UI (dropdown/model/key/test)."
            }
        }
    }
} | ConvertTo-Json -Depth 10

try {
    $r = Invoke-WebRequest -Uri 'http://localhost:9181/mcp' -Method POST -ContentType 'application/json' -Body $body -TimeoutSec 15 -UseBasicParsing
    Write-Host $r.Content
} catch {
    Write-Host "Error: $($_.Exception.Message)"
}
