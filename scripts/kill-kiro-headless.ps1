# =============================================================================
# kill-kiro-headless.ps1 — Close headless Kiro instances left by e2e test runs
# -----------------------------------------------------------------------------
# Problem: e2e / automation runs spawn extra Kiro.exe instances (Electron) that
# outlive the test runner. Task Manager shows dozens of Kiro.exe processes and
# it is unsafe to kill them blindly — they may belong to the interactive IDE.
#
# Electron process model used for classification:
#   - Every Kiro.exe belongs to exactly ONE instance. Walking the parent chain
#     of any Kiro.exe upwards ends at that instance's ROOT process.
#     (Note: language servers such as eslintServer.js/tsserver.js are spawned
#     as Kiro.exe WITHOUT "--type=", so "--type=" alone cannot identify roots;
#     only the ancestor chain can.)
#   - Killing a root with `taskkill /T /F` removes its whole child tree.
#
# A root is classified HEADLESS when ANY of the following holds:
#   H1  command line contains "--headless"
#   H2  command line carries a --user-data-dir that is NOT the default
#       "%APPDATA%\Kiro"  (test harnesses always use an isolated profile)
#   H3  command line contains test-harness markers:
#       vscode-test | extensionTestsPath | --extensionDevelopmentPath | --e2e
#   H4  the root has NO visible main window AND its parent is NOT explorer.exe
#       (programmatic spawn — the signature of a test runner child process)
#
# The interactive instance (visible window, explorer parent, default profile)
# is NEVER matched, so running this next to your IDE is safe.
#
# Usage:
#   pwsh scripts/kill-kiro-headless.ps1           # dry-run: list only
#   pwsh scripts/kill-kiro-headless.ps1 -Kill     # kill matched headless trees
#   pwsh scripts/kill-kiro-headless.ps1 -Json     # machine-readable output
# =============================================================================

param(
    [switch]$Kill,
    [switch]$Json
)

$ErrorActionPreference = "SilentlyContinue"

$defaultUserDataDir = Join-Path $env:APPDATA "Kiro"
$testMarkers = 'vscode-test|extensionTestsPath|--extensionDevelopmentPath|--e2e'

$all = Get-CimInstance Win32_Process -Filter "Name='Kiro.exe'"
$byId = @{}
foreach ($p in $all) { $byId[[uint32]$p.ProcessId] = $p }

# All processes (one snapshot) to resolve parents outside the Kiro family.
$everyProcess = @{}
foreach ($p in (Get-CimInstance Win32_Process)) { $everyProcess[[uint32]$p.ProcessId] = $p }

# Walk the parent chain of a Kiro.exe up to its instance ROOT
# (the first ancestor that is not itself a Kiro.exe child).
function Get-ChainTop($proc) {
    $cur = $proc
    $seen = @{}
    while ($true) {
        $curId = [uint32]$cur.ProcessId
        if ($seen.ContainsKey($curId)) { return $cur }   # cycle guard
        $seen[$curId] = $true
        $parent = $byId[[uint32]$cur.ParentProcessId]
        if (-not $parent) { return $cur }                # parent is not Kiro.exe → top
        $cur = $parent
    }
}

# Group every Kiro.exe under its instance root.
$treeSize = @{}
foreach ($p in $all) {
    $topId = [uint32](Get-ChainTop $p).ProcessId
    $treeSize[$topId] = 1 + ($treeSize[$topId] ?? 0)
}

$uniqueRoots = @($all | ForEach-Object { Get-ChainTop $_ } | Sort-Object ProcessId -Unique)

$headless = @()
$interactive = @()

foreach ($root in $uniqueRoots) {
    $cl = $root.CommandLine
    $proc = Get-Process -Id $root.ProcessId
    $window = if ($proc) { $proc.MainWindowTitle } else { "" }
    $parent = $everyProcess[[uint32]$root.ParentProcessId]

    $udDir = $null
    if ($cl -match '--user-data-dir="?([^"\s]+)"?') { $udDir = $Matches[1] }

    $reasons = @()
    if ($cl -match '--headless') {
        $reasons += "H1:--headless flag"
    }
    if ($udDir -and ($udDir -ne $defaultUserDataDir)) {
        $reasons += "H2:isolated user-data-dir=$udDir"
    }
    if ($cl -match $testMarkers) {
        $reasons += "H3:test-harness marker"
    }
    if (-not $window -and $parent -and $parent.Name -ne 'explorer.exe') {
        $reasons += "H4:no window + parent=$($parent.Name)"
    }

    $treeN = $treeSize[[uint32]$root.ProcessId] ?? 1
    if ($reasons.Count -gt 0) {
        $headless += [PSCustomObject]@{
            Pid       = $root.ProcessId
            Parent    = $root.ParentProcessId
            Started   = $root.CreationDate
            Window    = $window
            Procs     = $treeN
            Reasons   = ($reasons -join "; ")
            Cmd       = $(if ($cl) { $cl.Substring(0, [Math]::Min(160, $cl.Length)) } else { "" })
        }
    } else {
        $interactive += [PSCustomObject]@{ Pid = $root.ProcessId; Window = $window; Procs = $treeN }
    }
}

if ($Json) {
    [PSCustomObject]@{
        interactive = $interactive
        headless    = $headless
        killed      = @()
    } | ConvertTo-Json -Depth 4
    if (-not $Kill) { return }
} else {
    Write-Host ("Kiro instance roots: " + $uniqueRoots.Count +
        " | interactive: " + $interactive.Count +
        " | headless: " + $headless.Count)
    foreach ($i in $interactive) {
        Write-Host ("  KEEP PID " + $i.Pid + "  (" + $i.Procs + " procs)  [" + $i.Window + "]")
    }
    foreach ($h in $headless) {
        Write-Host ("  HEADLESS PID " + $h.Pid + "  (" + $h.Procs + " procs)  (" + $h.Reasons + ")")
        Write-Host ("     cmd: " + $h.Cmd)
    }
}

if ($Kill) {
    $killed = @()
    foreach ($h in $headless) {
        # /T kills the whole child tree (renderers, extension hosts, tsserver...)
        $null = & taskkill /PID $h.Pid /T /F 2>&1
        if ($LASTEXITCODE -eq 0) { $killed += $h.Pid }
        else { Write-Warning ("Failed to kill PID " + $h.Pid) }
    }
    if ($Json) {
        [PSCustomObject]@{ killed = $killed } | ConvertTo-Json
    } else {
        Write-Host ("Killed headless instances: " + ($killed -join ", "))
    }
}
