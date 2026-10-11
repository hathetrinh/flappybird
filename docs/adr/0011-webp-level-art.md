# 0011 — Level art is WebP, and background textures are keyed by image name

- Date: 2026-09-15
- Status: accepted
- Amends: [ADR 0009](0009-flappy-2d-sprites.md) — the superseded painterly Flappy sprites and
  the `flappy/models/*.glb` that ADR left "dead weight in the bundle, delete whenever you like"
  are now actually deleted. Flappy's pixel art is explicitly **not** covered by this ADR.

## Context

We looked at publishing to YouTube Playables, which certifies against hard limits: an initial
bundle under 30 MiB (ideally 15), every individual file under 512 KiB, interactive within five
seconds, and a peak JavaScript heap under 512 MB. Measuring ourselves against that surfaced two
problems that were already hurting us on mid-range Android, independent of YouTube.

**The background was loaded once per level.** Every level factory sets `bg_img: 'bg'`, and
`AssetLoader` keyed the texture `bg_${level.level_id}`. `LoadingScene` queues assets for every
level in `LevelRegistry`, so Phaser held one decoded copy of the same 1024×1024 image per
level — roughly 4 MiB each across ~125 levels, on the order of half a gigabyte of texture
memory. The HTTP cache hid this from the network tab; it never hid it from the heap.

**Several shipped files were large, and several were not referenced at all.** `bg.png` alone
was 2.6 MB. Meanwhile `room.png`, `stick.png`, Sokoban's `box`/`wall`/`target`/`player_2d_backup`
PNGs (all superseded by `tileset.png`) and Flappy's five `.glb` models were still in
`public/assets/`, reachable from no code in `src/`.

## Decision

**Key background textures by image name, not by level.** `AssetLoader` exports `bgTextureKey`,
and `PlayScene.loadBackGround` resolves through that same helper. One texture, not 125. The old
`bg_1` fallback went with it: a missing background now draws nothing rather than reaching for
another level's key.

**Ship level art as WebP.** `AssetLoader`'s `DEFAULT_IMAGE_EXTENSION` is `webp`, which covers
the background, Sokoban's 2D player sprite, matchstick art, and the dormant particle assets.
`scripts/compress-assets.sh` regenerates those from the PNG originals now kept in
`assets-src/games/shared/`, downscaling as well as re-encoding — the originals were sized far
above what they are ever drawn at. Android WebView and iOS Safari both decode WebP.

**Pixel art stays PNG.** Flappy's sheet (`flappy/pixel/`) and Sokoban's `tileset.png` are loaded
with explicit `.png` paths and are excluded from the compression script. They are already tiny,
and lossy re-encoding is exactly wrong for art whose pixel grid is the point — the same reasoning
[ADR 0009](0009-flappy-2d-sprites.md) gives for NEAREST filtering and integer scaling.

**Dormant art is quarantined, not deleted.** `magic_spark`, `item_fire`, `item_cloud` and
`smoke_particle` are named only by the dormant particle system, so they move to
`assets-src/dormant/` — out of the bundle, still there if a mechanic is ever revived. This
mirrors how [ADR 0006](0006-game-first-source-layout.md) treats the dormant code itself.

Everything genuinely unreferenced is deleted outright; `assets-src/` and git history hold the
originals.

## Consequences

`public/assets/games` went from 11 MB to 728 KB (`public/assets` overall, 12 MB to 2.0 MB) and `dist/` from 15 MB to 5.6 MB, of which the
2.0 MB JS bundle (556 KB gzipped) is now the largest single item. Peak texture memory drops by
a few hundred MB. Both matter for Android today and are prerequisites for a Playables
submission, which is otherwise still blocked on the portrait-only layout — Playables requires a
game to be playable in all aspect ratios, and that rework is deliberately not part of this
change.

Adding a new non-pixel image now means putting the original in `assets-src/games/shared/`, adding
a `cwebp` line to `scripts/compress-assets.sh`, and re-running it — not dropping a PNG into
`public/`.
