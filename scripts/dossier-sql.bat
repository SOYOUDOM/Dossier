@echo off
rem ===========================================================================
rem  dossier-sql.bat
rem
rem  Dossier <-> SQL Server LocalDB. No PowerShell anywhere.
rem
rem  Dossier itself cannot talk to SQL Server: it is a page in a browser, it
rem  has no SQL client, and its own Content-Security-Policy forbids it from
rem  opening a connection to anything at all. That is deliberate and it is not
rem  going to change. So the file is the interface. Dossier writes
rem  dossier.json; this reads it and loads it into LocalDB, and can write it
rem  back out again.
rem
rem  USE
rem    dossier-sql.bat init            create the database and the tables
rem    dossier-sql.bat push [file]     load dossier.json into LocalDB
rem    dossier-sql.bat pull [out]      newest snapshot back out as JSON
rem    dossier-sql.bat pull --replace  ...and put it back as dossier.json
rem    dossier-sql.bat check           what is in there
rem    dossier-sql.bat history         every push, newest first
rem    dossier-sql.bat find            where your dossier.json files are
rem
rem  With no argument it does: init, then push. That is the one you want on a
rem  routine - Dossier can run this by itself every evening, and then the day
rem  is in a database as well as in a file.
rem
rem  DEFAULTS, all overridable by environment variable
rem    server   (localdb)\MSSQLLocalDB       set DOSSIER_SQL=...
rem    database Dossier                      set DOSSIER_DB=...
rem    file     ..\dossier.json              or pass one
rem
rem  WHAT IT NEEDS
rem    sqlcmd, which arrives with SQL Server Management Studio or with the
rem    "SQL Server Command Line Utilities". If `where sqlcmd` finds nothing,
rem    that is the missing piece.
rem ===========================================================================
setlocal

set "CMD=%~1"
if "%CMD%"=="" set "CMD=all"

set "SERVER=%DOSSIER_SQL%"
if "%SERVER%"=="" set "SERVER=(localdb)\MSSQLLocalDB"
set "DB=%DOSSIER_DB%"
if "%DB%"=="" set "DB=Dossier"

rem  this file lives in <workspace>\scripts\, so the workspace is one up
for %%I in ("%~dp0..") do set "ROOT=%%~fI"
set "SQLDIR=%ROOT%\sql"
set "JSON=%ROOT%\dossier.json"

where sqlcmd >nul 2>&1
if errorlevel 1 (
  echo.
  echo   sqlcmd was not found on the PATH.
  echo   It comes with SQL Server Management Studio, or on its own as
  echo   "SQL Server Command Line Utilities". Install either, open a new
  echo   window, and run this again.
  echo.
  exit /b 9
)

if not exist "%SQLDIR%\schema.sql" (
  echo   Cannot find "%SQLDIR%\schema.sql".
  echo   Keep the sql\ folder beside this workspace, or copy it in from the
  echo   Dossier repository.
  exit /b 9
)

echo   server   %SERVER%
echo   database %DB%

if /i "%CMD%"=="find"    goto :find
if /i "%CMD%"=="check"   goto :check
if /i "%CMD%"=="history" goto :history
if /i "%CMD%"=="pull"    goto :pull
if /i "%CMD%"=="init"    goto :init
if /i "%CMD%"=="push"    goto :push
if /i "%CMD%"=="all"     goto :push
echo   Unknown command "%CMD%". Try: init, push, pull, check, history, find.
exit /b 2

rem ---------------------------------------------------------------------------
:init
echo   creating or migrating...
sqlcmd -S "%SERVER%" -b -E -i "%SQLDIR%\schema.sql" -v db="%DB%"
if errorlevel 1 goto :failed
rem  and the loader, which is the only thing that writes the tables. It lives
rem  in its own file so that CREATE PROCEDURE can be the first statement in
rem  its batch - which is a reason to keep it apart, not a reason to forget
rem  to run it. It was forgotten, and the bridge spent an afternoon saying
rem  "Could not find stored procedure dbo.LoadWorkspace".
call :proc
if errorlevel 1 goto :failed
echo   done.
exit /b 0

rem ---------------------------------------------------------------------------
:proc
if not exist "%SQLDIR%\load-proc.sql" (
  echo   Cannot find "%SQLDIR%\load-proc.sql" - the loader is missing.
  exit /b 9
)
sqlcmd -S "%SERVER%" -d "%DB%" -b -E -i "%SQLDIR%\load-proc.sql"
exit /b %ERRORLEVEL%

rem ---------------------------------------------------------------------------
:push
if not "%~2"=="" set "JSON=%~f2"
if not exist "%JSON%" (
  echo   No workspace file at "%JSON%".
  echo   Pass the path: dossier-sql.bat push "D:\Work\Dossier\dossier.json"
  exit /b 3
)
echo   file     %JSON%
rem  the schema first - separate files on purpose, so a mistake in one cannot
rem  stop the other from running
sqlcmd -S "%SERVER%" -b -E -i "%SQLDIR%\schema.sql" -v db="%DB%"
if errorlevel 1 goto :failed
call :proc
if errorlevel 1 goto :failed
sqlcmd -S "%SERVER%" -d "%DB%" -b -E -i "%SQLDIR%\push.sql" -v file="%JSON%"
if errorlevel 1 goto :failed
echo.
echo   Loaded. To see it:  dossier-sql.bat check
exit /b 0

rem ---------------------------------------------------------------------------
:pull
set "OUT=%ROOT%\dossier-from-sql.json"
set "REPLACE="
if /i "%~2"=="--replace" (set "REPLACE=1") else (if not "%~2"=="" set "OUT=%~f2")

echo   writing  %OUT%
sqlcmd -S "%SERVER%" -d "%DB%" -b -E -h -1 -y 0 -W -w 65535 -f 65001 -i "%SQLDIR%\pull.sql" -v id="" -o "%OUT%"
if errorlevel 1 goto :failed

rem  a snapshot that came back empty is not something to copy over anything
for %%A in ("%OUT%") do if %%~zA LSS 40 (
  echo   Nothing came back - is there a push in there yet? Try: dossier-sql.bat check
  exit /b 4
)
findstr /b /c:"{" "%OUT%" >nul || (
  echo   What came back does not look like JSON. Left it at "%OUT%" to look at.
  exit /b 4
)

if not defined REPLACE (
  echo   done. Import it from Menu -^> Workspace, or pass --replace to put it back.
  exit /b 0
)

rem  --replace never overwrites without keeping what was there
if exist "%JSON%" copy /y "%JSON%" "%ROOT%\dossier-before-pull.json" >nul
if exist "%ROOT%\dossier-before-pull.json" echo   kept     %ROOT%\dossier-before-pull.json
copy /y "%OUT%" "%JSON%" >nul
echo   replaced %JSON%
echo   Close and reopen Dossier to pick it up.
exit /b 0

rem ---------------------------------------------------------------------------
rem  Which file to push is the question everybody has, and the answer is
rem  never in the clone - the clone deliberately has no dossier.json in it.
:find
echo.
echo   Looking for dossier.json under "%USERPROFILE%".
echo   A synced OneDrive can take a minute - results appear as they are found.
echo.
rem  NOT inside a for /f: that buffers the whole scan before printing a single
rem  line, so a slow search looks like a hung one. dir prints as it goes.
dir /s /a-d "%USERPROFILE%\dossier.json" 2>nul | findstr /i "Directory dossier.json"
echo.
echo   Push the one in the folder you pick in Dossier's "Choose workspace folder":
echo       dossier-sql.bat push "<that path>"
exit /b 0

rem ---------------------------------------------------------------------------
:check
sqlcmd -S "%SERVER%" -d "%DB%" -b -E -Q "SET NOCOUNT ON; SELECT Snapshots=(SELECT COUNT(*) FROM dbo.Snapshot), Records=(SELECT COUNT(*) FROM dbo.Record), [Open]=(SELECT COUNT(*) FROM dbo.Record WHERE Status IN ('open','processing','blocked')), Documents=(SELECT COUNT(*) FROM dbo.RecordFile), Runbooks=(SELECT COUNT(*) FROM dbo.Runbook), Profiles=(SELECT COUNT(*) FROM dbo.SystemProfile), Notes=(SELECT COUNT(*) FROM dbo.Note), Incidents=(SELECT COUNT(*) FROM dbo.Incident), Chats=(SELECT COUNT(*) FROM dbo.Chat), SchemaVersion=(SELECT Version FROM dbo.SchemaVersion WHERE Id=1), LastPush=(SELECT MAX(TakenAt) FROM dbo.Snapshot);"
if errorlevel 1 goto :failed
exit /b 0

rem ---------------------------------------------------------------------------
:history
sqlcmd -S "%SERVER%" -d "%DB%" -b -E -Q "SET NOCOUNT ON; SELECT TOP 40 SnapshotId, TakenAt, Records, Bytes, SavedAt FROM dbo.Snapshot ORDER BY SnapshotId DESC;"
if errorlevel 1 goto :failed
exit /b 0

rem ---------------------------------------------------------------------------
:failed
echo.
echo   sqlcmd reported an error (above).
echo   If it could not connect, start the instance by hand:
echo       sqllocaldb start MSSQLLocalDB
echo   If it says the file could not be read, the path has a character
echo   sqlcmd did not like - try a path without ^& or ^%% in it.
exit /b 1
