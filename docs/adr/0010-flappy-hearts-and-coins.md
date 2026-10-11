# 0010 — Flappy gets three hearts and collectable coins

- Date: 2026-09-09
- Status: accepted
- Builds on: [ADR 0009](0009-flappy-2d-sprites.md), which moved Flappy to 2D sprites and
  explicitly left hearts and coins out as rule changes rather than a reskin. This is that
  follow-up. [ADR 0003](0003-dedicated-flappy-scene.md) still holds: Flappy is not a mechanic.

## Context

Flappy was one mistake and out, which is harsh for the children the game is aimed at, and the
art sheet had been carrying a coin spin, hearts and a life box that nothing used. A mockup of
the intended HUD (`assets-src/games/flappy/reference/hud-mockup.png`) asked for a score badge
and a row of three hearts.

This is the first change to touch `FlappySim` since it was written. That module is the reason
Flappy's feel is trustworthy — pure arithmetic, no Phaser, fully unit tested — so the bar for
changing it is the same as the bar for the rest of it: every rule has to be expressible as
arithmetic and provable headlessly.

## Decision

**Three hearts.** Any contact costs one and starts a 1.2s grace period during which the bird
flashes and cannot be hit again. The window is not arbitrary: at the slowest scroll a pipe takes
`(pipeHalfWidth + birdHalfWidth) * 2 / scrollSpeed` = 0.68s to clear the bird, so anything
shorter would let the pipe that hit you bill a second heart before it had finished passing. On a
pipe hit the bird keeps position and velocity and flies out the far side, which is what makes
the grace read as phasing rather than teleporting. At zero hearts the existing
`DYING` → fall → `GAME_OVER` path runs unchanged, so every death still ends in the K.O. pose.

**The ground bounces.** It cannot behave like a pipe, because the bird is already resting on the
floor and would simply be billed again the moment grace expired. So a ground hit pins the bird
to the surface and launches it with `groundBounceImpulse`, which is deliberately stronger than
`flapImpulse` — a bounce that failed to lift the bird clear would just queue up the next heart.
While the grace period runs the floor still stops the bird rather than letting it sink through
the world.

**Coins.** Roughly two thirds of pipes carry one at the centre of the gap, drawn from the
injected RNG so runs stay reproducible. A coin is +1 and a pipe is still +1, so `score` is both
combined and `coins` is tracked alongside it purely for display.

The coin's pickup box is a shade **larger** than the coin as drawn, which is the exact inverse
of the bird's hitbox being smaller than its art. The principle is that damage should be
forgiving and pickups generous; the first cut had the box smaller than the sprite, and the bird
could visibly overlap a coin without collecting it, which reads as the game cheating.

**No new phase.** "Just took a hit" is not a state, it is `hearts` decreasing, and
`FlappyGameScene` watches for that to fire the sound and haptic. Adding a `HURT` phase would
have meant every existing phase check had to learn about it for no gain.

## Consequences

- **The high score changes meaning.** It counted pipes; it now counts pipes plus coins, so bests
  saved before this change are easy to beat. Left alone deliberately: it is a local
  single-player number under `FLAPPY_LEVEL_ID`, and silently wiping someone's best is worse than
  it being beatable.
- **Five existing tests were rewritten, not just added to.** Everything under
  `FlappySim: dying` asserted that touching a pipe kills you, which is no longer true at three
  hearts; they now pin the bird to its last heart via `onLastHeart`. A scoring test needed the
  same treatment, because a bird that survives the ground goes on to bank a second pipe.
- The HUD does **not** follow the mockup's top-left placement, because the Menu button already
  owns that corner in every scene. Score plate and life row are centred instead, keeping the
  mockup's stacked reading order without moving a control players know the position of.
- Coin and heart art needed no new source: both were already in `flappy_transparent.png` and are
  now sliced by `scripts/slice-flappy-sheet.sh`. The coin spin gets the same shared-scale,
  centre-aligned packing as the chick, and for the same reason — its frames narrow from 151px to
  89px as it turns, so per-frame normalisation would make it pulse instead of spin.

## Alternatives rejected

- **Ground always fatal.** Simpler, and it keeps a sharper fail state, but it makes hearts mean
  "pipes are forgiven, the floor is not" — an inconsistency the player has to learn by dying.
- **Coins as a separate counter.** Preserves the old high score exactly, but it disconnects
  coins from winning and gives the HUD two numbers competing for attention.
- **Coins off-centre in the gap**, so grabbing one costs a detour. More interesting, and worth
  revisiting, but it needs care that a coin never sits inside a pipe; centred is always fair.
