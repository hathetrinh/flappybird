# Sound Effects Layer — Design

**Date:** 2026-08-24
**Status:** Approved, pending implementation plan

## Problem

The game is silent. Nothing in `src/` plays audio. The only traces of the idea are a
quarantined `PlaySoundAction` in `src/games/_dormant/actions/PlaySound.ts` that logs
`"PLAY_SOUND action is not implemented yet"`, and an unused `soundKey?: string` field on
`OnSuccessAction` in `src/types/Level.ts`. There are no audio files under `public/assets/`.

Every interaction — tapping a button, pushing a box, crashing the Flappy bird, winning a
level — lands with no acknowledgement beyond the visual.

## Scope

**In scope:** short one-shot sound effects, a persisted mute toggle, and a script that
generates the effect files.

**Out of scope, deliberately:**

- Background music. No looping tracks, no crossfade, no ducking, no per-category buses.
- Volume sliders. Mute is binary; there is no `SettingsScene`.
- Haptics. No `@capacitor/haptics` dependency.
- Reviving the dormant `PLAY_SOUND` action or `Level.soundKey` (see "Dormant code" below).

## Approach

Phaser's own sound manager, wrapped in a thin service, playing committed WAV files that a
Node script synthesizes.

Two alternatives were considered and rejected:

- **A standalone WebAudio host mirroring `ThreeHost`** — its own `AudioContext`, independent
  of Phaser. Rejected: it reimplements autoplay-unlock, fetch/decode, caching and mute for no
  benefit, since nothing outside a Phaser scene needs to make noise.
- **Pure runtime synthesis, no asset files** — oscillators generated live, zero bytes
  shipped. Rejected: a generated blip could never be replaced by a real recorded sound without
  rewriting code, and tuning would mean editing DSP math instead of listening to a file. Its
  synthesis math is reused by the generator script below.

## Architecture

The governing rule: **nothing outside `src/core/` ever names an audio file.** Callers say
`AudioService.play('BOX_PUSH')`.

| File                           | Responsibility                                                                                                                                   | Depends on                                |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------- |
| `src/core/SfxCatalogue.ts`     | Pure data: the `SfxId` union and `SFX: Record<SfxId, { file: string; volume: number }>`. No Phaser import, no DOM.                               | nothing                                   |
| `src/core/AudioService.ts`     | The only public surface: `bindGame`, `play`, `isMuted`, `setMuted`, `toggleMute`.                                                                | Phaser, `SfxCatalogue`, `SettingsService` |
| `src/core/SettingsService.ts`  | localStorage read/write for `soundMuted`, in the same try/catch shape as `ProgressService`.                                                      | nothing                                   |
| `src/ui/MuteButton.ts`         | `createMuteButton(scene, opts)` factory returning a 🔊/🔇 button that toggles and swaps its own label.                                           | `GameButton`, `AudioService`              |
| `scripts/generate-sfx.ts`      | Holds `Record<SfxId, Recipe>` — the waveform and envelope math — and writes every id to a 16-bit mono 22.05kHz WAV under `public/assets/audio/`. | `SfxCatalogue` (ids + filenames)          |
| `scripts/generate-sfx.test.ts` | Vitest cover for the recipes and the WAV encoder. Requires adding `'scripts/**/*.test.ts'` to `vitest.config.ts`'s include glob.                 | `generate-sfx.ts`                         |

### AudioService binds the game, not a scene

`main.ts` calls `AudioService.bindGame(game)` on the same `Phaser.Core.Events.READY` handler
that already does `ThreeHost.bindGame(game)`. Mechanics and commands can then play a sound
without being handed a scene reference, and `play()` is a safe no-op while unbound, so an
early call cannot break anything.

Public API:

```ts
AudioService.bindGame(game: Phaser.Game): void   // stores game, applies persisted mute
AudioService.play(id: SfxId): void               // never throws; no-ops when unbound/muted/missing
AudioService.isMuted(): boolean
AudioService.setMuted(muted: boolean): void
AudioService.toggleMute(): boolean               // returns the new muted state
```

### Synthesis params live in the script, not the catalogue

The catalogue is what the app ships: id → file + volume. The generator holds
`Record<SfxId, Recipe>` with the waveform and envelope math and imports the catalogue's ids,
so a missing recipe is a compile error rather than a silent gap.

This is the seam that makes generated audio a starting point rather than a commitment:
replacing a blip with a real recorded sound means dropping the file in and deleting the
recipe. The catalogue is untouched and no app code changes.

### WAV, committed, outside the build

At roughly 120ms and 22.05kHz mono, each effect is 3–5KB — about 60KB for the whole set.
Compression buys nothing at that size and would pull in an encoder dependency, so the format
is uncompressed WAV, which every browser and the Android WebView play natively.

The generator's output is **committed to git**, and `npm run build:sfx` is a manual script in
the same category as the existing `scripts/validate-logic-grid-levels.ts` — not a build step
that can fail. `npm run build` never invokes it.

The generator is TypeScript, which is what lets it import `SfxCatalogue` directly and turn a
missing recipe into a type error where a plain `.mjs` script could not.

It runs through `tsx`, added as a devDependency. It deliberately does NOT use `ts-node`:
`ts-node` is not installed in this repo, which is exactly why the two existing scripts that
invoke it (`build:levels`, `build:levels_candle`) are documented as broken in `CLAUDE.md`.
Fixing those is out of scope here.

The generator imports the catalogue by relative path (`../src/core/SfxCatalogue`), the way
`scripts/validate-logic-grid-levels.ts` already imports `../src/games/...`. It must not use the
`@core/*` alias — `tsx` does not resolve the alias without additional configuration.

`npm run build:sfx` is a new entry in `package.json`.

### Loading

`AssetLoader` gains a `queueAudio(scene)` that iterates the catalogue and calls
`scene.load.audio(id, path)`. `LoadingScene.preload()` calls it alongside the existing
`queueLevelAssets`, so audio flows through the same progress bar as every other asset.

## Sound catalogue

Fourteen ids, chosen so one sound serves several call sites rather than inventing a bespoke
effect per event.

| Id              | Character             | Fired from                                                                                                                                                                                                                                                           |
| --------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `UI_TAP`        | short soft click      | `GameButton` pointerup — every button in every scene, wired once                                                                                                                                                                                                     |
| `UI_TAB`        | click, higher pitch   | mechanic tab buttons, `LevelSelectScene:186`                                                                                                                                                                                                                         |
| `DENIED`        | low buzz              | locked tile tap (`LevelSelectScene:325` else-branch), blocked Sokoban move, illegal matchstick placement                                                                                                                                                             |
| `MOVE`          | dry tick              | matchstick pick/place, Sokoban step, Logic Grid mark cycle                                                                                                                                                                                                           |
| `BOX_PUSH`      | scrape/thud           | `BoxPushingMechanic` push                                                                                                                                                                                                                                            |
| `BOX_ON_TARGET` | rising two-note chirp | a push that lands a box on a target                                                                                                                                                                                                                                  |
| `UNDO`          | reverse whoosh        | undo button, `PlayScene:89`                                                                                                                                                                                                                                          |
| `WIN`           | four-note arpeggio    | `handleWinLevel`, `PlayScene:315`                                                                                                                                                                                                                                    |
| `LOSE`          | falling two-note      | `handleLoseLevel`, `PlayScene:348` — both the timeout and the Sokoban deadlock path already funnel here                                                                                                                                                              |
| `FLAP`          | air puff              | `FlappyGameScene:78`, beside the existing `playBirdClip('flap')`                                                                                                                                                                                                     |
| `SCORE`         | bright pip            | pipe cleared — detected by diffing `state.score` where `FlappyGameScene:98` already reads it                                                                                                                                                                         |
| `CRASH`         | noise thud            | `FlappyGameScene:106`                                                                                                                                                                                                                                                |
| `NEW_BEST`      | fanfare               | same site, gated on the `isBest` flag already computed there                                                                                                                                                                                                         |
| `SCENE_SWISH`   | short noise sweep     | every `scene.start` reached by a tap — `MenuScene:54`, `MenuScene:61`, `LevelSelectScene:124` (back), `LevelSelectScene:326` (level tile), `LevelSelectScene:411` (arcade tile), `PlayScene:77`, `FlappyGameScene:144`, `FlappyGameScene:200`. NOT `LoadingScene:58` |

### GameButton carries the UI coverage

`ButtonOptions` gains `sfx?: SfxId | 'none'`, defaulting to `UI_TAP`, played on `pointerup`
immediately before `opts.onClick()`. One edit covers every button in the game instead of forty
call sites. Tabs pass `UI_TAB`. The locked-tile branch passes `'none'` and plays `DENIED`
itself, since that tile is a `createButton` whose handler already forks on `isUnlocked`.

A `SCENE_SWISH` fires immediately before each `scene.start`, not after — the outgoing scene is
still alive to play it, and Phaser's global sound manager keeps it audible across the switch.

### No loading chime

A "loading complete" sound was considered and cut. Browsers produce no sound before the first
user gesture, and the `LoadingScene` → `MenuScene` transition happens before anyone has
touched the screen, so the effect would be silently swallowed on mobile and Chrome — dead code
that reads as intentional. `SCENE_SWISH` covers the remaining transitions because each of them
follows a tap.

The same constraint means Phaser's audio unlock may consume the very first tap, so `UI_TAP` on
the menu's first press can go unheard exactly once. This is accepted, and the code carries a
comment saying so, to stop a future reader "fixing" it.

## Mute and persistence

`toggleMute()` flips `game.sound.mute` — Phaser's global gate, so no per-call checks are
needed anywhere — writes through to `SettingsService`, and when *un*muting plays `UI_TAP` so
the player immediately hears that sound is back. `bindGame()` reads the persisted value and
applies it before the menu draws, so a muted player never gets a stray blip on launch.

`createMuteButton` reads `AudioService.isMuted()` when it builds the button, so the three places it appears
— `MenuScene`, the `PlayScene` HUD, and the `FlappyGameScene` HUD — cannot disagree about
state.

`SettingsService` is a separate module with its own localStorage key
(`brain_puzzle_settings`, holding `{ soundMuted: boolean }`) rather than a field on
`ProgressService`. That store's shape is `Record<number, LevelProgress>` keyed by level id,
and a global preference does not belong in it.

## Edge cases

- **Rate limiting.** `play()` drops a repeat of the same id within 40ms.
  `BoxPushingMechanic` takes held keyboard input; without this, a held arrow key turns `MOVE`
  into a buzzsaw.
- **Missing key.** `play()` checks `game.cache.audio.exists(id)` first, so a WAV that failed
  to load yields silence rather than a Phaser warning on every tap.
- **No-audio fallback.** A locked-down WebView hands Phaser a `NoAudioSoundManager`. `play()`
  is a harmless no-op there and the mute button still works, so no gameplay path needs a
  try/catch.

## Capacitor

Nothing to do. The WAVs are static files under `public/`, so they land in `dist/` and are
packaged by `npx cap sync android` — no plugin, no permission, no manifest change.

Playback follows the device's media volume. iOS's hardware silent switch mutes WebAudio
entirely; that is irrelevant to the current Android-only target but is recorded in the ADR.

## Dormant code

`src/games/_dormant/actions/PlaySound.ts` and `Level.ts`'s `soundKey` are left exactly as they
are. Both are unreachable by play — no level defines `CLICK_OBJECT`, `DRAG_AND_DROP` or
`DEVICE_SHAKE` — and wiring quarantined code to a live service on speculation is what
`src/games/_dormant/README.md` exists to prevent. If a level ever needs `PLAY_SOUND`, it
becomes a two-line change at that point.

## Testing

`SfxCatalogue` and the generator are pure — no Phaser, no DOM — so they qualify for Vitest
under `docs/adr/0004-vitest-for-pure-logic.md`. That ADR is about PURITY, not location, but
`vitest.config.ts` currently has `include: ['src/**/*.test.ts']`, which would leave anything
under `scripts/` untested. The fix is to add `'scripts/**/*.test.ts'` to that glob — one line —
rather than move build-only DSP code into `src/` just to satisfy a test config. The synthesis
math is never imported by the game, so it has no business in the shipped tree.

The tests live in `scripts/generate-sfx.test.ts` and cover:

- every `SfxId` in the catalogue has a generator recipe
- catalogue file paths are unique
- the emitted WAV has a valid 44-byte RIFF header with correct chunk sizes
- generated samples stay inside int16 range (no clipping wraparound)

`AudioService`, `MuteButton` and the call-site wiring import Phaser, so per this repo's
convention they are verified by running the game:

1. Tap through `MenuScene`, `LevelSelectScene`, `PlayScene` and `FlappyGameScene`, confirming
   each catalogued sound fires at its listed site.
2. Tap a locked level tile and confirm `DENIED`, not `UI_TAP`.
3. Hold an arrow key in Sokoban and confirm `MOVE` does not machine-gun.
4. Toggle mute, reload the page, and confirm the game comes back silent.
5. Toggle mute in `PlayScene`, return to the menu, and confirm the button there agrees.

Plus `npm run lint` and `npm run build`.

## Documentation

- New `docs/adr/0007-audio-via-phaser-sound-manager.md` recording why Phaser's sound manager
  over a `ThreeHost`-style standalone host, and why generated WAVs over sourced assets.
- `CLAUDE.md` gains the `build:sfx` script in its command list and an audio-layer paragraph in
  the architecture section.
