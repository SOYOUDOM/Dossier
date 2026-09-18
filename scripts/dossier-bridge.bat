@echo off
rem ===========================================================================
rem  dossier-bridge.bat
rem
rem  Starts the one process that sits between Dossier and SQL Server LocalDB.
rem  With this running, every record you create, change or delete is written
rem  to the database. The JSON file beside your records becomes an export.
rem
rem  Double-click it and leave the window open. Closing it stops the bridge,
rem  and Dossier will say so rather than quietly writing somewhere else.
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
rem  DEFAULTS, overridable by environment variable
rem    server   (localdb)\MSSQLLocalDB    set DOSSIER_SQL=...
rem    database Dossier                   set DOSSIER_DB=...
rem ===========================================================================
setlocal

set "SERVER=%DOSSIER_SQL%"
if "%SERVER%"=="" set "SERVER=(localdb)\MSSQLLocalDB"
set "DB=%DOSSIER_DB%"
if "%DB%"=="" set "DB=Dossier"

for %%I in ("%~dp0..") do set "ROOT=%%~fI"
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
echo   Dossier bridge
echo   workspace %ROOT%
"%EXE%" "%ROOT%" "%SERVER%" "%DB%"
set "RC=%ERRORLEVEL%"

echo.
if "%RC%"=="4" (
  echo   The database is not ready. Create it first:
  echo       scripts\dossier-sql.bat init
) else (
  echo   The bridge has stopped. Dossier cannot save until it is started again.
)
exit /b %RC%
