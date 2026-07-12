# Generator: sync codex-openai & opencode agent files with .kiro/agents/ source
# Pattern:
#   codex    = markdown wrapper (# Agent / ## Description / ## Tools / --- / ## Prompt / body)
#   opencode = YAML frontmatter (description, mode, permission) + body directly after ---
$ErrorActionPreference = 'Stop'
$root = 'C:\projects\kiro\SDLC-Agents-4-Enterprise'
$LF = "`n"

# agent -> (displayName, abbrev)
$agents = @(
  @('sm-agent',      'Scrum Master Agent',     'SM'),
  @('ba-agent',      'Business Analyst Agent', 'BA'),
  @('ta-agent',      'Technical Architect Agent', 'TA'),
  @('sa-agent',      'Solution Architect Agent',  'SA'),
  @('qa-agent',      'QA Engineer Agent',      'QA'),
  @('dev-agent',     'Developer Agent',        'DEV'),
  @('devops-agent',  'DevOps Engineer Agent',  'DevOps'),
  @('ui-agent',      'UI/UX Designer Agent',   'UI'),
  @('security-agent','Security Expert Agent',  'Security')
)

foreach ($a in $agents) {
  $name = $a[0]; $display = $a[1]; $abbrev = $a[2]
  $srcPath = Join-Path $root ".kiro\agents\$name.md"
  $jsonPath = Join-Path $root ".kiro\agents\$name.json"

  # --- extract body (strip YAML frontmatter, keep everything else verbatim) ---
  $raw = [System.IO.File]::ReadAllText($srcPath)
  $parts = $raw -split '---', 3
  if ($parts.Count -lt 3) { Write-Error "No frontmatter in $srcPath"; continue }
  $body = $parts[2].TrimStart()

  # --- read metadata from JSON ---
  $meta = Get-Content $jsonPath -Raw -Encoding UTF8 | ConvertFrom-Json
  $desc = $meta.description
  $tools = ($meta.tools -join ', ')

  # ===================== CODEX-OPENAI =====================
  $codex = New-Object System.Text.StringBuilder
  [void]$codex.Append("# $display ($abbrev)$LF$LF")
  [void]$codex.Append("## Description$LF$LF")
  [void]$codex.Append("$desc$LF$LF")
  [void]$codex.Append("## Tools$LF$LF")
  [void]$codex.Append("- $tools$LF")
  [void]$codex.Append("- MCP: find_tools, execute_dynamic_tool, mem_search, mem_ingest, stream_write_file, agent_log$LF$LF")
  [void]$codex.Append("---$LF$LF")
  [void]$codex.Append("## Prompt$LF$LF")
  [void]$codex.Append($body)
  $codexPath = Join-Path $root "conversions\codex-openai\agents\$name.md"
  [System.IO.File]::WriteAllText($codexPath, $codex.ToString(), (New-Object System.Text.UTF8Encoding($false)))
  Write-Output ("codex  {0}: {1} lines" -f $name, ($codex.ToString() -split $LF).Count)

  # ===================== OPENCODE =====================
  $oc = New-Object System.Text.StringBuilder
  [void]$oc.Append("---$LF")
  [void]$oc.Append("description: $desc$LF")
  [void]$oc.Append("mode: subagent$LF")
  [void]$oc.Append("permission:$LF")
  [void]$oc.Append("  edit: allow$LF")
  [void]$oc.Append("  bash: allow$LF")
  [void]$oc.Append("  read: allow$LF")
  [void]$oc.Append("  glob: allow$LF")
  [void]$oc.Append("  grep: allow$LF")
  [void]$oc.Append("  websearch: allow$LF")
  [void]$oc.Append("  webfetch: allow$LF")
  [void]$oc.Append("---$LF$LF")
  [void]$oc.Append($body)
  $ocPath = Join-Path $root "conversions\opencode\.opencode\agents\$name.md"
  [System.IO.File]::WriteAllText($ocPath, $oc.ToString(), (New-Object System.Text.UTF8Encoding($false)))
  Write-Output ("opencode {0}: {1} lines" -f $name, ($oc.ToString() -split $LF).Count)
}
Write-Output "DONE"
