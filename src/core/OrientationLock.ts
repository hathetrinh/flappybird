// src/core/OrientationLock.ts
//
// Portrait by default: every scene except a 3D Sokoban level wants the HUD/D-pad reserves a
// grid puzzle assumes (see CLAUDE.md). PlayScene calls allowRotation()/lockPortrait() around
// 3D Sokoban gameplay specifically — see its is3DSokobanActive branch.
//
// Kept in its own module rather than main.ts (where the original boot-time lock lived) so
// PlayScene can import it without a circular dependency: main.ts already imports PlayScene for
// Phaser's scene list, and main.ts's own top level constructs the Phaser.Game instance — a
// PlayScene → main.ts import would drag all of that module-init side effect into PlayScene's
// import graph, not just the two functions it actually needs.
import { t } from '@core/i18n';

type LockableOrientation = ScreenOrientation & { lock?: (o: string) => Promise<void>; unlock?: () => void };

/**
 * Puts the current locale's text into index.html's rotate prompt. Call after every setLocale():
 * the prompt is plain DOM outside Phaser, so a scene restart doesn't redraw it.
 */
export function localizeRotatePrompt(): void {
  const text = document.getElementById('rotate-prompt-text');
  if (text) text.textContent = t('orientation.rotatePortrait');
}

/**
 * Best-effort: the Screen Orientation Lock API is unavailable or requires fullscreen in several
 * browsers (desktop, iOS Safari), so index.html's CSS rotate-prompt is the fallback for those —
 * see the media query gated on the `rotation-ok` class toggled here.
 */
export function lockPortrait(): void {
  document.body.classList.remove('rotation-ok');
  void (async () => {
    try {
      await (screen.orientation as LockableOrientation).lock?.('portrait');
    } catch {
      // Refused — the CSS prompt (gated by the rotation-ok class) handles it.
    }
  })();
}

export function allowRotation(): void {
  document.body.classList.add('rotation-ok');
  void (async () => {
    try {
      (screen.orientation as LockableOrientation).unlock?.();
    } catch {
      // Not every browser supports/needs an explicit unlock — the lock above was best-effort too.
    }
  })();
}
