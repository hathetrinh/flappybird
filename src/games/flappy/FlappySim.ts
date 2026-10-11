// The whole game, as arithmetic. No Phaser, no three.js, no DOM — that is deliberate: this is
// the part whose feel has to be tuned and whose collision maths has to be right, and both are
// far easier to trust when they can be run headlessly. See
// docs/adr/0004-vitest-for-pure-logic.md.
//
// Coordinates: world units, ground surface at y = 0, bird fixed at x = 0 with the world
// scrolling past it. Positive velocity is up.

export type FlappyPhase = 'READY' | 'FLYING' | 'DYING' | 'GAME_OVER';

/**
 * What a pipe carries in the centre of its gap. A pipe holds at most one thing, so this is one
 * slot rather than a flag per pickup type -- three booleans could encode states that cannot
 * exist, and the renderer would have to decide which of them wins.
 */
export type PipePickup = 'none' | 'coin' | 'shield' | 'heart';

export interface FlappyPipe {
  id: number;
  x: number;
  gapBottom: number;
  scored: boolean;
  /** Not every pipe carries something -- see FLAPPY_TUNING.coinChance. */
  pickup: PipePickup;
  pickupTaken: boolean;
  /**
   * Where the pickup sits relative to the centre of the gap, in world units. Signed: positive
   * is toward the upper pipe. Stored per pipe rather than recomputed by everyone who needs it,
   * because the renderer needs the same answer as the collision check and used to get it by
   * assuming the centre.
   */
  pickupOffset: number;
}

/** Where a pipe's pickup sits: off the centre of its gap by the pipe's own offset. */
export function pickupY(pipe: FlappyPipe): number {
  return pipe.gapBottom + FLAPPY_TUNING.pipeGap / 2 + pipe.pickupOffset;
}

/**
 * How far off centre the nth pipe's pickup sits.
 *
 * A coin at the centre of the gap is the safest point in the level, so collecting it and flying
 * well were the same action and the coin asked nothing of the player. Offset, it becomes a
 * decision: leave the safe line, or bank the pipe and move on.
 *
 * The magnitude ramps with the pipe index so early coins stay free and late ones do not -- risk
 * climbing alongside the existing speed ramp -- and the sign alternates on parity so the player
 * can learn the rhythm. Parity rather than a draw is also what keeps this free of the RNG: an
 * extra call here would have shifted every sequence a seed produces.
 */
export function pickupOffsetFor(pipeIndex: number): number {
  const limit = FLAPPY_TUNING.pipeGap / 2 - FLAPPY_TUNING.coinHalfSize;
  const magnitude = Math.min(limit, pipeIndex * FLAPPY_TUNING.pickupOffsetPerPipe);
  return pipeIndex % 2 === 0 ? magnitude : -magnitude;
}

export interface FlappyState {
  phase: FlappyPhase;
  birdY: number;
  velocity: number;
  pitch: number;
  /** Total distance travelled; the world uses it to wrap the ground and parallax props. */
  scroll: number;
  pipes: FlappyPipe[];
  /** Pipes passed plus coins collected. What the high score records. */
  score: number;
  /** Coins alone, for the HUD. Already counted inside `score`. */
  coins: number;
  /**
   * Pipes passed, which is what the speed ramps on.
   *
   * Deliberately not `score`: that counts coins too, so a player who collected more used to
   * scroll faster -- and with a shared daily seed that meant two players on the same seed met
   * different pipes. Pacing has to depend on how far you have flown, not on what you picked up.
   */
  pipesPassed: number;
  /** Hits remaining. The run ends when a hit lands with this at 1. */
  hearts: number;
  /** Carrying a bubble, which absorbs the next hit of any kind instead of a heart. */
  shielded: boolean;
  /**
   * Seconds of grace left after a hit. While positive the bird passes through pipes and rests
   * on the ground without being hit again, which is what makes "keep flying" survivable: it has
   * to be long enough for the pipe that hit you to scroll clear.
   */
  invulnerableFor: number;
  nextPipeId: number;
}

/** What the bird is touching. Ground and pipe differ because only the ground bounces. */
type Contact = 'none' | 'pipe' | 'ground';

export interface FlappyConfig {
  /** viewHeight × aspect — tracks the real canvas shape. */
  viewWidth: number;
  /** Fixed regardless of screen shape — everything here is tuned against this value. */
  viewHeight: number;
  /** Injected so pipe placement is deterministic in tests. */
  random: () => number;
}

// Derived from the original game's proportions, anchoring our 1.1-unit pipe against its 52px
// one: 1 original pixel = 0.02115 units. The derivation table is in the spec; keeping every
// number here means a tuning pass is a single-file change.
export const FLAPPY_TUNING = {
  // Raised with flapImpulse to make the whole beat quicker: apex in v0/g = 0.28s rather than
  // 0.31s, and a correspondingly harder drop once tapping stops.
  gravity: -30,
  // Derived value was 7.2, which rises v0^2/(2*|gravity|) = 1.23 units on a single flap -- 62%
  // of the then 2-unit gap, not the ~1/3 a controllable flap should cost. That's what made the
  // game feel impossible: any single tap could already carry the bird most of the way through
  // the gap's vertical room, leaving almost no margin for a second tap to correct with.
  //
  // Raised 5.8 -> 7.0 alongside gravity for a snappier beat. Note the two pull against each
  // other: heavier gravity SHORTENS the rise a given impulse buys, so the impulse has to climb
  // by more than gravity does to end up jumping higher at all. Net rise is 7^2/50 = 0.98 units,
  // up from 0.89, which is 27% of the 3.6 gap -- still comfortably inside the ~1/3 ceiling
  // above.
  flapImpulse: 9.0,
  terminalVelocity: -13,
  scrollSpeed: 2.54,
  scrollSpeedMax: 3.4,
  scrollRampPerPoint: 0.02,
  // Both widened by playtest from the pixel-derived 2.35 / 2.0: the edge-to-edge air pocket
  // between consecutive pipes (pipeSpacing - 2*pipeHalfWidth = 1.25 at the old spacing) was
  // narrower than the pipe+bird collision width itself (pipeHalfWidth + birdHalfWidth = 0.86),
  // leaving almost no slack unless the bird was already dead-centre, and the vertical room
  // (pipeGap/2 - birdHalfHeight = 0.8) felt cramped even flying level. Wider on both axes:
  // more reaction time between pipes, and more forgiveness lining up each gap.
  //
  // Widened again from 4.0 to 5.0 for more reaction time. Note this does NOT loosen gap-to-gap
  // placement by the same 25%: reachableRise budgets against min(pipeSpacing, runway), and on a
  // phone the visible runway is ~4.41 units, so past that the vertical budget stops tracking
  // this value. That cap is why the change reads as easier rather than merely sparser -- the
  // extra room is horizontal, while gaps stay roughly as close together vertically as before.
  pipeSpacing: 5.0,
  // Widened from 2.6. The bird now clears each edge by pipeGap/2 - birdHalfHeight = 1.6 units
  // rather than 1.1, and one flap's rise (0.98) covers a quarter of the opening rather than a
  // third, which is what makes fine height corrections possible instead of all-or-nothing.
  // The renderer draws to this value via FlappyGeometry -- it is no longer copied by hand.
  pipeGap: 3.6,
  gapMargin: 1.2,
  // Gap-to-gap placement is capped to what the bird can actually fly (see reachableRise). These
  // three shape that budget.
  //
  // A player tapping at a human rate does not hold `flapImpulse` — velocity sawtooths from v0
  // down towards v0 - gravity/rate before the next tap, so sustained climb is a fraction of the
  // impulse: 1 - gravity/(2 * flapImpulse * rate).
  //
  // This MUST be revisited whenever gravity or flapImpulse move, and nothing will tell you if
  // you forget: reachableRise is defined from these two, so the "never asks for a climb the
  // bird cannot fly" test checks the budget against itself and passes either way. Leave it too
  // high after raising gravity and the generator quietly starts placing gaps out of reach.
  //
  // The previous 0.62 was described as the fraction at ~9 taps/s, but the formula above gives
  // 0.82 there; 0.62 corresponds to ~4.3 taps/s. Taking that implied rate as the playtested
  // truth, the new gravity and impulse give 1 - 25/(2 * 7.0 * 4.3) = 0.585.
  sustainedClimbFactor: 0.585,
  /** Falling is free, so a downward step may be larger than an upward one. */
  gapDropFactor: 1.6,
  startY: 3.0,
  // Where the bird sits along the scroll axis. The camera stays centred on x = 0, so this is
  // also its screen position: 0 is dead centre, negative moves it left and buys lookahead — at
  // an iPhone's viewWidth of 6.1, birdX -1 turns 3.07 units of visible runway into 4.07. The
  // original game sits its bird about a third from the left. reachableRise reads this, so gap
  // placement re-budgets itself when you change it.
  birdX: -1,
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
  startingHearts: 3,
  // Must comfortably exceed the time the offending pipe needs to scroll off the bird, or the
  // grace expires while still overlapping and the same pipe bills a second heart. At the
  // slowest scroll (2.54) a pipe clears the bird in (pipeHalfWidth + birdHalfWidth) * 2 / 2.54
  // = 0.68s, so 1.2 leaves room even once the speed ramp is taken into account.
  invulnerableSeconds: 1.2,
  /**
   * How much further off centre each successive pipe puts its pickup, in world units, until it
   * reaches pipeGap/2 - coinHalfSize (1.35) -- the furthest a pickup fits wholly inside the gap.
   * At 0.05 that is pipe 27, which is a good run rather than a routine one.
   */
  pickupOffsetPerPipe: 0.05,
  /** Fraction of pipes that carry a coin. Drawn from the injected RNG, so runs stay repeatable. */
  coinChance: 0.65,
  // Fraction of the pipes that rolled NO coin which carry a shield instead -- so ~6% of all
  // pipes. Expressed against the remainder rather than against every pipe because it shares the
  // coin's single RNG draw: one number decides both, which is what keeps every pipe sequence
  // generated before shields existed (and every test written against one) bit-identical.
  shieldChance: 0.18,
  // Fraction of the pipes that rolled neither coin nor shield which carry a heart -- roughly 4%
  // of all pipes, deliberately scarcer than the shield's ~6%: a life restored is worth more than
  // a bubble, so it has to be harder to find than one. Drawn from the tail of the SAME single
  // number as the other two, and drawn last, which is what leaves every coin and shield a given
  // seed produced exactly where it was before hearts existed.
  heartChance: 0.15,
  // Half-extent of a coin's pickup box. Deliberately a shade LARGER than the coin as drawn
  // (COIN_SIZE 0.85, so 0.425 either side) — the inverse of the bird's hitbox, which is smaller
  // than its art. Damage should be forgiving and pickups generous; at 0.3 the bird could visibly
  // overlap a coin and not collect it, which reads as the game cheating.
  coinHalfSize: 0.45,
  // Stronger than flapImpulse on purpose: a ground hit has to actually lift the bird clear,
  // not leave it skimming the floor waiting for the grace period to bill another heart.
  groundBounceImpulse: 7,
} as const;

const T = FLAPPY_TUNING;

const clamp = (value: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, value));

export function scrollSpeed(score: number): number {
  return Math.min(T.scrollSpeedMax, T.scrollSpeed + score * T.scrollRampPerPoint);
}

// _config is part of the documented signature (see the spec); step()/flap() consume it,
// this one doesn't yet. Underscore-prefixed so both tsc's noUnusedParameters (which
// recognises the convention natively) and eslint (via the directive below) allow it.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function createFlappyState(_config: FlappyConfig): FlappyState {
  return {
    phase: 'READY',
    birdY: T.startY,
    velocity: 0,
    pitch: 0,
    scroll: 0,
    pipes: [],
    score: 0,
    coins: 0,
    pipesPassed: 0,
    hearts: T.startingHearts,
    shielded: false,
    invulnerableFor: 0,
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

function scorePipes(state: FlappyState): void {
  for (const pipe of state.pipes) {
    // Scored as the pipe's centre crosses the bird, which is also where the classic game's
    // point lands. `scored` makes it once-only regardless of frame length.
    if (!pipe.scored && pipe.x < T.birdX) {
      pipe.scored = true;
      state.score += 1;
      state.pipesPassed += 1;
    }
  }
}

function hitsPipe(state: FlappyState): boolean {
  for (const pipe of state.pipes) {
    if (Math.abs(pipe.x - T.birdX) > T.pipeHalfWidth + T.birdHalfWidth) continue;
    if (state.birdY - T.birdHalfHeight < pipe.gapBottom) return true;
    if (state.birdY + T.birdHalfHeight > pipe.gapBottom + T.pipeGap) return true;
  }
  return false;
}

function onGround(state: FlappyState): boolean {
  return state.birdY - T.birdHalfHeight <= 0;
}

/**
 * Spends a heart, and decides whether the run survives it.
 *
 * A pipe hit deliberately leaves position and velocity alone: the bird carries on through and
 * out the far side, which is what makes the grace period read as "phasing" rather than as being
 * teleported. The ground cannot work that way -- the bird is already resting on the floor, so
 * with nothing else it would simply be billed again the moment grace expires -- hence the
 * bounce.
 */
function takeHit(state: FlappyState, contact: Contact): void {
  // The bubble is spent in a heart's place, and everything below it -- the grace period, the
  // ground bounce -- runs exactly as it would have. A shielded hit is a hit that cost something
  // else, not a hit that never happened.
  if (state.shielded) {
    state.shielded = false;
    survive(state, contact);
    return;
  }

  state.hearts -= 1;
  if (state.hearts <= 0) {
    state.hearts = 0;
    state.phase = 'DYING';
    return;
  }
  survive(state, contact);
}

/** The aftermath of any hit the bird walks away from, whatever paid for it. */
function survive(state: FlappyState, contact: Contact): void {
  state.invulnerableFor = T.invulnerableSeconds;
  if (contact === 'ground') {
    state.birdY = T.birdHalfHeight;
    state.velocity = T.groundBounceImpulse;
  }
}

function collectPickups(state: FlappyState): void {
  for (const pipe of state.pipes) {
    if (pipe.pickup === 'none' || pipe.pickupTaken) continue;
    if (Math.abs(pipe.x - T.birdX) > T.coinHalfSize + T.birdHalfWidth) continue;
    if (Math.abs(pickupY(pipe) - state.birdY) > T.coinHalfSize + T.birdHalfHeight) continue;
    pipe.pickupTaken = true;
    if (pipe.pickup === 'shield') {
      // Already shielded, and the bubble is simply spent: shields do not stack, so a second one
      // banked would be a life the HUD has no way to show.
      state.shielded = true;
    } else if (pipe.pickup === 'heart' && state.hearts < T.startingHearts) {
      state.hearts += 1;
    } else {
      // Everything else scores: a coin, and a heart taken at full health. The HUD draws exactly
      // startingHearts icons, so a fourth life has nowhere to go -- but a pickup the bird flies
      // through untaken reads as the game ignoring the player, so it pays out as score instead.
      state.coins += 1;
      state.score += 1;
    }
  }
}

/**
 * How far the bird can climb between one gap and the next, in world units.
 *
 * The binding time budget is the shorter of two things: how long it takes the next pipe to reach
 * the bird once it has spawned, and how long it has been *visible* while doing so. On a tall,
 * narrow phone the second one binds — half the view is only ~1.2s of travel, and a gap the player
 * cannot see yet is a gap they cannot start climbing toward. That is why this takes `config`:
 * screen shape is a real input to what is flyable, not just to what is drawn.
 */
export function reachableRise(progress: number, config: FlappyConfig): number {
  const speed = scrollSpeed(progress);
  // The visible runway is the right screen edge back to the bird, so moving birdX left widens it.
  const runway = config.viewWidth / 2 - T.birdX;
  const seconds = Math.min(T.pipeSpacing, runway) / speed;
  return T.flapImpulse * T.sustainedClimbFactor * seconds;
}

function nextGapBottom(state: FlappyState, config: FlappyConfig): number {
  const lo = T.gapMargin;
  const hi = config.viewHeight - T.pipeGap - T.gapMargin;
  // The very first gap is centred on the bird's start height rather than random: an opening
  // shot that demands an immediate scramble reads as the game being unfair, not hard.
  const centred = clamp(T.startY - T.pipeGap / 2, lo, Math.max(lo, hi));
  if (state.nextPipeId === 0) return centred;

  // Uniform placement across the whole [lo, hi] band was the bug: with viewHeight 13.3 that band
  // is 8.3 units tall, while ~1.18s of travel between pipes buys a climb of under 4. Roughly one
  // pipe in ten was physically unclearable no matter how well it was played — a superhuman bot
  // that knew every gap in advance still averaged a score of 3. Sampling relative to the previous
  // gap, bounded by what is flyable, keeps the full height in play across a run without ever
  // asking for a jump that cannot be made.
  const prev = state.pipes.length ? state.pipes[state.pipes.length - 1].gapBottom : centred;
  // Budgeted against the index of the pipe being placed, which is also the speed it will be
  // flown at by the time the bird reaches it -- every pipe already in the air passes first.
  //
  // It must be the INDEX and not the score. Score counts coins, so budgeting against it made
  // the layout a function of how well the run was going: take a coin your neighbour missed and
  // every pipe after it moved. A seed cannot mean anything while that is true.
  const rise = reachableRise(state.nextPipeId, config);
  const floor = Math.max(lo, prev - rise * T.gapDropFactor);
  const ceil = Math.min(Math.max(lo, hi), prev + rise);
  return floor + config.random() * Math.max(0, ceil - floor);
}

/** One draw, four outcomes: a coin, else a shield, else a heart, else nothing. */
function rollPickup(roll: number): PipePickup {
  if (roll < T.coinChance) return 'coin';
  const shieldBand = T.coinChance + (1 - T.coinChance) * T.shieldChance;
  if (roll < shieldBand) return 'shield';
  if (roll < shieldBand + (1 - shieldBand) * T.heartChance) return 'heart';
  return 'none';
}

function recyclePipes(state: FlappyState, config: FlappyConfig): void {
  // Off the left edge, but never before the bird has actually passed it — a birdX far enough left
  // would otherwise let a pipe be culled, and so silently un-collided, while still in front of it.
  const despawnAt = Math.min(-config.viewWidth / 2, T.birdX - T.pipeHalfWidth - T.birdHalfWidth) - T.pipeLead;
  while (state.pipes.length && state.pipes[0].x < despawnAt) state.pipes.shift();

  const spawnEdge = config.viewWidth / 2 + T.pipeLead;
  let rightmost = state.pipes.length ? state.pipes[state.pipes.length - 1].x : -Infinity;
  while (rightmost < spawnEdge) {
    const x = state.pipes.length ? rightmost + T.pipeSpacing : spawnEdge;
    // gapBottom must be computed BEFORE nextPipeId is incremented: object-literal properties
    // evaluate left-to-right, so inlining `id: state.nextPipeId++` ahead of `gapBottom: ...`
    // would have nextGapBottom see the post-increment id and never take the "first pipe"
    // branch — exactly the bug this ordering avoids.
    const gapBottom = nextGapBottom(state, config);
    const pickup = rollPickup(config.random());
    const id = state.nextPipeId++;
    state.pipes.push({
      id,
      x,
      gapBottom,
      scored: false,
      pickup,
      pickupTaken: false,
      pickupOffset: pickupOffsetFor(id),
    });
    rightmost = x;
  }
}

function advance(state: FlappyState, dt: number, config: FlappyConfig): void {
  if (state.phase === 'READY' || state.phase === 'GAME_OVER') return;

  if (state.invulnerableFor > 0) state.invulnerableFor = Math.max(0, state.invulnerableFor - dt);

  // Checked before this frame's own movement, so a position that is ALREADY colliding —
  // whether left there by the previous frame or poked in directly, as a test does — is caught
  // without waiting on an extra frame of motion to notice it. The matching check at the tail of
  // this function (after movement) is what catches a collision caused by THIS frame's own
  // motion, with no added latency; the two together cover both cases.
  if (state.phase === 'FLYING' && state.invulnerableFor <= 0 && hitsPipe(state)) {
    takeHit(state, 'pipe');
  }

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

  if (state.phase !== 'FLYING') return;

  // The floor is solid whether or not it costs a heart: while the grace period runs the bird
  // rests on it rather than sinking through the world.
  if (onGround(state)) {
    state.birdY = T.birdHalfHeight;
    if (state.invulnerableFor <= 0) takeHit(state, 'ground');
    else if (state.velocity < 0) state.velocity = 0;
  }
  if (state.phase !== 'FLYING') return; // the ground hit may have spent the last heart

  const dx = scrollSpeed(state.pipesPassed) * dt;
  state.scroll += dx;
  for (const pipe of state.pipes) pipe.x -= dx;
  recyclePipes(state, config);

  scorePipes(state);
  collectPickups(state);
  if (state.invulnerableFor <= 0 && hitsPipe(state)) takeHit(state, 'pipe');
}

/** Restarts in place, so Retry costs no allocation and no scene restart. */
export function resetFlappyState(state: FlappyState, config: FlappyConfig): FlappyState {
  const fresh = createFlappyState(config);
  Object.assign(state, fresh, { pipes: [] });
  return state;
}
