@echo off
rem ===========================================================================
rem  restart-app-pool.bat
rem  A TEMPLATE. The {{...}} marks are Dossier parameters: attach this to a
rem  record, fill the boxes, then use "Build a filled copy" and Dossier writes
rem  a filled version into that record's own folder - so the exact command you
rem  ran is filed as evidence next to the incident it belongs to.
rem
rem  Put this in   <your workspace>\scripts\
rem ===========================================================================
setlocal

set "SERVER={{server}}"
set "POOL={{pool}}"

rem -- Refuse to run while the blanks are still blanks.
echo %SERVER%%POOL% | findstr /c:"{{" >nul && (
    echo.
    echo  This is the template, not a filled copy.
    echo  In Dossier: attach it to a record, fill in server and pool,
    echo  then press "Build a filled copy" and run that one instead.
    echo.
    exit /b 1
)

echo Recycling application pool "%POOL%" on %SERVER% ...
powershell -NoProfile -Command ^
  "Invoke-Command -ComputerName '%SERVER%' -ScriptBlock { Import-Module WebAdministration; Restart-WebAppPool -Name '%POOL%'; Get-WebAppPoolState -Name '%POOL%' }"

if errorlevel 1 (
    echo FAILED - check the pool name and that you can reach %SERVER%.
    exit /b 1
)

echo Done. Paste the output above into the record's work log.
exit /b 0
