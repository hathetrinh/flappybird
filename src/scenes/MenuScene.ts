import * as Phaser from 'phaser';
import { AudioService } from '@core/AudioService';
import { GameConfig } from '@core/GameConfig';
import { createButton } from '../ui/GameButton';
import { GameColors } from '../ui/GameColor';
import { uiFont } from '@core/GameConfig';
import { ui } from '@core/GameConfig';
import { ProgressService } from '@core/ProgressService';
import { FLAPPY_LEVEL_ID } from '@core/GameCatalog';
import { t } from '@core/i18n';

const FLOATING_SHAPE_COLORS = [
  GameColors.Hex.ORANGE,
  GameColors.Hex.PINK,
  GameColors.Hex.CYAN,
  GameColors.Hex.YELLOW,
  GameColors.Hex.GREEN,
];

const FLOATING_SHAPE_COUNT = 10;

export class MenuScene extends Phaser.Scene {
  constructor() {
    super('MenuScene');
  }

  create() {
    const { width, height, centerX: cx, centerY: cy } = this.cameras.main;

    this.drawBackground(width, height);
    this.spawnFloatingShapes(width, height);

    const title = this.add
      .text(cx, cy - ui(96), t('menu.title'), {
        fontFamily: GameConfig.fonts.default,
        fontSize: uiFont(36),
        fontStyle: 'bold',
        color: GameConfig.colors.title,
      })
      .setOrigin(0.5)
      .setAlpha(0)
      .setScale(0.5);

    // The genre under the name, so a portal player knows what this is before tapping anything.
    const subtitle = this.add
      .text(cx, cy - ui(58), t('menu.subtitle'), {
        fontFamily: GameConfig.fonts.default,
        fontSize: uiFont(18),
        fontStyle: 'bold',
        color: GameConfig.colors.text,
      })
      .setOrigin(0.5)
      .setAlpha(0);

    this.tweens.add({ targets: subtitle, alpha: 0.85, duration: 500, delay: 250 });

    this.tweens.add({
      targets: title,
      alpha: 1,
      scale: 1,
      duration: 500,
      delay: 100,
      ease: 'Back.Out',
    });

    const delay = 300;

    // One endless run, so Play always starts a fresh one (docs/adr/0001).
    const playLabel = t('menu.play');
    const playAction = () => this.scene.start('FlappyGameScene');

    const playBtn = createButton(this, {
      x: cx,
      y: cy,
      label: '▶ ' + playLabel,
      variant: 'success',
      origin: 0.5,
      minWidth: 240,
      paddingV: 24,
      fontSize: 28,
      sfx: 'SCENE_SWISH',
      onClick: playAction,
    });
    
    // Add pulsing effect for Play button
    this.tweens.add({
      targets: playBtn,
      scaleX: 1.05,
      scaleY: 1.05,
      duration: 1000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });
    
    this.animateButtonIn(playBtn, delay);

    // The best run so far, under Play, once there is one.
    const best = ProgressService.getHighScore(FLAPPY_LEVEL_ID);
    if (best > 0) {
      const bestText = this.add
        .text(cx, cy + ui(70), t('menu.best').replace('{score}', String(best)), {
          fontFamily: GameConfig.fonts.default,
          fontSize: uiFont(20),
          fontStyle: 'bold',
          color: GameConfig.colors.text,
        })
        .setOrigin(0.5)
        .setAlpha(0);
      this.tweens.add({ targets: bestText, alpha: 0.9, duration: 400, delay: delay + 150 });
    }

    // Enter/Space presses Play. Settings opens on top of this scene and both
    // receive keys, so stand down while it is up.
    this.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
      if (event.code !== 'Enter' && event.code !== 'Space') return;
      if (this.scene.isActive('SettingsScene')) return;
      event.preventDefault();
      AudioService.play('SCENE_SWISH');
      playAction();
    });

    // Settings Button (Bottom Left)
    const settingsBtn = createButton(this, {
      x: ui(48),
      y: height - ui(48),
      label: '⚙️',
      variant: 'secondary',
      origin: 0.5,
      minWidth: 60,
      minHeight: 60,
      fontSize: 24,
      sfx: 'SCENE_SWISH',
      onClick: () => this.scene.launch('SettingsScene'),
    });
    this.animateButtonIn(settingsBtn, delay + 100);
  }

  private drawBackground(width: number, height: number) {
    const gradient = this.add.graphics();
    gradient.fillGradientStyle(0x8e44ad, 0x8e44ad, GameConfig.backgroundColor, GameConfig.backgroundColor, 1);
    gradient.fillRect(0, 0, width, height);
  }

  private spawnFloatingShapes(width: number, height: number) {
    for (let i = 0; i < FLOATING_SHAPE_COUNT; i++) {
      const color = Phaser.Utils.Array.GetRandom(FLOATING_SHAPE_COLORS);
      const size = Phaser.Math.Between(10, 24);
      const isTriangle = Math.random() < 0.5;

      const shape = isTriangle
        ? this.add.triangle(0, 0, 0, size, size / 2, 0, size, size, color, 0.3)
        : this.add.circle(0, 0, size / 2, color, 0.3);

      shape.setPosition(Phaser.Math.Between(0, width), Phaser.Math.Between(0, height));

      this.animateFloatingShape(shape, width, height);
    }
  }

  private animateFloatingShape(shape: Phaser.GameObjects.Shape, width: number, height: number) {
    const duration = Phaser.Math.Between(6000, 12000);

    this.tweens.add({
      targets: shape,
      y: -30,
      duration,
      ease: 'Linear',
      onComplete: () => {
        shape.setPosition(Phaser.Math.Between(0, width), height + ui(30));
        this.animateFloatingShape(shape, width, height);
      },
    });
  }

  private animateButtonIn(button: Phaser.GameObjects.Container, delay: number) {
    const targetY = button.y;
    button.setAlpha(0);
    button.setY(targetY + ui(20));

    this.tweens.add({
      targets: button,
      alpha: 1,
      y: targetY,
      duration: 400,
      delay,
      ease: 'Cubic.Out',
    });
  }
}
