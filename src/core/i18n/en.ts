// src/core/i18n/en.ts
//
// Every player-facing string: the menu, Settings, About, and the run's HUD and game-over panel.
// Add a key here and in vi.ts together (i18n.test.ts checks they match).

export const EN: Record<string, string> = {
  'menu.title': 'Sky Chick',
  'menu.subtitle': 'Tap to fly',
  'menu.play': 'Play',
  'menu.best': 'Best: {score}',
  'menu.settings': 'Settings',

  'common.back': '← Back',
  'common.close': 'Close',
  'common.cancel': 'Cancel',
  'common.on': 'On',
  'common.off': 'Off',

  'orientation.rotatePortrait': 'Turn your device upright to play',

  'settings.title': 'Settings',
  'settings.sound': 'Sound',
  'settings.haptics': 'Vibration',
  'settings.language': 'Language',
  'settings.reset': 'Reset best score',
  'settings.resetTitle': 'Reset best score?',
  'settings.resetBody': 'This erases your best score. It cannot be undone.',
  'settings.resetConfirm': 'Erase it',

  'about.title': 'About',
  'about.version': 'Version',
  'about.credits': 'Made with Phaser.',

  'flappy.menu': '← Menu',
  'flappy.tapToFly': 'Tap to fly',
  'flappy.gameOver': 'Game over',
  'flappy.newBest': 'New best!',
  'flappy.result': 'Score {score}  ·  Coins {coins}\nBest {best}',
  'flappy.retry': 'Retry',
  'flappy.tapToRetry': 'or tap anywhere to play again',
};
