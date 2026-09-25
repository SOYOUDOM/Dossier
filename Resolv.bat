@echo off
rem ===========================================================================
rem  Resolv.bat - the one thing to double-click. (Dossier.bat, its old name,
rem  still works: it passes straight through to this one.)
rem
rem  It starts Resolv and gets out of the way. No window stays open: Resolv
rem  runs as an icon beside the clock, and that icon's menu is how you open
rem  it, see what it is doing, make it start with Windows, and quit it.
rem
rem  What starts, in one program:
rem    - the page, at http://127.0.0.1:5500/dossier.html - opened for you
rem    - the database: created if there is none, its tables brought up to
rem      date, every change written to it. Nothing to "init".
rem    - the runner for your scripts, hidden
rem
rem  No SQL Server on this PC? It still starts, and Resolv keeps its records
rem  in dossier.json as it always did. The icon says so.
rem
rem  NOTHING TO INSTALL
rem  The first run compiles scripts\bridge\DossierBridge.cs with the C#
rem  compiler that is already on every Windows machine. A few seconds, once;
rem  again only when the source changes.
rem
rem  USE
rem    Resolv.bat                        start it (asks for your records
rem                                       folder the first time, then remembers)
rem    Resolv.bat "D:\Work\Resolv"      start it on that folder
rem    Resolv.bat startup                start with Windows, quietly
rem    Resolv.bat startup off            stop doing that
rem
rem  DEFAULTS, overridable by environment variable
rem    server   (localdb)\MSSQLLocalDB    set DOSSIER_SQL=...
rem    database Dossier                   set DOSSIER_DB=...
rem    port     5500                      set DOSSIER_PORT=...
rem ===========================================================================
setlocal
title Resolv

rem  the whole command line, quotes off - an unquoted OneDrive path with
rem  spaces in it arrives whole (see scripts\check-bat.py, rule 1)
set "ARGS=%*"
if defined ARGS set "ARGS=%ARGS:"=%"

set "SRC=%~dp0scripts\bridge\DossierBridge.cs"
set "EXE=%~dp0scripts\bridge\DossierBridge.exe"
set "RUNKEY=HKCU\Software\Microsoft\Windows\CurrentVersion\Run"

if not exist "%SRC%" (
  echo   Cannot find "%SRC%".
  echo   This file has to sit in the same folder as dossier.html.
  pause
  exit /b 9
)

rem ---- start with Windows ---------------------------------------------------
if /i "%~1"=="startup" goto :startup

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

if defined BUILD (
  rem  a running copy holds its .exe open, so it cannot be replaced under it
  tasklist /fi "imagename eq DossierBridge.exe" 2>nul | find /i "DossierBridge.exe" >nul
  if not errorlevel 1 (
    echo.
    echo   Resolv is running, and this copy of it is out of date.
    echo   Quit it from the icon by the clock - right-click, Quit -
    echo   and run this again to start the new one.
    echo.
    start "" "%EXE%"
    pause
    exit /b 0
  )
  call :compile
  if errorlevel 1 exit /b 1
)

rem ---- and go ---------------------------------------------------------------
rem  start, not call: this window closes now and Resolv carries on without it
if defined ARGS (
  start "" "%EXE%" "%ARGS%"
) else (
  start "" "%EXE%"
)
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
echo   Setting Resolv up - a few seconds, and only this once.
"%CSC%" /nologo /target:winexe /optimize+ /langversion:5 ^
        /reference:System.Data.dll ^
        /reference:System.Windows.Forms.dll ^
        /reference:System.Drawing.dll ^
        /out:"%EXE%" "%SRC%"
if errorlevel 1 (
  echo.
  echo   Resolv did not compile. That is a bug in the source, not in your
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
  echo   Resolv will not start with Windows any more.
  exit /b 0
)
if not exist "%EXE%" (
  call :compile
  if errorlevel 1 exit /b 1
)
reg add "%RUNKEY%" /v Dossier /t REG_SZ /d "\"%EXE%\" --quiet" /f >nul
if errorlevel 1 (
  echo   Could not set Resolv to start with Windows.
  exit /b 1
)
echo.
echo   Resolv will start with Windows - quietly, as an icon by the clock.
echo   Bookmark  http://127.0.0.1:5500/dossier.html  or double-click the icon.
echo   The same switch is on the icon's menu: Start with Windows.
echo   Undo it:  Resolv.bat startup off
echo.
exit /b 0
