"""
make_vista_dome.py — rebuild the key-art vista plate as a FULL-SPHERE
equirect dome texture, so the far scenery has no edge at any heading.

Run:  python3 tools/make_vista_dome.py

Input : src/assets/textures/keyart-vista-plate.png (the painting with its own
        gate/fox patched out; rows v 0.50..0.97 = sky -> horizon glow).
Output: src/assets/textures/vista-dome.png (2048x1024 equirect):
          v 0.00-0.08  zenith gradient (palette skyZenith -> painting sky)
          v 0.08-0.60  the painting band (sky -> horizon glow)
          v 0.60-0.85  horizon glow -> snow haze gradient
          v 0.85-1.00  flat snow haze (below the horizon, hidden by ground)

The horizontal wrap is mirrored in the shader (MirroredRepeatWrapping x3),
so this texture needs no left/right seam handling here.
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src" / "assets" / "textures" / "keyart-vista-plate.png"
DST = ROOT / "src" / "assets" / "textures" / "vista-dome.png"

W, H = 2048, 1024
SKY_ZENITH = (1, 82, 175)      # PALETTE.skyZenith
SNOW_HAZE = (240, 243, 250)    # PALETTE.snowWhite

# PIL row fractions (0 = image top). three.js texture v=1 is the image top,
# so the original vista band (v 0.50..0.97) = plate rows 0.03..0.50 here:
# painting sky -> peaks -> horizon glow. Rows below 0.50 hold the painting's
# own fox/gate/snowfield and must NEVER reach the dome.
PAINT_TOP_SRC = 0.03
PAINT_BOT_SRC = 0.45
PAINT_TOP_DST = 0.08
PAINT_BOT_DST = 0.60
HAZE_END = 0.85


def lerp(a: tuple[int, ...], b: tuple[int, ...], t: float) -> tuple[int, ...]:
    return tuple(round(x + (y - x) * t) for x, y in zip(a, b))


def row_average(im: Image.Image, v: float) -> tuple[int, ...]:
    """Average color of one plate row — the gradient anchors."""
    y = min(im.height - 1, max(0, round(v * (im.height - 1))))
    px = im.load()
    r = g = b = 0
    for x in range(0, im.width, 8):
        p = px[x, y]
        r += p[0]
        g += p[1]
        b += p[2]
    n = len(range(0, im.width, 8))
    return (r // n, g // n, b // n)


def main() -> None:
    plate = Image.open(SRC).convert("RGB")
    band = plate.crop((0, round(PAINT_TOP_SRC * plate.height),
                       plate.width, round(PAINT_BOT_SRC * plate.height)))
    band_h = round((PAINT_BOT_DST - PAINT_TOP_DST) * H)
    band = band.resize((W, band_h), Image.LANCZOS)

    sky_top = row_average(plate, PAINT_TOP_SRC)
    horizon = row_average(plate, PAINT_BOT_SRC)

    dome = Image.new("RGB", (W, H))
    dome.paste(band, (0, round(PAINT_TOP_DST * H)))

    col = Image.new("RGB", (1, H))
    px = col.load()
    for y in range(H):
        v = y / (H - 1)
        if v < PAINT_TOP_DST:
            px[0, y] = lerp(SKY_ZENITH, sky_top, v / PAINT_TOP_DST)
        elif v <= PAINT_BOT_DST:
            px[0, y] = horizon  # covered by the band paste anyway
        elif v < HAZE_END:
            px[0, y] = lerp(horizon, SNOW_HAZE, (v - PAINT_BOT_DST) / (HAZE_END - PAINT_BOT_DST))
        else:
            px[0, y] = SNOW_HAZE
    col = col.resize((W, H), Image.NEAREST)

    # Composite: gradient everywhere, painting band pasted on top.
    mask = Image.new("L", (W, H), 0)
    band_mask = Image.new("L", (W, band_h), 255)
    mask.paste(band_mask, (0, round(PAINT_TOP_DST * H)))
    dome = Image.composite(dome, col, mask)

    dome.save(DST, optimize=True)
    print(f"vista dome -> {DST} ({dome.size[0]}x{dome.size[1]})")


if __name__ == "__main__":
    main()
