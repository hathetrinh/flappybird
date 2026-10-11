// src/games/flappy/FlappyGameScene.ts
//
// Flappy Bird as an endless arcade run — deliberately NOT a mechanic. PlayScene's hint/undo/
// timer/star popup/next-level flow is puzzle-shaped and none of it applies to a run that always
// ends in a crash, so this owns its own input, HUD and frame loop instead. See
// docs/adr/0003-dedicated-flappy-scene.md.
//
// The three layers stay separate on purpose: FlappySim (pure simulation) is stepped here and
// its result pushed into FlappyRenderer (pure presentation) every frame. This scene is the only
// place that knows about both.
//
// The renderer used to be a three.js ThreeWorld; it is 2D sprites now, which is why nothing
// here touches ThreeHost any more. See docs/adr/0009-flappy-2d-sprites.md.
//
// There is no menu scene: the run's READY phase doubles as the title screen, and Settings opens
// over it from the ⚙️ button. See docs/adr/0012-title-screen-in-game-scene.md.
import * as Phaser from 'phaser';
import { GameConfig, PLAY_AREA, ui, uiFont } from '@core/GameConfig';
import { createButton } from '@ui/GameButton';
import { ProgressService } from '@core/ProgressService';
import { AudioService } from '@core/AudioService';
import { HapticsService } from '@core/HapticsService';
import { FLAPPY_LEVEL_ID } from '@core/GameCatalog';
import { GameDistributionSDK } from '@core/GameDistribution';
import { getLocale, t, type LocaleCode } from '@core/i18n';
import { FlappyRenderer, preloadFlappySprites } from './FlappyRenderer';
import { dailySeed, mulberry32 } from './FlappyRandom';
import {
  createFlappyState,
  flap,
  resetFlappyState,
  step,
  FLAPPY_TUNING,
  type FlappyConfig,
  type FlappyState,
} from './FlappySim';

/** Above every renderer layer (see DEPTH in FlappyRenderer), which tops out at 7. */
const HUD_DEPTH = 100;

/**
 * How long the game-over panel ignores tap/space before they mean "play again".
 *
 * Space and tap are also the flap control, so without this the mash a player is already doing
 * as they crash would restart the run instantly and they would never see their score. Long
 * enough to swallow that, short enough that a deliberate press still feels immediate.
 */
const RETRY_GUARD_MS = 600;

export class FlappyGameScene extends Phaser.Scene {
  private state!: FlappyState;
  private simConfig!: FlappyConfig;
  private art!: FlappyRenderer;
  private scoreText!: Phaser.GameObjects.Text;
  private promptText!: Phaser.GameObjects.Text;
  /** Title and best score, shown only before the first flap since the scene started. */
  private titleGroup?: Phaser.GameObjects.Container;
  /** Only between runs (READY and game over): opening Settings mid-flight would be a pause button. */
  private settingsButton!: Phaser.GameObjects.Container;
  /** The language the scene's text was built in, so a change made in Settings rebuilds it. */
  private builtLocale!: LocaleCode;
  /** One icon per starting heart, swapped between full and broken as lives are spent. */
  private hearts: Phaser.GameObjects.Image[] = [];
  private lastHearts = 0;
  /** Mirrors the sim's shield, so gaining and losing the bubble can each get their own sound. */
  private lastShielded = false;
  private gameOverPanel?: Phaser.GameObjects.Container;
  private best = 0;
  private recorded = false;
  private lastScore = 0;
  /** When the game-over panel appeared, for RETRY_GUARD_MS. */
  private gameOverAt = 0;
  /** Set while a between-runs ad is showing, so a second tap doesn't queue a second retry. */
  private retrying = false;

  constructor() {
    super('FlappyGameScene');
  }

  /**
   * Phaser reuses the scene instance across restarts, and create() only builds; without this a
   * restart after a game over would keep the old panel reference and the `recorded` flag, and
   * the next crash would never be scored.
   */
  init(): void {
    this.gameOverPanel = undefined;
    this.titleGroup = undefined;
    this.recorded = false;
    this.lastScore = 0;
    this.retrying = false;
  }

  preload(): void {
    preloadFlappySprites(this);
  }

  create(): void {
    this.best = ProgressService.getHighScore(FLAPPY_LEVEL_ID);
    this.builtLocale = getLocale();

    // The scene is the only place that knows both the simulation and the renderer, so it is
    // where the shared geometry is handed over -- see FlappyGeometry.
    this.art = new FlappyRenderer(this, {
      pipeGap: FLAPPY_TUNING.pipeGap,
      pipeWidth: FLAPPY_TUNING.pipeHalfWidth * 2,
    });
    this.art.build();

    this.simConfig = {
      viewWidth: this.art.viewWidth,
      viewHeight: this.art.viewHeight,
      random: this.newDailyRandom(),
    };
    this.state = createFlappyState(this.simConfig);
    this.lastHearts = this.state.hearts;
    this.lastShielded = this.state.shielded;

    this.buildHud();
    this.buildTitle();
    this.input.on(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown, this);
    this.input.keyboard?.on('keydown-SPACE', this.onTap, this);
    this.input.keyboard?.on('keydown-UP', this.onTap, this);
    // Scene events outlive a restart (unlike input listeners), so this one is removed by hand.
    this.events.on(Phaser.Scenes.Events.RESUME, this.onResume, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.events.off(Phaser.Scenes.Events.RESUME, this.onResume, this);
    });
  }

  /** Settings runs as an overlay scene; this one is paused under it so no key or tap flaps. */
  private openSettings(): void {
    this.scene.launch('SettingsScene', { returnTo: this.scene.key });
    this.scene.pause();
  }

  /**
   * Back from Settings (or from an external pause, which changes neither check). A new language
   * or a reset best score both show on this screen, and rebuilding is simpler than re-labelling
   * every text and button. Restarting from a game over skips that break's ad; it is rare.
   */
  private onResume(): void {
    if (getLocale() !== this.builtLocale || ProgressService.getHighScore(FLAPPY_LEVEL_ID) !== this.best) {
      this.scene.restart();
    }
  }

  /**
   * A fresh generator on today's seed.
   *
   * Every run made today meets the same pipes, which is the point: a layout you can learn is a
   * layout you can get better at. Called again on retry -- reusing the generator would leave the
   * second attempt continuing the first one's stream, which is exactly the bug that makes a
   * "daily" challenge quietly different every time you press the button.
   */
  private newDailyRandom(): () => number {
    return mulberry32(dailySeed(new Date()));
  }

  /** A tap on a button (⚙️, Retry) belongs to the button, not to the flap control. */
  private onPointerDown(_pointer: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]): void {
    if (over.length > 0) return;
    this.onTap();
  }

  private onTap(): void {
    // Once the run is over the same control replays it, so the player never has to reach for
    // the Retry button. The button stays for discoverability.
    if (this.gameOverPanel) {
      if (this.time.now - this.gameOverAt >= RETRY_GUARD_MS) this.requestRetry();
      return;
    }
    if (flap(this.state)) {
      this.art.playBirdClip('flap');
      AudioService.play('FLAP');
      this.promptText.setVisible(false);
      this.settingsButton.setVisible(false);
      this.titleGroup?.destroy();
      this.titleGroup = undefined;
    }
  }

  update(_time: number, delta: number): void {
    if (!this.state) return;

    const wasFlying = this.state.phase === 'FLYING';
    this.simConfig.viewWidth = this.art.viewWidth;
    this.simConfig.viewHeight = this.art.viewHeight;
    step(this.state, delta / 1000, this.simConfig);

    this.art.setBirdPose(FLAPPY_TUNING.birdX, this.state.birdY, this.state.pitch);
    this.art.setPipes(this.state.pipes);
    this.art.setScroll(this.state.scroll);
    this.art.setBirdInvulnerable(this.state.invulnerableFor);
    this.art.setShielded(this.state.shielded);
    if (wasFlying && this.state.phase === 'DYING') this.art.playBirdClip('fall');
    else if (this.state.phase === 'FLYING' && this.state.velocity < 0) this.art.playBirdClip('glide');

    if (this.state.score > this.lastScore) {
      AudioService.play('SCORE');
      this.lastScore = this.state.score;
    }
    // Same shape as the heart row below: the simulation exposes no events, so a change in the
    // flag IS the event. A pop is not folded into the hit feedback underneath, because a hit
    // the bubble absorbed never reaches it -- the heart count does not move.
    if (this.state.shielded !== this.lastShielded) {
      AudioService.play(this.state.shielded ? 'SHIELD_UP' : 'SHIELD_POP');
      if (!this.state.shielded) HapticsService.error();
      this.lastShielded = this.state.shielded;
    }
    // A survived hit needs its own feedback, and the simulation exposes no event for one — the
    // heart count MOVING is the event, in either direction: down is a hit paid for, up is a gap
    // heart collected. A drop to zero stays silent, because the crash already gets the louder
    // treatment in endRun().
    if (this.state.hearts !== this.lastHearts) {
      if (this.state.hearts > this.lastHearts) {
        AudioService.play('HEART_UP');
        HapticsService.success();
      } else if (this.state.hearts > 0) {
        AudioService.play('DENIED');
        HapticsService.error();
      }
      this.lastHearts = this.state.hearts;
      this.refreshHearts();
    }
    this.scoreText.setText(`${this.state.score}`);

    if (this.state.phase === 'GAME_OVER' && !this.recorded) this.endRun();
  }

  private endRun(): void {
    AudioService.play('CRASH');
    HapticsService.error();
    // The bird has landed, so hand the renderer the knock-out sequence. Purely presentational:
    // the phase change that got us here is the simulation's, and this only picks the pose.
    this.art.playBirdClip('ko');
    this.recorded = true;
    const isBest = this.state.score > this.best;
    if (isBest) AudioService.play('NEW_BEST');
    // Stores the max internally, so calling it with a lower score is safe.
    ProgressService.completeLevel(FLAPPY_LEVEL_ID, this.state.score);
    this.best = Math.max(this.best, this.state.score);
    this.showGameOver(isBest);
  }

  /**
   * Play again, with an interstitial first when one is due. Between runs is the natural break:
   * the player has already seen their score, and nothing is in flight. GameDistributionSDK
   * rate-limits ads (at most one per 90 s), pauses and silences the game for the ad, and always
   * calls back exactly once, ad or not, so the run starts either way. Outside the GD build there
   * is no SDK and it calls back at once.
   */
  private requestRetry(): void {
    if (this.retrying) return;
    this.retrying = true;
    GameDistributionSDK.showAd(() => {
      this.retrying = false;
      this.retry();
    });
  }

  private retry(): void {
    this.gameOverPanel?.destroy();
    this.gameOverPanel = undefined;
    this.recorded = false;
    this.lastScore = 0;
    this.simConfig.random = this.newDailyRandom();
    resetFlappyState(this.state, this.simConfig);
    this.lastHearts = this.state.hearts;
    this.lastShielded = this.state.shielded;
    this.refreshHearts();
    this.art.setBirdInvulnerable(0);
    this.art.setShielded(false);
    this.art.playBirdClip('glide');
    this.promptText.setVisible(true);
    this.settingsButton.setVisible(true);
  }

  private buildHud(): void {
    const centreX = GameConfig.width / 2;
    const scoreY = PLAY_AREA.top * 0.5;
    const plateWidth = ui(150);

    // The mockup stacks SCORE and LIFE in the top-left corner, but the ⚙️ button owns that
    // corner (GameConfig.ui.backBtnPos). Centring both instead keeps the mockup's stacked reading
    // order without either overlapping the button.
    const plate = this.add.image(centreX, scoreY, 'flappy_score_box').setOrigin(0.5).setDepth(HUD_DEPTH);
    const plateHeight = (plate.height / plate.width) * plateWidth;
    plate.setDisplaySize(plateWidth, plateHeight);

    // The coin doubles as the mockup's score star: it is the thing being counted, so showing
    // the actual pickup reads better than a generic star would.
    const coinSize = plateHeight * 0.72;
    this.add
      .image(centreX - plateWidth * 0.26, scoreY, 'flappy_coin', 0)
      .setOrigin(0.5)
      .setDisplaySize(coinSize, coinSize)
      .setDepth(HUD_DEPTH + 1);

    this.scoreText = this.add
      .text(centreX + plateWidth * 0.08, scoreY, '0', {
        fontFamily: GameConfig.fonts.default,
        fontSize: uiFont(30),
        color: '#8a5a2b',
      })
      .setOrigin(0.5)
      .setDepth(HUD_DEPTH + 1);

    this.buildHearts(centreX, scoreY + plateHeight * 0.5 + ui(15));

    this.promptText = this.add
      .text(GameConfig.width / 2, GameConfig.height * 0.62, t('flappy.tapToFly'), {
        fontFamily: GameConfig.fonts.default,
        fontSize: uiFont(22),
        color: '#4a3b2a',
        stroke: '#ffffff',
        strokeThickness: ui(3),
      })
      .setOrigin(0.5)
      .setDepth(HUD_DEPTH);

    this.settingsButton = createButton(this, {
      x: GameConfig.ui.backBtnPos.x,
      y: GameConfig.ui.backBtnPos.y,
      label: '⚙️',
      variant: 'secondary',
      minWidth: 44,
      minHeight: 44,
      fontSize: 22,
      sfx: 'SCENE_SWISH',
      onClick: () => this.openSettings(),
    }).setDepth(HUD_DEPTH + 3);
  }

  /** The game's name and the best run so far, over the waiting bird, until the first flap. */
  private buildTitle(): void {
    const centreX = GameConfig.width / 2;
    const titleY = GameConfig.height * 0.3;
    const group = this.add.container(0, 0).setDepth(HUD_DEPTH);
    const title = this.add
      .text(centreX, titleY, t('menu.title'), {
        fontFamily: GameConfig.fonts.default,
        fontSize: uiFont(44),
        fontStyle: 'bold',
        color: '#ffe14d',
        stroke: '#4a3b2a',
        strokeThickness: ui(6),
      })
      .setOrigin(0.5);
    group.add(title);
    if (this.best > 0) {
      group.add(
        this.add
          .text(centreX, titleY + ui(48), t('menu.best').replace('{score}', String(this.best)), {
            fontFamily: GameConfig.fonts.default,
            fontSize: uiFont(22),
            fontStyle: 'bold',
            color: '#4a3b2a',
            stroke: '#ffffff',
            strokeThickness: ui(3),
          })
          .setOrigin(0.5),
      );
    }
    this.tweens.add({ targets: title, scale: 1.05, duration: 1000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.titleGroup = group;
  }

  /**
   * The life row. One icon per starting heart, created once and only ever swapped between the
   * full and broken textures, so losing a life costs no allocation mid-run.
   */
  private buildHearts(centreX: number, y: number): void {
    const size = ui(26);
    const gap = ui(6);
    const total = this.state.hearts;
    const startX = centreX - ((total - 1) * (size + gap)) / 2;
    this.hearts = [];
    for (let i = 0; i < total; i++) {
      const heart = this.add
        .image(startX + i * (size + gap), y, 'flappy_heart_full')
        .setOrigin(0.5)
        .setDepth(HUD_DEPTH);
      heart.setDisplaySize(size, (heart.height / heart.width) * size);
      this.hearts.push(heart);
    }
  }

  private refreshHearts(): void {
    this.hearts.forEach((heart, i) => {
      const held = i < this.state.hearts;
      heart.setTexture(held ? 'flappy_heart_full' : 'flappy_heart_broken');
      // setTexture resets the frame's size, so the display size has to be reasserted.
      heart.setDisplaySize(ui(26), (heart.height / heart.width) * ui(26));
    });
  }

  private showGameOver(isBest: boolean): void {
    this.gameOverAt = this.time.now;
    const centreX = GameConfig.width / 2;
    const centreY = GameConfig.height / 2;
    const panel = this.add.container(0, 0).setDepth(HUD_DEPTH + 2);
    panel.add(this.add.rectangle(centreX, centreY, GameConfig.width * 0.78, 260, 0x1a1a1a, 0.92).setOrigin(0.5));
    panel.add(
      this.add
        .text(centreX, centreY - 78, isBest ? t('flappy.newBest') : t('flappy.gameOver'), {
          fontFamily: GameConfig.fonts.default,
          fontSize: uiFont(28),
          color: '#ffe14d',
        })
        .setOrigin(0.5),
    );
    panel.add(
      this.add
        .text(
          centreX,
          centreY - 20,
          t('flappy.result')
            .replace('{score}', String(this.state.score))
            .replace('{coins}', String(this.state.coins))
            .replace('{best}', String(this.best)),
          {
            fontFamily: GameConfig.fonts.default,
            fontSize: uiFont(22),
            color: '#ffffff',
            align: 'center',
          },
        )
        .setOrigin(0.5),
    );
    panel.add(
      createButton(this, {
        x: centreX,
        y: centreY + 62,
        label: t('flappy.retry'),
        variant: 'primary',
        origin: 0.5,
        onClick: () => this.requestRetry(),
      }),
    );
    panel.add(
      this.add
        .text(centreX, centreY + 105, t('flappy.tapToRetry'), {
          fontFamily: GameConfig.fonts.default,
          fontSize: uiFont(15),
          color: '#bdbdbd',
        })
        .setOrigin(0.5),
    );
    this.gameOverPanel = panel;
    this.settingsButton.setVisible(true);
  }
}
