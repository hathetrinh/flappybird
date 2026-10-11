import { describe, expect, it } from 'vitest';
import { mulberry32 } from './FlappyRandom';
import {
  pickupY,
  createFlappyState,
  flap,
  reachableRise,
  step,
  FLAPPY_TUNING,
  type FlappyConfig,
  type FlappyState,
  type FlappyPipe,
  type PipePickup,
} from './FlappySim';

const config = (): FlappyConfig => ({ viewWidth: 6.1, viewHeight: 13.3, random: () => 0.5 });

/**
 * Scrolls a long run past the bird without playing it: pipe generation only advances while the
 * phase is FLYING, so a hands-off state crashes after two pipes and reveals nothing about how
 * gaps are laid out over a real run. The bird is teleported into whichever gap it is level with
 * (a fixed height would sit inside a pipe and deadlock the run in DYING).
 */
function hover(state: FlappyState, cfg: FlappyConfig, frames: number, each?: () => void): void {
  const park = () => {
    const overlapping = state.pipes.find(
      (p) => Math.abs(p.x - FLAPPY_TUNING.birdX) <= FLAPPY_TUNING.pipeHalfWidth + FLAPPY_TUNING.birdHalfWidth + 0.5,
    );
    state.phase = 'FLYING';
    state.velocity = 0;
    state.birdY = overlapping ? overlapping.gapBottom + FLAPPY_TUNING.pipeGap / 2 : cfg.viewHeight / 2;
  };
  for (let i = 0; i < frames; i++) {
    park();
    step(state, 1 / 60, cfg);
    park();
    each?.();
  }
}

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
    const cfg = config();
    const state = createFlappyState(cfg);
    flap(state);
    // Starting at rest just under the ceiling clamp gives the longest fall the world allows.
    // Task 3 adds ground collision, which would otherwise end the run (and freeze velocity at
    // 0) long before enough steps had passed to observe the clamp — this test is about the
    // gravity/terminal-velocity arithmetic in isolation, so it needs a runway clear of that.
    // 60 steps (1s) sits comfortably between "enough to reach terminal" (~32 steps) and
    // "before this fall distance would reach the ground" (~86 steps).
    state.birdY = cfg.viewHeight - FLAPPY_TUNING.birdHalfHeight - 0.01;
    state.velocity = 0;
    for (let i = 0; i < 60; i++) step(state, 1 / 60, cfg);
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

  it('never asks for a climb the bird cannot fly, on any screen shape', () => {
    // Regression: gaps used to be sampled uniformly across the whole 8.3-unit band, so a pipe
    // could sit 8 units above its neighbour with ~1.18s of travel between them — under 4 units of
    // climb. Narrow phone shapes are included because reachableRise is view-width dependent.
    for (const aspect of [0.46, 0.56, 1.5]) {
      const cfg: FlappyConfig = {
        viewWidth: 13.3 * aspect,
        viewHeight: 13.3,
        random: () => 0.999, // always reach for the top of the allowed band
      };
      const state = createFlappyState(cfg);
      flap(state);
      // Measured as each pipe actually arrives at the bird, against the climb budget at that
      // moment — the budget shrinks as scrollSpeed ramps, so checking a pipe still in the air
      // against today's budget would compare it to the wrong number.
      const arrivals: number[] = [];
      const counted = new Set<number>();
      let prevGap: number | null = null;
      hover(state, cfg, 3000, () => {
        for (const pipe of state.pipes) {
          if (pipe.x > FLAPPY_TUNING.birdX || counted.has(pipe.id)) continue;
          counted.add(pipe.id);
          if (prevGap !== null) {
            // score - 1: this pipe scored in the same step that carried it past the bird, so
            // the speed the bird just flew at is the one from before that point.
            const budget = reachableRise(Math.max(0, state.score - 1), cfg) + 1e-9;
            expect(pipe.gapBottom - prevGap).toBeLessThanOrEqual(budget);
          }
          prevGap = pipe.gapBottom;
          arrivals.push(pipe.gapBottom);
        }
      });
      expect(arrivals.length).toBeGreaterThan(10);
      expect(new Set(arrivals).size).toBeGreaterThan(1);
    }
  });

  it('still lets a run wander the full height over several pipes', () => {
    // The reachability cap is per-step, not a ceiling on the run: a level that only ever offered
    // gaps near the start height would be as bad a game as an unflyable one.
    const cfg = { ...config(), random: () => 0.999 };
    const state = createFlappyState(cfg);
    flap(state);
    let highest = 0;
    hover(state, cfg, 3000, () => {
      highest = Math.max(highest, ...state.pipes.map((p) => p.gapBottom));
    });
    expect(highest).toBeGreaterThan(cfg.viewHeight - FLAPPY_TUNING.pipeGap - FLAPPY_TUNING.gapMargin - 0.1);
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

import { pickupOffsetFor, resetFlappyState, scrollSpeed } from './FlappySim';

/** Puts a pipe exactly on the bird with a gap placed to hit or miss, for collision tests. */
const armPipe = (state: ReturnType<typeof createFlappyState>, gapBottom: number, pickup: PipePickup = 'none') => {
  // pickupOffset 0: the tests that predate off-centre pickups are about collision and scoring,
  // and a centred pickup is what they were written against. Tests about the offset set it.
  state.pipes = [
    { id: 99, x: FLAPPY_TUNING.birdX, gapBottom, scored: false, pickup, pickupTaken: false, pickupOffset: 0 },
  ];
};

/** Strips the bird to its last heart, so a single hit is fatal and death tests stay direct. */
const onLastHeart = (state: ReturnType<typeof createFlappyState>) => {
  state.hearts = 1;
};

describe('FlappySim: scoring', () => {
  it('scores a pipe once, when it passes the bird', () => {
    const state = createFlappyState(config());
    flap(state);
    // On its last heart, so the run still ends on the ground: with a full three the bird now
    // bounces, keeps flying and banks a second pipe, which is not what this test is about.
    onLastHeart(state);
    armPipe(state, FLAPPY_TUNING.startY - FLAPPY_TUNING.pipeGap / 2);
    state.pipes[0].x = FLAPPY_TUNING.birdX + 0.2;
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
  it('spends a heart on the pipe below the gap, and keeps flying', () => {
    const state = createFlappyState(config());
    flap(state);
    state.birdY = 1.0;
    armPipe(state, 4.0);
    step(state, 1 / 60, config());
    expect(state.hearts).toBe(FLAPPY_TUNING.startingHearts - 1);
    expect(state.phase).toBe('FLYING');
  });

  it('spends a heart on the pipe above the gap, and keeps flying', () => {
    const state = createFlappyState(config());
    flap(state);
    state.birdY = 8.0;
    armPipe(state, 2.0);
    step(state, 1 / 60, config());
    expect(state.hearts).toBe(FLAPPY_TUNING.startingHearts - 1);
    expect(state.phase).toBe('FLYING');
  });

  it('dies when a pipe hit lands on the last heart', () => {
    const state = createFlappyState(config());
    flap(state);
    onLastHeart(state);
    state.birdY = 1.0;
    armPipe(state, 4.0);
    step(state, 1 / 60, config());
    expect(state.hearts).toBe(0);
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
    state.pipes[0].x = FLAPPY_TUNING.birdX + 2.0;
    step(state, 1 / 60, config());
    expect(state.phase).toBe('FLYING');
  });

  it('bounces off the ground for a heart rather than ending the run', () => {
    const state = createFlappyState(config());
    flap(state);
    state.birdY = FLAPPY_TUNING.birdHalfHeight + 0.01;
    state.velocity = -5;
    step(state, 1 / 60, config());
    expect(state.hearts).toBe(FLAPPY_TUNING.startingHearts - 1);
    expect(state.phase).toBe('FLYING');
    // Bounced back up, not left skimming the floor waiting to be billed again.
    expect(state.velocity).toBeGreaterThan(0);
    expect(state.birdY).toBeGreaterThanOrEqual(FLAPPY_TUNING.birdHalfHeight);
  });

  it('rests on the ground instead of sinking through it while invulnerable', () => {
    const state = createFlappyState(config());
    flap(state);
    state.birdY = FLAPPY_TUNING.birdHalfHeight + 0.01;
    state.velocity = -5;
    step(state, 1 / 60, config()); // spends a heart and starts the grace period
    const spent = state.hearts;
    // Hold it on the floor for the rest of the grace window; it must not be billed again, and
    // must not fall through the world either.
    for (let i = 0; i < 60; i++) {
      state.velocity = -5;
      step(state, 1 / 60, config());
      expect(state.birdY).toBeGreaterThanOrEqual(FLAPPY_TUNING.birdHalfHeight - 1e-9);
    }
    expect(state.hearts).toBe(spent);
  });

  it('dies on the ground on the last heart, then reaches GAME_OVER once it lands', () => {
    const state = createFlappyState(config());
    flap(state);
    onLastHeart(state);
    // Triggered via a pipe collision well clear of the ground, rather than via flap()'s own
    // residual velocity at a specific birdY -- that coupled this test to the exact value of
    // flapImpulse, and broke the moment a tuning pass changed it. A pipe hit here is
    // deterministic: DYING persists for many frames while gravity closes the ~5-unit gap to
    // the ground, regardless of what any FLAPPY_TUNING constant is set to.
    state.birdY = 5.0;
    state.velocity = 0;
    armPipe(state, 6.0);
    step(state, 1 / 60, config());
    expect(state.phase).toBe('DYING');
    for (let i = 0; i < 300; i++) step(state, 1 / 60, config());
    expect(state.phase).toBe('GAME_OVER');
    expect(state.birdY).toBeCloseTo(FLAPPY_TUNING.birdHalfHeight, 6);
  });

  it('ignores flaps once dying, and stops scoring', () => {
    const state = createFlappyState(config());
    flap(state);
    onLastHeart(state);
    // Killed by a pipe well clear of the ground rather than by parking the bird just under the
    // surface -- the same coupling the ground-death test above already documents. That version
    // leaned on flap()'s residual velocity leaving the bird below y=0 after one frame, and a
    // stronger flapImpulse now carries it clear within that frame, so it simply stopped dying.
    state.birdY = 5.0;
    state.velocity = 0;
    armPipe(state, 8.0);
    step(state, 1 / 60, config());
    expect(state.phase).toBe('DYING');
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

describe('FlappySim: the grace period after a hit', () => {
  /** Re-seats the bird inside the same pipe every frame, so the overlap never scrolls away. */
  const pinInsidePipe = (state: FlappyState) => {
    state.birdY = 1.0;
    armPipe(state, 4.0);
  };

  it('does not bill a second heart for the same pipe', () => {
    const state = createFlappyState(config());
    flap(state);
    pinInsidePipe(state);
    step(state, 1 / 60, config());
    expect(state.hearts).toBe(FLAPPY_TUNING.startingHearts - 1);

    // Still buried in the pipe, but inside the grace window: this must cost nothing. Without it
    // a single mistake would drain every heart in a handful of frames.
    for (let i = 0; i < 30; i++) {
      pinInsidePipe(state);
      step(state, 1 / 60, config());
    }
    expect(state.hearts).toBe(FLAPPY_TUNING.startingHearts - 1);
  });

  it('bills again once the grace period has expired', () => {
    const state = createFlappyState(config());
    flap(state);
    pinInsidePipe(state);
    step(state, 1 / 60, config());
    const afterFirst = state.hearts;

    const frames = Math.ceil(FLAPPY_TUNING.invulnerableSeconds * 60) + 5;
    for (let i = 0; i < frames; i++) {
      pinInsidePipe(state);
      step(state, 1 / 60, config());
    }
    expect(state.hearts).toBeLessThan(afterFirst);
  });

  it('runs the grace period down in real time, not per frame', () => {
    const state = createFlappyState(config());
    flap(state);
    pinInsidePipe(state);
    step(state, 1 / 60, config());
    // The full window: the countdown runs before the hit is registered within a sub-step, so
    // the frame you are hit on does not eat into your own grace.
    expect(state.invulnerableFor).toBeCloseTo(FLAPPY_TUNING.invulnerableSeconds, 6);

    // One big frame and many small ones must spend the same amount of grace.
    const other = createFlappyState(config());
    flap(other);
    pinInsidePipe(other);
    step(other, 1 / 60, config());
    for (let i = 0; i < 12; i++) step(other, 1 / 60, config());
    step(state, 12 / 60, config());
    expect(state.invulnerableFor).toBeCloseTo(other.invulnerableFor, 6);
  });
});

describe('FlappySim: coins', () => {
  const centredGap = FLAPPY_TUNING.startY - FLAPPY_TUNING.pipeGap / 2;

  it('collects a gap coin once, counting it in both score and coins', () => {
    const state = createFlappyState(config());
    flap(state);
    state.velocity = 0;
    state.birdY = FLAPPY_TUNING.startY; // dead centre of the gap, which is where the coin sits
    armPipe(state, centredGap, 'coin');
    // Just ahead of the bird, so the pipe itself has not scored yet and cannot muddy the count.
    state.pipes[0].x = FLAPPY_TUNING.birdX + 0.1;

    step(state, 1 / 60, config());
    expect(state.coins).toBe(1);
    expect(state.score).toBe(1);
    expect(state.pipes[0].pickupTaken).toBe(true);

    step(state, 1 / 60, config());
    expect(state.coins).toBe(1); // never twice
  });

  it('leaves a coin the bird flew wide of', () => {
    const state = createFlappyState(config());
    flap(state);
    state.velocity = 0;
    // Inside the gap and alive, but hugging its lower edge, far from the centred coin.
    state.birdY = centredGap + FLAPPY_TUNING.birdHalfHeight + 0.05;
    armPipe(state, centredGap, 'coin');
    state.pipes[0].x = FLAPPY_TUNING.birdX + 0.1;

    step(state, 1 / 60, config());
    expect(state.phase).toBe('FLYING');
    expect(state.coins).toBe(0);
    expect(state.pipes[0].pickupTaken).toBe(false);
  });

  it('puts a centred pickup at the centre of the gap', () => {
    const pipe = {
      id: 1,
      x: 0,
      gapBottom: 4,
      scored: false,
      pickup: 'coin' as const,
      pickupTaken: false,
      pickupOffset: 0,
    };
    expect(pickupY(pipe)).toBeCloseTo(4 + FLAPPY_TUNING.pipeGap / 2, 6);
  });

  it('collects coins over a real run, not just a hand-placed pipe', () => {
    // hover() parks the bird at the centre of whichever gap it is level with -- which is exactly
    // where coins sit -- so a long hovered run exercises the whole chain: pipes spawning, the
    // RNG deciding which carry a coin, and collection as each scrolls past. armPipe cannot
    // cover that, because it never lets recyclePipes generate anything.
    const cfg = config();
    const state = createFlappyState(cfg);
    flap(state);
    hover(state, cfg, 600);

    expect(state.coins).toBeGreaterThan(0);
    // Coins are counted inside the score, alongside a point for each pipe passed.
    expect(state.score).toBeGreaterThan(state.coins);
    // Every coin still on a live pipe that the bird has already flown past must have been taken.
    const missedBehind = state.pipes.filter(
      (p) => p.pickup === 'coin' && !p.pickupTaken && p.x < FLAPPY_TUNING.birdX - FLAPPY_TUNING.pipeHalfWidth,
    );
    expect(missedBehind).toHaveLength(0);
  });

  it('decides which pipes carry a coin from the injected RNG', () => {
    const spawn = (random: () => number) => {
      const cfg: FlappyConfig = { viewWidth: 6.1, viewHeight: 13.3, random };
      const state = createFlappyState(cfg);
      flap(state);
      step(state, 1 / 60, cfg);
      expect(state.pipes.length).toBeGreaterThan(0);
      return state.pipes;
    };
    // coinChance is 0.65, so a source below it coins every pipe and one above it coins none.
    expect(spawn(() => 0.1).every((p) => p.pickup === 'coin')).toBe(true);
    expect(spawn(() => 0.9).some((p) => p.pickup === 'coin')).toBe(false);
  });
});

describe('FlappySim: shield pickup', () => {
  const centredGap = FLAPPY_TUNING.startY - FLAPPY_TUNING.pipeGap / 2;

  it('collects a gap shield once, shielding the bird without scoring', () => {
    const state = createFlappyState(config());
    flap(state);
    state.velocity = 0;
    state.birdY = FLAPPY_TUNING.startY; // dead centre of the gap, where the pickup sits
    armPipe(state, centredGap, 'shield');
    // Just ahead of the bird, so the pipe itself has not scored yet and cannot muddy the count.
    state.pipes[0].x = FLAPPY_TUNING.birdX + 0.1;

    step(state, 1 / 60, config());
    expect(state.shielded).toBe(true);
    expect(state.pipes[0].pickupTaken).toBe(true);
    // The bubble is its own reward: counting it would make `score` incomparable with the bests
    // saved since coins started counting, for a second time.
    expect(state.score).toBe(0);
    expect(state.coins).toBe(0);
  });

  it('decides which coinless pipes carry a shield from the same RNG draw', () => {
    const spawn = (random: () => number) => {
      const cfg: FlappyConfig = { viewWidth: 6.1, viewHeight: 13.3, random };
      const state = createFlappyState(cfg);
      flap(state);
      step(state, 1 / 60, cfg);
      expect(state.pipes.length).toBeGreaterThan(0);
      return state.pipes;
    };
    // One draw decides both pickups: [0, coinChance) coins, then shieldChance of what is left,
    // then nothing. Keeping it to a single call is what leaves every existing pipe sequence --
    // and every test that depends on one -- untouched.
    const shieldBand = FLAPPY_TUNING.coinChance + (1 - FLAPPY_TUNING.coinChance) * FLAPPY_TUNING.shieldChance;
    expect(shieldBand).toBeLessThan(0.9);
    expect(spawn(() => 0.1).every((p) => p.pickup === 'coin')).toBe(true);
    expect(spawn(() => (FLAPPY_TUNING.coinChance + shieldBand) / 2).every((p) => p.pickup === 'shield')).toBe(true);
    expect(spawn(() => 0.95).every((p) => p.pickup === 'none')).toBe(true);
  });
});

describe('FlappySim: what the shield absorbs', () => {
  /** Buries the bird in a pipe, the way the grace-period tests do. */
  const pinInsidePipe = (state: FlappyState) => {
    state.birdY = 1.0;
    armPipe(state, 4.0);
  };

  it('spends the bubble instead of a heart on a pipe hit', () => {
    const state = createFlappyState(config());
    flap(state);
    state.shielded = true;
    pinInsidePipe(state);
    step(state, 1 / 60, config());
    expect(state.hearts).toBe(FLAPPY_TUNING.startingHearts);
    expect(state.shielded).toBe(false);
    expect(state.phase).toBe('FLYING');
    // The pop starts the same grace window a spent heart does, so the pipe that popped it --
    // still overlapping the bird -- cannot immediately bill a heart as well.
    expect(state.invulnerableFor).toBeCloseTo(FLAPPY_TUNING.invulnerableSeconds, 6);
  });

  it('spends the bubble instead of a heart on a ground hit, and bounces', () => {
    const state = createFlappyState(config());
    flap(state);
    state.shielded = true;
    state.birdY = FLAPPY_TUNING.birdHalfHeight + 0.01;
    state.velocity = -5;
    step(state, 1 / 60, config());
    expect(state.hearts).toBe(FLAPPY_TUNING.startingHearts);
    expect(state.shielded).toBe(false);
    // The bounce matters as much as the saved heart: without it the bird lies on the floor
    // until the grace runs out and is billed anyway.
    expect(state.velocity).toBeGreaterThan(0);
  });

  it('absorbs exactly one hit', () => {
    const state = createFlappyState(config());
    flap(state);
    state.shielded = true;
    pinInsidePipe(state);
    step(state, 1 / 60, config());

    // Past the grace window, still buried in the pipe: the bubble is gone, so this one costs.
    const frames = Math.ceil(FLAPPY_TUNING.invulnerableSeconds * 60) + 5;
    for (let i = 0; i < frames; i++) {
      pinInsidePipe(state);
      step(state, 1 / 60, config());
    }
    expect(state.hearts).toBe(FLAPPY_TUNING.startingHearts - 1);
  });

  it('saves the run on the last heart', () => {
    const state = createFlappyState(config());
    flap(state);
    onLastHeart(state);
    state.shielded = true;
    pinInsidePipe(state);
    step(state, 1 / 60, config());
    expect(state.phase).toBe('FLYING');
    expect(state.hearts).toBe(1);
  });
});

describe('FlappySim: pickups sit off the gap centre', () => {
  const maxOffset = FLAPPY_TUNING.pipeGap / 2 - FLAPPY_TUNING.coinHalfSize;

  const spawnRun = (frames: number) => {
    const cfg: FlappyConfig = { viewWidth: 6.1, viewHeight: 13.3, random: mulberry32(20260912) };
    const state = createFlappyState(cfg);
    flap(state);
    const seen = new Map<number, FlappyPipe>();
    hover(state, cfg, frames, () => {
      for (const p of state.pipes) if (!seen.has(p.id)) seen.set(p.id, { ...p });
    });
    return [...seen.entries()].sort((a, b) => a[0] - b[0]).map(([, p]) => p);
  };

  it('keeps every pickup fully inside the gap', () => {
    // The whole point of the ramp is that it stops short of the pipe edge. A pickup the bird
    // cannot reach without taking a hit is not a risk, it is a tax.
    for (const pipe of spawnRun(900)) {
      expect(Math.abs(pipe.pickupOffset)).toBeLessThanOrEqual(maxOffset + 1e-9);
    }
  });

  it('starts at the centre and drifts to the edge as the run goes on', () => {
    expect(pickupOffsetFor(0)).toBe(0);
    expect(Math.abs(pickupOffsetFor(5))).toBeLessThan(maxOffset / 2);
    expect(Math.abs(pickupOffsetFor(10))).toBeGreaterThan(Math.abs(pickupOffsetFor(5)));
    // Reached at pipe 27, and it never grows past the point where the pickup would overlap a
    // pipe edge, however long the run.
    expect(Math.abs(pickupOffsetFor(27))).toBeCloseTo(maxOffset, 6);
    expect(Math.abs(pickupOffsetFor(500))).toBeCloseTo(maxOffset, 6);
  });

  it('alternates which side of the gap it offers', () => {
    const pipes = spawnRun(900);
    // Read off pipe parity rather than drawn, so the rhythm is learnable -- and so that adding
    // this cost no RNG call, which would have shifted every sequence seeded before it.
    for (const pipe of pipes.slice(1)) {
      expect(Math.sign(pipe.pickupOffset)).toBe(pipe.id % 2 === 0 ? 1 : -1);
    }
  });

  it('puts the pickup box where the offset says, not at the gap centre', () => {
    const pipe: FlappyPipe = {
      id: 1,
      x: 0,
      gapBottom: 4,
      scored: false,
      pickup: 'coin',
      pickupTaken: false,
      pickupOffset: 1.0,
    };
    expect(pickupY(pipe)).toBeCloseTo(4 + FLAPPY_TUNING.pipeGap / 2 + 1.0, 6);
  });

  it('no longer hands the coin to a bird flying dead centre', () => {
    const state = createFlappyState(config());
    flap(state);
    state.velocity = 0;
    state.birdY = FLAPPY_TUNING.startY;
    armPipe(state, FLAPPY_TUNING.startY - FLAPPY_TUNING.pipeGap / 2, 'coin');
    state.pipes[0].pickupOffset = maxOffset;
    state.pipes[0].x = FLAPPY_TUNING.birdX + 0.1;

    step(state, 1 / 60, config());
    expect(state.coins).toBe(0);

    // ...but does hand it over once the bird climbs to where the coin actually is.
    state.birdY = pickupY(state.pipes[0]);
    step(state, 1 / 60, config());
    expect(state.coins).toBe(1);
  });
});

describe('FlappySim: a seed decides the layout, the player does not', () => {
  it('generates the same gaps however well the run is played', () => {
    // The regression this design exists to prevent. Gap placement used to budget against
    // `score`, which counts COINS as well as pipes -- so one player taking a coin another
    // missed moved every pipe after it, and a shared daily seed meant nothing.
    const gapsFor = (bonus: number) => {
      const cfg: FlappyConfig = { viewWidth: 6.1, viewHeight: 13.3, random: mulberry32(20260912) };
      const state = createFlappyState(cfg);
      flap(state);
      const gaps = new Map<number, number>();
      let frame = 0;
      hover(state, cfg, 600, () => {
        // A run that banked a pile of coins early, versus one that banked none.
        if (frame++ === 60) state.score += bonus;
        for (const p of state.pipes) if (!gaps.has(p.id)) gaps.set(p.id, p.gapBottom);
      });
      return [...gaps.entries()].sort((a, b) => a[0] - b[0]).map(([, g]) => g);
    };
    const greedy = gapsFor(25);
    const frugal = gapsFor(0);
    expect(greedy).toHaveLength(frugal.length);
    expect(greedy).toEqual(frugal);
  });

  it('gives two runs on the same seed identical pipes, and a different day different ones', () => {
    const run = (seed: number) => {
      const cfg: FlappyConfig = { viewWidth: 6.1, viewHeight: 13.3, random: mulberry32(seed) };
      const state = createFlappyState(cfg);
      flap(state);
      hover(state, cfg, 400);
      return state.pipes.map((p) => `${p.gapBottom.toFixed(4)}:${p.pickup}`);
    };
    expect(run(20260912)).toEqual(run(20260912));
    expect(run(20260913)).not.toEqual(run(20260912));
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
    expect(state.coins).toBe(0);
    expect(state.hearts).toBe(FLAPPY_TUNING.startingHearts);
    expect(state.shielded).toBe(false);
    expect(state.invulnerableFor).toBe(0);
    expect(state.scroll).toBe(0);
    expect(state.nextPipeId).toBe(0);
  });
});

describe('FlappySim: heart pickup', () => {
  const centredGap = FLAPPY_TUNING.startY - FLAPPY_TUNING.pipeGap / 2;

  /** A bird mid-run, parked dead centre of the gap where a centred pickup sits. */
  const armed = (pickup: PipePickup) => {
    const state = createFlappyState(config());
    flap(state);
    state.velocity = 0;
    state.birdY = FLAPPY_TUNING.startY;
    armPipe(state, centredGap, pickup);
    // Just ahead of the bird, so the pipe itself has not scored yet and cannot muddy the count.
    state.pipes[0].x = FLAPPY_TUNING.birdX + 0.1;
    return state;
  };

  it('restores one spent heart, without scoring', () => {
    const state = armed('heart');
    state.hearts = 1;

    step(state, 1 / 60, config());
    expect(state.hearts).toBe(2);
    expect(state.pipes[0].pickupTaken).toBe(true);
    // A life is its own reward, exactly as the bubble is.
    expect(state.score).toBe(0);
    expect(state.coins).toBe(0);
  });

  it('never carries the bird past its starting hearts', () => {
    const state = armed('heart');
    state.hearts = FLAPPY_TUNING.startingHearts;

    step(state, 1 / 60, config());
    expect(state.hearts).toBe(FLAPPY_TUNING.startingHearts);
  });

  it('scores as a coin when the bird is already at full hearts', () => {
    const state = armed('heart');
    state.hearts = FLAPPY_TUNING.startingHearts;

    step(state, 1 / 60, config());
    // Taken rather than left behind: a pickup that visibly ignores the player reads as a bug,
    // and the HUD has no fourth heart to show, so the value is paid out in score instead.
    expect(state.pipes[0].pickupTaken).toBe(true);
    expect(state.coins).toBe(1);
    expect(state.score).toBe(1);
  });

  it('decides which pipes carry a heart from the same single RNG draw', () => {
    const spawn = (random: () => number) => {
      const cfg: FlappyConfig = { viewWidth: 6.1, viewHeight: 13.3, random };
      const state = createFlappyState(cfg);
      flap(state);
      step(state, 1 / 60, cfg);
      expect(state.pipes.length).toBeGreaterThan(0);
      return state.pipes;
    };
    // Hearts are drawn LAST, out of the tail that already rolled neither coin nor shield, so
    // every seed keeps the coins and shields it had before hearts existed.
    const shieldBand = FLAPPY_TUNING.coinChance + (1 - FLAPPY_TUNING.coinChance) * FLAPPY_TUNING.shieldChance;
    const heartBand = shieldBand + (1 - shieldBand) * FLAPPY_TUNING.heartChance;
    expect(heartBand).toBeLessThan(0.9);
    expect(spawn(() => (shieldBand + heartBand) / 2).every((p) => p.pickup === 'heart')).toBe(true);
    expect(spawn(() => 0.95).every((p) => p.pickup === 'none')).toBe(true);
  });

  it('is rarer than the shield it shares the coinless tail with', () => {
    // A life is worth more than a bubble, so it has to be harder to find than one.
    const shieldShare = (1 - FLAPPY_TUNING.coinChance) * FLAPPY_TUNING.shieldChance;
    const shieldBand = FLAPPY_TUNING.coinChance + shieldShare;
    const heartShare = (1 - shieldBand) * FLAPPY_TUNING.heartChance;
    expect(heartShare).toBeLessThan(shieldShare);
  });
});
