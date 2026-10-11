# 0008 — A GameCatalog declares the games, and GamesScene picks between them

- Date: 2026-08-25
- Status: accepted
- Supersedes: [ADR 0005](0005-flappy-in-level-select.md) in full. ADR 0003's decision to keep
  Flappy out of `IMechanic`/`PlayScene` still stands, and ADR 0001's reserved score id still
  stands — only that constant's location changes.
- Implements: [the main menu redesign spec](../superpowers/specs/2026-08-25-main-menu-redesign-design.md)

## Context

`MenuScene` had two buttons: `Play`, which always restarted level 0, and `Levels`. That hid the
fact that the app contains four games, gave a returning player no way to resume, and left
nowhere to put settings or an about screen.

Game identity was scattered rather than declared. Display labels and emoji lived in two
scene-local records inside `LevelSelectScene` (`MECHANIC_LABELS`, `MECHANIC_ICONS`); Flappy's
identity lived in a third scene-local list (`ExtraGameEntry` / `EXTRA_GAMES`, introduced by ADR
0005 because the level browser was the only screen that could host it); and no game had a
description or how-to-play text anywhere, because there was no screen to show one on.

ADR 0005 was correct for its moment — it explicitly chose a scene-local concept over polluting
`LevelData`/`MechanicType` with a "level" that has no puzzle content. What has changed is that a
screen whose job is choosing a game now exists, so the special case has somewhere better to go.

## Decision

**`src/core/GameCatalog.ts` is the single declaration of what games exist.** One entry per game,
a discriminated union over `kind: 'LEVELS' | 'ARCADE'`, carrying the icon and the i18n keys for
title, description and how-to-play. It absorbs `MECHANIC_LABELS`, `MECHANIC_ICONS` and
`EXTRA_GAMES`, all three of which are deleted.

**`GamesScene` is the game picker**, rendering one card per catalog entry with live progress
derived by `src/core/GameProgress.ts`. Flappy is an ordinary `ARCADE` entry there, not an
exception — its card starts `FlappyGameScene` directly, and hides when `ThreeHost.isReady` is
false because it has no 2D fallback.

**`LevelSelectScene` shows one game's levels.** It is entered with `{ mechanic }` and has lost
its mechanic tab row, its `ALL` tab, its Arcade tab and its Arcade section. Keeping the tabs
would have meant two competing game pickers.

**`FLAPPY_LEVEL_ID` moves to `GameCatalog.ts`.** It previously lived in `FlappyGameScene`, which
imports Phaser, so a catalog importing it from there could not be unit tested under the `node`
environment Vitest uses (see [ADR 0004](0004-vitest-for-pure-logic.md)). The reserved score id is
part of a game's identity, so the catalog is its natural home anyway.

**Neither `GameCatalog` nor `GameProgress` may import Phaser or three.js.** That constraint is
what keeps the catalog, the progress maths and the first-of-game unlock rule under test.

## Consequences

Adding a game is now a catalog entry plus a level bundle pushed onto
`LevelRegistry.levelBundles` — no scene edits, and its card, description, rules panel and
progress line all appear for free. Previously it also meant touching two records and a tab row
inside `LevelSelectScene`.

The first-of-game unlock rule, which used to be an inline `isFirstOfItsMechanic` expression in
`LevelSelectScene`, is now `GameProgress.isLevelUnlocked` and shared. Two screens can no longer
disagree about which levels are playable. `ProgressService.isLevelUnlocked(levelId)` remains but
should not be called by anything new: it knows only about level id `1`, so it reports the first
Sokoban and Logic Grid levels as locked on a fresh profile.

The level browser lost cross-game navigation. Switching games costs one Back tap, which is the
price of having exactly one place to choose a game.

Menu copy is localised (English and Vietnamese) while gameplay text is not, so a player on
Vietnamese sees translated menus over largely English gameplay. That is a known, accepted gap —
`LevelUI` already mixes the two — and completing the migration is separate work.
