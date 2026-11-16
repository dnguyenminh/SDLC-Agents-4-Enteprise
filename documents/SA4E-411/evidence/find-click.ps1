# find-click.ps1 — SA4E-411 UG evidence helper.
# Finds an element in the Kiro accessibility tree by text and clicks it.
# Element indexes are re-read fresh before every click (they go stale).
param(
  [Parameter(Mandatory = $true)][string]$AppSelector,
  [Parameter(Mandatory = $true)][string]$Match,
  [switch]$PrintTree
)

$ErrorActionPreference = 'Stop'
$raw = & orca computer get-app-state --app $AppSelector --json 2>&1 | Out-String
$j = $raw | ConvertFrom-Json
$tree = $j.result.snapshot.treeText
$lines = $tree -split "`r?`n"

$idx = -1
for ($i = 0; $i -lt $lines.Count; $i++) {
  if ($lines[$i] -like "*$Match*") {
    if ($lines[$i] -match '^\s*(\d+)\s') { $idx = [int]$Matches[1]; break }
  }
}
if ($idx -lt 0) {
  Write-Output "NOT_FOUND=$Match"
  if ($PrintTree) { $lines | Where-Object { $_ -match 'button|tree item|tab item|list item' } | Select-Object -First 80 }
  exit 2
}
Write-Output "FOUND_INDEX=$idx  MATCH=$Match"
Write-Output "FOUND_LINE=$($lines | Where-Object { $_ -match '^\s*' + $idx + '\s' } | Select-Object -First 1)"

$click = & orca computer click --app $AppSelector --element-index $idx --json 2>&1 | Out-String
$cj = $click | ConvertFrom-Json
Write-Output "CLICK_OK=$($cj.ok)"
if ($cj.result.action) {
  Write-Output "DELIVERY=$($cj.result.action.delivery)"
  Write-Output "VERIFICATION=$($cj.result.action.verification.state) $($cj.result.action.verification.reason)"
}
if ($cj.result.snapshot) {
  Set-Content -Path (Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) ".state-after-click.txt") -Value ($cj.result.snapshot.treeText) -Encoding UTF8
  Write-Output "STATE_WRITTEN=.state-after-click.txt"
}
if (-not $cj.ok) { Write-Output "CLICK_RAW=$click" }
