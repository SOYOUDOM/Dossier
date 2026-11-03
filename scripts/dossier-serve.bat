@echo off
rem ===========================================================================
rem  dossier-serve.bat - kept so that nothing that points here breaks.
rem
rem  It used to start a small web server with Python, Node or PHP, so that
rem  Chrome and Edge would allow notifications - they refuse them on file://.
rem  Since 5.31 KalKech runs in safe mode: no server, no program in the
rem  background. This passes you on to KalKech.bat, in the folder above,
rem  which only opens dossier.html in your browser. (The optional tray
rem  program, scripts\bridge\KalKech-tray.bat, serves the page - use it only
rem  where your IT or security team has approved it.)
rem ===========================================================================
if exist "%~dp0..\KalKech.bat" (
  call "%~dp0..\KalKech.bat" %*
  exit /b
)
if exist "%~dp0Resolv.bat" (
  call "%~dp0Resolv.bat" %*
  exit /b
)
echo   KalKech.bat opens KalKech now. It is in the folder above, beside
echo   dossier.html - double-click that one.
pause
exit /b 9
