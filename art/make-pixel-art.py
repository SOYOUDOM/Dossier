#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
The assistant's pixel art, drawn here and written out as animated GIFs.

Nothing in Dossier needs this file to run. The sprites it writes are already
in assets/pixel/ and already inside dossier.html as base64, which is the whole
point: a copy of dossier.html on its own still has its art. This is the source
the art was drawn from, so that changing a pixel means editing a picture in a
text file rather than decoding a blob and hoping.

    python3 art/make-pixel-art.py

writes:
    assets/pixel/*.gif          the sprites, one file each
    art/contact-sheet.png       every frame of every sprite, 8x, on a dark
                                band and a light one - so a colour that
                                vanishes on one skin is visible here first
    assets/pixel/crimson/, assets/pixel/neon/
                                the same sixteen names for the heart (the
                                Crimson skin) and the neon cat (Neon), with
                                art/contact-sheet-crimson.png and -neon.png

then art/embed-pixel-art.py carries the same files into dossier.html as
base64, which is what a copy of the app on its own runs on.

Stdlib only: no Pillow, no build step, no package manager. The GIF encoder
(LZW and all) and the PNG writer for the contact sheet are below.

── the drawing ──────────────────────────────────────────────────────────────
A sprite is a list of frames; a frame is a list of equal-length strings, one
character per pixel, from PAL below. '.' is transparent. Sixteen colours, one
palette for every sprite, chosen so that the art reads on a white skin and on
a near-black one: no pure black, no pure white, mid-tone fills, and an outline
that is dark blue rather than black so it does not punch a hole in Nebula.
"""

import os, struct, zlib

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, "assets", "pixel")

# ── the palette ─────────────────────────────────────────────────────────────
# index 0 is the transparent one and its colour never shows; it is filled with
# the body blue anyway, so a decoder that ignores transparency shows a blob
# rather than a black square.
PAL = [
    ("." , (0x4F, 0x7D, 0xD6)),   # 0  transparent
    ("K" , (0x0E, 0x17, 0x29)),   # 1  outline, deep navy
    ("D" , (0x23, 0x37, 0x5F)),   # 2  visor / shadow
    ("B" , (0x4F, 0x7D, 0xD6)),   # 3  body
    ("A" , (0x6E, 0xA8, 0xFF)),   # 4  bright blue
    ("L" , (0xB7, 0xDC, 0xFF)),   # 5  light blue
    ("W" , (0xF3, 0xF9, 0xFF)),   # 6  white
    ("C" , (0x7F, 0xE8, 0xE4)),   # 7  cyan, the eyes
    ("G" , (0x56, 0xD7, 0x9B)),   # 8  green, a yes
    ("Y" , (0xFF, 0xC4, 0x6B)),   # 9  amber
    ("O" , (0xFF, 0x9A, 0x5B)),   # 10 orange
    ("R" , (0xFF, 0x7F, 0x92)),   # 11 rose, a no
    ("P" , (0xA8, 0x8C, 0xFF)),   # 12 violet
    ("S" , (0x7B, 0x93, 0xBE)),   # 13 slate, a left-alone
    ("E" , (0x2E, 0x8F, 0x6E)),   # 14 deep green
    ("N" , (0x16, 0x20, 0x38)),   # 15 deepest
]
IDX = {c: i for i, (c, _) in enumerate(PAL)}


# ═══ GIF ════════════════════════════════════════════════════════════════════
class Bits(object):
    """LSB-first bit packer, which is the order GIF's LZW codes go out in."""
    def __init__(self):
        self.out = bytearray()
        self.acc = 0
        self.n = 0

    def write(self, code, size):
        self.acc |= (code << self.n)
        self.n += size
        while self.n >= 8:
            self.out.append(self.acc & 0xFF)
            self.acc >>= 8
            self.n -= 8

    def flush(self):
        if self.n > 0:
            self.out.append(self.acc & 0xFF)
            self.acc = 0
            self.n = 0
        return bytes(self.out)


def lzw(indices, min_code_size):
    """GIF's variable-width LZW. The one detail worth stating: the code width
    grows when the next code to be handed out no longer fits, and the decoder
    is one code behind, which is why the test is > and not >=."""
    clear = 1 << min_code_size
    end = clear + 1
    size = min_code_size + 1
    table = {(i,): i for i in range(clear)}
    nxt = end + 1
    bits = Bits()
    bits.write(clear, size)
    run = ()
    for px in indices:
        grown = run + (px,)
        if grown in table:
            run = grown
            continue
        bits.write(table[run], size)
        if nxt < 4096:
            table[grown] = nxt
            nxt += 1
            if nxt > (1 << size) and size < 12:
                size += 1
        else:
            bits.write(clear, size)
            table = {(i,): i for i in range(clear)}
            nxt = end + 1
            size = min_code_size + 1
        run = (px,)
    if run:
        bits.write(table[run], size)
    bits.write(end, size)
    return bits.flush()


def blocks(data):
    """LZW output goes out in sub-blocks of at most 255 bytes, then a zero."""
    out = bytearray()
    for i in range(0, len(data), 255):
        chunk = data[i:i + 255]
        out.append(len(chunk))
        out += chunk
    out.append(0)
    return bytes(out)


def gif(frames, delay_cs, loop=True, pal=None):
    """frames: a list of 2-D lists of palette indices, all the same size.
    delay_cs: hundredths of a second, one number or one per frame.
    loop=False leaves the Netscape block out, so the animation plays once and
    stops on its last frame - which is what a tick that has just been stamped
    should do, rather than stamping itself forever."""
    h = len(frames[0])
    w = len(frames[0][0])
    if isinstance(delay_cs, int):
        delay_cs = [delay_cs] * len(frames)

    out = bytearray(b"GIF89a")
    out += struct.pack("<HH", w, h)
    out += bytes([0xF3, 0x00, 0x00])          # global table, 16 colours
    for _, (r, g, b) in (pal or PAL):
        out += bytes([r, g, b])
    if loop:
        out += b"\x21\xFF\x0BNETSCAPE2.0\x03\x01\x00\x00\x00"

    for frame, cs in zip(frames, delay_cs):
        # disposal 2 (restore to background) + transparency on index 0, so a
        # frame never shows through the one before it
        out += b"\x21\xF9\x04\x09" + struct.pack("<H", cs) + b"\x00\x00"
        out += b"\x2C" + struct.pack("<HHHH", 0, 0, w, h) + b"\x00"
        flat = [px for row in frame for px in row]
        out += bytes([4]) + blocks(lzw(flat, 4))
    out += b"\x3B"
    return bytes(out)


# ═══ the canvas ═════════════════════════════════════════════════════════════
def grid(rows, w=None):
    """A frame from a picture. Every row must be the same width, because a row
    that is one character short silently shears the whole sprite."""
    w = w or len(rows[0])
    for i, r in enumerate(rows):
        if len(r) != w:
            raise ValueError("row %d is %d wide, expected %d: %r" % (i, len(r), w, r))
    return [list(r) for r in rows]


def copy(g):
    return [row[:] for row in g]


def paste(g, patch, x, y):
    """Draw patch onto g at (x, y). '.' in the patch means leave what is
    underneath, which is how one base drawing becomes eight frames."""
    for dy, row in enumerate(patch):
        for dx, ch in enumerate(row):
            if ch == ".":
                continue
            ty, tx = y + dy, x + dx
            if 0 <= ty < len(g) and 0 <= tx < len(g[0]):
                g[ty][tx] = ch
    return g


def px(g, x, y, ch):
    if 0 <= y < len(g) and 0 <= x < len(g[0]):
        g[y][x] = ch
    return g


def shift(g, dx, dy, w=None, h=None):
    """The same drawing, moved. Used for a bob and a bounce."""
    h = h or len(g)
    w = w or len(g[0])
    out = [["." for _ in range(w)] for _ in range(h)]
    for y, row in enumerate(g):
        for x, ch in enumerate(row):
            if ch == "." :
                continue
            ty, tx = y + dy, x + dx
            if 0 <= ty < h and 0 <= tx < w:
                out[ty][tx] = ch
    return out


def blank(w, h):
    return [["." for _ in range(w)] for _ in range(h)]


def to_indices(g):
    return [[IDX[ch] for ch in row] for row in g]


def disc(g, cx, cy, r, ch, fill=True):
    """A circle that looks drawn rather than computed: the radius test is on
    the pixel centre, which is what stops a 12-pixel circle having flat sides
    and pointed corners at the same time."""
    for y in range(len(g)):
        for x in range(len(g[0])):
            d = ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5
            if (d <= r) if fill else (r - 0.9 <= d <= r + 0.2):
                g[y][x] = ch
    return g


# ═══ the sprites ════════════════════════════════════════════════════════════
# ── the head, which three sprites are built on ──────────────────────────────
HEAD = grid([
    "................",
    ".......YY.......",
    ".......YY.......",
    ".......KK.......",
    "..KKKKKKKKKKKK..",
    "..KBBBBBBBBBBK..",
    "..KBDDDDDDDDBK..",
    "..KBDDDDDDDDBK..",
    "..KBDDDDDDDDBK..",
    "..KBDDDDDDDDBK..",
    "..KBBBDDDDBBBK..",
    "..KKKKKKKKKKKK..",
    "......KKKK......",
    "...KKKKKKKKKK...",
    "...KBBBAABBBK...",
    "...KKKKKKKKKK...",
])

EYES_MID   = ["CC..CC"]          # drawn at x=5, two rows tall
EYES_LEFT  = ["CC..CC"]
EYES_RIGHT = ["CC..CC"]


def head_frame(eyes="mid", bulb="Y", glow=False):
    g = copy(HEAD)
    # the bulb on the antenna, and the light it throws when it is bright
    paste(g, [bulb * 2, bulb * 2], 7, 1)
    if glow:
        px(g, 6, 1, bulb); px(g, 9, 1, bulb)
        px(g, 6, 2, bulb); px(g, 9, 2, bulb)
        px(g, 7, 0, bulb); px(g, 8, 0, bulb)
    # the eyes, inside the visor: cols 4..11, rows 6..9
    if eyes == "shut":
        paste(g, ["CC..CC"], 5, 8)
    else:
        x = {"mid": 5, "left": 4, "right": 6}[eyes]
        paste(g, ["CC", "CC"], x, 7)
        paste(g, ["CC", "CC"], x + 4, 7)
    return g


def sprite_think():
    """Waiting on an answer: the eyes cast about and the antenna keeps time."""
    return [
        head_frame("mid",   "Y", False),
        head_frame("left",  "O", True),
        head_frame("mid",   "Y", False),
        head_frame("right", "O", True),
        head_frame("shut",  "Y", False),
        head_frame("mid",   "L", False),
    ], 15


def sprite_slow():
    """Past eight seconds the wait is the news, so the bot settles in to it."""
    z1 = ["LLL", "..L", ".L.", "LLL"]
    z2 = ["WW", ".W", "WW"]
    out = []
    for i in range(4):
        g = head_frame("shut", "S", False)
        if i in (0, 1):
            paste(g, z1, 12, 1 - i)
        if i in (1, 2):
            paste(g, z2, 10, 3 - i)
        out.append(g)
    return out, 42


def sprite_orb():
    """The mark in the header: a lit sphere with a glint travelling over it.
    Drawn with maths rather than by hand, because a hand-drawn circle at
    sixteen pixels is a hand-drawn octagon.

    The glint stays ON the sphere. Outside it, a white star is invisible on
    the Paper skin and a dark one is invisible on Nebula; over the sphere's
    own blue it has something to be seen against either way."""
    star = [".W.", "WWW", ".W."]
    out = []
    ring = [(10, 5), (11, 8), (9, 11), (6, 11), (4, 8), (5, 5), (7, 4), (9, 4)]
    for sx, sy in ring:
        g = blank(16, 16)
        disc(g, 7.5, 7.5, 6.4, "D")
        disc(g, 7.5, 7.5, 6.4, "L", fill=False)
        disc(g, 6.4, 6.4, 4.0, "B")
        disc(g, 6.0, 6.0, 2.4, "A")
        paste(g, star, sx - 1, sy - 1)
        out.append(g)
    return out, 16


# ── the character ───────────────────────────────────────────────────────────
# One drawing of the assistant, and every pose it holds anywhere in the app is
# this body with different arms, different eyes and something over its head.
# Drawing each pose from scratch is how a character stops being the same
# character by the third one.
BODY = grid([
    "........................",
    "...........YY...........",
    "...........YY...........",
    "...........KK...........",
    ".....KKKKKKKKKKKKKK.....",
    "....KBBBBBBBBBBBBBBK....",
    "....KBDDDDDDDDDDDDBK....",
    "....KBDDDDDDDDDDDDBK....",
    "....KBDDDDDDDDDDDDBK....",
    "....KBDDDDDDDDDDDDBK....",
    "....KBDDDDDDDDDDDDBK....",
    "....KBBBBBBBBBBBBBBK....",
    "....KBBBBDDDDDDBBBBK....",
    ".....KKKKKKKKKKKKKK.....",
    "..........KKKK..........",
    ".....KKKKKKKKKKKKKK.....",
    "....KBBBBBBBBBBBBBBK....",
    "....KBBBBBAAAABBBBBK....",
    "....KBBBBBAAAABBBBBK....",
    "....KBBBBBBBBBBBBBBK....",
    "....KBBBBBBBBBBBBBBK....",
    ".....KKKKKKKKKKKKKK.....",
    "......DDDDDDDDDDDD......",
    "........................",
])
STAR = [".W.", "WWW", ".W."]
ZED = ["LLL", "..L", ".L.", "LLL"]


def arm(g, side, top, hand=None, dy=0):
    """An arm needs two pixels of blue in it. At one it is a dark outline, a
    single lit column and another dark outline, which on Nebula is not an arm
    but a stick lying beside a robot. Two columns of blue with the body's own
    outline left between them reads as a limb on every skin.

    Raising one moves where it starts. The shoulder stays where it is, which
    is what keeps it attached to the robot it belongs to - and the hand goes
    on the far end of the arm, which is the top of a raised one and the
    bottom of a lowered one. Put it at the top of a lowered arm and the robot
    appears to be holding both hands up beside its ears at all times."""
    x, pat = (1, "KBB") if side == "L" else (20, "BBK")
    for y in range(top, 21):
        paste(g, [pat], x, y + dy)
    paste(g, ["KKK"], x, 21 + dy)
    hx = x + 1 if side == "L" else x   # inside the arm's own outline
    if hand == "top":
        paste(g, ["LL", "LL"], hx, top + dy)
    elif hand == "bottom":
        paste(g, ["LL", "LL"], hx, 19 + dy)


def eyes(g, how="open", dy=0):
    if how == "shut":
        paste(g, ["CCC..CCC"], 8, 9 + dy)
    elif how == "wide":
        paste(g, ["CCC", "CCC", "CCC"], 8, 7 + dy)
        paste(g, ["CCC", "CCC", "CCC"], 13, 7 + dy)
    elif how == "small":
        paste(g, ["CC", "CC"], 9, 8 + dy)
        paste(g, ["CC", "CC"], 14, 8 + dy)
    else:
        paste(g, ["CCC", "CCC"], 8, 8 + dy)
        paste(g, ["CCC", "CCC"], 13, 8 + dy)


def pose(arms="down", look="open", bulb="Y", dy=0, over=None, front=None):
    """One frame of the character. dy drops the whole drawing, which is how it
    sits down to sleep and hops when it is pleased."""
    g = blank(24, 24)
    for y, row in enumerate(BODY):
        for x, ch in enumerate(row):
            if ch != "." and 0 <= y + dy < 24:
                g[y + dy][x] = ch
    if arms == "down":
        arm(g, "L", 16, dy=dy); arm(g, "R", 16, dy=dy)
    elif arms == "up":
        arm(g, "L", 10, "top", dy); arm(g, "R", 10, "top", dy)
    elif arms == "half":
        arm(g, "L", 13, "top", dy); arm(g, "R", 13, "top", dy)
    elif arms == "out":
        arm(g, "L", 16, "bottom", dy); arm(g, "R", 16, "bottom", dy)
    paste(g, [bulb * 2, bulb * 2], 11, 1 + dy)
    eyes(g, look, dy)
    if front:
        paste(g, front[0], front[1], front[2])
    if over:
        paste(g, over[0], over[1], over[2])
    return g


def sprite_hero():
    """An empty thread opens on this: the assistant itself, waving."""
    def wave(step, look="open", bulb="Y", twinkle=None):
        g = pose("down", look, bulb)
        if step:
            # the waving arm bends: shoulder, a step outward, then the hand
            for y in (16, 17):
                paste(g, ["BBK"], 20, y)
            for y in (13, 14, 15):
                paste(g, ["BBK"], 21, y)
            paste(g, ["KK"], 20, 18)
            paste(g, ["LLK", "LLK"], 21 if step == 1 else 22, 11)
        if twinkle:
            paste(g, STAR, twinkle[0], twinkle[1])
        return g

    return [
        wave(0), wave(1, bulb="O", twinkle=(2, 6)), wave(2),
        wave(1, bulb="O", twinkle=(2, 6)), wave(2, "shut"),
        wave(0, bulb="L"), wave(0, twinkle=(2, 6)), wave(0),
    ], 18


# ═══ the desk pet ═══════════════════════════════════════════════════════════
# The same character, everywhere else in the app. It is still for most of the
# day on purpose: a record sheet should not move while it is being read, so
# the only sprite that runs all day is idle, and idle is a blink.
def sprite_pet_idle():
    """Standing about. Two long still frames, one blink, one slow pulse of the
    antenna - which is the most a thing parked in the corner of somebody's
    afternoon has any business doing."""
    return [pose(), pose("down", "shut"), pose(), pose("down", "open", "L")], [180, 12, 150, 40]


def sprite_pet_cheer():
    """Something was finished. Arms up, a hop, and two sparks."""
    return [
        pose("half", "open", "O"),
        pose("up", "open", "Y", dy=-1, over=(STAR, 2, 5)),
        pose("up", "open", "O", dy=-1, over=(STAR, 19, 4)),
        pose("up", "open", "Y", dy=-1, over=(STAR, 2, 5)),
        pose("half", "open", "O"),
        pose("down", "open", "Y"),
    ], [10, 10, 10, 10, 12, 30]


def sprite_pet_worry():
    """Something is overdue. It is not a siren - a small shuffle on the spot
    and one amber mark over its head, which is as loud as a pet gets."""
    bang = ["YY", "YY", "YY", "..", "YY"]   # beside the head, never over it
    out = []
    for i, (look, mark) in enumerate((("small", True), ("small", True),
                                      ("small", False), ("open", True))):
        g = pose("out", look, "O", over=(bang, 21, 5) if mark else None)
        out.append(g)
    return out, [26, 26, 20, 26]


def sprite_pet_nap():
    """Nobody has touched anything for a while. It sits down two pixels and
    sleeps, and the z rises the way a z is obliged to."""
    return [
        pose("down", "shut", "S", dy=2, over=(ZED, 20, 1)),
        pose("down", "shut", "S", dy=2, over=(ZED, 20, 0)),
        pose("down", "shut", "D", dy=2, over=(["WW", ".W", "WW"], 20, 2)),
        pose("down", "shut", "S", dy=2),
    ], [70, 70, 70, 90]


def sprite_pet_work():
    """A save, a backup, a script going out: it is holding a record and
    stamping it."""
    card = ["LLLLL", "LDDDL", "LDDDL", "LLLLL"]
    done = ["LLLLL", "LDGDL", "LGDGL", "LLLLL"]
    return [
        pose("out", "open", "Y", front=(card, 9, 17)),
        pose("out", "open", "O", dy=-1, front=(card, 9, 16)),
        pose("out", "open", "Y", front=(done, 9, 17)),
        pose("out", "open", "Y", front=(done, 9, 17)),
    ], [16, 12, 16, 26]


def sprite_pet_stretch():
    """The end of the working day, once."""
    return [
        pose("down"),
        pose("half", "shut", "Y"),
        pose("up", "shut", "L", dy=-1, over=(["LL", "..", "LL"], 20, 3)),
        pose("up", "shut", "L", dy=-1, over=(["LL", "..", "LL"], 20, 2)),
        pose("half", "open", "Y"),
        pose("down"),
    ], [24, 24, 40, 40, 24, 60]


def sprite_pet_held():
    """Picked up and being carried to another corner."""
    return [
        pose("up", "wide", "O", dy=-1),
        pose("up", "wide", "Y", dy=0),
        pose("up", "wide", "O", dy=-1),
        pose("up", "wide", "Y", dy=1),
    ], 9


def sprite_done():
    """Something was carried out. It stamps in and then holds still: the loop
    is deliberately left off, because a receipt that keeps ticking for the
    rest of the afternoon is a receipt nobody trusts."""
    tick = grid([
        "................",
        "................",
        "..............G.",
        ".............GG.",
        "............GG..",
        "...G.......GG...",
        "...GG.....GG....",
        "....GG...GG.....",
        ".....GG.GG......",
        "......GGG.......",
        ".......G........",
        "................",
        "................",
        "................",
        "................",
        "................",
    ])
    spark = [".W.", "WWW", ".W."]
    out = []
    for reveal in (6, 10, 16):
        g = blank(16, 16)
        for y in range(16):
            for x in range(16):
                if x <= reveal and tick[y][x] != ".":
                    g[y][x] = tick[y][x]
        out.append(g)
    lit = copy(out[-1])
    paste(lit, spark, 12, 1)
    paste(lit, [".W.", "WWW", ".W."], 1, 10)
    out.append(lit)
    out.append(copy(out[2]))
    return out, [7, 7, 7, 9, 40]


def sprite_no():
    """A proposal declined. Nothing happened, and it should look like nothing
    happened: a grey ring and a dash, no drama."""
    out = []
    for w in (2, 4, 6, 6):
        g = blank(16, 16)
        disc(g, 7.5, 7.5, 6.2, "S", fill=False)
        for x in range(5, 5 + w):
            px(g, x, 7, "S"); px(g, x, 8, "S")
        out.append(g)
    return out, [7, 7, 7, 60]


def sprite_oops():
    """The endpoint could not be reached, or it answered with a mess."""
    card = [
        "...KKKKKKKKKK...",
        "..KYYYYYYYYYYK..",
        "..KYYYYKKYYYYK..",
        "..KYYYYKKYYYYK..",
        "..KYYYYKKYYYYK..",
        "..KYYYYKKYYYYK..",
        "..KYYYYYYYYYYK..",
        "..KYYYYKKYYYYK..",
        "..KYYYYYYYYYYK..",
        "...KKKKKKKKKK...",
    ]
    out = []
    for i, tint in enumerate(("Y", "O", "R", "O")):
        g = blank(16, 16)
        paste(g, [row.replace("Y", tint) for row in card], 0, 3)
        if i in (1, 2):
            for y in (7, 8):
                px(g, 0, y, tint); px(g, 15, y, tint)
        out.append(g)
    return out, 20


def sprite_ask():
    """Dossier is asking you something: the confirmation dialogue's mark."""
    bubble = [
        "...KKKKKKKKKK...",
        "..KAAAAAAAAAAK..",
        "..KAAAAAAAAAAK..",
        "..KAAAAAAAAAAK..",
        "..KAAAAAAAAAAK..",
        "..KAAAAAAAAAAK..",
        "..KAAAAAAAAAAK..",
        "..KAAAAAAAAAAK..",
        "..KAAAAAAAAAAK..",
        "...KKKKKKKKKK...",
        "....KAAK........",
        ".....KK.........",
    ]
    # Five pixels wide is the narrowest a question mark can be and still be a
    # question mark rather than a smudge with a dot under it.
    mark = [
        ".WWW.",
        "W...W",
        "....W",
        "...W.",
        "..W..",
        ".....",
        "..W..",
    ]
    out = []
    for dy in (0, 0, 1, 1):
        g = blank(16, 16)
        paste(g, bubble, 0, 1 + dy)
        paste(g, mark, 6, 3 + dy)
        out.append(g)
    return out, 22


def sprite_new():
    """The pill that says an answer arrived while you were reading further up.
    It points the way, which is the only job it has."""
    arrow = grid([
        "......AAAA......",
        "......AAAA......",
        "......AAAA......",
        "......AAAA......",
        "...AAAAAAAAAA...",
        "....AAAAAAAA....",
        ".....AAAAAA.....",
        "......AAAA......",
        ".......AA.......",
    ])
    out = []
    for dy in (0, 1, 2, 3, 2, 1):
        g = blank(16, 16)
        paste(g, arrow, 0, 2 + dy)
        if dy >= 2:
            px(g, 6, dy - 1, "L"); px(g, 9, dy - 1, "L")
        out.append(g)
    return out, 11


SPRITES = [
    ("think", sprite_think, True),
    ("slow",  sprite_slow,  True),
    ("orb",   sprite_orb,   True),
    ("hero",  sprite_hero,  True),
    ("done",  sprite_done,  False),
    ("no",    sprite_no,    False),
    ("oops",  sprite_oops,  True),
    ("ask",   sprite_ask,   True),
    ("new",   sprite_new,   True),
    ("pet-idle",    sprite_pet_idle,    True),
    ("pet-cheer",   sprite_pet_cheer,   True),
    ("pet-worry",   sprite_pet_worry,   True),
    ("pet-nap",     sprite_pet_nap,     True),
    ("pet-work",    sprite_pet_work,    True),
    ("pet-stretch", sprite_pet_stretch, True),
    ("pet-held",    sprite_pet_held,    True),
]


# ═══ the second character: the heart, for the Crimson skin ══════════════════
# Crimson is red and white, and its assistant is not the robot repainted but a
# character of its own: a small red heart with a face, two stick arms, and a
# beat. Same sixteen names, same sizes, same timing as the robot's set, so the
# app shows whichever set belongs to the skin with no other change.
#
# Same sixteen letters as PAL in the same order, so every helper above (and
# the five shared drawings - done, no, oops, ask, new) works unchanged; only
# what the letters mean changes. The same rules hold too: no pure black, no
# pure white, and an outline that is a deep wine rather than black, so the
# heart reads on Crimson's white and on its charcoal dark mode.
PAL_CRIMSON = [
    ("." , (0xD3, 0x11, 0x45)),   # 0  transparent (filled with the body red)
    ("K" , (0x4A, 0x0A, 0x1E)),   # 1  outline, deep wine
    ("D" , (0xA0, 0x0E, 0x37)),   # 2  shade
    ("B" , (0xD3, 0x11, 0x45)),   # 3  body red
    ("A" , (0xF0, 0x45, 0x6C)),   # 4  bright red, the lit side
    ("L" , (0xFF, 0xB8, 0xC8)),   # 5  light pink
    ("W" , (0xFF, 0xF6, 0xF8)),   # 6  white
    ("C" , (0x2A, 0x22, 0x2B)),   # 7  the eyes and the smile, charcoal
    ("G" , (0x2F, 0xAE, 0x72)),   # 8  green, a yes
    ("Y" , (0xFF, 0xC2, 0x4D)),   # 9  amber
    ("O" , (0xFF, 0x8A, 0x4C)),   # 10 orange
    ("R" , (0xFF, 0x6B, 0x85)),   # 11 rose
    ("P" , (0xFF, 0x9D, 0xB5)),   # 12 blush, the cheeks
    ("S" , (0x8E, 0x8A, 0x93)),   # 13 slate, a left-alone
    ("E" , (0x1F, 0x7A, 0x52)),   # 14 deep green
    ("N" , (0x1C, 0x1A, 0x20)),   # 15 deepest
]
OUT_CRIMSON = os.path.join(OUT, "crimson")


# Drawn by hand rather than from the heart's equation: at this size the
# equation gives a lobe of one stray pixel and a notch that is not there.
# Each heart has a beat - a second drawing a pixel bigger all round but the
# point, which is where a beat pushes out from.
HEART = grid([
    "........................",
    "........................",
    "......KKKK....KKKK......",
    ".....KBBBBK..KBBBBK.....",
    "....KBBBBBBKKBBBBBBK....",
    "...KBBBBBBBBBBBBBBBBK...",
    "...KBBBBBBBBBBBBBBBBK...",
    "...KBBBBBBBBBBBBBBBBK...",
    "...KBBBBBBBBBBBBBBBBK...",
    "...KBBBBBBBBBBBBBBBBK...",
    "....KBBBBBBBBBBBBBBK....",
    "....KBBBBBBBBBBBBBBK....",
    ".....KBBBBBBBBBBBBK.....",
    "......KBBBBBBBBBBK......",
    ".......KBBBBBBBBK.......",
    "........KBBBBBBK........",
    ".........KBBBBK.........",
    "..........KBBK..........",
    "...........KK...........",
    "........................",
    "........................",
    "........................",
    "........................",
    "........................",
])
HEART_BIG = grid([
    "........................",
    ".....KKKKK....KKKKK.....",
    "....KBBBBBK..KBBBBBK....",
    "...KBBBBBBBKKBBBBBBBK...",
    "..KBBBBBBBBBBBBBBBBBBK..",
    "..KBBBBBBBBBBBBBBBBBBK..",
    "..KBBBBBBBBBBBBBBBBBBK..",
    "..KBBBBBBBBBBBBBBBBBBK..",
    "..KBBBBBBBBBBBBBBBBBBK..",
    "..KBBBBBBBBBBBBBBBBBBK..",
    "...KBBBBBBBBBBBBBBBBK...",
    "....KBBBBBBBBBBBBBBK....",
    ".....KBBBBBBBBBBBBK.....",
    "......KBBBBBBBBBBK......",
    ".......KBBBBBBBBK.......",
    "........KBBBBBBK........",
    ".........KBBBBK.........",
    "..........KBBK..........",
    "...........KK...........",
    "........................",
    "........................",
    "........................",
    "........................",
    "........................",
])
HHEAD = grid([
    "................",
    "...KKK....KKK...",
    "..KBBBK..KBBBK..",
    ".KBBBBBKKBBBBBK.",
    ".KBBBBBBBBBBBBK.",
    ".KBBBBBBBBBBBBK.",
    ".KBBBBBBBBBBBBK.",
    "..KBBBBBBBBBBK..",
    "...KBBBBBBBBK...",
    "....KBBBBBBK....",
    ".....KBBBBK.....",
    "......KBBK......",
    ".......KK.......",
    "................",
    "................",
    "................",
])
HHEAD_BIG = grid([
    "..KKKK....KKKK..",
    ".KBBBBK..KBBBBK.",
    "KBBBBBBKKBBBBBBK",
    "KBBBBBBBBBBBBBBK",
    "KBBBBBBBBBBBBBBK",
    "KBBBBBBBBBBBBBBK",
    "KBBBBBBBBBBBBBBK",
    ".KBBBBBBBBBBBBK.",
    "..KBBBBBBBBBBK..",
    "...KBBBBBBBBK...",
    "....KBBBBBBK....",
    ".....KBBBBK.....",
    "......KBBK......",
    ".......KK.......",
    "................",
    "................",
])


def lit(src):
    """Shade and light for a heart: the inside pixel against the outline on
    the lower right goes dark, the top of the left lobe catches the light."""
    g = copy(src)
    H, W = len(g), len(g[0])
    mid = W / 2.0
    for y in range(H):
        for x in range(W):
            if g[y][x] != "B":
                continue
            right = x + 1 < W and g[y][x + 1] == "K" and x >= mid and y >= H * 0.3
            below = y + 1 < H and g[y + 1][x] == "K" and x >= mid - 1 and y >= H * 0.4
            if right or below:
                g[y][x] = "D"
    top = min(y for y in range(H) if "K" in "".join(g[y]))
    # the first lit pixels on the left lobe, a row and two in from its edge
    for dy, steps in ((1, "AW"), (2, "AW"), (3, "A")):
        y = top + dy
        xs = [x for x in range(int(mid)) if g[y][x] == "B"]
        for i, ch in enumerate(steps):
            if i < len(xs):
                g[y][xs[i] + (1 if dy == 1 else 0)] = ch
    return g


HEART_LIT, HEART_BIG_LIT = lit(HEART), lit(HEART_BIG)
HHEAD_LIT, HHEAD_BIG_LIT = lit(HHEAD), lit(HHEAD_BIG)


def heart(g, big=False, dy=0):
    """The 24-pixel heart onto g, dropped by dy (negative is a hop)."""
    src = HEART_BIG_LIT if big else HEART_LIT
    for y, row in enumerate(src):
        for x, ch in enumerate(row):
            if ch != "." and 0 <= y + dy < len(g):
                g[y + dy][x] = ch
    return g


def hface(g, how="open", dy=0, x0=0, mouth=None):
    """The face of the 24-pixel heart: eyes two wide and three tall with a
    glint, pink cheeks and a small smile. x0 moves the eyes for a glance."""
    ex = (8 + x0, 14 + x0)
    ey = 7 + dy
    if how == "shut":
        for x in ex:
            paste(g, ["CC"], x, ey + 2)
    elif how == "happy":                     # shut in a smile: an arch each
        for x in ex:
            paste(g, ["CC"], x, ey)
            px(g, x - 1, ey + 1, "C"); px(g, x + 2, ey + 1, "C")
    elif how == "wide":
        for x in ex:
            paste(g, ["WC", "CC", "CC"], x, ey - 1)
    elif how == "small":
        for x in ex:
            paste(g, ["CC", "CC"], x, ey + 1)
    else:
        for x in ex:
            paste(g, ["WC", "CC", "CC"], x, ey)
    px(g, 6, ey + 3, "P"); px(g, 7, ey + 3, "P")
    px(g, 16, ey + 3, "P"); px(g, 17, ey + 3, "P")
    mouth = mouth or ("open" if how in ("happy", "wide") else "smile")
    if mouth == "open":                      # a laugh: a half moon, a pink tongue
        paste(g, ["CCCC", ".CR."], 10, ey + 3)
    elif mouth == "flat":
        paste(g, ["CC"], 11, ey + 4)
    elif mouth == "wobble":
        paste(g, ["C..C", ".CC."], 10, ey + 4)
        g[ey + 4][10] = "B" if g[ey + 4][10] == "C" else g[ey + 4][10]
        g[ey + 4][13] = "B" if g[ey + 4][13] == "C" else g[ey + 4][13]
        paste(g, [".CC."], 10, ey + 4); px(g, 10, ey + 5, "C"); px(g, 13, ey + 5, "C")
    else:
        px(g, 10, ey + 3, "C"); px(g, 13, ey + 3, "C")
        px(g, 11, ey + 4, "C"); px(g, 12, ey + 4, "C")


def edge_x(g, y, side):
    """Where the outline is on one row: the leftmost or rightmost K."""
    xs = [x for x, ch in enumerate(g[y]) if ch == "K"]
    if not xs:
        return 12
    return min(xs) if side == "L" else max(xs)


def harm(g, side, how="down", dy=0):
    """A stick arm that starts on the outline and a round hand on its end.
    Down hangs beside the body; out reaches forward to hold something; up is
    raised over the lobes; wave is raised to the side with the hand open."""
    L = side == "L"
    st = -1 if L else 1
    sy = 10 + dy                              # the shoulder row
    sx = edge_x(g, sy, side) + st             # one pixel off the outline
    if how == "down":
        pts = [(sx, sy), (sx, sy + 1), (sx, sy + 2)]
        hx, hy = sx, sy + 3
    elif how == "out":
        pts = [(sx, sy), (sx, sy + 1), (sx - st, sy + 2)]
        hx, hy = sx - st * 2, sy + 3
    elif how == "up":
        pts = [(sx, sy - 1), (sx + st, sy - 2), (sx + st, sy - 3), (sx + st, sy - 4)]
        hx, hy = sx + st * 2, sy - 6
    elif how == "wave":
        pts = [(sx, sy - 1), (sx + st, sy - 2), (sx + st * 2, sy - 3)]
        hx, hy = sx + st * 3, sy - 5
    else:
        return
    # in the shade red, not the outline's wine: a wine arm is lost on the
    # dark mode's charcoal, and this one reads on white and on charcoal
    for (x, y) in pts:
        px(g, x, y, "D")
    # the hand: two by two, lit on the side towards the body
    x0 = hx - 1 if L else hx
    paste(g, ["DD", "DD"], x0, hy)
    px(g, x0 + (1 if L else 0), hy, "A")


def hshadow(g, w, y=20):
    """The floor under it: a short dark bar that shrinks when it hops."""
    paste(g, ["D" * w], 12 - w // 2, y)


def hpose(arms=("down", "down"), look="open", dy=0, big=False, over=None, front=None, glance=0, floor=8, mouth=None):
    g = blank(24, 24)
    if floor:
        hshadow(g, floor)
    heart(g, big, dy)
    harm(g, "L", arms[0], dy); harm(g, "R", arms[1], dy)
    hface(g, look, dy, glance, mouth)
    if front:
        paste(g, front[0], front[1], front[2])
    if over:
        paste(g, over[0], over[1], over[2])
    return g


def small_heart(look="open", glance=0, beat=False, face=True):
    """The 16-pixel head: the thinking mark, the slow one and the header's."""
    g = copy(HHEAD_BIG_LIT if beat else HHEAD_LIT)
    if not face:
        return g
    x0 = 5 + glance
    if look == "shut":
        paste(g, ["CC"], x0 - 1, 6); paste(g, ["CC"], x0 + 5, 6)
    else:
        paste(g, ["C", "C"], x0, 5); paste(g, ["C", "C"], x0 + 5, 5)
    px(g, 7, 8, "C"); px(g, 8, 8, "C")
    return g


def cr_think():
    """Waiting on an answer: it looks one way, then the other, and beats."""
    return [small_heart(), small_heart(glance=-1, beat=True), small_heart(),
            small_heart(glance=1, beat=True), small_heart(look="shut"), small_heart()], 15


def cr_slow():
    """Past eight seconds: eyes shut, and the z rises. The head sits a pixel
    lower and to the left here, so the z has sky to rise in rather than a
    lobe to write over."""
    out = []
    for i in range(4):
        g = shift(small_heart(look="shut"), -1, 2)
        if i in (0, 1):
            paste(g, ["LLL", "..L", ".L.", "LLL"], 12, 1 - i)
        if i in (1, 2):
            paste(g, ["WW", ".W", "WW"], 10, 3 - i)
        out.append(g)
    return out, 42


def cr_orb():
    """The mark in the header: a heart that beats - lub, dub, and a rest -
    with its glint. No face: at the header's size a face is a smudge."""
    beats = (False, True, False, True, False, False, False, False)
    return [small_heart(beat=b, face=False) for b in beats], [6, 6, 6, 6, 18, 18, 18, 18]


def cr_hero():
    """An empty thread opens on this: the heart, waving."""
    star = [".W.", "WWW", ".W."]
    return [
        hpose(("down", "down")),
        hpose(("down", "wave"), over=(star, 1, 4)),
        hpose(("down", "up")),
        hpose(("down", "wave"), over=(star, 1, 4)),
        hpose(("down", "up"), "shut"),
        hpose(("down", "down"), big=True),
        hpose(("down", "down")),
        hpose(("down", "down"), over=(star, 1, 4)),
    ], 18


def cr_pet_idle():
    """Standing about: still, a blink, and every so often a heartbeat - lub,
    dub - which is the most a thing in the corner of an afternoon should do."""
    return [hpose(), hpose(big=True), hpose(), hpose(big=True), hpose(), hpose(look="shut"), hpose()], \
           [150, 7, 7, 7, 120, 12, 60]


def cr_pet_cheer():
    star = [".W.", "WWW", ".W."]
    return [
        hpose(("up", "up"), "happy"),
        hpose(("up", "up"), "happy", dy=-2, over=(star, 1, 2), floor=6),
        hpose(("up", "up"), "happy", dy=-2, over=(star, 20, 3), floor=6),
        hpose(("up", "up"), "happy", dy=-2, over=(star, 1, 2), floor=6),
        hpose(("up", "up"), "happy"),
        hpose(),
    ], [10, 10, 10, 10, 12, 30]


def cr_pet_worry():
    """Something is overdue: a small shuffle and one amber mark beside it."""
    bang = ["YY", "YY", "YY", "..", "YY"]
    out = []
    for i, mark in enumerate((True, True, False, True)):
        out.append(hpose(("out", "out"), "small", glance=(-1 if i % 2 else 0), over=(bang, 21, 1) if mark else None))
    return out, [26, 26, 20, 26]


def cr_pet_nap():
    zed = ["LLL", "..L", ".L.", "LLL"]
    return [
        hpose(look="shut", dy=1, over=(zed, 20, 0)),
        hpose(look="shut", dy=1, over=(zed, 20, -1)),
        hpose(look="shut", dy=1, over=(["WW", ".W", "WW"], 20, 1)),
        hpose(look="shut", dy=1),
    ], [70, 70, 70, 90]


def cr_pet_work():
    """A save or a script going out: it holds a record and stamps it."""
    card = ["LLLLL", "LSSSL", "LSSSL", "LLLLL"]
    done = ["LLLLL", "LSGSL", "LGSGL", "LLLLL"]
    return [
        hpose(("out", "out"), front=(card, 9, 15)),
        hpose(("out", "out"), dy=-1, front=(card, 9, 14)),
        hpose(("out", "out"), "happy", front=(done, 9, 15)),
        hpose(("out", "out"), "happy", front=(done, 9, 15)),
    ], [16, 12, 16, 26]


def cr_pet_stretch():
    return [
        hpose(),
        hpose(("up", "up"), "shut"),
        hpose(("up", "up"), "shut", dy=-1, big=True, over=(["LL", "..", "LL"], 20, 2)),
        hpose(("up", "up"), "shut", dy=-1, big=True, over=(["LL", "..", "LL"], 20, 1)),
        hpose(("up", "up")),
        hpose(),
    ], [24, 24, 40, 40, 24, 60]


def cr_pet_held():
    return [
        hpose(("up", "up"), "wide", dy=-1, floor=6),
        hpose(("up", "up"), "wide", floor=8),
        hpose(("up", "up"), "wide", dy=-1, floor=6),
        hpose(("up", "up"), "wide", dy=1, floor=8),
    ], 9


SPRITES_CRIMSON = [
    ("think", cr_think, True),
    ("slow",  cr_slow,  True),
    ("orb",   cr_orb,   True),
    ("hero",  cr_hero,  True),
    ("done",  sprite_done, False),
    ("no",    sprite_no,   False),
    ("oops",  sprite_oops, True),
    ("ask",   sprite_ask,  True),
    ("new",   sprite_new,  True),
    ("pet-idle",    cr_pet_idle,    True),
    ("pet-cheer",   cr_pet_cheer,   True),
    ("pet-worry",   cr_pet_worry,   True),
    ("pet-nap",     cr_pet_nap,     True),
    ("pet-work",    cr_pet_work,    True),
    ("pet-stretch", cr_pet_stretch, True),
    ("pet-held",    cr_pet_held,    True),
]


# ═══ the third character: the neon cat, for the Neon skin and look ══════════
# Neon is black, yellow and cyan with a hot red, after the neon-and-chrome
# look of cyberpunk stories, and its character is a small yellow cat with a
# visor: a band of dark glass across its eyes in which two cyan eyes (or a
# scanning light, while it thinks) glow. Same sixteen names, sizes and timing
# as the robot's and the heart's, so the app shows whichever set it is asked
# for with no other change - the chat skin's, or the one picked for the pet.
#
# The same sixteen letters again; only what they mean changes. Yellow reads
# on white and on near-black alike, the outline is a deep violet rather than
# black, and the visor is the darkest thing in the drawing so the cyan in it
# glows on either.
PAL_NEON = [
    ("." , (0xF5, 0xE1, 0x0A)),   # 0  transparent (filled with the body yellow)
    ("K" , (0x1B, 0x10, 0x2E)),   # 1  outline, deep violet
    ("D" , (0xC2, 0xA4, 0x00)),   # 2  shade
    ("B" , (0xF5, 0xE1, 0x0A)),   # 3  body yellow
    ("A" , (0xFF, 0xF3, 0x6A)),   # 4  lit yellow
    ("L" , (0xFF, 0xF7, 0xB8)),   # 5  pale yellow: paws, the z
    ("W" , (0xFF, 0xFD, 0xF0)),   # 6  white
    ("C" , (0x00, 0xE5, 0xF5)),   # 7  cyan: the eyes, the whiskers
    ("G" , (0x22, 0xD9, 0x86)),   # 8  green, a yes
    ("Y" , (0xFF, 0xB8, 0x1F)),   # 9  amber
    ("O" , (0xFF, 0x7A, 0x1F)),   # 10 orange
    ("R" , (0xFF, 0x2A, 0x6D)),   # 11 hot red: the nose, the collar
    ("P" , (0xC0, 0x3C, 0xFF)),   # 12 magenta: inside the ears, the tail tip
    ("S" , (0x7D, 0x80, 0x9C)),   # 13 slate, a left-alone
    ("E" , (0x0E, 0x9F, 0x6E)),   # 14 deep green
    ("N" , (0x30, 0x23, 0x52)),   # 15 the visor glass: violet, so it is not a
                                  #    hole in the head on a near-black panel
]
OUT_NEON = os.path.join(OUT, "neon")

CAT = grid([
    "........................",
    ".....KK..........KK.....",
    "....KPBK........KBPK....",
    "....KPBBK......KBBPK....",
    "....KBBBBKKKKKKBBBBK....",
    "....KBABBBBBBBBBBBBK....",
    "....KABBBBBBBBBBBBBK....",
    "....KNNNNNNNNNNNNNNK....",
    "....KNNNNNNNNNNNNNNK....",
    "....KNNNNNNNNNNNNNNK....",
    "....KBBBBBBRRBBBBBBK....",
    "....KBBBBBKBBKBBBBBK....",
    ".....KBBBBBKKBBBBBK.....",
    "......KKKKKKKKKKKK......",
    ".......KRRRRRRRRK.......",
    "......KBBBBBBBBBBK......",
    "......KBBBBAABBBBK......",
    "......KBBBBBBBBBBK......",
    "......KBBDBBBBDBBK......",
    "......KBBDBBBBDBBK......",
    "......KLLKBBBBKLLK......",
    "......KKKK....KKKK......",
    "......DDDDDDDDDDDD......",
    "........................",
])
CAT_HEAD = grid([
    "................",
    "..KK........KK..",
    ".KPBK......KBPK.",
    ".KPBBKKKKKKBBPK.",
    ".KBABBBBBBBBBBK.",
    ".KNNNNNNNNNNNNK.",
    ".KNNNNNNNNNNNNK.",
    ".KNNNNNNNNNNNNK.",
    ".KBBBBBRRBBBBBK.",
    ".KBBBBKBBKBBBBK.",
    "..KBBBBKKBBBBK..",
    "...KKKKKKKKKK...",
    "................",
    "................",
    "................",
    "................",
])


def visor(g, how="open", y0=7, x0=5, w=14, glance=0, scan=None):
    """What shows in the dark glass: two cyan eyes (open, shut, wide,
    happy), or a bar of light sweeping across it while it thinks."""
    if scan is not None:
        for dx in (-1, 0, 1):
            x = x0 + scan + dx
            if x0 <= x < x0 + w:
                for y in range(y0, y0 + 3):
                    g[y][x] = "C" if dx == 0 else ("C" if y == y0 + 1 else g[y][x])
        return g
    left, right = x0 + 2 + glance, x0 + w - 4 + glance
    if how == "shut":
        paste(g, ["CC"], left, y0 + 2); paste(g, ["CC"], right, y0 + 2)
    elif how == "happy":
        for x in (left, right):
            paste(g, ["CC"], x, y0); px(g, x - 1, y0 + 1, "C"); px(g, x + 2, y0 + 1, "C")
    elif how == "wide":
        paste(g, ["CC", "CC", "CC"], left, y0); paste(g, ["CC", "CC", "CC"], right, y0)
    elif how == "small":
        paste(g, ["C"], left + 1, y0 + 1); paste(g, ["C"], right, y0 + 1)
    else:
        paste(g, ["CC", "CC"], left, y0); paste(g, ["CC", "CC"], right, y0)
    return g


def whiskers(g, y=10, dy=0):
    for x in (1, 2, 21, 22):
        px(g, x, y + dy, "C")
    px(g, 2, y + 1 + dy, "C"); px(g, 21, y + 1 + dy, "C")


def tail(g, how="up", dy=0):
    """It curls up beside the body on the right, with a magenta tip."""
    if how == "up":
        pts = [(18, 19), (19, 18), (19, 17), (20, 16), (20, 15), (20, 14)]
        tip = (20, 13)
    elif how == "flick":
        pts = [(18, 19), (19, 18), (20, 17), (21, 16), (21, 15)]
        tip = (22, 14)
    else:                                     # down, along the floor
        pts = [(18, 20), (19, 20), (20, 20), (21, 19)]
        tip = (22, 18)
    # in the shade yellow, not the outline: a violet line is lost on a dark
    # panel, and this one reads on white and on near-black
    for (x, y) in pts:
        px(g, x, y + dy, "D")
    px(g, tip[0], tip[1] + dy, "P")


def paw(g, side, how="down", dy=0):
    """A front leg and a pale paw: down by the body, out to hold something,
    up over the head, or a wave."""
    L = side == "L"
    st = -1 if L else 1
    sx = (5 if L else 18)
    sy = 15 + dy
    if how == "down":
        return                                # the legs are in the drawing
    if how == "out":
        pts = [(sx, sy), (sx + st * 0, sy + 1)]
        hand = (sx - (1 if L else 0) + (2 if L else -1), sy + 2)
    elif how == "up":
        pts = [(sx, sy - 1), (sx + st, sy - 2), (sx + st, sy - 3), (sx + st, sy - 4)]
        hand = (sx + st * 2 - (1 if L else 0), sy - 6)
    elif how == "wave":
        pts = [(sx, sy - 1), (sx + st, sy - 2), (sx + st * 2, sy - 3)]
        hand = (sx + st * 3 - (1 if L else 0), sy - 5)
    else:
        return
    for (x, y) in pts:
        px(g, x, y, "D")
    paste(g, ["LL", "LL"], hand[0], hand[1])


def cat_pose(look="open", dy=0, arms=("down", "down"), over=None, front=None, glance=0,
             tl="up", floor=True, scan=None):
    g = blank(24, 24)
    for y, row in enumerate(CAT):
        for x, ch in enumerate(row):
            if ch == "D" and y == 22 and not floor:
                continue
            if ch != "." and 0 <= y + (dy if y < 22 else 0) < 24:
                g[y + (dy if y < 22 else 0)][x] = ch
    visor(g, look, 7 + dy, 5, 14, glance, scan)
    whiskers(g, 10, dy)
    tail(g, tl, dy)
    paw(g, "L", arms[0], dy); paw(g, "R", arms[1], dy)
    if front:
        paste(g, front[0], front[1], front[2])
    if over:
        paste(g, over[0], over[1], over[2])
    return g


def cat_head(look="open", glance=0, scan=None, blink_glow=False):
    g = copy(CAT_HEAD)
    if scan is not None:
        visor(g, scan=scan, y0=5, x0=2, w=12)
    else:
        visor(g, look, 5, 2, 12, glance)
    px(g, 0, 8, "C"); px(g, 15, 8, "C")
    return g


def nn_think():
    """Waiting on an answer: a light sweeps across the visor, there and back."""
    return [cat_head(scan=s) for s in (1, 3, 5, 7, 9, 11, 9, 7, 5, 3)], 9


def nn_slow():
    out = []
    for i in range(4):
        g = cat_head(look="shut")
        g = shift(g, -1, 2)
        if i in (0, 1):
            paste(g, ["LLL", "..L", ".L.", "LLL"], 12, 1 - i)
        if i in (1, 2):
            paste(g, ["WW", ".W", "WW"], 10, 3 - i)
        out.append(g)
    return out, 42


def nn_orb():
    """The mark in the header: the cat's head, its eyes looking about and a
    blink - no sweep here, which at the header's size is a flicker."""
    return [cat_head(), cat_head(glance=-1), cat_head(), cat_head(glance=1), cat_head(look="shut"), cat_head()], \
           [90, 30, 60, 30, 10, 60]


def nn_hero():
    star = [".W.", "WWW", ".W."]
    spark = [".C.", "CCC", ".C."]
    return [
        cat_pose(),
        cat_pose(arms=("down", "wave"), over=(star, 1, 3), tl="flick"),
        cat_pose(arms=("down", "up")),
        cat_pose(arms=("down", "wave"), over=(spark, 1, 3), tl="flick"),
        cat_pose("shut", arms=("down", "up")),
        cat_pose("happy"),
        cat_pose(),
        cat_pose(over=(star, 1, 3), tl="flick"),
    ], 18


def nn_ask():
    """Its bubble is yellow, so the question mark in it is the outline's
    violet: a white one on yellow is barely there."""
    frames, delay = sprite_ask()
    return [[[("B" if c == "A" else ("K" if c == "W" else c)) for c in row] for row in f] for f in frames], delay


def nn_new():
    """The arrow in hot red: pale yellow on a white panel is barely there."""
    frames, delay = sprite_new()
    return [[[("R" if c == "A" else c) for c in row] for row in f] for f in frames], delay


def nn_pet_idle():
    """Standing about: still, a blink, a flick of the tail."""
    return [cat_pose(), cat_pose("shut"), cat_pose(), cat_pose(tl="flick"), cat_pose()], [170, 12, 120, 30, 60]


def nn_pet_cheer():
    star = [".W.", "WWW", ".W."]
    spark = [".C.", "CCC", ".C."]
    return [
        cat_pose("happy", arms=("up", "up")),
        cat_pose("happy", dy=-2, arms=("up", "up"), over=(star, 1, 2), floor=False, tl="flick"),
        cat_pose("happy", dy=-2, arms=("up", "up"), over=(spark, 20, 2), floor=False, tl="flick"),
        cat_pose("happy", dy=-2, arms=("up", "up"), over=(star, 1, 2), floor=False),
        cat_pose("happy", arms=("up", "up")),
        cat_pose(),
    ], [10, 10, 10, 10, 12, 30]


def nn_pet_worry():
    bang = ["RR", "RR", "RR", "..", "RR"]
    out = []
    for i, mark in enumerate((True, True, False, True)):
        out.append(cat_pose("small", arms=("out", "out"), glance=(-1 if i % 2 else 0), tl="down",
                            over=(bang, 21, 1) if mark else None))
    return out, [26, 26, 20, 26]


def nn_pet_nap():
    zed = ["LLL", "..L", ".L.", "LLL"]
    return [
        cat_pose("shut", dy=1, tl="down", over=(zed, 20, 0)),
        cat_pose("shut", dy=1, tl="down", over=(zed, 20, -1)),
        cat_pose("shut", dy=1, tl="down", over=(["WW", ".W", "WW"], 20, 1)),
        cat_pose("shut", dy=1, tl="down"),
    ], [70, 70, 70, 90]


def nn_pet_work():
    card = ["SSSSS", "SWWWS", "SWWWS", "SSSSS"]
    done = ["SSSSS", "SWGWS", "SGWGS", "SSSSS"]
    return [
        cat_pose(arms=("out", "out"), front=(card, 9, 16)),
        cat_pose(arms=("out", "out"), dy=-1, front=(card, 9, 15)),
        cat_pose("happy", arms=("out", "out"), front=(done, 9, 16)),
        cat_pose("happy", arms=("out", "out"), front=(done, 9, 16)),
    ], [16, 12, 16, 26]


def nn_pet_stretch():
    return [
        cat_pose(),
        cat_pose("shut", arms=("up", "up")),
        cat_pose("shut", dy=-1, arms=("up", "up"), tl="flick", over=(["LL", "..", "LL"], 20, 2)),
        cat_pose("shut", dy=-1, arms=("up", "up"), tl="flick", over=(["LL", "..", "LL"], 20, 1)),
        cat_pose(arms=("up", "up")),
        cat_pose(),
    ], [24, 24, 40, 40, 24, 60]


def nn_pet_held():
    return [
        cat_pose("wide", dy=-1, arms=("up", "up"), tl="down", floor=False),
        cat_pose("wide", arms=("up", "up"), tl="down"),
        cat_pose("wide", dy=-1, arms=("up", "up"), tl="down", floor=False),
        cat_pose("wide", dy=1, arms=("up", "up"), tl="down"),
    ], 9


SPRITES_NEON = [
    ("think", nn_think, True),
    ("slow",  nn_slow,  True),
    ("orb",   nn_orb,   True),
    ("hero",  nn_hero,  True),
    ("done",  sprite_done, False),
    ("no",    sprite_no,   False),
    ("oops",  sprite_oops, True),
    ("ask",   nn_ask,   True),
    ("new",   nn_new,   True),
    ("pet-idle",    nn_pet_idle,    True),
    ("pet-cheer",   nn_pet_cheer,   True),
    ("pet-worry",   nn_pet_worry,   True),
    ("pet-nap",     nn_pet_nap,     True),
    ("pet-work",    nn_pet_work,    True),
    ("pet-stretch", nn_pet_stretch, True),
    ("pet-held",    nn_pet_held,    True),
]

# ═══ the contact sheet ══════════════════════════════════════════════════════
def png(path, w, h, rgb_rows):
    """A plain 8-bit RGB PNG, so every frame can be looked at without a
    decoder that has to be installed first."""
    raw = b"".join(b"\x00" + bytes(row) for row in rgb_rows)

    def chunk(tag, data):
        c = tag + data
        return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c) & 0xFFFFFFFF)

    out = b"\x89PNG\r\n\x1a\n"
    out += chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
    out += chunk(b"IDAT", zlib.compress(raw, 9))
    out += chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(out)


def contact_sheet(path, drawn, pal=None):
    pal = pal or PAL
    scale, pad = 8, 6
    cell = 24 * scale + pad
    cols = max(len(fr) for _, fr, _, _ in drawn)
    band = cell + pad
    w = pad + cols * cell
    h = pad + len(drawn) * band * 2
    dark, light = (11, 18, 32), (247, 248, 250)
    rows = [[0] * (w * 3) for _ in range(h)]

    def put(x0, y0, frame, bg):
        fh, fw = len(frame), len(frame[0])
        for y in range(fh * scale):
            for x in range(fw * scale):
                ch = frame[y // scale][x // scale]
                col = bg if ch == "." else pal[IDX[ch]][1]
                px_x, px_y = x0 + x, y0 + y
                if 0 <= px_y < h and 0 <= px_x < w:
                    rows[px_y][px_x * 3:px_x * 3 + 3] = list(col)

    y = pad
    for name, frames, _, _ in drawn:
        for bg in (dark, light):
            for x in range(w):
                for yy in range(y, min(y + cell, h)):
                    rows[yy][x * 3:x * 3 + 3] = list(bg)
            for i, fr in enumerate(frames):
                put(pad + i * cell, y + pad // 2, fr, bg)
            y += band
    png(path, w, h, rows)


# ═══ run ════════════════════════════════════════════════════════════════════
def write_set(sprites, out_dir, sheet, pal):
    if not os.path.isdir(out_dir):
        os.makedirs(out_dir)
    drawn, sizes = [], []
    for name, fn, loop in sprites:
        frames, delay = fn()
        data = gif([to_indices(f) for f in frames], delay, loop, pal)
        with open(os.path.join(out_dir, name + ".gif"), "wb") as f:
            f.write(data)
        drawn.append((name, frames, delay, loop))
        sizes.append(len(data))
        print("%-12s %2d frames  %4d bytes  %s" %
              (os.path.relpath(os.path.join(out_dir, name), OUT), len(frames), len(data), "loop" if loop else "once"))
    contact_sheet(sheet, drawn, pal)
    return sizes


def main():
    sizes = write_set(SPRITES, OUT, os.path.join(HERE, "contact-sheet.png"), PAL)
    sizes += write_set(SPRITES_CRIMSON, OUT_CRIMSON, os.path.join(HERE, "contact-sheet-crimson.png"), PAL_CRIMSON)
    sizes += write_set(SPRITES_NEON, OUT_NEON, os.path.join(HERE, "contact-sheet-neon.png"), PAL_NEON)
    total = sum(sizes)
    print("total %d bytes, %d as base64" % (total, int(total * 4 / 3)))
    print("now: python3 art/embed-pixel-art.py")


if __name__ == "__main__":
    main()
