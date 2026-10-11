import { describe, expect, it } from 'vitest';
import { renderRecipe, encodeWav, envelope, applyEcho, foldTail, type Recipe } from './wavSynth';
import { SFX, type SfxId } from '../src/core/SfxCatalogue';
import { RECIPES } from './generate-sfx';

const ALL_IDS = Object.keys(SFX) as SfxId[];

describe('wavSynth: renderRecipe', () => {
  it('clamps samples within [-1, 1] for SFX recipes', () => {
    for (const id of ALL_IDS) {
      const samples = renderRecipe(RECIPES[id]);
      for (const s of samples) {
        expect(s, `${id} sample out of range: ${s}`).toBeGreaterThanOrEqual(-1);
        expect(s, `${id} sample out of range: ${s}`).toBeLessThanOrEqual(1);
      }
    }
  });

  it('renders a length matching totalDuration at the given sample rate', () => {
    const recipe = RECIPES.UI_TAP;
    const sampleRate = 22050;
    const samples = renderRecipe(recipe, sampleRate);
    expect(samples.length).toBe(Math.ceil(recipe.totalDuration * sampleRate));
  });

  it("normalizes rather than clips in 'normalize' mode when the mix exceeds [-1, 1]", () => {
    const recipe: Recipe = {
      totalDuration: 0.01,
      layers: [
        { wave: 'sine', freqStart: 440, startTime: 0, duration: 0.01, gain: 1, attack: 0, release: 0.001 },
        { wave: 'sine', freqStart: 440, startTime: 0, duration: 0.01, gain: 1, attack: 0, release: 0.001 },
      ],
    };
    const samples = renderRecipe(recipe, 22050, 'normalize');
    let peak = 0;
    for (const s of samples) peak = Math.max(peak, Math.abs(s));
    expect(peak).toBeLessThanOrEqual(1);
    expect(peak).toBeGreaterThan(0.9);
  });

  it("leaves the sum untouched in 'raw' mode so callers can post-process", () => {
    const recipe: Recipe = {
      totalDuration: 0.01,
      layers: [
        { wave: 'sine', freqStart: 440, startTime: 0, duration: 0.01, gain: 1, attack: 0, release: 0.001 },
        { wave: 'sine', freqStart: 440, startTime: 0, duration: 0.01, gain: 1, attack: 0, release: 0.001 },
      ],
    };
    const samples = renderRecipe(recipe, 22050, 'raw');
    let peak = 0;
    for (const s of samples) peak = Math.max(peak, Math.abs(s));
    // Two full-gain sines in phase must be allowed past 1.0 here.
    expect(peak).toBeGreaterThan(1);
  });
});

describe('wavSynth: pluck envelope', () => {
  it('decays monotonically to zero after the attack', () => {
    const duration = 0.5;
    const attack = 0.005;
    const at = (t: number) => envelope(t, duration, attack, 0.02, 'pluck');

    expect(at(0)).toBeCloseTo(0, 5);
    expect(at(attack)).toBeCloseTo(1, 2);
    // Strictly decreasing from the peak onward, ending at silence so the note can't click off.
    let prev = at(attack);
    for (let t = attack + 0.005; t <= duration; t += 0.005) {
      const level = at(t);
      expect(level).toBeLessThanOrEqual(prev + 1e-9);
      prev = level;
    }
    expect(at(duration)).toBeCloseTo(0, 5);
  });
});

describe('wavSynth: foldTail', () => {
  it('folds the overhang back onto the start and returns exactly loopSamples', () => {
    const samples = new Float64Array([1, 2, 3, 4, 0.5, 0.25]);
    const looped = foldTail(samples, 4);

    expect(looped.length).toBe(4);
    expect(looped[0]).toBeCloseTo(1.5); // 1 + 0.5
    expect(looped[1]).toBeCloseTo(2.25); // 2 + 0.25
    expect(looped[2]).toBeCloseTo(3);
    expect(looped[3]).toBeCloseTo(4);
  });
});

describe('wavSynth: applyEcho', () => {
  it('repeats earlier samples at the delay offset, scaled by feedback', () => {
    const samples = new Float64Array([1, 0, 0, 0, 0, 0]);
    // delay of 2 samples at a 1Hz "sample rate" of 2 => step 2.
    applyEcho(samples, 1, 0.5, 2);

    expect(samples[0]).toBeCloseTo(1);
    expect(samples[2]).toBeCloseTo(0.5);
    expect(samples[4]).toBeCloseTo(0.25);
  });

  it('is a no-op for a zero delay or zero feedback', () => {
    const a = new Float64Array([1, 2, 3]);
    applyEcho(a, 0, 0.5, 22050);
    expect(Array.from(a)).toEqual([1, 2, 3]);

    const b = new Float64Array([1, 2, 3]);
    applyEcho(b, 0.1, 0, 22050);
    expect(Array.from(b)).toEqual([1, 2, 3]);
  });
});

describe('wavSynth: encodeWav', () => {
  it('writes a valid 44-byte RIFF/WAVE header with correct chunk sizes', () => {
    const samples = renderRecipe(RECIPES.NEW_BEST);
    const wav = encodeWav(samples);

    expect(wav.toString('ascii', 0, 4)).toBe('RIFF');
    expect(wav.toString('ascii', 8, 12)).toBe('WAVE');
    expect(wav.toString('ascii', 12, 16)).toBe('fmt ');
    expect(wav.toString('ascii', 36, 40)).toBe('data');

    const dataSize = wav.readUInt32LE(40);
    expect(dataSize).toBe(samples.length * 2);
    expect(wav.readUInt32LE(4)).toBe(36 + dataSize);
    expect(wav.length).toBe(44 + dataSize);

    // PCM, mono, 16-bit — the format every browser and the Android WebView decode natively.
    expect(wav.readUInt16LE(20)).toBe(1);
    expect(wav.readUInt16LE(22)).toBe(1);
    expect(wav.readUInt16LE(34)).toBe(16);
  });

  it('never wraps a full-scale sample past int16 range', () => {
    const samples = new Float64Array([1, -1, 0.9999999, -0.9999999]);
    const wav = encodeWav(samples);

    expect(wav.readInt16LE(44)).toBe(32767);
    expect(wav.readInt16LE(46)).toBe(-32767);
  });
});

describe('generate-sfx: catalogue coverage', () => {
  it('has a recipe for every SfxId', () => {
    for (const id of ALL_IDS) {
      expect(RECIPES[id], `missing recipe for ${id}`).toBeDefined();
    }
  });

  it('has a unique file name per id', () => {
    const files = ALL_IDS.map((id) => SFX[id].file);
    expect(new Set(files).size).toBe(files.length);
  });
});
