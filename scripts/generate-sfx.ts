// scripts/generate-sfx.ts
//
// Synthesizes every SfxId in ../src/core/SfxCatalogue into a 16-bit mono WAV under
// public/assets/audio/. Run via `npm run build:sfx`. Output is committed to git — this is a
// manual regeneration script, not a build step (see scripts/validate-logic-grid-levels.ts for
// the same pattern).
//
// Imports the catalogue by relative path, not the `@core/*` alias: this script runs under
// `tsx`, which does not resolve tsconfig path aliases without extra configuration.
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SFX, type SfxId } from '../src/core/SfxCatalogue';
import { renderRecipe as renderRecipeShared, encodeWav, SAMPLE_RATE, type Recipe } from './wavSynth';

export type { Wave, Layer, Recipe } from './wavSynth';

// A missing entry here is a compile error, which is the whole point of keeping recipes
// alongside the catalogue's ids rather than in a loosely-typed map.
export const RECIPES: Record<SfxId, Recipe> = {
  UI_TAP: {
    totalDuration: 0.05,
    layers: [{ wave: 'square', freqStart: 880, startTime: 0, duration: 0.05, gain: 0.5, attack: 0.002, release: 0.03 }],
  },
  DENIED: {
    totalDuration: 0.16,
    layers: [
      { wave: 'square', freqStart: 160, startTime: 0, duration: 0.08, gain: 0.55, attack: 0.001, release: 0.06 },
      { wave: 'square', freqStart: 140, startTime: 0.08, duration: 0.08, gain: 0.55, attack: 0.001, release: 0.06 },
    ],
  },
  FLAP: {
    totalDuration: 0.08,
    layers: [{ wave: 'noise', startTime: 0, duration: 0.07, gain: 0.3, attack: 0.001, release: 0.06 }],
  },
  SCORE: {
    totalDuration: 0.09,
    layers: [{ wave: 'sine', freqStart: 1400, startTime: 0, duration: 0.09, gain: 0.5, attack: 0.001, release: 0.07 }],
  },
  CRASH: {
    totalDuration: 0.22,
    layers: [
      { wave: 'noise', startTime: 0, duration: 0.2, gain: 0.55, attack: 0.001, release: 0.18 },
      {
        wave: 'triangle',
        freqStart: 110,
        freqEnd: 55,
        startTime: 0,
        duration: 0.2,
        gain: 0.4,
        attack: 0.001,
        release: 0.18,
      },
    ],
  },
  NEW_BEST: {
    totalDuration: 0.5,
    layers: [
      { wave: 'square', freqStart: 659.25, startTime: 0, duration: 0.1, gain: 0.5, attack: 0.002, release: 0.06 },
      { wave: 'square', freqStart: 783.99, startTime: 0.1, duration: 0.1, gain: 0.5, attack: 0.002, release: 0.06 },
      { wave: 'square', freqStart: 987.77, startTime: 0.2, duration: 0.1, gain: 0.5, attack: 0.002, release: 0.06 },
      { wave: 'square', freqStart: 1318.5, startTime: 0.3, duration: 0.18, gain: 0.6, attack: 0.002, release: 0.14 },
    ],
  },
  // A rising pair, deliberately softer and rounder than NEW_BEST's fanfare: picking a bubble up
  // is good news, but it happens mid-flight and must not step on the score blip.
  SHIELD_UP: {
    totalDuration: 0.26,
    layers: [
      { wave: 'triangle', freqStart: 523.25, startTime: 0, duration: 0.09, gain: 0.5, attack: 0.003, release: 0.06 },
      { wave: 'triangle', freqStart: 783.99, startTime: 0.08, duration: 0.16, gain: 0.5, attack: 0.003, release: 0.12 },
    ],
  },
  // The inverse: a short downward slide plus a pinch of noise, so losing the bubble reads as a
  // burst rather than as another hit.
  SHIELD_POP: {
    totalDuration: 0.18,
    layers: [
      {
        wave: 'triangle',
        freqStart: 900,
        freqEnd: 320,
        startTime: 0,
        duration: 0.14,
        gain: 0.45,
        attack: 0.001,
        release: 0.1,
      },
      { wave: 'noise', startTime: 0, duration: 0.06, gain: 0.2, attack: 0.002, release: 0.05 },
    ],
  },
  // A life restored, and the only pickup worth a three-note figure: it is the rarest thing in
  // the gap and the one that changes how much run is left. Still triangles rather than
  // NEW_BEST's squares, because it lands mid-flight alongside the score blip.
  HEART_UP: {
    totalDuration: 0.34,
    layers: [
      { wave: 'triangle', freqStart: 523.25, startTime: 0, duration: 0.08, gain: 0.5, attack: 0.003, release: 0.05 },
      { wave: 'triangle', freqStart: 659.25, startTime: 0.07, duration: 0.08, gain: 0.5, attack: 0.003, release: 0.05 },
      { wave: 'triangle', freqStart: 1046.5, startTime: 0.14, duration: 0.2, gain: 0.55, attack: 0.003, release: 0.16 },
    ],
  },
  SCENE_SWISH: {
    totalDuration: 0.14,
    layers: [{ wave: 'noise', startTime: 0, duration: 0.13, gain: 0.25, attack: 0.02, release: 0.09 }],
  },
};

function writeAll(): void {
  const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'assets', 'audio');
  mkdirSync(outDir, { recursive: true });

  for (const id of Object.keys(SFX) as SfxId[]) {
    const recipe = RECIPES[id];
    // clamp: true (default) — each effect's loudness must stay independent of what else
    // happens to overlap it, which normalizing would defeat.
    const samples = renderRecipeShared(recipe, SAMPLE_RATE);
    const wav = encodeWav(samples, SAMPLE_RATE);
    const path = join(outDir, `${SFX[id].file}.wav`);
    writeFileSync(path, wav);
    console.log(`wrote ${path} (${wav.length} bytes)`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeAll();
}
