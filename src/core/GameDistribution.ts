// src/core/GameDistribution.ts
//
// Wraps the GameDistribution HTML5 SDK. The SDK script itself is only injected into the page by
// the `gd` build (`npm run build:gd`, see vite.config.ts), which forwards every SDK event to
// handleEvent() below through window.GD_Callbacks.
//
// GD's QA rules this enforces: the game is paused and silent for the whole ad, the player's own
// mute setting survives the ad, and a rewarded ad only rewards a fully watched ad.
import type * as Phaser from 'phaser';
import { ExternalPause } from './ExternalPause';

interface GdSdk {
  showAd(type?: 'interstitial' | 'rewarded'): Promise<unknown> | undefined;
  preloadAd?(type: 'rewarded'): Promise<unknown> | undefined;
}

const PAUSE_REASON = 'gd-ad';
// Interstitials are only shown at natural breaks (between runs, when the player retries), and at
// most this often, so a player crashing early and often doesn't see an ad after every run.
const MIN_INTERSTITIAL_GAP_MS = 90_000;

export class GameDistributionSDK {
  private static pendingDone: (() => void) | null = null;
  private static pendingReward: (() => void) | null = null;
  private static lastAdAt = 0;
  private static rewardedReady = false;
  private static rewardedListener: (() => void) | null = null;

  public static init(game: Phaser.Game): void {
    ExternalPause.bindGame(game);
    const callbacks = { onEvent: (event: { name: string }) => this.handleEvent(event.name) };
    // Events that arrived before the game booted (a preroll ad starting on page load) were
    // queued by the snippet in vite.config.ts; replay them so the game starts paused if needed.
    const queued: Array<{ name: string }> = (window as any).GD_Callbacks?.queue ?? [];
    (window as any).GD_Callbacks = callbacks;
    queued.forEach((event) => callbacks.onEvent(event));
    this.preloadRewarded();
  }

  private static sdk(): GdSdk | null {
    const gdsdk = (window as any).gdsdk;
    return gdsdk && typeof gdsdk.showAd === 'function' ? (gdsdk as GdSdk) : null;
  }

  private static handleEvent(name: string): void {
    switch (name) {
      case 'SDK_READY':
        this.preloadRewarded();
        break;
      case 'SDK_GAME_PAUSE':
        ExternalPause.pause(PAUSE_REASON);
        break;
      case 'SDK_GAME_START':
        ExternalPause.resume(PAUSE_REASON);
        this.finishAd();
        break;
      case 'SDK_REWARDED_WATCH_COMPLETE':
        this.pendingReward?.();
        this.pendingReward = null;
        break;
    }
  }

  /**
   * Shows an interstitial at a natural break, then calls onComplete exactly once — whether the
   * ad played, was skipped by the rate limit, failed, or the SDK isn't on the page at all.
   */
  public static showAd(onComplete: () => void): void {
    const sdk = this.sdk();
    if (!sdk || Date.now() - this.lastAdAt < MIN_INTERSTITIAL_GAP_MS) {
      onComplete();
      return;
    }
    this.lastAdAt = Date.now();
    this.run(sdk, 'interstitial', onComplete);
  }

  /**
   * Called whenever canShowRewarded() may have changed — a preload finishing after the level was
   * built. One listener at a time: PlayScene is the only rewarded-ad placement.
   */
  public static setRewardedListener(listener: (() => void) | null): void {
    this.rewardedListener = listener;
  }

  /** Whether a rewarded ad can be offered right now. The Skip button is hidden otherwise. */
  public static canShowRewarded(): boolean {
    return this.sdk() !== null && this.rewardedReady;
  }

  /**
   * Shows a rewarded ad. onReward runs only if the ad was watched to the end; onComplete always
   * runs once afterwards. Without the SDK nothing is granted (dev builds excepted, for testing).
   */
  public static showRewardedAd(onReward: () => void, onComplete: () => void): void {
    const sdk = this.sdk();
    if (!sdk) {
      if (import.meta.env.DEV) onReward();
      onComplete();
      return;
    }
    this.rewardedReady = false;
    this.rewardedListener?.();
    this.pendingReward = onReward;
    this.lastAdAt = Date.now();
    // pendingReward is deliberately NOT cleared when the ad finishes: the SDK does not promise
    // that SDK_REWARDED_WATCH_COMPLETE arrives before SDK_GAME_START, and clearing it here would
    // drop a reward the player earned. It is replaced on the next rewarded ad.
    this.run(sdk, 'rewarded', () => {
      this.preloadRewarded();
      onComplete();
    });
  }

  private static run(sdk: GdSdk, type: 'interstitial' | 'rewarded', onDone: () => void): void {
    this.pendingDone = onDone;
    try {
      // The promise settles when the ad is over or could not be shown ("no fill", ad blocker).
      // SDK_GAME_START usually arrives too; finishAd() makes whichever comes second a no-op.
      Promise.resolve(sdk.showAd(type))
        .catch((err) => console.warn(`[GameDistribution] ${type} ad not shown:`, err))
        .finally(() => {
          ExternalPause.resume(PAUSE_REASON);
          this.finishAd();
        });
    } catch (err) {
      console.warn(`[GameDistribution] ${type} ad threw:`, err);
      this.finishAd();
    }
  }

  private static finishAd(): void {
    const done = this.pendingDone;
    this.pendingDone = null;
    done?.();
  }

  private static preloadRewarded(): void {
    const sdk = this.sdk();
    if (!sdk?.preloadAd || this.rewardedReady) return;
    Promise.resolve(sdk.preloadAd('rewarded'))
      .then(() => {
        this.rewardedReady = true;
        this.rewardedListener?.();
      })
      .catch(() => {
        this.rewardedReady = false;
      });
  }
}
