@echo off
rem ===========================================================================
rem  dossier-serve.bat - kept so that nothing that points here breaks.
rem
rem  It used to start a small web server with Python, Node or PHP, so that
rem  Chrome and Edge would allow notifications - they refuse them on file://.
rem  Dossier.bat, in the folder above, does that now with no Python, Node or
rem  PHP, and the database and the runner besides, as one icon by the clock.
rem  And with no SQL Server on the machine it serves the page on its own,
rem  which is all this ever did. So this passes you on to it.
rem ===========================================================================
if exist "%~dp0..\Dossier.bat" (
  call "%~dp0..\Dossier.bat" %*
  exit /b
)
if exist "%~dp0Dossier.bat" (
  call "%~dp0Dossier.bat" %*
  exit /b
)
echo   Dossier.bat starts everything now. It is in the Dossier folder, beside
echo   dossier.html - double-click that one.
pause
exit /b 9
