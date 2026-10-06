# KalKech

> **KalKech was called Resolv from 4.8 to 5.12, and Dossier before that.**
> Only the name you see changed. The files keep their names — `dossier.html`,
> `dossier.json`, `.dossier-store.json` — as does the SQL Server database
> (`Dossier`), so nothing has to move. `KalKech.bat` starts it; `Resolv.bat`
> and `Dossier.bat` still work and pass straight through.

**A support-operations record that runs as one HTML file, with no install, no
server and no network.** Everything it knows lives in a folder you choose, as
plain JSON and ordinary files that stay readable without this app.

It was built for one job: an application-support engineer's day — incidents,
service requests, changes, the scripts you run against them, the people you
are waiting on, and the question *what should I be doing right now*.

This README is the complete reference. It is written to be read end to end by
a person **or by an automation agent** that has to drive KalKech's files from
outside — every schema, every enumeration, every on-disk protocol and every
invariant is stated in full, with no "see the code" hand-waving.
[Automating KalKech from outside](#15-automating-dossier-from-outside) is the
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
| 15 | [Automating KalKech from outside](#15-automating-dossier-from-outside) |
| 16 | [Testing and measured numbers](#16-testing-and-measured-numbers) |
| 17 | [Known limits](#17-known-limits) |
| 18 | [Glossary](#18-glossary) |

---

## 1. The rules that never bend

These are design invariants, not preferences. Anything built on top of KalKech
— including an automation agent — should preserve them.

| # | Rule | Enforced by |
|---|---|---|
| 1 | **`dossier.html` can reach exactly one thing: `http://127.0.0.1`.** Not the internet, not `localhost` by name, not any other origin, and no form post anywhere. | A `Content-Security-Policy` meta tag: `connect-src http://127.0.0.1:*; form-action 'none'`. The browser enforces it; you can verify it in F12 → Network. **This was `connect-src 'none'` until v4.0**, when the database bridge arrived — it is the one loosening in the file's history, it is a loopback address, and nothing on the far side of it leaves the machine. |
| 2 | **Your records never leave the folder** unless you configure an endpoint and switch it on. No telemetry, no sync, no account, no cloud, and nothing at all by default. | Rule 1, plus there is no server component. The one exception is [§12](#12-asking-through-a-power-automate-flow), which is off until you paste in a URL, states what it sends, and shows you the bytes first. |
| 3 | **The data outlives the app.** Every save writes `dossier.json` — human-readable, indented, openable in Notepad on a machine with no SQL Server and no KalKech on it. In database mode that file is an export rather than the store, written a few seconds after each save commits (the latest state each time), for exactly this reason. | `exportSoon()` runs only after the transaction commits, and only into the folder it was meant for. |
| 4 | **Nothing is written while you ask a question.** Reading is read-only, down to not creating an empty object in settings. | `chatApi()` builds its view without mutating state. |
| 5 | **Anything that writes asks first.** Log, close, hand over, chase, run, remind — each is proposed and confirmed, whether it arrived as a sentence or a button. | `chatDo()` refuses `act.confirm` unless the action carries `__ok`. |
| 6 | **Nothing an endpoint returns is trusted.** A reply is data to be validated, never a command. An unknown action, a wrong-shaped argument, or a record reference that resolves to nothing is refused by name. | `flow.js` `validate()` and `checkAction()`. |
| 7 | **The runner only ever runs a file already in `scripts\`.** A name containing `\`, `/`, `:` or `..` is refused. | `dossier-runner.bat`, before it executes anything. |
| 8 | **A promise KalKech cannot keep is said out loud.** If a routine is set to run itself and no runner is listening, the Day sheet says so rather than failing silently. | The runner heartbeat, `.runner.txt`. |

---

## 2. Quick start

> ### Keep your records in a folder of their own
>
> **Do not use the folder you cloned this into as your workspace.** Earlier
> versions of this page told you to, and it cost somebody their week: a
> `git pull` or a `git checkout` replaces every file git tracks, and
> `dossier.json` used to be one of them. One command in the wrong folder and
> the records and the day's backup are whatever the repository last said they
> were.
>
> Nothing in this repository tracks a workspace file any more — `dossier.json`
> and `backups/` are in [`.gitignore`](.gitignore), and the demo has moved to
> `demo/`. **If you cloned before v3.12.2 and your records are in the clone**,
> run this once, in that folder:
>
> ```
> git rm --cached dossier.json
> git rm -r --cached backups
> ```
>
> KalKech also notices for itself: open a workspace with a `.git` in it and it
> says so, once, and offers to write the `.gitignore` for you.

```
git clone https://github.com/SOYOUDOM/Resolv
```

1. **Make a folder for your records**, anywhere but the clone —
   `Documents\Dossier` will do. To start with the demo rather than an empty
   sheet, copy `demo\dossier.json` into it as `dossier.json`.
2. **Double-click `KalKech.bat`** in the clone. The first time it takes a
   few seconds to set itself up; after that it opens
   `http://127.0.0.1:5500/dossier.html` in your browser and sits as an icon
   by the clock — no window. It asks once which folder holds your records
   (the one from step 1), and creates the database for you if SQL Server
   LocalDB is on the PC. Without LocalDB it still works, and your records
   stay in `dossier.json`. (You can also just open `dossier.html` directly —
   everything works except Windows notifications and the database.)
3. Click **Choose workspace folder…** in the banner and pick **the folder you
   made**. Allow "Edit files" when asked.

With the demo copied in you should immediately see:

- records on the **Day** tab, including today's **Morning tour**
- **Menu → Routines** — *Morning tour*, every weekday 08:30, running
  `open-morning-tabs`, marked **runs itself**
- **Menu → Scripts** — the scripts, already registered
- **Insight** — a recurring problem, with the case already written

> **Browser support.** In **Edge or Chrome on desktop** KalKech keeps every
> record, note and document in a folder you choose, as ordinary files. In
> **Firefox, Safari, or anything else** there is no way for a page to open a
> folder, so KalKech keeps the same files inside the browser's own store
> (IndexedDB) — records, backups and attachments alike, surviving reloads and
> restarts. Clearing that browser's site data would remove them, so use
> Setup → export now and then, and prefer a folder where one is possible.

> **Windows notifications need `http://`.** Chrome and Edge refuse the
> Notification API on `file://` with no way to allow it. `KalKech.bat` hands
> the page out at `http://127.0.0.1:5500/dossier.html` - the same program that
> keeps your records in the database, with no window of its own - so there is
> only ever one thing to start. With no SQL Server on the PC it serves the
> page on its own.

---

## 3. What is in this repository

| File | Size | Required? | What it is |
|---|---|---|---|
| `dossier.html` | ~670 KB | **yes** | The whole application: markup, styles, and all of the logic. Open it directly. |
| `chat.js` | ~360 KB | optional | The assistant — plain-English questions about your own records. Without it, the Ask box says so and everything else works. |
| `assist.js` | ~20 KB | optional | The ranking and briefing engine behind the **Assist** tab and the Insight cards. |
| `flow.js` | ~22 KB | optional | Client for a Power Automate endpoint: builds the request, validates the reply, and owns the relay frame. |
| `diagram.js` | ~45 KB | optional | Draws the diagrams the assistant writes as ` ```mermaid ` blocks — flowcharts, sequence diagrams, state diagrams — as pictures in the chat, on this PC ([diagrams](#how-do-i-get-a-diagram-from-the-assistant)). Pure JavaScript, tested under Node. Without it, a diagram shows as its code, as before 5.11. |
| `sources.js` | ~40 KB | optional | Answering from your runbooks and standards ([Sources](#answering-from-your-runbooks-and-standards-sources)): cuts a document into passages with page, lines and section, searches them, formats citations, and checks an answer's quotes and figures against what it cites. Pure JavaScript, tested under Node. Without it, questions go without passages, as before 5.9. |
| `docs/HOW-THE-AI-WORKS.md` | ~42 KB | — | **How the assistant works, for anyone** — the journey of a question in eight steps, how it learns, how it stays fast, and a reusable blueprint and checklist for building a new AI assistant the same way. |
| `docs/how-the-ai-works.html` | ~58 KB | — | The same guide as pictures: open it in any browser. Self-contained, nothing loaded from the internet. |
| `tests/` | — | — | `node --test` runs the Sources and grounding tests; `node tests/e2e/run.js` runs the app in Chrome or Edge against the same scenarios; `tests/fixtures/` holds the sample documents (made up, no real policy). |
| `flow/relay.html` | ~9 KB | optional | The **only** page allowed to touch the network. Sandboxed, holds no records, pinned to one origin. |
| `flow/CONTRACT.md` | ~16 KB | — | What your flow receives and must return, generated from `flow.js`. |
| `flow/POWER-AUTOMATE.md` | ~19 KB | — | How to build the flow: trigger schema, the prompt, knowledge, and the test order. |
| `flow/SPEED.md` | ~9 KB | — | Why a question used to grow with the workspace, what is ranked on the PC now, and the one prompt edit that goes with it. |
| `flow/sample-request.json` | ~14 KB | — | A real request body, for Power Automate's schema generator. |
| `demo/dossier.json` | ~15 KB | — | The demo workspace: 7 records, 2 routines, 4 scripts, settings, Cambodian holidays. It sits in `demo/` so that nothing the app writes can collide with it — copy it into your own folder to start from it. |
| `lang/en.xml` | ~175 KB | optional | Every interface phrase in English — 1,343 entries. |
| `lang/km.xml` | ~125 KB | optional | The same 1,343 keys, **values empty**: a translation template for Khmer. |
| `fonts/NotoSansKhmer-*.woff2` | ~33 KB | optional | Bundled Khmer typeface, so Khmer renders without fetching a webfont. `OFL.txt` is its licence. |
| `fonts/Inter-latin.woff2` | ~48 KB | optional | Inter, the typeface of the Lumen chat skin, embedded in `dossier.html` the same way. `Inter-OFL.txt` is its licence. |
| `scripts/dossier-runner.bat` | 3.4 KB | optional | The runner. Executes what KalKech queues. No PowerShell anywhere. |
| `KalKech.bat` | ~6 KB | **start here** | **The one thing to double-click.** Builds and starts KalKech as an icon by the clock — the page at `http://127.0.0.1:5500/dossier.html`, the database created and migrated by itself, your scripts' runner hidden. `startup` / `startup off` for starting with Windows. |
| `Resolv.bat`, `Dossier.bat` | ~1 KB | — | The old names, kept so shortcuts and habits keep working: they pass straight through to `KalKech.bat`. |
| `scripts/dossier-serve.bat` | ~1 KB | — | Kept so nothing that points at it breaks: passes through to `KalKech.bat`. |
| `scripts/open-morning-tabs.bat` | 1.8 KB | demo | Opens the tabs you start the day with, once a day. |
| `scripts/restart-app-pool.bat` | 1.4 KB | demo | A **parameter template** — the `{{server}}` / `{{pool}}` marks become boxes in KalKech. |
| `scripts/queue/` | — | required for the runner | The mailbox between KalKech and the runner. |
| `backups/` | — | auto | One snapshot per day, 30 kept, **in your workspace folder**. Git-ignored, and never in this repository. `demo/backup-2026-08-28.json` is a sample of the shape. |
| `favicon.ico`, `logo.png` | — | optional | KalKech's logo (since 5.14; blue to violet); both fall back to a built-in seal if missing. Replace them with your own and they are picked up. The old marks are kept in `art/`: Resolv's R as `art/resolv-logo.svg` and `art/resolv-icon.svg`, the Dossier D as `art/dossier-logo.png` and `art/dossier-favicon.ico`. |
| `assets/assistant-logo.png`, `assets/assistant-bg.jpg` | — | optional | The assistant's own mark and the picture behind its panel. Each is asked for once when the panel opens and used only if it answers. |
| `assets/crimson-mark.png` | — | optional, not shipped | Your own mark for the **Crimson** skin. Asked for only when an `assets` folder is there; Crimson otherwise draws its own heart. |
| `assets/thinking.gif` | 1.5 KB | optional | The animation shown while an answer is on its way, when the pixel set is off. The same file travels inside `dossier.html` as two kilobytes of base64, so a copy on its own still has it; a file here overrides that. |
| `assets/pixel/*.gif` | 9.7 KB | optional | The pixel set — nine sprites the assistant panel wears when **Pixel art** is on, and seven the desk pet wears. All sixteen also travel inside `dossier.html` as base64; a file here overrides its copy, one sprite at a time. `crimson/` and `neon/` hold the same sixteen for the heart and the neon cat. |
| `assets/pixel/crimson/*.gif` | 9.8 KB | optional | The same sixteen for the **Crimson** skin: the heart. Inside `dossier.html` too, as `crimson/<name>`. |
| `art/make-pixel-art.py` | ~40 KB | — | Where the sprites are drawn: each frame is a picture written out in characters, one per pixel. Stdlib Python — it writes the GIFs itself, LZW and all. Also writes `art/contact-sheet.png` and `art/contact-sheet-crimson.png`, every frame on a dark band and a light one. |
| `art/embed-pixel-art.py` | 2.2 KB | — | Carries `assets/pixel/*.gif` into `dossier.html` as base64, between two marker comments. Run after the art changes; never otherwise. |
| `.gitattributes` | 28 B | — | `scripts/*.bat text eol=crlf` — a `.bat` with LF line endings breaks `cmd`'s label parsing. |
| `.gitignore` | ~1 KB | — | Every path the app writes — `dossier.json`, `backups/`, `tasks/`, the runner's queue. Git must never create, replace or delete one of them. |
| `sql/schema.sql` | ~16 KB | optional | Creates the LocalDB database, creates or migrates the tables, and loads a `dossier.json` into them. Idempotent, and its own migration history. |
| `sql/pull.sql` | ~1 KB | optional | The newest snapshot back out as JSON — the exact bytes that went in. |
| `sql/check-reserved-words.py` | ~4 KB | — | Checks every identifier in the SQL against the T-SQL reserved-word list. Written after three of them shipped. |
| `sql/check-json-paths.py` | ~3 KB | — | Walks every JSON path the loader reads against a workspace holding one of everything. A wrong path loads nothing, quietly. |
| `scripts/check-bat.py` | ~4 KB | — | The five things that have actually gone wrong in a `.bat`: an argument used as a path (`%1` stops at the first space, and a work folder is `OneDrive - Contoso Ltd`), a redirect on an `if` line (cmd performs it whether the condition holds or not), LF line endings, a byte over 7 bits, a call to PowerShell. |
| `scripts/dossier-sql.bat` | ~7 KB | optional | The launcher: `init`, `push`, `pull`, `check`, `history`, `find`. Defaults to `(localdb)\MSSQLLocalDB`. |
| `scripts/dossier-bridge.bat` | ~1 KB | — | Kept so nothing that points at it breaks: passes through to `KalKech.bat`, arguments and all. |
| `scripts/bridge/DossierBridge.cs` | ~45 KB | optional | KalKech, running: the tray icon and its menu, the page, the database (created, migrated, written, and its history kept), the hidden runner. C# 5 and Windows Forms, so `csc.exe` from the .NET Framework builds it with nothing installed. |
| `flow/prompt.txt` | ~15 KB | **the assistant's instructions** | What the model reads, with ten places KalKech fills in before every question. Edit it in Notepad and the next question uses it — nothing to change in Power Automate. Your own version goes in your records folder as `dossier-prompt.txt`, where updates never touch it. |
| `flow/embed-prompt.py` | ~1 KB | — | Copies `flow/prompt.txt` into `flow.js`, for a page opened straight from the folder, which cannot read the file beside it. |
| `flow/check-prompt.js` | ~3 KB | — | Checks `flow/prompt.txt`: every example reply against the validator KalKech uses on real replies, all ten places present, the copy in `flow.js` the same. |
| `sql/load-proc.sql` | ~14 KB | optional | `dbo.LoadWorkspace` — the only code that writes the tables, called by both the bridge and `push`. |

Everything is a classic script or plain file. There is **no build step, no
bundler, no package manager and no `node_modules`**.

---

## 4. The workspace on disk

A *workspace* is any folder you point KalKech at — and it should be a folder
of its own, not a git checkout. **Only KalKech writes these files.** Nothing
else should create, replace or delete one of them, which is exactly what a
`git pull` into the folder does if the folder is a clone (see
[§2](#2-quick-start)).

It looks like this:

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
  sources/                  your runbooks and standards (see Sources)
    catalog.json            every document: version, effective date, status, access label, what could not be read
    src.../                 one folder per document
      <original file>       exactly as it was added - the source of truth
      text.txt              the words read out of it ("[page N]" between PDF pages)
      chunks.json           its passages, with page, lines, section and a stable id
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
- **`sources/` is KalKech's too.** To add, replace or remove a document, use
  **Library → Sources** (or attach it in a conversation); a file dropped into
  the folder by hand is not in the catalog and is not searched.
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

`seq` is advisory. On load KalKech recomputes it as
`max(seq, highest numeric part of any task.code)`, so an outside writer that
adds `D-0099` without touching `seq` will not cause a collision.

### 5.2 `settings`

| Key | Type | Default | Meaning |
|---|---|---|---|
| `owner` | string | `""` | Your name. Used in reports and hand-overs. |
| `sources` | `{clearance, chatDocs, budget}` | `{[], "chat", 14000}` | Answering from documents ([Sources](#answering-from-your-runbooks-and-standards-sources)). `clearance`: the access labels this workspace may read; `chatDocs`: a document attached in a conversation is kept for that conversation only (`"chat"`, since 5.15) or in Sources for every conversation (`"sources"`); `budget`: characters of passages sent with a question. |
| `systems` | array of `{name, colour}` | 8 seeded | The applications you support. `colour` is a hex string and drives every chip and bar for that system. |
| `types` | array of string | `Incident, Service request, Change, Development, Meeting, Admin` | Work types. |
| `parties` | array of string | 10 seeded | Teams you end up waiting on: *Data team, DBA, Infra, Network, Security, Vendor, Agency ops, Finance, Release management, Business user*. |
| `ui` | `"studio"` \| `"quiet"` \| `"classic"` \| `"nova"` \| `"prism"` \| `"neon"` | `"studio"` | The look ([§6.5](#65-looks-and-themes)). |
| `pet` | `{on, corner, char}` | on (off with reduced motion), `"br"`, `"auto"` | The desk pet: shown or not, its corner, and its character — `"auto"` (the chat skin's own), `"robot"`, `"heart"` or `"cat"`. |
| `theme` | `"archive"` \| `"vault"` \| `"studio"` \| `"nova"` \| `"prism"` \| `"neon"` (and their light or dark partners) \| custom id | `"studio"` | The palette. The built-in ones cannot be deleted. |
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
| `chatUI` | `{skin, confirm, every, reveal, glow, grid, pulse, typing, chips, ambient, place, side, dockW, floatBox, name}` | all on, `nebula`, ask-first, docked right | How the assistant panel looks and behaves. Set from **◎** in the chat header. |
| `memory` | array of `{id, title, body, tags, system, created, updated, uses, lastUsed}` | `[]` | What you have taught the assistant: how something is done, what caused something, what to check next time. See [§12](#12-asking-through-a-power-automate-flow). |
| `exportPick` | array of part names | every part | The parts ticked the last time you exported (see [Export](#how-do-i-export-only-some-of-my-data)). |

### 5.3 `tasks` — a record

Every field, in the order KalKech writes them:

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
| `alert` | object \| `null` | An alert you set on this record ([§6.7](#67-alerts-on-the-records-you-choose)): `{by, before, at, set, from, fired}`. `by:"due"` goes off `before` minutes (0 = at) before its due time and follows the date; `by:"at"` goes off at `at` (`YYYY-MM-DDTHH:MM`, local time). `from` is `you` or `assistant`; `fired` is the moment (epoch ms, as a string) it last went off for, so it never goes off twice. |

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
| `autoRun` | boolean | `true` = "runs itself": KalKech queues `scripts[0]` at the scheduled minute. Requires a live runner. |
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
| **4** | **Week** | A calendar. `settings.calMode` switches between a 7-day week and a whole month. Holidays are marked, and so are your **special days** — the ✦ on any day marks one, with a note (below). |
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
| **Skin** | **Nebula** · **Lumen** · **Crimson** · **Halo** (5.17) · **Neon** (new in 5.18). Aurora, Carbon, Ember and Paper were taken away in 5.14 at the owner's request; a workspace that used one opens in Nebula. Nebula's surfaces take their colour from the skin, not from the app theme; Lumen, Crimson, Halo and Neon follow the app's light or dark mode and change the layout too (below). |
| **Motion** | Seven switches — answers arriving, edge light, the living background, the orb pulse, thinking dots, springy buttons, and a passing light on an interval you set — and an eighth, *Lively icons*, while Lumen, Crimson, Halo or Neon is the skin. Each one genuinely unhooks its animation. |
| **Pixel art** | One switch, for the sprites below. Off leaves the panel exactly as it was: the drawn orb, the old waiting animation, a `✓` on a receipt. |
| **Ask before doing anything** | On by default: everything is put to you first. Off: it does what you ask straight away and the line says *done without asking*. `Ctrl`+`Z` still undoes it either way. |

A machine that has asked for reduced motion gets all of it off the first time
the panel is opened; after that the choice is yours. None of this touches the
rest of the app — the record sheet stays still while you read it.

#### Lumen

The skin that changes the layout as well as the colours (with Crimson, Halo
and Neon, below, which are built on it). Pick it under **◎ →
Skin → Lumen**; the other skins stay exactly as they were, and switching back
is one click.

- **Answers are the page, not bubbles.** Each one sits under a small mark and
  the assistant's name, full width, in [Inter](https://rsms.me/inter/) at a
  reading size (embedded in the file, so it looks the same on every PC).
  Your questions are soft bubbles on the right.
- **One row of tools under an answer** — copy, 👍 👎, Retry, Think harder —
  drawn as icons, shown on the newest answer and on the one under the
  pointer, out of the way on the rest.
- **The composer is one card.** The text on top; the clip and a round send
  button on a row under it; attached files inside the card, above the text.
- **An empty conversation opens on a greeting** (good morning, afternoon or
  evening) and four cards to start from.
- **The history is a drawer**: a *New conversation* button, a search box that
  looks through titles *and* what was said, and the conversations grouped
  under Today, Yesterday, Previous 7 days and Older, each with when it was
  last used. It dims the thread behind it; a click there or `Esc` puts it away.
- **The header names the conversation** you are in, with the live status
  under it.
- **Code is dark in both modes**; copy-ready text (an email, a message) is a
  card with its kind, its title and a Copy for each part; branches are a
  segmented switch.

Every animation is the same and behind the same switch — answers arriving,
edge light, living background, orb pulse, springy buttons, the passing light,
and the pixel set, which dresses Lumen as it dresses the others. Your own
`assets/assistant-logo.png` still replaces the mark, in the header, on the
greeting and over each answer.

**Lively icons** (a Motion switch that appears while Lumen is picked, on by
default). Every icon in Lumen is drawn in lines and moves in a way that says
what its button does — only when you point at it or press it:

| Icon | Pointed at | Pressed / state |
|---|---|---|
| Send | the arrow flies up and comes back | flies; sits up once when there is something to send |
| Copy (answer, code, text card) | the two sheets slide apart | turns into a tick that draws itself |
| 👍 / 👎 | nods | pops, and stays filled |
| Retry | turns a full circle backwards | spins |
| Think harder | the star fills and twinkles | — |
| Clip | wiggles | wiggles |
| History · Look · Taught · New · Close | the panel line slides, the slider knobs cross, the notes rewrite, the pen writes, the ✕ turns | the history icon's arrow flips while it is open |
| Delete (history) · Search | the bin's lid lifts · the glass looks around | — |
| The four starter cards | the target pulses, the clock's hand goes round, the bulb lights up, the ? wiggles | — |

Only three things move by themselves, because they have news: the arrow on
*New reply*, the star on *Think harder* under the newest answer (a small
twinkle every few seconds), and the mark over the answer while it is on its
way (the gradient turns and the star breathes; slowly, on an empty
conversation). Icons pop in when they appear. With the switch off the icons
stay and nothing moves; with *reduced motion* on the PC, nothing moves at
all. They are vector drawings rather than GIF files on purpose: a GIF's edges
are either fully there or not at all, so they fray on a dark panel; its
colour is baked in, so it cannot follow light and dark or a hover; and it
loops whether you are looking or not.

#### Crimson

A red-and-white skin with **a character of its own**: a small red heart with
a face, in place of the robot. It uses Lumen's layout (everything in the
Lumen section above holds for it too), with its own colours, its own mark and
its own pictures.

**How do I make the assistant red, with the heart?** Open the chat panel,
press **◎** (Look and behaviour) at the top, and under **Skin** choose
**Crimson**. To go back, choose any other skin; nothing else changes.

What is different from Lumen:

- **Colours:** white, with red (`#d31145`) for the send button, links, the
  switches, the focus ring and the one button that does the thing; a soft
  pink bubble for your messages; a thin red line along the top of the panel.
  In the app's **dark mode** it turns charcoal with a brighter red
  (`#ff4d76`), which reads better on a dark background.
- **The mark:** a white heart with a pulse line through it, on a red tile —
  in the header and over each answer. While an answer is on its way, the
  heart beats.
- **The greeting:** the heart waves over *Good morning*, and a heartbeat
  line runs under it. The line moves while **Passing light** is on (◎ →
  Motion) and stays still with it off, or when the PC asks for reduced
  motion.
- **The character:** with **Pixel art** on, every sprite is the heart's
  version — thinking (it looks one way, then the other, and beats), slow
  (it dozes), the header mark (a beating heart), the greeting (it waves),
  and the shared ones (done, no, oops, ask, new) in its colours. **The desk
  pet becomes the heart too** while Crimson is picked: it cheers, worries,
  naps, stretches and stamps records the same way the robot does.

**Can I use my own picture as Crimson's mark?** Yes, on your own PC: put a
square picture at `assets/crimson-mark.png` beside `dossier.html`. Crimson
uses it in the header, on the greeting and over each answer. The blue star
that comes with KalKech (`assets/assistant-logo.png`) is *not* used by
Crimson — a skin with its own character keeps its own mark unless a picture
is there for it by name. Keep a picture like that in your own folder only;
it does not belong in the repository.

#### Halo

**The moving skin**, new in 5.17 and drawn to go with the **Prism** look
([§6.5](#65-looks-and-themes)). It uses Lumen's layout (everything in the
Lumen section holds for it too) with its own colours, mark and motion.

**How do I use Halo?** Open the chat panel, press **◎** (Look and
behaviour), and under **Skin** choose **Halo**. Choosing the **Prism** look
also offers it: press **Use Halo in the chat too** on the message. To go
back, choose any other skin.

What you see:

- **The mark: a living orb** — a glowing sphere in a ring of violet, pink and
  cyan. The ring turns slowly while the assistant waits, and quickly, with a
  pulse, while an answer is on its way. (With **Pixel art** on, the robot
  stands in for it, as in every skin.)
- **The greeting:** a large orb with two small lights going round it, and
  *Good morning* with light running through the letters.
- **Colour behind the conversation:** soft violet, pink and cyan drifting
  slowly behind the messages, with the cards and the box you type in as
  see-through glass over it.
- **Answers arrive part by part:** each paragraph, list and code block rises
  in just after the one before, so a long answer reads like it is being
  written.
- **Thinking:** a line of colour runs under the header and down the panel's
  edge, and light runs through the *asking your flow…* words.
- **The box you type in:** a ring of colour turns around it while you type;
  **Send** is filled with the prism's colours, grows when you point at it
  and springs when you press it.
- **Light and dark:** frosted white in light mode, deep violet in dark mode.

**Why did the motion switches come on when I picked Halo?** Halo is drawn to
move, so the first time you pick it, the panel's motion switches (◎ →
Motion) are turned on. Each one is still yours to switch off. A PC that
asks for reduced motion is left as it is.

#### Neon

**The cyberpunk skin**, new in 5.18 and drawn to go with the **Neon** look
([§6.5](#65-looks-and-themes)): black, neon yellow and cyan with a hot red,
square edges and cut corners. It uses Lumen's layout, with its own colours,
mark, motion and a character of its own — **a small yellow cat with a
visor**, whose cyan eyes glow in the dark glass.

**How do I use the Neon chat skin?** Open the chat panel, press **◎** (Look
and behaviour), and under **Skin** choose **Neon**. Choosing the **Neon**
look also offers it: press **Use Neon in the chat too** on the message.

What you see:

- **The cat:** with **Pixel art** on, it waves on the greeting, a light
  sweeps across its visor while it thinks, it dozes when an answer is slow,
  and the desk pet becomes the cat too (unless you picked another character
  — see [the desk pet](#66-the-desk-pet)).
- **The mark:** the cat's head on a yellow tile with a corner cut. It blinks
  while it waits, and its visor scans while an answer is on its way.
- **The greeting:** *GOOD MORNING* in capitals, split into red and cyan,
  with a small glitch now and then, and a terminal line under it.
- **Scan lines** behind the conversation, a red-and-cyan glow at the edges,
  and a scan bar that passes down now and then (**Passing light**).
- **Answers switch on like neon tubes** — a flicker, then steady — part by
  part.
- **Thinking:** terminal words with a blinking cursor, and a striped line
  running under the header.
- **The box you type in:** black with a cyan edge, yellow while you type;
  **Send** is a yellow block with a corner cut.
- **In the app's light mode** it turns to Neon Day: black and red on a warm
  off-white, with yellow for what is filled.

#### The pixel set

Nine sprites, sixteen colours, drawn at sixteen pixels square — twenty-four
for the big one. They are not decoration hung on the panel: each one marks a
state the panel was already in, and each appears where that state is already
said in words. (Seven more, in the same palette and the same hand, belong to
[the desk pet](#66-the-desk-pet) and are listed there.)

| | Where it is | What it means |
|---|---|---|
| **think** | the waiting row, where the answer will start | a question is out with your flow |
| **slow** | the same row, after eight seconds | the endpoint is slow, not stuck — the line says so too |
| **orb** | the mark in the header | the panel, idle. It changes to **think** while an answer is on its way |
| **hero** | the middle of an empty thread | the assistant itself, waving |
| **done** | the line left behind by something carried out | it happened, and there is an **Undo** beside it |
| **no** | the line left behind by something declined | nothing happened |
| **oops** | above a failed answer | the flow could not be reached, or the assistant threw |
| **ask** | the confirmation dialogue | you are being asked before anything is changed |
| **new** | the pill above the composer | an answer arrived while you were reading further up |

Three rules hold them together:

1. **They are shown at 16, 32 or 144 pixels and never in between** (120 for
   Crimson's waving heart). One, two, six — or five — times the size they
   were drawn at. A pixel and a half is a blur,
   and a blurred sprite is the one thing this art cannot survive.
2. **A picture of your own wins.** `assets/assistant-logo.png` replaces the
   header mark and the one on an empty thread whether the set is on or not,
   because a mark you chose is not something a mode should paint over.
3. **The order is: your folder, then the file.** `assets/pixel/<name>.gif`
   overrides the copy carried inside `dossier.html`, one sprite at a time,
   and a folder copy that stops loading falls back to the built-in rather
   than leaving a broken-image mark in the thread. A `dossier.html` with no
   folder beside it asks for nothing at all and still has all sixteen.

**Crimson has its own set** under the same sixteen names, in
`assets/pixel/crimson/` (and inside `dossier.html` as `crimson/<name>`), in a
palette of its own: a deep wine outline, the red body, a lit side, pink
cheeks. A skin that brings no set of its own shows the robot.

To change one, edit its picture in `art/make-pixel-art.py` — the frames are
written out as characters, one per pixel, from a sixteen-colour palette —
then run it and `art/embed-pixel-art.py`. The heart is drawn in the same
file (`PAL_CRIMSON`, `HEART`, `hpose`); its contact sheet is
`art/contact-sheet-crimson.png`. There is still no build step: the
GIFs and the base64 are committed, and the app never generates either.

### 6.4 Keyboard

| Group | Keys |
|---|---|
| **Moving around** | `1`–`7` switch view · `/` search · `N` new record · `J`/`↓` next · `K`/`↑` previous · `Esc` close what is open |
| **On the record under the cursor** | `Enter` or `E` open · `Space` cycle status · `D` mark done · `T` move to today · `S` start/stop the clock · `X` select |
| **Anywhere** | `Ctrl`+`K` command palette · `Ctrl`+`S` save now · `Ctrl`+`Z` undo · `Ctrl`+`V` paste a screenshot onto the open record · `W` work console · `A` ask the assistant · `?` this sheet |

Panels trap focus while open and hand it back when they close, so a keyboard
or screen-reader user is never tabbing around a page they cannot see.

### 6.5 Looks and themes

Two separate choices, both in *Menu → Look*.

**The look** is the shape of the interface. **Neon** is the newest (5.18)
and **Prism** the one before it (5.17), both described just below. **Nova** is the one before it: a page
header on every view (the date, a greeting and the day's count on Day; search,
light/dark, *Ask AI* and *New record* on the right), the sidebar grouped into
Work, Knowledge and Assistant with a line icon and a live count per view,
✓ *Mark done* and ✦ *Ask* on every record when you hover it, and everything
drawn as cards with soft shadows. Choosing it puts on its own palette — **Nova**
or **Nova Night** — and leaving it puts your previous palette back.
**Studio** (default) puts the navigation down the left as a sidebar with a
glyph per view, lays the day out as cards on a canvas, and folds to a rail of
glyphs when the assistant is docked at narrower widths. **Quiet** keeps the
top bar with the same restraint — one line per record, status as a dot, colour
only where it must be noticed. **Classic** is the original: boxed rows and
coloured chips, unchanged. Below 900px every look becomes the top bar. The
assistant can switch it (`ui`: `neon`, `prism`, `nova`, `studio`, `quiet` or `classic`).

#### What is the Neon look? (the cyberpunk one)

Neon is Nova's layout as **a screen out of a cyberpunk story** — black,
neon yellow and electric cyan, with a hot red for what is wrong. It is drawn
after the style of those stories, not copied from any game or film: no name,
logo, font or picture of anybody's is in it.

- **Square and cut:** no rounded corners; the main button, the open view,
  the day's first card and every dialog have a corner cut off. Cards carry
  HUD brackets — a yellow corner at the top left, a cyan one at the bottom
  right.
- **Type:** headings, the navigation, labels and buttons in capitals, in
  **Bahnschrift** (a font that comes with Windows 10 and 11, so nothing is
  downloaded); labels, times and the status line in a terminal font. Your
  records stay in the normal reading font.
- **Yellow on the view you are on:** a yellow block with a corner cut slides
  to it in the sidebar. **New record** is yellow with black words, and the
  day's first card is yellow with a black-and-yellow hazard stripe.
- **Behind everything:** a faint grid, scan lines, a red-and-cyan glow at
  the edges of the screen, and a scan bar that passes down now and then.
- **Glitches:** the page title splits into red and cyan for a moment when a
  view opens, and every few seconds after; records glow cyan under the
  pointer and their titles split a little when you point at them.
- **Things switch on:** cards and records flicker on like neon tubes when a
  view opens; dialogs and the record sheet switch on the same way; messages
  slide in with a flicker.
- **The status line is a terminal**, with a blinking cursor.
- **Light and dark:** **Neon** is the dark one (it starts there). The ◐
  button switches to **Neon Day** — black and red on a warm off-white, with
  yellow for what is filled — with a wipe down the screen.

**How do I turn Neon on?** *Menu → Look*, **Look → Neon**. It puts on the
**Neon** palette and offers the **Neon** chat skin and its cat to go with
it. Choosing another look puts your previous palette back. *Motion* makes it
move less or not at all, as with Prism.

#### What is the Prism look?

Prism is Nova's layout (the page header, the grouped sidebar with counts,
the quick actions on each record) in **glass, colour and motion**, after
the way apps were being designed in 2025–26:

- **A slow aurora** of violet, pink and cyan drifts behind the whole page,
  with a fine grain over it.
- **Glass surfaces:** the sidebar floats off the edge as an island, the
  status line is a floating pill, and cards, records and dialogs are
  see-through glass with a light top edge. Records, Setup, the command
  palette and questions blur what is behind them as they open.
- **A light that slides** to the view you open in the sidebar, and counts
  that pop when they change.
- **Views rise in:** opening a view brings its cards and records up one
  after another; the page title shimmers once.
- **Light under the pointer:** records and cards light up where your mouse
  is.
- **Springs:** buttons, cards, dialogs, the record sheet and messages move
  with a little bounce instead of a straight slide.
- **The main buttons** (*New record*, the first card of the day) carry a
  slow flowing gradient; the box you type in gets a turning ring of colour
  while you type; today in the week view has one too.
- **Light and dark** (the ◐ button) spreads out in a circle from the button.

**How do I turn Prism on?** *Menu → Look*, **Look → Prism**. It puts on its
own palette — **Prism** (light) or **Prism Night** (dark) — and offers the
**Halo** chat skin to go with it. Choosing another look puts your previous
palette back.

**How do I make it move less?** *Menu → Look → Motion*: **Subtle** keeps
everything still that loops (the aurora, the turning rings, the flowing
buttons) and makes the rest quick; **None** stops all of it. A PC set to
reduce motion gets the loops off on its own.

**Prism felt slow on my PC — why, and what did KalKech do?** On a PC with no
graphics card (a virtual desktop, often), the browser draws the moving
aurora itself, and everything else slows with it. KalKech times the screen
for a moment after Prism comes on; if it is slow, it keeps the aurora and
the other looping effects still on that PC. Everything else in Prism still
moves.

**The theme** is the palette. Ten built in — **Studio** (graphite ink,
off-white canvas, one indigo accent), **Studio Dark**, **Nova** (cool canvas,
blue accent), **Nova Night**, **Prism** (lavender white, violet and cyan),
**Prism Night**, **Neon** (near-black, neon yellow and cyan), **Neon Day**
(warm off-white, black and red), **Archive** (warm, paper) and **Vault**
(dark) — none deletable. A custom palette is a copy of
one with five colours changed; the other twenty-odd (rules, muted text, hover
states, shadows) are derived from those five. Any look works with any theme.
Palettes are stored in `dossier.json`, so a theme travels with the folder.

Upgrading from 2.x moves a workspace to Studio once, and to the Studio palette
if it was still on Archive by default. A look or theme you had chosen is left
alone, and choosing again afterwards always sticks.

### 6.6 The desk pet

**The desk pet is the assistant.** Not a second character: the same one, out
of its panel and parked in a corner of the window — the robot, the heart
while the chat skin is **Crimson**, the neon cat while it is **Neon**, or
whichever of them you pick (below). It is the same drawing and the same
sixteen colours as [the pixel set](#the-pixel-set), it has the same name, and
since 5.12 it behaves as the same person:

| You | It |
|---|---|
| **click it** | the chat opens and it goes in there — it is the one in the panel's header and the one that waits with you while an answer comes |
| close the chat | it comes back out to its corner and waves |
| point at it (hold still a moment) | says one line about your day: what is overdue, what is due, what it would pick up next, what you closed today |
| ask something, then close the chat | it thinks in its corner, with the same sprite the panel uses — and when the answer arrives it says *Your answer is ready* with the start of it, and a dot; click it (or what it said) to read it |
| have a bell alert go off | it says the alert too; a click opens the record |
| get the morning look-back | it tells you; a click opens it |

For the whole of an ordinary afternoon it is a drawing in a corner that
blinks. Everything else it does is an answer to something that just happened:

| It does this | when |
|---|---|
| cheers | you mark a record **done** |
| looks put out | something is overdue, for as long as it is |
| holds a record and stamps it | the workspace is being saved, or a script has gone out to the runner |
| falls asleep | nothing has been touched for four minutes — and waves when you come back |
| stretches | once, at the end of the working day, if you are still here |
| is carried | while you are dragging it somewhere else |

**Drag it to any of the four corners** — it snaps to the nearest one, and the
corner is remembered in `dossier.json`. Arrow keys do the same when it has
focus; `Enter` opens the chat.

It stays out of the way on purpose. Only the 48-pixel square it occupies
takes a click. It fades out entirely while a drawer, a dialogue or the menu
is open over the work, and while the chat is open it is in the chat, not in
its corner. It reads your records and writes nothing but its own corner.

**Its name is the assistant's name.** Name it in the chat (*"I named you
Elle"*) or under *Menu → Appearance → Desk pet* — either way it is one name:
over the chat, in the box you type in, on the pet, and told to the AI. A pet
named before 5.12 gives its name to the assistant, unless the assistant
already had one.

#### How do I choose the pet? (robot, heart or cat)

1. Open **Menu → Appearance** and find **Desk pet**.
2. Under **Character**, click a picture:
   - **Match the chat skin** (the usual): the skin's own character — the
     heart for Crimson, the cat for Neon, the robot for the others;
   - **Robot**, **Heart** or **Neon cat**: that one, whatever the skin.
3. It changes at once — in its corner **and in the chat** (the greeting, the
   thinking picture, the header). The pet and the assistant are one
   character, so they always match.

The choice is kept in `dossier.json` with the rest of the pet's settings.

*Menu → Appearance → Desk pet* holds the switch, the name, the character and
the corner. A
machine that has asked for reduced motion — or an interface already set to
*Motion: none* — starts with the pet switched off; turning it on there
overrides that, because it is your corner. The pet and the assistant panel's
sprites are two switches over one set of drawings: neither takes the other
away.

---

### Special days on the calendar

Not every day worth marking is a holiday. A **special day** is one you mark
yourself — a release freeze, month-end close, a team day, the day the
auditors come, a birthday — with **a note** on it.

#### How do I mark a special day?

In **Week** or **Month**, click the faint **✦** at the top of the day (it
lights up when you point at the day). A small card opens:

- **What is it?** — a short name, like *Month-end close*;
- **Note** — what to remember: who, what to avoid, what to prepare;
- **Colour** and **icon** — so you can tell your days apart at a glance;
- **Every year on this date** — for birthdays and anniversaries;
- **A day off** — tick it only if you will not be working (then it counts
  like a holiday: due dates move past it).

**Save**, and the day shows a card in its colour, with its icon and note (the
note's first two lines in the week, the name alone in the month), and a
coloured bar across the top of the day. Click the card to change or delete it.
The card opens beside the day and always inside the window, at any text size;
in a short window it scrolls.
You can also ask the assistant: *"mark next Friday as release freeze, no
deployments"* — it asks before it does.

#### Where else do special days show?

- **Day** view: today's special day, and tomorrow's (*Tomorrow: Month-end
  close — finance batch at 22:00*), in the **Noticed** block.
- **Menu → Setup → Special days**: every one in a list, to change or delete,
  and **Mark a special day…** for any date.
- **The assistant** is told the special days of the next half year, with their
  notes, so "can I deploy on Friday?" gets "Friday is the release freeze".

A special day is **not a holiday**: it still counts as a working day unless
you ticked **A day off**. Holidays stay in **Setup → Holidays and festivals**,
as before.

### 6.7 Alerts on the records you choose

An **alert** is something you put on one record yourself. Nothing else ever
alerts you this way — not every record with a date, not the routines, not the
daily list of late work. Those keep their ordinary Windows reminders exactly as
before; an alert is the thing you said you did not want to miss.

**Setting one.** Every record has a **bell** — in its row (next to the timer)
and at the top of its sheet. Press it and choose when:

| Choice | When it goes off |
|---|---|
| **At its due time** | At the record's due date and time (09:00 if it has a date and no time). If the date moves, the alert moves with it. |
| **15 min / 1 h before it is due** | That long before. |
| **At a date and time of my own** | Any moment you pick — for a record with no due date, this is the only choice. |

A record with an alert shows the bell lit, and a small 🔔 chip with the time.
Press the bell again to change it or **Remove alert**. A time already gone is
refused. Every alert set, changed or removed is a line in the record's log,
and **Undo** takes it back.

**Or ask the assistant.** *"Alert me about D-0101 at 3pm"*, *"ping me about
D-0102 30 minutes before it's due"*, *"remind me about this one tomorrow at
9"* — read at once when it names the record and the time plainly, and put to
you before it is set, like every change the assistant makes. A flow can do the
same with `setAlert` and `clearAlert` (see [§12](#12-asking-through-a-power-automate-flow)).
*"Every day at 3"* is a routine, not an alert.

**When it goes off** you get a Windows notification and a note in KalKech, with
**Open** to go straight to the record. Windows notifications need permission
once (**Setup → Reminders**); without it, the note in KalKech still shows.

| | |
|---|---|
| **Never twice** | Each alert goes off once. A reload or a second window does not repeat it; only one KalKech window watches the alerts, and another takes over when it closes. |
| **KalKech was closed** | Up to half a day late it still goes off, saying when it was for; older than that it is only noted in the record's log — a morning of stale alerts helps nobody. |
| **Nothing leaves the PC** | An alert is worked out and shown inside KalKech. It sends nothing anywhere. |

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


### Notes are formatted, Telegram-style

A record's notes, the message kept with a new record, what you teach the
assistant, a system's facts and quirks, a runbook's steps and escalation:
select text and a bar appears over it — **bold**, *italic*, underline, strike,
`code`, a code block, a quote, a spoiler, a link, lists. The keys work
(Ctrl+B, Ctrl+I, Ctrl+U, Ctrl+Shift+X strike, Ctrl+Shift+M code, Ctrl+Shift+P
spoiler, Ctrl+K link with text selected), and so does typing the marks:
`**bold**`, `_italic_`, `__underline__`, `~~strike~~`, `||spoiler||`,
`` `code` ``, ```` ``` ```` then Enter for a code block, `> ` for a quote,
`- ` or `1. ` for a list. **Aa** in the corner opens the bar without a
selection.

What is saved is Markdown text in the same field as always — readable in
Notepad, read by the assistant like anything else, and a workspace from an
older KalKech opens unchanged.

### Three copies, and what each is for

| | Where | Survives | Read it with |
|---|---|---|---|
| **The folder** | `dossier.json` beside your records | anything but the file being replaced or deleted | any text editor — this is the record |
| **This PC remembers** | the browser's own database, on this machine | the folder being wiped, replaced, or pulled over | KalKech, which compares it on every open |
| **A JSON export** | wherever you put it | a new PC, a new browser, a rebuild | KalKech on the other machine — Import |

**What this PC remembers** is written on every save and read on every open. If
the folder comes back with fewer records than this machine remembers, KalKech
**writes nothing** and puts the difference to you — both numbers, both dates —
with three ways out: restore what the PC remembers, keep the folder as it is,
or download the remembered copy as a file and decide later. That check is the
one that catches a folder replaced from outside while the app was closed. It
is not a sync engine: it notices, it stops, and it asks.

It is not somewhere to keep your only copy either. Clearing the browser's site
data removes it, another browser cannot see it, and another PC certainly
cannot.

**Backups on disk** — one snapshot a day in `backups/` — are listed in *Menu →
Workspace* with their size and date, and restore in two clicks. Restoring
writes what is on the sheet now out to a file first, so it is never a one-way
door.

**Moving to another PC** is *Menu → Workspace → Export JSON*, and *Import a
JSON export…* on the other machine. Since 5.17 you choose what goes in the
file, and your knowledge documents can go with it — see the questions below.
Files attached to records are in `tasks/`; copy that folder for those.

#### How do I export only some of my data?

1. Open **Menu → Workspace** and press **Export JSON**.
2. A window lists the parts, each with how many there are: **Records**,
   **Routines**, **Scripts**, **Runbooks & system profiles**, **Notes & what
   the assistant learned**, **Knowledge (Sources)**, **Conversations**,
   **Incident history**, **Calendar** (holidays and special days) and
   **Settings & appearance**.
3. Tick only the parts you want. **Tick all / Untick all** does them all at
   once. The window shows about how big the file will be.
4. Press **Export**. The file goes to your Downloads folder, named after
   what is in it (for example `kalkech-records-sources-2026-10-06.json`, or
   `kalkech-export-….json` when everything is ticked). KalKech remembers your
   ticks for next time.

Nothing is sent anywhere: the file is made in the browser on your PC.

**Your flow address is left out** of *Settings & appearance* unless you tick
**Include my flow address**. The address works like a key — anyone who has
it can use your flow — so only include it when the file stays with you.

A part with nothing in it (for example no incidents yet) cannot be ticked.

#### How do I move my knowledge documents (Sources) to another PC?

Export with **Knowledge (Sources)** ticked. Every document in *Library →
Sources* goes in the file **with its original file** (the PDF, Word, Markdown
or text you added), the words read out of it, and its details (name, version,
effective date, systems, category, who may read it, switched on or off).
Files kept for a conversation go too when **Conversations** is also ticked.

On the other PC, open a workspace folder first, then **Import a JSON
export…**. The documents are stored in that folder's `sources/` exactly as if
you had added them, cut into passages again, and searched by the assistant
straight away. A document that is already there (the same file, or the same
words) is not added twice.

#### How do I import an export?

1. **Menu → Workspace → Import a JSON export…**, and choose the file.
2. The window shows the parts that are in the file, with counts. Tick the
   ones to bring in.
3. Choose how:
   - **Add to what is here** (the usual choice): nothing here is removed. A
     record that is in both keeps the copy that was changed last. Routines,
     scripts, notes, conversations and calendar days that are not here yet
     come in. A document already in Sources is not added again.
   - **Replace the ticked parts**: the ticked parts become what is in the
     file; the parts you did not tick stay exactly as they are. Documents in
     Sources are **switched off**, not deleted, so you can switch them back.
4. Press **Import**. The message says what came in, with **Undo**.

**Settings** from a file take the place of yours (your flow address stays if
the file has none). **Script files** are written back into `scripts\`; if a
script with the same name but different text is already there, yours is
kept and the one from the file is saved beside it as `name (2).sql`.
**Undo** (`Ctrl`+`Z`) puts everything back except documents added to
Sources — remove those in *Library → Sources* if you need to.

Old exports (before 5.17, one file with everything) still import: the
window offers every part they have. A runbook library file (*Library →
Export library*) can be imported here too.

### 4.1 The database as the store

**Double-click `KalKech.bat`.** That is the whole of it. There is no window
afterwards: KalKech is the icon beside the clock, and its menu is how you
open it, see what it is doing, make it start with Windows, and quit it.

| On the icon's menu | |
|---|---|
| **Open KalKech** (or double-click the icon) | `http://127.0.0.1:5500/dossier.html` — bookmark it |
| **Show log** | what it did and why, including why there is no database if there is none |
| **Start with Windows** | the per-user Run key: no console at login, no administrator, and it shows in Task Manager's Startup tab |
| **Workspace folder…** | the folder your records are in — used to run your scripts |
| **Quit KalKech** | stops everything it started, the script runner included |

What that one program does:

- **hands out the page.** Chrome and Edge refuse notifications to a page opened
  from `file://`, which is the only reason `dossier-serve.bat` ever existed.
  The address is fixed at port 5500, because a browser keeps your folder
  permission per address and a moving port would ask for it every morning.
- **makes the database and keeps it up to date.** It runs `sql\schema.sql`
  and `sql\load-proc.sql` itself every time it starts — creating the
  database if there is none, migrating the tables if they are old, and never
  touching a row of data. There is no `init` to remember. LocalDB takes a few
  seconds to wake from cold, so the page opens straight away and says
  *Starting the database…* until it is ready, rather than deciding there is no
  database and writing to a file.
- **writes every change to SQL Server LocalDB**, one transaction per save;
  `dossier.json` beside your records is an export that follows each save
  within a few seconds (and a day's backup at most every five minutes).
  Saving is automatic and there is nothing to press: the dot by the folder
  name pulses yellow while a save is on its way and turns green the moment
  SQL Server has it; hover the status line for how long the last one took.
  A save rewrites only the parts of the workspace that changed — a status
  change rewrites the record tables, not the whole incident history — and
  saves go to the database one at a time, a waiting one skipped when a newer
  one has overtaken it. If a save cannot go through — the bridge restarting,
  the database waking up — your changes stay on screen, the status bar says
  *not saved yet · trying again in 4s*, and KalKech keeps trying on its own
  (2 s, 4 s, 8 s … up to a minute) until it is green again. Click that text
  to try straight away. A save that is slow counts its seconds (*saving… 12
  s*); one that never comes back is let go of and tried again; and when a
  question at the top of the window is what saving waits for, the status
  line says *not saved · answer the question at the top*.
- **runs your scripts, hidden.** The runner for your workspace's `scripts\`
  folder starts with no window and stops when KalKech quits.
- **is only ever one.** A second double-click opens the page the first one is
  serving.

`dossier-bridge.bat` and `dossier-serve.bat` still exist, so nothing that
points at them breaks; both pass straight through to `KalKech.bat`.

### Your work cannot be emptied by accident

4.1 had a way to lose everything, and it was ordinary: open a workspace
against a database that was empty — a fresh `init`, a LocalDB that had been
recreated — and it started a new empty workspace and saved it, into the
database **and out over `dossier.json`**, in one save. The day's backup was
rewritten on every save, so it went too. None of that can happen now:

- **An empty database is filled from your `dossier.json`**, never the other way
  round — or, if that file has nothing in it, from the newest backup that
  does, after asking.
- **Whichever copy is newer wins.** The database and the file are written
  together and carry the same time; if the file is newer, it was changed while
  the database was off, and those changes are brought in, not overwritten.
- **A save that would leave no records, where there were some, is refused**,
  and says so, with a button for the case where you really did delete them
  all. A save that would more than halve ten or more records asks first, with
  both numbers.
- **The database keeps what it replaces.** `dbo.WorkspaceHistory` holds a
  compressed copy of the workspace before each restore, import and shrinking
  save, and every ten minutes while you work — a fortnight of it, then one a
  day. **Menu → Workspace → Database history** lists those and every file ever
  pushed, and restores or downloads any of them.
- **A day's backup is never replaced by a smaller one**, and an unreadable
  `dossier.json` is copied into `backups\` before anything could write over it.
- **One database, one folder.** `.dossier-store.json` binds a folder to the
  database, with the workspace's id; a different folder cannot open or
  overwrite the first one's records.
- `dossier-sql.bat push` refuses a database that already has records unless
  you say `--replace`, and keeps what was there first. With no argument,
  `dossier-sql.bat` only checks.

**Why there is a process at all.** A browser has no SQL client — no page can
open a connection to SQL Server. So the bridge sits between them: JSON over
`127.0.0.1` on one side, T-SQL on the other. It needs nothing installed: it
compiles itself on first run with the C# compiler that ships in
`C:\Windows\Microsoft.NET\Framework64`, binds a plain socket to the loopback
address (no administrator, no URL reservation), and every route that touches
the database needs a token made fresh each time it starts. The page gets that
token from `/hello`, which answers only a page the bridge served itself (right
`Host`, `Sec-Fetch-Site: same-origin`, no CORS on the answer), or from
`.bridge.json` in your workspace folder, for a page opened from the folder.

**Serving the page does not widen any of that.** What is open is `GET` and
`HEAD` of the folder `dossier.html` sits in — your clone — and only file types
an application is made of: `.html`, `.js`, `.css`, fonts, images. `.json` is
not on that list, which is what makes it impossible to serve a `dossier.json`,
a `.bridge.json` or a backup even to somebody who kept their workspace inside
the clone. Nor is anything whose name begins with a dot, nor `..`, nor
`backups\` or `tasks\`.

| | |
|---|---|
| `GET /health` | is it there, which database, which schema version |
| `GET /workspace` | the current workspace, whole |
| `PUT /workspace` | one transaction: the canonical row and every table derived from it, or none of them; 409 if it would empty or more than halve the workspace |
| `GET /history` | every earlier state kept, and every push; `?id=` for one of them whole |
| `GET /hello` | the token, to a page the bridge served itself and nothing else |
| `POST`/`GET`/`DELETE /attachment` | document bytes, as rows |

**What it costs you.** KalKech will not open a database-backed workspace when
KalKech's database is not answering, and will not write one either — not even the
export, because a file ahead of the database is two versions of the truth.
It says so and offers to try again. That is the trade for having one copy of
your work instead of two that can disagree.

**A folder is database-backed once it has been opened against the database**,
marked by `.dossier-store.json`. A folder that never has keeps working exactly
as it always did, reading and writing `dossier.json`.

**Attachments are rows** — `dbo.Attachment`, bytes and all — so a backup of
the database is a backup of the whole workspace. Documents filed before v4.0
stay as files in `tasks\` and still open.

### 4.2 Pushing a file in, and pulling one out

`scripts\dossier-sql.bat` loads your workspace into **SQL Server LocalDB** —
`(localdb)\MSSQLLocalDB` by default, database `Dossier`, no server to install
and nothing to keep running.

This is the file route, and it predates [§4.1](#41-the-database-as-the-store):
nothing is running, nobody is watching, a file goes in and a file comes out.
It is what you want on a routine, or on a PC where the bridge is not welcome.
With the bridge running you do not need it — the database already has every
save — but `push` of an export from another machine and `pull` of a snapshot
are still the way work moves between PCs.

```
scripts\dossier-sql.bat init      create the database and the tables
scripts\dossier-sql.bat push      load dossier.json into it
scripts\dossier-sql.bat check     what is in there
scripts\dossier-sql.bat history   every push, newest first
scripts\dossier-sql.bat pull      the newest snapshot back out as JSON
```

Run it with no argument and it does `init` then `push` — which is what you
want on a **routine**, so the day lands in a database every evening without
anybody remembering to do it.

What it builds:

- **`dbo.Snapshot`** — the file, whole, one row per push, kept forever. A
  `pull` reads this, so a round trip is a copy rather than a reconstruction
  and cannot quietly drop a field nobody thought to shred.
- **Everything else in columns**, replaced on each push, so you can ask SQL
  questions of your own work:

  | | |
  |---|---|
  | `Record` + `RecordLog`, `RecordFile`, `RecordStep`, `RecordTag`, `RecordBlocker` | the records and everything hanging off one |
  | `Runbook` + `RunbookTrigger`, `RunbookStep` | the library, one row per trigger phrase and per step |
  | `SystemProfile` | what each system is like, and what it lies about |
  | `Note` | what the assistant has been taught |
  | `Incident` | the imported history — the table most worth a query |
  | `Chat` + `ChatMessage` | the assistant's conversations |
  | `Holiday` | the working calendar, without which "overdue" means nothing |
  | `Routine`, `Script`, `Setting` | the rest. `Setting` holds only what has no table of its own |

  Four views to start from: `vOpenWork`, `vClosedByWeek`, `vRunbooks`,
  `vIncidentsBySystem`.
- **`dbo.SchemaVersion`** — one number. Every step in `sql/schema.sql` is
  wrapped in a test of it, so running the file against any older database
  brings it forward and running it twice does nothing.

`pull` writes `dossier-from-sql.json` and stops there. `pull --replace` puts
it back as `dossier.json`, keeping the current one as `dossier-before-pull.json`
first. Set `DOSSIER_SQL` / `DOSSIER_DB` to point somewhere else.

It needs `sqlcmd`, which arrives with SQL Server Management Studio.

**Attachments.** Drag in, or `Ctrl`+`V` a screenshot. The bytes go to
`tasks/<folder>/`; `files[]` records `{name, size, type, added}` and the work
log gets a line.

A dropped file is filed against **one** record: the one you have open, or the
one you dropped it onto. Drop it anywhere else and nothing is created — the
toast says so and offers *Make a record for it*, which is a button you press
rather than something that happens to you. A file dropped on the assistant
panel is an attachment to **that question** and goes nowhere near a record.

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
one promise KalKech cannot keep by itself, so:

> A routine marked *runs itself* while no runner is listening will raise its
> record on time and then do nothing. KalKech detects this and says so on the
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

- KalKech raises **one record per day**, timed at that day's first occurrence —
  a sheet with 96 copies of the same check would be unreadable.
- The **runner fires the script at every occurrence**, which is where the extra
  precision is actually useful.

The **Time** box is ignored for a cron routine; the expression carries the time.
An invalid expression is rejected with the reason, before it is saved.

---

## 9. Scripts and the runner

### 9.1 Why there is a runner at all

A page in a browser cannot start a program, and nothing here should need
installing. So KalKech writes a request into a folder, and a small process of
yours picks it up, runs the script, and writes the result back — which lands
in that record's work log.

**No PowerShell.** The runner is `scripts\dossier-runner.bat`. Everything
passed between KalKech and it is plain text, one value per line: a batch file
reads that with `set /p` and writes it with `echo`, and never has to parse or
escape JSON — which is exactly where these arrangements normally break.

### 9.2 The queue protocol, in full

Everything lives in `<workspace>\scripts\queue\`.

| File | Written by | Contents |
|---|---|---|
| `<id>.run.txt` | KalKech | Line 1: the script's **file name**. Line 2: its arguments, already quoted. CRLF endings. |
| `<id>.out.txt` | the runner | Everything the script printed, stdout and stderr merged. |
| `<id>.done.txt` | the runner | Line 1: the exit code. Its *existence* is the completion signal. |
| `.runner.txt` | the runner | Line 1: the `scripts` folder it is watching. Line 2: the local date and time. Rewritten about every 10 seconds. |
| `.<id>.txt` | KalKech | A marker meaning "this scheduled slot has already been queued", so a routine cannot double-fire. |

Request ids:

- pressing **`$`** on a record → `r<base36 time><4 random base36>`
- a routine firing → `auto-<routineId>-<YYYY-MM-DD>` , plus `-<HHMM>` for cron

The sequence:

1. KalKech writes `<id>.run.txt`.
2. The runner sees it on its next pass — it loops about once a second.
3. **It deletes the request before running it** — so killing the window
   mid-script cannot make the job run again on restart.
4. It validates the name (see below), runs it from inside `scripts\` with
   output redirected to `<id>.out.txt`.
5. It writes the exit code to `<id>.done.txt`.
6. KalKech polls every 250 ms for up to 60 seconds, then appends the first
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

KalKech tells you the truth about it at all times. The footer reads `runner on`
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
| `about` | About KalKech | *what is this* |
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

#### How does the assistant work, from my question to its answer?

In eight steps, and only one of them is the AI:

1. **Answer here?** Greetings, counts (*what's overdue?*), *what's new?* —
   answered on your PC at once, with no AI.
2. **Gather** — on your PC, only what this question needs: the best records
   (with totals of all of them), matching notes, lessons, runbooks, past
   fixes, and the passages of your documents in Sources.
3. **Pack** — fill in the blanks of `flow/prompt.txt`.
4. **Send** — through the one door, `flow/relay.html`, to your flow.
5. **Think** — the AI model in your flow writes a reply in a fixed shape.
6. **Check** — only allowed actions; every quote and figure against the
   documents it cites; a line with a figure they do not state is taken out.
7. **Show, and ask** — any change waits for your yes.
8. **Learn** — thumbs down, lessons, notes, *How was it fixed?*, the daily look
   back.

The full explanation, for anyone (no programming needed), is
`docs/HOW-THE-AI-WORKS.md`, and the same as pictures is
`docs/how-the-ai-works.html` — open it in any browser.

#### Does the AI learn? Is it retrained?

It is never retrained, and it does not need to be. The model is the same every
day; what grows is KalKech's notebook in your workspace — lessons, notes, how
things were fixed, draft runbooks, corrections — and the right pages of it go
with each question. You can read every line of it in Setup and delete any
of it. Change the model and nothing learned is lost.

#### Why is it fast, and why does it not get slower as I use it?

Nearly all of the wait is the AI reading what it is sent, so KalKech sends
less: it answers easy questions itself, chooses the data on your PC (about 6
ms for 5,000 records, 2 ms to search 150 documents) instead of with a second
AI call, sends the best 60 records and counts the rest, puts a limit on
everything that grows, uses a fast model for chat and a strong one only for
hard jobs, and makes at most one extra round trip. See *Fast and steady* in
`docs/HOW-THE-AI-WORKS.md`.

#### Can we build another assistant the same way?

Yes: `docs/HOW-THE-AI-WORKS.md` Part 5 is the method without the KalKech
details — nine parts, the order to build them, a checklist, and the mistakes
KalKech made on the way.

The local assistant ([§10](#10-the-assistant-chatjs)) answers from your own
records with no network and no model. This is the other route, and it is the
only feature in KalKech that sends anything anywhere. It is **off until you
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

KalKech posts one JSON object — your message, the date, the last few turns,
your workspace's vocabulary, a slice of your records, and `can`: the full list
of actions the flow may ask for, generated from the running code. The flow
returns `say`, `ask`, and `actions`.

Actions that only read run immediately. **Every action that writes is shown to
you in full and waits for a yes** — the same gate the local assistant's write
actions have always used, and it holds whether the action arrived as a
proposal or as a button.

54 actions, 17 read-only and 37 that write — records, checklists, time,
waiting and chasing, blocking, tags, scripts, routines, holidays, memory, the
BAU runbook library, the application's own settings, and the vocabulary itself. Three of them delete (a
record, a routine, a note); all confirm like everything else and all are undone
by `Ctrl`+`Z`.

**Asking before acting is itself a setting.** *Menu → Setup → Assistant* has a
switch for it. Leave it on and every write is shown to you and waits; turn it
off and writes run the moment they arrive. The switch is yours — nothing that
comes back over the wire can move it, and the endpoint URL cannot be written
by any action at all (see *Settings the assistant may change*, below).

### The panel itself

While your flow decides, the panel shows the shape of the answer to come —
three shimmering lines and a live status in the header that starts counting
after two seconds. Hover any answer for *copy* and *not what I meant*. A reply
that arrives while you are scrolled up shows a *New reply* pill rather than
dragging you down. The send button is dim until there is something to send
and spins while the endpoint works. Everything goes still under *Motion:
none*.

#### How do I make the chat panel wider?

**Drag its inner edge** — the left edge when it is docked on the right, the
right edge when it is docked on the left. Point at it — a coloured line shows —
and drag towards your work to make it wider (for a long answer, a wide table, a
diagram), or back to make it narrower. Your work makes room rather than being
covered. **Double-click the edge** for the usual width (452 pixels). With the
keyboard: `Tab` to the edge, then `←` / `→`.

KalKech keeps the width with your workspace, so the panel opens the same width
next time. On a small window it is fitted in (your work always keeps at least
340 pixels), without forgetting the width you chose.

#### How do I move the chat panel? (It snaps like a magnet)

**Drag it by its top bar**, wherever it is — docked, floating or full screen.
It comes away as a window under your pointer, and where you let go decides
where it sits:

| Let go… | It becomes |
|---|---|
| at the **left edge** of the screen | **docked on the left** — your work moves over to the right |
| at the **right edge** | **docked on the right** (the usual) — your work makes room on the left |
| at the **top edge** | **full screen** |
| **anywhere else** | a **floating window**, right there |

While you drag, a coloured outline shows where it will land if you let go. A
plain click or double-click on the top bar does not move it. Everything
corrects itself: your work takes back its room the moment the panel leaves a
dock, a floating window is kept inside the screen, and a smaller window fits
the panel in without forgetting your size.

It moves smoothly however long the conversation is, and it stays under your
pointer at any text size (*Menu → Appearance → Text size*). When you drag the
edge of the docked panel, the panel follows your pointer and your work makes
its room when you let go.

#### The chat panel was slow to drag, or a card opened half off the screen — why?

Fixed in 5.14.1. Two causes:

- **Slow:** each little move of the drag made the browser redraw everything
  inside the chat (thousands of pieces in a long conversation). Now the panel
  is moved as one picture while you drag, and is redrawn once when you let go.
- **Off the screen:** with **Text size** above 100%, the whole page is
  zoomed. Cards and menus were placed as if it were not, so at 120% they
  landed a fifth further right and lower — the special-day card went off the
  right edge. They now allow for the zoom, and a card taller than the window
  scrolls inside itself.

#### How do I make the chat a floating window, or full screen?

Drag it (above), or click the **frame button** at the top of the chat (next to
✕), or open **Look and behaviour** (the sliders button) → **Where it sits**.
Four choices:

| Choice | What it is |
|---|---|
| **Docked right** | The usual: on the right, beside your work. Drag its left edge to change the width. |
| **Docked left** | The same on the left. Drag its right edge to change the width. |
| **Floating window** | A window of its own, over your work. **Move it** by its top bar; **resize it** from any edge or corner. |
| **Full screen** | The whole window, like a chat website: your conversations in a column on the left, the conversation in a readable column in the middle. The ☰ button shows or hides the conversations. |

**Double-click the top bar** of the chat to go full screen, and again to go
back to where it was. **Reset the size and position** (in the frame button's
menu) puts the usual width and window back.

Everything is remembered — the choice, the side panel's width, the floating
window's place and size, and whether the conversations column shows at full
screen — and the chat opens the same way next time. A record or a dialogue
you open from a floating or full-screen chat comes up over it, and `Esc`
puts that away first.

*Chase → Write it with the assistant* has the flow draft the chase from the
facts and the tone you chose; every notice on the day view can be handed to
the assistant with one press. A PDF or a log attached to a question is read
here and goes as its words; a screenshot is read for the model when the flow
is built as in [`flow/POWER-AUTOMATE.md`](flow/POWER-AUTOMATE.md) §4b — the
words in the picture, not a description of it.

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

### The prompt is a file, not a Power Automate setting

The assistant's instructions are **`flow/prompt.txt`**. Before every question
KalKech reads it, fills in the workspace, the conversation, your notes and
what you attached, and sends the finished text as one field, `prompt`. The
prompt action in your flow holds nothing but that one input
(`body('Parse_JSON')?['prompt']`), so **changing how the assistant behaves is
editing a text file** — save it, ask again, done.

To keep a version of your own, put it in your records folder as
`dossier-prompt.txt` (Setup → Ask through Power Automate → **Copy the
template** gives you the current text). It wins over the shipped one, and
updates never touch that folder. Setup shows which one is in use, and
**Preview the request** shows exactly what the model reads.

### Learning — how it gets better at you

All of it through the flow you already have — the prompt is `flow/prompt.txt`
on this PC, so nothing in Power Automate changes:

- **Lessons.** Short lines about *you* — how you like to be answered, how you
  work, who asks you for what, what it still needs to ask. They go with every
  question as `workspace.lessons`, so the next answer is already shaped by
  them, and the flow writes them with the `learn` action. **Setup → What I
  have learned about you** lists them; ✕ forgets one.
- **The daily look back.** At noon (the time is yours to set), while you are at
  lunch, KalKech sends the flow everything since the last look: records closed
  and how they were resolved, records raised and by whom, the conversations,
  and every answer you marked *not what I meant*. What comes back — lessons,
  resolutions worth keeping, draft runbooks for problems that keep recurring —
  is kept, and reported in a conversation called **What I learned** with one
  question it would like you to answer. Anything that would change a system
  profile or a record waits there as a button; nothing like that happens by
  itself. Missed noon because KalKech was closed? It runs the next time it is
  open. A morning with nothing in it costs no call.
- **👍 / 👎 under every answer.** A thumb down asks for one line — what it
  should have said. That line is kept as a `[correction]` lesson, so the next
  answer to that kind of question uses it, and as a **check**: **Setup →
  Checks → Run checks** asks every corrected question again and has the
  assistant judge whether the new answer agrees with your line — PASS or FAIL,
  and why — so a correction that stopped working, or a prompt edit that broke
  one, shows up there first. The daily look back reads every thumb, and turns
  several corrections with the same cause into one lesson.
- **"How was it fixed?"** When you close a record by hand, a small bar asks for
  one line, with a draft already in it — from your notes first, then from the
  assistant, which reads the record and writes the line (it never overwrites
  what you have started typing). Enter keeps it, Esc skips, and ignoring it
  costs nothing; closing many at once asks nothing. The line is on the record
  sheet under Notes as **How it was fixed**, and both switches are in **Setup →
  What I have learned about you**.
- **"Last time this happened, you did X."** With every question the assistant
  gets the three closed records most like it and how each was fixed
  (`workspace.pastFixes`) — your line where you wrote one, the last note where
  you did not. Words that mean the same in support work are matched together:
  *can't log in*, *sign-in fails* and *authentication error* are one problem,
  and a 503 is *down*. When one is plainly the same problem it leads with it —
  "This looks like D-0142 on 10 Sep, that was the SSO cache" — and gives the
  one check that shows whether it is the same cause this time.
- **Runbooks that teach back.** **Interview me** on a runbook has it read the
  procedure and ask you, one question at a time, for what it leaves out — the
  real table names, how to tell the causes apart, who to escalate to — then
  save the improved draft. **Learn from a BAU document…** hands it a guideline
  to turn into runbooks, and it asks about what the document does not say.

The prompt also changes how it answers support questions: it works out what
is going on in *your* case and gives the one next check with your values in
it, rather than reading the runbook back to you — and when the runbook is
thin, it asks you and keeps the answer.

### Helping the assistant understand what you are doing

Three things go with every question now, so it answers about *your*
situation rather than only the sentence you typed:

- **What is on your screen.** The record you have open — or closed a moment
  ago — in full (notes, steps, work log), anything selected, a timer running,
  and what you did today. *"Why is this still failing?"* with D-0217 open is
  a question about D-0217; nobody has to type the code.
- **About my work** (**Setup → About my work**). One page in plain facts:
  your team, the systems you look after (what, where, who owns it), servers
  and environments, the people you deal with, and the words you use
  (*COI = certificate of insurance*). **Draft it from my records** has the
  assistant write the first version from your records, runbooks, notes and
  the words that keep coming up — it marks guesses *(check)* and ends with
  the three questions whose answers would help most. Correct it and press
  **Save**. When you mention something it cannot place, it asks once and
  offers to add the line (it always asks first), and the daily look back
  suggests additions too. Keep it to facts, not orders to the AI — that is
  also what keeps Microsoft's content filter happy.
- **The whole conversation.** Only the last eight messages travel with a
  question, so from the second exchange on the assistant keeps a short
  running summary of the conversation — what you are working on, what was
  checked and found, what is still open — and gets it back each time. A long
  investigation no longer forgets how it started.

### Working faster with the assistant

Four things, all switchable in **Menu → Setup → Ask through Power Automate**.

**Simple questions are answered on this PC, instantly.** *What's overdue?*,
*what should I do next?*, *what did I close today?*, *who is holding what?*,
*how many are open?* — the app counts those from your records in a few
milliseconds instead of a 5–10 second round trip. Under each one:
*Answered here on this PC, instantly* and a button, **Ask the assistant
instead**, that sends the same question to the flow. What stays with the
flow: anything with a problem word in it (*why*, *error*, *failing*, *fix*…),
anything asking it to write or explain, anything longer than a quick
question, and your reply to a question the assistant has just asked you
(*"no row"*, one of the buttons it offered). Setting: **Simple questions**.

**Four buttons on every record.** Open a record: under its status, **Ask the
assistant**:

| button | what it does |
|---|---|
| **✦ Diagnose** | sends the record whole — notes, log, steps — with the question *what is most likely going on, and what is the one next check?* It uses your runbooks and how you fixed the same thing before |
| **✉ Reply to Sokha** | drafts a short status update to whoever raised it, ready to copy into Outlook or Teams (it asks before opening the draft) |
| **✎ Write the fix note** | opens *How was it fixed?* for this record, with the assistant's line in it — even if it is still open, or already has one |
| **📘 Make a runbook** | turns the record into a draft runbook — triggers from how it was reported, steps from how it was fixed — and asks before saving it |

Each answer opens in a conversation of its own, named after the record, so
it does not get mixed into whatever you were talking about.

**Pasted messages are filled in for you.** **Paste a message** (or Ctrl+Shift+V)
still reads what the message states at once — a ticket number, the Subject
line, a name it knows. Then the assistant reads it too, and a box at the top
right says what it changed: a proper title instead of *"RE: FW: urgent!!"*,
the system, the type, how urgent it really is, who is asking — marked with a
violet dot — and **First steps**, two to four of them, from your runbooks and
past fixes (*"Looks like D-0142 — the SSO cache again"*). Anything you have
already changed is never touched. Keep **Put these on the record as its
steps** ticked and they become the record's checklist. Nothing is saved until
**Log it**. Setting: **Pasted messages**.

**Two models: fast for chat, strong for hard jobs.** Once your flow has a
second prompt action (step by step in
[`flow/POWER-AUTOMATE.md` §4e](flow/POWER-AUTOMATE.md) — about fifteen
minutes), set **Models in your flow** to *Two*. Everyday questions stay on
the quick model; the daily look back, learning a BAU document, runbook
interviews and **Diagnose** go to the stronger one, and every answer gets a
**✦ Think harder** button that asks the same question again there. The time
under an answer says *strong model* when it was. Which jobs go where is
ticked in the same place.

#### How do I choose which model answers?

With two or three models in your flow, a small pill sits beside **Send** in
the chat: **Auto**, **Fast**, **Strong** or **Reason**. Click it and pick:

| Choice | What answers what you type |
|---|---|
| **Auto** | The fast model for chat; the strong one for the jobs ticked in Setup (the usual) |
| **Fast** | The quick model, for everyday questions |
| **Strong** | The stronger model: better answers, a few seconds slower |
| **KalKech reason** | A reasoning model (GPT-5 reasoning) that thinks it through and reads the most of your workspace. The slowest — up to two minutes |

KalKech remembers your choice. It is for what you type in the chat; under
any answer, **✦ Think harder** (the strong model) and **◆ KalKech reason**
ask that one question again with a stronger model, whatever the pill says.
The time under an answer says which model gave it — *41.2 s · KalKech
reason*.

#### What is KalKech reason, and when should I use it?

**KalKech reason** is a third model in your flow: a *reasoning* model
(GPT-5 reasoning, or the strongest reasoning model your Power Automate
offers). It thinks a problem through before it answers, so it is the one for
a difficult problem, a long document, a "why does this keep happening", or
anything where the fast answer was not good enough.

It is also given **far more of your workspace** than the other two:

| | Fast / Strong | KalKech reason |
|---|---|---|
| The conversation | the last 8 messages, 1,200 characters each | the last 40 messages, 6,000 characters each |
| Records | 60, short | 240, with their notes and log |
| Your notes | 10 | 30, longer |
| Lessons | 30 | 80 |
| Document passages (Sources) | 6, about 14,000 characters | 16, about 48,000 characters |
| Matched runbooks · past fixes · incident history | 3 · 3 · 30 days | 6 · 6 · 90 days |

And it is told that you chose it, so it reads everything, checks each step
and figure, and writes as long an answer as the question needs. Because it
takes longer (KalKech waits up to 115 seconds — the most Power Automate
allows) and costs more AI Builder credits per question, it answers only when
you choose it: the pill, **◆ KalKech reason** under an answer, or — if you
tick it in Setup — the hard jobs (the daily look back, learning a BAU
document, runbook interviews, Diagnose).

#### How do I add KalKech reason to my flow?

It is one more prompt and one more Condition in your Power Automate flow —
about fifteen minutes, step by step in
[`flow/POWER-AUTOMATE.md` §4g](flow/POWER-AUTOMATE.md). Then in KalKech:
**Menu → Setup → Ask through Power Automate → Models in your flow → Three**.
Until you choose *Three*, KalKech never asks for it (a pick of *Reason* goes
to the strong model instead), so your flow keeps working while you build it.

**Branches, not copies.** **✦ Think harder** and **↻ Retry** (under every
answer from the flow, and under one that failed) ask the same question again
*in the same conversation*: the new answer takes the old one's place, and a
row above it — **Answers: Normal · ✦ Harder · Retry** — switches between
them. Each branch keeps its own follow-ups, so going back to *Normal* brings
back what you asked after it, and a question asked now belongs to the branch
on screen. The model is asked with the conversation as it stood at that
question, never with the answer being replaced; the files that went with
the question go again (until the app is closed). If asking again fails, the
answer you had comes back; a failed answer that is retried successfully is
simply replaced.

**Text ready to paste.** An email, a Teams message, a reply to a user, a
resolution note or a status update comes in a card of its own — labelled
*Email*, *Message*, *Note*… with a title — in ordinary type, with one
**Copy** that takes exactly that text and nothing around it. An email's
subject sits on its own line with its own **Subject** copy, and is left out
of the body. Code still comes in a code panel with its language. (A flow
built from an older copy of the guide strips the model's ``` fences in its
*Clean* step; the app recognises those blocks anyway, and
[`flow/POWER-AUTOMATE.md`](flow/POWER-AUTOMATE.md) §6 has the expression that
keeps them.)

**Conversations are named by the assistant.** Its first answer in a new
conversation carries a short title — *Portal fix email to Sokha*, *Imaging
sync timeout on APP02* — which replaces the question in the list. Until then
(and with no flow) the list shows the first question, tidied: *"can you
please tell me what is overdue?"* reads *What is overdue*. A title set by
the app itself (a record's *Diagnose*, the look back) is left alone.

### Asking with a file, and answers with code

The Ask box takes **more than one line** (Enter sends, Shift+Enter breaks) and
**attachments** — drop them on the panel, paste a screenshot straight in, or
use the clip. A PDF, a **Word document (.docx)** or a text file is **read here,
on your PC**, and its words
go with the question in the input the prompt already has — so the assistant
answers from the report's pages, and nothing in the flow changes. The bytes of
a document with text in it never leave the machine. With the optional `ocr.js`
in the folder beside `dossier.html` — a text recogniser and its English model,
run in a worker, nothing fetched — a picture goes **described**: what kind it
is, its size and colours, whether it looks like a photo of a person, how it is
laid out (a bar across the top, a panel down the side, rows like a table, a
dialog sitting over the page), every piece of text with where it sits, and a
map of the picture in letters that a model can read the shape off; and a scanned PDF goes as its pages, read
one by one. A file that needs a password, a fax-coded scan, or a picture in a
copy without `ocr.js` still goes as base64 to your endpoint, and nowhere else.
**Pictures inside a document are read too.** A runbook is half screenshots,
so every picture in a PDF or a Word document (up to twelve, in order) is taken
out and treated like a picture attached on its own — described and its words
read by `ocr.js`, or, with a flow whose model sees pictures, put into the image
the question carries (up to six) — and the text says where each one sat:
"step 3", then what the screenshot of step 3 shows, then step 4. A picture in a
table row is described just after the table. Icons, bullets and a logo on
every page are skipped; a Windows metafile (EMF/WMF) or a JPEG 2000 picture is
named as unreadable rather than guessed at. A Word document comes through with
its headings, numbered and bulleted lists, tables, links, text boxes, charts
(title and numbers), SmartArt, page header and footer, footnotes and margin
comments; tracked deletions are left out. A Word 97-2003 `.doc` is a different
format: the app says so and asks for it saved as `.docx` (File → Save As).
A picture keeps its pixels in any case, and the request carries the first one
as `picture`, so a prompt with an image input — the only thing that lets the
model *see* a face or a chart — is one expression away
([`flow/POWER-AUTOMATE.md`](flow/POWER-AUTOMATE.md) §4, Level 2). The tray says
what happened under each file's name.

Images are **shrunk before they go**, because base64 is a third larger than
the file it encodes and an untouched 4 MB screenshot becomes 5.2 MB of JSON —
enough to fail a request that the same question typed out would survive. An
11 MB test image came out at 163 KB. Limits: five files a question; 25 MB
each to open; for what travels as bytes, 2 MB each and 3.5 MB for one
question; 60,000 characters of text a file. The composer shows the running
total.

#### How do I get a diagram from the assistant?

Ask for one — *"draw how a password reset is handled"*, *"show this as a
flowchart"*, *"a sequence diagram of who sends what"*, *"draw the states a
record goes through"*. The assistant may also draw one by itself when a
picture says it better than words. It arrives as a **Diagram** card in the
answer, drawn here on your PC (nothing extra goes anywhere):

| Button | What it does |
|---|---|
| **Copy picture** | Copies the diagram as a picture. Paste it into Teams, Outlook, Word or a ticket with `Ctrl`+`V`. |
| **Save** | Saves it as a PNG picture in your Downloads folder. |
| **Larger** | Shows it full size over everything, with − / + zoom and **Fit**. `Esc` closes it. |
| **Code** | Shows the text it was drawn from (Mermaid), with its own **Copy**. |

Three kinds are drawn: **flowcharts** (steps, decisions, arrows with labels,
groups), **sequence diagrams** (who sends what to whom, in order, with notes
and *alt* / *loop* boxes) and **state diagrams** (the states something goes
through). They take the colours of your chat skin, in light and dark. Any
other kind (a pie chart, a Gantt chart), or text that is not a diagram,
stays a code block with a line saying it could not be drawn — nothing is
lost.

The AI writes the diagram in a text format called *Mermaid*. Most models know
it, but a small, fast model sometimes makes mistakes on a big diagram; ask it
to keep the diagram small, or press **Think harder**.

#### Code showed as plain text, and further down it was a proper code block — why?

Fixed in 5.14. Same cause as the diagrams below: your flow's old *Clean* step
takes out the ```` ``` ```` marks, and KalKech puts a code block back together
from the language word left on its own line (*csharp*, *sql*…). It used to do
that only after a blank line or a colon — so a block straight after a bold
title (**Core entities (example in C#)**) stayed as text, while the blocks
lower down, after a blank line, were code. Now a heading or a bold title before
the language word works too, and the prompt asks for code between `~~~`
marks, which the old Clean step leaves alone.

#### I asked for a diagram and got text like "mermaid flowchart TD A --> B" — why?

Fixed in 5.11.1. The diagram's text was there, but the marks around it (three
backticks, ```` ``` ````) had been taken out on the way back — by the *Clean*
step of a flow built from an older copy of the guide, which strips every
```` ``` ```` in the answer. Without the marks, KalKech did not know the text
was a diagram. Now:

- KalKech recognises a diagram without its marks (a line *mermaid*, or a line
  like *flowchart TD* or *sequenceDiagram* followed by boxes and arrows) and
  draws it;
- the prompt asks for diagrams between `~~~` marks, which the old Clean step
  leaves alone.

Nothing to do in your flow. To fix the Clean step for good (it also turns
emails and notes into plain text), use the expression in
[`flow/POWER-AUTOMATE.md`](flow/POWER-AUTOMATE.md) §6.

#### The choices under an answer are cut off — how do I see them all?

Fixed in 5.11. The choices under an answer used to sit on one line that
scrolled sideways with no scroll bar, so the third choice and the ones after
it could not be seen or reached. Now they wrap onto the next line, and a long
choice wraps its own words. Every choice is always in view.

#### How do I give the assistant a name?

Just tell it: *"I named you Elle"*, *"can I call you Elle?"*, *"your name is
Elle"*. KalKech answers on your PC (nothing goes to the flow), and from then on
the name is:

- at the top of the chat panel, and over each of its answers (in the
  Lumen and Crimson skins, which write a name there);
- in the box you type in (*Ask Elle…*);
- on the desk pet — it is the same assistant, so it has the same name;
- told to the AI with every question, so it calls itself Elle.

A **Keep KalKech** button under the reply puts the old name back if you change
your mind. To go back later, say *"use your own name"*. *"What's your name?"*
gets the name you gave it. The name is kept with your workspace. You can also
type it under *Menu → Appearance → Desk pet → Its name*: the pet and the
assistant are one character with one name.

#### The assistant talked about a blank or white picture I never sent — why?

You asked something short, and the answer was *"the image you shared is a blank
white square"*, or *"The AI looked at the blank picture…"*, or the
conversation was named *Blank image placeholder*.

**Why:** the prompt in your flow has a picture input, and Power Automate does
not allow it to be empty. So when you attach nothing, KalKech sends one white
pixel. A strong model ignores it; a small, fast (*mini*) model sometimes
talks about the picture instead of your words.

**What KalKech does about it:** it reads every answer before showing it. If
the answer is about the picture, it takes those sentences out; if nothing
useful is left, it asks again, adding *(no picture attached)* to your
question, and — when you have two models — asks the strong one. A title about
the picture is not used. Since 5.11.1, telling the assistant its name is
answered on your PC, so that one never reaches the flow.

**The lasting fix is in the flow:** when nothing is attached, run a copy of
your prompt that has no picture input. About ten minutes, step by step:
[`flow/POWER-AUTOMATE.md`](flow/POWER-AUTOMATE.md) §4f.

#### How do I see a file I sent with a question? Can I hide it?

Every file you send shows as a **card** under your question, the way files show
in any chat: a small picture for a picture, and for a document its kind, pages
and size — and **in Sources** when it was kept there. **Click a card** to see
what you sent:

- a document kept in Sources opens in the Sources viewer, page by page, with
  **Open the original** for the file itself — today, tomorrow, or next month;
- any other file, while KalKech stays open, shows the words that were read out of
  it and sent with the question, or the picture as it went;
- after KalKech is restarted, a picture shows the small copy kept with the
  conversation (about 200 pixels); a file that was not kept anywhere says so.

**Hide** (after the cards) folds them to one line — *📎 2 attached: runbook.pdf,
error.png* — and a click on that line opens them again. Each question remembers
whether you hid its files.

Answers come back with their line breaks intact. A fenced block becomes a code
panel with its language and a copy button; `backticks` become inline code; a
` ```mermaid ` or `~~~mermaid` block becomes a diagram card (above), whose words are drawn as
text in a picture made here — a label can never become markup on your page.
Nothing else in a reply is interpreted — it is not a markdown renderer and
should not become one, because every feature added to it is another way for
text from outside to put markup on your page.

### The BAU library — runbooks and system profiles

Memory is a notebook. This is the shared support library, and it is shaped
differently because it has to grow.

A **runbook** is one symptom and what to do about it — *not* one document. A
guideline file usually holds six or eight distinct problems, and split apart
they can be found; left whole they cannot. Each carries the symptoms somebody
actually types, the ordered steps, the queries that prove what is wrong, who to
escalate to, when a human last confirmed it, and whether it is approved.

A **system profile** is what is durably true about a system, especially what it
*lies* about — *regenCOI returns 200 whether or not it produced a letter.* That
one line answers a family of tickets no runbook covers, which is why the
assistant can help with problems nobody wrote down.

**The app matches before it sends.** Matching is local and costs nothing, so
the two or three runbooks that match your own words travel *whole* — steps,
checks, escalation — and the assistant answers from the real procedure: which
step matters here, what to check first, what each outcome means. The full
runbook is drawn underneath as reference, not as the answer. Identifiers in
your sentence are substituted in, so the SQL on screen carries the real policy
number rather than `<policy>`.

**Everything else travels as an index, never as bodies.** Title, system, trigger
phrases, severity, freshness — about 15 tokens each, so a hundred of them cost
less to send than one long memory note. The steps and the SQL stay on your
machine until something asks for one by name. Send the bodies of all of them
and the request grows until the model refuses it; that is the wall this shape
exists to avoid. Profiles are the exception and travel whole, because there are
few of them and they are the layer that reasons about the unknown.

Ask *"COI is not generating, I clicked generate and it went through"* and it
finds the runbook by trigger phrase, shows the steps, puts the SQL in a code
panel you can copy, and offers to raise the record with those steps already on
its checklist — so the work is tracked and there is evidence of what was done.

Everything arrives as a **draft**: what you import, what the assistant writes,
what you capture from a closed record. Approving is a human act, and the
assistant cannot do it — not through `saveRunbook`, and not through the
settings whitelist either. Anything unconfirmed for over a year shows as
unchecked wherever it appears, because a procedure nobody has verified is not
the same as one that works.

**Sharing needs no shared drive.** The whole library exports as one JSON file
and imports by merge — matched on title, newer edit wins — so two people can
both add runbooks and neither loses theirs. Mail it, put it on a stick. It is
copy-and-merge rather than sync, so in practice one person owns the master and
re-issues it.

All of it works with the flow switched off: the matcher is local and needs no
network. The flow adds language — understanding *"the letter didn't come out"*
as the COI symptom when no trigger says that, and writing new runbooks from a
conversation.

[`flow/BAU-RUNBOOKS.md`](flow/BAU-RUNBOOKS.md) is the full guide, including how
to decompose existing `.docx` guidelines into runbooks, and
[`flow/runbooks-starter.json`](flow/runbooks-starter.json) is a shape to copy —
its table and team names are deliberately left as placeholders, and every entry
is a draft.

### Answering from your runbooks and standards (Sources)

**Library → Sources** holds the documents the assistant answers from: your
runbooks, standards, policies and guidelines, as PDF, Markdown (`.md`), Word
(`.docx`) or text. Each one is **kept whole** in the workspace folder
(`sources/`), read into passages that remember their **page, lines and
section**, and searched again for **every question** — so an answer about what
a document says comes from the document itself, not from a summary of it, not
from the conversation, and not from what the model thinks is usual.

Why it exists: before 5.9, a guideline attached to a question went with that
one question and was gone after it — the next question carried a six-line
summary of the conversation, a new conversation carried nothing, and
*studying* a guideline rewrote it into runbooks in the model's own words.
Asked how long a critical internet-facing application had to be fixed, with a
standard that gives no timeframe, the assistant answered **"4 hours"** — the
only 4 hours in the request was KalKech's own target date for a P1 record. Now
the passages that match travel with every question, the prompt forbids a
figure no passage states, and the app checks the answer before showing it.

#### How do I add a new PDF runbook (or Markdown, or Word)?

1. **Library → Sources → + Add documents**, and pick one file — or many at
   once (see *How do I add many documents at once?* below).
2. KalKech reads each one to the end — a PDF page by page (scanned pages
   through `ocr.js` when it is beside `dossier.html`), a Word document with its
   headings, Markdown as it is — and says how many pages it read and which, if
   any, it could not read reliably.
3. Check the details it found and fill in the rest:
   - **Name**, **Version** and **Effective date** — read from the document
     when it says them ("Version: 2.1", "Effective date: 1 March 2026");
   - **Systems it is about** and **Environment** — leave them empty for a
     document about everything; set them for a runbook about one system or
     one environment, and a question naming another one will not read it;
   - **Category** — for your own sorting;
   - **Access label** — empty for everyone (see *Access* below);
   - **Its passages may go to the assistant** — untick to keep a document
     searchable on this PC only.
4. **Add**. It is searched from the next question on.

A document **attached to a question** in the chat is kept **for that
conversation only** (since 5.15). Every question in that conversation reads
it and can cite it — follow-ups included — and no other conversation sees it.
It is not listed in Sources. The chip under it in the tray says **This chat**;
click it to put that one file in Sources instead. The setting **Library →
Sources → Access, and documents attached in conversations → Files attached in
a conversation** changes the default.

#### Why didn't my chat file go into the Library?

Because you did not ask for it. A file you attach in chat belongs to that
conversation: the answer under it says *Read for this conversation only: …*.
Before 5.15 every attachment went into Sources, so a file sent "just for this
chat" turned up in answers in other chats. Now it never does.

#### How do I keep a file I attached in chat?

Say **"save this file"** (or "keep this document", "save it to the
knowledge") — or press **Save…** under the answer, or on the file's card in
your message. KalKech asks where:

- **Save as knowledge source** — it goes into **Library → Sources**, and every
  conversation can find and cite it. You can give it its name, version and
  category in the window that opens.
- **File it on a record** — pick the record. It is kept with that record's
  documents (**Library → Documents filed on records**) and is **not** used as
  knowledge.

You can say where at once: *"save this file to the knowledge source"*, or
*"file this document on D-0142"*. Words like *"no save"*, *"don't keep it"* or
*"just for this chat"* never save anything.

A document you hand over to be learned — **Menu → Setup → Runbooks → Learn
from a BAU document…** — goes into Sources straight away, because learning it
is the point.

#### How do I remove a file that was kept from a chat?

**Library → Sources → From chats** lists every document that came into
Sources from a conversation (before 5.15 that was every attachment). Open the
**⋯** on the one you do not want there and choose **Remove**. A file kept for
one conversation only is removed by itself when you delete that conversation.

#### Studying a guideline (BAU learning), and checking it was learned

**Menu → Setup → Runbooks → Learn from a BAU document…** opens a
`[study]` question with the document attached.
It does two things:

1. **The document is kept in Sources at once** — the reply says *Kept in
   Sources: …*. That is what lets any later question, in any conversation,
   find it and cite it; nothing else is needed for it to be "learned". A PDF
   is named after its file (`ITSR.039 Vulnerability Management Standard`)
   unless its first line is a real title — the first line of a PDF is often
   a logo. **Details** renames it and sets its version and effective date.
2. **The assistant proposes draft runbooks** from it, each with a **Save
   it?** You decide each one. A figure in a draft that the document does not
   state anywhere is named on it — *⚠ Not in the document: 4 hours* — so an
   invented timeframe is caught before it is kept.

A study reply is a job, not a question about what the document says, so it is
never held back; the drafts are what is checked.

To check it was learned, in a **new** conversation (not `[study]`):

- ask something the document states — *"How long do we have to remediate a
  critical vulnerability on an internet-facing system?"* — and look for
  **Source** (its name, page, lines, section), **Evidence** and **Confidence:
  High**; click the source to see the page with the lines marked;
- ask something it does not state, and expect *"The provided … do not
  specify …"* with **Not found**;
- follow up — *"how about medium severity?"* — and ask *"which source
  supports this answer?"*;
- look at **Library → Sources → Recent searches and changes** for what was
  searched and cited.

#### How do I re-index an updated guideline?

- **A new version of the document**: add it (**+ Add documents**). KalKech sees it is a
  new version of one already there and asks: **It replaces that version** (the
  older one is kept, marked *superseded*, and no longer searched), **Keep both
  active** (their version and effective date decide which is current), or **It
  is a different document**. The file added last is *never* taken to be the
  current one just because it came last — only its version or effective date
  can say that. Two active versions that nothing tells apart are named at the
  top of Sources, and an answer that reads them shows both.
- **The same file, edited, or read badly the first time** (say `ocr.js` was
  added since): **Re-index** on that document, or **Re-index all**. The
  original is read again and cut again, and KalKech says how many passages are
  new or changed, gone, and unchanged — passage ids stay the same while their
  words do.
- **Switch off** stops a document being searched without deleting it;
  **Remove** deletes it from the workspace folder.
- When a new version of KalKech changes how passages are cut, every document
  is cut again from its kept text the next time the workspace opens —
  nothing to do.

#### What does the assistant trust first?

Your knowledge comes first, what was done before comes after it. For every
fact in an answer the assistant takes the first of these that has it:

1. a file attached in this conversation, when you ask about it;
2. your documents in **Sources** — guidelines, policies, procedures;
3. your **runbooks**;
4. your **scripts** (**Menu → Scripts**) — it is sent the ones that match the
   question, with what is in them;
5. what was done before — past fixes on closed records, incidents, lessons and
   notes. These come **after** the guideline, as *"last time it was fixed by
   …"*; when a past fix differs from the guideline, it follows the guideline
   and says how last time was different;
6. its own general knowledge — only in the **Suggestion**, marked as not from
   your documents.

An earlier answer in the conversation is never treated as evidence: if it
disagrees with a document, the document wins.

#### How do I get step-by-step guidelines?

Ask how to do something — *"how do I…"*, *"give me the steps for…"*, *"the
guideline for…"*. The answer is written so that someone new to IT support can
follow it alone:

- **Before you start** — the access and tools you need, and the exact system,
  server, database and screen;
- **Steps** — for each one: where exactly, what exactly (the command or query
  with your values, or **the script by its name, where it is in KalKech and
  what to fill in**), what you should see, and what to do if you don't;
- **Check it worked**;
- **If it goes wrong** — who to contact, when your documents say;
- **Not in your documents** — anything the guideline needs that nothing you
  gave it says (for example *which script generates the data*). It is listed
  plainly instead of guessed, and the assistant does not stop to ask you.

Ask for something else — a summary, one line, an email, only the query — and
you get that instead.

#### Why did the assistant not use my guideline?

Usually because the question said too little to find it. Since 5.16 KalKech
searches with what the question is **about**, not only the words you typed:

- **a picture you attach** — the words in it are read on your PC (with
  `ocr.js` beside `dossier.html`), even when your flow can see the picture
  itself. *"Help me to support this"* with a screenshot of an email finds the
  guideline for the report the email asks for;
- **a follow-up** — *"what do you mean by step two?"*, *"which SQL?"*,
  *"explain step 3"* — also searches with what the last question was about,
  the conversation's title and the last answer, so the same guideline goes
  with it again;
- if the assistant still sees nothing about your request, it may ask KalKech
  for **one more search** with the words it read in the request. The answer
  then says *Searched your documents, runbooks and scripts again for: …*.

If it still finds nothing, the answer says so — *"I found no guideline for …
in your documents"* — instead of making one up. Then add the guideline to
**Library → Sources**, or the script to **Menu → Scripts**.

#### What do the labels on a query mean?

Every block of code in an answer has a line under its header that says where
it came from:

| Label | Meaning |
|---|---|
| **From your document: …** | copied from a document in Sources (the values, like the month, may be filled in) |
| **From your script: …** | one of your scripts in **Menu → Scripts** |
| **From your runbook: …** | one of your runbooks |
| **From the file you attached: …** / **From what you wrote** | from your own file or message |
| **⚠ Not from your documents or scripts — written by the assistant** | the assistant wrote it. **Check it before you run it.** |

For support work the assistant is told to copy queries, commands and scripts
only from your documents, scripts and runbooks, and never to write its own. If
none of them has the query a step needs, the answer says so under **Not in
your documents** — it does not invent one.

#### What does "written by the assistant" mean?

That the code is not in any of your documents, scripts, runbooks or messages —
the assistant wrote it. That is what you want when you ask it to write code
(*"give me the DTO in C#"*, *"write a query that…"*); then the line is grey.
On a query or command (SQL, PowerShell, a batch file) it is amber: check it
before you run it. An answer that says *"run the SQL"* but shows none, and names
none of your scripts, gets a warning under it too.

#### Why does an answer say "Not found in your documents, scripts or workspace"?

KalKech checks every specific name in an answer — a script, a stored
procedure, a table, a column written in code — against everything the
assistant was given for that question: your documents, scripts, runbooks,
records and your own words. A name that is in none of them is listed under the
answer: *⚠ Not found in your documents, scripts or workspace: `usp_…` — the
assistant may have made these up.* Nothing is taken out (the name may be right
and simply new to KalKech), but check it before you run anything.

#### Does the assistant only answer from one document (say, the password standard)?

No. **Every question searches every active document in Sources** — all of
them, every time — and the passages that match best go with the question,
from whichever documents they are in. A question about log retention finds
the retention standard, a question about patching finds the patching
standard, and a question about passwords finds the password standard. Nothing
in KalKech is written for one subject: the checks on figures, the spelling
help, the page headers left out of PDFs and the names of documents work the
same way for every document.

A document is **not** searched when it is **switched off**, **superseded** by
a newer version, has an **access label** this workspace is not cleared for,
or is about another **system or environment** than the one your question
names. **Library → Sources → Recent searches and changes** shows, for each
question, how many documents were searched and which passages were found.

#### How do I add many documents at once (50, 100 or more)?

1. **Library → Sources → + Add documents**.
2. In the file window, select them all (**Ctrl+A** in a folder, or
   **Ctrl**/**Shift**+click) and press **Open**. PDF, Word, Markdown and text
   can be mixed.
3. KalKech reads them one by one, then shows **one** window for all of them:
   the list of what it read, each with the name it found, and the details
   they share — **Systems**, **Environment**, **Category**, **Access label**,
   and whether they **may go to the assistant**. A file that is already in
   Sources is left out (it says how many); a file it could not read is
   named.
4. **Add 102** (or however many). They are saved and indexed together, and
   searched from the next question. 100 Markdown files take about two
   seconds.

Each document is named from its **own title** — its `# heading`, a `title:`
at the top, or a first line in bold — or, when its first line is not a
title (a bullet, a sentence), from its **file name**. Markdown marks such as
`**` or `#` never end up in a name. To change one later, **⋯ → Details**.

There is no limit on how many documents Sources can hold; the chat window
takes up to 5 files per question, so for more than that use Sources.

#### How do I find a document when there are many?

- **The search box** at the top of Sources narrows the list as you type —
  by name, file name, version, system, environment, category or type
  (*PDF*, *MD*, *Word*). **Esc** empties it.
- **The chips** — **All**, **Active**, **Superseded**, **Switched off**,
  **Need a look** — show only the documents in that state, with how many
  there are.
- **Sort**: **Name A–Z**, **Newest first**, **By category** or **By type**.
  The last two group the list under headings. KalKech remembers your choice.
- **The arrow beside "Sources"** folds the whole panel to one line, so the
  Library's own documents are easy to reach; KalKech remembers that too.

#### How do I open, rename, re-index, switch off or remove a document?

- **Click its name** to open it in the viewer.
- **⋯** at the end of its row opens **View**, **Details** (name, version,
  date, systems, category, access…), **Re-index**, **Switch off** (or
  **Switch on**) and **Remove**.
- **⚠ 2 page(s) unclear** under a name lists the pages that were not read well.

#### How do I switch off, re-index, re-categorise or remove several documents at once?

Tick the box at the start of each row (or the box in the header, which
ticks every row the list is showing — after a search, only those). A bar
appears: **Switch on**, **Switch off**, **Re-index**, **Set category…**,
**Remove**, **Clear**.

- **Switch on** for several switches on the ones that are switched off. It
  does **not** bring back old versions a newer one replaced (*superseded*) —
  that would put old rules back into answers. To use an old version again,
  choose **⋯ → Switch on** on that one document.
- **Set category…** gives them all one category (empty clears it).
- **Remove** asks once, for all of them.

#### Why did some document names change after the update?

Before 5.9.4 a Markdown document without a `# heading` was sometimes named
after its first line — a bullet (*"- Introduction & Step by Step"*), the
start of a sentence, or a line with `**` marks in it. When a workspace is
opened, those names are mended: from the document's title when it has one,
otherwise from its file name. A name you typed yourself in **Details** is
never changed.

#### How do I configure document indexing?

There is nothing to install and nothing to set up: no database, no vector
store, no embedding service, no environment variables. The documents and
their index are files in the workspace folder, and the search runs in the
page. What there is to choose, in **Library → Sources → Access, and documents
attached in conversations**, and in `settings.sources`:

| Setting | Default | What it does |
|---|---|---|
| **Access labels this workspace may read** (`clearance`) | none | Which labelled documents are searched. |
| **Files attached in a conversation** (`chatDocs`) | for that conversation only | Kept for the conversation they were attached in, or put in Sources for every conversation. |
| `budget` | 14,000 characters | How much of the documents goes with one question — six best passages and the ones around them. A document attached to that very question goes whole, up to 60,000 characters, as an attachment always did. |

Scanned PDFs need `ocr.js` beside `dossier.html` (§12, *Asking with a file*).
The full setup, storage, access and troubleshooting guide is
[`flow/SOURCES.md`](flow/SOURCES.md).

#### What an answer from your documents looks like

Under an answer about what a document says there is **one short line**: which
document the answer came from, and its page — *Source: Application Security
Standard · p. 12* — how sure it is (**High**, **Medium**…), and a **›**. Click the line to
open everything below; click it again to fold it. Each answer remembers whether
you left it open. A warning is never folded away: *Part of the answer was taken
out*, *Answer held back* and *No supporting source found* show on the line
itself, and a held-back answer opens by itself, because what the passages do
say is then the whole answer. Opened, it shows:

- **Answer** — the direct answer (above the line).
- **Source** — `[Source: Application Security Standard, version 2.0, page 12,
  lines 18-27, section "Remediation Timeframe"]` for a PDF, or
  `[Source: application-security-standard.md, version 2.0, lines 120-138,
  section "Remediation Timeframe"]` for Markdown; a Word document's names the
  section. Click it: the document opens at that page, with the cited lines
  marked, and **Open the original** opens the file itself (a PDF at that page).
- **Evidence** — the exact words of the passage that support it.
- **Confidence** — **High** (the passage states it), **Medium** (it follows
  from several statements, but no one sentence says it — or part of the answer
  was taken out, see below), **Not found** (the documents searched do not
  specify it), **None** (the reply was held back).
- **Suggestion — not from your documents**, when the assistant adds advice of
  its own. It is never mixed into the answer. Since 5.11 it is **folded to one
  line** too — *💡 Suggestion · If you are starting from…* — and a click opens
  it (each answer remembers).
- **Searched N documents**, the closest of them, and any filter the question
  set (a document, version, system or environment it named).

With no flow set up, a question about your documents is answered on this PC
with the passages themselves, each with its citation.

#### How do I make the sources under an answer smaller, or see them in full?

They start folded to one line. Click the line to see the Source, the Evidence,
the confidence and what was searched; click it again to fold it. Each answer
keeps the way you left it.

#### Which source supports this answer?

The **Source** line under the answer (open it for **Evidence**). Ask *"which
source supports this answer?"* and KalKech lists the citations and quotes of
the last answer. A citation is only shown as a source when its quote was found,
word for word, in the passage it names.

#### Why did KalKech say that the answer was not found?

Because none of the passages it found states it. Ask *"why was it not
found?"* and KalKech says how many documents it searched, which came closest,
and which filters the question set. There are three kinds of *not found*:

- **Not found** — the documents do not say it, or say it in words the question
  did not reach. The answer says what is missing, and what they do say.
- **Answer held back** — the whole reply rested on a figure — a timeframe,
  a percentage, a severity — that no passage it cited contains, so KalKech did
  not show it: it would have been a guess presented as your policy. (This is
  the "4 hours".) KalKech says it held the reply back — it does not claim the
  documents are silent, because it cannot know that — and shows under it what
  the cited passages do say.
- **Not from your documents** — the reply cited nothing, so it is shown as
  general advice, not as what a document says.

If the answer is in a document: check it is in Sources, **active**, that the
workspace is cleared for its access label, and that the question names the
system or environment it is about; after changing a document, **Re-index**.

#### Why was part of the answer taken out?

Because one line of it gave a figure — a time, a percentage, a severity —
that none of the passages it cited states. KalKech takes out that line (and a
heading or an introduction left with nothing under it) and shows the rest,
which is checked like any answer. Under it:

- **Part of the answer was taken out**, and how many lines.
- **Confidence: Medium** — what is left is supported by the source.
- **Figure seen in** — when that figure *is* written in your documents, but
  in a passage the answer did not cite (a password rule for administrators
  next to one for ordinary users, say), the place it is written. Click it to
  read it there and judge whether it applies. It is never counted as support.

The figure itself is not shown in the answer. **Library → Sources → Recent
searches and changes** names it. To get an answer that includes it, ask about
it directly (*"how often is the local administrator password changed?"*) —
then the passage that states it is the one cited.

Before 5.9.2 the whole answer was held back instead, with *"The documents
searched do not specify this"* — even when they did, and the rest of the
answer was right.

#### The answer is in my document, but KalKech said it was not found or held it back — am I wrong or is the AI wrong?

Usually neither: the answer is in the document, and the reply added
something the passages it cited do not say. Look at **Evidence** under the
answer — those are the document's own words — and at **Recent searches and
changes** for the figure that was taken out. Then:

- If the reply mixed several cases (user accounts and administrator accounts,
  critical and high), ask about the one you mean.
- Name the document or the section in the question (*"what does ACS-PWD-01 in
  the password standard say?"*).
- Open the document from **Source** and read the lines marked.

#### I asked it to close a record with my own steps, and it said "Answer held back" — why?

Fixed in 5.9.5. Two things went wrong together:

1. Your message said **"policy number"** — a customer's insurance policy. KalKech
   read the word *policy* as a question about a policy **document**, so it
   checked the reply against your Sources documents.
2. The reply repeated a figure **you** wrote (*"exactly 5 years after the
   start date"*). That figure is in no document, so it looked invented.

Now *"policy number"*, *"policy no."*, *"policyholder"* or *"policy
A018346A10"* do not make a message a question about documents, and **a figure
you wrote yourself in your message is yours** — it is never taken out or held
back. A figure in a question you ask (*"is it 5 years?"*) is still checked,
because that is what you want to know.

When the reply only does the job — closes the record, logs on it — and cites
no document, there is **no sources box** under it.

#### How do I close a record with the steps I used, in one message?

Write the steps and ask, for example:

> here is the fix for D-0153 · Steps: 1. … 2. … 3. … · please close it with these steps

The assistant:

- moves the record to **Done**;
- keeps the fix in one or two lines as **How it was fixed** (so the box that
  asks *"How was it fixed?"* when a record is closed does not need to ask);
- puts your steps, in full, in the record's **work log**;
- when none of your runbooks covers it yet, asks whether to keep the steps
  as a **runbook**, so the next request like it is quicker.

With **Ask before doing anything** on (**◎** in the chat header), you confirm
each step first; the confirmation shows the *How it was fixed* line.

#### I wrote the procedure in my runbook — why did the assistant not follow it?

Before 5.9.5 the assistant was told that only documents in **Library →
Sources** count as evidence of what a procedure says, and the check under an
answer only accepted figures from those documents. So a figure written in
**your own runbook** (in **Menu → Setup → Runbooks**, or made with *Learn
from a BAU document*) was treated as invented, and the reply could be held back.

Now:

- your runbooks that match the question go with it, and the assistant is told
  to **follow them** and say so (*"your runbook 'X' says …"*);
- a figure in one of those runbooks is accepted, and the answer shows
  **From your runbook: X** with **Yours** instead of a confidence — press it to
  open the runbook;
- documents in **Sources** are still checked as before: an answer that says a
  *standard* or *policy document* says something must cite it.

If an answer still misses your runbook, check that the runbook's
**triggers** contain the words people actually type (**Menu → Setup →
Runbooks**, open the runbook, **Triggers**): only the runbooks that match the
question go with it.

#### Does it understand a question with a typo?

Yes. A word no document uses, one letter away from one they do (two for a
long word), is searched as that word: *"stardard"* as *standard*, *"pasword"*
as *password*, *"doucment"* as *document*. **Recent searches** shows it
(*read "stardard" as "standard"*). It only decides which passages are read;
an answer still has to be in their words.

#### Which passages does a broad question get?

*"What should a password be?"* in a password standard matches every page —
they all say "password". KalKech then prefers the passages that set a rule — a
minimum or a maximum, a *must* or *must not*, a number of characters, days or
attempts — over ones that only talk about the subject, and sends the rows
around them. When the rules differ by case (user, administrator, service
account), the assistant is asked to lead with the everyday one and list the
others briefly, each with its own source.

#### My PDF prints the same header on every page — does that confuse it?

Not any more. A line that stands at the same place at the top or the bottom
of most pages — *VERSION: 1.0*, *DATE: …*, *CLASSIFICATION : OFFICIAL*, the
page number, a footer — is left out of the passages, and is never taken for a
section heading. Before 5.9.2 such a header became a "section" on every page,
so a rule that ran on to the next page was cited as section *"CLASSIFICATION
: OFFICIAL"*. The header still counts in the line numbers, as it does on the
printed page. Documents already in Sources are cut again automatically the
next time the workspace opens.

#### Follow-ups and new conversations

*"that policy"*, *"the previous section"*, *"how about low severity?"* — a
follow-up is searched again, with the question before it and the documents
its answer cited; *"the previous section"* adds the section before the one
cited. The answer still has to come from the passages sent with it, never
from what an earlier answer said. The same question in a new conversation
finds the same passages.

#### Access

A document with no **access label** is read by everyone who uses the
workspace. A labelled one is searched only when **Access labels this
workspace may read** lists its label; otherwise it is not searched, not
counted, never named and never sent — the filter runs before anything is
scored. A document marked to stay on this PC is searched for answers given on
this PC and never sent to the flow. Documents never mix between workspaces:
each workspace folder has its own `sources/`. Labels are not a login — for
teams that must not see each other's documents, keep separate workspace
folders with Windows permissions on them.

#### Pages that could not be read

Each PDF page is checked as it is read: no text (a scan with no `ocr.js`),
characters the reader could not decode, or text that is not words. Such pages
are listed under the document in Sources, their passages are marked when they
go with a question, and an answer resting only on them cannot be **High**
confidence — the assistant is told to say the page could not be read
reliably and point to the original.

#### What is logged

**Library → Sources → Recent searches and changes**, and the browser's
console (`[sources]`): each question's documents searched, filters, passages
with their scores and versions, what the answer cited and whether it held,
answers held back or lines taken out and the figure that caused it, a
mistyped word and what it was read as, documents added,
re-indexed, switched off or removed, and anything that could not be read.
Never the documents' words, and never a token.

#### What leaves the PC

Only the passages that match a question, with it, to your flow — exactly
what an attached document always sent — and never from a document marked to
stay on this PC or one the workspace is not cleared for. The originals, the
catalog and the index stay in the workspace folder.

### The incident history — for an incident manager

Export your incidents from ServiceNow as CSV, import them in **Setup →
Incident history**, and the app counts what ServiceNow answers badly: which
system keeps breaking, what is recurring, how long things take, and whether
the things being closed were actually resolved.

**The counting happens in code, never in the model.** Volume, medians,
repeat groupings, quality findings — all computed locally and deterministically.
The assistant reads those numbers and says what they *mean*. A model that
counts is a model that quietly gets it wrong with nobody able to tell, and a
number in an incident report has to be defensible.

Titles are reduced to a signature with policy numbers stripped and words
stemmed, so *"COI letter not generated"* and *"COI letters not generating"*
count as the same fault. Six of them is one problem, not six incidents.

It flags the records that cannot answer what happened — closed with no
resolution note, a note that is a non-answer, no root cause, reopened, and
most valuably **the same fault closed as a workaround again and again**, which
means nobody has fixed it. The findings are about the *record*, never the
person: whether somebody is careless is not something ticket data supports.

*"Who should I assign this to"* is answered from history — who resolved this
kind of incident before, how many, how fast, how often it came back — with the
evidence beside the name. Nothing is trained and nothing is predicted; when
there is no history the answer is that there is no history.

Only the conclusions travel to the flow, never the rows: 13 incidents summarise
to 2.4 KB, and 3,000 would summarise to about the same.

[`flow/SERVICENOW.md`](flow/SERVICENOW.md) is the step-by-step guide, including
which columns to add to the export and how to connect the Table API through
Power Automate once you have a service account.

### It knows KalKech itself

Ask the assistant about KalKech — *how do I set an alert on a record?*,
*where do I change the look of the chat?*, *what's new?*, *which version is
this?* — and it answers from KalKech's own **README.md** and **CHANGELOG.md**,
which sit beside `dossier.html`:

- every question carries the version, the headlines of the latest releases
  and the README's chapters (`workspace.app`), so the assistant always knows
  what it is and what it can do;
- a question about KalKech also carries the two or three README sections and
  the release notes that answer it, and the prompt tells the model to answer
  those from them only — menus and buttons named as the manual names them,
  and never a setting that does not exist;
- **what's new** and **which version** are answered at once, from the
  CHANGELOG, with or without a flow — with the earlier releases underneath to
  ask about next.

Update KalKech and the assistant knows the new version the next time the page
is loaded. A copy opened from the folder (`file://`) cannot read the files
and sends only the version.

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
  KalKech posts to could point it somewhere else of its own choosing, and
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
filled in; the first puts the headers and the body on the clipboard together.

TO, CC and BCC are shown even when they are empty — a draft with no recipient
is the normal case, because you are the one who knows who it goes to, and a
line that silently is not there reads as a bug rather than as a blank to fill
in.

**Nothing is sent.** KalKech has no mail credentials, no outbound connection
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
   to let KalKech read the reply.

Both look identical from the outside ("Failed to fetch"), so KalKech tells
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

Five documents go with this:

- [`flow/POWER-AUTOMATE.md`](flow/POWER-AUTOMATE.md) — the recipe. The trigger
  schema, the prompt to paste into the AI action, where standing knowledge
  goes and where it must not go, and the order to test in that finds problems
  fastest.
- [`flow/SERVICENOW.md`](flow/SERVICENOW.md) — getting your incident history
  in, what the app works out from it, and connecting the ServiceNow API.
- [`flow/BAU-RUNBOOKS.md`](flow/BAU-RUNBOOKS.md) — the support library: how a
  runbook is shaped, how to turn existing `.docx` guidelines into them, and how
  a team shares the library with no shared drive.
- [`flow/CONTRACT.md`](flow/CONTRACT.md) — the specification. Every argument
  of every action, generated from `flow.js`.
- [`flow/SPEED.md`](flow/SPEED.md) — what a question carries and why it stopped
  growing with the workspace: how records, notes, runbooks and profiles are
  ranked on the PC before anything is sent, how the endpoint asks for records
  it was not given, and the one paste that goes into the prompt.
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
- `{p0}`, `{name}` are values KalKech drops in. Keep them exactly, but move
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

## 15. Automating KalKech from outside

KalKech has **no API and no server** — on purpose. The integration surface is
the folder: a JSON file you can read and write, and a queue directory that
already accepts requests from anything that can write a text file.

This section is the contract. Follow it and an outside automation — Power
Automate, a scheduled PowerShell job, an agent — can read work, raise work, and
run scripts without corrupting anything.

### 15.1 The one rule that matters

> **KalKech rewrites the whole of `dossier.json` when it saves.** It saves 700 ms
> after any change, and on `Ctrl`+`S`. It reads the file **once**, when the
> folder is attached.

So there is no merge and no file locking. Two safe patterns, one unsafe one:

| Pattern | Safe? |
|---|---|
| Write `dossier.json` **while the KalKech tab is closed** | ✅ yes — it is read fresh on next attach |
| Write only into `scripts/queue/` and `tasks/<folder>/` | ✅ yes — KalKech never rewrites those wholesale |
| Read `dossier.json` at any time | ✅ yes |
| Write `dossier.json` **while the tab is open** | ❌ your write is lost at the next save |

If an automation must add records while someone might have KalKech open, prefer
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
KalKech normalises what it loads, but an automation that omits `log`, `files`
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

You do not need KalKech for this at all. The runner takes requests from
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
  [ ] the KalKech tab is closed
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

Answering from documents has its tests in the repository, and they are the
first thing to run after changing anything it touches:

```
node --test                 # tests/*.test.js: 54 tests - Sources (every scenario below), names and queries in answers, and diagrams
node tests/e2e/run.js       # the app in Chrome or Edge: 197 checks on the screen
node flow/check-prompt.js   # the prompt's examples against the reply validator
```

They cover an answer stated in one document, one that needs several
passages, one the documents do not give, a model that invents "4 hours"
(held back, and never shown), two documents that disagree, a newer version
replacing an older one, a document switched off, a follow-up, a document the
workspace is not cleared for, a PDF page read badly, citations to the right
page, section and lines, 150 documents searched at once, look-alike runbooks
for different systems and environments, the same question in a new
conversation, and a password standard with its header printed on every page,
asked with a typo, whose right answer carried two lines it could not back
(those two taken out, the rest shown); a mixed library - retention,
patching, incidents, a playbook, passwords - where each question must find
its own document and a line with an unsupported figure is taken out whatever
the subject; clean document names; and the Sources panel with many documents
(search, chips, ticks, several at once, adding several, folding). `tests/e2e/run.js` finds Chrome or Edge by itself (set
`CHROME=<path>` to choose) and skips, passing, when there is none.

The other suites live outside the repository and
drive the real files in a real browser (Playwright + Chromium), because the
things that break here are things a unit test cannot see: a stale iframe cache,
a CSP refusal, a file one folder away from where a manifest says.

The thirty exercised for the current release — `teach`, `talk2`, `pick`,
`flowval`, `flowe2e`, `flowui`, `flowmore`, `chatui`, `memui`, `probe`,
`shrink`, `chatfx`, `settings`, `mend`, `runbook`, `ver`, `analyse`,
`incident`, `quiet`, `studio`, `shell`, `chatv3`, `pdftext`, `pdfattach`,
`ocrattach`, `anybrowser`, `guide`, `prose`, `compose`, `speed` — report **1,180 passing assertions and no failures**, covering the local
assistant, teaching, selectors, the reply validator, the whole network path in
a real browser against an endpoint that misbehaves the way real ones do, the
Setup panel, all 57 actions, the docked layout down to where each masthead tab
lands, the memory round trip (taught in one conversation, recalled in
another), the chat skins and motion switches, the settings whitelist —
including that an endpoint asking to rewrite its own URL is refused *with
confirmation turned off* — the PDF reader against pdf.js on real files and
against files built to hit one thing each (three encodings, object streams,
an incremental update, wrong offsets, form fields, four kinds of encryption),
the attachment tray and the request it produces, a screenshot of an error
dialog read and described by the optional recogniser in the real page, a photo
told from a screenshot, a wordless screenshot described down to its dialog and
its chart, a dark interface that does not collapse into one colour, a scanned
PDF read page by page, the `picture` field
and its blank pixel, a read stopped when a picture of noise would hold it up,
a browser with no folder access — records, backups and attachments kept in
the browser's store across a reload — an answer laid out into headings,
lists, tables and links with anything an endpoint sends that looks like a
tag left inert — the assistant as a guide (the hero on an
empty thread, a question's answers as chips, the runbook folded under the
answer, the footer on the bottom edge) — the composer down to the four states
of its send control, that a second question cannot be put on an endpoint
already working on the first, and that a copy of `dossier.html` alone in a
folder still shows the waiting animation without asking for a single file
that is not there — what a question carries, measured: that a workspace of two
thousand records asks a question the same size as one of a hundred, that the
record named by its code, its ticket, its system, its person or the words in
its title is the one that travels, that the counts sent alongside are the
totals for the whole workspace and not for the slice, and that the endpoint
asking for records it was not given costs one more round trip and never two —
and, counted against a server that
records every request, exactly how many times the endpoint is called and how
large each call is.

Several of those assertions now measure **geometry, not just content**. An
email body once rendered its text correctly into a box 25 pixels square at
zero opacity — every text assertion passed while nothing was readable on
screen. Where an element has to be *seen*, the suite measures its height and
its opacity.
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
classifier on KalKech's own generated corpus reached **38.8%** on unseen
phrasing families, against `chat.js`'s **97.1%** on the same split. Writing a
model from scratch was tried, measured, and rejected on the numbers.

---

## 17. Known limits

- **A folder on disk needs Edge or Chrome.** Other browsers keep the records
  inside the browser, which is theirs to clear; export a copy now and then.
  Scripts cannot run from a browser store, since there is no folder for the
  runner to watch.
- **Notifications need `http://`**, not `file://`. Start KalKech with
  `KalKech.bat`, which hands the page out from `127.0.0.1`.
- **Sources search by words, not by meaning.** Passages are found by the
  words of the question (with a short list of the words people use for the
  same thing - *fix* and *remediate*, *how long* and *timeframe*), not by a
  model's embedding: there is no second service to send your documents to.
  A question that shares no words with the passage that answers it can miss
  it - reword it, or name the document.
- **A PDF's line numbers are its lines of text on the page**, counted as the
  reader finds them; a Word document has no page or line numbers to give, so
  its citations name the section. A scanned PDF is read only with `ocr.js`
  beside `dossier.html`, and a page read badly is flagged, not trusted.
- **Access labels are not a login.** They keep a document out of every search
  and every question in a workspace that is not cleared for it, but anyone who
  can open the workspace folder can open the files in it. Different teams
  keep different workspace folders, with Windows permissions on them.
- **Alerts need KalKech open.** The tab can be in the background, but a
  closed browser or a sleeping PC alerts nobody. An alert missed that way goes
  off when KalKech next opens, if it is less than half a day late; older, it is
  only noted in the record's log.
- **The daily look back needs KalKech open** at some point after the time set.
  It is the page that sends it; with every tab closed all day, it waits for
  the next time KalKech is open after that time.
- **With the tab closed, nothing is queued.** KalKech schedules its own
  automatic runs, so a routine marked *runs itself* needs the tab open *and* a
  live runner. For something that must fire regardless of whether anyone is
  looking, point Windows Task Scheduler straight at your `.bat` — it needs
  nothing from KalKech.
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
| **Workspace** | The folder KalKech is pointed at. Holds `dossier.json` and everything else. |
| **Record** | One piece of work. Called `tasks` in the JSON, *record* everywhere a person can see. |
| **Code** | A record's human reference, `D-0001`. |
| **Live** | Status `open`, `processing` or `blocked` — anything not finished. |
| **Routine** | A schedule that raises a record, or nudges you, on a cadence. |
| **Runs itself** | A routine that also queues its script — needs a live runner. |
| **Script** | A `.bat` registered in `dossier.json` and living in `scripts\`. |
| **Parameter** | A `{{mark}}` in a script, which becomes a box on any record it is attached to. |
| **The runner** | `dossier-runner.bat`, watching `scripts\queue\`. |
| **Queue** | `scripts\queue\` — the plain-text mailbox between KalKech and the runner. |
| **Heartbeat** | `.runner.txt`, rewritten every ~10 seconds so KalKech knows the runner is alive. |
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

*KalKech is one HTML file, some sidecar scripts, and a folder. That is the
whole architecture, and it is the point: in ten years the folder will still
open, whatever happened to this app.*
