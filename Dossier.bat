@echo off
rem ===========================================================================
rem  Dossier.bat - an old name (until 4.8), kept so that nothing that points
rem  here breaks: shortcuts, a pinned taskbar icon, habit. The app is called
rem  KalKech now and KalKech.bat, beside this file, starts it. This passes you
rem  straight on.
rem ===========================================================================
if exist "%~dp0KalKech.bat" (
  call "%~dp0KalKech.bat" %*
  exit /b
)
echo   KalKech.bat is missing from this folder - it starts everything now.
echo   Get it back with "git pull", or copy it in beside dossier.html.
pause
exit /b 9
