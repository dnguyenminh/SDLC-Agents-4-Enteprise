# ug-flow-ai-context.ps1 — SA4E-411 UG evidence: AI Context flow (primary + edge).
#
# Flow A (primary result):
#   open backend/src/engine/agent-tools/core-tools.ts -> cursor on the
#   CoreAgentTools symbol -> command "SDLC Agents: Get AI Context for Symbol"
#   -> success toast, context copied to the clipboard.
#
# Flow B (error / edge state):
#   close the editor (no active text editor) -> run the same command
#   -> warning toast "No active editor. Open a file first."
#
# Every step re-reads the accessibility tree and re-resolves element indexes by
# TEXT MATCH (indexes go stale after any UI change). Screenshots are written to
# disk only; base64 never reaches stdout.
#
# NOTE: do NOT open the SDLC Agents Settings panel in this flow — its Backend URL
# field is seeded from the package.json default (48721) and persists that value
# into the .code-workspace settings, which would silently repoint the isolated
# IDE at the shared repo-main backend.

param(
  [string]$AppSelector = 'pid:20668',
  [string]$EvidenceDir  = $PSScriptRoot,
  [string]$DiagramDir  = (Join-Path (Split-Path -Parent $PSScriptRoot) 'diagrams')
)

$ErrorActionPreference = 'Stop'

function Get-Tree {
  $raw = & orca computer get-app-state --app $AppSelector --json 2>&1 | Out-String
  $j = $raw | ConvertFrom-Json
  if (-not $j.ok) { throw "get-app-state failed" }
  return $j
}

function Find-Index {
  param([string]$Tree, [string]$Match, [string]$Kind = 'any')
  $lines = $Tree -split "`r?`n"
  for ($i = 0; $i -lt $lines.Count; $i++) {
    $l = $lines[$i]
    if ($l -like "*$Match*") {
      if ($l -notmatch '^\s*(\d+)\s') { continue }
      $n = [int]$Matches[1]
      if ($Kind -eq 'edit'   -and $l -notmatch '\bedit\b')   { continue }
      if ($Kind -eq 'option' -and $l -notmatch '\boption\b') { continue }
      return $n
    }
  }
  return -1
}

function Wait-ForIndex {
  param([string]$Match, [string]$Kind = 'any', [int]$Attempts = 40, [int]$DelayMs = 500)
  for ($a = 0; $a -lt $Attempts; $a++) {
    $i = Find-Index -Tree (Get-Tree).result.snapshot.treeText -Match $Match -Kind $Kind
    if ($i -ge 0) { return $i }
    Start-Sleep -Milliseconds $DelayMs
  }
  return -1
}

function Invoke-Oca {
  param([string[]]$OcaArgs)
  $raw = & orca @OcaArgs 2>&1 | Out-String
  $j = $raw | ConvertFrom-Json
  if (-not $j.ok) { throw "orca $($OcaArgs -join ' ') failed: $($j.error.code) $($j.error.message)" }
  return $j
}

function Save-Capture {
  param([string]$Label, [string]$ImageName)
  $j = Get-Tree
  $imgPath = Join-Path $DiagramDir $ImageName
  $statePath = Join-Path $EvidenceDir ".state-$Label.txt"
  $src = $j.result.screenshot.path
  if (-not (Test-Path $src)) { throw "no screenshot for $Label" }
  Copy-Item -Path $src -Destination $imgPath -Force
  $tree = $j.result.snapshot.treeText
  $header = @(
    "# orca computer get-app-state --app $AppSelector --json (TEXT ONLY)",
    "# label      : $Label",
    "# windowTitle: $($j.result.snapshot.window.title)",
    "# appPid     : $($j.result.snapshot.app.pid)",
    "# capturedAt : $((Get-Date).ToUniversalTime().ToString('o'))",
    ""
  )
  Set-Content -Path $statePath -Value ($header + ($tree -split "`r?`n")) -Encoding UTF8
  $fi = Get-Item $imgPath
  $sha = (Get-FileHash -Path $imgPath -Algorithm SHA256).Hash
  $meta = [ordered]@{
    label = $Label; image = $imgPath; sha256 = $sha; bytes = $fi.Length
    mtimeUtc = $fi.LastWriteTimeUtc.ToString('o')
    app = 'Kiro'; appPid = $j.result.snapshot.app.pid
    windowTitle = $j.result.snapshot.window.title
    windowId = $j.result.snapshot.window.id
    backendPort = 48731
    stateTextFile = $statePath
    capturedAtUtc = (Get-Date).ToUniversalTime().ToString('o')
  }
  $meta | ConvertTo-Json | Set-Content -Path "$imgPath.meta.json" -Encoding UTF8
  Write-Output "CAPTURE_OK label=$Label image=$imgPath sha256=$sha bytes=$($fi.Length)"
}

function Run-AiContextCommand {
  Invoke-Oca @('computer','hotkey','--app',$AppSelector,'--key','CmdOrCtrl+Shift+P','--restore-window','--json') | Out-Null
  $i = Wait-ForIndex -Match 'edit Type the name of a command' -Kind 'edit'
  if ($i -lt 0) { throw 'command-palette input not found' }
  # The leading ">" is REQUIRED — without it the palette searches files, not commands.
  Invoke-Oca @('computer','set-value','--app',$AppSelector,'--element-index',"$i",'--value','>Get AI Context for Symbol','--json') | Out-Null
  $o = Wait-ForIndex -Match 'Get AI Context for Symbol' -Kind 'option'
  if ($o -lt 0) { throw 'AI Context command option not found' }
  Invoke-Oca @('computer','click','--app',$AppSelector,'--element-index',"$o",'--json') | Out-Null
  Write-Output "STEP=ran-AI-Context-command (option index $o)"
}

# ============================ FLOW A — primary result =========================
Invoke-Oca @('computer','press-key','--app',$AppSelector,'--key','Escape','--restore-window','--json') | Out-Null
Invoke-Oca @('computer','hotkey','--app',$AppSelector,'--key','CmdOrCtrl+P','--restore-window','--json') | Out-Null
$i = Wait-ForIndex -Match 'edit Search files by name' -Kind 'edit'
if ($i -lt 0) { throw 'quick-open input not found' }
Invoke-Oca @('computer','set-value','--app',$AppSelector,'--element-index',"$i",'--value','@CoreAgentTools','--json') | Out-Null
$o = Wait-ForIndex -Match 'option CoreAgentTools' -Kind 'option'
if ($o -lt 0) { throw 'symbol option not found' }
Invoke-Oca @('computer','click','--app',$AppSelector,'--element-index',"$o",'--json') | Out-Null
Write-Output "STEP=cursor-on-symbol (option index $o)"
Start-Sleep -Milliseconds 1200
$t = (Get-Tree).result.snapshot.treeText
($t -split "`r?`n" | Select-String -Pattern 'Line \d+, column \d+' | Select-Object -First 2) | ForEach-Object { "PROBE: $($_.Line.Trim())" }

Run-AiContextCommand
Start-Sleep -Milliseconds 2500
$t = (Get-Tree).result.snapshot.treeText
($t -split "`r?`n" | Select-String -Pattern 'Info:|Warning:|Error:|copied to clipboard|No active editor|Backend Target' | Select-Object -First 8) | ForEach-Object { "PROBE: $($_.Line.Trim())" }
Save-Capture -Label '02-primary-ai-context' -ImageName 'ug-sa411-02-ai-context-symbol.png'

# ============================ FLOW B — error / edge state =====================
Invoke-Oca @('computer','press-key','--app',$AppSelector,'--key','Escape','--restore-window','--json') | Out-Null
Invoke-Oca @('computer','hotkey','--app',$AppSelector,'--key','CmdOrCtrl+W','--restore-window','--json') | Out-Null
Write-Output 'STEP=closed-editor (no active text editor)'
Start-Sleep -Milliseconds 1200
Run-AiContextCommand
Start-Sleep -Milliseconds 2500
$t = (Get-Tree).result.snapshot.treeText
($t -split "`r?`n" | Select-String -Pattern 'Info:|Warning:|Error:|copied to clipboard|No active editor|Backend Target' | Select-Object -First 8) | ForEach-Object { "PROBE: $($_.Line.Trim())" }
Save-Capture -Label '03-no-active-editor' -ImageName 'ug-sa411-03-no-active-editor.png'
