# 0003 — Flappy runs in its own Phaser scene, not as a PlayScene mechanic

- Date: 2026-08-22
- Status: accepted
- Superseded in part by [ADR 0005](0005-flappy-in-level-select.md): the level-select
  prediction below (a hollow `LevelRegistry` entry) was replaced by a scene-local tile concept
  that never touches `LevelRegistry`/`MechanicType`. The decision to keep Flappy out of
  `IMechanic`/`PlayScene` is unaffected and still stands.

## Context

`PlayScene` is the only gameplay scene, and every mechanic reaches the player through it via
`IMechanic` and `MechanicRegistry`. Consistency argues for Flappy joining that list: it would
inherit `LevelSelectScene` discovery and `ProgressService` wiring for free.

But `PlayScene` is puzzle-shaped. It owns a hint button, an undo button, a per-level countdown
with a score multiplier, a star popup on win, and "next level" progression. An endless arcade
run wants none of those five. It also needs something no mechanic has: a per-frame tick, which
`IMechanic` does not define — the interface is `setup` / `undo` / `destroy`. Today the only
per-frame code lives in `PlayScene.update()`, hardcoded to forward Sokoban's proxy positions.

So the mechanic route costs an optional `update(delta)` on the shared interface plus five
features suppressed for one mechanic, in what is already the largest file in the repo.

## Decision

A dedicated `FlappyGameScene`, launched from `MenuScene`. It owns its own input, HUD, restart
and frame loop, calls `ProgressService` directly for the high score, and drives `FlappyWorld`
through `ThreeHost`.

`IMechanic`, `MechanicRegistry` and `MechanicType` are untouched. Flappy is not a mechanic.

## Consequences

- No optional `update()` bolted onto an interface six puzzle mechanics don't need, and no
  suppression flags in `PlayScene`.
- Flappy will _not_ appear as a `LevelSelectScene` mechanic tab, because those tabs are derived
  from the mechanics present in `LevelRegistry`. It is reached from the menu instead. If it
  should also appear in level select later, the cheapest route is a hollow level entry that
  routes to the scene — deliberately not done now.
- There are now two places that know how to start gameplay. The seam is narrow (both go through
  `ProgressService` and `ThreeHost`), but "add a game" is no longer a single-file answer.
- `PlayScene.update()`'s hardcoded Sokoban block stays as-is. Generalising it was only ever
  motivated by putting Flappy through `PlayScene`, so it is not part of this work.
