# 0004 — Add Vitest, for pure logic modules only

- Date: 2026-08-22
- Status: accepted

## Context

The repo has no test runner. That has been survivable because most logic is entangled with
Phaser or three.js, where a unit test would mostly assert that a mock was called.

Flappy's simulation is different. Gravity, flap impulses, pipe spawning, scoring and collision
are pure arithmetic over a state object, with no engine involved — and they are exactly the kind
of code where an off-by-one in a collision box or a frame-rate-dependent integration step
produces a game that feels wrong in a way nobody can pin down by playing it.

## Decision

Add Vitest as a dev dependency with `npm test`, and use it _only_ for modules that are pure
TypeScript with no Phaser, three.js or DOM imports. First and currently only such module:
`src/game/flappy/FlappySim.ts`.

Randomness is injected (`random: () => number`), so pipe placement is deterministic in tests.

## Consequences

- One new dev dependency and a `vitest.config.ts`. Vite is already here, so the config is small
  and shares the same transform pipeline.
- `npm test` exists but covers a single module. That is honest: a green suite proves the sim's
  arithmetic, not that the game works. Scene, world and rendering behaviour is still verified by
  running it — the plan says how, per phase.
- It establishes a pattern worth following: logic worth testing gets extracted from the engine
  layer rather than tested through it.
- The pre-commit hook is unchanged (lint + format only). Tests are not wired into it, so a
  commit can still land with a failing suite; `npm test` is a deliberate step.
