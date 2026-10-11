import * as Phaser from 'phaser';
import { GameConfig } from '@core/GameConfig';
import { GameColors } from './GameColor';
import { ui, uiFont } from '@core/GameConfig';
import { AudioService } from '@core/AudioService';
import { HapticsService } from '@core/HapticsService';
import type { SfxId } from '@core/SfxCatalogue';

export type ButtonVariant = 'primary' | 'secondary' | 'success' | 'danger' | 'tab' | 'tab-active';

const VARIANT_STYLES: Record<ButtonVariant, { color: string; bg: number }> = {
  primary: { color: GameColors.UI.PRIMARY_TEXT, bg: GameColors.UI.PRIMARY_BG },
  secondary: { color: GameColors.UI.SECONDARY_TEXT, bg: GameColors.UI.SECONDARY_BG },
  success: { color: GameColors.UI.SUCCESS_TEXT, bg: GameColors.UI.SUCCESS_BG },
  danger: { color: GameColors.UI.DANGER_TEXT, bg: GameColors.UI.DANGER_BG },
  tab: { color: GameColors.UI.SECONDARY_TEXT, bg: GameColors.Hex.GRAY_DARK },
  'tab-active': { color: GameColors.UI.TAB_ACTIVE_TEXT, bg: GameColors.UI.TAB_ACTIVE_BG },
};

// Apple HIG asks for 44x44pt, Material for 48x48dp. One design unit is ~one CSS pixel on a
// phone (see resolveDesignSize in GameConfig), so enforcing it here in design units gives a
// real 44px target on device. Applies to the HIT AREA, not the visual: a small button keeps
// its look and gains invisible slop around it.
const MIN_TAP_SIZE = ui(44);
// Pressed-state feedback. Touch has no hover, so without this a tap gets no acknowledgement
// at all between finger-down and the scene changing.
const PRESS_SCALE = 0.94;
const PRESS_ALPHA = 0.82;

export interface ButtonOptions {
  x: number;
  y: number;
  label: string;
  variant?: ButtonVariant;
  /** 0 = top-left (default), 0.5 = center */
  origin?: number;
  paddingH?: number;
  paddingV?: number;
  radius?: number;
  /** Floor for the VISUAL box, so grids of variable-length labels stay uniform. */
  minWidth?: number;
  minHeight?: number;
  /** Overrides the button font size, in CSS-ish pixels (scaled like every other dimension). */
  fontSize?: number;
  /** Sound played on pointerup, before onClick. Defaults to UI_TAP; pass 'none' to opt out
   *  when a caller plays its own sound instead (e.g. a locked tile playing DENIED). */
  sfx?: SfxId | 'none';
  /** Light haptic knock on press. Defaults to true; pass false for a button that fires many
   *  times in a row (e.g. a D-pad) where a buzz per press becomes noise. */
  haptic?: boolean;
  onClick: () => void;
}

export function createButton(scene: Phaser.Scene, opts: ButtonOptions): Phaser.GameObjects.Container {
  const variant = opts.variant ?? 'primary';
  const { color, bg } = VARIANT_STYLES[variant];
  // Callers pass these in CSS-ish pixels; scale them into game units.
  const paddingH = ui(opts.paddingH ?? 14);
  const paddingV = ui(opts.paddingV ?? 8);
  const radius = ui(opts.radius ?? 10);
  const origin = opts.origin ?? 0;

  // Measure text first so we can size the background
  const label = scene.add.text(0, 0, opts.label, {
    ...GameConfig.fonts.button,
    ...(opts.fontSize ? { fontSize: uiFont(opts.fontSize) } : {}),
    color,
  });

  const w = Math.max(label.width + paddingH * 2, ui(opts.minWidth ?? 0));
  const h = Math.max(label.height + paddingV * 2, ui(opts.minHeight ?? 0));

  // Draw background centered on container origin (0, 0)
  const background = scene.add.graphics();
  background.fillStyle(bg, 1);
  background.fillRoundedRect(-w / 2, -h / 2, w, h, radius);

  // Center the label within the background
  label.setOrigin(0.5, 0.5);

  // Container sits at the top-left anchor by default (origin 0)
  // so shift position to account for chosen origin
  const cx = opts.x + w * (0.5 - origin);
  const cy = opts.y + h * (0.5 - origin);

  const container = scene.add.container(cx, cy, [background, label]);
  container.setSize(w, h);
  container.setData('radius', radius);

  // Hit area padded out to the minimum tap size, centred on the visual box.
  //
  // The origin here is counter-intuitive and worth stating: a Container draws its children
  // around its own position (the background is filled from -w/2), but its input hit area is
  // tested from the TOP-LEFT of the size given to setSize. So a rectangle at (-w/2, -h/2) —
  // the obvious guess, and what this used to pass — lands half a button up and to the left,
  // leaving only a corner of the visual actually clickable. Verified with input.enableDebug.
  //
  // Hence (0, 0) for a hit area the same size as the visual, and any extra padding split
  // evenly so it grows in all four directions rather than only right and down.
  const hitW = Math.max(w, MIN_TAP_SIZE);
  const hitH = Math.max(h, MIN_TAP_SIZE);
  const hitX = -(hitW - w) / 2;
  const hitY = -(hitH - h) / 2;
  container.setInteractive(new Phaser.Geom.Rectangle(hitX, hitY, hitW, hitH), Phaser.Geom.Rectangle.Contains);
  if (container.input) container.input.cursor = 'pointer';

  const setPressed = (pressed: boolean) => {
    container.setScale(pressed ? PRESS_SCALE : 1);
    container.setAlpha(pressed ? PRESS_ALPHA : 1);
  };

  container.on('pointerdown', () => {
    setPressed(true);
    // On press, not on release: the point of a haptic is immediate acknowledgement of the
    // touch, while the sound below deliberately fires on pointerup with the action.
    if (opts.haptic !== false) HapticsService.tap();
  });
  // Release, cancel (finger slid off), and mouse-leave all have to clear the pressed look,
  // otherwise a button can be left visually stuck down.
  container.on('pointerup', () => {
    setPressed(false);
    const sfx = opts.sfx ?? 'UI_TAP';
    if (sfx !== 'none') AudioService.play(sfx);
    opts.onClick();
  });
  container.on('pointerupoutside', () => setPressed(false));
  container.on('pointerout', () => setPressed(false));
  container.on('pointerover', () => container.setAlpha(0.9));

  return container;
}

/**
 * Restyles an existing createButton container in place: redraws its background and recolours
 * its label for another variant, keeping size, position and handlers. For toggles whose colour
 * should follow their state (Settings' On/Off).
 */
export function setButtonVariant(button: Phaser.GameObjects.Container, variant: ButtonVariant): void {
  const { color, bg } = VARIANT_STYLES[variant];
  const background = button.getAt(0) as Phaser.GameObjects.Graphics;
  const label = button.getAt(1) as Phaser.GameObjects.Text;
  const { width: w, height: h } = button;
  background.clear();
  background.fillStyle(bg, 1);
  background.fillRoundedRect(-w / 2, -h / 2, w, h, button.getData('radius') as number);
  label.setColor(color);
}
