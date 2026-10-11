# Handoff: where Sky Chick stands

Notes for picking this repo up in a new session. Read `CLAUDE.md` first for how the project works; this file is only the current status and what's next. Delete it once the open items are done.

## How this repo was made (2026-10-11)

- Carved out of `../brain-puzzle-game`, starting from a copy of `../sokopan` (the Sokoban-only repo), so it inherits sokopan's portal, audio and UI work.
- Flappy's code, sprites, sounds and slicing script came from brain-puzzle-game at commit `427f03d`, read with `git archive`.
- **brain-puzzle-game was not modified.** It still has uncommitted Flappy work of its own (`flappy.html`, `src/main-flappy.ts`, `vite.flappy.config.ts`, `dist-flappy/`, `flappy-game.zip`, edits to `package.json` and `FlappyGameScene.ts`). That attempt is superseded by this repo: it loaded no sound, its Menu button was dead, and it used a placeholder GD id. Whether to delete it there is the owner's call.
- First commit here: `3b75746`. Local only, no GitHub remote yet.

## Decisions taken

- **Name: "Sky Chick"** (`menu.title` in `src/core/i18n/en.ts` and `vi.ts`, `<title>` in `index.html`, `README.md`). "Flappy Bird" is a trademark, so it is never shown to players; in code the game is still `flappy`.
- **Android app ID: `com.cafesuaphin.skychick`** (`capacitor.config.ts`). The parent and sokopan share `com.cafesuaphin.tg`, so this game needs its own.
- **GD game ID: not set.** `GD_GAME_ID` in `vite.config.ts` is empty, and `npm run build:gd` / `package:gd` stop with an error until it holds a 32-hex id. The copy from sokopan carried sokopan's id; never reuse another game's id, since ad revenue and stats go to whichever entry it names.
- **Ads:** an interstitial can play before a retry (`FlappyGameScene.requestRetry`), never mid-run, at most once per 90 s.
- **High score** keeps the reserved id `2001` and the legacy `localStorage` key `matchstick_game_progress`, so scores saved in the multi-game app still read back.
- **No background music**, same as sokopan.

## Verified

- `tsc`, lint and all 88 tests (FlappySim, FlappyRandom, i18n, GameConfig, wavSynth) pass.
- Played in headless Chromium at phone size (390x844, touch), in English and Vietnamese. Menu, run, game-over panel, tap-to-retry and the menu's best score all work. All 10 sound files load. No page errors and no outside requests.
- The web build (`npm run build`) is 1.8 MB.

Not verified: a real phone, the GD build (blocked on the id), the YouTube build, Android.

## Next steps

1. **Create the game on GameDistribution**, paste its id into `GD_GAME_ID` in `vite.config.ts`, then `npm run package:gd` and upload `sky-chick-gd.zip`. Watch one full test ad in GD's preview, complete the Checklist tab, and press Request Activation.
2. **Store art and listing text.** For Crate Keeper these were made in sokopan from real gameplay: headless captures with the HUD hidden, laid out in HTML and screenshotted at 512x512, 512x384, 200x120 and 1280x720. Its listing text is `../sokopan/promo/gamedistribution-listing.md`. Do the same here.
3. **GitHub repo** (optional): create one and push.
4. **Clean the known leftovers** listed in `CLAUDE.md`:
   - Sokoban HUD fields in `GameConfig` (D-pad metrics, the bottom band `PLAY_AREA` reserves for it, `sokoban3D`) and the checks for them in `GameConfig.test.ts`;
   - the unused `seenHowTo` setting.
5. **Optional:** a first-run "how to play" popup, and a deploy target such as Netlify. sokopan deploys to sokopan.netlify.app with `netlify deploy --prod --dir dist --site <site id>`, after building with `npm run build`.

## Environment notes

- npm's registry is set to the company Artifactory (`artifacts.mgm-tp.com`), which is unreachable off the VPN. Installs worked with `--registry https://registry.npmjs.org`.
- `node_modules` was copied from sokopan, not freshly installed. Run `npm install` if anything looks off.
