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


def gif(frames, delay_cs, loop=True):
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
    for _, (r, g, b) in PAL:
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


def contact_sheet(path, drawn):
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
                col = bg if ch == "." else PAL[IDX[ch]][1]
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
def main():
    if not os.path.isdir(OUT):
        os.makedirs(OUT)
    drawn, b64 = [], []
    import base64
    for name, fn, loop in SPRITES:
        frames, delay = fn()
        data = gif([to_indices(f) for f in frames], delay, loop)
        path = os.path.join(OUT, name + ".gif")
        with open(path, "wb") as f:
            f.write(data)
        drawn.append((name, frames, delay, loop))
        b64.append((name, base64.b64encode(data).decode("ascii"), len(data)))
        print("%-6s %2d frames  %4d bytes  %s" %
              (name, len(frames), len(data), "loop" if loop else "once"))

    contact_sheet(os.path.join(HERE, "contact-sheet.png"), drawn)

    total = sum(s for _, _, s in b64)
    print("total %d bytes, %d as base64" % (total, int(total * 4 / 3)))
    print("now: python3 art/embed-pixel-art.py")


if __name__ == "__main__":
    main()
