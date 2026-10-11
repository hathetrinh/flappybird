# 0009 — Flappy is drawn with 2D sprites, not three.js

- Date: 2026-09-08
- Status: accepted
- Amends: [ADR 0002](0002-shared-three-host.md) — `FlappyWorld` is gone, so `ThreeHost` now
  hosts exactly one world (Sokoban's). The host itself and its one-world-at-a-time contract are
  unchanged and still justified. [ADR 0003](0003-dedicated-flappy-scene.md)'s decision to keep
  Flappy out of `IMechanic`/`PlayScene` still stands; only the renderer it drives changed.
  [ADR 0001](0001-flappy-endless-high-score.md)'s reserved score id is untouched.

## Context

Flappy shipped as a `ThreeWorld` on the shared three.js canvas. Two problems with that, in
practice:

The art was the real one. The bird, pipe, ground, cloud and bush models were placeholder-grade,
and the game's audience is children, for whom a clean, readable 2D cartoon reads better than a
mediocre 3D scene. No amount of renderer work fixes a model that doesn't look good.

It also made Flappy the only game that could be unavailable. `requires3D: true` on its catalog
entry meant `GamesScene` hid the card outright when `ThreeHost.isReady` was false, and the
scene had a `showUnavailable()` dead end for the case where the world failed to build. Sokoban
never had that problem, because it has a 2D fallback.

## Decision

Draw Flappy with Phaser sprites, from art sliced out of a hand-authored sheet.

- `src/games/flappy/FlappyRenderer.ts` replaces `FlappyWorld.ts`, which is deleted. It keeps
  the same contract deliberately — `setBirdPose` / `setPipes` / `setScroll` / `playBirdClip`
  plus the `viewWidth` / `viewHeight` getters — so `FlappyGameScene`'s frame loop reads almost
  identically and, far more importantly, **`FlappySim.ts` is not touched at all**. Every
  playtested constant in `FLAPPY_TUNING` keeps its meaning because `viewHeight` is still exactly
  `REFERENCE_VIEW_HEIGHT` (13.3) world units of flyable air.
- It is a per-scene object (`new FlappyRenderer(this)`), not a module singleton. `FlappyWorld`
  had to be a singleton because `ThreeHost` owns one active world; a Phaser renderer belongs to
  the scene that made it and dies with it, which removes the `setWorld`/`show`/`hide` dance.
- `requires3D` comes off the Flappy catalog entry, so it runs everywhere and
  `showUnavailable()` is gone. The flag itself stays supported in `GameCatalog` for a future
  3D-only game; `GameCatalog.test.ts` asserts that no entry currently sets it, so whoever adds
  one gets sent back to that test.
- Sprites load in `FlappyGameScene.preload()` rather than `LoadingScene`, so a player who never
  opens Flappy never downloads its art. `LoadingScene` now preloads only Sokoban's models.

### Asset pipeline

`scripts/slice-flappy-sheet.sh` (ImageMagick, run by hand, output committed — the same shape as
`scripts/generate-sfx.ts`) slices two sheets under `assets-src/games/flappy/` into
`public/assets/games/flappy/sprites/`: `flappy_transparent.png` for the world (pipes, ground,
hills, props, HUD) and `chick_sheet.png` for the bird, which was redrawn separately afterwards.

Three things about it are worth knowing before touching it:

**Neither source sheet has an alpha channel.** `flappy_transparent.png`'s checkerboard is
painted pixels despite the name, and `chick_sheet.png`'s background is near-white; both alpha
channels are uniformly opaque, so the background has to be reconstructed. A plain colour key
eats the chick's cream belly, the cloud whites and the silver star halos, so the script keys on
"desaturated AND light AND connected to the image border" instead. That works because every
sprite carries a dark cartoon outline: the background cannot leak inside a sprite, and interior
light areas are never border-connected. Sprite edges then get a 2px erode, because the sheets
are lossily compressed and their soft grey edge ramp otherwise keys as opaque and ships as a
white fringe.

**The source sheets live in `assets-src/`, not `public/`.** They are 6-7 MB each and `public/`
ships verbatim into `dist/` and the APK. Sliced output is about 1.2 MB.

**The chick frames are found, not indexed, and share one scale and a bottom alignment.** Its
sheet is twelve poses — a seamless eight-frame flight loop, then a four-pose knock-out
(collision, dizzy, falling, collapse). The cells are a clean 448px grid, but that is all that is
regular about it: each also carries a number label, a caption, thin separator rules, and in one
case a stray ghost glyph, none of which belong in a sprite and all of which key as opaque.

So the content of a cell is _found_: take its blobs, drop the two kinds of furniture, union what
is left. Both filters had to be loosened once against the real sheet — the separator rules stop
short of the band (378px of 469) and blur out to 46px wide, and the ghost glyph sits at x=320
where a left-hand-only test never looks. The bounds that survive are recorded in the script.
Finding rather than indexing is what keeps each pose's stars, halo and K.O. burst attached: no
fixed rectangle could hold all three, since the decorations reach up into the number labels and
the collapsed pose overlaps its own caption.

Two packing rules then matter more than they look, and both were learned by getting them wrong:

- _One shared scale._ Normalising each frame to its own bounding box makes the scale a function
  of wingspan and halo size. On the first sheet that rendered the hit pose ~24% larger than the
  glide poses, and the bird's body visibly pulsed and drifted every time the pose changed.
- _Bottom alignment._ The crash poses carry star halos adding ~190px **above** the bird, so
  their boxes are far taller than the flight poses'. Centring the boxes would sink the bird
  through the floor exactly at the moment of death. The feet are the one landmark every pose
  shares, so frames align bottom-centre and the halos grow up into the cell's headroom.

Because of that headroom the bird's body is not at the centre of its cell, so the script prints
a body-origin fraction and `FlappyRenderer` sets the sprite's origin to it. That is what puts
the drawn bird — rather than empty halo space — on the simulation's position, and makes the
pitch rotate about the body. **Re-slicing prints a new value; it has to be copied across.**

The eight flight frames are played as **one continuous loop**, with a tap restarting it from the
top of the stroke rather than triggering a separate animation. The earlier, smaller sheet had no
such loop and forced a one-shot flap laid over a two-frame idle, which is what made the old
animation read as a stutter between poses rather than as a wingbeat.

The art also constrains the drawing in two places:

- The pipe sprite is a short **cap** (rim plus a stub of shaft), not a full column, so each pipe
  is drawn as a cap at the gap mouth plus a body stretched from a 6px slice of shaft out to the
  screen edge. The slice is thin on purpose: the shaft's shading runs in vertical streaks, so
  stretching it reads as continuous streaks rather than a repeating pattern.
- The hillside and ground strips are finite hand-drawn art, so tiling one raw shows a hard seam
  at the wrap. The script appends a horizontally flipped copy of each, which is seamless by
  construction — the internal joint is the strip's right edge against itself and the wrap is its
  left edge against itself. The cost is mirror symmetry, invisible on grass and hills.

## Consequences

- `ThreeHost` has one consumer left. It is still worth its own module: the lazy-context
  ordering and the one-world contract are what let Sokoban share the canvas with Phaser at all,
  and a second 3D game would need it again. Nothing about it changed here.
- Flappy's ground surface is now honest. World `y = 0` is the top of the drawn ground band, so
  the bird visibly crashes into the grass it collides with. The old orthographic camera sat the
  visible bottom edge about 1.1 units above `y = 0` and relied on a camera tilt to show the
  ground's top face at all.
- The renderer relayouts on `Phaser.Scale.Events.RESIZE`, so it survives the rotation support
  that Sokoban added, without Flappy needing a rotation branch of its own.
- The crash is a real sequence now: a one-shot dazed reaction while falling, then a held K.O.
  pose once the bird lands, driven off the simulation's existing `DYING` and `GAME_OVER` phases.
  It is presentation only — `FlappySim` still decides everything.
- Hearts and coins were that deliberate follow-up, and they are now in — see ADR 0010.

## Alternatives rejected

- **Keep both renderers behind a toggle.** Two renderers to maintain and a switch in the scene,
  to preserve 3D art that was the reason for the change.
- **Use 2D only as a fallback when `ThreeHost.isReady` is false.** Backwards: it would give
  every capable device exactly the 3D bird we are replacing.
- **Load the 2816x1536 sheet directly as a Phaser atlas with a hand-written frame map.** No
  slicing script, but it ships a 7 MB texture to a phone and pins the frame coordinates in
  TypeScript instead of in the script that knows the sheet's layout.
