# 0012 — The run's READY phase is the title screen; there is no menu scene

- Date: 2026-10-11
- Status: accepted
- Amends: [ADR 0003](0003-dedicated-flappy-scene.md), which had `FlappyGameScene` "launched from
  `MenuScene`". Its decision to give Flappy its own scene still stands.

## Context

Sky Chick has one mode and one endless run. `MenuScene` held a title, a Play button, the best
score and ⚙️, so every session cost a tap and a scene change before the game. `AboutScene` held
a version line and one sentence of credits. Both screens were inherited from the multi-game app,
where a menu had something to choose between.

`FlappySim` already starts every run in a `READY` phase, with the bird waiting until the first
flap, so the game scene already had an idle state where the menu's content could go.

## Decision

- `LoadingScene` starts `FlappyGameScene` directly. `MenuScene` and `AboutScene` are deleted.
- In `READY`, the game scene shows the title and best score over the waiting bird. The first flap
  removes them for the rest of the scene's life, so a retry shows only the "tap to fly" prompt.
- ⚙️ sits in the top-left corner (where the Menu button was), visible only between runs: in
  `READY` and on the game-over panel. It launches `SettingsScene` with `{ returnTo }` and pauses
  the game scene. A paused scene gets no keyboard or pointer input, so nothing flaps under
  Settings. Settings resumes `returnTo` when it closes.
- A tap that lands on a button never reaches the flap control (`over.length > 0`).
- On resume the game scene restarts if the language or the best score changed, rather than
  relabelling each text and button.
- The About content (version and credits) is a footer line in Settings.

## Consequences

- One tap from load to flight, and the first frame a portal player sees is the game itself.
- There is no way to pause mid-run. That was already true: the Menu button abandoned the run.
- Changing the language or resetting the best score from the game-over panel restarts the scene
  into `READY`, which skips that break's ad. It is rare and the ad is optional.
- `FlappyGameScene.init()` now resets the per-run fields, because Phaser reuses the instance on
  restart. The old Menu → Play path had the same gap: after a game over, `recorded` stayed true
  and the next run's crash was never scored.
