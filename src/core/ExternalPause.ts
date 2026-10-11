// src/core/ExternalPause.ts
//
// Pauses the whole game on behalf of something outside it: an ad break (GameDistribution) or
// the host page (YouTube Playables). Shared so both platform wrappers pause and resume the same
// way, and so neither restores sound the player had muted in Settings.
//
// Reference-counted by reason: an ad can start while the host has already paused us, and the
// game must stay paused until every reason is released, not just the first one.
import type * as Phaser from 'phaser';
import { AudioService } from './AudioService';

export class ExternalPause {
  private static game: Phaser.Game | null = null;
  private static reasons = new Set<string>();
  // Only the scenes WE paused get resumed — a scene the game itself had paused stays paused.
  private static pausedScenes: string[] = [];

  public static bindGame(game: Phaser.Game): void {
    this.game = game;
  }

  public static isPaused(): boolean {
    return this.reasons.size > 0;
  }

  public static pause(reason: string): void {
    const wasPaused = this.isPaused();
    this.reasons.add(reason);
    if (wasPaused || !this.game) return;

    const game = this.game;
    this.pausedScenes = game.scene
      .getScenes(true)
      .map((scene) => scene.scene.key)
      .filter((key) => !game.scene.isPaused(key));
    this.pausedScenes.forEach((key) => game.scene.pause(key));
    // pauseAll() freezes any sound mid-play; mute covers any SFX fired while paused.
    game.sound.pauseAll();
    game.sound.mute = true;
  }

  public static resume(reason: string): void {
    if (!this.reasons.delete(reason) || this.isPaused() || !this.game) return;

    const game = this.game;
    this.pausedScenes.forEach((key) => {
      if (game.scene.isPaused(key)) game.scene.resume(key);
    });
    this.pausedScenes = [];
    // Back to the player's own sound setting, never blindly to unmuted.
    game.sound.mute = AudioService.isMuted();
    game.sound.resumeAll();
  }
}
