# Main Menu Redesign — Games, Settings, About

**Date:** 2026-08-25
**Status:** Draft, pending review

## Problem

`MenuScene` offers exactly two buttons: `▶ Play`, which always starts `PlayScene` at
`{ levelIndex: 0 }`, and `☰ Levels`, which opens `LevelSelectScene`. This is wrong in three
separate ways.

**It punishes returning players.** `Play` restarts the first matchstick level every time. A
player forty levels in has no way to resume except opening the level browser and hunting for
where they stopped.

**It hides the fact that there are four games.** The app contains Matchsticks, Sokoban, Logic
Grid and Flappy Bird 3D, but the main screen never says so. Discovering them means opening
`LevelSelectScene` and noticing its mechanic tab row. No game has a name, an image, or a
description anywhere in the UI — the only display metadata that exists is two scene-local
emoji/label records inside `LevelSelectScene` (`MECHANIC_LABELS`, `MECHANIC_ICONS`).

**There is nowhere to put anything else.** There is no settings screen, so the persisted
`soundMuted` flag is reachable only through a corner mute icon and
`ProgressService.resetAllProgress()` — which exists and works — cannot be triggered from the UI
at all. There is no About screen and the app never displays a version.

A fourth problem compounds these: Flappy has no levels, so it was bolted onto the level browser
as a scene-local `ExtraGameEntry` with its own "Arcade" tab and section (see
`docs/adr/0005-flappy-in-level-select.md`). That ADR exists because there was nowhere better.

## Goals

- A main screen that resumes play, lists the games with descriptions, and has room to grow.
- Each game presented with an icon, a description, how-to-play text, and live progress.
- A settings screen covering sound, haptics, language, and progress reset.
- Retire the Flappy special case rather than extend it.

## Non-goals

Deliberately out of scope, to keep this to one implementation plan:

- **Migrating gameplay text to i18n.** See "Internationalization" — this covers the new menu
  surfaces only.
- **Background music.** None exists (`SfxCatalogue.ts` is 14 one-shot effects), so there is no
  music/SFX split to build. A single sound toggle is the whole audio surface.
- **Volume sliders.** Sound stays binary, as decided in
  `docs/superpowers/specs/2026-08-24-sfx-audio-design.md`.
- **Real thumbnail artwork.** No game art exists and `AssetLoader` registers no thumbnails.
  Cards use the existing emoji at large size; the catalog field is shaped so images can replace
  them later without touching the screens.
- **Achievements, daily challenges, themes, leaderboards.** Defensible later, not now.
- **Reviving the three dormant mechanics** (`CLICK_OBJECT`, `DRAG_AND_DROP`, `DEVICE_SHAKE`).
  They stay quarantined in `src/games/_dormant/` and stay absent from the catalog.
- **Live relayout on resize/rotation.** The app is portrait-locked; this remains the known gap
  documented in `GameConfig.ts`.

## Navigation

```
MenuScene
  ├── Continue ──────────────> PlayScene { levelIndex }        (only when progress exists)
  ├── Games ────> GamesScene
  │                 ├── LEVELS card ──> LevelSelectScene { mechanic } ──> PlayScene
  │                 └── ARCADE card ──> FlappyGameScene
  ├── Settings ─> SettingsScene
  └── About ────> AboutScene
```

`Play` and `Levels` both retire. Continue covers resuming; Games covers choosing.
`LevelSelectScene` is no longer reachable directly from the main screen — it is always entered
for one specific game.

## The game catalog

**New module: `src/core/GameCatalog.ts`.** The missing concept in this codebase — a single
declaration of what games exist and how to describe them. It absorbs `LevelSelectScene`'s
`EXTRA_GAMES`, `MECHANIC_LABELS` and `MECHANIC_ICONS`, all three of which are currently
scene-local, so game identity is defined once and every screen reads the same source.

Two kinds of entry, modelled as a discriminated union to match how `LevelData` already works:

```ts
interface CatalogEntryBase {
  key: string; // stable id, used for seenHowTo bookkeeping
  titleKey: string; // i18n key
  descriptionKey: string; // i18n key
  howToPlayKey: string; // i18n key
  icon: string; // emoji today, image key later
  requires3D?: boolean;
}

type CatalogEntry =
  | (CatalogEntryBase & { kind: 'LEVELS'; mechanic: MechanicType })
  | (CatalogEntryBase & { kind: 'ARCADE'; sceneKey: string; scoreLevelId: number });
```

Entries: Matchsticks (`MATCH_STICK`), Sokoban (`SOKOBAN`), Logic Grid (`LOGIC_GRID`), and
Flappy Bird 3D (`ARCADE`, `sceneKey: 'FlappyGameScene'`, `scoreLevelId: FLAPPY_LEVEL_ID`,
`requires3D: true`).

`requires3D` is set only on Flappy. Sokoban renders 3D when available but has a 2D fallback
(`SokobanRenderer` / `SokobanRenderer3D`); Flappy has no fallback, so its card is hidden when
`ThreeHost.isReady` is false. This is the same gate `LevelSelectScene.availableExtraGames()`
applies today, relocated.

The catalog is data plus pure lookup helpers. It must not import Phaser, so it stays testable
under `docs/adr/0004-vitest-for-pure-logic.md`.

That purity forces one small relocation. `FLAPPY_LEVEL_ID` is currently exported from
`FlappyGameScene.ts`, which imports Phaser — so a catalog importing it from there would drag
Phaser into a Vitest run under the `node` environment. **The constant moves to
`GameCatalog.ts`** and `FlappyGameScene` imports it from the catalog instead. This is the right
direction anyway: the catalog is now where game identity is declared, and the reserved score id
is part of that identity. `docs/adr/0001-flappy-endless-high-score.md` keeps its decision — only
the constant's home changes.

## Progress derivation

Per-game progress is **derived on read, never stored**. The derivations live in their own pure
module, `src/core/GameProgress.ts` — separate from `GameCatalog.ts` so the catalog stays a
declaration of what games exist and the progress maths stays a set of functions over injected
data, each file with one responsibility. Nothing in it reads storage; callers pass the level
list and progress record in. It exposes:

```ts
interface GameProgress {
  total: number; // levels in this game
  solved: number; // levels with highScore > 0
  stars: number; // sum of highScore across this game's levels
}
```

- `total` — `LevelRegistry.getAllLevels()` filtered by the entry's `mechanic`.
- `solved` — of those, the count whose `ProgressService.getHighScore(level_id) > 0`.
- `stars` — the sum of those high scores. `PlayScene` already passes stars as the score
  argument to `completeLevel`, so `highScore` _is_ the star count for a level.

`ARCADE` entries have no levels. Flappy's card shows its best score from
`ProgressService.getHighScore(FLAPPY_LEVEL_ID)` instead of a solved/total pair.

Level ids are non-contiguous by design (Matchstick 1-60, Sokoban 101-160, Logic Grid 1001-1005,
Flappy's reserved 2001), which is exactly why derivation filters by mechanic through
`LevelRegistry` rather than assuming any id arithmetic.

### The first-of-mechanic unlock rule

`LevelSelectScene:299` currently reads:

```ts
const isUnlocked = isFirstOfItsMechanic || ProgressService.isLevelUnlocked(lvl.level_id);
```

That `isFirstOfItsMechanic` clause is what makes Sokoban level 101 and Logic Grid level 1001
playable on a fresh profile, because `ProgressService.getProgress()` seeds only `{ 1: ... }` and
`isLevelUnlocked` hardcodes an exception for level id `1` alone. The rule is real and load-bearing,
and it currently lives inside one scene.

**It moves out of the scene**, so `GamesScene` and `LevelSelectScene` cannot drift apart on
which levels are playable. It becomes a pure function in `GameProgress.ts` taking the level list
and progress record as arguments, which is what keeps it testable under ADR 0004 while
`ProgressService` remains the `localStorage` boundary. Callers already hold the level list, so
they pass it along with `ProgressService.getProgress()` rather than going through a wrapper.

`ProgressService`'s existing `isLevelUnlocked(levelId)` stays where it is, but nothing new
should call it — it knows only about level id `1`, which is exactly the gap this rule fills.

This is a refactor of existing behaviour, not a behaviour change: the same levels are unlocked
before and after.

## Resuming play

`ProgressService` records `{ isUnlocked, highScore, bestMoves }` per level id and nothing about
what was played last, so a Continue target cannot be read off it today. Deriving
"furthest unlocked level" would be free but wrong — replaying an early level would leave
Continue pointing somewhere the player is not.

**`ProgressService` gains a single `lastPlayedLevelId` field**, written by `PlayScene.loadLevel`
each time a level is opened. Continue resolves it to an index into
`LevelRegistry.getAllLevels()` and starts `PlayScene { levelIndex }`.

Edge cases, all handled by hiding or falling back rather than erroring:

| Condition                                               | Behaviour                                                                                                          |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| No `lastPlayedLevelId` (fresh install)                  | Continue card is not rendered.                                                                                     |
| `lastPlayedLevelId` no longer exists in `LevelRegistry` | Continue card is not rendered.                                                                                     |
| Stored id refers to a now-locked level                  | Continue card is not rendered.                                                                                     |
| Flappy was the last thing played                        | Not recorded — Flappy does not route through `PlayScene`. Continue reflects the last _puzzle_ level, or is absent. |

The card shows the game's icon and title plus the level's per-mechanic display number, matching
the numbering `LevelSelectScene` already presents (which restarts at 1 per mechanic rather than
showing raw `level_id`).

## Screens

### MenuScene (rewritten)

Keeps its gradient background, floating shapes, animated title, and corner mute button — those
work and are not the problem. Replaces the button pair with: the Continue card (conditional),
then **Games**, **Settings**, **About**.

### GamesScene (new)

A vertically scrolling list of cards built from the catalog, reusing the wheel + drag +
camera-bounds scroll approach already proven in `LevelSelectScene` rather than inventing a
second scrolling idiom.

Each card carries: the icon at large size, the title, the description, a progress line
(`12/60 solved · ★34`, or `Best: 27` for Flappy), and a small `?` button.

- Tapping the card body navigates — `LevelSelectScene { mechanic }` for `LEVELS`,
  `scene.start(sceneKey)` for `ARCADE`.
- Tapping `?` opens the how-to-play panel.
- Cards with `requires3D` are omitted entirely when `ThreeHost.isReady` is false.

### How-to-play

A `?` button alone does not help a player who does not know they are confused, and Logic Grid is
the acute case: a Zebra/Einstein deduction puzzle is not discoverable by tapping at it. So the
panel also **shows itself once, automatically**, the first time a game is opened with no
recorded progress for it.

This is the only new persisted state in the design: a `seenHowTo: string[]` of catalog keys on
`SettingsService`. Written when the panel is dismissed; checked before auto-showing. The `?`
button remains available forever afterwards.

### SettingsScene (new)

Four controls:

- **Sound** — toggle, delegating to `AudioService.toggleMute()`, which already owns the
  authoritative flag and persists through `SettingsService` (see
  `docs/adr/0007-audio-via-phaser-sound-manager.md`). This screen does not introduce a second
  source of truth for mute state; the corner mute button and this toggle both go through
  `AudioService`.
- **Haptics** — toggle, backed by the new `HapticsService`.
- **Language** — opens a picker panel; persists to `SettingsService.language`.
- **Reset progress** — behind a confirmation panel, then `ProgressService.resetAllProgress()`.
  Destructive and currently unreachable from the UI; the confirm is not optional.

### AboutScene (new)

App title, version, one credits line, Back. Minimal by decision.

Version comes from `package.json` through a Vite `define` (e.g. `__APP_VERSION__`) rather than a
hand-maintained constant that would silently rot. `package.json` currently says `0.0.0`; it
needs a real value before being displayed, since showing `0.0.0` to a player is worse than
showing nothing.

### LevelSelectScene (reduced)

Now always entered for one game, via `{ mechanic }` scene data. This is mostly deletion from a
485-line file:

- `EXTRA_GAMES`, the `ExtraGameEntry` interface, `availableExtraGames()`, the Arcade tab, and
  the Arcade section rendering — all removed. Flappy reaches its scene from `GamesScene`.
- `buildMechanicTabs`, the `ALL` tab, the tab-row wrapping logic, and `MECHANIC_LABELS` /
  `MECHANIC_ICONS` — all removed. Choosing a game is `GamesScene`'s job now, and keeping tabs
  here would mean two competing game pickers.
- Retained: the category grouping within a game, per-mechanic level numbering, unlock/star
  badges, scrolling, and the Back button — which now returns to `GamesScene`.

A header shows which game you are in, since the tab row no longer conveys that.

## New shared components

### `src/ui/Panel.ts`

A dimmed backdrop, a rounded container, a title, and a close affordance. `LevelUI` already
hand-rolls this pattern for its win and game-over modals; the how-to-play panel, the reset
confirm, and the language picker all need it. One extraction beats three copies.

Follows the existing `src/ui/` convention — a factory returning a
`Phaser.GameObjects.Container`, not a class (this repo has no button or panel classes) — sizes
through `ui()` / `uiFont()` from `GameConfig`, and uses the existing `GameDepths.UI_PANEL`
rather than inventing z-values.

Refactoring `LevelUI`'s existing modals onto `Panel` is **not** in scope; that is gameplay HUD
code this redesign has no reason to touch.

### `src/core/HapticsService.ts`

Deliberately shaped like `AudioService`: one entry point that everything calls
(`HapticsService.tap()`, `.success()`, `.error()`), its own authoritative enabled flag, backed by
`SettingsService`, bound once in `main.ts`.

`@capacitor/haptics` is **not currently installed** — only `@capacitor/core`, `/android` and
`/cli` are — so this adds a dependency and requires `npx cap sync android`. In the browser it
falls back to `navigator.vibrate` where supported, and no-ops silently where not (notably iOS
Safari), so calling it is always safe.

Wired into `createButton` alongside its existing `sfx` option, following the same
opt-out-per-button shape, plus success/error on win and lose.

## Internationalization

**New: `src/core/i18n/`** — an `index.ts` exposing `t(key)` and the current locale, plus one
dictionary module per locale.

There is no i18n in this codebase today: `grep -rniE "i18n|locale|language|translation" src`
returns nothing, and all text is inline string literals.

**Scope is the new menu surfaces only** — `MenuScene`, `GamesScene`, `SettingsScene`,
`AboutScene`, and the catalog's titles, descriptions and how-to-play text. Roughly 30-40 strings.

English and Vietnamese are both authored for that set, so the language picker does something
observable rather than being a dead control with one option.

**The known consequence, accepted deliberately:** gameplay text is not migrated, so selecting
Vietnamese yields translated menus over gameplay that is still mostly English. The existing text
is already mixed — `LevelUI.ts` hardcodes Vietnamese (`'THÀNH CÔNG!'`, `'THUA CUỘC!'`,
`'Thử lại'`) while everything around it is English — so this does not introduce inconsistency so
much as leave existing inconsistency in place. Completing the migration is a separate,
larger pass.

`t()` falls back to the English string for a missing key, and to the key itself if English is
also missing, so a gap degrades visibly in development without crashing a player's session.

## Data model changes

`SettingsService` keeps its existing shape — one flat JSON blob under the single
`'brain_puzzle_settings'` localStorage key, with a getter/setter pair per field:

```ts
interface Settings {
  soundMuted: boolean; // existing
  hapticsEnabled: boolean; // new, defaults true
  language: string; // new, defaults 'en'
  seenHowTo: string[]; // new, defaults []
}
```

`ProgressService` keeps its separate `'matchstick_game_progress'` key and gains
`lastPlayedLevelId` alongside the existing per-level record. Both services must tolerate reading
a blob written by the previous version — missing fields fall back to defaults rather than
throwing, so an existing player's progress and mute preference survive the update. Neither
service gets a migration step; defaulting is sufficient because every new field is additive.

## Testing

Per `docs/adr/0004-vitest-for-pure-logic.md`, only modules free of Phaser, three.js and DOM
imports get a test file. That maps cleanly here, because the derivations are the part worth
testing and they are all pure:

- **Progress derivation** — solved counts, star totals, and the empty case, over a stubbed level
  list and progress record.
- **Continue resolution** — each row of the edge-case table above: absent id, unknown id, locked
  target, valid target.
- **The unlock rule** — first-of-mechanic levels read as unlocked on an empty profile; later ones
  do not.
- **Catalog lookups** — mechanic-to-entry resolution, and `requires3D` filtering.
- **`t()`** — key present, key missing in the selected locale, key missing everywhere.

`ProgressService` and `SettingsService` touch `localStorage`, which is DOM; their pure logic is
exercised through the derivation modules with injected data rather than by mocking storage.

The four scenes are verified by running the game, like every other scene in this repo.

## Files touched

**New:** `src/core/GameCatalog.ts`, `src/core/GameProgress.ts`, `src/core/HapticsService.ts`, `src/core/i18n/index.ts`,
`src/core/i18n/en.ts`, `src/core/i18n/vi.ts`, `src/scenes/GamesScene.ts`,
`src/scenes/SettingsScene.ts`, `src/scenes/AboutScene.ts`, `src/ui/Panel.ts`, plus test files
for the pure modules.

**Modified:** `src/scenes/MenuScene.ts` (rewritten), `src/scenes/LevelSelectScene.ts` (strip
tabs and arcade, accept `mechanic`), `src/scenes/PlayScene.ts` (record last played),
`src/core/SettingsService.ts`, `src/core/ProgressService.ts`, `src/ui/GameButton.ts` (haptic on
press), `src/main.ts` (register three scenes, bind haptics),
`src/games/flappy/FlappyGameScene.ts` (import `FLAPPY_LEVEL_ID` from the catalog rather than
declaring it), `vite.config.ts` (version define), `package.json` (haptics dependency, real
version number), and `CLAUDE.md` (its scene list and `LevelSelectScene` description both
describe the structure this replaces).

## ADR impact

- **New ADR superseding `0005-flappy-in-level-select.md`.** That decision is being reversed on
  purpose: Flappy leaves the level browser for the game catalog. The old ADR gets a
  `Superseded by` header rather than being deleted, since the reasoning for why it was ever
  correct is worth keeping.
- **`0003-dedicated-flappy-scene.md` stays valid.** Flappy still is not a mechanic, still does
  not route through `PlayScene`, and still owns its own loop. Only its entry point moves.
- **`0006-game-first-source-layout.md`** — `GameCatalog` and the i18n module go in `src/core/`
  because more than one game and more than one screen consume them, which satisfies that ADR's
  promote-on-second-use rule rather than bending it.

## Implementation staging

This is more than one sitting's work, so it should land in stages that each leave the game
playable rather than as one commit that breaks navigation until it is finished:

1. **Foundations, nothing visible.** `GameCatalog` with its entries and pure derivations, the
   i18n module with both dictionaries, and the unlock-rule extraction. All testable, nothing
   wired up.
2. **`Panel` and `HapticsService`.** The two shared pieces the screens depend on, including the
   dependency install and `cap sync`.
3. **`GamesScene` plus the `LevelSelectScene` reduction.** These must ship together — stripping
   the tabs and the Arcade section removes the only path to Flappy and to game switching, so the
   replacement has to exist in the same change.
4. **`MenuScene` rewrite** with the Continue card, plus the `PlayScene` and `ProgressService`
   changes that make Continue resolvable.
5. **`SettingsScene` and `AboutScene`**, plus the version define and version bump.
6. **ADR updates** — the new ADR and the `Superseded by` header on 0005.

## Risks

- **`LevelSelectScene` is the largest edit.** It is 485 lines with custom scroll and drag
  handling, and the tab removal cuts through its layout maths. The mitigation is that the change
  is dominated by deletion, and the retained grid/scroll code is not what is being altered.
- **Cards may not fit comfortably on small screens.** A card with icon, title, description and
  progress line is considerably taller than a level tile. Layout uses `ui()` scaling like
  everything else, but this needs checking on a real phone viewport, not just a desktop browser.
- **Haptics cannot be verified in a browser.** `navigator.vibrate` is absent on iOS Safari and
  the Capacitor path needs a device or emulator. The service no-ops safely, so the risk is
  silent non-delivery rather than breakage.
