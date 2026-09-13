# Changelog

The version shown at the right-hand end of the status bar. Click it to copy
the full build line — version, build date, flow protocol and what your copy
holds — which is what to paste into a bug report.

---

## 3.4.0 — 2026-09-13

**Any picture, in words — and one expression away from being seen.**

- **A picture is described, not just read.** With `ocr.js` beside the app, a
  picture goes as what it is — *a screenshot, 1920×1080 landscape; mostly
  white and dark grey; text in 5 places* — then every piece of text with
  where it sits and what it sits on: *middle, centre, on white: Generate COI
  — Error …*. A photo says so, names its colours, and says when it looks like
  it has a person in it (the browser's face detector where there is one, skin
  tones otherwise). For a system screen that is most of what a person sees.
  Nothing in the flow or the prompt changes
- **A scanned PDF is read page by page.** The pictures of pages inside it —
  JPEG as the scanner wrote them, or raw samples — go through the recogniser
  on your PC, and the words go with the question with `[page N]` marks; the
  PDF's bytes stay. Fax-coded (CCITT) scans are left for the flow as before.
  Two pages read in under four seconds
- **`picture`: the one expression for a prompt with an image input.** The
  request now carries the first picture attached, or the first page of a
  scan, or a blank white pixel when there is none, so an Image input is
  wired with `base64ToBinary(body('Parse_JSON')?['picture'])` and nothing
  else — no filter, no condition, no null. That is what lets the model see
  a face or a chart, and the guide's Level 2 is now five minutes
- The tray says *described — no words in it*, *2 scanned pages read*, and
  shows *page 2/5* while a scan reads
- Notes `seen` (a picture described, no words) and `ocr` on a PDF (scanned
  pages read) join the contract; `nowords` is gone, a picture is always
  described

## 3.3.0 — 2026-09-13

**A screenshot is read too** — on your PC, with nothing changed in the flow
or the prompt.

- **`ocr.js`, an optional file beside `dossier.html`.** It carries a text
  recogniser (Tesseract, compiled to WebAssembly) and its English model,
  packed so that nothing is fetched; the app uses it when it is there and
  ignores it when it is not. With it, a screenshot attached to a question is
  redrawn at twice its size, read in a worker so the page never freezes, and
  its words go with the question under the file's name, the way a PDF's do.
  A full screen reads in about two seconds; the tray shows the progress
- **The pixels still go.** A picture keeps its base64 in
  `attachments[].data`, so a flow that shows pictures to its model, or runs
  the §4b recogniser, still can. `note` says `ocr` for words read off a
  picture — the request tells the model so, because a recogniser can read an
  `l` as an `I` — and `nowords` for a picture it could make nothing of
- **A picture that is all texture does not hold the app up.** A read is
  given 25 seconds — a full screen of log lines takes about ten — and then
  the worker is stopped and a fresh one boots for the next picture; a page of
  noise read at very low confidence is not offered as words. Either way the
  pixels still go and the tray says why
- Without `ocr.js` a picture goes exactly as in 3.2, as pixels for the flow's
  recogniser
- A new suite, `ocrattach`: a screenshot of an error dialog attached in the
  real page, read, carried, and the tray; and the app without the file

## 3.2.0 — 2026-09-12

**A PDF that comes with a question is read, here, before it goes** — and
the assistant answers from its pages instead of saying it cannot read
documents.

- **Attach a report and ask about it.** The text is read out of the PDF on
  your PC — objects, compressed streams, fonts and their encodings, the
  operators that place the glyphs — by a reader written into `dossier.html`
  for the purpose. Nothing is downloaded to do it and nothing leaves the
  machine but the words. A two-page report reads in about 30 ms; ten pages in
  under 50
- **The words go, the bytes stay.** `attachments[].text` carries the pages
  (`[page N]` marks), `pages` the count, `note` what got in the way; a file
  that arrived as text has no `data` at all. `attachmentsText` — the input the
  §4 prompt already reads — is now every file's name and then its text, so
  **the flow needs no change**. Paste the §4 prompt once more: the old one
  told the model it could not read documents, and it believed that with the
  pages in front of it
- **Text files too**: a `.log`, `.csv` or `.txt` arrives as its lines, not as
  base64 for the flow to decode
- **What has no words still goes as pixels** for the recogniser in §4b — a
  screenshot, a scanned PDF (`note: scanned`), a file that needs a password
  (`encrypted`) — and the tray says which, under the file's name, the moment
  it is read: *2 pages read*, *a scan, no text in it — the pages go for OCR*
- **"Protected" corporate PDFs open** when their user password is empty —
  RC4, AES-128 and AES-256 — which is what most of them are; a real password
  still says so
- **A question sent while a file is still being read waits for it**
- A PDF up to 25 MB can be opened, because only its words travel; the caps on
  what travels as bytes are unchanged (2 MB a file, 3.5 MB a question), and
  text is cut at 60,000 characters a file with the cut marked for the model
- Two new suites: `pdftext` — the reader against pdf.js on real files, and
  against files built to hit one thing each: three encodings, `/Differences`,
  object streams, an incremental update, wrong offsets and lengths, LZW and
  ASCII85, form fields, a Type3 font, four kinds of encryption — and
  `pdfattach`: the tray, the request, the wait

## 3.1.0 — 2026-09-12

**The assistant panel, rebuilt around how it is used** — and three things
that were wrong.

### The panel

- **An answer arrives where a skeleton said it would.** While the endpoint
  is deciding, the panel shows the shape of the answer to come — three
  shimmering lines — with the status line live in the header. After two
  seconds it starts counting; after eight it says the endpoint is slow, not
  stuck. When the answer lands the skeleton is gone that instant and only
  its afterimage fades, so nothing that counts messages ever sees both
- **Tools appear on the answer you are looking at.** Hover any answer for
  *copy* and *not what I meant*. The reading ("What to do next · 88%") is
  there when you look for it, not printed under every answer like a receipt
- **The thread never yanks you down while you read.** Sending always lands
  at the bottom; a reply that arrives while you are scrolled up shows a
  *New reply* pill instead, and takes you there when you press it
- **Result rows are one sheet**, each arriving a beat after the last, with an
  arrow that leans toward its record on hover
- **The composer is one calm rounded shape.** The send button is dim until
  there is something to send, carries an arrow, and turns into a spinner
  while the endpoint works. A keyboard hint appears under it only while it
  has focus: Enter sends · Shift+Enter new line · ↑ last question
- Your messages are a tint of the accent with a border, not a saturated
  gradient shouting in the thread; consecutive ones tuck together. A small
  time mark separates messages more than half an hour apart
- Suggestions scroll sideways instead of stacking into a wall
- Everything goes still under *Motion: none* and under the system's
  reduced-motion preference, skeleton included

### The assistant writes the chase

*Chase → Write it with the assistant* sends the facts — who, which records,
how long, how many times chased, the tone you picked — to your flow and
puts the returned draft in the box, where you can still edit it before
copying. The button only shows when the flow is on. Every notice in the day
view has an *ask the assistant about this* button beside its dismiss.

### Fixed

- **The footer floated above empty space** on machines with the text size
  changed. The shell was sized as `100dvh` divided by the zoom, which is
  right for one reading of how zoom and viewport units combine and wrong for
  the other — and browsers have changed their minds. The shell is a fixed
  box with `inset:0` now, which fills the viewport under either reading, and
  the document itself can no longer scroll. Verified at 80, 100 and 120%
  across three views, two window sizes, with and without the dock
- **The register and the week forced a sideways scroll** in a narrow column.
  The four optional columns fold at 980px of *column* width — early, because
  below that the title was being squeezed into a sliver six lines tall,
  which is worse than the scroll it replaced — then at 780px the fixed
  column widths and single-line titles give way; the week drops to four
  days, then two. Found on the way: the first version of these rules sat
  earlier in the stylesheet than the week grid they override, so the week
  rule won and nothing folded — a container query is still just a rule
- Attachments now carry `kind` — `image`, `pdf` or `text` — so a flow can
  branch on one word

### Reading attachments in Power Automate

`POWER-AUTOMATE.md` §4b is new. The request has always carried the files;
the prompt input `attached` was only ever getting their *names*. The recipe
runs each image and PDF through AI Builder's *Recognize text in an image or
a PDF document* and hands the prompt the words — nine steps, every
expression written out, the action names as the defaults so they can be
pasted. A second recipe passes the picture itself to a prompt with an Image
input, for prompts that take one. Prompt rule 9j tells the model to quote
the error in the screenshot rather than describe the picture.

837 assertions across twenty-two suites, no failures.

## 3.0.0 — 2026-09-12

**A new shell.** 2.3.0 changed the ink; this changes the room.

- **Navigation is a sidebar.** The seven views run down the left with a
  glyph each, the active one marked with an accent bar. The top of the
  content column is freed for the thing you type into, which is now a
  proper command bar with room to breathe
- **The day is objects on a canvas.** The numbers are rounded cards; each
  group — overdue, due today, coming up — is one sheet of rows. The page
  reads as a small set of things rather than one long list
- **Studio, a new default palette**: cool graphite ink on an off-white
  canvas with a single indigo accent, and a dark twin. Archive and Vault are
  exactly as they were and still available
- **With the assistant docked** the sidebar keeps its labels at desktop
  widths and folds to a 68px rail of glyphs below ~1240px — every tab still
  there, none of them stripped. Below 900px the original top bar returns on
  its own
- Group counts are figures, not pills; radii, gaps and padding move to a
  wider scale to match the larger surfaces

Everything Quiet does about colour still holds underneath: one line per
record, status as a dot, colour only where it must be noticed.

**Three looks, in Setup → Look.** Studio (new, default), Quiet (the top bar
with the same restraint), Classic (the original, unchanged). An existing
workspace moves to Studio once on first open; if you were still on the
Archive theme you move to the Studio palette too. Anything you had *chosen* —
a look, a theme, a custom palette — is left alone, and choosing again
afterwards always sticks.

Found on the way: switching the look through the assistant did not count as
a choice, so the one-time move could have undone it on the next open.
Choosing a look now counts wherever it comes from.

679 assertions across twenty suites, no failures.

## 2.3.0 — 2026-09-11

**A quieter interface.** Researched against current minimalist practice, then
applied as subtraction rather than decoration.

The problem was colour. It was being spent on everything — a filled pill for
the status, another for the priority, another for the system, a coloured date,
a coloured tag. Seven hues in one row buys nothing, because when everything is
emphasised nothing is.

- **Colour is a budget now.** The accent belongs to the active tab and the
  primary action. Status becomes a small dot and a word. Only an overdue date
  and a P1 keep a colour of their own, because those two must be noticed
- **Hierarchy by weight and space, not decoration.** The title gets size and
  weight; the rest of the row drops to one quiet line with middots between.
  Same information, roughly a third of the ink
- **Hairlines, not boxes.** Every record was a bordered, rounded, shadowed
  card inside a bordered section. A list is a list: rows divided by a single
  rule
- **The numbers band** is five cells divided by a rule rather than five
  separate boxes, with tabular figures so columns line up
- **Four-pixel rhythm** — padding and gaps land on multiples of four
- Applies to the register table too, which had the same pills

**One switch away from undone.** *Setup → Look → Look: Quiet or Classic.* A
big visual change to something you use every day should be reversible, not an
argument. Classic is exactly what it looked like before. The assistant can
switch it too.

Two bugs found and fixed while building it, both the same shape — a rule that
looked right but was measuring the wrong thing:

- The middot separator claimed `::before`, which the system chip was already
  using for its colour dot. The one piece of colour on the row that was
  earning its place silently disappeared. The separator is an `::after` now
- A test read `borderBottomColor` off a zero-width border, which reports the
  *text* colour — so "the rule is visible on dark" passed with a value of 233
  on a page of 19. It now asserts the width first, and that the rule sits
  clear of the page without glaring

636 assertions across nineteen suites, no failures.

## 2.2.0 — 2026-09-11

**Incident analysis, for an incident manager.**

Export your incidents from ServiceNow as CSV, import them in Setup, and the
app answers the questions ServiceNow answers badly: which system keeps
breaking, what is recurring, how long things take, and whether what is being
closed was actually resolved.

- **Counting happens in code, never in the model.** Volume, medians, repeat
  groupings and quality findings are computed locally and deterministically;
  the assistant reads them and says what they mean. A model that counts is a
  model that quietly gets it wrong with nobody able to tell
- **Repeats are found by signature** — identifiers stripped, words stemmed —
  so "COI letter not generated" and "COI letters not generating" are one fault
- **Records that cannot answer what happened**: no resolution note, a note
  that is a non-answer, no root cause, reopened, and the same fault closed as
  a workaround again and again — which means nobody fixed it
- **Assignment from evidence**, not prediction: who resolved this kind of
  incident before, how many, how fast, how often it came back, with the
  numbers beside the name
- **Only conclusions travel to the flow** — 13 incidents summarise to 2.4 KB,
  and 3,000 would summarise to about the same
- Import is tolerant: field names or display labels, any order, quoted fields
  with commas and newlines, and re-importing an overlapping range updates on
  the incident number rather than duplicating. It warns which useful columns
  the export lacked
- Three actions: `incidentReview`, `incidentGaps`, `whoFixedThis` (57 total)

Findings are about the **record**, never the person. Whether somebody is
careless is not something ticket data supports, and the prompt says so.

`flow/SERVICENOW.md` is new — the step-by-step guide, including which columns
to add before exporting and how to connect the Table API through Power
Automate once you have a service account. Dossier still never calls
ServiceNow itself; `connect-src 'none'` is unchanged.

**Repaste §4 of `POWER-AUTOMATE.md`** for rules 9f2-9f4.

602 assertions across eighteen suites, no failures.

## 2.1.0 — 2026-09-07

**The assistant analyses instead of photocopying.**

2.0.0 had an architectural flaw. Runbooks travelled to the endpoint as an
index — titles and trigger phrases, never the bodies — and `readRunbook`
rendered the card *in the app*. So the procedure never reached the model. It
could not reason about a step it had not read, and the only move left to it
was announcing that it would go and look something up. The answer on screen
was the stored runbook, verbatim, with `<policy>` still in the SQL.

Fixed by matching **before** sending. Matching is local and costs nothing, so
the two or three runbooks that match the person's own words now travel whole,
in `workspace.runbooksMatched` — steps, checks, escalation. The endpoint reads
the real procedure and answers with what the document cannot give you: which
step matters here, what to check first, what each outcome means, and what not
to waste time on. The full runbook is still drawn underneath, as reference.

- **The answer is rendered above the card**, not below it. Cards used to be
  appended the moment the action ran, which put the procedure above the
  sentence explaining it
- **Identifiers are pulled out of the question** and substituted into the
  checks, so the SQL on screen carries the real policy number instead of
  `<policy>` for somebody to fill in by hand at eleven at night
- **Configuration placeholders are called out.** `<policy>` is a value and
  gets filled; `<COI_REQUEST>` is a table nobody has named yet, is left alone,
  and the card says which ones still need setting. A plausible invented table
  name gets run, so it must never be invented
- **Matching handles inflection.** "COI not generating" now matches the
  trigger "coi not generated" — people type the tense they are in, not the
  phrase in the runbook. On the reported case this took the score from 20 to
  48
- **Naming a system is no longer enough to surface a runbook.** "The imaging
  queue is stuck" used to drag up the COI procedure on the strength of the
  word *imaging* alone; a runbook now needs its own words to have been said
- Each matched runbook carries `confidence` and `why` — which phrases hit —
  so a weak match can be offered as a guess rather than an answer

Prompt rules 9c–9f rewritten. **Repaste §4 of `POWER-AUTOMATE.md`** — without
it the assistant will keep photocopying, because the old rules told it to.

560 assertions across seventeen suites, no failures.

## 2.0.0 — 2026-09-07

The release that turns Dossier from a personal tracker into something a
support team can share.

### The BAU library

A support library that can actually grow, in three layers.

- **Runbooks** — one symptom and what to do about it, *not* one document. A
  guideline file usually holds six or eight distinct problems; split apart
  they can be found, left whole they cannot. Each carries trigger phrases
  (what somebody actually types, error text included), ordered steps, the
  queries that prove what is wrong, escalation, owner, and when a human last
  confirmed it.
- **System profiles** — what is durably true about a system, especially what
  it *lies* about. *regenCOI returns 200 whether or not it produced a letter.*
  One line that answers a family of tickets no runbook covers.
- **Memory** — unchanged. Still the personal notebook it always was.

**Runbooks travel to the flow as an index, never as bodies** — title, system,
triggers, severity, freshness, about 15 tokens each. Measured on the starter
library: 1,012 bytes for the index against 5,513 for the bodies. At a hundred
runbooks that is the difference between 1.5 KB and half a megabyte on every
question. The steps and the SQL stay local until `readRunbook` asks for one by
name. Profiles are the exception and travel whole, because there are few of
them and they are what reasons about an unknown symptom.

Nine new actions — `findRunbook`, `readRunbook`, `listRunbooks`,
`readProfile`, `startRunbook`, `saveRunbook`, `verifyRunbook`,
`deleteRunbook`, `saveProfile`.

**All of it works with the flow switched off.** The matcher is local and needs
no network. The endpoint adds language, not capability.

- Starting a runbook raises a record with its steps already on the checklist,
  so the work is tracked and there is evidence of what was done
- **Make a runbook from this** on any record — the library builds itself out
  of work you already did, which is the only way libraries ever get built
- Everything arrives as a **draft**: imports, what the assistant writes, what
  you capture. Approving is a human act, and there is no path to it from the
  endpoint
- Anything unconfirmed for a year shows as unchecked wherever it appears
- **Export and import the whole library as one file** — merged by title with
  the newer edit winning, so two people can both add runbooks and neither
  loses theirs. No shared drive needed

### The assistant

- `draftEmail` writes an email and shows it as a draft with Copy and *Open in
  my mail app*. Nothing is sent — Dossier has no mail credentials and its CSP
  has no outbound permission, so the draft is text until you send it
- `setTheme` and `setSetting` change the application's own settings from a
  whitelist of 15 keys. `settings.flow` — the endpoint URL — is deliberately
  not on it, and the refusal lives in the executor rather than the
  confirmation dialogue, so it holds even with confirmation turned off
- Chat redesigned: skins, toggleable motion, a confirm-or-don't switch, and
  confirmations moved out of the thread into a card that resolves to a
  one-line receipt

### Fixed

- **The email body rendered invisible.** `chatDraft` gave it `class="mb"`,
  which is already the row menu button — 25×25, `opacity:0` until its row is
  hovered. `.chmail .mb` overrode padding and colour but never width, height
  or opacity, so the text was in the DOM, correct, and rendered into a
  transparent 25-pixel square. Copy worked the whole time because it read the
  data directly. Renamed to `.mbody`
- **Code arrived without its fence.** A model that writes `csharp` on a line
  and forgets the backticks now still gets a code panel: `chatMend` repairs an
  unclosed fence, and a bare language name standing over something that reads
  like code. Both repairs are conservative — a language word over prose is
  left alone, and a sentence after the block stays out of the panel
- **Undo never covered the library.** `pushUndo` only ever snapshotted
  `S.tasks`, so the Undo offered after forgetting a memory note restored the
  records and left the note deleted. It now takes a snapshot covering memory,
  runbooks and profiles
- **New runbooks looked freshly checked.** `rbNormalise` stamped `verified`
  with today when the field was empty, which would have made every import and
  every written procedure look confirmed — the exact lie the field exists to
  catch
- An explicitly named system now outranks a system name that merely appears in
  the sentence, so asking about Imaging cannot surface the payment runbook
  because the word "payment" was in the question
- Attachments no longer blow the token budget: images are shrunk through a
  ladder before sending, and the reachability probe identifies itself instead
  of posting an empty body

### Interface

- **The version now sits at the right-hand end of the status bar.** Clicking
  it copies the build line. This matters more than it looks: the app is shared
  by sending the file, so five people can be running five different copies,
  and *"it does not do that on mine"* is a real conversation
- Address lines on an email draft are shown even when empty, and `bcc` was
  added throughout — schema, card, Copy and the mailto link

### Documents

- `flow/BAU-RUNBOOKS.md` — new. How a runbook is shaped, how to decompose
  existing `.docx` guidelines into them, and how a team shares the library
  with no shared drive
- `flow/runbooks-starter.json` — new. Three runbooks and two profiles built
  from real support situations, with every table and team name left as an
  angle-bracketed placeholder. A shape to copy, not content to trust
- `flow/CONTRACT.md` — the action reference is now generated from the sample
  payload, so the document, the code and the wire format cannot drift apart
- `flow/POWER-AUTOMATE.md` — prompt rules 9c–9g for the library, seven new
  worked examples, and the note that **the library needs no flow change**:
  `workspace` is passed whole, so the new blocks ride along inside it

### Upgrading from the previous build

Replace the files. Then:

1. **Repaste §4 of `POWER-AUTOMATE.md`** into your AI Builder prompt. This is
   the only required step, and without it the assistant will not reach for the
   library
2. Import `flow/runbooks-starter.json` from Menu → Setup → Runbooks, and
   replace its placeholders with your real table and team names
3. The Parse JSON schema does **not** need changing — Parse JSON does not
   strip properties its schema omits. Update it only if you want the new
   fields as dynamic content of their own

Nothing in your workspace needs migrating. `settings.runbooks` and
`settings.profiles` are created empty on first use.

### Tested

535 assertions across sixteen browser and Node suites, no failures.
