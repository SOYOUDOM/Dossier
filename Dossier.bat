@echo off
rem ===========================================================================
rem  Dossier.bat - the old name, kept so that nothing that points here breaks:
rem  shortcuts, a pinned taskbar icon, habit. The app is called Resolv now and
rem  Resolv.bat, beside this file, starts it. This passes you straight on.
rem ===========================================================================
if exist "%~dp0Resolv.bat" (
  call "%~dp0Resolv.bat" %*
  exit /b
)
echo   Resolv.bat is missing from this folder - it starts everything now.
echo   Get it back with "git pull", or copy it in beside dossier.html.
pause
exit /b 9
