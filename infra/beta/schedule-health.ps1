# Home mode (D097, D143): run health_check.py every hour from Windows Task Scheduler.
# It emails the owner only when something changes (see the script's first lines);
# its state and a one-line-per-run log sit beside the backups, in
# %USERPROFILE%\datingapp-backups (health-state.json, health.log).
# Run it once, as yourself (no administrator needed):
#   powershell -NoProfile -ExecutionPolicy Bypass -File infra/beta/schedule-health.ps1
# Running it again replaces the task; -NoRun skips the run it starts straight away
# (the first run sends "The health check is on: all well", which proves email works).
# Remove it with:
#   Unregister-ScheduledTask -TaskName 'datingapp beta health check'
# Like the backup, it runs through a headless console host: no window ever opens.
param([switch]$NoRun)
$ErrorActionPreference = 'Stop'

$py = Join-Path $env:SystemRoot 'py.exe'
if (-not (Test-Path $py)) { throw "The Python launcher wasn't found at $py" }
$conhost = Join-Path $env:SystemRoot 'System32\conhost.exe'
$checkScript = Join-Path $PSScriptRoot 'health_check.py'
if (-not (Test-Path (Join-Path $PSScriptRoot '.env'))) { throw "No .env beside $($checkScript): run make-env.sh first" }

$action = New-ScheduledTaskAction -Execute $conhost -Argument "--headless `"$py`" -I `"$checkScript`""
# Every hour from the next full hour, for as long as the task exists.
$start = (Get-Date).Date.AddHours((Get-Date).Hour + 1)
$trigger = New-ScheduledTaskTrigger -Once -At $start -RepetitionInterval (New-TimeSpan -Hours 1)
# A missed hour (the laptop asleep) runs once on waking; never two at once; ten minutes at most.
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 10)

Register-ScheduledTask -TaskName 'datingapp beta health check' -Force -Action $action -Trigger $trigger -Settings $settings `
  -Description 'Hourly health check of the closed beta; emails the owner when something changes. See replica/deploy.md.' |
  Out-Null

if ($NoRun) {
  "Scheduled hourly from $($start.ToString('HH:mm')). Log: $env:USERPROFILE\datingapp-backups\health.log"
} else {
  Start-ScheduledTask -TaskName 'datingapp beta health check'
  "Scheduled hourly from $($start.ToString('HH:mm')) and started once now. Log: $env:USERPROFILE\datingapp-backups\health.log"
}
