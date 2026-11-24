# Home mode (D148): run update-images.sh on the first Sunday of every month at 04:00, after the
# 03:00 backup (it takes its own backup first anyway). It restarts PostgreSQL and Redis only when
# their images have a newer patch, and goes back by itself if the stack isn't healthy again.
# A missed run (the laptop off at 04:00) is skipped, not caught up later, so a database restart
# never lands in the middle of the day. Log: %USERPROFILE%\datingapp-backups\update.log.
# Run once, as yourself (no administrator needed):
#   powershell -NoProfile -ExecutionPolicy Bypass -File infra/beta/schedule-updates.ps1
# Running it again replaces the task. Remove it with:
#   Unregister-ScheduledTask -TaskName 'datingapp beta image updates'
$ErrorActionPreference = 'Stop'

$bash = Join-Path $env:ProgramFiles 'Git\bin\bash.exe'
if (-not (Test-Path $bash)) { throw "Git Bash not found at $bash" }
if ($PSScriptRoot -match ' ') { throw "The repo path has a space; move it or edit this script: $PSScriptRoot" }
$conhost = Join-Path $env:SystemRoot 'System32\conhost.exe'
$updateScript = '/' + $PSScriptRoot.Substring(0, 1).ToLower() + $PSScriptRoot.Substring(2).Replace('\', '/') + '/update-images.sh'
$arguments = "--headless `"$bash`" -lc `"BACKUP_DIR=`$HOME/datingapp-backups $updateScript &gt;&gt; `$HOME/datingapp-backups/update.log 2&gt;&amp;1`""
$user = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$start = (Get-Date -Hour 4 -Minute 0 -Second 0).ToString('yyyy-MM-ddTHH:mm:ss')

$xml = @"
<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>Monthly patch updates of the beta's PostgreSQL and Redis images, after a backup, with an automatic rollback. See replica/deploy.md.</Description>
  </RegistrationInfo>
  <Triggers>
    <CalendarTrigger>
      <StartBoundary>$start</StartBoundary>
      <Enabled>true</Enabled>
      <ScheduleByMonthDayOfWeek>
        <Weeks><Week>1</Week></Weeks>
        <DaysOfWeek><Sunday /></DaysOfWeek>
        <Months><January /><February /><March /><April /><May /><June /><July /><August /><September /><October /><November /><December /></Months>
      </ScheduleByMonthDayOfWeek>
    </CalendarTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <UserId>$user</UserId>
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>LeastPrivilege</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <StartWhenAvailable>false</StartWhenAvailable>
    <ExecutionTimeLimit>PT1H</ExecutionTimeLimit>
    <Enabled>true</Enabled>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>$conhost</Command>
      <Arguments>$arguments</Arguments>
    </Exec>
  </Actions>
</Task>
"@

Register-ScheduledTask -TaskName 'datingapp beta image updates' -Xml $xml -Force | Out-Null
$next = (Get-ScheduledTaskInfo -TaskName 'datingapp beta image updates').NextRunTime
"Scheduled for the first Sunday of each month at 04:00; next run: $next. Log: $env:USERPROFILE\datingapp-backups\update.log"
