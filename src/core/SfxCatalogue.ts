// src/core/SfxCatalogue.ts
//
// The only place in the app that names a sound file. Every caller says
// AudioService.play('FLAP'); nothing outside this module and its generator
// (scripts/generate-sfx.ts) knows the filename behind an id.

export type SfxId =
  | 'UI_TAP'
  | 'DENIED'
  | 'SCENE_SWISH'
  | 'FLAP'
  | 'SCORE'
  | 'CRASH'
  | 'NEW_BEST'
  | 'SHIELD_UP'
  | 'SHIELD_POP'
  | 'HEART_UP';

export interface SfxDef {
  /** Filename under public/assets/audio/, without extension. */
  file: string;
  /** Playback volume, 0-1. */
  volume: number;
}

export const SFX: Record<SfxId, SfxDef> = {
  UI_TAP: { file: 'ui_tap', volume: 0.5 },
  DENIED: { file: 'denied', volume: 0.5 },
  SCENE_SWISH: { file: 'scene_swish', volume: 0.35 },
  FLAP: { file: 'flap', volume: 0.5 },
  SCORE: { file: 'score', volume: 0.55 },
  CRASH: { file: 'crash', volume: 0.65 },
  NEW_BEST: { file: 'new_best', volume: 0.7 },
  SHIELD_UP: { file: 'shield_up', volume: 0.55 },
  SHIELD_POP: { file: 'shield_pop', volume: 0.55 },
  HEART_UP: { file: 'heart_up', volume: 0.6 },
};
