# Sound Effects Layer — Task Breakdown

**Date:** 2026-08-24
**Spec:** `docs/superpowers/specs/2026-08-24-sfx-audio-design.md`

## Provenance

Produced with the `task-breakdown` skill, but **not by its intended agent pipeline**. Four
subagents — one scout and two reviewers, plus a follow-up request to each — went idle without
delivering any report, so the repository inventory and both review lenses (dependency/isolation
and convention/scope) were run inline in the main session instead. This plan therefore had one
adversarial pass, not two independent ones. Treat the sub-task boundaries as sound and the
acceptance criteria as reviewed; treat "nothing was missed" as less certain than the pipeline
would normally give you.

## Verified inventory

Facts confirmed against the repo at commit `dd017df`. Two of them contradicted the spec as
first written; the spec has since been corrected.

- **`ts-node` is not a devDependency.** `package.json`'s `build:levels` and
  `build:levels_candle` invoke it, which is why `CLAUDE.md` documents them as broken. The
  generator uses `tsx` (a new devDependency) instead.
- **`vitest.config.ts` has `include: ['src/**/_.test.ts']`.** Anything under `scripts/`is
untested until`'scripts/\*\*/_.test.ts'` is added to that glob.
- `.gitignore` has no rule affecting `public/assets/audio/`. Safe to commit generated WAVs.
- `phaser ^4.1.0`, `vitest ^4.1.4`. The only existing test is `src/games/flappy/FlappySim.test.ts`.
- **Sokoban's four outcomes all funnel through one function**, `BoxPushingMechanic.executeMove`
  (line 359): invalid at 362 (`if (!moveRes.valid) return`), push at 375
  (`moveRes.boxIndex !== undefined`), box-on-target at 380 (`baseGrid[..] === 2`, directly beside
  the existing `SokobanWorld.spawnPlacementBurst`), plain step after.
- **Matchstick has five separate command sites**: `MatchstickMechanic.ts` lines 88, 154, 200,
  216, 247.
- **Logic Grid has one**: `LogicGridMechanic.handleTap`, ~lines 55-70.
- **Nine `scene.start` sites**: `LoadingScene:58`, `MenuScene:54`, `MenuScene:61`,
  `LevelSelectScene:124`, `LevelSelectScene:326`, `LevelSelectScene:411`, `PlayScene:77`,
  `FlappyGameScene:144`, `FlappyGameScene:200`. All but `LoadingScene:58` get `SCENE_SWISH`.
- `MenuScene` has exactly two buttons (`playBtn` at `cy`, `levelsBtn` at `cy + ui(60)`) and an
  `animateButtonIn` helper.
- `LevelSelectScene`: tabs at 186, the tile `isUnlocked` fork at ~296-333, arcade tile at 395.
- `PlayScene`: undo handler 89, `handleWinLevel` 315, `handleLoseLevel` 348, back-to-levels 77.
- `FlappyGameScene`: flap 78, score read 98, crash/game-over 106 (with `isBest`), backs 144, 200.
- `AssetLoader.queueLevelAssets(scene, levels)` is static; `LoadingScene.preload` calls it once.
- `main.ts` binds `ThreeHost` on `game.events.once(Phaser.Core.Events.READY, ...)`.
- `ProgressService` is a static class with a private `STORAGE_KEY` and try/catch + `console.error`
  around both reads and writes, returning a default object on a miss.

## Sub-tasks

| ID  | Sub-task Name                | Target File Scope (Specific Paths)                                                                                                                                                                           | Acceptance Criteria (Definition of Done)                                                                                                                                                                                                                        | Cost   |
| --- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 1   | Sound catalogue + generator  | NEW `src/core/SfxCatalogue.ts`; NEW `scripts/generate-sfx.ts`; NEW `scripts/generate-sfx.test.ts`; `vitest.config.ts`; `package.json`; `CLAUDE.md` (command list only); NEW `public/assets/audio/*.wav` (14) | `npm run build:sfx` writes 14 WAVs; `npm test` passes with the new tests (every `SfxId` has a recipe, paths unique, valid 44-byte RIFF header, no int16 clipping); `npm run lint` clean. **Do not iterate on how the sounds sound.**                            | Medium |
| 2   | AudioService + boot wiring   | NEW `src/core/AudioService.ts`; NEW `src/core/SettingsService.ts`; `src/core/AssetLoader.ts`; `src/scenes/LoadingScene.ts`; `src/main.ts`                                                                    | `npm run build` passes; game boots clean; `game.cache.audio.getKeys().length` is 14; `AudioService.play('WIN')` is audible; `setMuted(true)` silences and survives reload. **No sound on the LoadingScene→MenuScene transition — deliberate.**                  | Medium |
| 3   | Shared UI hook + mute button | `src/ui/GameButton.ts`; NEW `src/ui/MuteButton.ts`; `src/scenes/MenuScene.ts`                                                                                                                                | Every button in every scene clicks with no per-scene edit; mute button toggles its icon and persists across reload; both MenuScene transitions swish                                                                                                            | Medium |
| 4   | LevelSelectScene wiring      | `src/scenes/LevelSelectScene.ts` only                                                                                                                                                                        | Tabs play `UI_TAB`; a locked tile plays `DENIED` and does not navigate; **all three** `scene.start` sites swish — 124 (back), 326 (level tile), 411 (arcade tile)                                                                                               | Low    |
| 5   | Puzzle mechanics wiring      | `src/games/sokoban/BoxPushingMechanic.ts`; `src/games/matchstick/MatchstickMechanic.ts`; `src/games/logicgrid/LogicGridMechanic.ts`                                                                          | Sokoban blocked/step/push/box-on-target each sound distinct; a held arrow key does not machine-gun; matchstick places tick at all five command sites; logic-grid marks tick. **If Matchstick has no invalid-placement branch, drop `DENIED` there and say so.** | Medium |
| 6   | PlayScene + Flappy + ADR     | `src/scenes/PlayScene.ts`; `src/games/flappy/FlappyGameScene.ts`; NEW `docs/adr/0007-audio-via-phaser-sound-manager.md`; `CLAUDE.md` (architecture section)                                                  | Win/lose/undo fire; Flappy flaps, pips and thuds, with `NEW_BEST` only on a record; mute reachable from both HUDs and agreeing with the menu; `npm run build` passes                                                                                            | Medium |

## Execution order

**Strictly sequential for 1 → 2 → 3**, then 4, 5 and 6 in parallel off task 3.

These are not independent. Task 2 imports `SfxId` from task 1; tasks 4, 5 and 6 all call
`AudioService.play` from task 2; task 4 needs the `sfx` field task 3 adds to `ButtonOptions`;
task 6 needs task 3's `createMuteButton`. Since `npm run build` runs `tsc`, a branch cut before
its predecessor merged will not compile. **Cut each branch from the previous one's merge commit,
not from `main`.**

## What review changed

- **Moved the synthesis math out of `src/`.** The draft put it in `src/core/SfxSynth.ts` purely
  because `vitest.config.ts` only globs `src/`. Letting a test config dictate architecture is
  backwards and would ship build-only DSP code in the bundle. Fixed by extending the glob.
- **The generator must import relatively.** `tsx` does not resolve the `@core/*` alias, so
  `generate-sfx.ts` uses `../src/core/SfxCatalogue`, matching `validate-logic-grid-levels.ts`.
  This would have failed on first run.
- **`LevelSelectScene:124` was uncovered** — the back-to-menu transition had no swish while the
  other two did.
- **Split the docs.** The `build:sfx` command line goes with task 1, which adds the script; the
  ADR and architecture paragraph go with task 6. Both touch `CLAUDE.md` but in different
  sections and in sequence.
- **Rejected: splitting task 5.** Three mechanic files is wide, but Sokoban is four one-line
  insertions in a single function and Logic Grid is one. Splitting would push past six sub-tasks
  for no isolation gain. Overrule this if task 5 runs long.

## Branches

```bash
git checkout main && git pull
git checkout -b feature/sfx-1-catalogue-generator
# merge task 1, then:
git checkout -b feature/sfx-2-audio-service      # off sfx-1
git checkout -b feature/sfx-3-ui-hook-mute       # off sfx-2
# these three off sfx-3, in parallel:
git checkout -b feature/sfx-4-level-select
git checkout -b feature/sfx-5-mechanics
git checkout -b feature/sfx-6-play-flappy-docs
```

## Sub-task prompts

```
task: Build the SFX catalogue and the WAV generator per docs/superpowers/specs/2026-08-24-sfx-audio-design.md. Add 'scripts/**/*.test.ts' to vitest.config.ts include. Add tsx as a devDependency and a build:sfx script. Import the catalogue relatively (../src/core/SfxCatalogue), NOT via @core — tsx does not resolve the alias. | scope: src/core/SfxCatalogue.ts, scripts/generate-sfx.ts, scripts/generate-sfx.test.ts, vitest.config.ts, package.json, CLAUDE.md command list, public/assets/audio/ | criteria: npm run build:sfx emits 14 WAVs; npm test passes; npm run lint clean; do not tune aesthetics

task: Build AudioService and SettingsService and wire audio into the boot path per the spec. Mirror ProgressService's try/catch localStorage shape. Include the 40ms same-id rate limit, the cache.audio.exists guard, and NoAudioSoundManager safety. Do NOT add a sound to the LoadingScene→MenuScene transition. | scope: src/core/AudioService.ts, src/core/SettingsService.ts, src/core/AssetLoader.ts, src/scenes/LoadingScene.ts, src/main.ts | criteria: npm run build passes; 14 keys in the audio cache; AudioService.play('WIN') audible; mute persists across reload

task: Add the sfx hook to the shared button primitive and the mute button, per the spec. ButtonOptions gains sfx?: SfxId | 'none' defaulting to UI_TAP, played on pointerup before onClick. createMuteButton is a factory matching createButton's style — not a class. | scope: src/ui/GameButton.ts, src/ui/MuteButton.ts, src/scenes/MenuScene.ts | criteria: all buttons click with no per-scene edits; mute toggles icon and persists; both MenuScene transitions swish

task: Wire LevelSelectScene sounds per the spec. | scope: src/scenes/LevelSelectScene.ts | criteria: tabs play UI_TAB; locked tile plays DENIED and does not navigate; all three scene.start sites (lines 124, 326, 411) play SCENE_SWISH

task: Wire the three puzzle mechanics per the spec. Sokoban's four outcomes all live in executeMove (BoxPushingMechanic.ts:359) — invalid at 362, push at 375, box-on-target at 380 beside spawnPlacementBurst, plain step after. Matchstick has five command sites (88, 154, 200, 216, 247). If Matchstick has no invalid-placement branch, drop DENIED there and report it. | scope: src/games/sokoban/BoxPushingMechanic.ts, src/games/matchstick/MatchstickMechanic.ts, src/games/logicgrid/LogicGridMechanic.ts | criteria: four distinct Sokoban outcomes; held arrow key does not machine-gun; matchstick and logic-grid moves tick

task: Wire PlayScene and FlappyGameScene sounds, add a mute button to both HUDs, write docs/adr/0007-audio-via-phaser-sound-manager.md, and add the audio paragraph to CLAUDE.md's architecture section. | scope: src/scenes/PlayScene.ts, src/games/flappy/FlappyGameScene.ts, docs/adr/0007-audio-via-phaser-sound-manager.md, CLAUDE.md | criteria: win/lose/undo fire; Flappy flap/pip/thud with NEW_BEST only on a record; mute in both HUDs agrees with the menu; npm run build passes
```
