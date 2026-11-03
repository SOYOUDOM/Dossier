@echo off
rem ===========================================================================
rem  safe-cleanup.bat - run once when you stop using the KalKech tray program.
rem
rem  It takes KalKech's OWN old entries out of Windows start-up, so nothing
rem  tries to start DossierBridge.exe (or the old script runner) when you sign
rem  in. It touches nothing else, and says what it found:
rem    - the "Dossier" value under HKCU\...\CurrentVersion\Run
rem      (the tray icon's "Start with Windows")
rem    - the "Dossier runner" scheduled task (the old "Copy the schtasks line")
rem    - Dossier.bat in your Startup folder (from version 4.1)
rem  Nothing is downloaded, installed or started. It does not delete your
rem  records, the database or DossierBridge.exe itself - quit the tray
rem  program from its icon first if it is running.
rem ===========================================================================
setlocal
set "RUNKEY=HKCU\Software\Microsoft\Windows\CurrentVersion\Run"
set "OLD=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Dossier.bat"
set "DID="
echo.

reg query "%RUNKEY%" /v Dossier >nul 2>&1
if errorlevel 1 goto :norun
reg delete "%RUNKEY%" /v Dossier /f >nul 2>&1
echo   Removed: start the tray program with Windows.
set "DID=1"
:norun

schtasks /Query /TN "Dossier runner" >nul 2>&1
if errorlevel 1 goto :notask
schtasks /Delete /TN "Dossier runner" /F >nul 2>&1
echo   Removed: the "Dossier runner" task that started at sign-in.
set "DID=1"
:notask

if not exist "%OLD%" goto :noold
del "%OLD%" >nul 2>&1
echo   Removed: Dossier.bat from your Startup folder.
set "DID=1"
:noold

if not defined DID echo   Nothing to remove: KalKech starts nothing with Windows.
echo.
echo   KalKech now opens only from KalKech.bat, in your browser.
echo.
pause
exit /b 0
