@echo off
rem ===========================================================================
rem  dossier-bridge.bat - kept so that nothing that points here breaks.
rem
rem  KalKech.bat, in the folder above, does all of this now and more: one
rem  program, no window, an icon by the clock, the database created and
rem  migrated by itself, the runner started hidden. Everything given to this
rem  file is passed straight on to it:
rem
rem    dossier-bridge.bat "D:\Work\Dossier"   ==  KalKech.bat "D:\Work\Dossier"
rem    dossier-bridge.bat startup             ==  KalKech.bat startup
rem    dossier-bridge.bat startup off         ==  KalKech.bat startup off
rem ===========================================================================
if exist "%~dp0..\KalKech.bat" (
  call "%~dp0..\KalKech.bat" %*
  exit /b
)
echo   KalKech.bat should be in the folder above this one, beside dossier.html.
echo   It starts everything now - this file only passes you on to it.
pause
exit /b 9
