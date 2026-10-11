# 0001 — Flappy Bird 3D is one endless run with a high score

- Date: 2026-08-22
- Status: accepted

## Context

Every mechanic in this repo so far is level-shaped: a discrete puzzle with a win condition, a
star rating, and an unlock chain, all keyed off `level_id` in `ProgressService`. Flappy Bird is
not that. It has no win state — the run always ends in a crash — and its only progression is a
number that got bigger.

Two ways to reconcile that. Force it into the level model with challenge levels ("pass 10
pipes", "survive 40s"), which would fit `LevelSelectScene` and the star system exactly. Or keep
the game as it actually is and store a high score.

## Decision

One endless run. Score is pipes passed. The best score persists through the existing
`ProgressService` under a reserved id, `FLAPPY_LEVEL_ID = 2001`, which already stores a
per-level high score and needs no new persistence layer or storage key.

No stars, no unlock chain, no win state.

## Consequences

- `ProgressService.completeLevel(2001, score)` is called on every game over, and keeps the max.
  Nothing else in the progress model changes.
- The star popup, hint button, undo button and per-level timer are all irrelevant to this game.
  That is a large part of why it does not live in `PlayScene` — see [0003](0003-dedicated-flappy-scene.md).
- Reserved id ranges now read: Matchstick 1-60, Sokoban 101-160, Logic Grid 1001-1005,
  Flappy 2001. The gap before 2001 is deliberate, leaving room for more arcade-style entries.
- Challenge levels are not ruled out later, but nothing has been built to accommodate them
  speculatively. Adding them would mean a level array and a target-score check — a new decision
  when someone actually wants it, not a data shape carried unused until then.
