# Dossier runner
# Written by Dossier. Two jobs, both local, neither touching the network:
#   1. scripts\queue        - run what Dossier asked for when you pressed $
#   2. routines in dossier.json marked 'run automatically' - fire them on time
# Start it with the schtasks line Dossier showed you, or double-click this file.
# Everything is checked every 400ms - the queue and the routines both, so
# pressing $ or Run now starts the script straight away and a routine fires
# within half a second of its time.
#
# dossier.json is re-parsed only when its modified-time moves. Parsing is
# the one thing here that gets slower as your work piles up, so it must not
# happen on a timer. $PollSeconds is only a long-stop re-read for folders
# whose modified-time cannot be trusted (OneDrive, network shares); on a
# normal local disk it never does anything useful. Leave it alone.
param([int]$PollSeconds = 300)

$ErrorActionPreference = 'SilentlyContinue'
$scripts = $PSScriptRoot
$root    = Split-Path -Parent $scripts
$queue   = Join-Path $scripts 'queue'
$data    = Join-Path $root 'dossier.json'
$seen     = @{}
$doc      = $null      # last good parse of dossier.json
$docStamp = $null      # its modified-time, so we only parse again when it moves
$sig      = ''         # the self-running routines, so a change gets announced
$today    = ''
$nextRead = Get-Date
$nextTidy = Get-Date
if (-not (Test-Path -LiteralPath $queue)) { New-Item -ItemType Directory -Path $queue | Out-Null }
Write-Host "Dossier runner watching $queue"
Write-Host "and the routines in $data"
Write-Host 'Checking every 400ms. Nothing here waits out a timer.'

function Write-Result($path, $id, $exit, $text, $routine, $forDate) {
  $o = [pscustomobject]@{ id = $id; exit = $exit; at = (Get-Date).ToString('o');
                          routine = $routine; forDate = $forDate;
                          output = ([string]$text).Trim() }
  $o | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath $path -Encoding UTF8
}

# Runs a file that is already in scripts\. Never a command line: the name is
# checked for path separators and '..' and must resolve to a file sitting here.
function Invoke-DossierScript([string]$name, $argValues) {
  if (-not $name -or $name -match '[\\/:]' -or $name -match '\.\.') {
    throw "refused: '$name' is not a plain file name" }
  $path = Join-Path $scripts $name
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "not found: $name" }
  $argList = @()
  if ($argValues) { foreach ($p in $argValues.PSObject.Properties) {
    if ($null -ne $p.Value -and "$($p.Value)" -ne '') { $argList += "$($p.Value)" } } }
  $ext = [IO.Path]::GetExtension($name).ToLower()
  $global:LASTEXITCODE = 0
  switch ($ext) {
    '.ps1' { $out = & powershell -NoProfile -ExecutionPolicy Bypass -File $path @argList 2>&1 }
    '.bat' { $out = & cmd.exe /c $path @argList 2>&1 }
    '.cmd' { $out = & cmd.exe /c $path @argList 2>&1 }
    '.py'  { $out = & python $path @argList 2>&1 }
    default { throw "cannot run a $ext file" }
  }
  return [pscustomobject]@{ exit = $LASTEXITCODE; output = ($out | Out-String) }
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
    try {
      $j = Get-Content -Raw -LiteralPath $req.FullName | ConvertFrom-Json
      $r = Invoke-DossierScript ([string]$j.script) $j.args
      Write-Result $done $id $r.exit $r.output $null $null
    } catch {
      Write-Result $done $id -1 $_.Exception.Message $null $null
    }
    Remove-Item -LiteralPath $req.FullName -Force
  }

  # ---- 2. read dossier.json, but only when it has actually changed --------
  # Parsing it is the one expensive thing here and it grows with your work,
  # so we check the modified-time instead - microseconds - and re-parse only
  # when it moves. That is what lets the routines be checked every pass
  # rather than on a timer. If the parse fails we keep the last good
  # copy: Dossier truncates the file to rewrite it, so a read can land
  # mid-save, and that is not a reason to stop firing routines.
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

        Set-Content -LiteralPath $mark -Value $now.ToString('o') -Encoding UTF8
        $id   = 'auto-' + $rt.id + '-' + $stamp
        $done = Join-Path $queue ($id + '.done.json')
        Write-Host ("[{0}] running {1} for routine '{2}'" -f $now.ToString('HH:mm:ss'), $sc.file, $rt.title)
        try {
          $r = Invoke-DossierScript ([string]$sc.file) $null
          Write-Result $done $id $r.exit $r.output $rt.id $stamp
          $first = (($r.output -split "`n") | Where-Object { $_.Trim() } | Select-Object -First 1)
          Write-Host ("           exit {0}  {1}" -f $r.exit, $first)
        } catch {
          Write-Result $done $id -1 $_.Exception.Message $rt.id $stamp
          Write-Host ("           FAILED  {0}" -f $_.Exception.Message)
        }
      }
    } catch { }
  }

  # ---- tidy up, once a minute ---------------------------------------------
  if ((Get-Date) -ge $nextTidy) {
  $nextTidy = (Get-Date).AddSeconds(60)
  foreach ($old in @(Get-ChildItem -LiteralPath $queue -File)) {
    if ($old.Name -like '*.done.json' -and $old.LastWriteTime -lt (Get-Date).AddDays(-2)) {
      Remove-Item -LiteralPath $old.FullName -Force }
    if ($old.Name -like '.auto-*' -and $old.LastWriteTime -lt (Get-Date).AddDays(-7)) {
      Remove-Item -LiteralPath $old.FullName -Force }
  }
  }
  Start-Sleep -Milliseconds 400
}
