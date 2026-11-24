# caffeinate처럼: 이 스크립트가 도는 동안만 절전·화면 꺼짐을 막는다(설정은 바꾸지 않는다).
# 묶음 스크립트(run_batch.sh·fetch_audio.sh)가 모두 끝나거나 최대 시간이 지나면 풀린다.
param([int]$MaxHours = 5)
Add-Type -Namespace Win32 -Name Power -MemberDefinition @'
[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint esFlags);
'@
$ES_CONTINUOUS = [uint32]2147483648; $ES_SYSTEM_REQUIRED = [uint32]1; $ES_DISPLAY_REQUIRED = [uint32]2
$deadline = (Get-Date).AddHours($MaxHours)
[Win32.Power]::SetThreadExecutionState($ES_CONTINUOUS -bor $ES_SYSTEM_REQUIRED -bor $ES_DISPLAY_REQUIRED) | Out-Null
"깨어 있기 시작 $(Get-Date -Format HH:mm:ss), 최대 $(Get-Date $deadline -Format HH:mm)"
try {
  while ((Get-Date) -lt $deadline) {
    $batch = Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*run_batch.sh*' -or $_.CommandLine -like '*fetch_audio.sh*' }
    if (-not $batch) { "묶음이 끝나서 해제 $(Get-Date -Format HH:mm:ss)"; break }
    Start-Sleep -Seconds 60
  }
} finally {
  [Win32.Power]::SetThreadExecutionState($ES_CONTINUOUS) | Out-Null
}
