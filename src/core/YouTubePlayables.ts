import type * as Phaser from 'phaser';
import { AudioService } from './AudioService';
import { ExternalPause } from './ExternalPause';

const PAUSE_REASON = 'youtube-host';

/**
 * YouTube Playables SDK Integration Wrapper
 *
 * Provides stub implementations and hooks for the required YouTube Playables SDK events.
 * When the real SDK is embedded by YouTube, it will interact with these hooks. Only the
 * `youtube` build initialises this (see main.ts). Tab-hiding needs no handler of its own:
 * Phaser already pauses its loop and sound when the page is hidden.
 */
export class YouTubePlayables {
  public static init(game: Phaser.Game) {
    ExternalPause.bindGame(game);
    (window as any).yt = (window as any).yt || {};
    (window as any).yt.playables = (window as any).yt.playables || {
      onPause: () => this.onPause(),
      onResume: () => this.onResume(),
      onAudioEnabledChange: (enabled: boolean) => this.onAudioEnabledChange(enabled),
    };
  }

  public static onPause() {
    ExternalPause.pause(PAUSE_REASON);
  }

  public static onResume() {
    ExternalPause.resume(PAUSE_REASON);
  }

  public static onAudioEnabledChange(enabled: boolean) {
    AudioService.setMuted(!enabled);
  }
}
