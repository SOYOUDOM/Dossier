@echo off
rem ===========================================================================
rem  dossier-bridge.bat - kept so that nothing that points here breaks.
rem
rem  Since 5.31 this opens KalKech in safe mode: it passes you on to
rem  KalKech.bat, in the folder above, which only opens dossier.html in your
rem  browser. Nothing is built, started or added to Windows start-up.
rem
rem  The tray program (the database, the runner, Automations) is started only
rem  by scripts\bridge\KalKech-tray.bat, and only on a PC where your IT or
rem  security team has approved it. See docs\TRAY-PROGRAM-FOR-IT.md.
rem ===========================================================================
if exist "%~dp0..\KalKech.bat" (
  call "%~dp0..\KalKech.bat"
  exit /b
)
echo   KalKech.bat should be in the folder above this one, beside dossier.html.
echo   It opens KalKech - this file only passes you on to it.
pause
exit /b 9
