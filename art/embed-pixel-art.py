#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Carry the sprites in assets/pixel/ into dossier.html as base64.

    python3 art/make-pixel-art.py      # draw them
    python3 art/embed-pixel-art.py     # put them inside the one file

This is not a build step and dossier.html is not generated: the file is
edited in place, between two marker comments, and everything else in it is
left exactly as it was. Run it when the art changes; otherwise never.

The point of the copy inside dossier.html is rule 3 of the README - the app
is one file you can mail to somebody. The files in assets/pixel/ override
what is embedded, so the art can also be replaced without touching the HTML.
"""

import base64, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = os.path.join(ROOT, "assets", "pixel")
HTML = os.path.join(ROOT, "dossier.html")
NAMES = ["think", "slow", "orb", "hero", "done", "no", "oops", "ask", "new"]

START = "/* PIXEL-ART-DATA — written by art/embed-pixel-art.py; do not edit by hand */"
END = "/* PIXEL-ART-DATA-END */"


def main():
    rows, total = [], 0
    for name in NAMES:
        path = os.path.join(SRC, name + ".gif")
        if not os.path.exists(path):
            sys.exit("missing %s - run art/make-pixel-art.py first" % path)
        raw = open(path, "rb").read()
        total += len(raw)
        rows.append('  %s: "data:image/gif;base64,%s",' %
                    (name, base64.b64encode(raw).decode("ascii")))

    block = START + "\nconst CHAT_PIX_DATA = {\n" + "\n".join(rows) + "\n};\n" + END
    html = open(HTML, encoding="utf-8").read()
    pattern = re.compile(re.escape(START) + r".*?" + re.escape(END), re.S)
    if not pattern.search(html):
        sys.exit("markers not found in dossier.html")
    out = pattern.sub(lambda m: block, html, count=1)
    if out == html:
        print("dossier.html already holds this art")
        return
    open(HTML, "w", encoding="utf-8").write(out)
    print("embedded %d sprites, %d bytes (%d as base64)" %
          (len(NAMES), total, int(total * 4 / 3)))


if __name__ == "__main__":
    main()
