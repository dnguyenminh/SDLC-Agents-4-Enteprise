<#
.SYNOPSIS
    Kiểm tra kết nối API cho tất cả model NVIDIA (Integrate API, OpenAI-compatible).
.DESCRIPTION
    - Lấy danh sách model từ /v1/models (hoặc dùng danh sách có sẵn nếu endpoint trả về rỗng).
    - Với mỗi model: GET /v1/models/{model} để kiểm tra quyền (auth) + tồn tại.
    - In ra bảng kết quả: model, status, latency, lỗi.
.PARAMETER ApiKey
    API key NVIDIA (sk-...). Không để trong script; lấy từ tham số để không bị lưu vào git.
.PARAMETER BaseUrl
    Base URL. Mặc định https://integrate-api.nvidia.com/v1
.PARAMETER MaxRetries
    Số lần thử lại cho mỗi model. Mặc định 2.
.PARAMETER Timeout
    Timeout mỗi request (giây). Mặc định 30.
.PARAMETER SaveCsv
    Nếu true, lưu kết quả ra report-nvidia-models.csv.
.EXAMPLE
    .\test-nvidia-models.ps1 -ApiKey "sk-..." -SaveCsv $true
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$ApiKey,

    [string]$BaseUrl = "https://integrate-api.nvidia.com/v1",

    [int]$MaxRetries = 2,

    [int]$Timeout = 30,

    [switch]$SaveCsv
)

$ErrorActionPreference = "Stop"
$Headers = @{ Authorization = "Bearer $ApiKey" }

# Danh sách model NVIDIA phổ biến (bổ sung nếu /v1/models trả về rỗng/không có model cần test)
$FALLBACK_MODELS = @(
    "nvidia/llama-3.1-nemotron-70b-unstructured",
    "nvidia/nemotron-4-34b-instruct",
    "nvidia/nemotron-4-distill-34b-v3",
    "nvidia/nemotron-4-34b-reward",
    "nvidia/llama-3.1-nemotron-70b-reward",
    "nvidia/llama-3.3-70b-instruct",
    "nvidia/llama-3.1-8b-instruct",
    "nvidia/llama-3.1-8b-8k-instruct",
    "nvidia/llama-3.1-70b-instruct",
    "nvidia/llama-3.1-405b-instruct",
    "nvidia/llama-3.1-405b-reasoning",
    "nvidia/llama-3.3-70b-specialedition-instruct",
    "nvidia/llama-3.1-nemotron-70b-a55b",
    "nvidia/nemotron-3-ultra-550b-a55b",
    "nvidia/nemotron-3-ultra-550b-a55b-128k",
    "nvidia/nemotron-3-mini-12.4b",
    "nvidia/nemotron-3-the-3-billion",
    "nvidia/nemotron-3-science-12b",
    "nvidia/nemotron-3-reasoning-12b",
    "nvidia/nemotron-3-nano-1b",
    "nvidia/nemotron-3-mini-1b"
)

function Get-NvidiaModels {
    param([int]$Retry)

    try {
        $resp = Invoke-RestMethod -Uri "${BaseUrl}/models" -Method GET -Headers $Headers `
            -TimeoutSec $Timeout -ErrorAction Stop -RetrySequence @($Retry)
        if ($resp -is [System.Collections.IEnumerable]) {
            return ($resp | ForEach-Object { $_.id } | Where-Object { $_ })
        }
    } catch {
        Write-Host "  [WARN] Không lấy được danh sách từ /v1/models: $($_.Exception.Message)"
    }
    return $FALLBACK_MODELS
}

function Test-Model {
    param([string]$Model, [int]$Retry)

    $modelUrl = "${BaseUrl}/models/$Model"
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $status = $null
    $error = $null
    try {
        $resp = Invoke-RestMethod -Uri $modelUrl -Method GET -Headers $Headers `
            -TimeoutSec $Timeout -ErrorAction Stop -RetrySequence @($Retry)
        $status = $resp.status
        if (-not $status) { $status = "OK" }
        return [PSCustomObject]@{
            Model      = $Model
            Status     = $status
            LatencyMs = $sw.ElapsedMilliseconds
            Error      = ""
            ErrorType  = "AUTH_OK"
        }
    } catch {
        $error = $_.Exception.Message
        $msg = $_.ErrorRecord.Message
        if ($msg -match "^\d{3}(?:::\d+)? ") { $status = $matches[1] }
        return [PSCustomObject]@{
            Model      = $Model
            Status     = $status
            LatencyMs  = $sw.ElapsedMilliseconds
            Error      = $error
            ErrorType  = "AUTH_FAIL"
        }
    }
}

Write-Host "`n=== NVIDIA API Connection Test ===" -ForegroundColor Cyan
Write-Host ("Base URL : {0}" -f $BaseUrl) -ForegroundColor White
Write-Host ("API Key  : {0}" -f ("sk-****" + $ApiKey.Substring(4))) -ForegroundColor White
Write-Host ("Timeout  : {0}s | Retry : {1}" -f $Timeout, $MaxRetries) -ForegroundColor White
Write-Host "================================================`n" -ForegroundColor DarkGray

$models = Get-NvidiaModels -Retry $MaxRetries

# Gộp: union của danh sách trả về và danh sách fallback (để chắc test hết)
$seen = [System.Collections.Generic.HashSet[string]]::new()
$all = [System.Collections.Generic.List[string]]::new()
foreach ($m in @($models) + $FALLBACK_MODELS) {
    if (-not $seen.Contains($m)) { $seen.Add($m); $all.Add($m) }
}

Write-Host ("Tổng cộng {0} model sẽ được kiểm tra." -f $all.Count) -ForegroundColor Yellow
Write-Host "`n--- Bắt đầu ---`n" -ForegroundColor DarkGray

$results = [System.Collections.Generic.List[object]]::new()
foreach ($m in $all) {
    Write-Host ("[*] {0}" -f $m) -ForegroundColor Gray
    $r = Test-Model -Model $m -Retry $MaxRetries
    $results.Add($r)
    $color = if ($r.ErrorType -eq "AUTH_OK") { "Green" } else { "Red" }
    Write-Host ("    [{0}] {1}" -f $color, $r.Status) -ForegroundColor ($color)
    if ($r.ErrorType -ne "AUTH_OK") { Write-Host ("      -> $($r.Error)") -ForegroundColor DarkRed }
    Start-Sleep -Milliseconds 200
}

Write-Host "`n--- Tổng kết ---" -ForegroundColor Cyan
$ok = $results | Where-Object { $_.ErrorType -eq "AUTH_OK" }
$bad = $results | Where-Object { $_.ErrorType -ne "AUTH_OK" }
Write-Host ("OK   : {0}/{1}" -f $ok.Count, $results.Count) -ForegroundColor Green
if ($bad.Count -gt 0) {
    Write-Host "`nMô hình KHÔNG được quyền (401/403):" -ForegroundColor Red
    $bad | Select-Object -ExpandProperty Model | ForEach-Object { Write-Host "  - $_" }
    Write-Host "`n=> Key chưa được cấp quyền cho các model trên. Cần key mới (cấp quyền từng model)." -ForegroundColor Yellow
} else {
    Write-Host "`nTất cả model đều có quyền. Kết nối thành công!" -ForegroundColor Green
}

if ($SaveCsv) {
    $csvPath = "report-nvidia-models.csv"
    $results | Export-Csv -Path $csvPath -NoTypeInformation -Encoding UTF8
    Write-Host "`nĐã lưu báo cáo: $csvPath" -ForegroundColor Cyan
}
