# Dossier runner
# Written by Dossier. Two jobs, both local, neither touching the network:
#   1. scripts\queue        - run what Dossier asked for when you pressed $
#   2. routines in dossier.json marked 'run automatically' - fire them on time
# Start it with the schtasks line Dossier showed you, or double-click this file.
param([int]$PollSeconds = 20)

$ErrorActionPreference = 'SilentlyContinue'
$scripts = $PSScriptRoot
$root    = Split-Path -Parent $scripts
$queue   = Join-Path $scripts 'queue'
$data    = Join-Path $root 'dossier.json'
if (-not (Test-Path -LiteralPath $queue)) { New-Item -ItemType Directory -Path $queue | Out-Null }
Write-Host "Dossier runner watching $queue"
Write-Host "and the routines in $data"

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

  # ---- 2. routines that run themselves -----------------------------------
  if (Test-Path -LiteralPath $data) {
    try {
      $doc   = Get-Content -Raw -LiteralPath $data | ConvertFrom-Json
      $now   = Get-Date
      $stamp = $now.ToString('yyyy-MM-dd')
      foreach ($rt in @($doc.routines)) {
        if (-not $rt.autoRun) { continue }
        if (-not $rt.scripts -or @($rt.scripts).Count -eq 0) { continue }
        if (-not (Routine-Due $rt $now)) { continue }

        # once a day, whatever else happens - the marker is the guarantee
        $mark = Join-Path $queue ('.auto-' + $rt.id + '-' + $stamp + '.txt')
        if (Test-Path -LiteralPath $mark) { continue }

        # not before its time; if the machine was off, it catches up
        $at = $null
        [void][datetime]::TryParse(($stamp + ' ' + [string]$rt.time), [ref]$at)
        if ($at -and $now -lt $at) { continue }

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
        } catch {
          Write-Result $done $id -1 $_.Exception.Message $rt.id $stamp
        }
      }
    } catch { }
  }

  # ---- tidy up -----------------------------------------------------------
  foreach ($old in @(Get-ChildItem -LiteralPath $queue -File)) {
    if ($old.Name -like '*.done.json' -and $old.LastWriteTime -lt (Get-Date).AddDays(-2)) {
      Remove-Item -LiteralPath $old.FullName -Force }
    if ($old.Name -like '.auto-*' -and $old.LastWriteTime -lt (Get-Date).AddDays(-7)) {
      Remove-Item -LiteralPath $old.FullName -Force }
  }
  Start-Sleep -Seconds $PollSeconds
}