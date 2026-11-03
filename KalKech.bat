@echo off
rem ===========================================================================
rem  KalKech.bat - the one thing to double-click. (Resolv.bat and Dossier.bat,
rem  its old names, still work: they pass straight through to this one.)
rem
rem  SAFE MODE (since 5.31). All this file does is open dossier.html in your
rem  browser - Edge or Chrome when there is one:
rem    - nothing is compiled, installed or started in the background
rem    - no icon by the clock, nothing added to Windows start-up
rem    - nothing listens on the network, nothing runs your scripts
rem  Your records stay in dossier.json, in the folder you choose in the page.
rem  The assistant still works through your own Power Automate flow.
rem
rem  The optional tray program - the SQL database, the script runner and
rem  Automations - is scripts\bridge\KalKech-tray.bat. Use it only on a PC
rem  where your IT or security team approved it (docs\TRAY-PROGRAM-FOR-IT.md).
rem
rem  Moving from the tray program: run scripts\safe-cleanup.bat once. It
rem  takes KalKech's old entries out of Windows start-up.
rem ===========================================================================
setlocal
set "PAGE=%~dp0dossier.html"
if not exist "%PAGE%" goto :nopage

rem  Edge or Chrome keep your records in a folder of your own. Any other
rem  browser opens it too, and keeps the records inside the browser.
set "WEB=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not exist "%WEB%" set "WEB=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if not exist "%WEB%" set "WEB=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist "%WEB%" set "WEB=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not exist "%WEB%" set "WEB=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"
if not exist "%WEB%" goto :anyweb
start "" "%WEB%" "%PAGE%"
exit /b 0

:anyweb
start "" "%PAGE%"
exit /b 0

:nopage
echo   Cannot find dossier.html beside this file:
echo     "%PAGE%"
echo   KalKech.bat has to sit in the same folder as dossier.html.
pause
exit /b 9
