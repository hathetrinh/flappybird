# 0006 — Organize `src/` by game, not by technical layer

- Date: 2026-08-22
- Status: accepted
- Plan: [2026-08-22-game-first-restructure](../plans/2026-08-22-game-first-restructure.md)

## Context

`src/` has 65 TypeScript files in 15 top-level directories organized by **technical layer**
(`mechanics/`, `levels/`, `game/`, `three/`, `utils/`, `constants/`, …). A layer-first layout is
fine while there is one game; with four it means each game's code is scattered across many
directories, and no directory tells you which game it belongs to.

Measured from the current tree and its import graph:

| Game       | Files | Spread across                                                                             |
| ---------- | ----- | ----------------------------------------------------------------------------------------- |
| Sokoban    | 12    | `levels/`, `mechanics/`, `mechanics/commands/`, `game/`, `three/`, `utils/`, `constants/` |
| Logic Grid | 6     | `levels/`, `mechanics/`, `mechanics/commands/`, `game/`, `utils/`                         |
| Matchstick | 6     | `levels/`, `mechanics/`, `mechanics/commands/`                                            |
| Flappy     | 4     | `game/flappy/`, `three/`, `scenes/`                                                       |

Four concrete problems, each confirmed by grepping the import graph rather than by impression:

1. **`game/` and `utils/` are grab bags.** `game/` holds layout math (`ContentSpace`), D-pad
   regions (`ScreenRegions`), three different renderers, camera controls, and one per-game
   subfolder. `utils/` holds one game's map parser, another game's deduction logic, and a raw
   level-data blob.
2. **Two files filed as shared are single-game.** `constants/TileFrames.ts` is imported only by
   `game/SokobanRender.ts`; `game/ScreenRegions.ts` only by Sokoban's mechanic and camera
   controls. Their location says "generic"; their usage says otherwise.
3. **Dead files with zero importers:** `counter.ts`, `style.css`, `assets/` (3 files),
   `helpers/StorageHelper.ts`. (A first pass over this list also named `ui/Hint.ts` and
   `ui/Label.ts`, found by a looser substring grep; re-checked with real import statements
   before Task 2 deleted anything, both turned out to be imported by `ui/LevelUI.ts` and are
   not dead. Corrected here rather than left to mislead the next reader.)
4. **Ten files are unreachable at runtime.** `CLICK_OBJECT`, `DRAG_AND_DROP` and `DEVICE_SHAKE`
   have zero level definitions in `src/levels`, so those three mechanics and the entire seven-file
   `actions/` (`on_success`) system they exclusively drive cannot be reached by play.

There is already a working precedent for the fix in the tree: `src/game/flappy/` is a per-game
folder, and the asset side has used `public/assets/games/<game>/` as its convention since the
Sokoban 3D work. This decision generalizes what those two already established.

## Decision

Organize `src/` **by game**, with an explicit shared kernel:

```
src/
  main.ts
  core/          GameConfig, GameDepths, CommandManager, ICommand, ContentSpace,
                 ProgressService, AssetLoader, LevelRenderer
  ui/            GameButton, GameColor, LevelUI, ProgressBar
  three/         ThreeHost, ThreeWorld            (shared host only)
  scenes/        LoadingScene, MenuScene, LevelSelectScene, PlayScene
  mechanics/     IMechanic, MechanicRegistry      (contracts + composition root only)
  levels/        LevelRegistry                    (registry only)
  types/         Level.ts
  games/
    sokoban/     levels, factory, map parser, maps, mechanic, command,
                 Renderer2D, Renderer3D, World, CameraControls, ScreenRegions, TileFrames
    matchstick/  levels, factory, mechanic, command, Tray, utils
    logicgrid/   levels, factory, mechanic, command, Renderer, utils
    flappy/      FlappySim (+test), World, GameScene
    _dormant/    the three level-less mechanics + the actions/ system
```

**Files keep their game-prefixed names** (`SokobanWorld.ts`, not `World.ts`). The prefix is
redundant with the folder, but it keeps editor tab titles and Cmd-P search unambiguous across
four games, and it means most files are a pure move with no rename — fewer edits, less risk.
Names are only changed where the current one is wrong: `ProgressServicel.ts` →
`ProgressService.ts`, `AssertLoader.ts` → `AssetLoader.ts`, `SOKOPAN_LEVEL.ts` →
`SokobanMaps.ts`, `SokobanRender.ts` → `SokobanRenderer2D.ts` (its class is already
`SokobanRenderer`, and it sits beside `SokobanRenderer3D`).

### The rule for what goes where

- **`games/<game>/`** — anything only that game uses. This is the default. When in doubt, a file
  goes here, not in the kernel.
- **`core/`** — shared, game-agnostic building blocks: config, persistence, asset loading,
  command history, layout maths, and the generic element renderer. A file belongs here only once
  **two or more games** import it.
- **Promotion, not prediction.** A file starts in the game that needs it and moves to `core/`
  when a second game imports it. `ScreenRegions` and `TileFrames` are being moved _into_
  `games/sokoban/` under exactly this rule; if Flappy later needs HUD-bounds logic, that is when
  `ScreenRegions` earns a promotion — not before.
- **`_dormant/`** — reachable by no level. The underscore sorts it to the top of `games/` and the
  name says why it is there. Quarantine, not deletion: the code is kept, just not disguised as
  live.

### Adding a game after this

One folder plus registration in at most three places:

1. `src/games/<game>/` — the game's own files.
2. `src/levels/LevelRegistry.ts` — push its level array onto `levelBundles` (level-based games).
3. `src/mechanics/MechanicRegistry.ts` — map its `MechanicType` to its `IMechanic`
   (level-based games), **or** `src/main.ts` + `LevelSelectScene`'s `EXTRA_GAMES` for a
   scene-based arcade game like Flappy (see [ADR 0005](0005-flappy-in-level-select.md)).

## Consequences

- One game is one folder: finding a Sokoban bug means opening one directory instead of six.
- The kernel's contents are now defensible by a rule rather than by habit, and the rule is
  "promote on second use", which resists both premature abstraction and grab-bag drift.
- **The move is large: 46 of the 65 files change path.** 15 stay where they are (`main.ts`, the
  four `ui/` widgets, the two shared `three/` files, the four `scenes/`, `IMechanic`,
  `MechanicRegistry`, `LevelRegistry`, `types/Level.ts`) and 4 are deleted outright. All imports
  are relative and there are 127 of them, so a lot of import lines get rewritten. `tsc --noEmit` catches every one of
  those mechanically, which is what makes this safe to do in bulk — but it does **not** catch
  runtime strings (Phaser scene keys, asset URLs), so each migrated game still needs a browser
  check. The plan orders the work one game per commit for exactly this reason.
- `mechanics/MechanicRegistry.ts` and `levels/LevelRegistry.ts` keep importing from `games/*`.
  That is intentional — they are composition roots, and a composition root is supposed to know
  about the things it composes. The dependency runs one way: `games/*` never imports a registry.
- Two directories disappear (`config/`, `constants/`, `cores/`, `services/`, `helpers/`, `utils/`
  fold into `core/` or a game folder), which is a lot of churn in `git log --follow` terms for
  anyone archaeologising later. Accepted: `git log --follow` handles renames, and the ADR + plan
  record the mapping.
- Quarantining rather than deleting the dormant code means ~10 files stay in the repo that no
  level reaches. That is a deliberate trade: the `_dormant/` name makes the situation legible,
  and the decision to delete can be taken later without having to reconstruct the code first.
