import { describe, expect, it } from 'vitest';
import { dailySeed, mulberry32 } from './FlappyRandom';

describe('FlappyRandom: the generator', () => {
  it('returns the same sequence for the same seed', () => {
    const take = (seed: number) => {
      const rng = mulberry32(seed);
      return [rng(), rng(), rng(), rng(), rng()];
    };
    expect(take(12345)).toEqual(take(12345));
  });

  it('returns a different sequence for a different seed', () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    expect([a(), a(), a()]).not.toEqual([b(), b(), b()]);
  });

  it('stays inside [0, 1), which is what Math.random promises its callers', () => {
    const rng = mulberry32(99);
    for (let i = 0; i < 500; i++) {
      const value = rng();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('spreads its draws across the whole range rather than clustering', () => {
    // A generator that failed this would still pass every test above while quietly making one
    // pipe height, or one pickup kind, far likelier than the tuning assumes.
    const rng = mulberry32(7);
    const buckets = [0, 0, 0, 0];
    for (let i = 0; i < 4000; i++) buckets[Math.floor(rng() * 4)] += 1;
    for (const count of buckets) expect(count).toBeGreaterThan(800);
  });
});

describe('FlappyRandom: the daily seed', () => {
  it('is the same for two moments on the same day', () => {
    const morning = new Date(2026, 8, 12, 6, 30);
    const evening = new Date(2026, 8, 12, 23, 59);
    expect(dailySeed(evening)).toBe(dailySeed(morning));
  });

  it('changes at midnight', () => {
    const today = new Date(2026, 8, 12, 23, 59);
    const tomorrow = new Date(2026, 8, 13, 0, 0);
    expect(dailySeed(tomorrow)).not.toBe(dailySeed(today));
  });

  it('does not collide across a month or year boundary', () => {
    // Naive schemes -- year + month + day added together, say -- give the same number for
    // dates like 2026-01-02 and 2026-02-01, which would silently repeat a day's layout.
    const seeds = new Set([
      dailySeed(new Date(2026, 0, 2)),
      dailySeed(new Date(2026, 1, 1)),
      dailySeed(new Date(2025, 11, 31)),
      dailySeed(new Date(2026, 0, 1)),
    ]);
    expect(seeds.size).toBe(4);
  });
});
