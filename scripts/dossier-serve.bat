@echo off
rem ===========================================================================
rem  dossier-serve.bat - kept so that nothing that points here breaks.
rem
rem  It used to start a small web server with Python, Node or PHP, so that
rem  Chrome and Edge would allow notifications - they refuse them on file://.
rem  Resolv.bat, in the folder above, does that now with no Python, Node or
rem  PHP, and the database and the runner besides, as one icon by the clock.
rem  And with no SQL Server on the machine it serves the page on its own,
rem  which is all this ever did. So this passes you on to it.
rem ===========================================================================
if exist "%~dp0..\Resolv.bat" (
  call "%~dp0..\Resolv.bat" %*
  exit /b
)
if exist "%~dp0Resolv.bat" (
  call "%~dp0Resolv.bat" %*
  exit /b
)
echo   Resolv.bat starts everything now. It is in the folder above, beside
echo   dossier.html - double-click that one.
pause
exit /b 9
