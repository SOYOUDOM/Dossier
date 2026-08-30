@echo off
rem ===========================================================================
rem  open-morning-tabs.bat
rem  Opens the tabs you start the day with.
rem
rem  NOTE ON "ONCE A DAY":
rem  This script does NOT guard itself any more, and that is deliberate. The
rem  Dossier runner already keeps a marker per routine per day
rem  (scripts\queue\.auto-<routine>-<date>.txt), so a second guard in here only
rem  meant the two could disagree - double-click it once to test, and the
rem  scheduled run later that day would quietly do nothing.
rem
rem  If you want to run this from Task Scheduler directly, WITHOUT the Dossier
rem  runner, uncomment the block marked STANDALONE below to get the guard back.
rem
rem  Put this in   <your workspace>\scripts\
rem ===========================================================================
setlocal

rem --- STANDALONE once-a-day guard (leave commented out when using the runner)
rem for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd"') do set "TODAY=%%i"
rem set "STAMP=%~dp0.ran-%~n0.txt"
rem set "LAST="
rem if exist "%STAMP%" set /p LAST=<"%STAMP%"
rem if "%LAST%"=="%TODAY%" (
rem     echo Already opened today ^(%TODAY%^). Nothing to do.
rem     exit /b 0
rem )

rem ---------------------------------------------------------------------------
rem  THE ACTUAL WORK - edit this list
rem ---------------------------------------------------------------------------
echo Opening the morning tabs ...
start "" "https://www.youtube.com/"
start "" "https://outlook.office.com/mail/"
rem  start "" "http://127.0.0.1:5500/dossier.html"

rem --- STANDALONE: remember that we ran (pairs with the guard above)
rem >"%STAMP%" echo %TODAY%

echo Done.
exit /b 0
