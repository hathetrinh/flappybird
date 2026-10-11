// src/scenes/LoadingScene.ts
import * as Phaser from 'phaser';
import { ProgressBar } from '../ui/ProgressBar';
import { AssetLoader } from '@core/AssetLoader';
import { GameConfig, FONT_FAMILY } from '@core/GameConfig';

export class LoadingScene extends Phaser.Scene {
  constructor() {
    super('LoadingScene');
  }

  preload() {
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    const loadingText = this.add
      .text(width / 2, height / 2 - 50, 'Loading...', {
        ...GameConfig.fonts.question,
        color: '#ffffff',
      })
      .setOrigin(0.5, 0.5);

    const bar = new ProgressBar(this);

    this.load.on('progress', (value: number) => {
      bar.update(value);
    });

    this.load.on('complete', () => {
      bar.destroy();
      loadingText.destroy();
    });

    AssetLoader.queueAudio(this);

    // 💡 Lưu ý: Tuyệt đối không gọi `this.load.start()` ở đây vì Phaser tự động thực thi nó.
  }

  create() {
    // Wait for the web font before the title screen, so Phaser doesn't draw text in the fallback (Arial)
    // and keep it: a Text object doesn't redraw itself when the font arrives later.
    this.waitForFonts()
      .catch(() => undefined)
      .then(() => this.scene.start('FlappyGameScene'));
  }

  private waitForFonts(): Promise<unknown> {
    if (!('fonts' in document)) return Promise.resolve();
    return Promise.all([
      document.fonts.load(`400 16px ${FONT_FAMILY}`),
      document.fonts.load(`700 16px ${FONT_FAMILY}`),
    ]);
  }
}
