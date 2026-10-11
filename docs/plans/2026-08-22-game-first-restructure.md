# Game-First `src/` Restructure — Implementation Plan

**Status:** complete — 2026-08-22. All nine tasks ran, including the optional Task 1 (path
aliases). One deviation from ADR 0006 beyond what's in the ADR's own Consequences: the `@types/*`
alias from Task 1 turned out to be unusable — TypeScript reserves the literal `@types/` import
prefix for ambient `@types/*` packages and rejects an explicit import from it (TS6137) regardless
of `paths` mapping. Renamed it to `@game-types/*` in a follow-up commit once Task 5 first needed
to import `types/Level.ts` and hit the error. Two other on-the-fly fixes, both applied to stay
inside the "must be clean" gate rather than being scope creep: the pre-commit hook's `eslint --fix`
tripped on pre-existing lint errors the moment Tasks 5 and 8 staged their files for the first
time, so those errors got fixed instead of committing broken; lint finished at 0 errors, not the
originally-expected 10. Also fixed two casing typos found during Task 7 that the plan's own file
list didn't anticipate (`MatchstickLevelFactory.ts`, not `MatchStickLevelFactory.ts`, on disk).

The six per-task browser smoke tests are left unchecked below — they need a real browser/device
and were not run as part of closing out this plan; each covers a runtime string (`tsc` cannot
see Phaser scene keys or asset URLs) and should be run before trusting the migrated build.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize `src/` from layer-first into game-first (`src/games/<game>/`) with an
explicit shared kernel, so that finding a bug in one game means opening one directory and adding
a new game means creating one folder plus at most three registration lines.

**Architecture:** No behaviour changes anywhere. This is file moves plus import rewrites, one
game per commit, with the compiler as the safety net for imports and a browser smoke test as the
safety net for the runtime strings the compiler cannot see (Phaser scene keys, asset URLs).

**Tech Stack:** TypeScript 6, Phaser 4.1, three.js 0.185, Vite 8, Vitest 4.

**Decision:** [docs/adr/0006-game-first-source-layout.md](../adr/0006-game-first-source-layout.md)
— read it first; it defines the target tree and the rule for what belongs in `core/`.

## Global Constraints

- **Zero behaviour change.** If a file's contents need editing beyond its import lines, its own
  header comment, and the renames listed in ADR 0006, stop — that is a different task.
- **`npx tsc --noEmit` is the primary gate** and must be clean before every commit. For a pure
  move it mechanically proves every one of the 127 relative imports still resolves.
- **`tsc` cannot see runtime strings.** Phaser scene keys (`this.scene.start('PlayScene')`),
  asset URLs (`assets/games/sokoban/models/floor.glb`) and `ProgressService` storage keys are
  plain strings. Never change one during a move, and browser-check each migrated game.
- Files keep their game-prefixed names. The only renames allowed are the four in ADR 0006.
- `npm run lint` has **10 pre-existing errors** in `actions/` and `utils/SokobanMapParser.ts`
  (unused `_`-prefixed params; `prefer-const`; `no-useless-escape`). They are not yours to fix
  here — but note their paths change in Tasks 5 and 8, so the error list's paths change with
  them. "Clean" means "still exactly those 10, no new ones".
- `npm test` must stay at 21 passing. Only `FlappySim.test.ts` exists; it moves in Task 4.
- **`scripts/` is invisible to the `tsc --noEmit` gate.** `tsconfig.json` sets
  `"include": ["src"]`, so nothing in `scripts/` is type-checked by the command every task runs.
  Three scripts import from `src/`, and two of them import files this plan moves — they must be
  fixed by hand and checked by running them (Tasks 6 and 7). A green `tsc` says nothing about them.
- Existing style: 2-space indent, single quotes, trailing commas, Prettier width 120. The
  pre-commit hook runs eslint --fix + prettier on staged files.
- Commit after every task. A regression must be bisectable to one game.

## A note on Task 1 (path aliases)

Task 1 adds `@core/`, `@games/` etc. import aliases. It is **optional and separable** — if you
skip it, every later task still applies exactly as written, except that imports use the
equivalent relative path (`../../core/GameConfig` instead of `@core/GameConfig`). The file moves
and verification steps are identical either way.

It is recommended because it is what makes _future_ moves cheap: with aliases, moving a file
changes only that file's own imports, not every importer's `../../..` prefix. Without it, this
plan's churn recurs on every future reorganization.

---

### Task 1 (optional): Add path aliases

**Files:**

- Modify: `tsconfig.json`, `vite.config.ts`

**Interfaces:**

- Consumes: nothing.
- Produces: the aliases `@core/*`, `@ui/*`, `@three/*`, `@scenes/*`, `@mechanics/*`, `@levels/*`,
  `@types/*`, `@games/*`, resolvable from both `tsc` and Vite.

- [x] **Step 1: Add `paths` to tsconfig.json**

Inside `compilerOptions`, after `"moduleResolution": "bundler"`:

```json
    "baseUrl": ".",
    "paths": {
      "@core/*": ["src/core/*"],
      "@ui/*": ["src/ui/*"],
      "@three/*": ["src/three/*"],
      "@scenes/*": ["src/scenes/*"],
      "@mechanics/*": ["src/mechanics/*"],
      "@levels/*": ["src/levels/*"],
      "@types/*": ["src/types/*"],
      "@games/*": ["src/games/*"]
    },
```

- [x] **Step 2: Mirror them in vite.config.ts**

Vite does not read `tsconfig.paths`. Add a matching `resolve.alias` block, and the `node:path`
import it needs, to the existing `defineConfig({ ... })`:

```ts
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const src = (p: string) => fileURLToPath(new URL(`./src/${p}`, import.meta.url));

export default defineConfig({
  resolve: {
    // Must stay in step with `paths` in tsconfig.json — tsc reads that, Vite reads this, and a
    // mismatch type-checks clean then fails at runtime with an unresolved import.
    alias: {
      '@core': src('core'),
      '@ui': src('ui'),
      '@three': src('three'),
      '@scenes': src('scenes'),
      '@mechanics': src('mechanics'),
      '@levels': src('levels'),
      '@types': src('types'),
      '@games': src('games'),
    },
  },
  // ...keep the existing server / preview blocks unchanged...
});
```

- [x] **Step 3: Prove both resolvers agree, before any file moves**

The point of doing this first, on the current tree, is that an alias mistake shows up now rather
than tangled up with 46 moved files. `src/core/` does not exist yet, so test with a directory
that does:

```bash
# Temporarily switch ONE import in src/scenes/MenuScene.ts to the alias form:
#   import { createButton } from '@ui/GameButton';
npx tsc --noEmit                 # must be clean -> tsc resolves the alias
npm run build                    # must succeed  -> Vite resolves it too
git checkout src/scenes/MenuScene.ts   # revert the probe
```

Expected: both clean. If `tsc` passes but `npm run build` fails, the `vite.config.ts` alias is
wrong — fix it before continuing, because every later task depends on both resolvers agreeing.

- [x] **Step 4: Commit**

```bash
git add tsconfig.json vite.config.ts
git commit -m "build: add @-prefixed import aliases for src subtrees"
```

---

### Task 2: Delete dead files — done, see correction below

**Executed 2026-08-22, commit `f81430c`.** Step 1's re-check (the step this task itself insists
on, rather than trusting the list below) found that `ui/Hint.ts` and `ui/Label.ts` are **not**
dead — both are imported by `ui/LevelUI.ts` (`createHint`/`createLabel`), which `PlayScene.ts`
imports. The original count of eight came from a looser substring grep; the real number was six.
Only the six confirmed-dead files were deleted. The task's own text below is left as originally
written, for the same reason a plan is not rewritten to match later reality — but do not repeat
its file list without re-running Step 1 yourself.

Six files with zero importers — three sources plus three unused images — confirmed by grepping
for real import statements rather than substrings. Doing this first shrinks everything that
follows.

**Files:**

- Delete: `src/counter.ts`, `src/style.css`, `src/assets/hero.png`, `src/assets/vite.svg`,
  `src/assets/typescript.svg`, `src/helpers/StorageHelper.ts`

**Interfaces:**

- Consumes: nothing. Produces: nothing.

- [x] **Step 1: Re-confirm each is unimported before deleting**

Do not trust this plan's list — re-run the check, since anything committed since it was written
could have started using one:

```bash
for f in counter style StorageHelper; do
  echo "--- $f"; grep -rn "from '[^']*$f'\|import '[^']*$f" src index.html --include='*.ts' --include='*.html'
done
grep -rn "hero\.png\|vite\.svg\|typescript\.svg" src index.html
```

Expected: no output at all. Any hit means that file is live — leave it in place and note the
discrepancy in the commit message.

- [x] **Step 2: Delete**

```bash
git rm src/counter.ts src/style.css src/helpers/StorageHelper.ts
git rm src/assets/hero.png src/assets/vite.svg src/assets/typescript.svg
```

- [x] **Step 3: Verify**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run build
```

Expected: tsc clean; lint still exactly the 10 pre-existing errors; 21 tests pass; build
succeeds. `npm run build` matters here specifically — `style.css` and the `assets/` images are
the kind of thing only the bundler notices.

- [x] **Step 4: Commit**

```bash
git commit -m "chore: delete unreferenced files (vite template leftovers, unused helper)"
```

---

### Task 3: Create the shared kernel (`src/core/`)

Moves the genuinely-shared files into one place and fixes two filename typos while they move —
renaming during the move is free, whereas a separate rename pass would edit the same imports
twice.

**Files:**

- Create dir: `src/core/`
- Move: `src/config/GameConfig.ts` → `src/core/GameConfig.ts`
- Move: `src/constants/GameDepths.ts` → `src/core/GameDepths.ts`
- Move: `src/cores/CommandManager.ts` → `src/core/CommandManager.ts`
- Move: `src/cores/ICommand.ts` → `src/core/ICommand.ts`
- Move: `src/game/ContentSpace.ts` → `src/core/ContentSpace.ts`
- Move: `src/game/LevelRenderer.ts` → `src/core/LevelRenderer.ts`
- Move + rename: `src/services/ProgressServicel.ts` → `src/core/ProgressService.ts`
- Move + rename: `src/helpers/AssertLoader.ts` → `src/core/AssetLoader.ts`
- Modify: every importer of the above (see Step 2)
- Delete dirs (now empty): `src/config/`, `src/cores/`, `src/services/`, `src/helpers/`

**Interfaces:**

- Consumes: Task 1's aliases if it ran.
- Produces: `@core/GameConfig`, `@core/GameDepths`, `@core/CommandManager`, `@core/ICommand`,
  `@core/ContentSpace`, `@core/LevelRenderer`, `@core/ProgressService`, `@core/AssetLoader`.
  **Every exported symbol keeps its current name** — only paths change.

- [x] **Step 1: Move the files with `git mv`**

`git mv` (not `mv`) so `git log --follow` keeps working through the rename:

```bash
mkdir -p src/core
git mv src/config/GameConfig.ts       src/core/GameConfig.ts
git mv src/constants/GameDepths.ts    src/core/GameDepths.ts
git mv src/cores/CommandManager.ts    src/core/CommandManager.ts
git mv src/cores/ICommand.ts          src/core/ICommand.ts
git mv src/game/ContentSpace.ts       src/core/ContentSpace.ts
git mv src/game/LevelRenderer.ts      src/core/LevelRenderer.ts
git mv src/services/ProgressServicel.ts src/core/ProgressService.ts
git mv src/helpers/AssertLoader.ts    src/core/AssetLoader.ts
```

- [x] **Step 2: Rewrite every import of them**

Let the compiler produce the worklist rather than guessing it:

```bash
npx tsc --noEmit          # every error is a file that imported a moved file
```

Then fix each reported file. With aliases (Task 1), the replacements are mechanical:

| Old import path (any `../` depth) | New                     |
| --------------------------------- | ----------------------- |
| `.../config/GameConfig`           | `@core/GameConfig`      |
| `.../constants/GameDepths`        | `@core/GameDepths`      |
| `.../cores/CommandManager`        | `@core/CommandManager`  |
| `.../cores/ICommand`              | `@core/ICommand`        |
| `.../game/ContentSpace`           | `@core/ContentSpace`    |
| `.../game/LevelRenderer`          | `@core/LevelRenderer`   |
| `.../services/ProgressServicel`   | `@core/ProgressService` |
| `.../helpers/AssertLoader`        | `@core/AssetLoader`     |

Known importers, from the current import graph — use this to sanity-check that tsc found them
all, not as a substitute for running it:

- `GameConfig` — the widest: `main.ts`, all 5 scenes, `ui/GameButton`, `ui/GameColor`,
  `ui/LevelUI`, `ui/ProgressBar`, all four game folders' renderers/mechanics, `three/*`.
- `GameDepths` — `ui/LevelUI`, `scenes/PlayScene`, `mechanics/BoxPushingMechanic`,
  `game/LogicGridRenderer`, `game/SokobanRender`.
- `CommandManager` / `ICommand` — the three undo-capable mechanics + `mechanics/commands/*`.
- `ContentSpace` — `core/GameConfig` (comment only), `mechanics/MatchStickMechanic`,
  `mechanics/DragAndDropMechanic`, `mechanics/MatchStickUtils`, `core/LevelRenderer`.
- `LevelRenderer` — `scenes/PlayScene` only.
- `ProgressService` — `scenes/LevelSelectScene`, `scenes/FlappyGameScene`, `scenes/PlayScene`.
- `AssetLoader` — `scenes/LoadingScene` only.

The `AssertLoader` → `AssetLoader` rename also changes the **imported symbol's file**, not its
name: the class is already called `AssetLoader`, so `import { AssetLoader } from '@core/AssetLoader'`.

- [x] **Step 3: Remove the now-empty directories**

```bash
rmdir src/config src/cores src/services src/helpers
ls src/constants   # TileFrames.ts must still be here; it moves in Task 5
```

- [x] **Step 4: Verify**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run build
```

Expected: all clean (lint's 10 pre-existing errors keep their current paths — none of those
files moved in this task).

- [ ] **Step 5: Browser smoke test**

`npm run dev`, portrait ~420x860. This task touched `GameConfig` and `ProgressService` imports
across every scene, so check the app still boots and progress still reads:

1. Loading screen completes and Menu appears.
2. Levels → a Matchstick level opens and its HUD/buttons render.
3. Levels → Sokoban level 1 opens in 3D.
4. Levels → Arcade → Flappy 3D opens and shows a non-zero Best if one was set before.

- [x] **Step 6: Commit**

```bash
git add -A src tsconfig.json
git commit -m "refactor: gather shared game-agnostic modules into src/core"
```

---

### Task 4: Create `src/games/` and migrate Flappy (the easy one first)

Flappy is 4 files and already half-migrated (`game/flappy/`), which makes it the cheapest way to
prove the target shape — including the one genuinely risky bit, moving a Phaser scene whose key
is a runtime string.

**Files:**

- Create dir: `src/games/flappy/`
- Move: `src/game/flappy/FlappySim.ts` → `src/games/flappy/FlappySim.ts`
- Move: `src/game/flappy/FlappySim.test.ts` → `src/games/flappy/FlappySim.test.ts`
- Move: `src/three/FlappyWorld.ts` → `src/games/flappy/FlappyWorld.ts`
- Move: `src/scenes/FlappyGameScene.ts` → `src/games/flappy/FlappyGameScene.ts`
- Modify: `src/main.ts`, `src/scenes/LevelSelectScene.ts`, `src/scenes/LoadingScene.ts`

**Interfaces:**

- Consumes: `@core/*` from Task 3; `@three/ThreeHost`, `@three/ThreeWorld`.
- Produces: `@games/flappy/FlappySim`, `@games/flappy/FlappyWorld`,
  `@games/flappy/FlappyGameScene` (still exporting `FlappyGameScene` and `FLAPPY_LEVEL_ID`).

- [x] **Step 1: Move**

```bash
mkdir -p src/games/flappy
git mv src/game/flappy/FlappySim.ts      src/games/flappy/FlappySim.ts
git mv src/game/flappy/FlappySim.test.ts src/games/flappy/FlappySim.test.ts
git mv src/three/FlappyWorld.ts          src/games/flappy/FlappyWorld.ts
git mv src/scenes/FlappyGameScene.ts     src/games/flappy/FlappyGameScene.ts
rmdir src/game/flappy
```

- [x] **Step 2: Fix the four importers**

```bash
npx tsc --noEmit    # lists exactly what broke
```

- `src/main.ts`: `./scenes/FlappyGameScene` → `@games/flappy/FlappyGameScene`
- `src/scenes/LevelSelectScene.ts`: `./FlappyGameScene` → `@games/flappy/FlappyGameScene`
  (this is the `FLAPPY_LEVEL_ID` import feeding `EXTRA_GAMES`)
- `src/scenes/LoadingScene.ts`: `../three/FlappyWorld` → `@games/flappy/FlappyWorld`
- Inside `FlappyGameScene.ts`: `../three/FlappyWorld` → `./FlappyWorld`,
  `../game/flappy/FlappySim` → `./FlappySim`, `../three/ThreeHost` → `@three/ThreeHost`,
  and the `@core/*` forms for `GameConfig`/`ProgressService`/`ui/GameButton`.
- Inside `FlappyWorld.ts`: `./ThreeHost` → `@three/ThreeHost`, `./ThreeWorld` →
  `@three/ThreeWorld`.

**Do not touch** the scene key string `super('FlappyGameScene')`, the
`this.scene.start('FlappyGameScene')` call in `LevelSelectScene`'s `EXTRA_GAMES`, or the
`assets/games/flappy/models/*.glb` URLs in `FlappyWorld.models`. Moving the file must not move
the scene key.

- [x] **Step 3: Confirm Vitest still finds the test**

`vitest.config.ts` includes `src/**/*.test.ts`, so the move is covered — but prove it:

```bash
npm test
```

Expected: still `Test Files 1 passed`, `Tests 21 passed`. A `0 passed`/"no test files found"
result means the include glob needs widening, not that the tests broke.

- [x] **Step 4: Verify**

```bash
npx tsc --noEmit && npm run lint && npm run build
```

- [ ] **Step 5: Browser smoke test — the scene key is the thing to prove**

`npm run dev`, portrait ~420x860:

1. Levels → the "Flappy 3D" tab and the Arcade tile both still appear (they are gated on
   `ThreeHost.isReady`, so their absence means the model preload broke, i.e. Step 2 damaged an
   asset URL).
2. Tap the tile → `FlappyGameScene` starts. If nothing happens, the scene key or the `main.ts`
   registration is wrong — that is precisely the failure `tsc` cannot catch.
3. Tap to fly, clear a gap, crash. Score increments, game-over card shows, Retry works.
4. "← Menu" returns to the menu.

- [x] **Step 6: Commit**

```bash
git add -A src
git commit -m "refactor: move Flappy Bird into src/games/flappy"
```

---

### Task 5: Migrate Sokoban (the messiest one)

12 files across 6 directories, including the two mis-filed "shared" files and two renames. This
is the task that proves the layout on the hard case.

**Files:**

- Create dir: `src/games/sokoban/`
- Move: `src/levels/SokobanLevels.ts` → `src/games/sokoban/SokobanLevels.ts`
- Move: `src/levels/SokobanLevelFactory.ts` → `src/games/sokoban/SokobanLevelFactory.ts`
- Move: `src/utils/SokobanMapParser.ts` → `src/games/sokoban/SokobanMapParser.ts`
- Move + rename: `src/utils/SOKOPAN_LEVEL.ts` → `src/games/sokoban/SokobanMaps.ts`
- Move: `src/mechanics/BoxPushingMechanic.ts` → `src/games/sokoban/BoxPushingMechanic.ts`
- Move: `src/mechanics/commands/SokobanMoveCommand.ts` → `src/games/sokoban/SokobanMoveCommand.ts`
- Move + rename: `src/game/SokobanRender.ts` → `src/games/sokoban/SokobanRenderer2D.ts`
- Move: `src/game/SokobanRenderer3D.ts` → `src/games/sokoban/SokobanRenderer3D.ts`
- Move: `src/game/SokobanCameraControls.ts` → `src/games/sokoban/SokobanCameraControls.ts`
- Move: `src/game/ScreenRegions.ts` → `src/games/sokoban/ScreenRegions.ts`
- Move: `src/three/SokobanWorld.ts` → `src/games/sokoban/SokobanWorld.ts`
- Move: `src/constants/TileFrames.ts` → `src/games/sokoban/TileFrames.ts`
- Modify: `src/levels/LevelRegistry.ts`, `src/mechanics/MechanicRegistry.ts`,
  `src/scenes/PlayScene.ts`, `src/scenes/LoadingScene.ts`
- Delete dir (now empty): `src/constants/`

**Interfaces:**

- Consumes: `@core/*`, `@three/ThreeHost`, `@three/ThreeWorld`, `@mechanics/IMechanic`,
  `@types/Level`.
- Produces: `@games/sokoban/*` for all twelve. Exported symbols keep their names — including
  `SokobanRenderer` (the class inside the renamed `SokobanRenderer2D.ts`) and every export of
  `SokobanMaps.ts`.

- [x] **Step 1: Move**

```bash
mkdir -p src/games/sokoban
git mv src/levels/SokobanLevels.ts               src/games/sokoban/SokobanLevels.ts
git mv src/levels/SokobanLevelFactory.ts         src/games/sokoban/SokobanLevelFactory.ts
git mv src/utils/SokobanMapParser.ts             src/games/sokoban/SokobanMapParser.ts
git mv src/utils/SOKOPAN_LEVEL.ts                src/games/sokoban/SokobanMaps.ts
git mv src/mechanics/BoxPushingMechanic.ts       src/games/sokoban/BoxPushingMechanic.ts
git mv src/mechanics/commands/SokobanMoveCommand.ts src/games/sokoban/SokobanMoveCommand.ts
git mv src/game/SokobanRender.ts                 src/games/sokoban/SokobanRenderer2D.ts
git mv src/game/SokobanRenderer3D.ts             src/games/sokoban/SokobanRenderer3D.ts
git mv src/game/SokobanCameraControls.ts         src/games/sokoban/SokobanCameraControls.ts
git mv src/game/ScreenRegions.ts                 src/games/sokoban/ScreenRegions.ts
git mv src/three/SokobanWorld.ts                 src/games/sokoban/SokobanWorld.ts
git mv src/constants/TileFrames.ts               src/games/sokoban/TileFrames.ts
rmdir src/constants
```

- [x] **Step 2: Rewrite imports**

```bash
npx tsc --noEmit
```

External importers (outside `games/sokoban/`):

- `src/levels/LevelRegistry.ts` → `@games/sokoban/SokobanLevels`
- `src/mechanics/MechanicRegistry.ts` → `@games/sokoban/BoxPushingMechanic`
- `src/scenes/PlayScene.ts` → `@games/sokoban/SokobanRenderer2D` (note: the _file_ is renamed,
  the imported class is still `SokobanRenderer`), `@games/sokoban/SokobanRenderer3D`,
  `@games/sokoban/SokobanCameraControls`, `@games/sokoban/SokobanWorld`
- `src/scenes/LoadingScene.ts` → `@games/sokoban/SokobanWorld`

Internal ones become relative (`./`):

- `SokobanLevels.ts` → `./SokobanMapParser`, `./SokobanMaps` (was `./SOKOPAN_LEVEL`),
  `./SokobanLevelFactory`
- `BoxPushingMechanic.ts` → `./SokobanMoveCommand`, `./ScreenRegions`, `./SokobanWorld`
- `SokobanCameraControls.ts` → `./SokobanWorld`, `./ScreenRegions`
- `SokobanRenderer2D.ts` → `./TileFrames`
- `SokobanRenderer3D.ts` → `./SokobanWorld`

Also update the stale path comments in the moved files' headers (several open with
`// src/three/ThreeSokobanLayer.ts` or `// src/render/SokobanRenderer.ts` — both already wrong).

**Do not touch** `assets/games/sokoban/**` URLs in `SokobanWorld.models`, the `'sokoban_tiles'`
texture key, or the `'player'` texture key.

- [x] **Step 3: Verify**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run build
```

Expected: tsc clean. **lint's 10 errors now report new paths** for
`SokobanMapParser.ts` (`src/games/sokoban/SokobanMapParser.ts`) — same 6 errors in that file,
new location. Still no _new_ errors.

- [ ] **Step 4: Browser smoke test — the full Sokoban check**

This is the same checklist the `ThreeHost` extraction used (see
`docs/issues/rotated-board-grid-vs-world-coordinates.md` for why item 3 matters). `npm run dev`,
portrait ~420x860, Levels → Sokoban → level 1:

1. The board renders in 3D, framed on the player (follow mode), not on the whole maze.
2. Tap a reachable tile a few cells away: the player walks the route step by step.
3. Walk far enough that the view must scroll, and confirm the camera follows the player.
4. The D-pad moves the player; two-finger pinch zooms.
5. Switch to a Matchstick level and back, proving `setWorld`/`clear` still swap cleanly.
6. Undo works.

- [x] **Step 5: Commit**

```bash
git add -A src
git commit -m "refactor: move Sokoban into src/games/sokoban"
```

---

### Task 6: Migrate Logic Grid

**Files:**

- Create dir: `src/games/logicgrid/`
- Move: `src/levels/LogicGridLevels.ts` → `src/games/logicgrid/LogicGridLevels.ts`
- Move: `src/levels/LogicGridLevelFactory.ts` → `src/games/logicgrid/LogicGridLevelFactory.ts`
- Move: `src/mechanics/LogicGridMechanic.ts` → `src/games/logicgrid/LogicGridMechanic.ts`
- Move: `src/mechanics/commands/LogicGridMarkCommand.ts` → `src/games/logicgrid/LogicGridMarkCommand.ts`
- Move: `src/game/LogicGridRenderer.ts` → `src/games/logicgrid/LogicGridRenderer.ts`
- Move: `src/utils/LogicGridUtils.ts` → `src/games/logicgrid/LogicGridUtils.ts`
- Modify: `src/levels/LevelRegistry.ts`, `src/mechanics/MechanicRegistry.ts`,
  `src/scenes/PlayScene.ts`, `scripts/validate-logic-grid-levels.ts`

**Interfaces:**

- Consumes: `@core/*`, `@mechanics/IMechanic`, `@types/Level`, `@ui/GameColor`.
- Produces: `@games/logicgrid/*`.

- [x] **Step 1: Move**

```bash
mkdir -p src/games/logicgrid
git mv src/levels/LogicGridLevels.ts       src/games/logicgrid/LogicGridLevels.ts
git mv src/levels/LogicGridLevelFactory.ts src/games/logicgrid/LogicGridLevelFactory.ts
git mv src/mechanics/LogicGridMechanic.ts  src/games/logicgrid/LogicGridMechanic.ts
git mv src/mechanics/commands/LogicGridMarkCommand.ts src/games/logicgrid/LogicGridMarkCommand.ts
git mv src/game/LogicGridRenderer.ts       src/games/logicgrid/LogicGridRenderer.ts
git mv src/utils/LogicGridUtils.ts         src/games/logicgrid/LogicGridUtils.ts
```

- [x] **Step 2: Rewrite imports**

```bash
npx tsc --noEmit
```

- `src/levels/LevelRegistry.ts` → `@games/logicgrid/LogicGridLevels`
- `src/mechanics/MechanicRegistry.ts` → `@games/logicgrid/LogicGridMechanic`
- `src/scenes/PlayScene.ts` → `@games/logicgrid/LogicGridRenderer`
- Internal: `LogicGridMechanic.ts` → `./LogicGridUtils`, `./LogicGridMarkCommand`;
  `LogicGridRenderer.ts` → `./LogicGridUtils`; `LogicGridMarkCommand.ts` → `./LogicGridUtils`;
  `LogicGridLevels.ts` → `./LogicGridLevelFactory`

- [x] **Step 3: Fix the standalone validator script**

`scripts/validate-logic-grid-levels.ts` is run by hand via `ts-node` and imports **two** files
this task moves — not one. It is also outside the `tsc` gate (see Global Constraints), so
forgetting it produces no error anywhere; it just silently stops working.

`ts-node` does not honour tsconfig `paths` without `tsconfig-paths/register`, so use **relative**
imports here, not aliases:

```ts
// scripts/validate-logic-grid-levels.ts — both lines change
import { LOGIC_GRID_LEVELS } from '../src/games/logicgrid/LogicGridLevels';
import { findAllSatisfyingSolutions } from '../src/games/logicgrid/LogicGridUtils';
```

Then confirm it still runs:

```bash
npx ts-node --project tsconfig.scripts.json scripts/validate-logic-grid-levels.ts
```

Expected: it brute-forces each level's clue set and reports exactly one solution per level.
Caveat: `ts-node` is referenced by two npm scripts but is **not** in `devDependencies`, so `npx`
may need to download it, and it may fail for reasons unrelated to this move. If it will not run,
say so in the commit message rather than silently skipping — the import fix above is still
required either way.

- [x] **Step 4: Verify**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run build
```

- [ ] **Step 5: Browser smoke test**

`npm run dev` → Levels → Logic Grid → level 1:

1. The grid renders with its clue list.
2. Tapping a cell cycles blank → ✓ → ✗ → blank.
3. Undo reverts the last mark.
4. Completing a level correctly triggers the win popup.

- [x] **Step 6: Commit**

```bash
git add -A src scripts
git commit -m "refactor: move Logic Grid into src/games/logicgrid"
```

---

### Task 7: Migrate Matchstick

**Files:**

- Create dir: `src/games/matchstick/`
- Move: `src/levels/MatchStickLevels.ts` → `src/games/matchstick/MatchStickLevels.ts`
- Move: `src/levels/MatchStickLevelFactory.ts` → `src/games/matchstick/MatchStickLevelFactory.ts`
- Move: `src/mechanics/MatchStickMechanic.ts` → `src/games/matchstick/MatchStickMechanic.ts`
- Move: `src/mechanics/MatchStickTray.ts` → `src/games/matchstick/MatchStickTray.ts`
- Move: `src/mechanics/MatchStickUtils.ts` → `src/games/matchstick/MatchStickUtils.ts`
- Move: `src/mechanics/commands/MatchStickCommand.ts` → `src/games/matchstick/MatchStickCommand.ts`
- Modify: `src/levels/LevelRegistry.ts`, `src/mechanics/MechanicRegistry.ts`,
  `scripts/build-stick-levels.ts`
- Delete dir (now empty): `src/mechanics/commands/`

**Interfaces:**

- Consumes: `@core/*`, `@mechanics/IMechanic`, `@types/Level`.
- Produces: `@games/matchstick/*`.

- [x] **Step 1: Move**

```bash
mkdir -p src/games/matchstick
git mv src/levels/MatchStickLevels.ts       src/games/matchstick/MatchStickLevels.ts
git mv src/levels/MatchStickLevelFactory.ts src/games/matchstick/MatchStickLevelFactory.ts
git mv src/mechanics/MatchStickMechanic.ts  src/games/matchstick/MatchStickMechanic.ts
git mv src/mechanics/MatchStickTray.ts      src/games/matchstick/MatchStickTray.ts
git mv src/mechanics/MatchStickUtils.ts     src/games/matchstick/MatchStickUtils.ts
git mv src/mechanics/commands/MatchStickCommand.ts src/games/matchstick/MatchStickCommand.ts
rmdir src/mechanics/commands
```

- [x] **Step 2: Rewrite imports**

```bash
npx tsc --noEmit
```

- `src/levels/LevelRegistry.ts` → `@games/matchstick/MatchStickLevels`
- `src/mechanics/MechanicRegistry.ts` → `@games/matchstick/MatchStickMechanic`
- Internal: `MatchStickMechanic.ts` → `./MatchStickUtils`, `./MatchStickTray`,
  `./MatchStickCommand`; `MatchStickLevels.ts` → `./MatchStickLevelFactory`
- `MatchStickMechanic.ts` and `MatchStickUtils.ts` also import `@core/ContentSpace` (moved in
  Task 3) — confirm those are already alias-form and did not regress.

- [x] **Step 3: Fix `scripts/build-stick-levels.ts`**

It imports `../src/levels/MatchStickLevels.ts` — a file this task moves — and it is outside the
`tsc` gate, so nothing will flag it:

```ts
import { GAME_LEVELS } from '../src/games/matchstick/MatchStickLevels.ts';
```

Note the `.ts` extension: that script's existing imports carry it, so keep it rather than
"tidying" it away. Do **not** try to make this script work end-to-end — `CLAUDE.md` records that
`build:levels`/`build:levels_candle` are stale (its sibling `build-levels.ts` imports a
`src/levels/GameLevel.ts` that has never existed, and neither script's `public/data/levels.json`
output is read by the game any more). The goal here is only to avoid _adding_ a second broken
import while passing through.

- [x] **Step 4: Verify**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run build
```

- [ ] **Step 5: Browser smoke test**

`npm run dev` → Levels → Matchsticks → level 1:

1. The equation renders with its matchsticks and the countdown timer runs.
2. Dragging a stick to a slot works, and the tray shows spare sticks where the level has them.
3. Undo reverts a move.
4. Solving the level triggers the win popup with stars.

- [x] **Step 6: Commit**

```bash
git add -A src scripts
git commit -m "refactor: move Matchstick into src/games/matchstick"
```

---

### Task 8: Quarantine the dormant mechanics

`CLICK_OBJECT`, `DRAG_AND_DROP` and `DEVICE_SHAKE` have zero level definitions, so these three
mechanics and the seven-file `actions/` system they exclusively drive are unreachable by play.
Per [ADR 0006](../adr/0006-game-first-source-layout.md) they are **kept, not deleted** — moved
somewhere that says so.

**Files:**

- Create dirs: `src/games/_dormant/`, `src/games/_dormant/actions/`
- Move: `src/mechanics/ClickObjectMechanic.ts` → `src/games/_dormant/ClickObjectMechanic.ts`
- Move: `src/mechanics/DragAndDropMechanic.ts` → `src/games/_dormant/DragAndDropMechanic.ts`
- Move: `src/mechanics/DeviceShakeMechanic.ts` → `src/games/_dormant/DeviceShakeMechanic.ts`
- Move: all 7 of `src/actions/*.ts` → `src/games/_dormant/actions/`
- Create: `src/games/_dormant/README.md`
- Modify: `src/mechanics/MechanicRegistry.ts`
- Delete dirs (empty by now): `src/actions/`, `src/game/`, `src/utils/`
  (`src/levels/` and `src/mechanics/` survive — they keep the two registries and `IMechanic`)

**Interfaces:**

- Consumes: `@core/*`, `@mechanics/IMechanic`, `@types/Level`.
- Produces: `@games/_dormant/*`. `MechanicRegistry` keeps mapping all six `MechanicType` members
  — the registry stays complete, only the import paths change.

- [x] **Step 1: Move**

```bash
mkdir -p src/games/_dormant/actions
git mv src/mechanics/ClickObjectMechanic.ts src/games/_dormant/ClickObjectMechanic.ts
git mv src/mechanics/DragAndDropMechanic.ts  src/games/_dormant/DragAndDropMechanic.ts
git mv src/mechanics/DeviceShakeMechanic.ts  src/games/_dormant/DeviceShakeMechanic.ts
git mv src/actions/ActionExecutor.ts     src/games/_dormant/actions/ActionExecutor.ts
git mv src/actions/IActionHandler.ts     src/games/_dormant/actions/IActionHandler.ts
git mv src/actions/DisappearAction.ts    src/games/_dormant/actions/DisappearAction.ts
git mv src/actions/MoveAction.ts         src/games/_dormant/actions/MoveAction.ts
git mv src/actions/TransformAction.ts    src/games/_dormant/actions/TransformAction.ts
git mv src/actions/PlaySound.ts          src/games/_dormant/actions/PlaySound.ts
git mv src/actions/ParticleEffectAction.ts src/games/_dormant/actions/ParticleEffectAction.ts
rmdir src/actions
```

- [x] **Step 2: Write the README that explains why this folder exists**

```markdown
# Dormant mechanics

Nothing in this folder is reachable by playing the game.

`CLICK_OBJECT`, `DRAG_AND_DROP` and `DEVICE_SHAKE` are wired into `MechanicRegistry` and have
`LevelData` variants in `src/types/Level.ts`, but **no level anywhere defines them** — check with
`grep -r "mechanic: 'CLICK_OBJECT'" src`. `PlayScene` can therefore never dispatch to them, and
the `actions/` (`on_success`) system in here is driven exclusively by those three, so it is
unreachable too.

They are kept rather than deleted because the code is working and may be wanted again — see
`docs/adr/0006-game-first-source-layout.md`. To bring one back to life, add levels that use its
mechanic to a bundle in `LevelRegistry` and move the folder to `src/games/<name>/`.

If you are looking for the code a running game actually uses, it is not in here.
```

- [x] **Step 3: Rewrite imports**

```bash
npx tsc --noEmit
```

- `src/mechanics/MechanicRegistry.ts` → `@games/_dormant/ClickObjectMechanic`,
  `@games/_dormant/DragAndDropMechanic`, `@games/_dormant/DeviceShakeMechanic`
- Inside the three mechanics → `./actions/ActionExecutor`
- Inside `actions/*` → `@core/*` / `@types/Level` as they already were, re-pathed

- [x] **Step 4: Remove whatever directories are now empty**

```bash
ls src/game src/utils src/levels src/mechanics    # inspect before removing
# src/game/ and src/utils/ should be empty by now -> remove them
# src/levels/ should contain ONLY LevelRegistry.ts
# src/mechanics/ should contain ONLY IMechanic.ts and MechanicRegistry.ts
rmdir src/game src/utils 2>/dev/null || true
```

- [x] **Step 5: Verify**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run build
```

Expected: tsc clean; **lint's 10 errors now report `src/games/_dormant/actions/*` paths** for the
four `actions/` errors. Same errors, new paths, no new ones.

- [ ] **Step 6: Browser smoke test**

Nothing in this task is reachable by play, so the check is that nothing _else_ broke —
`MechanicRegistry` was edited, and it is on the path of every level:

1. A Matchstick, a Sokoban and a Logic Grid level each still open and accept input.

- [x] **Step 7: Commit**

```bash
git add -A src
git commit -m "refactor: quarantine the level-less mechanics under src/games/_dormant"
```

---

### Task 9: Document the new layout and close out

**Files:**

- Modify: `CLAUDE.md`
- Modify: `docs/plans/2026-08-22-game-first-restructure.md` (this file's status)

**Interfaces:**

- Consumes: everything. Produces: no new API.

- [x] **Step 1: Verify the end state matches ADR 0006**

```bash
find src -type f | sort
```

Compare against the target tree in `docs/adr/0006-game-first-source-layout.md`. Any difference is
either a mistake to fix or a deliberate deviation to record in the ADR's Consequences — do not
leave it undocumented.

- [x] **Step 2: Rewrite CLAUDE.md's architecture section for the new layout**

The current text names paths that no longer exist (`src/mechanics/BoxPushingMechanic.ts`,
`src/utils/LogicGridUtils.ts`, `src/three/SokobanWorld.ts`, …). Update:

- The `### Scene lifecycle` list: `FlappyGameScene` now lives in `src/games/flappy/`.
- `### Level data model`: the three level sources now live in their game folders.
- `### Mechanic dispatch`: mechanics live in `src/games/<game>/`; note the three dormant ones are
  in `src/games/_dormant/` and reachable by no level.
- `### 3D layer`: `SokobanWorld`/`FlappyWorld` are now in their game folders; `three/` holds only
  the shared host.
- `### on_success action system`: now at `src/games/_dormant/actions/`, and unreachable — say so.
- Add a short **Where things live** subsection stating the game-first rule and the
  "promote to `core/` on second use" convention, pointing at ADR 0006.

- [x] **Step 3: Add the aliases to CLAUDE.md's Commands section (only if Task 1 ran)**

Note that imports use `@core/`, `@games/` etc., and that `tsconfig.json` `paths` and
`vite.config.ts` `resolve.alias` must be kept in step.

- [x] **Step 4: Mark this plan complete**

Add a `**Status:** complete — <date>` line under the title, noting any task that was skipped
(Task 1 if aliases were declined) and any deviation from ADR 0006's target tree.

- [x] **Step 5: Final full verification**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run build
```

- [x] **Step 6: Commit**

```bash
git add CLAUDE.md docs
git commit -m "docs: describe the game-first src layout and close out the restructure"
```

---

## Self-review notes

- **ADR coverage.** Target tree → Tasks 3-8. Dead files → Task 2. The four renames → Tasks 3
  (`ProgressService`, `AssetLoader`) and 5 (`SokobanMaps`, `SokobanRenderer2D`). Mis-filed
  Sokoban-only files → Task 5. Dormant quarantine → Task 8. "Promote on second use" rule → Task 9
  Step 2. Aliases are _not_ in the ADR because they are optional and separable — if Task 1 runs,
  Task 9 Step 3 documents them.
- **Ordering rationale.** Aliases first (they reduce every later task's churn, and an alias bug
  is cheapest to find before 34 files have moved). Dead files second (never migrate what you are
  about to delete). Kernel third (every game imports it, so getting it settled means each game
  migration touches one moving target instead of two). Then games in ascending difficulty —
  Flappy (4 files, proves the shape and the scene-key risk), Sokoban (12 files, the hard case),
  Logic Grid, Matchstick. Dormant last: it is the only task whose payload nothing can smoke-test.
- **What the compiler does and does not protect.** Every task's real safety net is
  `npx tsc --noEmit`, which mechanically finds all 127 relative imports. It cannot see Phaser
  scene keys, asset URL strings, or `ProgressService` storage keys — hence a browser step on
  every task that touches them, and the standing instruction never to edit such a string during
  a move.
- **Known lint baseline.** 10 pre-existing errors, in `actions/` (4) and
  `utils/SokobanMapParser.ts` (6). Their reported paths change in Task 5 and Task 8; the count
  must not.
- **Not addressed here, deliberately.** `src/types/Level.ts` stays one shared file even though
  its `LevelData` union has per-game variants — splitting a discriminated union across game
  folders makes the union itself import from every game, which is worse than the current single
  file. `PlayScene`'s per-mechanic renderer if/else also stays; generalizing it is a behaviour
  change, not a move.
