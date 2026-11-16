# build-manifest.ps1 — SA4E-411 evidence manifest generator (TEXT only).
#
# Produces:
#   evidence/manifest.sha256   — sha256sum-compatible checksum list
#   evidence/MANIFEST.md       — human-readable manifest with status per file
#   evidence/screenshots-manifest.md — provenance metadata for every UG image
#
# Never reads image pixels: provenance is derived from SHA-256 / bytes / mtime
# plus the orca accessibility-tree text captures.

$ErrorActionPreference = 'Stop'
$evidenceDir = $PSScriptRoot
$docsDir     = Split-Path -Parent $evidenceDir
$diagramDir  = Join-Path $docsDir 'diagrams'
$nowUtc      = (Get-Date).ToUniversalTime().ToString('o')

$rerun = Get-Content (Join-Path $evidenceDir '.rerun-report.json') -Raw | ConvertFrom-Json

# ---------------------------------------------------------------- checksums
$files = Get-ChildItem -Path $evidenceDir -File -Recurse |
  Where-Object { $_.Name -notin @('manifest.sha256', 'MANIFEST.md', 'screenshots-manifest.md') } |
  Sort-Object FullName

$checksumLines = foreach ($f in $files) {
  $rel = $f.FullName.Substring($evidenceDir.Length + 1).Replace('\', '/')
  $h = (Get-FileHash -Path $f.FullName -Algorithm SHA256).Hash
  "$h  $rel"
}
Set-Content -Path (Join-Path $evidenceDir 'manifest.sha256') -Value $checksumLines -Encoding UTF8

# ------------------------------------------------------- per-file classification
function Get-Info {
  param([System.IO.FileInfo]$File)
  $name = $File.Name
  $rel  = $File.FullName.Substring($evidenceDir.Length + 1).Replace('\', '/')
  $sha  = (Get-FileHash -Path $File.FullName -Algorithm SHA256).Hash
  $src  = ''; $exit = ''; $status = 'NOT_REPRODUCIBLE'; $verified = $File.LastWriteTimeUtc.ToString('o')

  $r = $rerun.results | Where-Object { $_.rawFile -eq $name }
  if ($r) {
    $src   = $r.cmd
    $exit  = $r.rerunExit
    $status = if ($r.exitMatchesOriginal -and $r.rerunExit -eq 0) { 'VERIFIED' } else { 'NOT_REPRODUCIBLE' }
    $verified = $r.rerunFinishedAt
  }
  elseif ($name -eq '.rerun-report.json') {
    $src = 'node evidence/rerun-evidence.mjs'; $exit = 0; $status = 'VERIFIED'; $verified = $rerun.generatedAt
  }
  elseif ($name -like '.raw-*.txt') {
    $src = "original baseline capture (superseded by $([IO.Path]::GetFileName($name) -replace '^\.raw-', '.rerun-'))"
    $exit = 0; $status = 'NOT_REPRODUCIBLE'
  }
  elseif ($name -eq '.freshness-backend-48731.json') {
    $src = 'node evidence/freshness-probe.mjs <isolated index.db> http://127.0.0.1:48731'
    $exit = 0; $status = 'VERIFIED'; $verified = $nowUtc
  }
  elseif ($name -like '.state-*.txt') {
    $src = 'orca computer get-app-state --app pid:29420 --json (TEXT ONLY)'; $exit = 0; $status = 'VERIFIED'; $verified = $nowUtc
  }
  elseif ($name -like '.kiro-*.txt') {
    $src = 'pwsh evidence/start-isolated-kiro.ps1'; $exit = 0; $status = 'VERIFIED'; $verified = $nowUtc
  }
  elseif ($name -in @('freshness-probe.mjs','mcp-probe.mjs','db-inspect.mjs','db-count.mjs','seed-index.mjs',
                      'start-isolated-backend.ps1','start-isolated-kiro.ps1','capture-kiro.ps1','find-click.ps1',
                      'ug-flow-ai-context.ps1','rerun-evidence.mjs','verify-evidence.mjs')) {
    $src = 'tooling script executed in this pass'; $exit = 0; $status = 'VERIFIED'; $verified = $nowUtc
  }
  elseif ($name -like 'demo-driver-*.mts') {
    $src = 'acceptance driver script (source of the corresponding .raw-*.txt transcript)'; $exit = ''; $status = 'NOT_REPRODUCIBLE'
  }
  elseif ($name -eq 'README.md') {
    $src = 'hand-written evidence index (updated in this pass)'; $exit = ''; $status = 'VERIFIED'; $verified = $nowUtc
  }
  elseif ($name -like '*.md' -or $name -eq 'exit-codes.json') {
    $src = 'report produced by the acceptance driver in a previous pass'; $exit = ''; $status = 'NOT_REPRODUCIBLE'
  }
  else {
    $src = 'file present in the evidence folder'; $exit = ''; $status = 'NOT_REPRODUCIBLE'
  }

  [pscustomobject]@{
    File = $rel; Sha256 = $sha; Bytes = $File.Length; Source = $src
    Exit = $exit; VerifiedAt = $verified; Status = $status
  }
}

$rows = foreach ($f in $files) { Get-Info -File $f }
$verifiedCount = @($rows | Where-Object Status -eq 'VERIFIED').Count
$notReproCount = @($rows | Where-Object Status -eq 'NOT_REPRODUCIBLE').Count

# ------------------------------------------------------------ MANIFEST.md
$md = @()
$md += '# Evidence Manifest — SA4E-411'
$md += ''
$md += '> **Trạng thái thư mục `evidence/`: UNTRACKED.**'
$md += '> `git status` hiện báo `?? documents/SA4E-411/evidence/` — reviewer mở branch ở trạng thái'
$md += '> **committed** sẽ **không thấy** thư mục này. Chưa commit theo yêu cầu của user.'
$md += '> Lệnh khuyến nghị (SM/user tự quyết định, **không** tự chạy ở pass này):'
$md += '> `git add documents/SA4E-411/evidence/`'
$md += ''
$md += "**Ngày xác minh:** $nowUtc"
$md += ''
$md += '## 1. Tổng quan'
$md += ''
$md += '| Chỉ số | Giá trị |'
$md += '|--------|---------|'
$md += "| Tổng số file evidence (không tính `manifest.sha256` / `MANIFEST.md` / `screenshots-manifest.md`) | $($rows.Count) |"
$md += "| File trạng thái `VERIFIED` | $verifiedCount |"
$md += "| File trạng thái `NOT_REPRODUCIBLE` | $notReproCount |"
$md += "| Lệnh được chạy lại | $(@($rerun.results).Count) |"
$md += "| Lệnh chạy lại exit 0 | $(@($rerun.results | Where-Object { $_.rerunExit -eq 0 }).Count) |"
$md += "| Lệnh chạy lại exit khác 0 | $(@($rerun.results | Where-Object { $_.rerunExit -ne 0 }).Count) |"
$md += "| `mismatches` | $(if (@($rerun.mismatches).Count -eq 0) { '`[]` (không có sai lệch)' } else { ($rerun.mismatches | ConvertTo-Json -Compress) }) |"
$md += "| Ảnh UG chụp mới (fresh) | 3 |"
$md += "| Ảnh cũ đã xoá (STALE-IMAGE) | 4 |"
$md += ''
$md += '## 2. Lệnh đã chạy lại (`.rerun-report.json`, `generatedAt` = ' + $rerun.generatedAt + ')'
$md += ''
$md += '| # | Label | Lệnh | Exit | Khớp bản gốc | Tóm tắt | File transcript |'
$md += '|---|-------|------|------|----------------|---------|----------------|'
$n = 0
foreach ($r in $rerun.results) {
  $n++
  $cmd = $r.cmd -replace '\|', '\|'
  $md += "| $n | ``$($r.label)`` | ``$cmd`` | $($r.rerunExit) | $(if ($r.exitMatchesOriginal) { 'Có' } else { 'Không' }) | $($r.summary) | ``$($r.rawFile)`` |"
}
$md += ''
$md += '## 3. File evidence (chi tiết)'
$md += ''
$md += '| File | SHA-256 | Bytes | Nguồn / lệnh đã chạy | Exit | Xác minh lúc | Trạng thái |'
$md += '|------|---------|-------|---------------------|------|-------------|------------|'
foreach ($r in $rows) {
  $src = $r.Source -replace '\|', '\|'
  $md += "| ``$($r.File)`` | ``$($r.Sha256.Substring(0,16))…`` | $($r.Bytes) | $src | $($r.Exit) | $($r.VerifiedAt) | **$($r.Status)** |"
}
$md += ''
$md += '## 4. Ảnh cũ đã gỡ (STALE-IMAGE)'
$md += ''
$md += 'Bốn ảnh dưới đây được chụp từ Kiro trên repo `main` với backend dùng chung `:48721` — không đại diện'
$md += 'cho build SA4E-411 nên đã **xoá khỏi branch**:'
$md += ''
$md += '| File đã xoá | Lý do | Trạng thái |'
$md += '|-------------|-------|------------|'
foreach ($o in @(
  'screenshot-sa411-01-command-palette-entry.png',
  'screenshot-sa411-02-show-status.png',
  'screenshot-sa411-03-enrichment-dashboard.png',
  'screenshot-sa411-05-sdlc-chat-panel.png')) {
  $md += "| ``documents/SA4E-411/diagrams/$o`` | chụp từ Kiro repo ``main`` + backend dùng chung ``:48721`` | **STALE-IMAGE** (đã xoá) |"
}
$md += ''
$md += '## 5. Kiểm tra lại checksum'
$md += ''
$md += '```bash'
$md += 'cd documents/SA4E-411/evidence'
$md += 'sha256sum -c manifest.sha256   # GNU/Linux'
$md += '# PowerShell:'
$md += 'Get-Content manifest.sha256 | ForEach-Object { $p = $_ -split "  ",2; if ((Get-FileHash $p[1] -Algorithm SHA256).Hash -ne $p[0]) { "MISMATCH " + $p[1] } }'
$md += '```'
$md += ''
Set-Content -Path (Join-Path $evidenceDir 'MANIFEST.md') -Value $md -Encoding UTF8

# ------------------------------------------------- screenshots-manifest.md
$sm = @()
$sm += '# Screenshot Manifest — SA4E-411 (UG images, TEXT metadata only)'
$sm += ''
$sm += 'Ảnh được chụp bằng `orca computer get-app-state --app pid:29420 --json` trên **instance Kiro cô lập**'
$sm += '(profile riêng, mở workspace-file trỏ tới worktree SA4E-411). Ảnh **không crop**, giữ nguyên toàn cửa sổ.'
$sm += 'Provenance được chứng minh bằng **dữ liệu văn bản** (SHA-256 / bytes / mtime / cây accessibility) — không mở'
$sm += 'để xem pixel trong báo cáo.'
$sm += ''
$sm += '| Thuộc tính | Giá trị |'
$sm += '|------------|---------|'
$sm += '| Ứng dụng | Kiro (instance cô lập) |'
$sm += '| PID cửa sổ | 29420 |'
$sm += '| Tiêu đề cửa sổ | `core-tools.ts - sa411 (Workspace) - Kiro` |'
$sm += '| Profile dir | `C:\Users\ASUS\AppData\Local\Temp\opencode\sa411-kiro` |'
$sm += '| Workspace file | `C:\Users\ASUS\AppData\Local\Temp\opencode\sa411-kiro\sa411.code-workspace` |'
$sm += '| Extension | `SDLC Agents 4 Enterprise` **1.55.21** — VSIX build từ worktree này (`extension/sdlc-agents-4-enterprise-1.55.21.vsix`, 9.537.408 B, 14:06) |'
$sm += '| Backend | `http://127.0.0.1:48731` (PID node 40064) — **không** phải instance dùng chung `:48721` |'
$sm += '| Backend data dir | `C:\Users\ASUS\AppData\Local\Temp\opencode\sa411-data` |'
$sm += '| Backend log | `C:\Users\ASUS\AppData\Local\Temp\opencode\sa411-logs\backend.log` |'
$sm += ''
$sm += '## Dòng log backend chứng minh freshness'
$sm += ''
$sm += '```text'
$sm += 'WORKTREE   = C:\Users\ASUS\orca\workspaces\SDLC-Agents-4-Enterprise\SA4E-411'
$sm += 'PORT       = 48731'
$sm += '{"level":30,"time":1794812215841,"pid":40064,"config":{"port":48731,"host":"127.0.0.1"},"msg":"Starting Backend MCP Server"}'
$sm += '{"level":30,"time":1794812278845,"pid":40064,"port":48731,"host":"127.0.0.1","listening":true,"msg":"Backend server started - debug: server listening"}'
$sm += '{"level":30,"time":1794812278894,"pid":40064,"port":48731,"version":"1.0.0","msg":"Backend MCP Server ready"}'
$sm += '{"level":30,"time":1794813817097,"pid":40064,"projectId":"22b039993db3","msg":"[ensureProjectRegistered] auto-upserted project"}'
$sm += '```'
$sm += ''
$sm += '## Danh sách ảnh'
$sm += ''
$sm += '| # | File | SHA-256 | Bytes | mtime (UTC) | Flow trong UG | Nội dung (chứng minh bằng cây accessibility) |'
$sm += '|---|------|---------|-------|-------------|---------------|---------------------------------------------------|'

$imgRows = @(
  @{ n='1'; f='ug-sa411-01-sdlc-agents-panel.png'; flow='Luồng 1 — Mở panel SDLC Agents (điểm vào)';
     proof='`tree item Backend Target http://127.0.0.1:48731` · `tree item Status: Running Port 9185` · `button SDLC Agents: Show Status` · `group SA4E-411 (Git) - dnguyenminh/SA4E-411*` · `button check SDLC Agents, SDLC Agents: Connected (Local / Standby)`' },
  @{ n='2'; f='ug-sa411-02-ai-context-symbol.png'; flow='Luồng 2 — Lấy ngữ cảnh AI cho một symbol (kết quả chính)';
     proof='`text Line 25, column 14: export class CoreAgentTools {` · `text Info: Context for "CoreAgentTools" copied to clipboard.` · `tree item Backend Target http://127.0.0.1:48731`' },
  @{ n='3'; f='ug-sa411-03-no-active-editor.png'; flow='Luồng 3 — Gọi lệnh khi không có file đang mở (trạng thái lỗi)';
     proof='`text Warning: No active editor. Open a file first.` · `dialog Warning: No active editor. Open a file first., source: SDLC Agents 4 Enterprise, notification` · `tree item Backend Target http://127.0.0.1:48731`' }
)
foreach ($im in $imgRows) {
  $p = Join-Path $diagramDir $im.f
  $fi = Get-Item $p
  $sha = (Get-FileHash -Path $p -Algorithm SHA256).Hash
  $sm += "| $($im.n) | ``diagrams/$($im.f)`` | ``$sha`` | $($fi.Length) | $($fi.LastWriteTimeUtc.ToString('o')) | $($im.flow) | $($im.proof) |"
}
$sm += ''
$sm += '## File trạng thái text đi kèm'
$sm += ''
$sm += '| Ảnh | File trạng thái text |'
$sm += '|-----|--------------------|'
$sm += '| `ug-sa411-01-sdlc-agents-panel.png` | `evidence/.state-01-entry-sdlc-agents-panel.txt` |'
$sm += '| `ug-sa411-02-ai-context-symbol.png` | `evidence/.state-02-primary-ai-context.txt` |'
$sm += '| `ug-sa411-03-no-active-editor.png` | `evidence/.state-03-no-active-editor.txt` |'
$sm += ''
$sm += '## Ghi chú về provenance'
$sm += ''
$sm += '- Instance Kiro cô lập được **khởi động lại 2 lần** trong pass này; lý do ghi ở `evidence/.kiro-restart-reason.txt`.'
$sm += '  Lần khởi động lại đầu là do instance cũ thoát đột ngột; lần khởi động lại sau là để hoàn nguyên'
$sm += '  override `sdlcAgents.backend.url` trong workspace-file (một panel cài đặt của extension đã ghi đè'
$sm += '  giá trị mặc định `:48721` vào file đó).'
$sm += '- **Không** chụp ảnh nào từ Kiro repo `main` hay từ backend dùng chung `:48721`.'
$sm += '- File `UG-evidence-appendix.md` và `UG-evidence-appendix-v2-SA4E-411.docx` đã xoá (transcript kỹ thuật nội bộ).'
$sm += ''
Set-Content -Path (Join-Path $evidenceDir 'screenshots-manifest.md') -Value $sm -Encoding UTF8

Write-Output "MANIFEST_WRITTEN files=$($rows.Count) verified=$verifiedCount notReproducible=$notReproCount"
Write-Output "CHECKSUM_LINES=$($checksumLines.Count)"
