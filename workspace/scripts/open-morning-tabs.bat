@echo off
rem ===========================================================================
rem  open-morning-tabs.bat
rem  Opens the tabs you start the day with - but only the FIRST time each day.
rem
rem  The trick is the stamp file: we write today's date into it after running,
rem  and refuse to run again while that date still says today. So it does not
rem  matter whether this is fired by Task Scheduler at 08:30, by you clicking
rem  it in Dossier, or by both - the tabs open once.
rem
rem  Put this in   <your workspace>\scripts\
rem ===========================================================================
setlocal

rem -- Today's date in a fixed format. %date% changes with Windows locale,
rem -- which is exactly the kind of thing that breaks in March. This does not.
for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd"') do set "TODAY=%%i"

rem -- The stamp lives beside this script and is named after it, so several
rem -- once-a-day scripts can sit in the same folder without colliding.
set "STAMP=%~dp0.ran-%~n0.txt"

set "LAST="
if exist "%STAMP%" set /p LAST=<"%STAMP%"

if "%LAST%"=="%TODAY%" (
    echo Already opened today ^(%TODAY%^). Nothing to do.
    exit /b 0
)

rem ---------------------------------------------------------------------------
rem  THE ACTUAL WORK - edit this list
rem ---------------------------------------------------------------------------
echo Opening the morning tabs for %TODAY% ...
start "" "https://www.youtube.com/"
start "" "https://outlook.office.com/mail/"
rem  start "" "http://127.0.0.1:5500/dossier.html"

rem -- Only stamp AFTER the work, so a crash means it retries next time.
>"%STAMP%" echo %TODAY%

echo Done.
exit /b 0
