param([string]$Url)

function Parse-McpBody($content) {
    if ($content -match "data:") {
        $content = ($content -split "`n" | Where-Object { $_ -like "data:*" } | ForEach-Object { $_.Substring(5).Trim() }) -join ""
    }
    return ($content | ConvertFrom-Json)
}

$accept = "application/json, text/event-stream"

# 1) initialize
$initBody = '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"ps-probe","version":"1.0.0"}}}'
try {
    $initHeaders = @{ "Content-Type" = "application/json"; "Accept" = $accept }
    $ir = Invoke-WebRequest -Uri $Url -Method Post -Body $initBody -Headers $initHeaders -UseBasicParsing -TimeoutSec 30
    $sid = $ir.Headers["Mcp-Session-Id"]
    if (-not $sid) { $sid = $ir.Headers["mcp-session-id"] }
    Write-Output ("SESSION: " + $sid)

    # 2) notifications/initialized
    $notifHeaders = @{ "Content-Type" = "application/json"; "Accept" = $accept }
    if ($sid) { $notifHeaders["Mcp-Session-Id"] = $sid }
    $notifBody = '{"jsonrpc":"2.0","method":"notifications/initialized","params":{}}'
    try { Invoke-WebRequest -Uri $Url -Method Post -Body $notifBody -Headers $notifHeaders -UseBasicParsing -TimeoutSec 15 | Out-Null } catch {}

    # 3) tools/list
    $listHeaders = @{ "Content-Type" = "application/json"; "Accept" = $accept }
    if ($sid) { $listHeaders["Mcp-Session-Id"] = $sid }
    $listBody = '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
    $lr = Invoke-WebRequest -Uri $Url -Method Post -Body $listBody -Headers $listHeaders -UseBasicParsing -TimeoutSec 30
    $json = Parse-McpBody $lr.Content
    $tools = $json.result.tools
    Write-Output ("TOOL_COUNT: " + $tools.Count)
    foreach ($t in $tools) {
        Write-Output ("- " + $t.name + " :: " + $t.description)
    }
} catch {
    Write-Output ("ERROR: " + $_.Exception.Message)
    if ($_.Exception.Response) {
        $sr = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        Write-Output $sr.ReadToEnd()
    }
}
