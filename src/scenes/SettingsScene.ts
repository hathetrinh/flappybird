import * as Phaser from 'phaser';
import { GameConfig, ui, uiFont } from '@core/GameConfig';
import { createButton, setButtonVariant } from '@ui/GameButton';
import { createPanel } from '@ui/Panel';
import { AudioService } from '@core/AudioService';
import { HapticsService } from '@core/HapticsService';
import { SettingsService } from '@core/SettingsService';
import { ProgressService } from '@core/ProgressService';
import { LOCALES, setLocale, t } from '@core/i18n';
import { localizeRotatePrompt } from '@core/OrientationLock';

const ROW_HEIGHT = 64;

/**
 * createButton's `origin` applies to both axes, so `origin: 1` (right-aligned) also puts the
 * button's bottom edge on y, half a button above its row label, which is centred on y. The
 * container draws centred on its own position, so setting y centres it on the row.
 */
function centreOnRow(button: Phaser.GameObjects.Container, y: number): void {
  button.setY(y);
}

export interface SettingsData {
  /** The scene that paused itself to open Settings, resumed on close. */
  returnTo?: string;
}

export class SettingsScene extends Phaser.Scene {
  private returnTo?: string;

  constructor() {
    super('SettingsScene');
  }

  init(data: SettingsData) {
    this.returnTo = data.returnTo;
  }

  create() {
    const { width, height } = this.cameras.main;
    const boxWidth = Math.min(width - ui(40), ui(400));
    const boxHeight = ui(412);
    const boxX = (width - boxWidth) / 2;
    const boxY = (height - boxHeight) / 2;
    const leftX = boxX + ui(20);
    const rightX = boxX + boxWidth - ui(20);

    // Dimmed overlay
    const overlay = this.add.graphics();
    overlay.fillStyle(0x000000, 0.7);
    overlay.fillRect(0, 0, width, height);
    overlay.setInteractive(new Phaser.Geom.Rectangle(0, 0, width, height), Phaser.Geom.Rectangle.Contains);
    overlay.on('pointerup', () => this.close()); // Click outside to close

    // Panel Box
    const box = this.add.graphics();
    box.fillStyle(0x2a2a2a, 1);
    box.fillRoundedRect(boxX, boxY, boxWidth, boxHeight, ui(16));
    box.lineStyle(ui(2), 0x555555, 1);
    box.strokeRoundedRect(boxX, boxY, boxWidth, boxHeight, ui(16));

    // Close button (X)
    createButton(this, {
      x: rightX - ui(10),
      y: boxY + ui(30),
      label: '✖',
      variant: 'secondary',
      origin: 0.5,
      minWidth: 44,
      onClick: () => this.close(),
    });

    this.add
      .text(width / 2, boxY + ui(40), t('settings.title'), {
        fontFamily: GameConfig.fonts.default,
        fontSize: uiFont(26),
        fontStyle: 'bold',
        color: GameConfig.colors.title,
      })
      .setOrigin(0.5);

    let y = boxY + ui(100);

    this.addToggleRow(y, leftX, rightX, t('settings.sound'), !AudioService.isMuted(), (on) => {
      AudioService.setMuted(!on);
      return !AudioService.isMuted();
    });
    y += ui(ROW_HEIGHT);

    this.addToggleRow(y, leftX, rightX, t('settings.haptics'), HapticsService.isEnabled(), (on) => {
      HapticsService.setEnabled(on);
      return HapticsService.isEnabled();
    });
    y += ui(ROW_HEIGHT);

    this.addLanguageRow(y, leftX, rightX);
    y += ui(ROW_HEIGHT);

    createButton(this, {
      x: width / 2,
      y: y + ui(10),
      label: t('settings.reset'),
      variant: 'danger',
      origin: 0.5,
      minWidth: 220,
      onClick: () => this.confirmReset(),
    });

    // What used to be the About screen: with one game and one menu it is a footer, not a scene.
    this.add
      .text(
        width / 2,
        boxY + boxHeight - ui(28),
        `${t('menu.title')} ${t('settings.version')} ${__APP_VERSION__} · ${t('settings.credits')}`,
        {
          fontFamily: GameConfig.fonts.default,
          fontSize: uiFont(13),
          color: '#9a9a9a',
          align: 'center',
          wordWrap: { width: boxWidth - ui(40) },
        },
      )
      .setOrigin(0.5);

    // A panel open over Settings (the language picker) handles Esc itself and marks the event;
    // closing Settings too would throw away both at once.
    this.input.keyboard?.on('keydown-ESC', (event: KeyboardEvent) => {
      if (!event.defaultPrevented) this.close();
    });
  }

  private close() {
    this.scene.stop();
    if (this.returnTo) this.scene.resume(this.returnTo);
  }

  private rowLabel(x: number, y: number, text: string) {
    this.add
      .text(x, y, text, {
        fontFamily: GameConfig.fonts.default,
        fontSize: uiFont(17),
        color: GameConfig.colors.text,
      })
      .setOrigin(0, 0.5);
  }

  private addToggleRow(
    y: number,
    leftX: number,
    rightX: number,
    label: string,
    initial: boolean,
    apply: (on: boolean) => boolean,
  ) {
    this.rowLabel(leftX, y, label);

    let on = initial;
    const button = createButton(this, {
      x: rightX,
      y,
      label: on ? t('common.on') : t('common.off'),
      variant: on ? 'success' : 'secondary',
      origin: 1, // Align to right
      minWidth: 90,
      onClick: () => {
        on = apply(!on);
        text.setText(on ? t('common.on') : t('common.off'));
        setButtonVariant(button, on ? 'success' : 'secondary');
      },
    });
    centreOnRow(button, y);
    const text = button.getAt(1) as Phaser.GameObjects.Text;
  }

  private addLanguageRow(y: number, leftX: number, rightX: number) {
    this.rowLabel(leftX, y, t('settings.language'));

    const current = LOCALES.find((l) => l.code === SettingsService.getLanguage()) ?? LOCALES[0];
    const button = createButton(this, {
      x: rightX,
      y,
      label: current.label,
      variant: 'secondary',
      origin: 1, // Align right
      minWidth: 120,
      onClick: () => this.pickLanguage(),
    });
    centreOnRow(button, y);
  }

  private pickLanguage() {
    createPanel(this, {
      title: t('settings.language'),
      body: '',
      actions: LOCALES.map((locale) => ({
        label: locale.label,
        variant: locale.code === SettingsService.getLanguage() ? ('success' as const) : ('secondary' as const),
        onClick: () => {
          SettingsService.setLanguage(locale.code);
          setLocale(locale.code);
          localizeRotatePrompt();
          this.scene.restart({ returnTo: this.returnTo } satisfies SettingsData);
        },
      })),
      closeLabel: t('common.cancel'),
    });
  }

  private confirmReset() {
    createPanel(this, {
      title: t('settings.resetTitle'),
      body: t('settings.resetBody'),
      actions: [
        {
          label: t('settings.resetConfirm'),
          variant: 'danger',
          onClick: () => {
            ProgressService.resetAllProgress();
            // The scene underneath notices the changed best score when it resumes.
            this.close();
          },
        },
      ],
      closeLabel: t('common.cancel'),
    });
  }
}
