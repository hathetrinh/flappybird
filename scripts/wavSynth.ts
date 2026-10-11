// scripts/wavSynth.ts
//
// WAV-synthesis primitives used by generate-sfx.ts. The echo/loop helpers (applyEcho, foldTail)
// served a background-music generator that was removed with the music itself; they are kept,
// with their tests, for any future looping sound. Hand-rolled oscillator + WAV encoder — no
// external synth/audio library, matching the rest of this repo's asset generation.
const SAMPLE_RATE = 22050;

export type Wave = 'sine' | 'square' | 'triangle' | 'noise';

/**
 * Amplitude contour over a layer's lifetime.
 * - 'sustain' (the default): attack up, hold at full gain, linear release down. Right for the
 *   short one-shot SFX and for sustained pads.
 * - 'pluck': fast attack then exponential decay across the whole duration, the shape a struck
 *   or plucked instrument makes. Needed for music — a sustain envelope on a note-length layer
 *   reads as an organ drone rather than a bell.
 */
export type EnvelopeShape = 'sustain' | 'pluck';

/** How renderRecipe conditions its summed output. */
export type RenderMode = 'clamp' | 'normalize' | 'raw';

/** One tone or noise burst, mixed into the recipe's output starting at `startTime`. */
export interface Layer {
  wave: Wave;
  /** Ignored for 'noise'. */
  freqStart?: number;
  /** Ignored for 'noise'. Omit to hold freqStart steady. */
  freqEnd?: number;
  startTime: number;
  duration: number;
  /** Peak linear gain, 0-1, before the layer's own attack/release envelope. */
  gain: number;
  attack?: number;
  release?: number;
  /** Defaults to 'sustain'. */
  shape?: EnvelopeShape;
}

export interface Recipe {
  totalDuration: number;
  layers: Layer[];
}

/** Length of the forced fade-to-zero at the end of a pluck, so the layer can't click off. */
const PLUCK_TAIL = 0.015;
/** e^-DECAY_RATE is the pluck's residual gain at the end of its duration (~1%). */
const DECAY_RATE = 4.5;

export function envelope(
  t: number,
  duration: number,
  attack: number,
  release: number,
  shape: EnvelopeShape = 'sustain'
): number {
  if (shape === 'pluck') {
    const rise = attack > 0 ? Math.min(1, t / attack) : 1;
    const decaySpan = Math.max(1e-6, duration - attack);
    let level = rise * Math.exp((-DECAY_RATE * Math.max(0, t - attack)) / decaySpan);
    const fadeStart = duration - PLUCK_TAIL;
    if (t > fadeStart) level *= Math.max(0, (duration - t) / PLUCK_TAIL);
    return level;
  }

  if (t < attack) return t / attack;
  const releaseStart = duration - release;
  if (t > releaseStart) return Math.max(0, (duration - t) / release);
  return 1;
}

export function oscillator(wave: Wave, phase: number): number {
  const cyclePos = phase - Math.floor(phase);
  switch (wave) {
    case 'sine':
      return Math.sin(2 * Math.PI * phase);
    case 'square':
      return cyclePos < 0.5 ? 1 : -1;
    case 'triangle':
      return 4 * Math.abs(cyclePos - 0.5) - 1;
    case 'noise':
      return Math.random() * 2 - 1;
  }
}

/**
 * Renders a recipe to float samples at `sampleRate`, length = totalDuration.
 *
 * `mode` decides how the summed layers are conditioned:
 * - 'clamp' (default, one-shot SFX): hard-clamp to [-1, 1], so each effect's loudness stays
 *   independent of what else happens to overlap it.
 * - 'normalize': scale the peak to 1, avoiding audible clipping across a dense mix.
 * - 'raw': leave the sum untouched, for callers that post-process (echo, loop folding) and
 *   normalize at the very end instead.
 */
export function renderRecipe(recipe: Recipe, sampleRate: number = SAMPLE_RATE, mode: RenderMode = 'clamp'): Float64Array {
  const totalSamples = Math.ceil(recipe.totalDuration * sampleRate);
  const out = new Float64Array(totalSamples);

  for (const layer of recipe.layers) {
    const attack = layer.attack ?? 0.005;
    const release = layer.release ?? 0.02;
    const startSample = Math.floor(layer.startTime * sampleRate);
    const layerSamples = Math.ceil(layer.duration * sampleRate);
    let phase = 0;

    for (let i = 0; i < layerSamples; i++) {
      const outIndex = startSample + i;
      if (outIndex >= totalSamples) break;

      const t = i / sampleRate;
      const progress = layer.duration > 0 ? t / layer.duration : 0;
      const freqStart = layer.freqStart ?? 0;
      const freqEnd = layer.freqEnd ?? freqStart;
      const freq = freqStart + (freqEnd - freqStart) * progress;
      phase += freq / sampleRate;

      const raw = oscillator(layer.wave, phase);
      const env = envelope(t, layer.duration, attack, release, layer.shape);
      out[outIndex] += raw * env * layer.gain;
    }
  }

  if (mode === 'clamp') {
    for (let i = 0; i < out.length; i++) {
      out[i] = Math.max(-1, Math.min(1, out[i]));
    }
  } else if (mode === 'normalize') {
    normalize(out, 1);
  }
  return out;
}

/** Scales samples in place so the highest peak sits at `target`. A silent buffer is left alone. */
export function normalize(samples: Float64Array, target = 0.95): Float64Array {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    peak = Math.max(peak, Math.abs(samples[i]));
  }
  if (peak > 0) {
    const gain = target / peak;
    for (let i = 0; i < samples.length; i++) {
      samples[i] *= gain;
    }
  }
  return samples;
}

/**
 * Adds a decaying feedback echo in place — a one-line comb filter that stands in for a reverb
 * tail, which is what makes a bare oscillator mix sound like it's in a room rather than a vacuum.
 */
export function applyEcho(
  samples: Float64Array,
  delay: number,
  feedback: number,
  sampleRate: number = SAMPLE_RATE
): Float64Array {
  const step = Math.floor(delay * sampleRate);
  if (step <= 0 || feedback <= 0) return samples;
  for (let i = step; i < samples.length; i++) {
    samples[i] += samples[i - step] * feedback;
  }
  return samples;
}

/**
 * Turns an over-length render into a seamless loop of `loopSamples`.
 *
 * A loop cut straight at its end drops whatever was still ringing — note releases, echo tail —
 * so the seam clicks and the reverb restarts from silence. Rendering past the loop point and
 * folding that overhang back onto the start makes the tail arrive exactly where the loop
 * restarts, which is what a seamless loop actually is.
 */
export function foldTail(samples: Float64Array, loopSamples: number): Float64Array {
  const out = new Float64Array(loopSamples);
  out.set(samples.subarray(0, Math.min(loopSamples, samples.length)));
  const tail = samples.length - loopSamples;
  for (let i = 0; i < tail && i < loopSamples; i++) {
    out[i] += samples[loopSamples + i];
  }
  return out;
}

/** Encodes float samples in [-1, 1] as a 16-bit mono PCM WAV file buffer. */
export function encodeWav(samples: Float64Array, sampleRate: number = SAMPLE_RATE): Buffer {
  const bytesPerSample = 2;
  const dataSize = samples.length * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8, 'ascii');
  buffer.write('fmt ', 12, 'ascii');
  buffer.writeUInt32LE(16, 16); // fmt chunk size
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * bytesPerSample, 28); // byte rate
  buffer.writeUInt16LE(bytesPerSample, 32); // block align
  buffer.writeUInt16LE(16, 34); // bits per sample
  buffer.write('data', 36, 'ascii');
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    // Int16 range is [-32768, 32767]; scaling by 32767 on both sides keeps a full-scale
    // sample from wrapping past the max positive value.
    const int16 = Math.round(clamped * 32767);
    buffer.writeInt16LE(int16, 44 + i * bytesPerSample);
  }

  return buffer;
}

export { SAMPLE_RATE };
