# 0005 — Flappy Bird 3D appears in LevelSelectScene as a local "extra game" tile

> **Superseded by [0008](0008-game-catalog-and-menu-structure.md)** (2026-08-25). Flappy is now
> an ordinary `GameCatalog` entry on `GamesScene`; the `ExtraGameEntry` concept and the Arcade
> tab this ADR introduced have been deleted. The reasoning below is kept because it explains why
> the special case was correct while `LevelSelectScene` was the only screen that could host it.

- Date: 2026-08-22
- Status: accepted
- Supersedes: the level-select prediction in [ADR 0003](0003-dedicated-flappy-scene.md) (see
  Consequences there — "Flappy will _not_ appear as a LevelSelectScene mechanic tab... the
  cheapest route is a hollow level entry"). ADR 0003's decision to keep Flappy out of
  `IMechanic`/`PlayScene` still stands; only the level-select prediction is replaced.
- Answers: [questions/should-flappy-appear-in-level-select](../questions/should-flappy-appear-in-level-select.md)

## Context

The parked question asked whether Flappy should be reachable from `LevelSelectScene`, and
flagged the cheap route's real cost: a hollow `FLAPPY` entry in `LevelRegistry` would force
every consumer of that array to not trip over a "level" that has no puzzle content, no unlock
chain and no mechanic — `PlayScene`, `AssetLoader`, and `MechanicRegistry`'s exhaustive
`Record<MechanicType, ...>` most concretely, since `MechanicType` would need a `'FLAPPY'` member
with no real `IMechanic` behind it.

The user asked for it to move into the Levels menu, replacing the standalone Menu button
entirely (one place to find every game, not two).

## Decision

Render Flappy as a tile in `LevelSelectScene`'s grid via a small scene-local concept —
`ExtraGameEntry` — that is not a `LevelData`, is not added to `LevelRegistry`, and does not
touch `MechanicType`. It carries just what the tile needs: an icon, a label, the scene key to
start, and the `ProgressService` id its high score is stored under (`FLAPPY_LEVEL_ID`).

It gets a real tab of its own (alongside the mechanic tabs) and a tile under an "Arcade" pseudo-
category shown on the "All" tab and its own tab, using the same tile styling, fade-in, and
drag-vs-tap guard as a real level tile — so it reads as one grid, not a bolted-on extra. Gated
on `ThreeHost.isReady`, matching the spec's "No-WebGL behaviour": no tab, no tile, no entry
point at all when the 3D layer isn't available.

The Menu's standalone "Flappy 3D" button is removed — Levels is now the only way in.

## Consequences

- `LevelRegistry`, `MechanicType`, `MechanicRegistry`, `AssetLoader` and `PlayScene` remain
  completely unaware Flappy exists. The cost the question doc warned about never materializes.
- The cost that _does_ land: `LevelSelectScene` now knows about two unrelated things (levels and
  extra games) instead of one, and a second such game would mean growing `EXTRA_GAMES` rather
  than reusing existing per-mechanic plumbing. Acceptable for one entry; worth a second look if a
  third arcade-style game appears (the same trigger ADR 0003 named for this question).
- One thing this does NOT solve: unlocking. Extra games have no unlock chain by construction
  (there is nothing to unlock), so `isFirstOfItsMechanic`-style logic never applies to them —
  they are simply always available once `ThreeHost.isReady`. If a future extra game should be
  gated behind progress, that is new design, not a variation of this one.
- Reachable only through Levels now, not the Menu. If that turns out to hurt discoverability
  (fewer taps mattered enough to add a Menu shortcut in the first place), re-adding a Menu button
  is a two-line change, not a design reversal.
