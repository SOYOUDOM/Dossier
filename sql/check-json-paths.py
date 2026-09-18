"""Check that every JSON path the loader reads exists in a real workspace.

A wrong path in OPENJSON is not an error - it loads nothing, quietly, which
is worse than a crash. This builds a workspace holding one of everything and
walks the paths the loader actually asks for."""
import json, re, sys, os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

ws = json.load(open(os.path.join(ROOT, "demo", "dossier.json")))
lib = json.load(open(os.path.join(ROOT, "flow", "runbooks-starter.json")))
ws["settings"]["runbooks"] = lib["runbooks"]
# the app stamps a profile with "updated" when it imports one; the starter
# library does not carry it, and the loader treats it as optional
ws["settings"]["profiles"] = [dict(x, updated="2026-09-01T08:00:00.000Z") for x in lib["profiles"]]
ws["settings"]["memory"] = [{"id": "n1", "title": "COI", "body": "...", "system": "Imaging",
                             "tags": ["coi"], "created": "2026-09-01T08:00:00.000Z",
                             "updated": "2026-09-02T08:00:00.000Z"}]
ws["incidents"] = [{"num": "INC0000001", "opened": "2026-08-20T11:00:00.000Z", "resolved": "",
                    "closed": "2026-08-20T15:00:00.000Z", "title": "COI letter not generated",
                    "desc": "...", "sys": "Imaging", "ci": "Imaging", "cat": "Application",
                    "sub": "", "group": "App Support", "who": "Vibol", "caller": "Sok Dara",
                    "pri": "P3", "state": "Closed", "closeCode": "Solved (Work Around)",
                    "closeNotes": "Regenerated", "cause": "", "reopens": 0}]
ws["chats"] = [{"id": "K1", "title": "about D-0001", "created": "2026-09-01T08:00:00.000Z",
                "updated": "2026-09-01T08:05:00.000Z", "convo": {},
                "msgs": [{"who": "you", "text": "what is overdue"},
                         {"who": "bot", "reply": {"say": "One thing."}},
                         {"who": "receipt", "text": "D-0001 closed", "no": False}]}]

def walk(doc, path):
    """the subset of JSON path OPENJSON uses here: $.a.b"""
    cur = doc
    for part in path.lstrip("$").lstrip(".").split(".") if path not in ("$", "") else []:
        if not isinstance(cur, dict) or part not in cur:
            return None, False
        cur = cur[part]
    return cur, True

# The loader moved out of push.sql and into load-proc.sql in 4.0.0, and this
# went on reading push.sql, so it checked nothing and said so in a number
# nobody read. Every file that shreds the document, every time.
sql = "".join(open(os.path.join(HERE, n)).read()
              for n in ("push.sql", "load-proc.sql"))
bad, checked = [], 0

# OPENJSON(@doc, '$.x') WITH ( col type '$.field', ... )
for m in re.finditer(r"OPENJSON\(@doc,\s*'([^']+)'\)\s*WITH\s*\((.*?)\)\s*AS\s+(\w+)", sql, re.S):
    root, body, alias = m.group(1), m.group(2), m.group(3)
    rows, ok = walk(ws, root)
    checked += 1
    if not ok:
        bad.append("root path %s does not exist in a workspace" % root); continue
    if not isinstance(rows, list):
        bad.append("root path %s is not an array" % root); continue
    if not rows:
        bad.append("root path %s is empty in the sample - cannot verify its fields" % root); continue
    keys = set()
    for r in rows:
        if isinstance(r, dict): keys |= set(r.keys())
    for f in re.finditer(r"'\$\.(\w+)'", body):
        checked += 1
        if f.group(1) not in keys:
            bad.append("%s: no field '%s' on rows of %s (it has: %s)" %
                       (alias, f.group(1), root, ", ".join(sorted(keys))))

print("checked %d paths against a workspace holding one of everything" % checked)
for b in sorted(set(bad)): print("  !", b)
sys.exit(1 if bad else 0)
