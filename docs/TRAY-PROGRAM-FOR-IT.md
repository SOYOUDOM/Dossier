# KalKech and its optional tray program - a note for IT and security

KalKech is a personal records desk (tickets, notes, runbooks) that one
application-support engineer uses. It is a single web page, `dossier.html`,
opened from a local folder in Edge or Chrome. This note says exactly what
runs on the PC, in its two modes, so that you can decide.

## 1. Safe mode - the default since version 5.31

`KalKech.bat` does one thing: it opens `dossier.html` in Edge or Chrome
(`start "" msedge.exe "...\dossier.html"`). In safe mode:

| | |
|---|---|
| Programs started | none - only the browser, with a local HTML file |
| Compiling | none |
| Windows start-up (Run key, Startup folder, Task Scheduler) | nothing added |
| Network listening | none |
| Files written | only in the folder the user picks in the browser (File System Access API): `dossier.json` (the records), `backups\`, `tasks\` (attachments), `sources\` (documents the user adds) |
| Network calls | only the user's own Power Automate flow URL, from a sandboxed iframe (`flow/relay.html`); the page's Content Security Policy allows nothing else except `http://127.0.0.1:*`, which safe mode does not use |
| Scripts | never run; the page copies a command line for the user to run by hand |

`scripts\safe-cleanup.bat` (run once, by hand) removes the start-up entries
older versions created: the HKCU `...\CurrentVersion\Run` value `Dossier`, the
scheduled task `Dossier runner`, and `Dossier.bat` in the user's Startup
folder. It removes nothing else.

## 2. The tray program (optional, off by default)

`scripts\bridge\DossierBridge.cs` is one C# 5 source file (about 3,400
lines, readable, no dependencies outside .NET Framework 4). It is only built
and started by `scripts\bridge\KalKech-tray.bat`, which asks first, and the
page only uses it when the user turns safe mode off (Setup → Safe mode).

What it does, and why each of these may look suspicious to a security tool:

| Behaviour | Detail |
|---|---|
| Built on the PC | `KalKech-tray.bat` compiles the .cs with `%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe` into `scripts\bridge\DossierBridge.exe` (unsigned) |
| Runs without a window | a WinForms tray icon (Open, Show log, Start with Windows, Workspace folder, Quit) |
| Start with Windows | only when the user picks it: HKCU `Software\Microsoft\Windows\CurrentVersion\Run`, value `Dossier` = `"...\DossierBridge.exe" --quiet` |
| Listens | a `TcpListener` on `127.0.0.1` only (port 5500 by default), never on other interfaces; every request needs a random token it writes to `.bridge.json` in the user's records folder |
| Database | SQL Server LocalDB `(localdb)\MSSQLLocalDB` (or the server the user names), database `Dossier`; creates its own tables (`sql\schema.sql`) |
| Starts processes | `cmd.exe` to run `.bat`/`.cmd` files that are already in the user's `scripts\` folder (a value with `& \| < > ^ % ! " ( )` or a line break is refused); `taskkill /PID <its own child> /T /F` when one runs too long; `notepad.exe` for its log; the default browser, with its own page (`http://127.0.0.1:5500/dossier.html`) |
| Outbound HTTPS | only to the API addresses the user saved as "connections" for Automations, only when an automation runs; no redirects followed; TLS 1.2 (1.1 and 1.0 allowed, for old internal servers) |
| Secrets | API passwords/keys the user types, encrypted with DPAPI (current user) in `%LOCALAPPDATA%\KalKech\secrets.dat`; never sent to the page or to the AI |
| Registry | HKCU `Software\KalKech`, value `SqlServer` (the server name the user chose) |
| Log | `scripts\bridge\dossier.log` |

It contacts nothing on the internet by itself, collects nothing, and has no
update mechanism.

## 3. If you approve it

The safest way is for you to build and sign it yourselves:

```
%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe /nologo /target:winexe /optimize+ /langversion:5 ^
  /reference:System.Data.dll /reference:System.Windows.Forms.dll /reference:System.Drawing.dll ^
  /reference:System.Security.dll /out:DossierBridge.exe DossierBridge.cs
```

then sign `DossierBridge.exe` with your code-signing certificate and place it
in `scripts\bridge\`. `KalKech-tray.bat` only compiles when the .cs file is
newer than the .exe, so a signed .exe that is newer is used as it is.

## 4. If you do not approve it

Nothing more is needed: safe mode is the default, `DossierBridge.exe` can be
deleted, and `scripts\safe-cleanup.bat` removes the old start-up entries.
Without the tray program the user loses the SQL database (records stay in
`dossier.json`), running scripts from the page, Windows notifications and
running Automations.
