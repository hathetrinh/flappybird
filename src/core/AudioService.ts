// src/core/AudioService.ts
//
// The only way anything in the game makes a sound. Callers never touch Phaser's sound manager
// or a filename directly — they say AudioService.play('WIN').
import * as Phaser from 'phaser';
import { SFX, type SfxId } from './SfxCatalogue';
import { SettingsService } from './SettingsService';

// A held key or a rapid double-tap can fire the same id many times a frame apart; without a
// floor, that turns into a buzzsaw rather than a single sound. 40ms is short enough that two
// deliberately separate taps still both play.
const REPEAT_GUARD_MS = 40;

export class AudioService {
  private static game: Phaser.Game | null = null;
  private static lastPlayedAt = new Map<SfxId, number>();
  // Phaser's WebAudioSoundManager#mute getter reads back an AudioParam that the browser only
  // re-syncs to the main thread while something is actively rendering through it — during a
  // quiet stretch with no sound playing, it can report the value from before the last toggle
  // for a while (verified: `sm.mute = true` then reading `sm.mute` back can still be `false`
  // seconds later, yet a sound played at that point is genuinely silent). Tracking our own
  // flag, set only by setMuted(), makes isMuted() reliable regardless.
  private static muted = false;

  /**
   * Binds the game instance so play()/mute calls work without a scene reference — mirrors
   * ThreeHost.bindGame. Applies the persisted mute setting immediately, before anything can
   * be heard.
   */
  public static bindGame(game: Phaser.Game): void {
    this.game = game;
    this.muted = SettingsService.isSoundMuted();
    game.sound.mute = this.muted;
  }

  /**
   * Plays a catalogued sound effect. Never throws: a no-op before bindGame(), when the sound
   * hasn't loaded, or when the platform has no audio at all (Phaser's NoAudioSoundManager).
   */
  public static play(id: SfxId): void {
    if (!this.game) return;

    const now = Date.now();
    const last = this.lastPlayedAt.get(id);
    if (last !== undefined && now - last < REPEAT_GUARD_MS) return;

    const def = SFX[id];
    if (!this.game.cache.audio.exists(def.file)) return;

    this.lastPlayedAt.set(id, now);
    this.game.sound.play(def.file, { volume: def.volume });
  }

  public static isMuted(): boolean {
    return this.game ? this.muted : SettingsService.isSoundMuted();
  }

  public static setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.game) this.game.sound.mute = muted;
    SettingsService.setSoundMuted(muted);
  }

  /** Returns the new muted state. Un-muting plays UI_TAP, so the player hears sound is back. */
  public static toggleMute(): boolean {
    const next = !this.isMuted();
    this.setMuted(next);
    if (!next) this.play('UI_TAP');
    return next;
  }
}
