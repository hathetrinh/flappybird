// src/ui/Panel.ts
//
// A modal panel over a dimming backdrop. LevelUI already hand-rolls this shape for its win and
// game-over modals; this is the reusable version the menu screens share for how-to-play, the
// language picker and the reset confirmation.
//
// A factory returning a Container, like createButton — this repo has no UI classes.

import * as Phaser from 'phaser';
import { GameConfig, ui, uiFont } from '@core/GameConfig';
import { GAME_DEPTHS } from '@core/GameDepths';
import { GameColors } from './GameColor';
import { createButton, type ButtonVariant } from './GameButton';
import { t } from '@core/i18n';

export interface PanelAction {
  label: string;
  variant?: ButtonVariant;
  onClick: () => void;
}

export interface PanelOptions {
  title: string;
  body: string;
  /** Rendered above the close button, in order. */
  actions?: PanelAction[];
  /** Defaults to the localised "Close". */
  closeLabel?: string;
  /** Called after the panel destroys itself. */
  onClose?: () => void;
}

const PANEL_DATA_KEY = 'isPanel';

/** Whether a createPanel panel is open in this scene. Scene keyboard shortcuts stand down while one is. */
export function isPanelOpen(scene: Phaser.Scene): boolean {
  return scene.children.list.some((obj) => obj.getData?.(PANEL_DATA_KEY) === true);
}

const SIDE_MARGIN = 24;
const PADDING = 20;

export function createPanel(scene: Phaser.Scene, opts: PanelOptions): Phaser.GameObjects.Container {
  const { width, height } = scene.cameras.main;
  const panelWidth = width - ui(SIDE_MARGIN) * 2;
  const textWidth = panelWidth - ui(PADDING) * 2;

  const container = scene.add.container(0, 0);
  container.setScrollFactor(0);
  container.setDepth(GAME_DEPTHS.UI_PANEL);

  // Backdrop: dims the screen and, being interactive, absorbs taps aimed at whatever is behind.
  const backdrop = scene.add.graphics();
  backdrop.fillStyle(0x000000, 0.72);
  backdrop.fillRect(0, 0, width, height);
  backdrop.setInteractive(new Phaser.Geom.Rectangle(0, 0, width, height), Phaser.Geom.Rectangle.Contains);
  container.add(backdrop);

  const title = scene.add.text(0, 0, opts.title, {
    fontFamily: GameConfig.fonts.default,
    fontSize: uiFont(22),
    fontStyle: 'bold',
    color: GameConfig.colors.title,
    wordWrap: { width: textWidth },
  });

  const body = scene.add.text(0, 0, opts.body, {
    fontFamily: GameConfig.fonts.default,
    fontSize: uiFont(15),
    color: GameConfig.colors.text,
    lineSpacing: ui(4),
    wordWrap: { width: textWidth },
  });

  // Buttons are measured by creating them, so the box height has to be computed from real text
  // heights first and the buttons positioned afterwards.
  const actions = opts.actions ?? [];
  const buttonRowHeight = ui(52);
  const contentHeight = title.height + ui(14) + body.height + ui(20) + buttonRowHeight * (actions.length + 1);
  const boxHeight = contentHeight + ui(PADDING) * 2;
  const boxTop = Math.max(ui(40), (height - boxHeight) / 2);
  const boxLeft = ui(SIDE_MARGIN);

  const box = scene.add.graphics();
  box.fillStyle(GameColors.Hex.GRAY_DARK, 1);
  box.fillRoundedRect(boxLeft, boxTop, panelWidth, boxHeight, ui(14));
  box.lineStyle(ui(2), GameColors.UI.TAB_ACTIVE_BG, 1);
  box.strokeRoundedRect(boxLeft, boxTop, panelWidth, boxHeight, ui(14));
  container.add(box);

  let cursorY = boxTop + ui(PADDING);
  title.setPosition(boxLeft + ui(PADDING), cursorY);
  container.add(title);
  cursorY += title.height + ui(14);

  body.setPosition(boxLeft + ui(PADDING), cursorY);
  container.add(body);
  cursorY += body.height + ui(20);

  container.setData(PANEL_DATA_KEY, true);

  // Esc, Enter and Space dismiss the panel, like its Close button. (Its action buttons stay
  // pointer-only: Enter picking one of several actions would be a guess.)
  const onKey = (event: KeyboardEvent) => {
    if (event.code !== 'Escape' && event.code !== 'Enter' && event.code !== 'Space') return;
    event.preventDefault();
    close();
  };
  scene.input.keyboard?.on('keydown', onKey);

  const close = () => {
    scene.input.keyboard?.off('keydown', onKey);
    container.destroy();
    opts.onClose?.();
  };

  for (const action of actions) {
    const button = createButton(scene, {
      x: width / 2,
      y: cursorY,
      label: action.label,
      variant: action.variant ?? 'primary',
      origin: 0.5,
      minWidth: 180,
      onClick: () => {
        // Close first: an action that starts another scene must not leave this panel behind.
        close();
        action.onClick();
      },
    });
    button.setScrollFactor(0);
    container.add(button);
    cursorY += buttonRowHeight;
  }

  const closeButton = createButton(scene, {
    x: width / 2,
    y: cursorY,
    label: opts.closeLabel ?? t('common.close'),
    variant: 'secondary',
    origin: 0.5,
    minWidth: 180,
    onClick: close,
  });
  closeButton.setScrollFactor(0);
  container.add(closeButton);

  container.setAlpha(0);
  scene.tweens.add({ targets: container, alpha: 1, duration: 180, ease: 'Cubic.Out' });

  return container;
}
