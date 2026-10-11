import * as Phaser from 'phaser';
// Bundled rather than fetched from Google Fonts: portals' QA flags third-party requests, and the
// game should not depend on a CDN to draw its own text. Only the weights the UI uses, and only
// the subsets our locales (en, vi) need — the package's default CSS also ships Devanagari.
import '@fontsource/baloo-2/latin-400.css';
import '@fontsource/baloo-2/latin-700.css';
import '@fontsource/baloo-2/latin-ext-400.css';
import '@fontsource/baloo-2/latin-ext-700.css';
import '@fontsource/baloo-2/vietnamese-400.css';
import '@fontsource/baloo-2/vietnamese-700.css';
import { LoadingScene } from './scenes/LoadingScene';
import { MenuScene } from './scenes/MenuScene';
import { SettingsScene } from './scenes/SettingsScene';
import { AboutScene } from './scenes/AboutScene';
import { FlappyGameScene } from '@games/flappy/FlappyGameScene';
import { GameConfig } from '@core/GameConfig';
import { AudioService } from '@core/AudioService';
import { HapticsService } from '@core/HapticsService';
import { SettingsService } from '@core/SettingsService';
import { YouTubePlayables } from '@core/YouTubePlayables';
import { GameDistributionSDK } from '@core/GameDistribution';
import { setLocale } from '@core/i18n';
import { localizeRotatePrompt, lockPortrait } from '@core/OrientationLock';


const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: GameConfig.width,
  height: GameConfig.height,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  parent: 'game-container',
  transparent: true,
  scene: [LoadingScene, MenuScene, FlappyGameScene, SettingsScene, AboutScene],
};


// A tall flight path wants a tall screen: ask the platform to stay portrait. Best-effort by
// design (the API is missing or needs fullscreen in several browsers), so index.html also
// carries a CSS prompt to turn the phone upright for the cases it can't cover, and a native
// build should set the orientation in its manifest.
lockPortrait();

// Before any scene builds text: scenes read strings during create(), so a locale applied after
// construction would leave the first screen in the wrong language until it was rebuilt.
setLocale(SettingsService.getLanguage());
localizeRotatePrompt();

const game = new Phaser.Game(config);

game.events.once(Phaser.Core.Events.READY, () => {
  AudioService.bindGame(game);
  HapticsService.init();
  // Each portal SDK only in its own build: the other's globals and handlers have no business on
  // a page the other portal reviews.
  if (__PLATFORM__ === 'youtube') YouTubePlayables.init(game);
  if (__PLATFORM__ === 'gd') GameDistributionSDK.init(game);
});
