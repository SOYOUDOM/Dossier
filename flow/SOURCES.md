# Sources — setup, configuration and troubleshooting

How Resolv answers from your runbooks and standards, what it needs, where it
keeps things, and what to do when an answer is not what you expected. The
everyday how-to is in the README
([Answering from your runbooks and standards](../README.md#answering-from-your-runbooks-and-standards-sources));
this is the reference behind it.

---

## 1. How it works

```
 Library → Sources → + Add          a document attached in the chat
            │                                   │
            ▼                                   ▼
   read to the end (PDF reader, ocr.js for scans, Word reader, text)
            │
            ▼
   sources.js prepare():  lines → headings → passages (~1,100 characters,
   whole paragraphs and table rows, a table's header repeated), each with
   page, line range, section, a stable id, and a quality flag per page
            │
            ▼
   workspace folder:  sources/catalog.json, sources/<id>/<original>,
                      sources/<id>/text.txt, sources/<id>/chunks.json
            │
   every question ─────────────────────────────────────────────┐
            ▼                                                  │
   which documents may be read:  active (or asked for by       │
   version) · cleared access label · may go to the assistant · │
   system / environment / document the question names ·       │
   the current version when metadata proves it                 │
            ▼                                                  │
   search (BM25 over words and word pairs, section headings    │
   weighted, a short synonym list) → best six passages, at     │
   most four per document, plus the passages beside the best   │
   three → S1, S2, … within 14,000 characters                   │
            ▼                                                  │
   the prompt's THEIR DOCUMENTS (SOURCES) part, and the rules   │
   for answering from it                                       │
            ▼                                                  │
   the reply: say, cite [{s, quote}], confidence, suggest       │
            ▼                                                  │
   sources.js ground(): every quote must be in the passage it   │
   cites; every figure in the answer must be in a cited passage │
            ▼                                                  │
   Answer · Source · Evidence · Confidence · Suggestion ·       │
   Searched — or "No supporting source found" / "held back" ◄──┘
```

The pieces, by file:

| File | Responsibility |
|---|---|
| `sources.js` | Pure logic (`window.DossierSources`, `module.exports`): reading into lines and headings, passages, metadata, versions, the index, access and metadata filtering, search, neighbours, citations, follow-ups, figure extraction, the grounding check, diagnostics. No DOM, no files, no network. |
| `dossier.html`, block *SOURCES* | The files in the workspace folder, adding (with the details dialog and version handling), re-indexing, switching off, removing, the Library panel, a question's passages (`srcForFlow`), checking the reply (`srcApply`), what goes under an answer, the viewer, local answers and the two local questions, the diagnostics log. |
| `dossier.html`, `pdfText` | The PDF reader, now able to read a whole document (`maxPages`, `maxChars`) and to report each page's glyphs and undecodable characters (`pageStats`). |
| `flow.js` | The request's `sourcesText` and `workspace.sources`; the prompt's `{sources}` place; the reply's `cite`, `confidence` and `suggest`. |
| `flow/prompt.txt` | *THEIR DOCUMENTS (SOURCES)* and its ten rules; examples, including the not-found answer. |

## 2. Requirements

| Need | What | Why |
|---|---|---|
| Packages | None. | The search, the readers and the index are part of the page. |
| Database or vector store | None. | The index is a set of JSON files in the workspace folder; the search runs in memory (150 documents index in well under a second). The SQL bridge, when it is on, keeps records; documents stay as files either way. |
| Embeddings | None. | Passages are found by words (BM25), not by a model's embedding — which would mean sending every document to one more service. See *Search configuration*. |
| Environment variables | None for the app. `CHROME` (optional) tells `tests/e2e/run.js` which browser to drive. | |
| Secrets | None. | Nothing in Sources needs a key, a token or a password; do not put any in `sources/`. |
| Browser | Chrome or Edge, opened through `Resolv.bat` (a workspace folder is needed to keep files). | |
| OCR (optional) | `ocr.js` beside `dossier.html`. | Only for scanned PDFs. |
| Model | The flow you already have. | The prompt carries the passages and the rules; nothing in Power Automate changes. |

## 3. Configuration

All of it is in **Library → Sources**, stored in `settings.sources` in the
workspace:

| Key | Default | Meaning |
|---|---|---|
| `clearance` | `[]` | Access labels this workspace may read. |
| `keepChat` | `true` | Keep a document attached in a conversation. |
| `budget` | `14000` | Characters of passages per question (from 2,000). A document attached to that same question travels whole up to 60,000 characters, outside this budget. |

Per document (the details dialog, **Details** to change later): name,
version, effective date, systems, environment, category, access label, and
whether its passages may go to the assistant.

**Storage** — `sources/` in the workspace folder:

| Path | Contents |
|---|---|
| `sources/catalog.json` | `{ version, algo, saved, docs:[ { id, name, file, kind, version, effective, systems, environment, category, label, assistant, status, family, sha, textHash, size, pages, added, from, pageStats, issues, chunks, supersedes, supersededBy } ] }` |
| `sources/<id>/<file>` | The original, byte for byte. |
| `sources/<id>/text.txt` | The extracted text; `[page N]` between PDF pages. |
| `sources/<id>/chunks.json` | `[ { id, key, doc, n, page, lineStart, lineEnd, lines, heads, section, text, quality, qualityWhy } ]` |

`status` is `active`, `superseded` (replaced by a newer version: kept, not
searched unless a question asks for that version by number) or `inactive`
(switched off: never searched). A passage's `id` is the document's id and a
hash of its section and words, so it is the same after a re-index unless its
words changed.

**PDF extraction** — every page, up to 2,000 pages and 4 million characters;
text lines are numbered per page in the order the reader finds them; pages
with pictures and under forty characters of text are treated as scans.

**OCR** — with `ocr.js`, up to sixty scanned pages per document are read by
the recogniser; a page it is not confident about is left out and flagged.
Pages read by OCR are listed as such, because a recogniser can misread a
figure.

**Search configuration** — in `sources.js`: passages of about 1,100
characters (`CHUNK_TARGET`), up to 1,800 (`CHUNK_MAX`); six best passages
(`k`), at most four from one document; the passages beside the best three;
a passage is kept when it scores at least 30% of the best and covers enough
of the question's words; a small synonym list (`SYNONYMS`) for the words
people use for the same thing. A system named in the question keeps
documents about that system and about no system in particular; an
environment is only taken from a plain mention (*in UAT*, *PROD*, *the
production servers*), never from every "test" in a sentence.

**Access control** — labels, filtered before anything is scored (see the
README's *Access*). Resolv has no user accounts: the workspace folder is the
boundary, and Windows permissions on it are the protection of the files
themselves.

**Model configuration** — none beyond the flow. The prompt's
*THEIR DOCUMENTS (SOURCES)* part must be kept in a prompt of your own
(`dossier-prompt.txt`): a prompt without `{sources}` still gets the passages,
inside `{workspace}`, and **Setup** names the missing place.

## 4. Local development

```
node --test                  # sources.js and the flow's handling of it
node tests/e2e/run.js        # the app in a browser, 39 checks
node flow/check-prompt.js    # after editing flow/prompt.txt ...
python flow/embed-prompt.py  # ... and to copy it into flow.js
node tests/fixtures/make-pdf.js   # remakes the PDF fixture
```

`tests/fixtures/` holds made-up documents — none of them is a real policy.

## 5. Deployment and migration

1. Update the Resolv folder (the new `sources.js` sits beside `dossier.html`).
2. Quit Resolv from its tray icon and start `Resolv.bat` again, then reload
   any open Resolv tab.
3. Nothing to migrate: a workspace with no `sources/` folder simply has no
   documents yet. Add your runbooks and standards from **Library → Sources**.
4. If you use your own `dossier-prompt.txt`, copy the *THEIR DOCUMENTS
   (SOURCES)* part, the `{sources}` line, and the new reply keys from
   `flow/prompt.txt` into it.

## 6. Re-indexing

| When | Do |
|---|---|
| A new version of a document | **+ Add** it; choose *It replaces that version*. |
| The same file changed, or `ocr.js` added since | **Re-index** on it, or **Re-index all**. |
| Resolv's way of cutting passages changed | Nothing: every document is cut again from `text.txt` on the next open. |
| A document must stop being used | **Switch off** (kept) or **Remove** (deleted). |

## 7. Troubleshooting

| What you see | Why, and what to do |
|---|---|
| **No supporting source found** | No passage states the answer. Ask *"why was it not found?"*: it lists what was searched. If the document is not in Sources, add it; if it is, check it is **active**, cleared for its label, and about the system or environment the question names. Name the document in the question to search only it. |
| **Answer held back** | Only for a question in an ordinary conversation (never a `[study]`, `[teach]` or `[intake]` job). The reply stated a figure no cited passage contains; **Recent searches** names the figure. The documents do not give it — or the model cited the wrong passage. Ask again naming the section, or read the document (**View**). |
| **Not from your documents** | The reply cited nothing. Treat it as general advice. |
| "⚠ Not in the document" on a draft runbook | A figure in the draft that its document does not state anywhere. Correct the draft (or say No) before saving. |
| A document named after its logo (*AIA*) | Rename it with **Details**. From 5.9.1 a PDF is named after its file unless its first line is a real title. |
| Two versions in answers | Both are active and nothing proves which is current: give each a version or effective date (**Details**), or switch the old one off. |
| "*n* page(s) could not be read reliably" | A scan without `ocr.js`, a font the reader could not decode, or garbled text. Add `ocr.js` and **Re-index**, or add a text version of the document. |
| "No text could be read" | A scanned PDF without `ocr.js`, or an image-only document. |
| "files missing" on a document | `sources/<id>` was changed outside Resolv. **Re-index** it if the original is still there; otherwise remove it and add it again. |
| A document added by dropping it into `sources/` is not searched | Only documents in `catalog.json` are searched — use **+ Add**. |
| The wrong runbook for a look-alike system | Set **Systems** and **Environment** on each (**Details**), and name the system in the question. |
| What was searched, exactly | **Library → Sources → Recent searches and changes**, or the browser console (`[sources]`): documents, filters, passages, scores, versions, citations, held-back answers. |

## 8. Security

- The documents never leave the workspace folder, except the passages that
  match a question, with it, to the flow you configured — and never from a
  document marked to stay on this PC or one the workspace is not cleared for.
- The access filter runs before scoring, so a restricted document is not
  searched, not counted, not named and not quoted — to the model or on the
  screen.
- The diagnostics hold ids, names, pages, scores and statuses, never a
  passage's words.
- The reply is data: a citation is shown only when its quote is found in the
  passage it names; a figure is shown only when a cited passage contains it.
