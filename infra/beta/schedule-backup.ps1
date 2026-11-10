# Home mode (D097): run backup.sh every day at 03:00 from Windows Task Scheduler.
# Backups go to %USERPROFILE%\datingapp-backups (kept 7 days by backup.sh), with
# a log beside them. Run it once, as yourself (no administrator needed):
#   powershell -NoProfile -ExecutionPolicy Bypass -File infra/beta/schedule-backup.ps1
# Running it again replaces the task. Remove it with:
#   Unregister-ScheduledTask -TaskName 'datingapp beta backup'
$ErrorActionPreference = 'Stop'

$bash = Join-Path $env:ProgramFiles 'Git\bin\bash.exe'
if (-not (Test-Path $bash)) { throw "Git Bash not found at $bash" }
if ($PSScriptRoot -match ' ') { throw "The repo path has a space; move it or edit this script: $PSScriptRoot" }

# C:\Users\me\dating-app\infra\beta -> /c/Users/me/dating-app/infra/beta/backup.sh
$script = '/' + $PSScriptRoot.Substring(0, 1).ToLower() + $PSScriptRoot.Substring(2).Replace('\', '/') + '/backup.sh'
New-Item -ItemType Directory -Force (Join-Path $env:USERPROFILE 'datingapp-backups') | Out-Null

$action = New-ScheduledTaskAction -Execute $bash `
  -Argument "-lc `"BACKUP_DIR=`$HOME/datingapp-backups $script >> `$HOME/datingapp-backups/backup.log 2>&1`""
$trigger = New-ScheduledTaskTrigger -Daily -At 3:00am
# Catch up after a missed 03:00 (laptop off); never two at once; give up after 30 minutes.
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 30)

Register-ScheduledTask -TaskName 'datingapp beta backup' -Force -Action $action -Trigger $trigger -Settings $settings `
  -Description 'Daily backup of the closed beta (database and photos), kept 7 days in %USERPROFILE%\datingapp-backups. See replica/deploy.md.' |
  Out-Null

# One run now, so the setup is proven before the first night.
Start-ScheduledTask -TaskName 'datingapp beta backup'
"Scheduled daily at 03:00 and started once now. Log: $env:USERPROFILE\datingapp-backups\backup.log"
