import * as Phaser from 'phaser';
import { GameConfig, ui, uiFont } from '@core/GameConfig';
import { createButton } from '@ui/GameButton';
import { t } from '@core/i18n';

export class AboutScene extends Phaser.Scene {
  constructor() {
    super('AboutScene');
  }

  create() {
    this.cameras.main.setBackgroundColor(GameConfig.backgroundColor);
    this.drawBackground();

    const { width, centerX: cx } = this.cameras.main;

    createButton(this, {
      x: ui(20),
      y: ui(16),
      label: t('common.back'),
      sfx: 'SCENE_SWISH',
      onClick: () => this.scene.start('MenuScene'),
    });

    this.add
      .text(cx, ui(74), t('about.title'), {
        fontFamily: GameConfig.fonts.default,
        fontSize: uiFont(26),
        fontStyle: 'bold',
        color: GameConfig.colors.title,
      })
      .setOrigin(0.5);

    this.add
      .text(cx, ui(140), t('menu.title'), {
        fontFamily: GameConfig.fonts.default,
        fontSize: uiFont(20),
        fontStyle: 'bold',
        color: GameConfig.colors.text,
      })
      .setOrigin(0.5);

    this.add
      .text(cx, ui(176), `${t('about.version')} ${__APP_VERSION__}`, {
        fontFamily: GameConfig.fonts.default,
        fontSize: uiFont(15),
        color: '#cccccc',
      })
      .setOrigin(0.5);

    this.add
      .text(cx, ui(216), t('about.credits'), {
        fontFamily: GameConfig.fonts.default,
        fontSize: uiFont(14),
        color: '#cccccc',
        align: 'center',
        wordWrap: { width: width - ui(48) },
      })
      .setOrigin(0.5, 0);
  }

  private drawBackground() {
    const { width, height } = this.cameras.main;
    const gradient = this.add.graphics();
    gradient.fillGradientStyle(0x8e44ad, 0x8e44ad, GameConfig.backgroundColor, GameConfig.backgroundColor, 1);
    gradient.fillRect(0, 0, width, height);
  }
}
