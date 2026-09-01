@echo off
setlocal EnableExtensions
title Dossier - local server

rem ===========================================================================
rem  Dossier local server
rem
rem  Opening dossier.html straight from the folder (file://) works for
rem  everything except Windows notifications - Chrome and Edge refuse those on
rem  file:// with no way to allow them. Serving the same file from
rem  http://127.0.0.1 fixes that, and nothing else changes.
rem
rem  Double-click this file. It starts a small web server, waits for it to
rem  answer, and opens Dossier in the browser. Closing this window stops it.
rem
rem  Needs one of: Python, Node, or PHP. Whichever it finds first is used.
rem ===========================================================================

rem ---- SETTINGS -------------------------------------------------------------

rem The folder holding dossier.html, assist.js and chat.js. Default: this
rem .bat's folder. Best kept as a folder holding only those three.
set "FOLDER=%~dp0"

rem Port to serve on. Change it if something else already uses 5500.
set "PORT=5500"

rem default | edge | chrome
set "BROWSER=default"

rem yes = a clean window with no address bar (edge/chrome only). no = a tab.
set "APPMODE=no"

rem ---------------------------------------------------------------------------

rem strip a trailing backslash so paths print cleanly
if "%FOLDER:~-1%"=="\" set "FOLDER=%FOLDER:~0,-1%"
set "URL=http://127.0.0.1:%PORT%/dossier.html"

rem The second window this script starts for itself lands here: it waits for
rem the server to answer, opens the browser, and exits.
if /I "%~1"=="--open" goto :waitandopen

echo.
echo   Dossier local server
echo   --------------------
echo   Folder : %FOLDER%
echo   Address: %URL%
echo.

if not exist "%FOLDER%\dossier.html" (
  echo   dossier.html is not in that folder.
  echo   Put this .bat next to dossier.html, or set FOLDER at the top of it.
  echo.
  pause
  exit /b 1
)

set "MISSING="
if not exist "%FOLDER%\assist.js" set "MISSING=%MISSING% assist.js"
if not exist "%FOLDER%\chat.js" set "MISSING=%MISSING% chat.js"
if defined MISSING (
  echo   Note: not beside dossier.html:%MISSING%
  echo         Those parts will say so and everything else works as normal.
  echo         Copy them in and reload the page to get them back.
  echo.
)

if exist "%FOLDER%\dossier.json" (
  echo   Note: this folder also holds dossier.json - your records. While the
  echo         server runs, anything on this PC can read them at that address.
  echo         A folder holding only the three app files avoids that.
  echo         Dossier reaches your workspace through the folder picker, not
  echo         through the server, so the two need not live together.
  echo.
)

rem Already serving? Don't start a second one, just open the browser.
netstat -an | find "127.0.0.1:%PORT%" | find "LISTENING" >NUL 2>&1
if not errorlevel 1 (
  echo   Something is already serving on port %PORT%. Opening the browser at it.
  start "" /min "%~f0" --open
  exit /b 0
)

rem ---- pick a server --------------------------------------------------------
rem Each candidate is actually run, so a launcher with nothing behind it or a
rem Python 2 that has no http.server is passed over rather than chosen.

set "SERVER="
py -3 -c "import http.server" >NUL 2>&1 && (set "SERVER=py" & goto :ready)
python -c "import http.server" >NUL 2>&1 && (set "SERVER=python" & goto :ready)
node -e "require('http')" >NUL 2>&1 && (set "SERVER=node" & goto :ready)
php -r "exit(0);" >NUL 2>&1 && (set "SERVER=php" & goto :ready)

echo   No Python, Node or PHP on this PC, so there is nothing to serve with.
echo.
echo   Install any one of them and run this again:
echo     Python  https://www.python.org/downloads/  (tick "Add to PATH")
echo     Node    https://nodejs.org/
echo.
echo   Until then dossier.html still works opened straight from the folder -
echo   you get Dossier's own reminders, just not Windows notifications.
echo.
pause
exit /b 1

:ready
echo   Serving with: %SERVER%
echo.
echo   The browser opens in a moment. Leave this window open - closing it
echo   stops the server. The first time, Dossier will ask for your workspace
echo   folder again: this is a new address, so the browser treats it as a
echo   fresh site. Your records are untouched, just pick the same folder.
echo.

start "" /min "%~f0" --open

if /I "%SERVER%"=="py"     py -3 -m http.server %PORT% --bind 127.0.0.1 --directory "%FOLDER%"
if /I "%SERVER%"=="python" python -m http.server %PORT% --bind 127.0.0.1 --directory "%FOLDER%"
if /I "%SERVER%"=="php"    php -S 127.0.0.1:%PORT% -t "%FOLDER%"
if /I "%SERVER%"=="node"   node -e "const h=require('http'),f=require('fs'),p=require('path'),m={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.woff2':'font/woff2','.png':'image/png','.svg':'image/svg+xml'};const d=process.argv[1],P=Number(process.argv[2]);h.createServer((q,s)=>{let n=decodeURIComponent((q.url||'/').split('?')[0]);if(n==='/')n='/dossier.html';const t=p.join(d,p.normalize(n).replace(/^([.][.][\\/])+/,''));if(!t.startsWith(d)){s.writeHead(403);return s.end('no')}f.readFile(t,(e,b)=>{if(e){s.writeHead(404);return s.end('not found')}s.writeHead(200,{'Content-Type':m[p.extname(t).toLowerCase()]||'application/octet-stream'});s.end(b)})}).listen(P,'127.0.0.1',()=>console.log('Serving '+d+' on http://127.0.0.1:'+P+'  (Ctrl+C to stop)'))" "%FOLDER%" %PORT%

echo.
echo   The server stopped.
pause
exit /b 0

rem ---- second window: wait for the port, then open the browser --------------

:waitandopen
set "HAVECURL="
where curl >NUL 2>&1 && set "HAVECURL=1"
set /a tries=0

:waitloop
set /a tries+=1
if defined HAVECURL (
  curl -s -o NUL --max-time 2 "%URL%" && goto :launch
) else (
  netstat -an | find "127.0.0.1:%PORT%" | find "LISTENING" >NUL 2>&1 && goto :launch
)
if %tries% GEQ 40 goto :launch
ping -n 2 127.0.0.1 >NUL 2>&1
goto :waitloop

:launch
if /I "%APPMODE%"=="yes" (
  if /I "%BROWSER%"=="edge"   start "" msedge --app=%URL%
  if /I "%BROWSER%"=="chrome" start "" chrome --app=%URL%
  if /I "%BROWSER%"=="default" start "" "%URL%"
) else (
  if /I "%BROWSER%"=="edge"   start "" msedge "%URL%"
  if /I "%BROWSER%"=="chrome" start "" chrome "%URL%"
  if /I "%BROWSER%"=="default" start "" "%URL%"
)
exit /b 0
