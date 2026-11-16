# capture-kiro.ps1 — SA4E-411 UG evidence capture helper.
#
# Captures the ISOLATED Kiro window (title must contain "SA4E-411") via
# `orca computer get-app-state --app Kiro --json`, then:
#   * writes the ACCESSIBILITY TREE (text only) to a state file
#   * writes the PNG screenshot to a target path (from result.screenshot.path,
#     or by base64-decoding result.screenshot.data when no path is returned)
#   * writes a TEXT metadata sidecar (sha256, bytes, mtime, window title, pid)
#
# The base64 payload is NEVER printed to stdout — it only ever reaches disk.
param(
  [Parameter(Mandatory = $true)][string]$Label,
  [Parameter(Mandatory = $true)][string]$OutImagePath,
  [Parameter(Mandatory = $true)][string]$OutStatePath,
  [string]$AppSelector = 'Kiro',
  [int]$WindowIndex = 0
)

$ErrorActionPreference = 'Stop'
$evidenceDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot    = (Resolve-Path (Join-Path $evidenceDir '..\..\..')).Path

$raw = & orca computer get-app-state --app $AppSelector --window-index $WindowIndex --json 2>&1 | Out-String
if ($LASTEXITCODE -ne 0) { Write-Output "CAPTURE_ERROR=$raw"; exit 1 }

$j = $raw | ConvertFrom-Json
if (-not $j.ok) { Write-Output "CAPTURE_NOT_OK=$raw"; exit 1 }

$snap = $j.result.snapshot
$tree = $snap.treeText
if (-not $tree) { $tree = $snap.treeDiff }

$win = @($j.result.windows)[0]
$title = if ($win) { $win.title } else { '' }
$pid_ = $j.result.app.pid
if (-not $title) {
  $m = [regex]::Match($tree, 'Window: "([^"]+)"')
  if ($m.Success) { $title = $m.Groups[1].Value }
}
if (-not $pid_) {
  $m2 = [regex]::Match($tree, 'App=Kiro \(pid (\d+)\)')
  if ($m2.Success) { $pid_ = [int]$m2.Groups[1].Value }
}

# --- resolve the PNG -------------------------------------------------------
$srcPath = $null
if ($j.result.screenshot -and $j.result.screenshot.path) {
  $srcPath = $j.result.screenshot.path
}
$resolved = $null
if ($srcPath -and (Test-Path $srcPath)) {
  $resolved = $srcPath
} elseif ($j.result.screenshot -and $j.result.screenshot.data) {
  $tmp = Join-Path $env:TEMP "sa411-capture-$Label.png"
  [IO.File]::WriteAllBytes($tmp, [Convert]::FromBase64String($j.result.screenshot.data))
  $resolved = $tmp
}
if (-not $resolved) { Write-Output "CAPTURE_ERROR=no screenshot payload"; exit 1 }

New-Item -ItemType Directory -Force -Path (Split-Path -Parent $OutImagePath) | Out-Null
Copy-Item -Path $resolved -Destination $OutImagePath -Force

# --- text state ------------------------------------------------------------
$stateHeader = @(
  "# orca computer get-app-state --app Kiro --json (TEXT ONLY)",
  "# label      : $Label",
  "# windowTitle: $title",
  "# appPid     : $pid_",
  "# capturedAt : $((Get-Date).ToUniversalTime().ToString('o'))",
  ""
)
Set-Content -Path $OutStatePath -Value ($stateHeader + ($tree -split "`r?`n")) -Encoding UTF8

# --- metadata sidecar ------------------------------------------------------
$fi = Get-Item $OutImagePath
$sha = (Get-FileHash -Path $OutImagePath -Algorithm SHA256).Hash
$meta = [ordered]@{
  label           = $Label
  image           = $OutImagePath
  sha256          = $sha
  bytes           = $fi.Length
  mtimeUtc        = $fi.LastWriteTimeUtc.ToString('o')
  app             = 'Kiro'
  appPid          = $pid_
  windowTitle     = $title
  windowIndex     = $WindowIndex
  backendPort     = 48731
  stateTextFile   = $OutStatePath
  capturedAtUtc   = (Get-Date).ToUniversalTime().ToString('o')
}
$meta | ConvertTo-Json | Set-Content -Path "$OutImagePath.meta.json" -Encoding UTF8

Write-Output "CAPTURE_OK label=$Label"
Write-Output "IMAGE=$OutImagePath"
Write-Output "SHA256=$sha"
Write-Output "BYTES=$($fi.Length)"
Write-Output "MTIME=$($fi.LastWriteTimeUtc.ToString('o'))"
Write-Output "TITLE=$title"
Write-Output "APP_PID=$pid_"
Write-Output "STATE=$OutStatePath"
Write-Output "--- TREE (first 120 lines) ---"
($tree -split "`r?`n" | Select-Object -First 120) -join "`n"
