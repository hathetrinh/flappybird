// src/core/HapticsService.ts
//
// The only way anything in the game produces haptic feedback. Mirrors AudioService: callers say
// HapticsService.tap(), never touching the Capacitor plugin directly, and this module keeps its
// own authoritative enabled flag rather than re-reading storage on every tap.

import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { SettingsService } from './SettingsService';

export class HapticsService {
  private static enabled = true;

  /** Called once from main.ts, mirroring AudioService.bindGame. */
  public static init(): void {
    this.enabled = SettingsService.isHapticsEnabled();
  }

  public static isEnabled(): boolean {
    return this.enabled;
  }

  public static setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    SettingsService.setHapticsEnabled(enabled);
  }

  /** Returns the new state, mirroring AudioService.toggleMute(). Buzzes when switching on. */
  public static toggle(): boolean {
    this.setEnabled(!this.enabled);
    if (this.enabled) this.tap();
    return this.enabled;
  }

  /** Light knock for a button press. */
  public static tap(): void {
    this.run(() => Haptics.impact({ style: ImpactStyle.Light }));
  }

  public static success(): void {
    this.run(() => Haptics.notification({ type: NotificationType.Success }));
  }

  public static error(): void {
    this.run(() => Haptics.notification({ type: NotificationType.Error }));
  }

  /**
   * Never throws and never rejects into the console. The web implementation rejects with
   * Unimplemented wherever navigator.vibrate is missing (iOS Safari, most desktops), and a
   * silent no-op is the correct outcome there — haptics are an enhancement, not a feature the
   * game depends on.
   */
  private static run(action: () => Promise<unknown>): void {
    if (!this.enabled) return;
    try {
      void action().catch(() => {});
    } catch {
      // Plugin missing entirely (older Capacitor shell) — ignore.
    }
  }
}
