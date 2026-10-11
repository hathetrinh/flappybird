# Should Flappy Bird appear in LevelSelect?

- Opened: 2026-08-22
- Status: closed — decided [2026-08-22](../adr/0005-flappy-in-level-select.md)
- Related: [ADR 0003](../adr/0003-dedicated-flappy-scene.md), [ADR 0001](../adr/0001-flappy-endless-high-score.md)

## Answer

Yes — the user asked for it directly, ahead of either trigger below. See
[ADR 0005](../adr/0005-flappy-in-level-select.md) for the decision actually taken: neither of
the two routes considered when this was opened. A third path avoided the cost this question
flagged entirely — a `LevelSelectScene`-local "extra game" concept, not a `LevelRegistry` entry
and not a menu section — by keeping the tile's data out of `LevelData`/`MechanicType` altogether
rather than trying to make a hollow entry safe for every consumer to ignore.

## The question

`LevelSelectScene` derives its mechanic tabs from the mechanics present in
`LevelRegistry.getAllLevels()`. Flappy is not a mechanic and has no levels
([ADR 0003](../adr/0003-dedicated-flappy-scene.md)), so it will only be reachable from the menu.
Is that the right place for a player to find it, or does every game need to be discoverable in
one list?

## Why it isn't answered yet

Nobody has played the thing. Whether the menu is enough depends on how many games end up in the
app: with three entries a menu is obvious, with eight it is a wall of buttons and the level-select
grid is where people will look.

## What answering it would cost

The cheap route is a hollow `FLAPPY` level entry that exists only so a tab and tile appear, whose
tile starts `FlappyGameScene` instead of `PlayScene`. That is one registry entry and one branch in
the tile's click handler — but it puts a fake level in `LevelRegistry`, which every consumer of
that array then has to not trip over (star counts, unlock chains, "level N of M" text).

The honest alternative is a small "Games" section on the menu that scales past two entries, and
leaving `LevelSelectScene` for puzzles with levels.

## Decide it when

A third non-level game appears, or the menu passes about five buttons — whichever comes first.
If it gets decided, this becomes an ADR and this file points at it.
