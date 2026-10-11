#!/usr/bin/env bash
#
# Slices the pixel-art sheet into the sprites FlappyGameScene loads.
#
# This SUPERSEDES scripts/slice-flappy-sheet.sh, which cut the painterly art the game used
# before the pixel restyle. That script and its sheets are kept -- the art is still in
# assets-src/ -- but nothing loads its output any more, and the two write to different
# directories on purpose so neither can clobber the other.
#
# Like its predecessor this is a MANUAL regeneration script whose output is committed;
# `npm run build` never calls it.
#
#   ./scripts/slice-flappy-pixel-sheet.sh
#
# Requires ImageMagick 7 (`brew install imagemagick`).
#
# Three things make this script much simpler than the painterly one:
#
#   1. The sheet already has a real alpha channel (it was background-removed before it reached
#      us), so there is no keying pass to reconstruct transparency.
#   2. Nothing is rescaled. Pixel art resampled by a non-integer factor gets an uneven grid --
#      some source pixels land on two screen pixels and their neighbours on one -- so every cut
#      below is a 1:1 crop, padded into its cell rather than fitted to it. The game scales the
#      result at draw time with nearest-neighbour filtering.
#   3. Cells therefore do NOT share a scale, unlike the chick sheet's frames. Here the poses are
#      meant to differ in size: the collapsed bird IS smaller than the flying one.
#
# What the sheet does not have, and so is drawn here instead: heart icons, a score plate, and a
# standalone shield bubble. Those are authored as pixel patterns at the bottom of this script,
# which keeps the HUD in the same visual language as the world.

set -euo pipefail

cd "$(dirname "$0")/.."

SRC="assets-src/games/flappy/pixel_sheet.png"
OUT="public/assets/games/flappy/pixel"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

command -v magick >/dev/null || { echo "ImageMagick 7 (magick) not found" >&2; exit 1; }
[ -f "$SRC" ] || { echo "missing source sheet: $SRC" >&2; exit 1; }

mkdir -p "$OUT"

# Every crop below is a box found by connected-component analysis and then PADDED BY 2px on
# each side. The padding is not cosmetic: the component pass thresholds alpha at 40%, so the
# boxes it reports stop just inside each sprite's soft fringe, and cutting on them shaved a
# pixel off every sprite in the sheet. Two pixels is comfortably more than the fringe and still
# far less than the gap between cells, so nothing picks up its neighbour.
#
# The captions under each item are OUTSIDE these boxes -- they are separate blobs, far enough
# below the art that the padding cannot reach them -- which is why no caption-stripping step is
# needed.
BIRD="105x75+122+212"
BIRD_STUNNED="101x73+124+619"
BIRD_FATIGUED="73x56+1236+635"
BIRD_SHIELDED="107x96+992+603"
COIN="89x92+916+203"
# The first cloud cell holds TWO drawings, a large cloud with a small one tucked above and to
# its right. The component pass reports them as separate blobs and the first version of this
# box took only the large one, which sliced the small cloud in half down its middle. This is
# their union (x 95..253), padded.
CLOUD_1="162x91+93+338"
CLOUD_2="170x79+345+354"
CLOUD_3="157x80+620+350"
BUILDING="83x66+1219+364"
GROUND_TILE="148x59+357+497"
# The lower pipe is a wide rim over a narrower shaft: rows 0-43 are 106px across, rows 44+ are
# 96px inset by 5. Both are cut at the full 106 width so their transparent margins line up when
# the renderer stacks a body under a cap.
# Padded on three sides only: the bottom edge is the seam with the shaft and is exact, not a
# fringe -- padding it would pull shaft into the cap and show a rim halfway down the pipe.
PIPE_CAP="110x46+645+212"
PIPE_BODY="110x6+645+274"

# Named cut_box, not cut: a function called `cut` would shadow the coreutils command this
# script also pipes through when sampling the sky colours.
cut_box() { # <geometry> <out>
  magick "$SRC" -crop "$1" +repage "$2"
}

# ---------------------------------------------------------------------------
# 1. Bird poses -- four uniform cells
# ---------------------------------------------------------------------------
# The renderer indexes these by number: 0 flight, 1 fall, 2 knocked out, 3 shielded. Flight is a
# single frame, so there is no wingbeat: the sheet has one flying pose and the bird's motion
# comes from its pitch instead, as it did in the game this art is drawn after.
#
# Bottom-aligned within the cell for the same reason the painterly sheet was: the collapsed pose
# is shorter than the others, and centring it would leave the bird hovering above the ground at
# the exact moment it is supposed to be lying on it.
CHICK_CELL=112
CHICK_PAD=3

i=0
for box in "$BIRD" "$BIRD_STUNNED" "$BIRD_FATIGUED" "$BIRD_SHIELDED"; do
  cut_box "$box" "$TMP/pose.png"
  magick "$TMP/pose.png" \
    -background none -gravity South -extent "${CHICK_CELL}x$((CHICK_CELL - CHICK_PAD))" \
    -background none -gravity North -extent "${CHICK_CELL}x${CHICK_CELL}" \
    "$(printf '%s/chick_%02d.png' "$TMP" "$i")"
  i=$((i + 1))
done
magick "$TMP"/chick_*.png +append -background none "$OUT/chick.png"
echo "chick: 4 poses, cell ${CHICK_CELL}px (flight, fall, ko, shielded)"

# ---------------------------------------------------------------------------
# 2. Pipes
# ---------------------------------------------------------------------------
cut_box "$PIPE_CAP" "$OUT/pipe_cap.png"
cut_box "$PIPE_BODY" "$OUT/pipe_body.png"

# ---------------------------------------------------------------------------
# 3. Coin spin -- four frames from one drawing
# ---------------------------------------------------------------------------
# The sheet has a single coin, so the spin is synthesized by squeezing it horizontally: a coin
# turning about its vertical axis is exactly a circle narrowing to an edge, which is why this
# trick is as old as the arcade. Widths are a cosine sampled at four phases, near enough.
#
# Centred, not bottom-aligned: a coin spins on the spot. Each frame is padded back to the full
# cell so the narrow frames do not stretch to fill it.
COIN_CELL=96
coin_w=$(magick "$SRC" -crop "$COIN" +repage -format "%w" info:)
ci=0
for pct in 100 62 28 62; do
  cut_box "$COIN" "$TMP/coin_src.png"
  magick "$TMP/coin_src.png" \
    -filter point -resize "$(( coin_w * pct / 100 ))x!" \
    -background none -gravity center -extent "${COIN_CELL}x${COIN_CELL}" \
    "$(printf '%s/coinf_%02d.png' "$TMP" "$ci")"
  ci=$((ci + 1))
done
magick "$TMP"/coinf_*.png +append -background none "$OUT/coin.png"
echo "coin: 4 frames, cell ${COIN_CELL}px (spin synthesized from one drawing)"

# ---------------------------------------------------------------------------
# 4. Ground and skyline
# ---------------------------------------------------------------------------
# The ground is NOT a true repeating tile, despite being labelled one on the sheet -- measured,
# its left and right columns differ on all 59 rows, and the grass pattern's best horizontal
# period (~51px) still mismatches badly, because the art was drawn rather than tiled. Copied out
# as-is it showed a hard vertical seam every time it wrapped.
#
# So it gets the same treatment the painterly strips get: shave the darker outermost columns
# (they are the drawing's own edge, and doubling them at a joint reads as a drawn-on line), then
# append a horizontally flipped copy. That makes the internal joint the strip's right edge
# against itself and the wrap its left edge against itself -- seamless by construction rather
# than by luck. The cost is mirror symmetry, which on grass and dirt is invisible.
cut_box "$GROUND_TILE" "$TMP/ground_raw.png"
# Shaved on all four sides, not just the two that matter for the joint. The top and bottom rows
# of the drawing are semi-transparent (alpha ~176 and ~148, measured) -- its own soft edge -- and
# a translucent row at the bottom of an opaque ground band let the pipe standing BEHIND the
# ground show through as a green sliver along the very bottom of the screen.
magick "$TMP/ground_raw.png" -shave 2x1 +repage "$TMP/ground_trim.png"
magick "$TMP/ground_trim.png" \( +clone -flop \) +append +repage -background none "$OUT/ground.png"

# There is no hillside in this sheet, so the mid-ground band becomes a skyline built from the
# one building cluster at alternating heights. Six copies, so the repeat is not obvious at the
# wrap, and the offsets are fixed rather than random so the output is reproducible.
cut_box "$BUILDING" "$TMP/building.png"
bw=$(magick "$TMP/building.png" -format "%w" info:)
bh=$(magick "$TMP/building.png" -format "%h" info:)
strip_w=$((bw * 6))
strip_h=$((bh + 14))
magick -size "${strip_w}x${strip_h}" xc:none "$TMP/skyline.png"
off=0
for dy in 14 4 10 0 12 6; do
  magick "$TMP/skyline.png" "$TMP/building.png" \
    -geometry "+$((off * bw))+${dy}" -compose over -composite "$TMP/skyline.png"
  off=$((off + 1))
done
cp "$TMP/skyline.png" "$OUT/hillside.png"
echo "skyline: ${strip_w}x${strip_h} from 6 buildings"

# ---------------------------------------------------------------------------
# 5. Cloud props
# ---------------------------------------------------------------------------
cut_box "$CLOUD_1" "$OUT/cloud_0.png"
cut_box "$CLOUD_2" "$OUT/cloud_1.png"
cut_box "$CLOUD_3" "$OUT/cloud_2.png"

# ---------------------------------------------------------------------------
# 6. Sky colours
# ---------------------------------------------------------------------------
# Sampled from the sheet's SKY PATCH rather than picked by eye, so the drawn sky and the art
# agree. Printed for the renderer to hardcode -- two ints are not worth an asset.
SKY_TOP=$(magick "$SRC" -crop "158x80+95+481" +repage -resize 1x8! -format "%[hex:p{0,0}]" info: | cut -c1-6)
SKY_BOTTOM=$(magick "$SRC" -crop "158x80+95+481" +repage -resize 1x8! -format "%[hex:p{0,7}]" info: | cut -c1-6)
echo "sky: set SKY_TOP = 0x${SKY_TOP}, SKY_BOTTOM = 0x${SKY_BOTTOM} in src/games/flappy/FlappyRenderer.ts"

# ---------------------------------------------------------------------------
# 7. HUD chrome and the shield bubble -- authored here, not cut
# ---------------------------------------------------------------------------
# The sheet carries no hearts, no score plate and no bubble on its own (only a bird already
# inside one). Rather than borrow the painterly versions -- soft painted icons directly above a
# hard pixel world -- they are drawn as pixel patterns.
#
# ImageMagick reads its own `txt:` pixel enumeration, so a pattern here is literally a picture
# you can read in the source. One character per pixel, expanded with nearest-neighbour.
draw_pattern() { # <out> <scale> <pattern on stdin>
  local out="$1" scale="$2" line y=0 w=0
  local -a rows=()
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    rows+=("$line")
    (( ${#line} > w )) && w=${#line}
  done
  {
    echo "# ImageMagick pixel enumeration: ${w},${#rows[@]},255,srgba"
    for line in "${rows[@]}"; do
      for (( x = 0; x < w; x++ )); do
        case "${line:x:1}" in
          K) echo "${x},${y}: (43,18,32,255)" ;;    # outline
          R) echo "${x},${y}: (232,69,95,255)" ;;   # heart body
          D) echo "${x},${y}: (179,44,69,255)" ;;   # shaded side
          W) echo "${x},${y}: (255,247,224,255)" ;; # highlight
          C) echo "${x},${y}: (255,235,184,255)" ;; # panel cream
          S) echo "${x},${y}: (214,180,120,255)" ;; # panel shaded edge
          G) echo "${x},${y}: (110,105,115,255)" ;; # spent heart
          H) echo "${x},${y}: (73,70,78,255)" ;;    # spent heart, shaded
          *) echo "${x},${y}: (0,0,0,0)" ;;
        esac
      done
      y=$((y + 1))
    done
  } | magick txt:- -filter point -resize "${scale}00%" "$out"
}

# A full heart, and the same heart drained and split. The break is a column of transparency
# rather than a different silhouette, so the two icons sit on exactly the same footprint and the
# life row does not jitter when one is spent.
draw_pattern "$OUT/heart_full.png" 6 <<'PATTERN'
..KKK...KKK..
.KRWRK.KRRRK.
KRWRRRKRRRRRK
KRWRRRRRRRRDK
KRRRRRRRRRRDK
.KRRRRRRRRDK.
..KRRRRRRDK..
...KRRRRDK...
....KRRDK....
.....KDK.....
......K......
PATTERN

draw_pattern "$OUT/heart_broken.png" 6 <<'PATTERN'
..KKK...KKK..
.KGGK...KGGK.
KGGGK...KGGHK
KGGGGK.KGGGHK
KGGGGK.KGGGHK
.KGGGK.KGGHK.
..KGGGK.KHK..
...KGGK.KK...
....KGGK.....
.....KHK.....
......K......
PATTERN

# The score plate: a flat panel with a hard border and a one-pixel inner highlight, which is all
# a pixel-art UI box ever is. Drawn wide and stretched by the renderer, so only the border needs
# to survive -- hence the 8x expansion rather than a 9-slice.
draw_pattern "$OUT/score_box.png" 8 <<'PATTERN'
.KKKKKKKKKKKKKKKKKKKK.
KKWWWWWWWWWWWWWWWWWWKK
KCCCCCCCCCCCCCCCCCCCCK
KCCCCCCCCCCCCCCCCCCCCK
KCCCCCCCCCCCCCCCCCCCCK
KKSSSSSSSSSSSSSSSSSSKK
.KKKKKKKKKKKKKKKKKKKK.
PATTERN

# The gap pickup: a bubble on its own. Drawn rather than cut, because the only bubble in the
# sheet already has a bird inside it -- that sprite is the WORN shield, and the renderer uses it
# directly as pose 3.
#
# +antialias matters: without it ImageMagick feathers the circle's edge, which on pixel art
# reads as a blur rather than as a step.
magick -size 34x34 xc:none +antialias \
  -fill "#bfe9ff40" -stroke "#8fd4ff" -strokewidth 2 -draw "circle 17,17 17,3" \
  -stroke none -fill "#ffffff" -draw "point 22,10  point 23,10  point 22,11" \
  -filter point -resize 400% "$OUT/shield_bubble.png"

echo "wrote $(ls -1 "$OUT" | wc -l | tr -d ' ') sprites to $OUT"
du -sh "$OUT"
