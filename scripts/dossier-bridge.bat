@echo off
rem ===========================================================================
rem  dossier-bridge.bat
rem
rem  Starts Dossier. One window: it hands out the page at
rem  http://127.0.0.1:5500/dossier.html and it writes every record you create,
rem  change or delete into SQL Server LocalDB. The JSON file beside your
rem  records becomes an export.
rem
rem  This used to be two windows - dossier-serve.bat for the page and this for
rem  the database. It is one now. dossier-serve.bat is still there for anyone
rem  who wants the page without a database, and you do not need both.
rem
rem  Double-click it and leave the window open. Closing it stops Dossier, and
rem  the page will say so rather than quietly writing somewhere else.
rem
rem  NOTHING TO INSTALL
rem  It compiles itself on first run with the C# compiler that is already on
rem  every Windows machine, in C:\Windows\Microsoft.NET\Framework64. No SDK,
rem  no package manager, no service, no administrator. The .exe it builds
rem  lands beside this file and is rebuilt whenever the source is newer.
rem
rem  USE
rem    dossier-bridge.bat                 the folder this sits in, one up
rem    dossier-bridge.bat "D:\Work\Dossier"     a folder of your choosing
rem
rem    dossier-bridge.bat startup "D:\Work\Dossier"
rem        start it quietly at every login, so Dossier is simply always
rem        there. It does not open a browser; your bookmark does.
rem    dossier-bridge.bat startup off
rem        stop doing that.
rem
rem  DEFAULTS, overridable by environment variable
rem    server   (localdb)\MSSQLLocalDB    set DOSSIER_SQL=...
rem    database Dossier                   set DOSSIER_DB=...
rem    port     5500                      set DOSSIER_PORT=...
rem    open a browser on start: yes       set DOSSIER_OPEN=0 for no
rem ===========================================================================
setlocal
title Dossier

if /i "%~1"=="startup" goto :startup

set "SERVER=%DOSSIER_SQL%"
if "%SERVER%"=="" set "SERVER=(localdb)\MSSQLLocalDB"
set "DB=%DOSSIER_DB%"
if "%DB%"=="" set "DB=Dossier"

rem  the clone: where dossier.html and its .js files live
for %%I in ("%~dp0..") do set "APP=%%~fI"

rem  the workspace: where your records live. Not the same folder, and the
rem  bridge will say so if you point it at the clone.
set "ROOT=%APP%"
if not "%~1"=="" set "ROOT=%~f1"

set "SRC=%~dp0bridge\DossierBridge.cs"
set "EXE=%~dp0bridge\DossierBridge.exe"

if not exist "%SRC%" (
  echo   Cannot find "%SRC%".
  echo   Copy the scripts\bridge folder in from the Dossier repository.
  exit /b 9
)

rem  the compiler that is already here. 64-bit first, then 32-bit.
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
  exit /b 9
)

rem  build only when there is something new to build
set "BUILD="
if not exist "%EXE%" set "BUILD=1"
if exist "%EXE%" for /f %%A in ('dir /b /o-d "%SRC%" "%EXE%" 2^>nul') do (
  if /i "%%~nxA"=="DossierBridge.cs" set "BUILD=1"
  goto :built
)
:built

if defined BUILD (
  echo   building   %EXE%
  "%CSC%" /nologo /target:exe /optimize+ /langversion:5 ^
          /reference:System.Data.dll ^
          /out:"%EXE%" "%SRC%"
  if errorlevel 1 (
    echo.
    echo   The bridge did not compile. That is a bug in the source, not in
    echo   your machine - the error above says where.
    exit /b 1
  )
)

echo.
echo   Dossier
echo   workspace %ROOT%
"%EXE%" "%ROOT%" "%SERVER%" "%DB%" "%APP%"
set "RC=%ERRORLEVEL%"

echo.
if "%RC%"=="4" (
  echo   The database is not ready. Create it first:
  echo       scripts\dossier-sql.bat init
) else (
  echo   Dossier has stopped. It cannot save until this is started again.
)
exit /b %RC%

rem ---------------------------------------------------------------------------
rem  start at login
rem
rem  A .bat in the Startup folder, because that needs no shortcut file, no
rem  scheduled task, no administrator and no PowerShell. Windows runs
rem  everything in there when you sign in.
rem ---------------------------------------------------------------------------
:startup
set "LAUNCH=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Dossier.bat"

if /i "%~2"=="off" (
  if exist "%LAUNCH%" (
    del "%LAUNCH%"
    echo   Dossier will not start at login any more.
  ) else (
    echo   Dossier was not set to start at login.
  )
  exit /b 0
)

if "%~2"=="" (
  echo.
  echo   Say which folder holds your records:
  echo       dossier-bridge.bat startup "D:\Work\Dossier"
  echo   or to undo it:
  echo       dossier-bridge.bat startup off
  echo.
  exit /b 2
)
if not exist "%~f2\." (
  echo   No such folder: %~f2
  exit /b 3
)

set "WS=%~f2"
> "%LAUNCH%" echo @echo off
>>"%LAUNCH%" echo rem  Written by dossier-bridge.bat startup. To stop this, run
>>"%LAUNCH%" echo rem      dossier-bridge.bat startup off
>>"%LAUNCH%" echo rem  or just delete this file.
>>"%LAUNCH%" echo set "DOSSIER_OPEN=0"
>>"%LAUNCH%" echo start "Dossier" /min "%~dp0dossier-bridge.bat" "%WS%"
if errorlevel 1 (
  echo   Could not write "%LAUNCH%".
  exit /b 1
)

echo.
echo   Dossier will start at every login, minimised, on the workspace
echo       %WS%
echo   It will not open a browser by itself. Bookmark this and use that:
echo       http://127.0.0.1:5500/dossier.html
echo.
echo   Written to:
echo       %LAUNCH%
echo   Undo it with:  dossier-bridge.bat startup off
echo.
exit /b 0
