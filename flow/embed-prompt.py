"""Carry flow/prompt.txt into flow.js, between two marker comments.

Dossier reads flow/prompt.txt before every question when Dossier.bat serves
it. Opened straight from the folder (file://) a page cannot read a file
beside it, so flow.js carries a copy of its own - this keeps that copy the
same as the file. Run it after editing flow/prompt.txt; flow/check-prompt.js
fails when the two differ, so a forgotten run is noticed.

    python flow/embed-prompt.py
"""
import io, json, os, sys

here = os.path.dirname(os.path.abspath(__file__))
root = os.path.dirname(here)
prompt = io.open(os.path.join(here, "prompt.txt"), encoding="utf-8").read().replace("\r\n", "\n")
js_path = os.path.join(root, "flow.js")
js = io.open(js_path, encoding="utf-8", newline="").read()
a, b = "/* PROMPT-BUILTIN */", "/* PROMPT-BUILTIN-END */"
if a not in js or b not in js:
    sys.exit("flow.js has no " + a + " ... " + b + " markers")
head, rest = js.split(a, 1)
_, tail = rest.split(b, 1)
body = "\nconst PROMPT_BUILTIN = " + json.dumps(prompt, ensure_ascii=False) + ";\n"
io.open(js_path, "w", encoding="utf-8", newline="").write(head + a + body + b + tail)
print("flow.js now carries flow/prompt.txt (%d bytes)" % len(prompt.encode("utf-8")))
