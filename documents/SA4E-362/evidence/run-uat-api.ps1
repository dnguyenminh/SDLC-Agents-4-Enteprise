# UAT API Runner — SA4E-362 (Part B/C at API level, Part D where applicable)
# Env: backend started with CODE_INTEL_PORT=9191, CODE_INTEL_REQUIRE_AUTH=true, ACCESS_TTL_SEC=60 (temp)
$ErrorActionPreference = 'Continue'
$base = 'http://127.0.0.1:9191'
$results = [ordered]@{}
$log = @()
function Note($id, $name, $pass, $detail) {
  $script:results[$id] = [ordered]@{ name = $name; pass = [bool]$pass; detail = $detail }
  $script:log += "[$id] $(if($pass){'PASS'}else{'FAIL'}) — $name :: $detail"
  Write-Host "[$id] $(if($pass){'PASS'}else{'FAIL'}) — $name"
}
$ckA = 'a' * 64   # ingested successfully pre-expiry
$ckA2 = 'b' * 64  # ingested via refresh-retry after 401
$ckB = 'c' * 64   # submitted ONLY with expired token -> must NEVER be stored
$ruleBody = { param($ck) @{ ruleJson = @{ pxObjClass = 'Rule-Obj-Activity'; pyRuleName = "UatRule_$($ck.Substring(0,4))"; pxInsName = 'UatRule' }; checksum = $ck } | ConvertTo-Json -Depth 5 }
$h = { param($tok) @{ 'Content-Type' = 'application/json'; 'Authorization' = "Bearer $tok"; 'X-Project-Id' = 'uat-project-01'; 'x-client-type' = 'extension' } }

# 0. Readiness poll
$ready = $false
for ($i = 0; $i -lt 45; $i++) {
  try {
    $r = Invoke-WebRequest -Uri "$base/api/admin/auth/login" -Method POST -ContentType 'application/json' -Body '{"username":"x","password":"y"}' -SkipHttpErrorCheck -TimeoutSec 5
    if ($r.StatusCode -ge 400) { $ready = $true; break }
  } catch { Start-Sleep -Seconds 2 }
}
Note 'PREP-01' 'Backend ready + auth enforced' $ready "login probe responded (bad creds => 4xx)"

# 1. Login (T0)
$t0 = Get-Date
$login = Invoke-RestMethod -Uri "$base/api/admin/auth/login" -Method POST -ContentType 'application/json' -Headers @{ 'x-client-type' = 'extension' } -Body '{"username":"admin","password":"UatAdminPass2026"}'
$at1 = $login.accessToken; $rt1 = $login.refreshToken
Note 'PREP-02' 'Login OK, dual-token issued' ([bool]$at1 -and [bool]$rt1) "accessToken len=$($at1.Length), refreshToken len=$($rt1.Length)"

# 1b. Register project (real extension flow: register before indexing)
$rreg = Invoke-WebRequest -Uri "$base/api/admin/projects/register" -Method POST -ContentType 'application/json' -Headers (& $h $at1) -Body (@{ projectId = 'uat-project-01'; displayName = 'UAT SA4E-362' } | ConvertTo-Json) -SkipHttpErrorCheck
Note 'PREP-03' 'Register project uat-project-01' ($rreg.StatusCode -eq 200) "HTTP $($rreg.StatusCode): $($rreg.Content.Substring(0, [Math]::Min(100, $rreg.Content.Length)))"

# 2. E2E-API-01: ingest-rule 200 with fresh token
$r1 = Invoke-WebRequest -Uri "$base/api/v1/pega/ingest-rule" -Method POST -ContentType 'application/json' -Headers (& $h $at1) -Body (& $ruleBody $ckA) -SkipHttpErrorCheck
Note 'E2E-API-01' 'POST /pega/ingest-rule => 200 (auth ok)' ($r1.StatusCode -in 200,201) "HTTP $($r1.StatusCode): $($r1.Content.Substring(0, [Math]::Min(120, $r1.Content.Length)))"

# 3. E2E-API-04a: bulk-check sees checksumA
$r2 = Invoke-WebRequest -Uri "$base/api/v1/pega/rulecatalog/bulk-check" -Method POST -ContentType 'application/json' -Headers (& $h $at1) -Body (@{ checksums = @($ckA) } | ConvertTo-Json) -SkipHttpErrorCheck
$existsA = ($r2.Content -match $ckA)
Note 'E2E-API-04' 'POST /pega/rulecatalog/bulk-check contract' ($r2.StatusCode -eq 200 -and $existsA) "HTTP $($r2.StatusCode), existing contains ckA=$existsA"

# 4. E2E-API-02: ingest-stream NDJSON => 202 + jobId
$lines = @((& $ruleBody $ckA) -replace "`r?`n", '') + @((& $ruleBody $ckA2) -replace "`r?`n", '')
$ndjson = $lines -join "`n"
$r3 = Invoke-WebRequest -Uri "$base/api/v1/pega/ingest-stream" -Method POST -ContentType 'application/x-ndjson' -Headers (& $h $at1) -Body $ndjson -SkipHttpErrorCheck
$jobId = $null
try { $jobId = ($r3.Content | ConvertFrom-Json).data.jobId } catch {}
Note 'E2E-API-02' 'POST /pega/ingest-stream => 202 + jobId' ($r3.StatusCode -eq 202 -and $jobId) "HTTP $($r3.StatusCode), jobId=$jobId"

# 5. E2E-API-03: poll jobs/:id until done
$done = $false; $last = ''
for ($i = 0; $i -lt 15; $i++) {
  Start-Sleep -Seconds 2
  $r4 = Invoke-WebRequest -Uri "$base/api/v1/pega/jobs/$jobId" -Method GET -Headers (& $h $at1) -SkipHttpErrorCheck
  $last = $r4.Content
  try { if (($r4.Content | ConvertFrom-Json).data.status -in @('done', 'completed', 'failed')) { $done = $true; break } } catch {}
}
Note 'E2E-API-03' "GET /pega/jobs/:id poll => terminal state" $done "last=$($last.Substring(0, [Math]::Min(160, $last.Length)))"

# 6. SIT-01a: wait past TTL(60s) -> expired token => 401 'Invalid or expired token'
$elapsed = ((Get-Date) - $t0).TotalSeconds
if ($elapsed -lt 65) { Start-Sleep -Seconds (65 - $elapsed) }
$r5 = Invoke-WebRequest -Uri "$base/api/v1/pega/ingest-rule" -Method POST -ContentType 'application/json' -Headers (& $h $at1) -Body (& $ruleBody $ckB) -SkipHttpErrorCheck
$expiredMsg = ($r5.Content -match 'Invalid or expired token')
Note 'SIT-01a' 'Expired access token => 401 Invalid or expired token (bug symptom reproduced)' ($r5.StatusCode -eq 401 -and $expiredMsg) "HTTP $($r5.StatusCode): $($r5.Content.Substring(0, [Math]::Min(140, $r5.Content.Length)))"

# 7. SIT-01b: refresh rotation => new accessToken
$r6 = Invoke-WebRequest -Uri "$base/api/auth/refresh" -Method POST -ContentType 'application/json' -Body (@{ refresh_token = $rt1 } | ConvertTo-Json) -SkipHttpErrorCheck
$at2 = $null; $rt2 = $null
try { $j = ($r6.Content | ConvertFrom-Json); $at2 = $j.data.accessToken; $rt2 = $j.data.refreshToken } catch {}
Note 'SIT-01b' 'POST /api/auth/refresh => rotated dual token' ($r6.StatusCode -eq 200 -and $at2 -and $at2 -ne $at1) "HTTP $($r6.StatusCode), new token differs=$($at2 -ne $at1)"

# 8. SIT-01c: retry with refreshed token => 200 (the fetchWithAuthRetry contract)
$r7 = Invoke-WebRequest -Uri "$base/api/v1/pega/ingest-rule" -Method POST -ContentType 'application/json' -Headers (& $h $at2) -Body (& $ruleBody $ckA2) -SkipHttpErrorCheck
Note 'SIT-01c' 'Retry after refresh => 200 (single retry contract)' ($r7.StatusCode -in 200,201) "HTTP $($r7.StatusCode): $($r7.Content.Substring(0, [Math]::Min(120, $r7.Content.Length)))"

# 9. No-side-effect: 401-before-handler — ckB (submitted only with expired token) must NOT exist; ckA2 must exist
$r8 = Invoke-WebRequest -Uri "$base/api/v1/pega/rulecatalog/bulk-check" -Method POST -ContentType 'application/json' -Headers (& $h $at2) -Body (@{ checksums = @($ckB, $ckA2) } | ConvertTo-Json) -SkipHttpErrorCheck
$hasB = ($r8.Content -match $ckB); $hasA2 = ($r8.Content -match $ckA2)
Note 'E2E-API-04b' '401-before-handler: rejected request stored NOTHING' ((-not $hasB) -and $hasA2) "ckB in existing=$hasB (expect False), ckA2 in existing=$hasA2 (expect True)"

# 10. SIT-02: revoke refresh (logout) => refresh 401 => extension would stop cleanly
$r9 = Invoke-WebRequest -Uri "$base/api/admin/auth/logout" -Method POST -ContentType 'application/json' -Body (@{ refresh_token = $rt2 } | ConvertTo-Json) -SkipHttpErrorCheck
$r10 = Invoke-WebRequest -Uri "$base/api/auth/refresh" -Method POST -ContentType 'application/json' -Body (@{ refresh_token = $rt2 } | ConvertTo-Json) -SkipHttpErrorCheck
Note 'SIT-02' 'Revoked refresh token => refresh 401 (auth-dead path)' ($r9.StatusCode -eq 200 -and $r10.StatusCode -eq 401) "logout HTTP $($r9.StatusCode), refresh-after-logout HTTP $($r10.StatusCode)"

# 11. SIT-02b: garbage refresh token => 401
$r11 = Invoke-WebRequest -Uri "$base/api/auth/refresh" -Method POST -ContentType 'application/json' -Body '{"refresh_token":"dead-token-000"}' -SkipHttpErrorCheck
Note 'SIT-02b' 'Invalid refresh token => 401, no crash' ($r11.StatusCode -eq 401) "HTTP $($r11.StatusCode): $($r11.Content.Substring(0, [Math]::Min(120, $r11.Content.Length)))"

# Summary
$passCount = ($results.Values | Where-Object { $_.pass }).Count
$total = $results.Count
$summary = [ordered]@{ executedAt = (Get-Date).ToString('o'); total = $total; passed = $passCount; failed = $total - $passCount; results = $results }
$summary | ConvertTo-Json -Depth 5 | Set-Content "$PSScriptRoot\uat-api-results.json" -Encoding UTF8
$log | Set-Content "$PSScriptRoot\uat-api-transcript.txt" -Encoding UTF8
Write-Host "=== UAT API: $passCount/$total PASS ==="

