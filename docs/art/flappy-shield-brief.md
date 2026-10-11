# Art brief: Flappy's shield bubble

> **Superseded.** Flappy was restyled to pixel art before this brief was ever used, and the
> shielded bird now comes from the pixel sheet as a complete pose -- see
> `scripts/slice-flappy-pixel-sheet.sh`. Nothing here is wired into the game.
>
> It is kept for the technique, which applies to any future glass-like or soft-edged asset:
> **luminance-as-alpha** is the only reliable way to get partial transparency out of an image
> model, and the reasoning below explains why keying cannot do it.

What to ask an image model for, so that `scripts/slice-flappy-sheet.sh` can turn the result into
a sprite the game can actually use. Read `docs/adr/0009-flappy-2d-sprites.md` first — this brief
exists to avoid repeating the problem documented there.

Drop the generated file at `assets-src/games/flappy/shield_sheet.png`, then run
`./scripts/slice-flappy-sheet.sh`. Never edit anything under
`public/assets/games/flappy/sprites/` by hand; the script overwrites it.

## What the sprite is for

One image does two jobs, at two sizes:

- the pickup floating in a pipe's gap, about 0.95 world units across;
- the bubble worn around the chick once collected, about 1.85 units across — roughly 1.5× the
  drawn bird, so its rim clears the wingtips.

Until this art exists, `FlappyRenderer.ensureShieldTexture()` draws a placeholder bubble with
`Phaser.Graphics`. Replacing it is a change of texture key, nothing more.

## The one rule that matters: white on black

**Paint the bubble in white and grey on a pure black (#000000) background.** The slicer reads
luminance as opacity — white becomes opaque, black becomes fully transparent, and everything
between becomes genuinely translucent glass. The renderer supplies the blue.

This is not a stylistic preference, it is the only way to get soft alpha out of an image model.
Both existing sheets (`flappy_transparent.png`, `chick_sheet.png`) arrived with uniformly opaque
alpha channels, so the script has to reconstruct their transparency by keying on "light,
desaturated, and connected to the image border". That works for sprites with a dark cartoon
outline around an opaque body. It cannot work for glass: a bubble's interior is enclosed by its
own rim, so it is never border-connected, and the keying pass would hand back a solid white disc
that hides the bird inside it.

Do not ask for "a transparent PNG" — models say yes and return an opaque one.

## The prompt

> A soft cartoon soap bubble, drawn in white and light grey on a pure black background.
> Perfectly circular, centred, filling about 80% of a square image. The rim is a bright, clean
> white ring, thicker at the lower left; the inside of the bubble is very dark, almost black,
> with a faint milky sheen so it reads as glass rather than as a hole. One large soft highlight
> at the upper right, and one small round highlight at the lower left. No caption, no text, no
> label, no border, no drop shadow, no checkerboard. Nothing in the image except the bubble on
> flat black. Hand-drawn children's storybook style, soft edges, no pixel art, no photorealism.
> Square image, 1024x1024.

Style anchors, if the model accepts a reference image: pass `assets-src/games/flappy/chick_sheet.png`
and ask for the same warm, soft, cel-shaded children's-book rendering. The bubble sits _on_ the
chick, so the two have to share a drawing style. It must NOT be pixel art — see
`assets-src/games/flappy/reference/` for the pixel-art sheet that prompted this feature, which is
the style the game deliberately does not use.

## Checklist before running the slicer

- Square, at least 512×512 (1024 is ideal — the slicer scales down to a 256 px cell).
- Background is flat black everywhere outside the bubble, with no vignette or gradient.
- No text anywhere in the image. A caption keys as opaque and would ship inside the sprite.
- The bubble's interior is dark. If the model fills it with white, the sprite will be an opaque
  disc — regenerate rather than trying to fix it in the slicer.
- One bubble only, not a sheet of variations.

The slicer prints the trimmed content size it found. If that is much smaller than the image, the
model has added margin, which is harmless; if it equals the full image, the bubble is touching
the edges and will be clipped when scaled — regenerate with more room around it.
