# Dossier runner
# Written by Dossier. Two jobs, both local, neither touching the network:
#   1. scripts\queue        - run what Dossier asked for when you pressed $
#   2. routines in dossier.json marked 'run automatically' - fire them on time
# Start it with the schtasks line Dossier showed you, or double-click this file.
#
# It looks once a second. That is enough for a button press to feel instant and
# for a routine to hit its minute, and it costs nothing because a pass is a
# handful of file stats: dossier.json is re-parsed only when it changes.
#
# $PollSeconds is a long-stop re-read for folders whose modified-time cannot be
# trusted (OneDrive, network shares). On a local disk it never does anything.
# $TimeoutSeconds stops one stuck script from freezing everything else.
param([int]$PollSeconds = 300, [int]$TimeoutSeconds = 300)

$ErrorActionPreference = 'SilentlyContinue'
$scripts = $PSScriptRoot
$root    = Split-Path -Parent $scripts
$queue   = Join-Path $scripts 'queue'
$data    = Join-Path $root 'dossier.json'
$MaxOut  = 8KB           # how much of a script's output is kept

$seen     = @{}
$tries    = @{}          # requests that did not parse yet - see below
$doc      = $null        # last good parse of dossier.json
$docStamp = $null        # its modified-time, so we only parse again when it moves
$sig      = ''           # the self-running routines, so a change gets announced
$today    = ''
$nextRead = Get-Date
$nextTidy = Get-Date

# Pasted into a PowerShell window rather than run as a file, $PSScriptRoot is
# empty and everything below would quietly watch the wrong place.
if (-not $PSScriptRoot) {
  Write-Host 'Run this as a file - double-click it, or:'
  Write-Host '  powershell -ExecutionPolicy Bypass -File .\scripts\dossier-runner.ps1'
  Write-Host 'Pasted into a window, it has no idea which folder to watch.'
  Start-Sleep -Seconds 8
  return
}

# One runner per workspace. A double-click on top of the logon task would leave
# two of them draining the same queue, and a script could run twice. Naming the
# lock after the folder still lets a second workspace have its own runner.
# If any of this fails we start anyway: a duplicate runner is a nuisance, a
# runner that refuses to start is the bug you have been chasing all week.
$tag = 'default'
try {
  $sha = [Security.Cryptography.SHA1]::Create()
  $tag = [BitConverter]::ToString($sha.ComputeHash(
           [Text.Encoding]::UTF8.GetBytes($root.ToLower()))).Replace('-','').Substring(0,16)
  $sha.Dispose()
} catch { }
$mutex = $null
try { $mutex = New-Object System.Threading.Mutex($false, "Local\DossierRunner-$tag") } catch { }
if ($mutex -and -not $mutex.WaitOne(0)) {
  Write-Host "A Dossier runner is already watching $root."
  Write-Host 'Close that window first if you meant to restart it.'
  Start-Sleep -Seconds 5
  return
}

if (-not (Test-Path -LiteralPath $queue)) { New-Item -ItemType Directory -Path $queue | Out-Null }
Write-Host "Dossier runner watching $queue"
Write-Host "and the routines in $data"
Write-Host 'Looking once a second. Nothing here waits out a timer.'

function Write-Result($path, $id, $exit, $text, $routine, $forDate, $task) {
  # Capped, because a chatty script left running all day should not be able to
  # fill the folder. Dossier only keeps the first 4 KB in the log anyway.
  $t = ([string]$text).Trim()
  if ($t.Length -gt $MaxOut) { $t = $t.Substring(0, $MaxOut) + "`r`n... (cut at 8 KB)" }
  $o = [pscustomobject]@{ id = $id; exit = $exit; at = (Get-Date).ToString('o');
                          routine = $routine; forDate = $forDate; task = $task; output = $t }
  $o | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath $path -Encoding UTF8
}

# Runs a file that is already in scripts\. Never a command line: the name is
# checked for path separators and '..' and must resolve to a file sitting here.
function Invoke-DossierScript([string]$name, $argValues, [string]$tmpId) {
  if (-not $name -or $name -match '[\\/:"]' -or $name -match '\.\.') {
    throw "refused: '$name' is not a plain file name" }
  if (-not (Test-Path -LiteralPath (Join-Path $scripts $name) -PathType Leaf)) {
    throw "not found: $name" }

  # Values are handed to cmd.exe, which re-reads its own metacharacters, so a
  # value carrying one could run something nobody asked for. Refuse, not quote.
  $argLine = ''
  if ($argValues) { foreach ($p in $argValues.PSObject.Properties) {
    $v = "$($p.Value)"
    if ($null -eq $p.Value -or $v -eq '') { continue }
    if ($v -match '[&|<>^"`\r\n]') {
      throw "refused: the value for '$($p.Name)' contains a shell character" }
    $argLine += ' ' + $(if ($v -match '\s') { '"' + $v + '"' } else { $v }) } }

  # The working directory is scripts\, so the bare name is enough - which also
  # sidesteps every quoting rule a full path with spaces in it would drag in.
  switch ([IO.Path]::GetExtension($name).ToLower()) {
    '.ps1'  { $exe = 'powershell.exe'
              $pre = '-NoProfile -ExecutionPolicy Bypass -File "' + $name + '"' }
    '.bat'  { $exe = 'cmd.exe'; $pre = '/c call "' + $name + '"' }
    '.cmd'  { $exe = 'cmd.exe'; $pre = '/c call "' + $name + '"' }
    '.py'   { $exe = 'python';  $pre = '"' + $name + '"' }
    default { throw "cannot run a $([IO.Path]::GetExtension($name)) file" }
  }

  $o = Join-Path $queue ($tmpId + '.out.tmp')
  $e = Join-Path $queue ($tmpId + '.err.tmp')
  $proc = Start-Process -FilePath $exe -ArgumentList ($pre + $argLine) `
            -WorkingDirectory $scripts -NoNewWindow -PassThru `
            -RedirectStandardOutput $o -RedirectStandardError $e

  # A script that waits for input would otherwise hold the runner for ever:
  # no queue, no routines, and Dossier reporting that nothing answered.
  $timedOut = $false
  if (-not $proc.WaitForExit($TimeoutSeconds * 1000)) {
    $timedOut = $true
    try { Stop-Process -Id $proc.Id -Force } catch { }
    [void]$proc.WaitForExit(5000)
  }

  $out = ''
  foreach ($f in @($o, $e)) {
    if (Test-Path -LiteralPath $f) {
      $out += (Get-Content -Raw -LiteralPath $f)
      Remove-Item -LiteralPath $f -Force } }

  if ($timedOut) {
    return [pscustomobject]@{ exit = -2
      output = $out + "`r`n*** stopped after $TimeoutSeconds seconds - it never finished ***" } }
  return [pscustomobject]@{ exit = $proc.ExitCode; output = $out }
}

# The same rule Dossier uses to decide whether a routine is due today.
function Routine-Due($r, $now) {
  if ($r.paused) { return $false }
  $d = [int]$now.DayOfWeek
  switch ([string]$r.freq) {
    'daily'    { return $true }
    'weekdays' { return ($d -ge 1 -and $d -le 5) }
    'weekly'   { return (@($r.days) -contains $d) }
    'monthly'  { return ($now.Day -eq [int]$r.dom) }
  }
  return $false
}

while ($true) {

  # ---- 1. anything Dossier put in the queue ------------------------------
  foreach ($req in @(Get-ChildItem -LiteralPath $queue -Filter '*.run.json' -File)) {
    $id   = $req.Name -replace '\.run\.json$',''
    $done = Join-Path $queue ($id + '.done.json')
    $j = $null
    try { $j = Get-Content -Raw -LiteralPath $req.FullName | ConvertFrom-Json } catch { }

    if (-not $j -or -not $j.script) {
      # Dossier truncates the file to rewrite it, so an empty or half-written
      # read means we looked mid-save - not that the request is bad. Look again
      # next second, and only call it broken once it stays unreadable.
      $n = [int]$tries[$id] + 1
      $tries[$id] = $n
      if ($n -lt 10) { continue }
      Write-Result $done $id -1 'the request file could not be read' $null $null $null
      Remove-Item -LiteralPath $req.FullName -Force
      $tries.Remove($id)
      continue
    }
    $tries.Remove($id)

    # Taken before it is run, so being killed mid-script cannot run it twice.
    # If it will not delete, do not run it either - it would come round again
    # next second, and again, for as long as the file stays put.
    Remove-Item -LiteralPath $req.FullName -Force
    if (Test-Path -LiteralPath $req.FullName) {
      if (-not $seen['lock-' + $id]) { $seen['lock-' + $id] = $true
        Write-Host ("  cannot take {0} - something else has it open" -f $req.Name) }
      continue
    }
    try {
      $r = Invoke-DossierScript ([string]$j.script) $j.args $id
      Write-Result $done $id $r.exit $r.output $null $null ([string]$j.task)
    } catch {
      Write-Result $done $id -1 $_.Exception.Message $null $null ([string]$j.task)
    }
  }

  # ---- 2. read dossier.json, but only when it has actually changed --------
  # Parsing it is the one expensive thing here and it grows with your work, so
  # we check the modified-time instead - microseconds - and re-parse only when
  # it moves. That is what lets the routines be checked every pass rather than
  # on a timer. If the parse fails we keep the last good copy: Dossier
  # truncates the file to rewrite it, so a read can land mid-save, and that is
  # not a reason to stop firing routines.
  if (Test-Path -LiteralPath $data) {
    $lw = $null
    try { $lw = (Get-Item -LiteralPath $data).LastWriteTimeUtc } catch { }
    if ($lw -and ($lw -ne $docStamp -or (Get-Date) -ge $nextRead)) {
      $nextRead = (Get-Date).AddSeconds($PollSeconds)
      try {
        $fresh = Get-Content -Raw -LiteralPath $data | ConvertFrom-Json
        if ($fresh) { $doc = $fresh; $docStamp = $lw }
      } catch { }
    }
  }

  # ---- 3. routines that run themselves ------------------------------------
  if ($doc) {
    try {
      $now   = Get-Date
      $stamp = $now.ToString('yyyy-MM-dd')
      $auto  = @($doc.routines) | Where-Object { $_.autoRun }

      # A new day, or an edit you just made in Dossier - say what is watched
      # now. Seeing your own change echoed here is the proof the runner is
      # reading the copy of the workspace you think it is.
      $now_sig = (($auto | ForEach-Object { $_.title + ' @' + $_.time }) -join ', ')
      if ($stamp -ne $today) { $today = $stamp; $seen = @{}; $sig = '' }
      if ($now_sig -ne $sig) { $sig = $now_sig; $seen = @{}
        if (@($auto).Count -eq 0) {
          Write-Host 'No routine is set to run on its own (Menu > Routines > On its own).' }
        else { Write-Host ("Watching {0} self-running routine(s): {1}" -f @($auto).Count, $now_sig) } }

      foreach ($rt in @($doc.routines)) {
        if (-not $rt.autoRun) { continue }
        if (-not $rt.scripts -or @($rt.scripts).Count -eq 0) { continue }
        if (-not (Routine-Due $rt $now)) { continue }

        # once a day, whatever else happens - the marker is the guarantee
        $mark = Join-Path $queue ('.auto-' + $rt.id + '-' + $stamp + '.txt')
        if (Test-Path -LiteralPath $mark) {
          if (-not $seen[$rt.id]) { $seen[$rt.id] = $true
            Write-Host ("  '{0}' already ran today - delete {1} to run it again" -f $rt.title, $mark) }
          continue }

        # not before its time; if the machine was off, it catches up
        $at = $null
        [void][datetime]::TryParse(($stamp + ' ' + [string]$rt.time), [ref]$at)
        if ($at -and $now -lt $at) {
          if (-not $seen[$rt.id]) { $seen[$rt.id] = $true
            Write-Host ("  '{0}' waits until {1}" -f $rt.title, $rt.time) }
          continue }

        $sid  = [string]@($rt.scripts)[0]
        $sc   = @($doc.scripts) | Where-Object { $_.id -eq $sid } | Select-Object -First 1
        if (-not $sc) { continue }

        # marked before it is run: a script that crashes the runner must not
        # be retried in a loop for the rest of the day
        Set-Content -LiteralPath $mark -Value $now.ToString('o') -Encoding UTF8
        $id   = 'auto-' + $rt.id + '-' + $stamp
        $done = Join-Path $queue ($id + '.done.json')
        Write-Host ("[{0}] running {1} for routine '{2}'" -f $now.ToString('HH:mm:ss'), $sc.file, $rt.title)
        try {
          $r = Invoke-DossierScript ([string]$sc.file) $null $id
          Write-Result $done $id $r.exit $r.output $rt.id $stamp $null
          $first = (($r.output -split "`n") | Where-Object { $_.Trim() } | Select-Object -First 1)
          Write-Host ("           exit {0}  {1}" -f $r.exit, $first)
        } catch {
          Write-Result $done $id -1 $_.Exception.Message $rt.id $stamp $null
          Write-Host ("           FAILED  {0}" -f $_.Exception.Message)
        }
      }
    } catch { }
  }

  # ---- tidy up, once a minute ---------------------------------------------
  # Results Dossier has read are deleted by Dossier; these are the orphans -
  # written while it was closed, or for a record since deleted.
  if ((Get-Date) -ge $nextTidy) {
    $nextTidy = (Get-Date).AddSeconds(60)
    $cut = Get-Date
    foreach ($old in @(Get-ChildItem -LiteralPath $queue -File)) {
      if ($old.Name -like '*.done.json' -and $old.LastWriteTime -lt $cut.AddDays(-1)) {
        Remove-Item -LiteralPath $old.FullName -Force }
      if ($old.Name -like '*.tmp' -and $old.LastWriteTime -lt $cut.AddHours(-1)) {
        Remove-Item -LiteralPath $old.FullName -Force }
      if ($old.Name -like '.auto-*' -and $old.LastWriteTime -lt $cut.AddDays(-7)) {
        Remove-Item -LiteralPath $old.FullName -Force }
    }
  }

  Start-Sleep -Seconds 1
}
