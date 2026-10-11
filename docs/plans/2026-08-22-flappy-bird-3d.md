# Flappy Bird 3D Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** complete — 2026-08-22. All 8 tasks landed. Two things drifted from this plan's own
text after the fact, both deliberately (per this doc's own convention: drift is normal, the plan
records what was agreed _then_, not rewritten to match later reality): `flapImpulse`, `pipeGap`
and `pipeSpacing` were retuned again beyond Task 8's playtest, in direct response to user
feedback after this plan was written — see `FLAPPY_TUNING`'s comments and the spec's derivation
table for the current values. And the game is no longer reached from the main menu (Task 7's
own text) — it moved into `LevelSelectScene` per `docs/adr/0005-flappy-in-level-select.md`,
which also supersedes the level-select prediction in `docs/adr/0003-dedicated-flappy-scene.md`.

**Goal:** An endless Flappy Bird game rendered through the real-time 3D layer, using the
generated flappy asset set, reachable from the main menu with a persisted best score.

**Architecture:** Three separated layers — `FlappySim` (pure TypeScript: gravity, pipes,
scoring, collision), `FlappyWorld` (three.js: bird, pipe pool, tiling ground, camera), and
`FlappyGameScene` (Phaser: input, HUD, frame loop, persistence). The game-agnostic three.js
plumbing is first extracted out of `ThreeSokobanLayer` into a shared `ThreeHost` that hosts one
world module at a time.

**Tech Stack:** TypeScript, Phaser 4.1, three.js 0.185, Vite 8, Vitest (added by Task 1),
Blender 5.2 for the asset change.

**Spec:** [docs/specs/2026-08-22-flappy-bird-3d.md](../specs/2026-08-22-flappy-bird-3d.md)

## Global Constraints

- 1 world unit = 1 game unit; Blender +Z exports as glTF +Y. Models live in
  `public/assets/games/flappy/models/`.
- `FlappySim.ts` must not import Phaser, three.js, or anything touching the DOM. This is what
  makes it testable and is enforced by review, not by tooling.
- Nothing may animate a node that something else positions. The bird's `Bird_Root` is inert;
  clips animate only below it.
- Grid/local coordinates are not world coordinates. Any new consumer of a position must state
  which space it is in.
- Portrait is locked in `main.ts`; `viewHeight = VIEW_WIDTH / aspect` is computed, never hardcoded.
- Existing style: 2-space indent, single quotes, trailing commas, Prettier width 120. Run
  `npm run lint` and `npx prettier --check` before each commit; the pre-commit hook runs both.
- Sokoban behaviour must be unchanged by Task 4. Verify, don't assume.

---

### Task 1: FlappySim — state, flap, gravity (and the Vitest harness)

**Files:**

- Create: `src/game/flappy/FlappySim.ts`
- Create: `src/game/flappy/FlappySim.test.ts`
- Create: `vitest.config.ts`
- Modify: `package.json` (devDependency + `test` script)

**Interfaces:**

- Consumes: nothing.
- Produces: `FlappyPhase`, `FlappyPipe`, `FlappyState`, `FlappyConfig`, `FLAPPY_TUNING`,
  `createFlappyState(config)`, `flap(state)`, `step(state, dtSeconds, config)`.

- [ ] **Step 1: Install Vitest and add the script**

```bash
npm install --save-dev vitest
```

Add to `package.json` scripts, beside `lint`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 2: Add the Vitest config**

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';

// Only pure-logic modules are tested here (see docs/adr/0004-vitest-for-pure-logic.md), so the
// default node environment is right — no jsdom, no canvas, nothing to stub.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
```

- [ ] **Step 3: Write the failing test**

```ts
// src/game/flappy/FlappySim.test.ts
import { describe, expect, it } from 'vitest';
import { createFlappyState, flap, step, FLAPPY_TUNING, type FlappyConfig } from './FlappySim';

const config = (): FlappyConfig => ({ viewWidth: 6.1, viewHeight: 13.3, random: () => 0.5 });

describe('FlappySim: starting state and flapping', () => {
  it('starts in READY, mid-air, with no pipes and no score', () => {
    const state = createFlappyState(config());
    expect(state.phase).toBe('READY');
    expect(state.birdY).toBe(FLAPPY_TUNING.startY);
    expect(state.velocity).toBe(0);
    expect(state.pipes).toHaveLength(0);
    expect(state.score).toBe(0);
  });

  it('does not apply gravity until the first flap', () => {
    const state = createFlappyState(config());
    step(state, 0.5, config());
    expect(state.birdY).toBe(FLAPPY_TUNING.startY);
    expect(state.velocity).toBe(0);
  });

  it('starts the run on the first flap and applies the impulse', () => {
    const state = createFlappyState(config());
    expect(flap(state)).toBe(true);
    expect(state.phase).toBe('FLYING');
    expect(state.velocity).toBe(FLAPPY_TUNING.flapImpulse);
  });

  it('pulls the bird down by gravity once flying', () => {
    const state = createFlappyState(config());
    flap(state);
    step(state, 1 / 60, config());
    expect(state.velocity).toBeCloseTo(FLAPPY_TUNING.flapImpulse + FLAPPY_TUNING.gravity / 60, 6);
    expect(state.birdY).toBeGreaterThan(FLAPPY_TUNING.startY);
  });

  it('clamps a long fall to the terminal velocity', () => {
    const state = createFlappyState(config());
    flap(state);
    for (let i = 0; i < 300; i++) step(state, 1 / 60, config());
    expect(state.velocity).toBe(FLAPPY_TUNING.terminalVelocity);
  });

  it('integrates one big frame the same as many small ones', () => {
    const a = createFlappyState(config());
    const b = createFlappyState(config());
    flap(a);
    flap(b);
    step(a, 0.5, config());
    for (let i = 0; i < 15; i++) step(b, 1 / 30, config());
    expect(a.birdY).toBeCloseTo(b.birdY, 9);
    expect(a.velocity).toBeCloseTo(b.velocity, 9);
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `Failed to resolve import "./FlappySim"`.

- [ ] **Step 5: Write the implementation**

```ts
// src/game/flappy/FlappySim.ts
//
// The whole game, as arithmetic. No Phaser, no three.js, no DOM — that is deliberate: this is
// the part whose feel has to be tuned and whose collision maths has to be right, and both are
// far easier to trust when they can be run headlessly. See
// docs/adr/0004-vitest-for-pure-logic.md.
//
// Coordinates: world units, ground surface at y = 0, bird fixed at x = 0 with the world
// scrolling past it. Positive velocity is up.

export type FlappyPhase = 'READY' | 'FLYING' | 'DYING' | 'GAME_OVER';

export interface FlappyPipe {
  id: number;
  x: number;
  gapBottom: number;
  scored: boolean;
}

export interface FlappyState {
  phase: FlappyPhase;
  birdY: number;
  velocity: number;
  pitch: number;
  /** Total distance travelled; the world uses it to wrap the ground and parallax props. */
  scroll: number;
  pipes: FlappyPipe[];
  score: number;
  nextPipeId: number;
}

export interface FlappyConfig {
  viewWidth: number;
  /** VIEW_WIDTH / aspect — computed by the scene, because it decides the gap range. */
  viewHeight: number;
  /** Injected so pipe placement is deterministic in tests. */
  random: () => number;
}

// Derived from the original game's proportions, anchoring our 1.1-unit pipe against its 52px
// one: 1 original pixel = 0.02115 units. The derivation table is in the spec; keeping every
// number here means a tuning pass is a single-file change.
export const FLAPPY_TUNING = {
  gravity: -21,
  flapImpulse: 7.2,
  terminalVelocity: -11,
  scrollSpeed: 2.54,
  scrollSpeedMax: 3.4,
  scrollRampPerPoint: 0.02,
  pipeSpacing: 2.35,
  pipeGap: 2,
  gapMargin: 1.2,
  startY: 3.5,
  // Both smaller than the bird's 0.96 x 0.51 mesh. Flappy Bird has always been forgiving, and
  // a hitbox that matches the art exactly feels unfair at the wingtips.
  birdHalfWidth: 0.31,
  birdHalfHeight: 0.2,
  pipeHalfWidth: 0.55,
  /** Longest slice integrated at once; a longer frame is split, so a stall cannot teleport
   *  the bird through a pipe. */
  maxStep: 1 / 30,
  pitchPerVelocity: 0.06,
  maxPitch: 0.44,
  /** How far beyond the right edge a pipe is spawned. */
  pipeLead: 1.5,
} as const;

const T = FLAPPY_TUNING;

const clamp = (value: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, value));

export function scrollSpeed(score: number): number {
  return Math.min(T.scrollSpeedMax, T.scrollSpeed + score * T.scrollRampPerPoint);
}

export function createFlappyState(_config: FlappyConfig): FlappyState {
  return {
    phase: 'READY',
    birdY: T.startY,
    velocity: 0,
    pitch: 0,
    scroll: 0,
    pipes: [],
    score: 0,
    nextPipeId: 0,
  };
}

/** Returns whether the flap did anything, so the caller knows when to play the clip. */
export function flap(state: FlappyState): boolean {
  if (state.phase === 'READY') {
    state.phase = 'FLYING';
    state.velocity = T.flapImpulse;
    return true;
  }
  if (state.phase === 'FLYING') {
    state.velocity = T.flapImpulse;
    return true;
  }
  return false;
}

/** Advances the run. Mutates and returns the same object, so a frame allocates nothing. */
export function step(state: FlappyState, dtSeconds: number, config: FlappyConfig): FlappyState {
  let remaining = Math.max(0, dtSeconds);
  while (remaining > 0) {
    const slice = Math.min(remaining, T.maxStep);
    advance(state, slice, config);
    remaining -= slice;
  }
  return state;
}

function advance(state: FlappyState, dt: number, config: FlappyConfig): void {
  if (state.phase === 'READY' || state.phase === 'GAME_OVER') return;

  state.velocity = Math.max(T.terminalVelocity, state.velocity + T.gravity * dt);
  state.birdY += state.velocity * dt;
  state.pitch = clamp(state.velocity * T.pitchPerVelocity, -T.maxPitch, T.maxPitch);

  // The ceiling stops the bird instead of killing it, as in the original.
  const ceiling = config.viewHeight - T.birdHalfHeight;
  if (state.birdY > ceiling) {
    state.birdY = ceiling;
    state.velocity = Math.min(0, state.velocity);
  }

  if (state.phase === 'DYING') {
    if (state.birdY - T.birdHalfHeight <= 0) {
      state.birdY = T.birdHalfHeight;
      state.velocity = 0;
      state.phase = 'GAME_OVER';
    }
    return;
  }
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm test`
Expected: PASS, 6 tests.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json vitest.config.ts src/game/flappy/FlappySim.ts src/game/flappy/FlappySim.test.ts
git commit -m "feat: add the flappy simulation's bird physics, with vitest"
```

---

### Task 2: FlappySim — pipes and scrolling

**Files:**

- Modify: `src/game/flappy/FlappySim.ts`
- Modify: `src/game/flappy/FlappySim.test.ts`

**Interfaces:**

- Consumes: `FlappyState`, `FlappyConfig`, `FLAPPY_TUNING`, `step`, `flap` from Task 1.
- Produces: pipe spawning/recycling inside `advance`; `state.pipes` populated with
  `{ id, x, gapBottom, scored }`; `state.scroll` advancing.

- [ ] **Step 1: Write the failing tests**

Append to `src/game/flappy/FlappySim.test.ts`:

```ts
describe('FlappySim: pipes', () => {
  it('spawns the first pipe with its gap centred on the bird, so the start is fair', () => {
    const state = createFlappyState(config());
    flap(state);
    step(state, 1 / 60, config());
    expect(state.pipes.length).toBeGreaterThan(0);
    const first = state.pipes[0];
    expect(first.gapBottom).toBeCloseTo(FLAPPY_TUNING.startY - FLAPPY_TUNING.pipeGap / 2, 6);
    expect(first.x).toBeGreaterThan(config().viewWidth / 2);
  });

  it('keeps later pipes exactly one spacing apart', () => {
    const state = createFlappyState(config());
    flap(state);
    for (let i = 0; i < 240; i++) step(state, 1 / 60, config());
    expect(state.pipes.length).toBeGreaterThan(1);
    for (let i = 1; i < state.pipes.length; i++) {
      expect(state.pipes[i].x - state.pipes[i - 1].x).toBeCloseTo(FLAPPY_TUNING.pipeSpacing, 6);
    }
  });

  it('places gaps inside the playable band', () => {
    const cfg = { ...config(), random: () => 0.999 };
    const state = createFlappyState(cfg);
    flap(state);
    for (let i = 0; i < 600; i++) step(state, 1 / 60, cfg);
    const highest = Math.max(...state.pipes.map((p) => p.gapBottom));
    expect(highest).toBeLessThanOrEqual(cfg.viewHeight - FLAPPY_TUNING.pipeGap - FLAPPY_TUNING.gapMargin + 1e-9);
    const lowest = Math.min(...state.pipes.map((p) => p.gapBottom));
    expect(lowest).toBeGreaterThanOrEqual(FLAPPY_TUNING.gapMargin - 1e-9);
  });

  it('scrolls the world past the bird and drops pipes that are gone', () => {
    const state = createFlappyState(config());
    flap(state);
    for (let i = 0; i < 300; i++) step(state, 1 / 60, config());
    expect(state.scroll).toBeGreaterThan(0);
    expect(Math.min(...state.pipes.map((p) => p.x))).toBeGreaterThan(-config().viewWidth);
  });

  it('is deterministic for a given random source', () => {
    const run = () => {
      const state = createFlappyState(config());
      flap(state);
      for (let i = 0; i < 200; i++) step(state, 1 / 60, config());
      return state.pipes.map((p) => `${p.x.toFixed(4)}:${p.gapBottom.toFixed(4)}`).join('|');
    };
    expect(run()).toBe(run());
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test`
Expected: FAIL — `state.pipes.length` is 0; nothing spawns pipes yet.

- [ ] **Step 3: Implement pipe spawning and scrolling**

In `FlappySim.ts`, add above `advance`:

```ts
function nextGapBottom(state: FlappyState, config: FlappyConfig): number {
  const lo = T.gapMargin;
  const hi = config.viewHeight - T.pipeGap - T.gapMargin;
  // The very first gap is centred on the bird's start height rather than random: an opening
  // shot that demands an immediate scramble reads as the game being unfair, not hard.
  if (state.nextPipeId === 0) return clamp(T.startY - T.pipeGap / 2, lo, Math.max(lo, hi));
  return lo + config.random() * Math.max(0, hi - lo);
}

function recyclePipes(state: FlappyState, config: FlappyConfig): void {
  const despawnAt = -config.viewWidth / 2 - T.pipeLead;
  while (state.pipes.length && state.pipes[0].x < despawnAt) state.pipes.shift();

  const spawnEdge = config.viewWidth / 2 + T.pipeLead;
  let rightmost = state.pipes.length ? state.pipes[state.pipes.length - 1].x : -Infinity;
  while (rightmost < spawnEdge) {
    const x = state.pipes.length ? rightmost + T.pipeSpacing : spawnEdge;
    state.pipes.push({ id: state.nextPipeId++, x, gapBottom: nextGapBottom(state, config), scored: false });
    rightmost = x;
  }
}
```

Then, in `advance`, after the `DYING` block and before the closing brace:

```ts
if (state.phase !== 'FLYING') return;

const dx = scrollSpeed(state.score) * dt;
state.scroll += dx;
for (const pipe of state.pipes) pipe.x -= dx;
recyclePipes(state, config);
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add src/game/flappy/FlappySim.ts src/game/flappy/FlappySim.test.ts
git commit -m "feat: spawn, space and recycle flappy pipes as the world scrolls"
```

---

### Task 3: FlappySim — scoring, collision, and the death sequence

**Files:**

- Modify: `src/game/flappy/FlappySim.ts`
- Modify: `src/game/flappy/FlappySim.test.ts`

**Interfaces:**

- Consumes: everything from Tasks 1-2.
- Produces: `state.score` incrementing once per pipe; phase transitions
  `FLYING → DYING → GAME_OVER`; `resetFlappyState(state, config)` for instant retry.

- [ ] **Step 1: Write the failing tests**

Append to `src/game/flappy/FlappySim.test.ts`:

```ts
import { resetFlappyState, scrollSpeed } from './FlappySim';

/** Puts a pipe exactly on the bird with a gap placed to hit or miss, for collision tests. */
const armPipe = (state: ReturnType<typeof createFlappyState>, gapBottom: number) => {
  state.pipes = [{ id: 99, x: 0, gapBottom, scored: false }];
};

describe('FlappySim: scoring', () => {
  it('scores a pipe once, when it passes the bird', () => {
    const state = createFlappyState(config());
    flap(state);
    armPipe(state, FLAPPY_TUNING.startY - FLAPPY_TUNING.pipeGap / 2);
    state.pipes[0].x = 0.2;
    for (let i = 0; i < 120; i++) step(state, 1 / 60, config());
    expect(state.score).toBe(1);
  });

  it('speeds up with the score, up to a cap', () => {
    expect(scrollSpeed(0)).toBeCloseTo(FLAPPY_TUNING.scrollSpeed, 6);
    expect(scrollSpeed(5)).toBeGreaterThan(scrollSpeed(0));
    expect(scrollSpeed(1000)).toBe(FLAPPY_TUNING.scrollSpeedMax);
  });
});

describe('FlappySim: dying', () => {
  it('dies on the pipe below the gap', () => {
    const state = createFlappyState(config());
    flap(state);
    state.birdY = 1.0;
    armPipe(state, 4.0);
    step(state, 1 / 60, config());
    expect(state.phase).toBe('DYING');
  });

  it('dies on the pipe above the gap', () => {
    const state = createFlappyState(config());
    flap(state);
    state.birdY = 8.0;
    armPipe(state, 2.0);
    step(state, 1 / 60, config());
    expect(state.phase).toBe('DYING');
  });

  it('flies clean through the gap', () => {
    const state = createFlappyState(config());
    flap(state);
    state.birdY = 3.0;
    state.velocity = 0;
    armPipe(state, 2.0);
    step(state, 1 / 60, config());
    expect(state.phase).toBe('FLYING');
  });

  it('ignores a pipe that is not alongside the bird', () => {
    const state = createFlappyState(config());
    flap(state);
    state.birdY = 1.0;
    armPipe(state, 6.0);
    state.pipes[0].x = 2.0;
    step(state, 1 / 60, config());
    expect(state.phase).toBe('FLYING');
  });

  it('dies on the ground, then reaches GAME_OVER once it lands', () => {
    const state = createFlappyState(config());
    flap(state);
    state.birdY = 0.1;
    step(state, 1 / 60, config());
    expect(state.phase).toBe('DYING');
    for (let i = 0; i < 120; i++) step(state, 1 / 60, config());
    expect(state.phase).toBe('GAME_OVER');
    expect(state.birdY).toBeCloseTo(FLAPPY_TUNING.birdHalfHeight, 6);
  });

  it('ignores flaps once dying, and stops scoring', () => {
    const state = createFlappyState(config());
    flap(state);
    state.birdY = 0.1;
    step(state, 1 / 60, config());
    const scoreAtDeath = state.score;
    expect(flap(state)).toBe(false);
    for (let i = 0; i < 120; i++) step(state, 1 / 60, config());
    expect(state.score).toBe(scoreAtDeath);
  });

  it('bumps the ceiling without dying', () => {
    const cfg = config();
    const state = createFlappyState(cfg);
    flap(state);
    state.birdY = cfg.viewHeight - FLAPPY_TUNING.birdHalfHeight - 0.01;
    state.velocity = 10;
    step(state, 1 / 60, cfg);
    expect(state.phase).toBe('FLYING');
    expect(state.birdY).toBeCloseTo(cfg.viewHeight - FLAPPY_TUNING.birdHalfHeight, 6);
  });
});

describe('FlappySim: retry', () => {
  it('resets to a fresh READY run in place', () => {
    const state = createFlappyState(config());
    flap(state);
    for (let i = 0; i < 300; i++) step(state, 1 / 60, config());
    resetFlappyState(state, config());
    expect(state.phase).toBe('READY');
    expect(state.birdY).toBe(FLAPPY_TUNING.startY);
    expect(state.pipes).toHaveLength(0);
    expect(state.score).toBe(0);
    expect(state.scroll).toBe(0);
    expect(state.nextPipeId).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test`
Expected: FAIL — `resetFlappyState` is not exported, and nothing scores or collides.

- [ ] **Step 3: Implement scoring, collision and reset**

Add to `FlappySim.ts`:

```ts
function scorePipes(state: FlappyState): void {
  for (const pipe of state.pipes) {
    // Scored as the pipe's centre crosses the bird, which is also where the classic game's
    // point lands. `scored` makes it once-only regardless of frame length.
    if (!pipe.scored && pipe.x < 0) {
      pipe.scored = true;
      state.score += 1;
    }
  }
}

function hasCollision(state: FlappyState): boolean {
  if (state.birdY - T.birdHalfHeight <= 0) return true;
  for (const pipe of state.pipes) {
    if (Math.abs(pipe.x) > T.pipeHalfWidth + T.birdHalfWidth) continue;
    if (state.birdY - T.birdHalfHeight < pipe.gapBottom) return true;
    if (state.birdY + T.birdHalfHeight > pipe.gapBottom + T.pipeGap) return true;
  }
  return false;
}

/** Restarts in place, so Retry costs no allocation and no scene restart. */
export function resetFlappyState(state: FlappyState, config: FlappyConfig): FlappyState {
  const fresh = createFlappyState(config);
  Object.assign(state, fresh, { pipes: [] });
  return state;
}
```

Extend the tail of `advance`, after `recyclePipes(state, config);`:

```ts
scorePipes(state);
if (hasCollision(state)) state.phase = 'DYING';
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test`
Expected: PASS, 21 tests.

- [ ] **Step 5: Commit**

```bash
git add src/game/flappy/FlappySim.ts src/game/flappy/FlappySim.test.ts
git commit -m "feat: score, collide and die in the flappy simulation"
```

---

### Task 4: Extract ThreeHost, with Sokoban unchanged

This task adds no features. Its deliverable is the same Sokoban game, running on a host that a
second game can share. Do not start Task 6 until this one is verified.

**Files:**

- Create: `src/three/ThreeWorld.ts`
- Create: `src/three/ThreeHost.ts`
- Create: `src/three/SokobanWorld.ts` (content moved from `ThreeSokobanLayer.ts`)
- Delete: `src/three/ThreeSokobanLayer.ts`
- Modify: `src/main.ts`, `src/scenes/LoadingScene.ts`, `src/scenes/PlayScene.ts`,
  `src/mechanics/BoxPushingMechanic.ts`, `src/game/SokobanRenderer3D.ts`,
  `src/game/SokobanCameraControls.ts`

**Interfaces:**

- Consumes: nothing from earlier tasks.
- Produces: `ModelSpec`, `ThreeWorld`, the `ThreeHost` singleton
  (`mountInto`, `bindGame`, `preload(specs)`, `isReady`, `setWorld`, `show`, `hide`,
  `render(dt)`, `instantiate(key)`, `clips(key)`, `viewportSize()`, `topMarginFraction`),
  and the `SokobanWorld` singleton (`buildLevel`, `setEntityGridPos`, `boardQuarterTurns`,
  `gridAtViewportFraction`, `zoomBy`, `panByScreenFraction`, `resetView`,
  `isUsingBakedPlayerAnimation`).

- [ ] **Step 1: Define the world interface**

```ts
// src/three/ThreeWorld.ts
import type * as THREE from 'three';

/** One glTF the host must have loaded before a world's build(). */
export interface ModelSpec {
  key: string;
  url: string;
}

/**
 * A single 3D game's content. The host owns the canvas, renderer and model cache; a world owns
 * its geometry and its camera, and nothing else knows which game is running.
 *
 * Exactly one world is active at a time — see docs/adr/0002-shared-three-host.md.
 */
export interface ThreeWorld {
  readonly models: ModelSpec[];
  /** Returns false when the models are unavailable; the caller must then fall back. */
  build(): boolean;
  frame(deltaSeconds: number): void;
  camera(): THREE.Camera;
  viewportChanged(width: number, height: number): void;
  clear(): void;
}
```

- [ ] **Step 2: Move the plumbing into ThreeHost**

Create `src/three/ThreeHost.ts` and move these members out of `ThreeSokobanLayer` **verbatim**,
changing only what the notes say:

| Moves to the host                                              | Change                                                                    |
| -------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `canvas`, constructor's canvas/style setup                     | keep; drop the scene, lights and camera                                   |
| `renderer`, `rendererUnavailable`, `ensureRenderer`            | keep as-is                                                                |
| `mountInto`, `bindGame`, `syncViewport`, `applyRendererSize`   | on resize, also call `world.viewportChanged(w, h)`                        |
| `viewportWidth`, `viewportHeight`                              | expose as `viewportSize()`                                                |
| `loader`, `modelCache`, `modelClips`, `preload`, `instantiate` | take `ModelSpec[]`, key by `string`; add `clips(key)`                     |
| `show`, `hide`, `isReady`                                      | keep                                                                      |
| `topMarginFraction`                                            | keep                                                                      |
| `render(deltaSeconds)`                                         | delegate: `world.frame(dt)` then `renderer.render(scene, world.camera())` |

The host keeps a `THREE.Scene` and the three lights, since both games want the same lighting;
`setWorld` adds the new world's group to it and calls `clear()` on the outgoing one.

```ts
setWorld(world: ThreeWorld | null): void {
  if (this.world === world) return;
  this.world?.clear();
  this.world = world;
  if (world) world.viewportChanged(this.viewportWidth, this.viewportHeight);
}
```

`applyProjection` moves to the host but only computes the inset margins; the aspect and view
offset are applied to whichever camera the active world returns.

- [ ] **Step 3: Move Sokoban's own code into SokobanWorld**

Everything else from `ThreeSokobanLayer` moves to `src/three/SokobanWorld.ts` unchanged:
`levelGroup`, `entityObjects`, `pendingPositions`, `motion`, `quarterTurns`, `followMode`, the
camera framing block (`cameraBasis`, `fitDistance`, `updateCameraFraming`, `applyZoom`,
`zoomBy`, `panByScreenFraction`, `resetView`, `groundHalfExtents`, `clampTargetToLevel`,
`updateCamera`, `applyCamera`), `gridToWorld`, `playerWorldPosition`,
`gridAtViewportFraction`, `buildLevel`, `buildLevelUnsafe`, `clearLevel`, `setupPlayerClips`,
`setPlayerState`, `setEntityGridPos`, `animatePlayer`, `animateBox`, `placePlayerForBakedClip`,
and the `MODEL_URLS` map (now `models: ModelSpec[]`).

Implement the interface with:

```ts
build(): boolean { return true; }   // Sokoban builds per level, via buildLevel()
frame(dt: number): void { /* the body of the old render(), minus renderer.render */ }
camera(): THREE.Camera { return this.cam; }
viewportChanged(w: number, h: number): void { /* old syncViewport tail: aspect + re-fit */ }
clear(): void { this.clearLevel(); }
```

- [ ] **Step 4: Update the six import sites**

- `src/main.ts`: `ThreeHost.mountInto(gameContainer)`, `ThreeHost.bindGame(game)`.
- `src/scenes/LoadingScene.ts`: `ThreeHost.preload(SokobanWorld.models)`.
- `src/scenes/PlayScene.ts`: `ThreeHost.setWorld(SokobanWorld)` before `buildLevel`;
  `ThreeHost.show/hide`; `ThreeHost.render(delta / 1000)` in `update`;
  `SokobanWorld.setEntityGridPos(...)`; `ThreeHost.topMarginFraction`.
- `src/mechanics/BoxPushingMechanic.ts`: `SokobanWorld.gridAtViewportFraction`,
  `SokobanWorld.boardQuarterTurns`.
- `src/game/SokobanRenderer3D.ts`: `SokobanWorld.buildLevel`.
- `src/game/SokobanCameraControls.ts`: `SokobanWorld.zoomBy`, `panByScreenFraction`, `resetView`.

- [ ] **Step 5: Type-check and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean. `grep -rn "ThreeSokobanLayer" src/` must return nothing.

- [ ] **Step 6: Verify Sokoban still behaves — the checks that matter**

Run `npm run dev`, open a portrait window (~420x860), then Levels → Sokoban → level 1:

1. The board renders in 3D, framed on the player (follow mode), not on the whole maze.
2. Tap a reachable tile a few cells away: the player walks the route step by step.
3. Tap-walk far enough that the view must scroll, and confirm it follows. If instrumenting,
   `camTarget.z` must change as the player's world z changes — this is the regression guarded by
   `docs/issues/rotated-board-grid-vs-world-coordinates.md`.
4. Two-finger pan and pinch zoom still work; the D-pad still moves the player.
5. Switch to a Matchstick level and back, to prove `setWorld`/`clear` doesn't leak geometry.

- [ ] **Step 7: Commit**

```bash
git add src/three src/main.ts src/scenes src/mechanics/BoxPushingMechanic.ts src/game/SokobanRenderer3D.ts src/game/SokobanCameraControls.ts
git commit -m "refactor: split the three.js layer into a shared host and a Sokoban world"
```

---

### Task 5: Regenerate pipe.glb long enough to leave frame

**Files:**

- Modify: `tools/blender/generate_flappy_assets.py`
- Modify: `tools/blender/preview_flappy_scene.py`
- Modify (regenerate): `public/assets/games/flappy/models/pipe.glb`

**Interfaces:**

- Consumes: nothing.
- Produces: `pipe.glb` measuring 1.1 × 10.0 × 1.1, rim at the top, origin at the bottom centre.

- [ ] **Step 1: Change the pipe's length**

In `generate_flappy_assets.py`'s `build_pipe`, replace `height = 4.0` with:

```python
    # Long enough that both pipes of a pair always run off frame, whatever height the gap is
    # placed at. At 4.0 a ceiling pipe against a high gap left a visible hole above it in a
    # ~13-unit-tall portrait view. Length carries no gameplay meaning — only the rim's position
    # does — and a longer cylinder costs no extra triangles.
    height = 10.0
```

Update the module docstring's pipe recipe to say 10.0, and `PIPE_LENGTH = 4.0` →
`PIPE_LENGTH = 10.0` in `preview_flappy_scene.py`.

- [ ] **Step 2: Regenerate and inspect**

```bash
~/.claude/skills/blender-game-assets/scripts/blender_run.sh \
    tools/blender/generate_flappy_assets.py -- \
    --out-dir public/assets/games/flappy/models --only pipe
python3 ~/.claude/skills/blender-game-assets/scripts/inspect_glb.py \
    public/assets/games/flappy/models/pipe.glb --expect-origin bottom
```

Expected: `size [1.1, 10, 1.1]`, `bounds min [-0.55, 0, -0.55]`, `checks : ok`.

- [ ] **Step 3: Re-render the preview to confirm the pairs still frame correctly**

```bash
~/.claude/skills/blender-game-assets/scripts/blender_run.sh \
    tools/blender/preview_flappy_scene.py -- \
    --models public/assets/games/flappy/models --out /tmp/flappy_preview.png
```

Expected: floor and ceiling rims facing each other across the gap, both columns running out of
frame, bird in the gap.

- [ ] **Step 4: Commit**

```bash
git add tools/blender/generate_flappy_assets.py tools/blender/preview_flappy_scene.py public/assets/games/flappy/models/pipe.glb
git commit -m "feat: lengthen the flappy pipe so both ends always leave frame"
```

---

### Task 6: FlappyWorld

**Files:**

- Create: `src/three/FlappyWorld.ts`

**Interfaces:**

- Consumes: `ThreeWorld`, `ModelSpec` (Task 4); `ThreeHost.instantiate`, `ThreeHost.clips`.
- Produces: the `FlappyWorld` singleton — `models`, `build()`, `frame(dt)`, `camera()`,
  `viewportChanged(w, h)`, `clear()`, `setBirdPose(y, pitchRadians)`,
  `setPipes(pipes: ReadonlyArray<{ id: number; x: number; gapBottom: number }>)`,
  `setScroll(distance)`, `playBirdClip('flap' | 'glide' | 'fall')`, `viewHeight`.

- [ ] **Step 1: Write the world**

```ts
// src/three/FlappyWorld.ts
import * as THREE from 'three';
import { ThreeHost } from './ThreeHost';
import type { ModelSpec, ThreeWorld } from './ThreeWorld';

// Matches FlappySim's VIEW_WIDTH: the simulation and the camera have to agree on how much world
// is visible, or pipes appear before they exist (or after they hit).
export const VIEW_WIDTH = 6.1;

const PIPE_LENGTH = 10;
const PIPE_GAP = 2;
const GROUND_SEGMENT = 4;
const GROUND_STEP = GROUND_SEGMENT - 0.02; // overlap, so end faces are never coplanar
const GROUND_THICKNESS = 0.51;
const PIPE_POOL = 5;
const GROUND_POOL = 4;
const OFFSCREEN_X = 999; // where unused pool slots wait

class FlappyWorldImpl implements ThreeWorld {
  readonly models: ModelSpec[] = [
    { key: 'flappy_bird', url: 'assets/games/flappy/models/bird.glb' },
    { key: 'flappy_pipe', url: 'assets/games/flappy/models/pipe.glb' },
    { key: 'flappy_ground', url: 'assets/games/flappy/models/ground.glb' },
    { key: 'flappy_cloud', url: 'assets/games/flappy/models/cloud.glb' },
    { key: 'flappy_bush', url: 'assets/games/flappy/models/bush.glb' },
  ];

  private readonly group = new THREE.Group();
  private readonly cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  private bird: THREE.Object3D | null = null;
  private mixer: THREE.AnimationMixer | null = null;
  private readonly actions = new Map<string, THREE.AnimationAction>();
  private current: string | null = null;
  private readonly floorPipes: THREE.Object3D[] = [];
  private readonly ceilingPipes: THREE.Object3D[] = [];
  private readonly groundSegments: THREE.Object3D[] = [];
  private readonly props: { object: THREE.Object3D; parallax: number; spacing: number }[] = [];
  private view = { width: VIEW_WIDTH, height: VIEW_WIDTH * 2 };

  get viewHeight(): number {
    return this.view.height;
  }

  build(): boolean {
    if (!ThreeHost.isReady) return false;
    this.clear();

    this.bird = ThreeHost.instantiate('flappy_bird');
    this.group.add(this.bird);
    this.setupBirdClips();

    for (let i = 0; i < PIPE_POOL; i++) {
      const floor = ThreeHost.instantiate('flappy_pipe');
      floor.position.set(OFFSCREEN_X, 0, 0);
      this.group.add(floor);
      this.floorPipes.push(floor);

      const ceiling = ThreeHost.instantiate('flappy_pipe');
      // Flipping maps the model to -10..0 with its rim at the -10 end, so the object is placed a
      // full length above the gap to bring that rim down onto it. Placing it at the gap edge —
      // the obvious guess — drops the rim a whole pipe-length too low; see the issues folder.
      ceiling.rotation.x = Math.PI;
      ceiling.position.set(OFFSCREEN_X, 0, 0);
      this.group.add(ceiling);
      this.ceilingPipes.push(ceiling);
    }

    for (let i = 0; i < GROUND_POOL; i++) {
      const segment = ThreeHost.instantiate('flappy_ground');
      segment.position.y = -GROUND_THICKNESS; // surface lands on y = 0
      this.group.add(segment);
      this.groundSegments.push(segment);
    }

    const cloud = ThreeHost.instantiate('flappy_cloud');
    cloud.position.y = this.view.height * 0.72;
    this.group.add(cloud);
    this.props.push({ object: cloud, parallax: 0.25, spacing: 7 });

    const bush = ThreeHost.instantiate('flappy_bush');
    this.group.add(bush);
    this.props.push({ object: bush, parallax: 0.6, spacing: 5 });

    ThreeHost.scene.add(this.group);
    this.applyCamera();
    return true;
  }

  private setupBirdClips(): void {
    const clips = ThreeHost.clips('flappy_bird');
    if (!this.bird || !clips.length) return;
    this.mixer = new THREE.AnimationMixer(this.bird);
    for (const clip of clips) {
      const action = this.mixer.clipAction(clip);
      action.loop = clip.name === 'flap' ? THREE.LoopOnce : THREE.LoopRepeat;
      this.actions.set(clip.name, action);
    }
    this.playBirdClip('glide');
  }

  playBirdClip(name: 'flap' | 'glide' | 'fall'): void {
    const next = this.actions.get(name);
    if (!next) return;
    if (name === 'flap') {
      next.reset().play(); // a one-shot over whatever is looping
      return;
    }
    if (this.current === name) return;
    const previous = this.current ? this.actions.get(this.current) : undefined;
    next.reset().play();
    if (previous) previous.crossFadeTo(next, 0.15, false);
    this.current = name;
  }

  /** The bird stays at x = 0; only its height and pitch change. */
  setBirdPose(y: number, pitchRadians: number): void {
    if (!this.bird) return;
    this.bird.position.set(0, y, 0);
    // Nose-up on the way up: the bird faces +X, so a pitch about Z lifts the beak.
    this.bird.rotation.z = pitchRadians;
  }

  setPipes(pipes: ReadonlyArray<{ id: number; x: number; gapBottom: number }>): void {
    for (let i = 0; i < PIPE_POOL; i++) {
      const pipe = pipes[i];
      if (!pipe) {
        this.floorPipes[i].position.x = OFFSCREEN_X;
        this.ceilingPipes[i].position.x = OFFSCREEN_X;
        continue;
      }
      this.floorPipes[i].position.set(pipe.x, pipe.gapBottom - PIPE_LENGTH, 0);
      this.ceilingPipes[i].position.set(pipe.x, pipe.gapBottom + PIPE_GAP + PIPE_LENGTH, 0);
    }
  }

  setScroll(distance: number): void {
    const offset = distance % GROUND_STEP;
    const first = -Math.floor(GROUND_POOL / 2) * GROUND_STEP;
    this.groundSegments.forEach((segment, i) => {
      segment.position.x = first + i * GROUND_STEP - offset;
    });
    for (const prop of this.props) {
      const travelled = distance * prop.parallax;
      const wrapped = travelled % prop.spacing;
      prop.object.position.x = this.view.width / 2 + prop.spacing / 2 - wrapped;
    }
  }

  frame(deltaSeconds: number): void {
    this.mixer?.update(deltaSeconds);
  }

  camera(): THREE.Camera {
    return this.cam;
  }

  viewportChanged(width: number, height: number): void {
    const aspect = width / Math.max(1, height);
    this.view = { width: VIEW_WIDTH, height: VIEW_WIDTH / Math.max(0.2, aspect) };
    this.applyCamera();
  }

  private applyCamera(): void {
    const halfW = this.view.width / 2;
    const halfH = this.view.height / 2;
    this.cam.left = -halfW;
    this.cam.right = halfW;
    this.cam.top = halfH;
    this.cam.bottom = -halfH;
    this.cam.updateProjectionMatrix();
    // A small tilt shows the pipes' round sides and the ground's top face. Orthographic, so the
    // tilt costs no accuracy: screen position stays a linear function of world position.
    this.cam.position.set(1.4, this.view.height / 2 + 1.1, 12);
    this.cam.lookAt(0, this.view.height / 2, 0);
  }

  clear(): void {
    this.group.clear();
    ThreeHost.scene.remove(this.group);
    this.mixer = null;
    this.actions.clear();
    this.current = null;
    this.bird = null;
    this.floorPipes.length = 0;
    this.ceilingPipes.length = 0;
    this.groundSegments.length = 0;
    this.props.length = 0;
  }
}

export const FlappyWorld = new FlappyWorldImpl();
```

- [ ] **Step 2: Type-check and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean. If `ThreeHost.scene` is private, expose it as a readonly getter — the host owns
the scene and lights, worlds add their own group to it.

- [ ] **Step 3: Commit**

```bash
git add src/three/FlappyWorld.ts src/three/ThreeHost.ts
git commit -m "feat: add the flappy 3D world — bird, pooled pipes, scrolling ground"
```

---

### Task 7: FlappyGameScene

**Files:**

- Create: `src/scenes/FlappyGameScene.ts`
- Modify: `src/main.ts` (register the scene)
- Modify: `src/scenes/MenuScene.ts` (entry button)
- Modify: `src/scenes/LoadingScene.ts` (preload the flappy models too)

**Interfaces:**

- Consumes: `createFlappyState`, `resetFlappyState`, `flap`, `step`, `FLAPPY_TUNING`,
  `FlappyState` (Tasks 1-3); `FlappyWorld`, `VIEW_WIDTH` (Task 6); `ThreeHost` (Task 4);
  `ProgressService`, `createButton`, `uiFont`, `PLAY_AREA`.
- Produces: the `FlappyGameScene` Phaser scene, keyed `'FlappyGameScene'`, and
  `FLAPPY_LEVEL_ID = 2001`.

- [ ] **Step 1: Write the scene**

```ts
// src/scenes/FlappyGameScene.ts
import * as Phaser from 'phaser';
import { GameConfig, PLAY_AREA, uiFont } from '../config/GameConfig';
import { createButton } from '../ui/GameButton';
import { ProgressService } from '../services/ProgressServicel';
import { ThreeHost } from '../three/ThreeHost';
import { FlappyWorld, VIEW_WIDTH } from '../three/FlappyWorld';
import {
  createFlappyState,
  flap,
  resetFlappyState,
  step,
  type FlappyConfig,
  type FlappyState,
} from '../game/flappy/FlappySim';

/** Reserved id for the endless run's high score — see docs/adr/0001-flappy-endless-high-score.md. */
export const FLAPPY_LEVEL_ID = 2001;

export class FlappyGameScene extends Phaser.Scene {
  private state!: FlappyState;
  private simConfig!: FlappyConfig;
  private scoreText!: Phaser.GameObjects.Text;
  private promptText!: Phaser.GameObjects.Text;
  private gameOverPanel?: Phaser.GameObjects.Container;
  private best = 0;
  private recorded = false;

  constructor() {
    super('FlappyGameScene');
  }

  create(): void {
    this.best = ProgressService.getHighScore(FLAPPY_LEVEL_ID);

    if (!ThreeHost.isReady || !this.startWorld()) {
      this.showUnavailable();
      return;
    }

    this.simConfig = {
      viewWidth: VIEW_WIDTH,
      viewHeight: FlappyWorld.viewHeight,
      random: Math.random,
    };
    this.state = createFlappyState(this.simConfig);

    this.buildHud();
    this.input.on(Phaser.Input.Events.POINTER_DOWN, this.onTap, this);
    this.input.keyboard?.on('keydown-SPACE', this.onTap, this);
    this.input.keyboard?.on('keydown-UP', this.onTap, this);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      ThreeHost.hide();
      ThreeHost.setWorld(null);
    });
  }

  private startWorld(): boolean {
    ThreeHost.setWorld(FlappyWorld);
    if (!FlappyWorld.build()) return false;
    ThreeHost.show();
    return true;
  }

  private onTap(): void {
    if (this.gameOverPanel) return; // Retry owns the taps now
    if (flap(this.state)) {
      FlappyWorld.playBirdClip('flap');
      this.promptText.setVisible(false);
    }
  }

  update(_time: number, delta: number): void {
    if (!this.state) return;

    const wasFlying = this.state.phase === 'FLYING';
    step(this.state, delta / 1000, this.simConfig);

    FlappyWorld.setBirdPose(this.state.birdY, this.state.pitch);
    FlappyWorld.setPipes(this.state.pipes);
    FlappyWorld.setScroll(this.state.scroll);
    if (wasFlying && this.state.phase === 'DYING') FlappyWorld.playBirdClip('fall');
    else if (this.state.phase === 'FLYING' && this.state.velocity < 0) FlappyWorld.playBirdClip('glide');

    this.scoreText.setText(`${this.state.score}`);
    ThreeHost.render(delta / 1000);

    if (this.state.phase === 'GAME_OVER' && !this.recorded) this.endRun();
  }

  private endRun(): void {
    this.recorded = true;
    const isBest = this.state.score > this.best;
    // Stores the max internally, so calling it with a lower score is safe.
    ProgressService.completeLevel(FLAPPY_LEVEL_ID, this.state.score);
    this.best = Math.max(this.best, this.state.score);
    this.showGameOver(isBest);
  }

  private retry(): void {
    this.gameOverPanel?.destroy();
    this.gameOverPanel = undefined;
    this.recorded = false;
    resetFlappyState(this.state, this.simConfig);
    FlappyWorld.playBirdClip('glide');
    this.promptText.setVisible(true);
  }
}
```

The HUD helpers (`buildHud`, `showGameOver`, `showUnavailable`) follow the existing
`LevelUI`/`createButton` idiom:

```ts
  private buildHud(): void {
    this.scoreText = this.add
      .text(GameConfig.width / 2, PLAY_AREA.top * 0.55, '0', {
        fontFamily: GameConfig.fonts.default,
        fontSize: uiFont(46),
        color: '#ffffff',
      })
      .setOrigin(0.5);

    this.promptText = this.add
      .text(GameConfig.width / 2, GameConfig.height * 0.62, 'Tap to fly', {
        fontFamily: GameConfig.fonts.default,
        fontSize: uiFont(22),
        color: '#ffffff',
      })
      .setOrigin(0.5);

    createButton(this, {
      x: GameConfig.ui.backBtnPos.x,
      y: GameConfig.ui.backBtnPos.y,
      label: '← Menu',
      variant: 'primary',
      onClick: () => this.scene.start('MenuScene'),
    });
  }

  private showGameOver(isBest: boolean): void {
    const centreX = GameConfig.width / 2;
    const centreY = GameConfig.height / 2;
    const panel = this.add.container(0, 0);
    panel.add(this.add.rectangle(centreX, centreY, GameConfig.width * 0.78, 260, 0x1a1a1a, 0.92).setOrigin(0.5));
    panel.add(
      this.add
        .text(centreX, centreY - 78, isBest ? 'New best!' : 'Game over', {
          fontFamily: GameConfig.fonts.default,
          fontSize: uiFont(28),
          color: '#ffe14d',
        })
        .setOrigin(0.5),
    );
    panel.add(
      this.add
        .text(centreX, centreY - 20, `Score ${this.state.score}\nBest ${this.best}`, {
          fontFamily: GameConfig.fonts.default,
          fontSize: uiFont(22),
          color: '#ffffff',
          align: 'center',
        })
        .setOrigin(0.5),
    );
    panel.add(
      createButton(this, { x: centreX, y: centreY + 62, label: 'Retry', variant: 'primary', origin: 0.5, onClick: () => this.retry() }),
    );
    this.gameOverPanel = panel;
  }

  private showUnavailable(): void {
    this.add
      .text(GameConfig.width / 2, GameConfig.height / 2, '3D is not available\non this device', {
        fontFamily: GameConfig.fonts.default,
        fontSize: uiFont(22),
        color: '#ffffff',
        align: 'center',
      })
      .setOrigin(0.5);
    createButton(this, {
      x: GameConfig.width / 2,
      y: GameConfig.height / 2 + 90,
      label: '← Menu',
      variant: 'primary',
      origin: 0.5,
      onClick: () => this.scene.start('MenuScene'),
    });
  }
```

- [ ] **Step 2: Register the scene and preload its models**

In `src/main.ts`, add `FlappyGameScene` to the scene array after `PlayScene`. In
`LoadingScene.preload`, extend the 3D preload to cover both worlds:

```ts
      GameConfig.sokoban3D ? ThreeHost.preload([...SokobanWorld.models, ...FlappyWorld.models]) : Promise.resolve(false),
```

- [ ] **Step 3: Add the menu entry, hidden when 3D is unavailable**

In `MenuScene`, below the existing buttons:

```ts
// No 2D flappy art exists, so the game is simply not offered without a working 3D layer —
// see the spec's "No-WebGL behaviour".
// MenuScene places Play at `cy` and Levels at `cy + ui(60)`, so this is the next slot down.
if (ThreeHost.isReady) {
  createButton(this, {
    x: GameConfig.width / 2,
    y: cy + ui(120),
    label: '🐤 Flappy 3D',
    variant: 'secondary',
    origin: 0.5,
    onClick: () => this.scene.start('FlappyGameScene'),
  });
}
```

- [ ] **Step 4: Type-check, lint, test**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: all clean; 21 sim tests still pass.

- [ ] **Step 5: Verify the game by playing it**

Run `npm run dev` in a portrait window (~420x860):

1. Menu shows "Flappy 3D"; it starts with the bird hovering, pipes absent, "Tap to fly" visible.
2. First tap: bird rises, wings beat, prompt disappears, pipes arrive from the right.
3. The first gap is level with the bird — no scramble on the opening pipe.
4. Fly through one gap: score reads 1.
5. Crash into a pipe: the bird tips into `fall` and drops to the ground; the game-over card
   shows score and best; Retry restarts immediately without a scene reload.
6. Crash into the ground directly: same card.
7. Beat the best, reload the page, and confirm the new best persists.
8. Ground scrolls without a visible seam; the cloud drifts slower than the ground.
9. Both pipes of every pair run out of frame — no hole above the ceiling pipe.
10. Menu → Sokoban level → back to Flappy: no leftover geometry from either game.

- [ ] **Step 6: Commit**

```bash
git add src/scenes/FlappyGameScene.ts src/scenes/MenuScene.ts src/scenes/LoadingScene.ts src/main.ts
git commit -m "feat: add the Flappy 3D scene, HUD and high score"
```

---

### Task 8: Tuning pass and documentation close-out

**Files:**

- Modify: `src/game/flappy/FlappySim.ts` (tuning values only)
- Modify: `docs/plans/2026-08-22-flappy-bird-3d.md` (status)
- Modify: `CLAUDE.md` (architecture notes)

**Interfaces:**

- Consumes: everything.
- Produces: no new API.

- [ ] **Step 1: Play it and adjust the feel**

The tuning table is derived, not playtested. Play ten runs and judge three things only:

- Is a single tap's rise about a third of the gap? If it overshoots, lower `flapImpulse`.
- Does the bird fall too fast to correct? Lower `gravity`'s magnitude.
- Are the pipes too close to react to? Raise `pipeSpacing`.

Change values in `FLAPPY_TUNING` only — never the collision boxes, which are already forgiving
by design. Re-run `npm test` after: the physics tests assert relationships, not magic numbers,
so they should stay green.

- [ ] **Step 2: Record what changed and why**

If any tuning value moved, add a line to the spec's derivation table noting the playtested value
beside the derived one. A future reader must be able to tell "derived from the original" from
"changed because it felt wrong".

- [ ] **Step 3: Update CLAUDE.md**

Add to the architecture section: the `ThreeHost`/world split, `FlappyGameScene` as a second
gameplay scene outside the mechanic registry, `npm test` covering pure logic, and the reserved
`FLAPPY_LEVEL_ID = 2001`.

- [ ] **Step 4: Mark the plan done**

Set this plan's status line to `complete`, with the date.

- [ ] **Step 5: Commit**

```bash
git add src/game/flappy/FlappySim.ts docs CLAUDE.md
git commit -m "docs: close out the flappy plan and record the tuning pass"
```

---

## Self-review notes

- **Spec coverage.** Endless run + high score → Tasks 1-3, 7. Shared host → Task 4. Dedicated
  scene → Task 7. Vitest → Task 1. `FlappyWorld` → Task 6. Pipe length change → Task 5.
  No-WebGL path → Task 7 (`showUnavailable`, menu gate). Tuning table → Tasks 1 and 8.
  Verification requirements → Task 4 Step 6 and Task 7 Step 5.
- **Ordering constraint.** Task 4 must be verified before Task 6 starts; Task 5 is independent
  and can run any time before Task 7's playtest.
- **Naming consistency.** `FlappyWorld.viewHeight` feeds `FlappyConfig.viewHeight`;
  `VIEW_WIDTH` is exported from `FlappyWorld` and must equal the value the sim's tuning table
  was derived against (6.1). If one moves, both move.
