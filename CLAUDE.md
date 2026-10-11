# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

**Sky Chick**, a Flappy-style endless arcade game in Phaser 4 + TypeScript, packaged for web portals (GameDistribution, YouTube Playables) and for Android via **Capacitor** (app ID `com.cafesuaphin.skychick`). It was carved out of the multi-game `../brain-puzzle-game` (Matchstick, Logic Grid, Flappy, Sokoban), starting from a copy of the Sokoban-only `../sokopan` so it inherits that repo's portal, audio and UI work.

The game is never called "Flappy Bird" to players (that name is a trademark). In code it is still `flappy`.

**Treat references to Sokoban, Matchstick, Logic Grid, three.js, PlayScene and levels in `docs/` as history, not as code you can find.** The Flappy ADRs (0001, 0003, 0009, 0010, 0012) and the shared ones (0004 Vitest, 0006 game-first layout, 0007 audio) still apply. 0002 (ThreeHost), 0005, 0008 and 0011 are history.

## Commands

Standard scripts (`dev`, `build` = `tsc && vite build`, `preview`, `lint`, `format`) are in `package.json`. A husky pre-commit hook runs lint-staged (eslint --fix + prettier).

**Build targets.** The Vite `--mode` selects the portal, exposed to code as the `__PLATFORM__` constant (`'gd' | 'youtube' | 'web'`, declared in `src/types/app-globals.d.ts`):

- `npm run build` / `npm run dev`: `web`, for a plain web host and Capacitor. No portal SDK is loaded.
- `npm run build:gd`: injects the GameDistribution SDK snippet into `index.html` (the `gdSdkPlugin` in `vite.config.ts`). `npm run package:gd` builds this target and zips `dist/` as `sky-chick-gd.zip`, the file you upload.
  - **`GD_GAME_ID` in `vite.config.ts` is empty until the game is created on GameDistribution, and the gd build refuses to run without it.** Never borrow another game's id: ad revenue and stats go to whichever entry the id names.
- `npm run build:youtube`: enables the YouTube Playables wrapper.

**Never paste the GD snippet into `index.html`.** A dev page that loads the real SDK for a game id GD has deleted gets redirected to `deleted.html`.

- `npm test` runs Vitest once over `src/**/*.test.ts` and `scripts/**/*.test.ts` (node environment, no jsdom). Single file: `npx vitest run src/games/flappy/FlappySim.test.ts`; single test: add `-t "<name>"`. Only pure-logic modules with no Phaser/DOM imports are tested (ADR 0004). Everything else is verified by running the game.
- `npm run build:sfx` regenerates the committed SFX WAVs under `public/assets/audio/` via `tsx`. It's manual; `npm run build` never runs it.
- `scripts/slice-flappy-pixel-sheet.sh` cuts `assets-src/games/flappy/pixel_sheet.png` into the sprites under `public/assets/games/flappy/pixel/`, and draws the hearts, score box and shield as pixel patterns (needs ImageMagick 7). The sprites stay PNG on purpose: they are tiny, and WebP would only risk the pixel grid.
- Everything in `public/` ships in the portal zip, so keep it to what the game loads.

`tsconfig.json`'s `paths` and `vite.config.ts`'s `resolve.alias` must stay in step. `tsc` reads the first and Vite the second, so a mismatch type-checks clean but fails at runtime.

## Architecture

`main.ts` boots three scenes: Loading → FlappyGame, plus Settings (a modal overlay launched over the game). There is no menu scene (ADR 0012). Before boot it asks for a portrait lock (`lockPortrait()`) and sets the locale from `SettingsService`. On Phaser `READY` it binds `AudioService` and `HapticsService`, then initialises `GameDistributionSDK` only when `__PLATFORM__ === 'gd'`, and `YouTubePlayables` only when it is `'youtube'`.

- **LoadingScene** queues the SFX (`AssetLoader.queueAudio`) and waits for the bundled Baloo 2 font before starting the game; a Phaser Text drawn before the font loads keeps the fallback font.
- **FlappyGameScene** (`src/games/flappy/`) is the whole game (ADR 0003). It keeps three layers apart:
  - `FlappySim.ts`: pure simulation (physics, pipes, coins, hearts, shield, score, `FLAPPY_TUNING`). No imports; heavily tested.
  - `FlappyRenderer.ts`: 2D Phaser sprites (ADR 0009). `preloadFlappySprites()` is called from the scene's own `preload()`.
  - `FlappyRandom.ts`: a seeded PRNG and `dailySeed(date)`. Every run on the same day meets the same pipes.
  - The scene steps the sim, pushes its state into the renderer, and turns state changes (score, hearts, shield) into sounds and haptics.
  - The sim's `READY` phase is the title screen: title and best score over the waiting bird, gone after the first flap. ⚙️ (top-left) shows only between runs; it launches Settings with `{ returnTo }` and pauses this scene, and on resume the scene restarts if the language or best score changed. Version and credits are a footer in Settings.
  - Tap, Space or Up flap; a tap on a button never flaps. On the game-over panel the same control retries after `RETRY_GUARD_MS`, so a crash-time mash can't skip the score.
- **High score**: `ProgressService` under the reserved id `FLAPPY_LEVEL_ID = 2001` (`src/core/GameCatalog.ts`, ADR 0001), in `localStorage` key `matchstick_game_progress`. Both names are legacy from the multi-game app. **Don't change either**, or players who played there lose their best score.
- **Ads (GameDistribution)**: `FlappyGameScene.requestRetry` shows an interstitial before the next run, through `GameDistributionSDK.showAd(onComplete)`. That wrapper limits interstitials to one per 90 s, always calls back exactly once (immediately when there is no SDK), and pauses through `src/core/ExternalPause.ts`. Every external pause must go through ExternalPause: it is reference-counted by reason, pauses every running scene and all sound, and on resume restores the **player's own** mute setting (`AudioService.isMuted()`), never `false`. SDK events that fire before boot (a preroll) are queued by the injected snippet and replayed in `init()`.

### Audio, haptics, i18n, fonts

- `AudioService.play(...)` is the only way to play an SFX, and `SfxCatalogue.ts` is the only place sound files are named (ADR 0007). The persisted mute flag lives in `SettingsService`; the Sound toggle in Settings is the only UI that mutes. There is no background music.
- `HapticsService` swallows every failure, so it is always safe to call. `createButton` fires a light tap on `pointerdown`.
- Every player-facing string goes through `t(key)` from `@core/i18n`, with locales `en` and `vi`. Add new keys to both; `i18n.test.ts` checks they match. Strings with values use `{name}` placeholders replaced by the caller.
- The Baloo 2 font is bundled from `@fontsource/baloo-2` (imported in `main.ts`, Latin and Vietnamese subsets only) instead of fetched from Google Fonts. Portals flag third-party requests.
- Every `createPanel` popup closes itself on Esc/Enter/Space and marks the event with `preventDefault`.

### Known leftovers

- `GameConfig` still carries layout fields from the Sokoban HUD (the D-pad metrics and the bottom band `PLAY_AREA` reserves for it, `sokoban3D`), and `GameConfig.test.ts` still checks them. Flappy reads only `PLAY_AREA.top`.
- `SettingsService` still has the `seenHowTo` list, which nothing reads.

## Mobile / orientation

Android packaging is covered by the `capacitor-android` skill in `.claude/skills/`. The game is **portrait-only**. `src/core/OrientationLock.ts` asks the browser for a portrait lock, and where that is refused (iOS Safari, most non-fullscreen pages) `index.html` shows a "turn your device upright" prompt on phones held sideways. Its text is localized by `localizeRotatePrompt()`, which must run after every `setLocale` (in `main.ts` and in the Settings language picker).
