// src/core/AssetLoader.ts
import * as Phaser from 'phaser';
import { SFX, type SfxId } from './SfxCatalogue';

export class AssetLoader {
  /**
   * Queues every catalogued sound effect for load. Keyed by the SfxId's filename, matching
   * how AudioService.play() looks it up in the audio cache. Flappy's sprites are loaded by its
   * own scene (FlappyRenderer.preloadFlappySprites), not here.
   */
  public static queueAudio(scene: Phaser.Scene): void {
    (Object.keys(SFX) as SfxId[]).forEach((id) => {
      const { file } = SFX[id];
      if (!scene.cache.audio.exists(file)) {
        scene.load.audio(file, `assets/audio/${file}.wav`);
      }
    });
  }
}
