"""Check the .bat files for the four things that have actually gone wrong.

Not a linter. Each rule below is here because a shipped version broke on it
and somebody had to photograph their screen to tell me.

  1. %~f1 / %~2 as a path      A work PC's folder is "OneDrive - Contoso Ltd".
                               %1 stops at the first space, so an unquoted
                               path arrives truncated - and "C:\\Users\\you\\
                               OneDrive" exists, so nothing complains. Take
                               %* and split it yourself.
  2. LF line endings           cmd reads a .bat by byte offset; LF breaks its
                               label parsing in ways that look like madness.
  3. bytes over 7 bits         a curly quote in a .bat on a CP437 console is
                               a mystery syntax error.
  4. powershell                the runner was rewritten in .bat precisely so
                               that nothing needs it.
  5. redirect on an `if` line  cmd sets up redirection while parsing, before
                               the condition is tested, so
                               `if <false> >file echo x` empties the file
                               anyway. Put the redirect inside the block.
"""
import os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
bad = 0

for name in sorted(os.listdir(HERE)):
    if not name.lower().endswith(".bat"):
        continue
    path = os.path.join(HERE, name)
    raw = open(path, "rb").read()
    say = []

    for m in re.finditer(rb"%~(?:[a-z]*f[a-z]*)([1-9])", raw):
        line = raw[:m.start()].count(b"\n") + 1
        say.append("line %-4d %s is a path from an argument - unquoted, it "
                   "stops at the first space" % (line, m.group(0).decode()))

    if b"\n" in raw and raw.count(b"\r\n") != raw.count(b"\n"):
        say.append("some lines end in LF, not CRLF - cmd mis-parses labels")

    for i, b in enumerate(raw):
        if b > 126:
            say.append("byte %d is 0x%02x, outside ASCII" % (i, b))
            break

    for i, text in enumerate(raw.split(b"\n")):
        line = text.decode("ascii", "replace").strip()
        if not re.match(r"(?i)if\b", line):
            continue
        probe = re.sub(r"\^[<>&|]", "", line)      # ^> is text, not a redirect
        m = re.search(r">>?\s*(\S+)", probe)
        par = probe.find("(")
        if not m or (par >= 0 and par < m.start()):
            continue
        if m.group(1).strip('"').lower() == "nul":
            continue                                   # nothing to truncate
        say.append("line %-4d redirects on the `if` line itself - that "
                   "happens whether the condition holds or not" % (i + 1))

    for m in re.finditer(rb"(?im)^[^\r\n]*?\bpowershell\b[^\r\n]*$", raw):
        text = m.group(0).decode("ascii", "replace").strip()
        if text.lower().startswith("rem"):
            continue                       # saying it is not used is fine
        line = raw[:m.start()].count(b"\n") + 1
        say.append("line %-4d calls powershell" % line)

    if say:
        bad += len(say)
        print("==", name)
        for s in say:
            print("   !", s)

print("checked the .bat files;", "nothing to fix" if not bad else "%d to fix" % bad)
sys.exit(1 if bad else 0)
