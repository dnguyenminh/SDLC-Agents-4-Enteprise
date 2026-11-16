# start-isolated-backend.ps1
# SA4E-411 — launch an ISOLATED backend built from THIS worktree.
#
# Runtime profile resolved from project sources (no hardcoded assumption):
#   backend/package.json  -> "dev": "tsx watch ... src/index.ts"   (backend/src/index.ts)
#   backend/src/config/index.ts
#       resolvePort()      -> --port CLI  | CODE_INTEL_PORT env  | default 48721
#       resolveViewerPort()-> --viewer-port CLI | CODE_INTEL_VIEWER_PORT env | default 3202
#       getWorkspacePath() -> --workspace CLI | CODE_INTEL_WORKSPACE env | cwd
#       CODE_INTEL_DATA_DIR -> data dir (absolute => used as-is, never joined to workspace)
#       CODE_INTEL_DB       -> sqlite file name inside the data dir
#
# SAFETY: the shared instance on 127.0.0.1:48721 (PID 28892, repo main) is NEVER touched.
#          This instance uses its own port, its own viewer port and its own data dir.
param(
  [int]$Port = 48731,
  [int]$ViewerPort = 3203
)

$ErrorActionPreference = 'Stop'
$Worktree = 'C:\Users\ASUS\orca\workspaces\SDLC-Agents-4-Enterprise\SA4E-411'
$DataDir  = 'C:\Users\ASUS\AppData\Local\Temp\opencode\sa411-data'
$LogDir   = 'C:\Users\ASUS\AppData\Local\Temp\opencode\sa411-logs'

New-Item -ItemType Directory -Force -Path $DataDir, $LogDir | Out-Null

$env:CODE_INTEL_PORT         = "$Port"
$env:CODE_INTEL_VIEWER_PORT  = "$ViewerPort"
$env:CODE_INTEL_HOST         = '127.0.0.1'
$env:CODE_INTEL_WORKSPACE    = $Worktree
$env:CODE_INTEL_DATA_DIR     = $DataDir
$env:CODE_INTEL_ORCHESTRATION = Join-Path $DataDir 'orchestration.json'
$env:CODE_INTEL_LOG_LEVEL    = 'info'

Write-Output "WORKTREE   = $Worktree"
Write-Output "PORT       = $Port"
Write-Output "VIEWER     = $ViewerPort"
Write-Output "DATA_DIR   = $DataDir"
Write-Output "CMD        = npm run dev   (backend)  =>  tsx watch src/index.ts"

Set-Location (Join-Path $Worktree 'backend')
npm run dev
