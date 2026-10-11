// Deterministic randomness for Flappy: the same day gives every player the same pipes, and the
// same run replayed gives the same pipes again.
//
// Pure arithmetic, no Phaser and no Date.now() of its own -- the caller passes the date in, so
// this module is testable under docs/adr/0004-vitest-for-pure-logic.md and a test can ask about
// next New Year's Eve without waiting for it.

/**
 * mulberry32: a 32-bit PRNG that is about ten lines long and good enough for placing pipes.
 *
 * Written out rather than pulled in as a dependency, and chosen over the shorter xorshift
 * variants because those are visibly weak in their low bits -- and the low bits are exactly what
 * `random() < chance` leans on when deciding what a pipe carries.
 *
 * Returns a function with Math.random's contract: a float in [0, 1).
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The seed every run made today shares.
 *
 * Positional rather than additive -- year * 10000 + month * 100 + day, i.e. the date read as the
 * number 20260912 -- because adding the three parts collides: 2026-01-02 and 2026-02-01 would
 * hand back the same number and quietly replay one day's layout on another.
 *
 * Local midnight, not UTC: the day should roll over when it does for the player holding the
 * phone, which is the only rollover they can observe.
 */
export function dailySeed(date: Date): number {
  return date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
}
