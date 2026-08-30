@echo off
rem Written by Dossier for D-0009 - 1234
rem Double-click this file to run the script. The transcript is kept beside it.
setlocal
set "LOG=%~dp0run-open-morning-tabs.log"
rem start over rather than append for ever once the transcript passes 256 KB
for %%A in ("%LOG%") do if %%~zA GTR 262144 del "%LOG%"
echo === %DATE% %TIME% ===>>"%LOG%"
pushd "%~dp0..\..\scripts"
call "open-morning-tabs.bat"  >>"%LOG%" 2>&1
set RC=%ERRORLEVEL%
popd
echo exit %RC%>>"%LOG%"
echo.
echo Finished with exit code %RC%. Transcript: %LOG%
echo.
pause