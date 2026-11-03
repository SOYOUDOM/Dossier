@echo off
rem ===========================================================================
rem  KalKech-tray.bat - OPTIONAL. Starts the KalKech tray program
rem  (DossierBridge.exe): the SQL database, the script runner and the
rem  Automations. Until 5.31 this was KalKech.bat itself.
rem
rem  Use it ONLY on a PC where your IT / security team has approved the tray
rem  program. It compiles DossierBridge.cs with the C# compiler that comes
rem  with Windows, runs as an icon by the clock, listens on 127.0.0.1, can
rem  start with Windows, runs your .bat scripts and calls the APIs of your
rem  automations - the things a security tool watches for. What it does, for
rem  the people who approve it: docs\TRAY-PROGRAM-FOR-IT.md.
rem
rem  KalKech works without it: double-click KalKech.bat (safe mode).
rem
rem  USE
rem    KalKech-tray.bat                   start it (asks first)
rem    KalKech-tray.bat "D:\Work\KalKech" start it on that folder
rem    KalKech-tray.bat startup           start with Windows, quietly
rem    KalKech-tray.bat startup off       stop doing that
rem
rem  DEFAULTS, overridable by environment variable
rem    server   (localdb)\MSSQLLocalDB    set DOSSIER_SQL=...  or, kept for
rem                                       you: Setup, Database (SQL Server)
rem    database Dossier                   set DOSSIER_DB=...
rem    port     5500                      set DOSSIER_PORT=...
rem ===========================================================================
setlocal
title KalKech tray program

rem  the whole command line, quotes off - an unquoted OneDrive path with
rem  spaces in it arrives whole (see scripts\check-bat.py, rule 1)
set "ARGS=%*"
if defined ARGS set "ARGS=%ARGS:"=%"

set "SRC=%~dp0DossierBridge.cs"
set "EXE=%~dp0DossierBridge.exe"
set "RUNKEY=HKCU\Software\Microsoft\Windows\CurrentVersion\Run"

if not exist "%SRC%" (
  echo   Cannot find "%SRC%".
  echo   This file has to sit beside DossierBridge.cs, in scripts\bridge.
  pause
  exit /b 9
)

rem ---- start with Windows ---------------------------------------------------
if /i "%~1"=="startup" goto :startup

rem ---- asked, every time: this is the part a security tool may flag ---------
echo.
echo   This starts the KalKech TRAY PROGRAM (DossierBridge.exe).
echo   Your company's security tools may treat it as a threat. Start it only
echo   if your IT or security team has approved it.
echo   KalKech works without it: close this and double-click KalKech.bat.
echo.
choice /c YN /n /m "  Start the tray program? [Y/N] "
if errorlevel 2 exit /b 0

rem ---- the old way of starting at login, retired ----------------------------
rem  4.1 put a .bat in the Startup folder that opened a console window at
rem  every login, and for some people it held a folder cut short at the
rem  first space. The Run key replaces it: no window, and it is the same
rem  switch as the icon's "Start with Windows".
rem  (gotos, not a parenthesised block: the path goes to reg.exe outside
rem  cmd's quotes, and a ")" in it would end a block early)
set "OLD=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Dossier.bat"
if not exist "%OLD%" goto :noold
findstr /i /c:"dossier-bridge.bat" "%OLD%" >nul 2>&1
if errorlevel 1 goto :noold
del "%OLD%" >nul 2>&1
reg add "%RUNKEY%" /v Dossier /t REG_SZ /d "\"%EXE%\" --quiet" /f >nul 2>&1
echo   Moved "start at login" to the Run key - no console window at login now.
:noold

rem ---- build, when there is something new to build --------------------------
set "BUILD="
if not exist "%EXE%" set "BUILD=1"
if exist "%EXE%" for /f %%A in ('dir /b /o-d "%SRC%" "%EXE%" 2^>nul') do (
  if /i "%%~nxA"=="DossierBridge.cs" set "BUILD=1"
  goto :built
)
:built

rem ---- is it THIS folder's copy that is running? ---------------------------
rem  Windows lets nobody write to a program while it runs. So opening our own
rem  .exe to add nothing to it - it is not changed - says whether this very
rem  file is running. Asking Task Manager by name could not tell: a KalKech
rem  started from another folder (an older clone, a second checkout) has the
rem  same name there, and 5.20.0 took that one for this one - it skipped the
rem  build, and then could not start a program that had never been made.
set "MINE="
if not exist "%EXE%" goto :mined
2>nul (>>"%EXE%" (call )) || set "MINE=1"
rem  locked, but no KalKech running at all: something else holds it (a virus
rem  scan, a read-only file) - not ours running, so do not say it is
if not defined MINE goto :mined
call :others
if errorlevel 1 set "MINE="
:mined

if not defined BUILD goto :other
if not defined MINE goto :build
echo.
echo   KalKech is running from this folder, and it is out of date.
echo   Quit it from the icon by the clock - right-click, Quit -
echo   and run KalKech-tray.bat again to start the new one.
echo.
start "" "%EXE%"
pause
exit /b 0

:build
call :compile
if errorlevel 1 exit /b 1

rem ---- a KalKech from another folder? -------------------------------------------
rem  One KalKech runs at a time for a database; starting a second only opens
rem  the first one's page. When the first one is another folder, this copy
rem  would quietly show you that one instead - an older version, perhaps,
rem  and its files, not these. So say so, and let you choose.
rem  (Someone who set DOSSIER_DB runs a second KalKech on purpose, on its own
rem  database: left alone.)
:other
if defined DOSSIER_DB goto :go
if defined MINE goto :go
call :others
if errorlevel 1 goto :go
echo.
echo   Another KalKech is already running - started from a different folder.
echo   This copy is ready, in:
echo     "%~dp0"
echo.
echo   To use this one, quit the other from its icon by the clock -
echo   right-click, Quit - and then press a key here.
call :runkey
echo.
pause
call :others
if errorlevel 1 goto :go
echo.
echo   The other KalKech is still running, so this one cannot start yet.
echo   Quit it from the icon by the clock, then run KalKech-tray.bat again.
echo.
pause
exit /b 0

rem ---- and go ---------------------------------------------------------------
:go
rem  start, not call: this window closes now and KalKech carries on without it
if defined ARGS (
  start "" "%EXE%" "%ARGS%"
) else (
  start "" "%EXE%"
)
exit /b 0


rem ===========================================================================
rem  errorlevel 0 when a DossierBridge.exe is running - from anywhere
:others
tasklist /fi "imagename eq DossierBridge.exe" 2>nul | find /i "DossierBridge.exe" >nul
exit /b

rem  if "Start with Windows" points at another folder's copy, say how to move it
:runkey
reg query "%RUNKEY%" /v Dossier >nul 2>&1
if errorlevel 1 exit /b 0
reg query "%RUNKEY%" /v Dossier 2>nul | find /i "%EXE%" >nul
if not errorlevel 1 exit /b 0
echo.
echo   The other one is also the one that starts with Windows. To have
echo   this one start with Windows instead, run:   KalKech-tray.bat startup
exit /b 0


rem ===========================================================================
:compile
set "CSC=%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if not exist "%CSC%" set "CSC=%WINDIR%\Microsoft.NET\Framework\v4.0.30319\csc.exe"
if not exist "%CSC%" (
  echo.
  echo   The .NET Framework 4 C# compiler is not where it normally lives:
  echo     %WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe
  echo   That ships with Windows, so this is unusual. Turning on
  echo   ".NET Framework 4.8 Advanced Services" in Windows Features puts it
  echo   back.
  echo.
  pause
  exit /b 9
)
echo   Setting KalKech up - a few seconds, and only this once.
"%CSC%" /nologo /target:winexe /optimize+ /langversion:5 ^
        /reference:System.Data.dll ^
        /reference:System.Windows.Forms.dll ^
        /reference:System.Drawing.dll ^
        /reference:System.Security.dll ^
        /out:"%EXE%" "%SRC%"
if errorlevel 1 (
  echo.
  echo   KalKech did not compile. That is a bug in the source, not in your
  echo   machine - the error above says where.
  pause
  exit /b 1
)
exit /b 0


rem ===========================================================================
:startup
set "WHAT="
for /f "tokens=1,*" %%A in ("%ARGS%") do set "WHAT=%%B"
if /i "%WHAT%"=="off" (
  reg delete "%RUNKEY%" /v Dossier /f >nul 2>&1
  echo   KalKech will not start with Windows any more.
  exit /b 0
)
echo.
echo   This makes the tray program start with Windows. Only do this if your
echo   IT or security team has approved the tray program.
choice /c YN /n /m "  Start it with Windows? [Y/N] "
if errorlevel 2 exit /b 0
if not exist "%EXE%" (
  call :compile
  if errorlevel 1 exit /b 1
)
reg add "%RUNKEY%" /v Dossier /t REG_SZ /d "\"%EXE%\" --quiet" /f >nul
if errorlevel 1 (
  echo   Could not set KalKech to start with Windows.
  exit /b 1
)
echo.
echo   KalKech will start with Windows - quietly, as an icon by the clock.
echo   Bookmark  http://127.0.0.1:5500/dossier.html  or double-click the icon.
echo   The same switch is on the icon's menu: Start with Windows.
echo   Undo it:  scripts\bridge\KalKech-tray.bat startup off
echo.
exit /b 0
