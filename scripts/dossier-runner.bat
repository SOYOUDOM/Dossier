@echo off
rem ===========================================================================
rem  dossier-runner.bat
rem
rem  Runs the scripts Dossier asks for. No PowerShell anywhere.
rem
rem  Put this in   <your workspace>\scripts\   and double-click it.
rem  Leave the window open. Closing it stops the runner.
rem
rem  HOW IT TALKS TO DOSSIER
rem  Dossier cannot start a program, so it leaves a note in scripts\queue\ and
rem  this reads it. Everything passed between them is plain text, one value a
rem  line - no JSON parsing in batch, which is where these things go wrong.
rem
rem    <id>.run.txt    line 1: the script to run.  line 2: its arguments.
rem    <id>.done.txt   line 1: the exit code it finished with.
rem    <id>.out.txt    everything the script printed.
rem    .runner.txt     written every few seconds so Dossier knows this is alive.
rem
rem  SAFETY
rem  It will only run a file that is already sitting in this scripts\ folder.
rem  A name containing a path separator or .. is refused, so a request cannot
rem  reach anything else on the machine.
rem ===========================================================================
setlocal enabledelayedexpansion

set "SCRIPTS=%~dp0"
if "%SCRIPTS:~-1%"=="\" set "SCRIPTS=%SCRIPTS:~0,-1%"
set "QUEUE=%SCRIPTS%\queue"
if not exist "%QUEUE%" mkdir "%QUEUE%"

echo  Dossier runner
echo  watching "%QUEUE%"
echo  Leave this window open. Close it to stop.
echo.

set /a BEAT=0

:loop

rem ---- say we are alive, about every 10 seconds -----------------------------
set /a BEAT-=1
if !BEAT! LEQ 0 (
  set /a BEAT=10
  > "%QUEUE%\.runner.txt" echo %SCRIPTS%
  >>"%QUEUE%\.runner.txt" echo %DATE% %TIME%
)

rem ---- anything waiting in the queue ----------------------------------------
for %%F in ("%QUEUE%\*.run.txt") do call :run "%%~fF" "%%~nF"

ping -n 2 127.0.0.1 >nul
goto loop


rem ===========================================================================
:run
rem  %1 = full path of the request,  %2 = its id (the name without .run.txt)
set "REQ=%~1"
set "ID=%~2"
set "ID=%ID:.run=%"

set "NAME="
set "ARGS="
set /p NAME=<"%REQ%"
for /f "usebackq skip=1 delims=" %%A in ("%REQ%") do (
  if not defined ARGS set "ARGS=%%A"
)

rem  Take it before running it: if this window is closed mid-script, the job
rem  must not start again from the top next time.
del "%REQ%" >nul 2>&1
if exist "%REQ%" goto :eof

set "OUT=%QUEUE%\%ID%.out.txt"
set "DONE=%QUEUE%\%ID%.done.txt"

if not defined NAME (
  > "%OUT%" echo The request did not name a script.
  > "%DONE%" echo -1
  goto :eof
)

rem ---- refuse anything that is not a plain file name in this folder ---------
set "BAD="
if not "%NAME%"=="%NAME:\=%"  set "BAD=1"
if not "%NAME%"=="%NAME:/=%"  set "BAD=1"
if not "%NAME%"=="%NAME::=%"  set "BAD=1"
if not "%NAME%"=="%NAME:..=%" set "BAD=1"
if defined BAD (
  > "%OUT%" echo Refused: "%NAME%" is not a plain file name.
  > "%DONE%" echo -1
  goto :eof
)
if not exist "%SCRIPTS%\%NAME%" (
  > "%OUT%" echo Not found: %NAME% is not in the scripts folder.
  > "%DONE%" echo -1
  goto :eof
)

echo [%TIME:~0,8%] running %NAME% %ARGS%
pushd "%SCRIPTS%"
call "%NAME%" %ARGS% > "%OUT%" 2>&1
set "RC=!ERRORLEVEL!"
popd

> "%DONE%" echo !RC!
echo            finished with exit code !RC!
goto :eof
