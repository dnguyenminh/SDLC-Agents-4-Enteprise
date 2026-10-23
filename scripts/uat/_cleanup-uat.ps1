= Kill ONLY processes launched for UAT (flagged). Never touch a bare user Kiro.exe.
$flagged = Get-CimInstance Win32_Process | Where-Object {
  $_.Name -in @('Code.exe','Kiro.exe') -and (
    ($_.CommandLine -like '*extension-development-path*') -or
    ($_.CommandLine -like '*uat-*'))
}
foreach ($p in $flagged) { try { Stop-Process -Id $p.ProcessId -Force -ErrorAction Stop; Write-Output ('KILLED ' + $p.ProcessId + ' ' + $p.Name) } catch {} }
Write-Output ('FLAGGED=' + @($flagged).Count)
$oldStub = Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -like '*llm-stub.mjs*' }
foreach ($p in $oldStub) { try { Stop-Process -Id $p.ProcessId -Force -ErrorAction Stop; Write-Output ('KILLED-STUB ' + $p.ProcessId) } catch {} }