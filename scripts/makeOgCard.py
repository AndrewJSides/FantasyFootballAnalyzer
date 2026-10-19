#!/usr/bin/env python3
"""Regenerate public/og.png (1200x630 share card) in the GRIDIRON palette.

Linux port of scripts/makeBrandAssets.ps1's og.png section (the .ps1 needs
Windows-only System.Drawing). Reuses the gorilla emoji pixels from the
previous card since no color-emoji font is installed here.

Kicker copy is the source of truth for the tagline — the repo is private,
so "OPEN SOURCE" must never reappear here.
"""
from PIL import Image, ImageDraw, ImageFont

INK = (10, 10, 10)
INK2 = (20, 20, 18)
LIME = (166, 226, 46)
BONE = (232, 226, 212)
BONE_DIM = (138, 132, 120)

W, H = 1200, 630
KICKER = "FREE / NO ACCOUNTS / NO SIGN-UP"
HEADLINE = "TRADERAPE"
SUB = "Draft room - grades - trades - waivers - luck - awards"

img = Image.new("RGB", (W, H), INK)
d = ImageDraw.Draw(img)

# Faint yard-line grid
for x in range(0, W + 1, 60):
    d.line([(x, 0), (x, H)], fill=INK2, width=2)
for y in range(0, H + 1, 60):
    d.line([(0, y), (W, y)], fill=INK2, width=2)

# Lime frame
d.rectangle([24, 24, 24 + 1152, 24 + 582], outline=LIME, width=8)

# Gorilla emoji: lifted from the previous card (no emoji font on this box)
prev = Image.open("public/og.png")
img.paste(prev.crop((80, 100, 120, 155)), (80, 100))

# Kicker
kicker_font = ImageFont.truetype(
    "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf", 24)
d.text((130, 106), KICKER, font=kicker_font, fill=LIME)

# Headline
title_font = ImageFont.truetype(
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 82)
d.text((66, 218), HEADLINE, font=title_font, fill=BONE)

# Bone rule above sub line
d.rectangle([80, 470, 80 + 1040, 470 + 4], fill=BONE)

# Sub line
sub_font = ImageFont.truetype(
    "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf", 26)
d.text((80, 496), SUB, font=sub_font, fill=BONE_DIM)

img.save("public/og.png")
print("Wrote public/og.png")
