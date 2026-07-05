$body = @{
    jsonrpc = "2.0"
    id = 1
    method = "tools/call"
    params = @{
        name = "mem_ingest"
        arguments = @{
            content = "Fixed pinch-zoom bug: added touchstart/touchmove preventDefault and viewport meta user-scalable=no to prevent page zoom."
            type = "CONTEXT"
            source = "chat-response"
            tags = "chat,stream,agent"
        }
    }
} | ConvertTo-Json -Depth 5 -Compress

Invoke-RestMethod -Uri "http://localhost:9181/mcp" -Method POST -ContentType "application/json" -Body $body
