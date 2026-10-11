# 0002 — Extract a shared three.js host; one world module per 3D game

- Date: 2026-08-22
- Status: accepted

## Context

`src/three/ThreeSokobanLayer.ts` is ~940 lines and mixes two very different kinds of code:

1. Plumbing that has nothing to do with Sokoban — creating the canvas, claiming a WebGL context
   _after_ Phaser has taken the first one, tracking Phaser's canvas rect on resize, applying the
   play-area view offset, loading and caching glTF models, running the frame loop.
2. Sokoban itself — building a grid of floors/walls/targets, turning wide boards a quarter, the
   follow camera with its dead zone, and per-entity walk/push animation.

Flappy Bird 3D needs all of (1) and none of (2). Three options were considered: copy the
plumbing into a second layer, teach the existing class both games behind a mode flag, or split
the two kinds of code apart.

Copying is the tempting one — zero risk to working Sokoban code — but it duplicates ~200 lines
of the most fragile code in the project and puts a _second_ WebGL context and canvas on the
page. The existing comments record that context ordering was already delicate enough that
Phaser has to be booted first to avoid a hard failure on some drivers.

## Decision

Split it. `ThreeHost` owns the canvas, renderer, context acquisition, viewport sync, projection,
model cache and frame dispatch, and knows nothing about any game. Each 3D game is a world
module implementing a small interface, and exactly one world is active at a time:

```ts
export interface ThreeWorld {
  readonly models: ModelSpec[]; // what the host must load before build()
  build(): boolean; // false when models are missing; caller falls back
  frame(deltaSeconds: number): void; // advance animation, position own camera
  camera(): THREE.Camera; // the host renders with this
  viewportChanged(w: number, h: number): void;
  clear(): void;
}
```

`SokobanWorld` is today's Sokoban code behind that interface, including its grid framing and
`gridAtViewportFraction` picking. `FlappyWorld` is new.

## Consequences

- One canvas, one WebGL context, however many 3D games get added.
- The extraction touches code that works today, so Sokoban has to be re-verified behaviourally
  rather than assumed: tap-to-move routing and the follow camera on a quarter-turned board are
  the two checks that matter, and they are the first phase of the plan, before any Flappy code
  exists.
- Import sites move: `PlayScene`, `LoadingScene`, `main.ts`, `BoxPushingMechanic`,
  `SokobanCameraControls` and `SokobanRenderer3D` all currently import `ThreeSokobanLayer`.
- Each world declares the models it needs, so `LoadingScene` no longer hardcodes one game's
  model list.
- The host gains a concept the old layer did not have — an active world — and with it the
  responsibility to `clear()` the previous one. A leak here shows up as two games' geometry in
  the same frame, which is at least loud rather than subtle.
