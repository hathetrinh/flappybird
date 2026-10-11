# 0007 — Play sound effects through Phaser's sound manager, not a standalone audio host

- Date: 2026-08-24
- Status: accepted

## Context

The game needed a sound-effects layer: taps, undo, win/lose, Flappy's flap/score/crash, scene
transitions. `ThreeHost` (see `docs/adr/0002-shared-three-host.md`) was the obvious template —
game-agnostic plumbing (canvas, context, cache, frame loop) shared by every game that needs it.
Audio looked like it might want the same shape: an `AudioHost` owning a `AudioContext`, an
unlock gesture, a decoded-buffer cache, keyed playback.

But three.js content and Phaser's own rendering genuinely compete for one canvas element and one
GL context, which is why `ThreeHost` exists at all. Sound has no such conflict: Phaser already
owns a `game.sound` manager (`WebAudioSoundManager`, falling back to `HTML5AudioSoundManager` or
a no-op `NoAudioSoundManager`) with its own unlock handling, decode cache and mute switch, and
nothing outside a Phaser scene in this codebase needs to make noise. Building a second audio
stack next to it would duplicate what Phaser already does correctly, for no isolation benefit.

## Decision

Sound effects play through Phaser's built-in `game.sound` manager, wrapped by a thin
`AudioService` (`src/core/AudioService.ts`) rather than a standalone host. `AudioService` is
bound to the game instance once, in `main.ts` on `Phaser.Core.Events.READY` (mirroring
`ThreeHost.bindGame`), and after that every caller says `AudioService.play('WIN')` — nothing
outside `AudioService` and `SfxCatalogue` touches `game.sound` or a filename directly.

Sound files are generated WAVs, produced by `scripts/generate-sfx.ts` and committed under
`public/assets/audio/`, run manually via `npm run build:sfx` rather than wired into `npm run
build`. Generating them beats sourcing or licensing audio for this project: zero licensing risk,
tiny files, and a clean seam — swapping in real recorded sound later means re-running the same
`SfxCatalogue` entries against different source files, not touching any app code that calls
`AudioService.play`.

## Consequences

- No second `AudioContext`, no separate unlock gesture, no decode-and-cache layer to maintain —
  Phaser's sound manager already handles all of that, and `AudioService` only adds a repeat
  guard and a catalogue lookup on top.
- A real bug surfaced during this work: `WebAudioSoundManager`'s `mute` getter reads back an
  `AudioParam`, and Chrome doesn't reliably re-sync that value to the main thread while nothing
  is actively rendering through it — `sm.mute = true` followed immediately by reading `sm.mute`
  back can still report `false` seconds later, even though playback is genuinely silenced.
  `AudioService` tracks its own authoritative `muted` flag (set only by `setMuted()`) instead of
  trusting the getter, so `isMuted()` is reliable regardless of what the browser has gotten
  around to syncing.
- Nothing Capacitor-specific is required: the WAVs are static files under
  `public/assets/audio/`, picked up by `npx cap sync android` the same as any other asset, and
  played back at the device's media volume. Worth recording even though it doesn't bite on the
  current Android-only target: iOS's hardware silent switch mutes WebAudio outright, which would
  need its own handling if this game ever ships there.
- `AudioService.play` never throws — a no-op before `bindGame()`, when a sound hasn't loaded, or
  on a `NoAudioSoundManager` platform — so callers never need to guard calls to it.
