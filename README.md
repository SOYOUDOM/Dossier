# Dossier

A support operations record. One HTML file, no install, no server, no network.
Everything you log lives in a folder you choose, as plain JSON and ordinary
files you can read without this app.

---

## Run it — two minutes

1. **Copy the `workspace` folder somewhere you own**, e.g. `C:\Users\you\Dossier-workspace`.
   It already has records, routines, scripts and Cambodia's 2026 holidays in it.
2. **Open `dossier.html`** in Microsoft Edge or Chrome (double-click it).
3. Click **Choose workspace folder…** in the banner and pick the folder from step 1.
   Allow "Edit files" when the browser asks.

That's it. You should see records on the Day tab, a Morning tour routine under
Menu → Routines, and three scripts under Menu → Scripts.

> Firefox and Safari cannot open a folder, so Dossier can only show demo data
> there. Use Edge or Chrome.

---

## Make a script actually run

A page in a browser cannot start a program. So Dossier writes a request to a
file, and a small PowerShell process of yours picks it up, runs the script, and
writes the output back — which lands in the record's work log.

1. **Menu → Scripts → Folder path** — paste the full path of your workspace
   folder, e.g. `C:\Users\you\Dossier-workspace`. (This is only used to build
   the scheduled-task line; Dossier itself already has the folder.)
2. **Double-click `workspace\scripts\dossier-runner.ps1`.** A window opens:

   ```
   Dossier runner watching C:\...\workspace\scripts\queue
   and the routines in C:\...\workspace\dossier.json
   ```

   Leave it open. If Windows blocks it, right-click → *Run with PowerShell*, or
   start it from a terminal with
   `powershell -ExecutionPolicy Bypass -File .\workspace\scripts\dossier-runner.ps1`

3. In Dossier, press the **`$`** button on any record that carries a script.
   It runs, and the output appears in that record's work log.

To start the runner automatically at every logon, use
**Menu → Setup → Running a script → Copy the schtasks line** and run that once
in a terminal.

---

## Make a routine run itself on time

The included **Morning tour** routine is already set up this way: every weekday
at 08:30 it runs `open-morning-tabs.bat`.

With the runner started, nothing else is needed — it reads the routines out of
`dossier.json` and fires them at their time **whether Dossier is open or not**.
Once per day, and it catches up later if the machine was off at the hour.

To try it without waiting until tomorrow: Menu → Routines, delete *Morning
tour*, and add it again with the time set two minutes from now and **On its
own** = *Yes*. Watch the runner window.

Results are filed into that day's record as **Ran on schedule**, with the exit
code if it failed.

---

## What is in the folder

```
dossier.html                     the whole application
workspace/
  dossier.json                   every record, routine, script and setting
  scripts/
    dossier-runner.ps1           runs queued scripts, fires routines on time
    open-morning-tabs.bat        sample: opens your morning tabs, once a day
    restart-app-pool.bat         sample: parameters, and a filled copy per record
    queue/                       run requests and their results (transient)
  tasks/                         one folder per record, for its attachments
  backups/                       one snapshot per day, 30 kept
```

`tasks/` and `backups/` are created by Dossier the first time it needs them.

---

## Safety

The runner will only execute a file **already sitting in `scripts/`**. The
request names a file, never a command line, and any name containing a path
separator or `..` is refused. It runs as you, with no elevation, and makes no
network calls — nor does `dossier.html`.

Screenshots and attachments are copied into `tasks/<record>/` as ordinary
unencrypted files. Worth a thought before that folder lives on shared storage.

---

## Notes

- **Holidays** are seeded with Cambodia 2026 (Sub-Decree No. 167, 18 Sep 2025).
  Roughly half are lunar and move every year, and the list is reissued
  annually — check it, and edit it under Menu → Setup. Opening a year that has
  nothing marked offers to fill in the dates that never move.
- **Backups** are written to `backups/` once a day, 30 kept. The records
  themselves are just `dossier.json`; copy it anywhere.
- **Press `?`** — Menu → Help explains every feature, including the quick-add
  tokens (`p1 @Imaging #INC0012345 ~Sokha 2h today`).
