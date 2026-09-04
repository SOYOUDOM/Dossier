# Dossier

**A support-operations record that runs as one HTML file, with no install, no
server and no network.** Everything it knows lives in a folder you choose, as
plain JSON and ordinary files that stay readable without this app.

It was built for one job: an application-support engineer's day — incidents,
service requests, changes, the scripts you run against them, the people you
are waiting on, and the question *what should I be doing right now*.

This README is the complete reference. It is written to be read end to end by
a person **or by an automation agent** that has to drive Dossier's files from
outside — every schema, every enumeration, every on-disk protocol and every
invariant is stated in full, with no "see the code" hand-waving.
[Automating Dossier from outside](#15-automating-dossier-from-outside) is the
section to start from if you are wiring this into Power Automate, a scheduled
job, or a script.

---

## Table of contents

| # | Section |
|---|---|
| 1 | [The rules that never bend](#1-the-rules-that-never-bend) |
| 2 | [Quick start](#2-quick-start) |
| 3 | [What is in this repository](#3-what-is-in-this-repository) |
| 4 | [The workspace on disk](#4-the-workspace-on-disk) |
| 5 | [`dossier.json` — the complete schema](#5-dossierjson--the-complete-schema) |
| 6 | [The application surface](#6-the-application-surface) |
| 7 | [How a record behaves](#7-how-a-record-behaves) |
| 8 | [Routines, schedules and cron](#8-routines-schedules-and-cron) |
| 9 | [Scripts and the runner](#9-scripts-and-the-runner) |
| 10 | [The assistant (`chat.js`)](#10-the-assistant-chatjs) |
| 11 | [Assist (`assist.js`)](#11-assist-assistjs) |
| 12 | [Asking through a Power Automate flow](#12-asking-through-a-power-automate-flow) |
| 13 | [Languages](#13-languages) |
| 14 | [Privacy and safety](#14-privacy-and-safety) |
| 15 | [Automating Dossier from outside](#15-automating-dossier-from-outside) |
| 16 | [Testing and measured numbers](#16-testing-and-measured-numbers) |
| 17 | [Known limits](#17-known-limits) |
| 18 | [Glossary](#18-glossary) |

---

## 1. The rules that never bend

These are design invariants, not preferences. Anything built on top of Dossier
— including an automation agent — should preserve them.

| # | Rule | Enforced by |
|---|---|---|
| 1 | **`dossier.html` cannot reach the network.** Not fetch, not XHR, not WebSocket, not a form post. | A `Content-Security-Policy` meta tag: `connect-src 'none'; form-action 'none'`. The browser enforces it; you can verify it in F12 → Network. |
| 2 | **Your records never leave the folder** unless you configure an endpoint and switch it on. No telemetry, no sync, no account, no cloud, and nothing at all by default. | Rule 1, plus there is no server component. The one exception is [§12](#12-asking-through-a-power-automate-flow), which is off until you paste in a URL, states what it sends, and shows you the bytes first. |
| 3 | **The data outlives the app.** `dossier.json` is human-readable JSON; attachments are the original files in ordinary folders. | The save format is plain, indented JSON. |
| 4 | **Nothing is written while you ask a question.** Reading is read-only, down to not creating an empty object in settings. | `chatApi()` builds its view without mutating state. |
| 5 | **Anything that writes asks first.** Log, close, hand over, chase, run, remind — each is proposed and confirmed, whether it arrived as a sentence or a button. | `chatDo()` refuses `act.confirm` unless the action carries `__ok`. |
| 6 | **Nothing an endpoint returns is trusted.** A reply is data to be validated, never a command. An unknown action, a wrong-shaped argument, or a record reference that resolves to nothing is refused by name. | `flow.js` `validate()` and `checkAction()`. |
| 7 | **The runner only ever runs a file already in `scripts\`.** A name containing `\`, `/`, `:` or `..` is refused. | `dossier-runner.bat`, before it executes anything. |
| 8 | **A promise Dossier cannot keep is said out loud.** If a routine is set to run itself and no runner is listening, the Day sheet says so rather than failing silently. | The runner heartbeat, `.runner.txt`. |

---

## 2. Quick start

**This repository folder is itself a ready-to-use workspace.** There is
already work on the sheet, a routine that runs a script by itself, and the
scripts to go with it.

```
git clone https://github.com/SOYOUDOM/Dossier
```

1. **Open `dossier.html`** in Microsoft Edge or Google Chrome — double-click it.
2. Click **Choose workspace folder…** in the banner and pick **this repository
   folder** (the one holding `dossier.html`). Allow "Edit files" when asked.

That is the entire setup. You should immediately see:

- records on the **Day** tab, including today's **Morning tour**
- **Menu → Routines** — *Morning tour*, every weekday 08:30, running
  `open-morning-tabs`, marked **runs itself**
- **Menu → Scripts** — the scripts, already registered
- **Insight** — a recurring problem, with the case already written

> **Browser support.** Dossier needs the File System Access API
> (`window.showDirectoryPicker`), which today means **Edge or Chrome on
> desktop**. Firefox and Safari can open the page but cannot open a folder, so
> they only ever show demo data.

> **Windows notifications need `http://`.** Chrome and Edge refuse the
> Notification API on `file://` with no way to allow it. Double-click
> `scripts\dossier-serve.bat` to serve the same folder from
> `http://127.0.0.1:5500` — nothing else changes. It uses whichever of Python,
> Node or PHP it finds first.

---

## 3. What is in this repository

| File | Size | Required? | What it is |
|---|---|---|---|
| `dossier.html` | ~670 KB | **yes** | The whole application: markup, styles, and all of the logic. Open it directly. |
| `chat.js` | ~360 KB | optional | The assistant — plain-English questions about your own records. Without it, the Ask box says so and everything else works. |
| `assist.js` | ~20 KB | optional | The ranking and briefing engine behind the **Assist** tab and the Insight cards. |
| `flow.js` | ~22 KB | optional | Client for a Power Automate endpoint: builds the request, validates the reply, and owns the relay frame. |
| `flow/relay.html` | ~9 KB | optional | The **only** page allowed to touch the network. Sandboxed, holds no records, pinned to one origin. |
| `flow/CONTRACT.md` | ~16 KB | — | What your flow receives and must return, generated from `flow.js`. |
| `flow/POWER-AUTOMATE.md` | ~19 KB | — | How to build the flow: trigger schema, the prompt, knowledge, and the test order. |
| `flow/sample-request.json` | ~14 KB | — | A real request body, for Power Automate's schema generator. |
| `dossier.json` | ~15 KB | — | The demo workspace: 7 records, 2 routines, 4 scripts, settings, Cambodian holidays. |
| `lang/en.xml` | ~175 KB | optional | Every interface phrase in English — 1,343 entries. |
| `lang/km.xml` | ~125 KB | optional | The same 1,343 keys, **values empty**: a translation template for Khmer. |
| `fonts/NotoSansKhmer-*.woff2` | ~33 KB | optional | Bundled Khmer typeface, so Khmer renders without fetching a webfont. `OFL.txt` is its licence. |
| `scripts/dossier-runner.bat` | 3.4 KB | optional | The runner. Executes what Dossier queues. No PowerShell anywhere. |
| `scripts/dossier-serve.bat` | 6.5 KB | optional | Serves the folder over `http://127.0.0.1` so notifications work. |
| `scripts/open-morning-tabs.bat` | 1.8 KB | demo | Opens the tabs you start the day with, once a day. |
| `scripts/restart-app-pool.bat` | 1.4 KB | demo | A **parameter template** — the `{{server}}` / `{{pool}}` marks become boxes in Dossier. |
| `scripts/queue/` | — | required for the runner | The mailbox between Dossier and the runner. |
| `backups/` | — | auto | One snapshot per day, 30 kept. |
| `favicon.ico`, `logo.png` | — | optional | Your own branding; both fall back to a built-in seal if missing. |
| `.gitattributes` | 28 B | — | `scripts/*.bat text eol=crlf` — a `.bat` with LF line endings breaks `cmd`'s label parsing. |

Everything is a classic script or plain file. There is **no build step, no
bundler, no package manager and no `node_modules`**.

---

## 4. The workspace on disk

A *workspace* is any folder you point Dossier at. It looks like this:

```
<your folder>/
  dossier.json              every record, note and work log
  backups/                  one snapshot per day, 30 kept
  reports/                  summaries you save
  tasks/
    D-0004 Imaging nightly sync timeout on GetPendingAsync/
      incident-email.msg
      screenshot.png
    D-0005 Add policy status column to monthly renewal report/
      deck-v2.pptx
  scripts/
    dossier-runner.bat
    restart-app-pool.bat
    queue/                  the runner's mailbox
```

Rules that matter if anything else writes here:

- **One record, one folder**, named `<code> <safe title>` — e.g.
  `D-0004 Imaging nightly sync timeout on GetPendingAsync`. The name is stored
  in the record's `folder` field, so renaming the folder on disk without
  updating that field orphans the attachments.
- Folder and file names are made Windows-safe: `\ / : * ? " < > |` become
  spaces, control characters are stripped, runs of whitespace collapse, and the
  reserved names (`CON`, `PRN`, `AUX`, `NUL`, `COM1`–`COM9`, `LPT1`–`LPT9`) are
  avoided.
- The folder handle is remembered in **IndexedDB**, never the data. If the
  browser is wiped the worst case is re-picking the folder; the records are
  untouched on disk.
- Saving rewrites **the whole of `dossier.json`**. See
  [§15](#15-automating-dossier-from-outside) for what that means for outside
  writers.

---

## 5. `dossier.json` — the complete schema

### 5.1 Top level

```jsonc
{
  "app": "dossier",              // constant marker
  "version": 3,                  // schema version
  "savedAt": "2026-08-30T04:44:30.017Z",  // ISO 8601, UTC
  "seq": 7,                      // highest record number issued so far
  "settings": { … },             // §5.2
  "routines": [ … ],             // §5.4
  "scripts":  [ … ],             // §5.5
  "tasks":    [ … ]              // §5.3 — "tasks" on disk, "records" in the UI
}
```

`seq` is advisory. On load Dossier recomputes it as
`max(seq, highest numeric part of any task.code)`, so an outside writer that
adds `D-0099` without touching `seq` will not cause a collision.

### 5.2 `settings`

| Key | Type | Default | Meaning |
|---|---|---|---|
| `owner` | string | `""` | Your name. Used in reports and hand-overs. |
| `systems` | array of `{name, colour}` | 8 seeded | The applications you support. `colour` is a hex string and drives every chip and bar for that system. |
| `types` | array of string | `Incident, Service request, Change, Development, Meeting, Admin` | Work types. |
| `parties` | array of string | 10 seeded | Teams you end up waiting on: *Data team, DBA, Infra, Network, Security, Vendor, Agency ops, Finance, Release management, Business user*. |
| `theme` | `"archive"` \| `"vault"` \| custom id | `"archive"` | Archive and Vault are built in and cannot be deleted. |
| `palettes` | array | `[]` | Your own themes: copy one, change five colours, the other twenty-odd are derived. |
| `fonts` | object | — | `{ khmer: "auto" | <family> }` and interface font choices. |
| `remind` | boolean | `false` | Windows notifications on/off. |
| `lead` | number (minutes) | `15` | How long before a due time to warn. |
| `remindOverdue` | boolean | `true` | Nag about late work once a day (`true`) or never (`false`). |
| `remindWait` | number (days) | `3` | How long a record may sit with someone else before it is "due a chase". |
| `autoBlock` | boolean | `true` | Setting `blockedBy` flips status to `blocked` automatically. |
| `rememberFilters` | boolean | `true` | Restore the filter rail between sessions. |
| `savedFilters` | object \| null | `null` | The remembered rail state. |
| `rootPath` | string | `""` | The workspace's full Windows path, typed in by you. Used to generate the `schtasks` line and to detect a runner watching a *different copy* of the workspace. |
| `runner` | boolean | — | "Send it to the runner" rather than "copy the command". |
| `sla` | `{on, P1, P2, P3, P4}` | `{on:true, P1:4, P2:24, P3:48, P4:120}` | Hours from raising a record to its target date, by priority. |
| `calMode` | `"week"` \| `"month"` | `"week"` | The Week tab's shape. |
| `holidays` | array of `{d, n, k}` | Cambodia 2026 | `d` = `YYYY-MM-DD`, `n` = name, `k` = `"public"` \| `"office"`. |
| `templates` | array | — | Saved record templates. |
| `chatLearn` | object | — | Everything you have taught the assistant. See [§10.8](#108-teaching-it). |
| `flow` | `{on, url, scope, deep, cap, timeout, fallback}` | `{on:false,…}` | The Power Automate endpoint. See [§12](#12-asking-through-a-power-automate-flow). |
| `hushed` | array of string | `[]` | Keys of the Day-sheet notices you have silenced. Cleared from **Setup → Hidden notices**. |
| `chatUI` | `{skin, confirm, every, reveal, glow, grid, pulse, typing, chips, ambient}` | all on, `aurora`, ask-first | How the assistant panel looks and behaves. Set from **◎** in the chat header. |
| `memory` | array of `{id, title, body, tags, system, created, updated, uses, lastUsed}` | `[]` | What you have taught the assistant: how something is done, what caused something, what to check next time. See [§12](#12-asking-through-a-power-automate-flow). |

### 5.3 `tasks` — a record

Every field, in the order Dossier writes them:

| Field | Type | Meaning |
|---|---|---|
| `id` | string | Internal key, e.g. `tmtfbrxz1x0ld`. Generated as `"t" + base36(now) + 4 random base36 chars`. **Never shown, never reused, never parsed.** |
| `code` | string | The human reference: `D-0001`, `D-0002`, … Zero-padded to 4 digits, but longer numbers are accepted. |
| `folder` | string | The attachment folder name under `tasks/`. |
| `title` | string | One line. This is what search, similarity and the assistant read. |
| `notes` | string | Free text. Markdown is not rendered; it is kept verbatim. |
| `status` | enum | `open` \| `processing` \| `blocked` \| `done` \| `cancelled`. |
| `priority` | enum | `P1` \| `P2` \| `P3` \| `P4`. |
| `system` | string | Must match a `settings.systems[].name`. |
| `type` | string | Must match a `settings.types[]` entry. |
| `ticket` | string | Your ITSM reference, e.g. `INC0012390`. Free text. |
| `requester` | string | Who asked. Free text; the assistant canonicalises spellings against everything it has seen. |
| `tags` | array of string | Lower-case, free. |
| `blockedBy` | array of string | Record **ids** (not codes) holding this one up. |
| `autoBlocked` | boolean | True when the `blocked` status came from `blockedBy` rather than from you. |
| `waitOn` | string | Who it is sitting with. Usually one of `settings.parties`, but any name works. |
| `waitNote` | string | What you are waiting for. |
| `waitSince` | ISO 8601 | When the wait started. |
| `waitUntil` | `YYYY-MM-DD` | A promised date, if there is one. |
| `chases` | array of ISO 8601 | One entry per chase sent. |
| `waitLog` | array | The hand-over history: who, when, and back again. |
| `scripts` | array of string | Script **ids** attached to this record. |
| `scriptArgs` | object | `{ "<scriptId>": { "<param>": "<value>" } }` — the filled-in boxes. |
| `created` | ISO 8601 | When it was raised. |
| `due` | `YYYY-MM-DD` | Target date. Empty means undated. |
| `dueTime` | `HH:MM` | Optional time on that date, 24-hour. |
| `started` | ISO 8601 | First time work began. Set automatically by the timer and by running a script. |
| `completed` | ISO 8601 | When it reached `done`. |
| `estimate` | number (minutes) | What you thought it would take. |
| `spent` | number (minutes) | Logged time, excluding a running timer. |
| `timerStart` | epoch ms \| `0` | Non-zero while the clock is running. Live time is `spent + (now - timerStart)/60000`. |
| `checklist` | array | Steps, each `{text, done}`. |
| `log` | array | The work log, newest last. Each entry is `{at, text}` and optionally `kind`. `kind:"status"` marks a lifecycle event ("Opened", "Blocked → Open"); entries without a `kind` are notes, script output, chases and attachments. |
| `files` | array | Attachments: `{name, size, type, added}`. The bytes live in `tasks/<folder>/`. |
| `carried` | number | How many times this was rolled forward to another day. |
| `fromRoutine` | string | The routine **id** that raised it, if any. |
| `forDate` | `YYYY-MM-DD` | The day a routine raised it for. |

### 5.4 `routines` — a schedule

| Field | Type | Meaning |
|---|---|---|
| `id` | string | e.g. `Rmorningtour`. Stable across edits, so the records it has raised stay attributed. |
| `title` | string | Becomes the raised record's title. |
| `freq` | enum | `daily` \| `weekly` \| `monthly` \| `cron`. |
| `days` | array of int | Weekdays, `0`=Sunday … `6`=Saturday. `[1,2,3,4,5]` is Mon–Fri. |
| `dom` | int | Day of month, for `freq:"monthly"`. |
| `cron` | string | The expression, for `freq:"cron"`. See [§8.2](#82-cron). |
| `time` | `HH:MM` | When it fires. **Ignored for cron** — the expression carries the time. |
| `system` | string | Copied onto the raised record. |
| `priority` | `P1`–`P4` | Copied onto the raised record. |
| `type` | string | Copied onto the raised record. |
| `checklist` | array of string | Copied onto the raised record as unticked steps. |
| `notes` | string | Copied onto the raised record. |
| `message` | string | If set, the routine only *nudges* you at its time instead of raising a record. |
| `scripts` | array of string | Script ids to attach — and, with `autoRun`, to execute. |
| `autoRun` | boolean | `true` = "runs itself": Dossier queues `scripts[0]` at the scheduled minute. Requires a live runner. |
| `paused` | boolean | Skipped entirely while true. |

### 5.5 `scripts` — a registered script

| Field | Type | Meaning |
|---|---|---|
| `id` | string | e.g. `Sopenmorning`. Referenced by records and routines. |
| `file` | string | The file name inside `scripts/`. **Plain name only** — no path. |
| `name` | string | What you call it, e.g. `open-morning-tabs`. |
| `size` | number | Bytes, as read when registered. |
| `added` | ISO 8601 | When it was registered. |
| `desc` | string | One line, shown wherever the script is offered. |
| `tags` | array of string | For finding it later. |
| `system` | string | Which application it belongs to, or `""`. |
| `params` | array of string | The `{{name}}` marks found in the file. Each becomes a box on any record the script is attached to. |
| `uses` | number | Times run. |
| `lastUsed` | ISO 8601 | Last run. |

### 5.6 Enumerations, in one place

```
status     open · processing · blocked · done · cancelled
live       open · processing · blocked          (everything not done/cancelled)
priority   P1 · P2 · P3 · P4
type       Incident · Service request · Change · Development · Meeting · Admin
freq       daily · weekly · monthly · cron
holiday k  public · office
weekday    0=Sun 1=Mon 2=Tue 3=Wed 4=Thu 5=Fri 6=Sat   (7 also accepted for Sunday in cron)
```

---

## 6. The application surface

### 6.1 The seven views

Switch with **1**–**7**, or by clicking the tab.

| Key | View | What it shows |
|---|---|---|
| **1** | **Day** | Today, in the order you would actually work it: **overdue** first, then **due today**, then what is **in progress**, then what is **blocked**, then the rest. The **Noticed** block lives here too — including "nothing is running your scripts". Each notice carries a ✕: worth saying once, wallpaper by the thirtieth morning, so any of them can be silenced for good and brought back from **Menu → Setup → Hidden notices**. |
| **2** | **Board** | Five columns, one per status, drag between them. |
| **3** | **Register** | The full table: every column, sortable, filterable, bulk-editable. |
| **4** | **Week** | A calendar. `settings.calMode` switches between a 7-day week and a whole month. Holidays are marked. |
| **5** | **Library** | Every attachment across every record, searchable by file name or record title — the answer to "where did I put that screenshot". |
| **6** | **Insight** | Counted, not guessed: throughput this week and month, average turnaround, worst system, who raises the most, and the recurring-problem cases written for you. |
| **7** | **Assist** | The ranked queue and the brief, from `assist.js`. The filter rail is hidden here on purpose — Assist reads closed records too, because that is where its baselines are. |

### 6.2 The menu's seven panels

**Menu** (or `Ctrl`+`K` → *Menu*) opens a tabbed panel:

| Panel | Contents |
|---|---|
| **Workspace** | Which folder is attached, record and next-reference counts, save now, write `dossier.json`, import/export, backups. |
| **Reports** | This week / last week / this month, plus **Stand-up** and **Hand-over** formats. Copy, save into `reports/`, or print. |
| **Routines** | The schedule editor. ✎ edits in place and keeps the id. Shows *runs itself*, *reminds you*, *paused*, *missing script*, when it last raised, and — loudly — *runs itself but nothing is listening*. |
| **Scripts** | Register a script, read its `{{params}}`, set the workspace **Folder path**, write the runner, copy the `schtasks` line. |
| **Appearance** | Theme (Archive, Vault, or your own), fonts including the bundled Khmer face, "feel" (density and motion), language, and **Reload** for language files. |
| **Setup** | Your name · Reminders · Chase after · Running a script · Target dates (SLA) · Holidays and festivals · **Understanding harder questions** (the optional model). |
| **Help** | The keyboard sheet, how your folder is laid out, and the privacy statement. |

### 6.3 The other surfaces

- **The record drawer** — `Enter` or `E` on a record, or click it. Slides in
  from the **left**. Everything about one record: status, dates, timer,
  checklist, attachments, scripts with their parameter boxes, the wait/chase
  block, and the work log.
- **The work console** — `W`. A focused writing surface for the record you are
  on: paste a screenshot straight in with `Ctrl`+`V`, log what you did, attach
  evidence.
- **The chase sheet** — opens from Day or Insight when a team has gone quiet.
  It drafts the message for you, escalating in tone: a first ask is polite, a
  fourth is firm. **Copy and log the chase** puts it on the record and stamps
  `chases`.
- **The command palette** — `Ctrl`+`K`.
- **The filter rail** — system, person, type, tag, priority, status, date
  range. Remembered between sessions when `settings.rememberFilters` is on.
- **The Ask box** — `A`. Docks to the **right** and stays there: it raises no
  dimmer and takes no focus trap, and the app makes room for it rather than
  being covered, so a record can be open on the left and edited while the
  answer is still on screen. See [§10](#10-the-assistant-chatjs).

Buttons inside an answer **resolve when you press them**: the ones you did not
choose fold away and the one you did stays with a tick, so a long thread reads
as a record of what you did rather than a wall of things you might.

**Anything that changes a record is asked in a dialogue over the thread, not
printed into it.** You answer, it goes, and a single line stays behind saying
what happened — with an Undo on it. Two actions become two dialogues, one after
the other, numbered.

The **◎** in the chat header opens *Look and behaviour*, all of it remembered
in `dossier.json`:

| | |
|---|---|
| **Skin** | Aurora · Carbon · Ember · Paper. Every surface in the panel takes its colour from the skin, not from the app theme. |
| **Motion** | Seven switches — answers arriving, edge light, the living background, the orb pulse, thinking dots, springy buttons, and a passing light on an interval you set. Each one genuinely unhooks its animation. |
| **Ask before doing anything** | On by default: everything is put to you first. Off: it does what you ask straight away and the line says *done without asking*. `Ctrl`+`Z` still undoes it either way. |

A machine that has asked for reduced motion gets all of it off the first time
the panel is opened; after that the choice is yours. None of this touches the
rest of the app — the record sheet stays still while you read it.

### 6.4 Keyboard

| Group | Keys |
|---|---|
| **Moving around** | `1`–`7` switch view · `/` search · `N` new record · `J`/`↓` next · `K`/`↑` previous · `Esc` close what is open |
| **On the record under the cursor** | `Enter` or `E` open · `Space` cycle status · `D` mark done · `T` move to today · `S` start/stop the clock · `X` select |
| **Anywhere** | `Ctrl`+`K` command palette · `Ctrl`+`S` save now · `Ctrl`+`Z` undo · `Ctrl`+`V` paste a screenshot onto the open record · `W` work console · `A` ask the assistant · `?` this sheet |

Panels trap focus while open and hand it back when they close, so a keyboard
or screen-reader user is never tabbing around a page they cannot see.

### 6.5 Themes

Two built in — **Archive** (warm, paper) and **Vault** (dark) — and neither can
be deleted. A custom palette is a copy of one with five colours changed; the
other twenty-odd (rules, muted text, hover states, shadows) are derived from
those five. Palettes are stored in `dossier.json`, so a theme travels with the
folder.

---

## 7. How a record behaves

**Status.** `open → processing → blocked → done → cancelled`. `Space` cycles;
`D` jumps to done. Every change appends a `kind:"status"` line to the work log,
including the reverse ("Blocked → Open — nothing is holding this any more").

**Target dates.** With `settings.sla.on`, raising a record sets `due` from its
priority: P1 +4h, P2 +24h, P3 +48h, P4 +120h from now. Under 24 hours it also
sets `dueTime`, so a P1 carries a clock time rather than just a day; 24 hours
or more sets the date alone. An unknown priority falls back to the P3 figure,
and a zero or negative figure means "no target date". Turn the whole thing off
and `due` stays empty until you set one. **A record with no date
never appears in "overdue"** — which is why `undated` is its own question in
the assistant.

**The clock.** `S` starts and stops it. `timerStart` holds the epoch
milliseconds while running; stopping folds the elapsed minutes into `spent`.
Live time anywhere in the app is `spent + (now − timerStart)/60000`.

**Blocking.** `blockedBy` holds record **ids**. With `settings.autoBlock`,
adding one flips the status to `blocked` and sets `autoBlocked:true`; clearing
the last one flips it back and says so in the log. A record blocked by hand
keeps `autoBlocked:false` and is left alone.

**Waiting and chasing.** `waitOn` + `waitSince` start the clock on someone
else. After `settings.remindWait` days it is *due a chase*. Each chase appends
to `chases`; `waitLog` keeps the whole hand-over history. The assistant learns
each party's *usual* response time from your own closed records and uses that
instead of the default once it has enough to go on.

**Attachments.** Drag in, or `Ctrl`+`V` a screenshot. The bytes go to
`tasks/<folder>/`; `files[]` records `{name, size, type, added}` and the work
log gets a line.

**Carrying forward.** Rolling a record to another day increments `carried`.
That number is evidence: a record carried five times is not a scheduling
problem, it is a stuck one, and Assist says so.

---

## 8. Routines, schedules and cron

### 8.1 What a routine is

A schedule, not a task. It repeats, it can carry a message instead of a
record, and it has no status or due date of its own.

At its scheduled minute a routine either:

- **raises a record** — copying `title`, `system`, `priority`, `type`,
  `checklist`, `notes` and `scripts` onto it, stamping `fromRoutine` and
  `forDate`; or
- **nudges you** — if `message` is set, no record is created.

With `autoRun:true` it also **queues `scripts[0]`** for the runner. That is the
one promise Dossier cannot keep by itself, so:

> A routine marked *runs itself* while no runner is listening will raise its
> record on time and then do nothing. Dossier detects this and says so on the
> Day sheet rather than letting it look like a broken app.

### 8.2 Cron

When the dropdowns are not enough, set `freq:"cron"` and write an expression.
Five fields: **minute hour day-of-month month day-of-week**.

| Element | Supported |
|---|---|
| `*` | any |
| `5` | a number |
| `1-5` | a range |
| `1-9/2` | a range with a step |
| `*/15` | a bare star with a step |
| `1,3,5-7` | comma-separated lists of any of the above |
| names | `jan`–`dec` for months, `sun`–`sat` for weekdays |
| shorthands | `@yearly` `@annually` `@monthly` `@weekly` `@daily` `@midnight` `@hourly` |

Ranges: minute `0–59`, hour `0–23`, day-of-month `1–31`, month `1–12`,
day-of-week `0–7` (both `0` and `7` are Sunday).

**Cron's own oddity is kept on purpose:** when *both* day-of-month and
day-of-week are restricted, a day matches if **either** does. Every cron
behaves this way, and quietly doing something more sensible would be worse
than surprising.

Two differences from a server cron, both deliberate:

- Dossier raises **one record per day**, timed at that day's first occurrence —
  a sheet with 96 copies of the same check would be unreadable.
- The **runner fires the script at every occurrence**, which is where the extra
  precision is actually useful.

The **Time** box is ignored for a cron routine; the expression carries the time.
An invalid expression is rejected with the reason, before it is saved.

---

## 9. Scripts and the runner

### 9.1 Why there is a runner at all

A page in a browser cannot start a program, and nothing here should need
installing. So Dossier writes a request into a folder, and a small process of
yours picks it up, runs the script, and writes the result back — which lands
in that record's work log.

**No PowerShell.** The runner is `scripts\dossier-runner.bat`. Everything
passed between Dossier and it is plain text, one value per line: a batch file
reads that with `set /p` and writes it with `echo`, and never has to parse or
escape JSON — which is exactly where these arrangements normally break.

### 9.2 The queue protocol, in full

Everything lives in `<workspace>\scripts\queue\`.

| File | Written by | Contents |
|---|---|---|
| `<id>.run.txt` | Dossier | Line 1: the script's **file name**. Line 2: its arguments, already quoted. CRLF endings. |
| `<id>.out.txt` | the runner | Everything the script printed, stdout and stderr merged. |
| `<id>.done.txt` | the runner | Line 1: the exit code. Its *existence* is the completion signal. |
| `.runner.txt` | the runner | Line 1: the `scripts` folder it is watching. Line 2: the local date and time. Rewritten about every 10 seconds. |
| `.<id>.txt` | Dossier | A marker meaning "this scheduled slot has already been queued", so a routine cannot double-fire. |

Request ids:

- pressing **`$`** on a record → `r<base36 time><4 random base36>`
- a routine firing → `auto-<routineId>-<YYYY-MM-DD>` , plus `-<HHMM>` for cron

The sequence:

1. Dossier writes `<id>.run.txt`.
2. The runner sees it on its next pass — it loops about once a second.
3. **It deletes the request before running it** — so killing the window
   mid-script cannot make the job run again on restart.
4. It validates the name (see below), runs it from inside `scripts\` with
   output redirected to `<id>.out.txt`.
5. It writes the exit code to `<id>.done.txt`.
6. Dossier polls every 250 ms for up to 60 seconds, then appends the first
   4,000 characters of output to the record's work log and stamps `started` if
   it was not already set.

### 9.3 What the runner refuses

Before executing anything it checks the name from line 1 and refuses, with
`-1` in `.done.txt` and a reason in `.out.txt`, if:

- the request named no script at all;
- the name contains `\`, `/`, `:` or `..`;
- the file is not present in the `scripts\` folder.

So a request cannot reach anything else on the machine, whatever wrote it.

### 9.4 Running it

Double-click `scripts\dossier-runner.bat`. The window says which folder it is
watching. **Leave it open — closing it stops the runner.**

To start it at every logon: put the workspace's full path into
**Menu → Scripts → Folder path**, then **Menu → Setup → Running a script →
Copy the schtasks line** and run that once.

Dossier tells you the truth about it at all times. The footer reads `runner on`
or `runner off`, and three states are told apart because the fix differs:

| State | Meaning |
|---|---|
| alive | `.runner.txt` is fresh. |
| nothing there | no heartbeat at all — the runner was never started, or its window was closed. |
| **alive but watching a different copy of the workspace** | the heartbeat names another path. No amount of restarting fixes this, and nothing else can detect it. This is why **Folder path** is worth filling in. |

### 9.5 Script parameters

A registered script's `{{marks}}` become `params`, and each becomes a box on
any record the script is attached to. `restart-app-pool.bat` is the worked
example:

```bat
set "SERVER={{server}}"
set "POOL={{pool}}"

rem -- Refuse to run while the blanks are still blanks.
echo %SERVER%%POOL% | findstr /c:"{{" >nul && ( … )
```

**Build a filled copy** writes a version with the blanks filled into that
record's own folder — so the exact command you ran is filed as evidence next
to the incident it belongs to.

Without a runner, `$` copies the fully-formed command line to the clipboard
instead, and names any parameter still blank.

---

## 10. The assistant (`chat.js`)

### 10.1 What it is, and what it is not

There is **no model here and nothing is downloaded**. The Ask box works on a
`file://` page with the network cable pulled out.

That is workable because this is not general conversation — it is a *bounded*
one. Every system, person, work type, tag, script and record code you might
name is already in your workspace. The half of the problem that normally needs
a model — knowing what your words *refer to* — is answered by reading your own
data. What is left is working out which of ~79 questions you are asking, and
that is done by **weighing evidence rather than matching patterns**, so word
order and filler stop mattering:

```
"imaging stuff from last week?"                    → find · system=Imaging · range=last week
"show me records for Imaging in the past 7 days"   → the same intent, the same slots
```

Three habits keep it from being annoying:

1. it **guesses freely on questions** and **asks first on anything that writes**;
2. when the top two readings are close it **offers both** rather than picking;
3. when you pick one, it **remembers that phrasing** — and its shape — for next time.

It returns plain data and never touches the DOM. `dossier.html` renders the
answer and runs the actions.

### 10.2 The pipeline, in order

| Stage | What happens |
|---|---|
| **normalise** | lower-case, strip punctuation and apostrophes, expand contractions (`what's` → `what is`), expand chat shorthand (`u` → `you`, `pls`, `thx`, `4` → `for`). Clause-final contractions are left alone — "ready when you're." |
| **lead-in** | peel an opener so "hi, what's overdue" answers *both* halves rather than only the greeting. A bare "right, policy?" is checked against your own names first, so it stays a follow-up. |
| **lexicon** | build the vocabulary of *this* workspace — systems, people, parties, types, tags, scripts, routines, codes — plus your aliases. Cached on `api.cacheKey`. |
| **slots** | read every value the sentence carries. |
| **modifiers** | read conditions hung off the question: *except*, *only*, *more than*. |
| **intent** | score every intent on cues, phrases, `needs`, dimension gating, and the evidence rule. |
| **selectors** | *which one* — first, second, last, "the one called invoice", "number 3". |
| **finish** | apply modifiers and selectors, compose the sentence, attach rows, chips and any pending action. |

Two known traps are documented in the source because they cost real time:
`"its"` and `"were"` must **not** be expanded as contractions (the apostrophe
is already gone by then, so "what missed **its** target date" became "what
missed **it is** target date"), and `hi/hello/hey/thanks/ok` must **not** be
treated as noise, or a bare "hi" reaches the matcher as an empty sentence.

### 10.3 The `api` object it is handed

`chatApi()` in `dossier.html` builds this. Nothing in it is mutated by a read.

```js
{
  tasks, routines, scripts, settings,   // the live arrays
  now,                                  // Date.now()
  cacheKey,                             // invalidates the lexicon when the workspace changes
  memory,                               // settings.chatLearn — what you have taught it
  aliases,                              // settings.chatAlias — your own words
  convo,                                // the running conversation state
  phrase(p),                            // renders a {k, v} phrase key through the language file
  ai,                                   // window.DossierAI, or null
  ctx,                                  // the context Assist works from
  h: { tok, idf, similar, estimateFor, predict, knownValues, repeatCandidates,
       today, addDays, dow, mondayOf, niceDate, mins, dayOf, dkey, stamp,
       live, peopleOf, canonPerson, splitPeople, matchParty, findByRef,
       findScript, waitDays, chaseDays, stMeta, parseQuick, LIVE, PRIS }
}
```

`h` is the app's own statistics, handed in rather than reimplemented, so the
two can never drift apart.

### 10.4 The answer object

`DossierChat.ask(text, api)` always returns this shape:

```js
{
  intent: "overdue" | null,     // which question it decided you asked
  kind:   "read" | "write" | "nav" | "social" | "none",
  label:  "What is overdue",    // the human name of that intent
  confidence: 0…1,
  learned: false,               // true when a lesson of yours produced this
  say:    "Three are past their date.",
  note:   "",                   // a caveat, e.g. thin evidence
  rows:   [ … ],                // the list, if the answer is a list
  chips:  [ … ],                // offered follow-ups, each carrying an action
  alternatives: [ … ],          // the other readings, when it was close
  slots:  { system, person, type, party, tag, priority, range, record, … },
  context:{ rows: […] },        // the last list, so "the second one" works next turn
  act:    { kind:…, confirm:… } // a pending action, when one is proposed
}
```

Rows carry `kind` — `"record"`, `"file"`, `"script"` — which is what makes
`"open the second one"` know whether to open a record or a document.

`DossierChat.run(intentName, api, …)` executes a chosen intent directly,
skipping the matcher; that is what the correction UI uses.

### 10.5 The intent catalogue

79 intents. `kind` decides the manners: `read` answers immediately, `write`
always proposes and waits, `nav` moves the app, `social` is conversation.

**`read` — 50**

| intent | what it answers | example |
|---|---|---|
| `next` | What to do next | *what next* |
| `overdue` | What is overdue | *past due* |
| `dueToday` | Due today | *due today* |
| `dueWeek` | Coming up | *coming up* |
| `find` | Find records | *look for* |
| `record` | One record | *what is the status* |
| `field` | One detail | *what is the ticket of D-0032* |
| `waiting` | What I am waiting on | *waiting on* |
| `quietest` | Longest wait | *gone quiet* |
| `howLong` | How long it takes | *how long* |
| `closed` | What I closed | *did i close* |
| `opened` | What came in | *came in* |
| `worstSystem` | Worst system | *which system* |
| `topPerson` | Who asks the most | *who raises* |
| `solvedBefore` | Have I seen this before | *seen this before* |
| `stalled` | What has stopped moving | *not moving* |
| `brief` | Anything I should know | *worth knowing* |
| `workload` | How loaded I am | *how busy* |
| `timeSpent` | Time tracked | *how much time* |
| `count` | How many | *how many* |
| `scripts` | My scripts | *what scripts* |
| `routines` | My schedules | *what routines* |
| `guide` | How you usually do this | *how do i resolve* |
| `troubleshoot` | What to check | *what should i check* |
| `clock` | The time | *the time* |
| `dateToday` | The date | *what is the date* |
| `howTo` | How to do something | *how do i* |
| `about` | About Dossier | *what is this* |
| `steps` | What is left to do | *what is left* |
| `why` | Why it is stuck | *why is* |
| `history` | What happened on it | *what happened* |
| `notes` | Its notes | *the notes on* |
| `files` | Its documents | *any documents* |
| `when` | When it is due | *when is* |
| `similarTo` | Anything like it | *anything like* |
| `blocked` | What is blocked | *what is blocked* |
| `oldest` | Oldest open work | *oldest open* |
| `neverChased` | Never chased | *never chased* |
| `undated` | Work with no date | *no date* |
| `aboutPerson` | About a person | *what does* |
| `standup` | Stand-up summary | *stand up* |
| `compare` | Busier or quieter | *busier than* |
| `tags` | Tags in use | *what tags* |
| `systems` | Systems in use | *what systems* |
| `rank` | Most and least | — |
| `negFind` | The ones that are not | — |
| `taught` | What you have taught me | *what have i taught you* |
| `opinion` | What I make of it | *what do you think* |
| `justify` | Where that came from | *are you sure* |
| `help` | What can you do | *what can you do* |

**`write` — 10**

| intent | what it answers | example |
|---|---|---|
| `log` | Log a record | *log a* |
| `markDone` | Mark it done | *mark it done* |
| `markStart` | Start work | *start on* |
| `markWait` | Hand it to someone | *waiting on* |
| `chase` | Chase someone | *follow up* |
| `run` | Run a script | *run the* |
| `remind` | Set a reminder | *remind me* |
| `notify` | Windows notifications | *turn on notification* |
| `undo` | Undo | *undo that* |
| `teachAlias` | Remember a word | *when i say* |

**`nav` — 3**

| intent | what it answers | example |
|---|---|---|
| `openRecord` | Open a record | *open it* |
| `goto` | Switch view | *go to* |
| `pickOne` | That one | — |

**`social` — 16**

| intent | what it answers | example |
|---|---|---|
| `greet` | Hello | *whats up* |
| `identity` | What I am | *who are you* |
| `howareyou` | How I am | *how are you* |
| `thanks` | Thanks | *thank you* |
| `bye` | Goodbye | *see you* |
| `sorry` | No need | *my bad* |
| `praise` | Glad it worked | *that is clever* |
| `complain` | That missed | *that is wrong* |
| `feeling` | Long day | *long day* |
| `joke` | Not my department | *tell me a joke* |
| `affirm` | Go on | *yes* |
| `nevermind` | Dropped | *never mind* |
| `repeat` | Again | *say that again* |
| `smalltalk` | Outside what I know | *what is the weather* |
| `decline` | No then | *no* |
| `hold` | Waiting | *wait* |

### 10.6 Slots — the values a sentence carries

Read once, available to every intent:

| Slot | Read from |
|---|---|
| `record` / `records` | `D-14`, `d 0032`, `#INC0012345`. A code that resolves to **nothing** is kept as `unknownCode` and said out loud — quietly dropping it and answering some other question is the worst thing the file could do. |
| `system` | any name in `settings.systems`, matched loosely and against your aliases |
| `person` | any requester or `waitOn` value it has ever seen, canonicalised across spellings |
| `party` | any name in `settings.parties` |
| `type` | any name in `settings.types` |
| `tag` | any tag in use |
| `priority` | `p1`, `P 2`, `priority 3`; `critical`/`urgent` → `P1` |
| `status` | any of the five |
| `range` | `today`, `yesterday`, `this week`, `last week`, `this month`, `last 7 days`, `since Monday`, month names, … |
| `date` | a specific day, written any of the usual ways |
| `minutes` | `90m`, `1.5h`, `30 mins`, and `30mn` because that is how it gets typed in a hurry |
| `script` / `routine` | by name |

### 10.7 Modifiers — conditions hung off any question

A condition is not a different question. *"Worst system except Other"* used to
be answered as if the exclusion were not there. Modifiers are read once and
applied in `finish()`, so they work on every intent — including ones written
years before anybody thought of them.

| Modifier | Triggers |
|---|---|
| **exclude** | `except`, `excepting`, `excluding`, `excl`, `ignoring`, `omitting`, `except for`, `apart from`, `other than`, `aside from`, `not counting`, `but not`, `leaving out` |
| **only** | `only`, `just`, `nothing but` |
| **compare** | `more/greater/bigger/higher/longer/older/larger than` → `>` · `less/fewer/lower/shorter/newer/younger/smaller than` → `<` · `at least` → `>=` · `at most` → `<=` · `over`/`above`/`beyond`/`past` → `>` · `under`/`below` → `<` |

Comparison units map to a field: `day(s)/week(s)/month(s)` → **age**,
`hour(s)/minute(s)` → **time**, `chase(s)` → **chase**, `step(s)` → **step**,
`document(s)/file(s)` → **file**. `"more than 3 records"` is deliberately *not*
a filter — it is a statement about the answer's size, not a condition on it.

Words a modifier consumed are masked out before intent scoring, so they cannot
also vote for some unrelated question.

### 10.8 Selectors — *which one*

`"Open the first document of D-0034"` could not be asked, and no amount of
teaching could make it askable, because teaching maps a whole sentence onto one
verb and there is nowhere in that to put *which one*. That is the same shape of
problem as *except* was — a missing **dimension**, not a missing verb — so it is
solved the same way: read once, applied everywhere.

Every answer that comes back as a list is now addressable:

```
open the first document of D-0034
the second one
run the last script on it
open the one called invoice
number 3
the top one
```

| Element | Vocabulary |
|---|---|
| ordinals | `first`/`1st` … `tenth`/`10th`, plus `top` = 1 |
| last | `last`, `latest`, `final`, `newest`, `bottom` |
| by name | `the one called …`, `the file named …` |
| counting nouns | `one(s)`, `document(s)`, `doc(s)`, `file(s)`, `attachment(s)`, `record(s)`, `item(s)`, `row(s)`, `result(s)`, `entry`/`entries`, `script(s)`, `note(s)` |

The noun list is deliberately narrow. `"last week"` is a date, and
`"the first thing I should do"` and `"the first step"` are figures of speech —
none of them is a selection. A selector also needs either a list already on
screen (`context.rows`) or an explicit counting noun before it will fire.

### 10.9 Teaching it

When it gets one wrong, correct it. **One correction is filed twice:**

- under **the sentence exactly as you typed it**, so that one is certain to work
  again; and
- under **its shape**, so everything like it works too.

The shape is the sentence with the particulars replaced by placeholders:

```
"what is the ticket of D-0032"   →   ~what is the ticket of <code>
```

Placeholders: `<code>` a record reference · `<system>` · `<person>` ·
`<when>` a date or range · `<n>` a number.

Stored in `settings.chatLearn` as `key → { intent, text, at }`, where the key is
either the normalised sentence or `"~" + template`.

When nothing matches outright, the **nearest taught shape** is used, but only
under conditions strict enough that a coincidence cannot pass:

- every placeholder the lesson was taught with must be present again — a lesson
  about `<code>` is not a lesson about a question with no record in it;
- the overlap must be ≥ 60% of the lesson and ≥ 50% of what you just asked;
- one word in common is a coincidence unless it is a long, particular word.

**How to teach it, in the app:** ask the question → if the answer is wrong,
press **Teach** on the reply → pick the right one from the list. The overlay
shows the shape it is about to learn, so you can see how far the lesson will
carry. **Menu → …** or asking *"what have I taught you"* lists every lesson,
with the sentence that produced it, and lets you delete any of them.

### 10.10 Aliases — your own words

`"when I say <word> you mean <thing>"` stores an alias:

```js
settings.chatAlias = [ { from:"nps", kind:"system", value:"Notification" }, … ]
```

`kind` is `system`, `person`, `party`, `type`, `tag`, `script` or `routine`.
Aliases join the lexicon immediately — the cache key includes a hash of every
alias's `from>value:kind`, so editing one rebuilds the vocabulary at once
rather than only on add or remove.

### 10.11 Conversation

It remembers the thread: the last record, the last list, the last answer and
the last reasoning. That is what makes these work —

```
what's overdue                → three of them
    the second one            → selector against the remembered list
    why is it stuck           → the reason, from that record
    are you sure              → where the number came from
    open it                   → the record drawer
```

`justify` ("are you sure", "where did that come from") deliberately keeps the
previous answer's context instead of replacing it, so you can interrogate an
answer without losing it.

---

## 11. Assist (`assist.js`)

Also no model, also nothing downloaded. Every number is counted from the
records already in your workspace, so it knows only what you have logged, it
sharpens as you log more, and on a fresh folder it says nothing rather than
guessing.

Two things come out of it:

**`queue(ctx)`** — the live records in the order worth doing, each carrying the
reasons it landed where it did. The score is transparent:

| Signal | Weight |
|---|---|
| overdue | +40, plus 3 per day late (capped at +15) |
| due today | +32 |
| due tomorrow | +18 |
| due soon | +10 |
| priority | P1 highest, sliding down |
| already started | +12 |
| **waiting on someone else** | **−45** |
| **blocked** | **−55**, and more for each record it holds up |
| old and still open | up to +20 by age |
| quick to finish | +6 |

Every record shows its top three reasons in plain words, so the order is
arguable rather than magic.

**`brief(ctx)`** — things worth knowing that no single record would tell you.
Seven detectors:

| Detector | Fires when |
|---|---|
| `surge` | one system is failing more than it usually does |
| `chase` | a wait has passed *that party's own usual* response time |
| `stalled` | a record has stopped moving, judged against its own cohort |
| `runbook` | this looks like something you have solved before — with the case, and the script, already written out |
| `duplicate` | two live records are the same incident |
| `load` | today's estimates exceed the hours left in the day |
| `routineable` | you have raised the same thing on a regular cadence; it should be a routine |

Cards absorb each other where one supersedes another, so you get the finding
rather than five views of it. Every brief states its own **evidence level** —
`thin` under 10 records, `fair` under 40, `good` above — because a
confident-looking card resting on four records is worse than no card.

`assist.js` touches no DOM and knows no language: every piece of text it
produces is a phrase key and its variables, `{k, v}`, rendered by the app
through `L()`. That is what keeps Khmer working for free and keeps the file
testable on its own.

---

## 12. Asking through a Power Automate flow

The local assistant ([§10](#10-the-assistant-chatjs)) answers from your own
records with no network and no model. This is the other route, and it is the
only feature in Dossier that sends anything anywhere. It is **off until you
paste in an endpoint URL and switch it on**, in
**Menu → Setup → Ask through Power Automate**.

### How it fits together

```
dossier.html            flow.js              flow/relay.html        your flow
connect-src 'none'   ─> owns the frame   ─>  connect-src https:  ─>  Power Automate
holds the records       holds no records     holds no records        does the thinking
```

`dossier.html`'s CSP is unchanged and always will be. Every request is made by
`flow/relay.html`, which holds no records, has no access to `dossier.json`, is
**pinned to your endpoint's origin** and refuses any other, and refuses
redirects rather than following one to a host you did not choose.

### The exchange

Dossier posts one JSON object — your message, the date, the last few turns,
your workspace's vocabulary, a slice of your records, and `can`: the full list
of actions the flow may ask for, generated from the running code. The flow
returns `say`, `ask`, and `actions`.

Actions that only read run immediately. **Every action that writes is shown to
you in full and waits for a yes** — the same gate the local assistant's write
actions have always used, and it holds whether the action arrived as a
proposal or as a button.

45 actions, 13 read-only and 32 that write — records, checklists, time,
waiting and chasing, blocking, tags, scripts, routines, holidays, memory, the
application's own settings, and the vocabulary itself. Three of them delete (a
record, a routine, a note); all confirm like everything else and all are undone
by `Ctrl`+`Z`.

**Asking before acting is itself a setting.** *Menu → Setup → Assistant* has a
switch for it. Leave it on and every write is shown to you and waits; turn it
off and writes run the moment they arrive. The switch is yours — nothing that
comes back over the wire can move it, and the endpoint URL cannot be written
by any action at all (see *Settings the assistant may change*, below).

### Memory — teaching it a method

`remember` is the action that makes the app worth teaching. Explain in the Ask
box how something is done — *"when the imaging sync times out you recycle the
pool on APP02 and re-run the job, remember that"* — and it proposes a note:
a title you will search for later, and a body that can run to paragraphs with
commands in it. Say yes and it is kept in `settings.memory`, in
`dossier.json`, in your folder.

Every note then travels with **every** later question, in any conversation,
for as long as the workspace exists. Ask again in March and the answer comes
back from what you wrote in September. `recall` reads one out verbatim,
`forget` removes one, and **Menu → Setup → What you have taught it** lists
them all — editable in place, with how often each has been asked for.

### Asking with a file, and answers with code

The Ask box takes **more than one line** (Enter sends, Shift+Enter breaks) and
**attachments** — drop them on the panel, paste a screenshot straight in, or
use the clip. They go to your endpoint as base64 with the question, and
nowhere else.

Images are **shrunk before they go**, because base64 is a third larger than
the file it encodes and an untouched 4 MB screenshot becomes 5.2 MB of JSON —
enough to fail a request that the same question typed out would survive. An
11 MB test image came out at 163 KB. Limits after shrinking: five files, 2 MB
each, 3.5 MB for one question; the composer shows the running total.

Answers come back with their line breaks intact. A fenced block becomes a code
panel with its language and a copy button; `backticks` become inline code.
Nothing else in a reply is interpreted — it is not a markdown renderer and
should not become one, because every feature added to it is another way for
text from outside to put markup on your page.

### Settings the assistant may change

`setTheme` and `setSetting` let you say *"switch to the dark theme"*, *"start
my week on Sunday"*, or *"chase after two days instead of three"* and have it
happen, instead of hunting through the menu for the switch.

Both write, so both confirm unless you have turned confirmation off. Every
request carries `workspace.settings`, which lists the current theme, the theme
names available, and `canSet` — the keys the assistant is allowed to touch,
generated from the running code so the list in the request is the list the app
will actually honour:

| Key | What it is |
|---|---|
| `theme` | The application theme. |
| `week` | Which day a week starts on. |
| `dateFormat`, `timeFormat` | How dates and times are written. |
| `lang` | Interface language. |
| `chaseAfterDays` | Days waiting before something is worth chasing. |
| `targetDates.on`, `targetDates.hoursFromRaising` | Whether target dates are set, and how far out. |
| `holidayRule` | What a routine does when it lands on a holiday. |
| `autoRun` | Whether routines may raise themselves. |
| `confirmActions` | Whether writes wait for a yes. |
| `denseRows`, `showWeekends`, `calendarStart` | Layout and calendar. |

**The list is a boundary, not a convenience.** Four things are kept off it on
purpose:

- **`settings.flow` — the endpoint URL.** A flow that could rewrite the address
  Dossier posts to could point it somewhere else of its own choosing, and
  nothing downstream would notice. It is a credential — see *Switching it on*,
  below — so no action reaches it. This holds *even with confirmation turned
  off*: the refusal is in the executor, not in the dialogue.
- **`memory`, `chatLearn`** — taught notes and taught vocabulary have their own
  actions (`remember`, `forget`, `teach`), which show you the text.
- **`hushed`** — the notices you have silenced are yours to un-silence.
- **`palettes`, `chatUI`** — structured objects, not single values; the panels
  edit them.

Anything else asked for comes back as a plain refusal naming the key, and the
setting is untouched.

### Email it writes for you

`draftEmail` writes the mail and hands it to you. *"Draft a chase to the vendor
about INC-4471"* comes back as a card with TO, CC, SUBJECT and the body,
already written in the register you would use, with **Copy** and **Open in my
mail app** underneath. The second opens your own mail client with the fields
filled in.

**Nothing is sent.** Dossier has no mail credentials, no outbound connection
and no CSP permission to make one, and it does not pretend otherwise — the
draft is text until you send it yourself. That is also why `draftEmail` counts
as a read and does not sit behind a confirmation: writing you a draft changes
nothing in the workspace.

### What it refuses

Nothing coming back is trusted — which matters the moment your flow's prompt
starts reading a mail or a ticket somebody else wrote. An action not in `can`
is dropped and named. A missing or wrong-shaped argument is dropped and named.
A record reference that resolves to nothing is refused at the moment of
running. A script or party you do not have is refused, with the list of ones
you do.

### The two things that break every first attempt

1. **No Response action** in the flow, so it never answers.
2. **No `Access-Control-Allow-Origin: *`** header on that Response — the flow
   runs perfectly, the run history says success, and the browser still refuses
   to let Dossier read the reply.

Both look identical from the outside ("Failed to fetch"), so Dossier tells
them apart: after a failure it retries opaquely, and if the host answered
that way it reports the missing header **by name** instead of guessing.

**Test the connection** walks six rungs and names the one that broke.
**Show me exactly what would be sent** prints the bytes before you trust it
with anything real. **Show the relay** puts the frame on screen with a
timestamped transcript, with the URL's signature masked so it is safe to paste.

### Switching it on — `settings.flow`

Stored in `settings.flow`:

| Key | Default | Meaning |
|---|---|---|
| `on` | `false` | Off until you switch it on, even with a URL set. |
| `url` | `""` | Your flow's HTTP POST URL. **This is a credential** — see below. |
| `scope` | `"live"` | `names` (no records at all) · `live` · `all`. |
| `deep` | `false` | Include notes and work logs. |
| `cap` | `400` | Most records to send; live work is kept first when it has to cut. |
| `timeout` | `30` | Seconds before giving up. |
| `fallback` | `true` | When the flow fails, answer with the local assistant instead and say so. |

> **The URL is a password.** Anyone holding a Power Automate trigger URL,
> signature and all, can run your flow. It is stored in `dossier.json` in your
> workspace, so do not commit that file to a public repository, and rotate the
> trigger's signature if it gets out.

Two documents go with this:

- [`flow/POWER-AUTOMATE.md`](flow/POWER-AUTOMATE.md) — the recipe. The trigger
  schema, the prompt to paste into the AI action, where standing knowledge
  goes and where it must not go, and the order to test in that finds problems
  fastest.
- [`flow/CONTRACT.md`](flow/CONTRACT.md) — the specification. Every argument
  of every action, generated from `flow.js`.
- [`flow/sample-request.json`](flow/sample-request.json) — a real request from
  the demo workspace, for *Use sample payload to generate schema*.

---

## 13. Languages

Every phrase in the interface is a key, resolved through `lang/<culture>.xml`:

```xml
<localizationDictionary culture="en" name="English">
  <texts>
    <text name="Day" source="Day" value="Day" />
    <text name="SearchEverything" source="Search everything…" value="Search everything…" />
```

- `name` is the key, `source` is the English, `value` is the translation.
- **Leave a `value` empty and that phrase stays English** — translating in
  passes is fine, and a half-finished file is never a broken interface.
- `{p0}`, `{name}` are values Dossier drops in. Keep them exactly, but move
  them wherever the sentence needs.
- Save the file, then **Menu → Appearance → Reload**.

Current state: **`en.xml` has all 1,343 entries filled**. **`km.xml` has the
same 1,343 keys with every `value` empty** — it is a ready-to-fill Khmer
template, not a finished translation. The Khmer typeface is bundled in
`fonts/` so Khmer renders without fetching a webfont, which would have broken
the no-network promise.

To add a language: copy `en.xml` to `lang/<culture>.xml`, change `culture` and
`name`, empty every `value`, and translate.

---

## 14. Privacy and safety

- **`connect-src 'none'`** on `dossier.html`. The browser enforces it. Open
  F12 → Network and you will see nothing leave, because there is nothing that
  *can* leave.
- No account, no telemetry, no analytics, no sync, no update check.
- The folder handle lives in IndexedDB; **the data never does**.
- Attachments are copied into the record's folder as the original bytes. They
  are never uploaded, converted or inspected.
- **Every write is confirmed** — and the confirmation holds wherever the action
  came from. A "Mark it done" chip used to run the moment it was clicked while
  the same action typed as a sentence asked first: one button, two behaviours,
  and the dangerous one was silent. Now both ask.
- The runner runs **as you**, with no elevation, and touches no network.
- `Ctrl`+`Z` undoes the last change.
- Backups: one snapshot per day into `backups/`, 30 kept.

---

## 15. Automating Dossier from outside

Dossier has **no API and no server** — on purpose. The integration surface is
the folder: a JSON file you can read and write, and a queue directory that
already accepts requests from anything that can write a text file.

This section is the contract. Follow it and an outside automation — Power
Automate, a scheduled PowerShell job, an agent — can read work, raise work, and
run scripts without corrupting anything.

### 15.1 The one rule that matters

> **Dossier rewrites the whole of `dossier.json` when it saves.** It saves 700 ms
> after any change, and on `Ctrl`+`S`. It reads the file **once**, when the
> folder is attached.

So there is no merge and no file locking. Two safe patterns, one unsafe one:

| Pattern | Safe? |
|---|---|
| Write `dossier.json` **while the Dossier tab is closed** | ✅ yes — it is read fresh on next attach |
| Write only into `scripts/queue/` and `tasks/<folder>/` | ✅ yes — Dossier never rewrites those wholesale |
| Read `dossier.json` at any time | ✅ yes |
| Write `dossier.json` **while the tab is open** | ❌ your write is lost at the next save |

If an automation must add records while someone might have Dossier open, prefer
a **drop folder** of your own that a person imports, or write at a time the tab
is known to be closed (overnight, a logon task).

### 15.2 Reading work out

Everything is one `Get file content` + `Parse JSON` away.

```powershell
$d = Get-Content .\dossier.json -Raw -Encoding UTF8 | ConvertFrom-Json
$today = (Get-Date).ToString('yyyy-MM-dd')
$live  = 'open','processing','blocked'

# overdue
$d.tasks | Where-Object { $live -contains $_.status -and $_.due -and $_.due -lt $today }

# waiting on someone, three days or more
$d.tasks | Where-Object {
  $live -contains $_.status -and $_.waitOn -and
  ((Get-Date) - [datetime]$_.waitSince).TotalDays -ge 3 }

# time logged this week, in hours
[math]::Round((($d.tasks | Measure-Object -Property spent -Sum).Sum) / 60, 1)
```

Notes for whoever writes the queries:

- `status` is the only truth about whether something is finished. There is no
  separate "closed" flag.
- **Live** means `open`, `processing` or `blocked`. Reports that forget
  `blocked` under-count.
- Dates are two different kinds: `due`, `waitUntil` and `forDate` are calendar
  days (`YYYY-MM-DD`); `created`, `started`, `completed`, `waitSince`, `added`
  and `log[].at` are full ISO 8601 instants in UTC. Do not compare them
  directly.
- Times are **minutes**, everywhere (`estimate`, `spent`, `minutes`).
- `timerStart` is epoch **milliseconds** and is `0` when idle. Live time is
  `spent + (now − timerStart)/60000`.
- `blockedBy` and `scripts` hold **ids**, not codes or names.

### 15.3 Writing work in

If you add a record, produce **every** field in [§5.3](#53-tasks--a-record).
Dossier normalises what it loads, but an automation that omits `log`, `files`
or `tags` produces records that behave subtly differently from hand-made ones.

```powershell
$d = Get-Content .\dossier.json -Raw -Encoding UTF8 | ConvertFrom-Json

# codes: never reuse, never guess. Take the highest that exists.
$max  = ($d.tasks | ForEach-Object { [int]($_.code -replace '\D','') } |
         Measure-Object -Maximum).Maximum
$next = [math]::Max($max, [int]$d.seq) + 1
$code = 'D-' + $next.ToString('0000')
$now  = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.fffZ')

$rec = [ordered]@{
  id=('t' + [guid]::NewGuid().ToString('N').Substring(0,12)); code=$code
  folder="$code Nightly sync failed"; title='Nightly sync failed'; notes=''
  status='open'; priority='P2'; system='Imaging'; type='Incident'
  ticket='INC0012345'; requester='Operations'; tags=@()
  blockedBy=@(); autoBlocked=$false
  waitOn=''; waitNote=''; waitSince=''; waitUntil=''; chases=@(); waitLog=@()
  scripts=@(); scriptArgs=@{}
  created=$now; due=(Get-Date).ToString('yyyy-MM-dd'); dueTime=''
  started=''; completed=''; estimate=60; spent=0; timerStart=0
  checklist=@()
  log=@(@{ at=$now; kind='status'; text='Opened' })
  files=@(); carried=0; fromRoutine=''; forDate=''
}

$d.tasks += $rec
$d.seq    = $next
$d.savedAt= $now
$d | ConvertTo-Json -Depth 12 | Set-Content .\dossier.json -Encoding UTF8
```

Rules for a writer:

1. **`code` must be unique.** Compute it from the maximum that exists, not from
   `seq` alone — `seq` is advisory and is recomputed on load anyway.
2. **`id` must be unique and is never parsed.** Any stable random string works.
3. **`folder` must be a Windows-safe name.** Strip `\ / : * ? " < > |`, strip
   control characters, collapse whitespace, and avoid `CON PRN AUX NUL COM1-9
   LPT1-9`. If you also create `tasks/<folder>/`, the two must match exactly.
4. **`system` and `type` must already exist** in `settings.systems[].name` and
   `settings.types[]`, or the record shows with no colour and drops out of
   filters.
5. **Every status change should append a log line**, `{at, kind:"status", text}`.
   The work log is the audit trail; a record that changed state with no log
   entry looks like corruption to everything that reads it.
6. **Write UTF-8 without a BOM.** A BOM makes `JSON.parse` fail and the folder
   looks empty.
7. **Copy the file to `backups/dossier-YYYY-MM-DD.json` before you touch it**
   if your job is unattended.

### 15.4 Running a script from outside

You do not need Dossier for this at all. The runner takes requests from
anything that can write two lines of text.

```powershell
$q  = '.\scripts\queue'
$id = 'ext' + [DateTime]::UtcNow.ToString('yyyyMMddHHmmss')

# line 1: the file name, in scripts\. line 2: its arguments. CRLF.
Set-Content "$q\$id.run.txt" -Value @('restart-app-pool.bat','APP02 ImagingPool') -Encoding ASCII

# wait for it — .done.txt appearing is the completion signal
$deadline = (Get-Date).AddMinutes(5)
while (-not (Test-Path "$q\$id.done.txt") -and (Get-Date) -lt $deadline) {
  Start-Sleep -Milliseconds 250
}
$exit   = (Get-Content "$q\$id.done.txt" -TotalCount 1).Trim()
$output = Get-Content "$q\$id.out.txt" -Raw
```

- Exit `0` is success. Exit `-1` is the runner refusing (see
  [§9.3](#93-what-the-runner-refuses)) — read `.out.txt` for which of the three
  reasons.
- The request file is **deleted before the script runs**, so a missing
  `.run.txt` does not mean it never started.
- **Is the runner even alive?** `scripts/queue/.runner.txt` is rewritten about
  every 10 seconds. Judge it by the file's own modified time, not by the text
  inside — line 2 is `cmd`'s locale-dependent date format and is not worth
  parsing. Line 1 *is* worth reading: it names the folder the runner is
  watching, which catches a runner alive but pointed at a different copy.
- Clean up `<id>.run.txt`, `<id>.out.txt` and `<id>.done.txt` when you are
  done; nothing prunes them for you.

### 15.5 Using the assistant headlessly

`chat.js` is a classic script with no DOM dependency, so it runs under Node:

```js
global.window = global;
require('./chat.js');

const api = {
  tasks: d.tasks, routines: d.routines, scripts: d.scripts, settings: d.settings,
  now: Date.now(), cacheKey: 'x', memory: d.settings.chatLearn || {},
  aliases: d.settings.chatAlias || [], convo: {},
  phrase: p => '', ai: null, ctx: null,
  h: { /* the helpers from §10.3 that your question actually needs */ }
};

const a = DossierChat.ask('what is overdue', api);
console.log(a.intent, a.say, a.rows.length);
```

`h` is the part that takes work — it is the app's own statistics. A read-only
integration usually needs only `findByRef`, `today`, `dayOf`, `live`, `LIVE`
and `PRIS`. `DossierChat.shortlist(text, api, 0)` returns every candidate
reading with its score, which is useful for routing a message without
committing to an answer.

### 15.6 A checklist for an automation agent

```
BEFORE WRITING dossier.json
  [ ] the Dossier tab is closed
  [ ] a dated copy exists in backups/
  [ ] the file parses as JSON and app == "dossier"

WHEN ADDING A RECORD
  [ ] code is max(existing codes, seq) + 1, zero-padded to 4
  [ ] id is unique
  [ ] folder is Windows-safe and matches any folder you created
  [ ] system exists in settings.systems, type exists in settings.types
  [ ] status is one of open/processing/blocked/done/cancelled
  [ ] priority is P1..P4
  [ ] every date field is the right kind (day vs instant)
  [ ] log has an opening entry
  [ ] seq and savedAt updated

WHEN CHANGING A RECORD
  [ ] append a log line for anything a person would want explained
  [ ] set completed when status becomes done
  [ ] clear timerStart if you fold time into spent

WHEN RUNNING A SCRIPT
  [ ] the file is already in scripts\ (the runner refuses anything else)
  [ ] .runner.txt is fresher than ~30 seconds
  [ ] line 1 is a bare file name, line 2 the arguments
  [ ] wait for <id>.done.txt, then read <id>.out.txt
  [ ] delete the three files afterwards

NEVER
  [ ] weaken the CSP in dossier.html
  [ ] write dossier.json while the tab is open
  [ ] put a path, ".." or a drive letter in a run request
  [ ] reuse a record code
```

---

## 16. Testing and measured numbers

There is no test runner in the repository — the suites live outside it and
drive the real files in a real browser (Playwright + Chromium), because the
things that break here are things a unit test cannot see: a stale iframe cache,
a CSP refusal, a file one folder away from where a manifest says.

The thirteen exercised for the current release — `teach`, `talk2`, `pick`,
`flowval`, `flowe2e`, `flowui`, `flowmore`, `chatui`, `memui`, `probe`,
`shrink`, `chatfx`, `settings` — report **433 passing assertions and no
failures**, covering the local assistant, teaching, selectors, the reply
validator, the whole network path in a real browser against an endpoint that
misbehaves the way real ones do, the Setup panel, all 45 actions, the docked
layout down to where each masthead tab lands, the memory round trip (taught in
one conversation, recalled in another), the chat skins and motion switches, the
settings whitelist — including that an endpoint asking to rewrite its own URL
is refused *with confirmation turned off* — and, counted against a server that
records every request, exactly how many times the endpoint is called and how
large each call is.
Nine suites covering the local model were deleted with it.

Measured, and stated honestly:

| What | Result |
|---|---|
| Generated phrasings (9,542 sentences) | **97.4%** |
| Unfamiliar vocabulary, hand-written before any tuning | **56.3%** |
| `chat.js` on held-out phrasing *families* | **97.1%** |
| A from-scratch averaged-perceptron classifier, same held-out families | **38.8%** |
| A second benchmark half that scored 100% | **discarded — 93% of it leaked** |

That last row is the point. A 70.4% → 100% jump was measured and then thrown
away, because 93% of the test half contained a phrase that had been added to
the vocabulary verbatim. A benchmark you tuned against stops being a benchmark.

The from-scratch model experiment is also worth stating plainly: training a
classifier on Dossier's own generated corpus reached **38.8%** on unseen
phrasing families, against `chat.js`'s **97.1%** on the same split. Writing a
model from scratch was tried, measured, and rejected on the numbers.

---

## 17. Known limits

- **Edge and Chrome on desktop only.** Firefox and Safari have no File System
  Access API, so they can show the app but not open a folder.
- **Notifications need `http://`**, not `file://`. Use
  `scripts\dossier-serve.bat`.
- **With the tab closed, nothing is queued.** Dossier schedules its own
  automatic runs, so a routine marked *runs itself* needs the tab open *and* a
  live runner. For something that must fire regardless of whether anyone is
  looking, point Windows Task Scheduler straight at your `.bat` — it needs
  nothing from Dossier.
- **The batch runner has no single-instance guard and no per-script timeout.**
  Two runner windows open on the same folder will both claim requests, and a
  script that hangs blocks the queue behind it until you close the window.
  (The retired PowerShell runner enforced both; the `.bat` was chosen instead
  because it needs nothing installed, and this is the price.) Start one window,
  and give long-running scripts their own timeout internally.
- **The demo `dossier.json` still registers two PowerShell scripts that no
  longer ship** — `dossier-runner.ps1` and `dossier-watch.ps1`, left over from
  before the batch runner replaced them. They show in **Menu → Scripts** as
  *missing script*. Harmless, and deleting those two entries is the fix.
- **`km.xml` is a template, not a translation.** All 1,343 keys are present with
  empty values.
- Parsing `dossier.json` is the one thing that gets slower as work piles up —
  at 20 records a day it is a few megabytes within a year. The runner compares
  its modified time and parses only when something was actually saved.

---

## 18. Glossary

| Term | Meaning |
|---|---|
| **Workspace** | The folder Dossier is pointed at. Holds `dossier.json` and everything else. |
| **Record** | One piece of work. Called `tasks` in the JSON, *record* everywhere a person can see. |
| **Code** | A record's human reference, `D-0001`. |
| **Live** | Status `open`, `processing` or `blocked` — anything not finished. |
| **Routine** | A schedule that raises a record, or nudges you, on a cadence. |
| **Runs itself** | A routine that also queues its script — needs a live runner. |
| **Script** | A `.bat` registered in `dossier.json` and living in `scripts\`. |
| **Parameter** | A `{{mark}}` in a script, which becomes a box on any record it is attached to. |
| **The runner** | `dossier-runner.bat`, watching `scripts\queue\`. |
| **Queue** | `scripts\queue\` — the plain-text mailbox between Dossier and the runner. |
| **Heartbeat** | `.runner.txt`, rewritten every ~10 seconds so Dossier knows the runner is alive. |
| **Intent** | One of the 79 questions the assistant can answer. |
| **Slot** | A value read out of a sentence — a system, a person, a date range. |
| **Modifier** | A condition hung off a question — *except*, *only*, *more than*. |
| **Selector** | *Which one* — first, second, last, "the one called invoice". |
| **Lesson** | A correction, filed under both the sentence and its shape. |
| **Shape / template** | A sentence with its particulars replaced: `what is the ticket of <code>`. |
| **Alias** | Your own word for one of your own things. |
| **Brief** | What `assist.js` finds that no single record would tell you. |
| **Evidence level** | `thin` / `fair` / `good` — how much a finding rests on. |

---

*Dossier is one HTML file, some sidecar scripts, and a folder. That is the
whole architecture, and it is the point: in ten years the folder will still
open, whatever happened to this app.*
