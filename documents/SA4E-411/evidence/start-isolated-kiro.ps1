# Start an ISOLATED Kiro instance for SA4E-411 UG evidence capture.
#
# Isolation guarantees:
#   - separate --user-data-dir  => separate profile, separate MCP wrapper, separate session state
#   - separate --extensions-dir => only the SA4E-411 VSIX built from this worktree is installed
#   - workspace = this worktree  => the window title/status bar prove which build is on screen
# The shared Kiro instance (default profile) is NEVER touched by this script.
#
# Usage (from repo root):  pwsh -File documents\SA4E-411\evidence\start-isolated-kiro.ps1
$ErrorActionPreference = 'Stop'

$worktree   = 'C:\Users\ASUS\orca\workspaces\SDLC-Agents-4-Enterprise\SA4E-411'
$profileDir = 'C:\Users\ASUS\AppData\Local\Temp\opencode\sa411-kiro'
$userData   = Join-Path $profileDir 'user-data'
$extensions = Join-Path $profileDir 'extensions'
$logDir     = 'C:\Users\ASUS\AppData\Local\Temp\opencode\sa411-logs'
$kiro       = 'C:\Users\ASUS\AppData\Local\Programs\Kiro\bin\kiro.cmd'

# Workspace-file override: the repo's own .vscode/settings.json pins
# sdlcAgents.backend.url to the SHARED repo-main backend on :48721.
# A .code-workspace settings block has higher precedence than a folder
# .vscode/settings.json, so the isolated Kiro is pointed at the isolated
# SA4E-411 backend on :48731 WITHOUT mutating any tracked repo file.
$workspaceFile = Join-Path $profileDir 'sa411.code-workspace'

New-Item -ItemType Directory -Force -Path $logDir | Out-Null

$before = @(Get-Process -Name Kiro -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id)
$before | Set-Content (Join-Path $logDir 'kiro-pids-before.txt')

Start-Process -FilePath $kiro -ArgumentList @(
  '--user-data-dir', $userData,
  '--extensions-dir', $extensions,
  '--disable-workspace-trust',
  '--skip-welcome',
  '--new-window',
  $workspaceFile
) -WorkingDirectory $worktree

# Wait for the isolated main window. Title is derived from the .code-workspace
# file name ("sa411 (Workspace) - Kiro"); accept SA4E-411 / sa411 variants.
$deadline = (Get-Date).AddSeconds(120)
$mainPid = 0
while ((Get-Date) -lt $deadline) {
  $main = Get-Process -Name Kiro -ErrorAction SilentlyContinue |
    Where-Object {
      ($_.MainWindowTitle -like '*SA4E-411*' -or $_.MainWindowTitle -like '*sa411*') -and
      $_.MainWindowHandle -ne 0 -and $_.StartTime -ge (Get-Date).AddMinutes(-10)
    } |
    Select-Object -First 1
  if ($main) { $mainPid = $main.Id; break }
  Start-Sleep -Seconds 3
}
if ($mainPid -eq 0) { Write-Output 'ISOLATED_KIRO_START=FAILED'; exit 1 }

$new = @(Get-Process -Name Kiro -ErrorAction SilentlyContinue |
  Where-Object { $before -notcontains $_.Id } | Select-Object -ExpandProperty Id)
$new | Set-Content (Join-Path $logDir 'kiro-pids-new.txt')

$title = (Get-Process -Id $mainPid).MainWindowTitle
$ports = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
  Where-Object { $new -contains $_.OwningProcess } | Select-Object -ExpandProperty LocalPort)

Write-Output "ISOLATED_KIRO_START=OK"
Write-Output "MAIN_PID=$mainPid"
Write-Output "WINDOW_TITLE=$title"
Write-Output "NEW_PIDS=$($new -join ',')"
Write-Output "LISTEN_PORTS=$($ports -join ',')"
