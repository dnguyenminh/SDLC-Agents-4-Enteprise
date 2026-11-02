$url = "http://localhost:3010/mcp"
$headers = @{ "Accept" = "application/json, text/event-stream" }

# 1. Initialize - capture session id from response headers
$initBody = '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"SDLC-agent","version":"1.0"}},"id":1}'
$r = Invoke-WebRequest -Uri $url -Method POST -ContentType "application/json" -Headers $headers -Body $initBody -TimeoutSec 10
$sessionId = $r.Headers["mcp-session-id"]
Write-Output "Session ID: $sessionId"

# 2. Initialized notification
$hdr2 = @{ "Accept" = "application/json, text/event-stream"; "mcp-session-id" = $sessionId }
$notifBody = '{"jsonrpc":"2.0","method":"notifications/initialized"}'
try { Invoke-WebRequest -Uri $url -Method POST -ContentType "application/json" -Headers $hdr2 -Body $notifBody -TimeoutSec 10 | Out-Null } catch {}

# 3. Call jira_get_issue for SA4E-387
$callBody = @{
    jsonrpc = "2.0"
    method = "tools/call"
    params = @{
        name = "jira_get_issue"
        arguments = @{ issue_key = "SA4E-387"; fields = "summary,description,status,priority,labels,comment" }
    }
    id = 3
} | ConvertTo-Json -Depth 6

$r2 = Invoke-WebRequest -Uri $url -Method POST -ContentType "application/json" -Headers $hdr2 -Body $callBody -TimeoutSec 30
$r2.Content
