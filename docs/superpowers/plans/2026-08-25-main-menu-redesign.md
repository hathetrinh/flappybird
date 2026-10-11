# Main Menu Redesign Implementation Plan

**Status:** Complete — all 12 tasks implemented, verified per-task, and confirmed with a full
manual pass at a 390x844 viewport. Landed in `b6e2ee6` on `feature/sokoban-3d-responsive-ui`
(one squashed commit, since the working tree only ever held each file's cumulative end state).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `MenuScene`'s two-button screen with a Continue card plus Games, Settings and About destinations, backed by a game catalog that retires Flappy's Arcade special case.

**Architecture:** Three new scenes (`GamesScene`, `SettingsScene`, `AboutScene`) read from two new pure modules — `GameCatalog` (what games exist) and `GameProgress` (progress maths over injected data). `LevelSelectScene` loses its mechanic tabs and Arcade section and becomes "the levels of one game", entered with a `mechanic` parameter. A pure `i18n` module supplies the new screens' text in English and Vietnamese.

**Tech Stack:** Phaser 4, TypeScript, Vite, Vitest (pure logic only), Capacitor 8.

**Spec:** `docs/superpowers/specs/2026-08-25-main-menu-redesign-design.md`

## Global Constraints

- **Node/tooling:** Vitest 4 with `environment: 'node'` and `include: ['src/**/*.test.ts', 'scripts/**/*.test.ts']`. A test file may **not** transitively import Phaser, three.js, or touch the DOM — see `docs/adr/0004-vitest-for-pure-logic.md`.
- **`verbatimModuleSyntax: true`** in `tsconfig.json`: every type-only import MUST use `import type { X } from '...'`. A plain `import { SomeType }` fails the build.
- **`noUnusedLocals: true`**: remove imports and locals as soon as they stop being used, or `npm run build` fails.
- **Prettier:** `printWidth: 120`, `singleQuote: true`, `trailingComma: "all"`, `semi: true`, `arrowParens: "always"`, `endOfLine: "lf"`. A Husky pre-commit hook runs `eslint --fix` + `prettier --write` on staged `src/**` files, so committed code gets reformatted automatically.
- **Lint gate:** `npm run lint` is `eslint "src/**/*.{ts,tsx,js}" --max-warnings=0` — zero warnings allowed.
- **Path aliases:** `@core/*`, `@ui/*`, `@three/*`, `@scenes/*`, `@mechanics/*`, `@levels/*`, `@game-types/*`, `@games/*`. Both `tsconfig.json` `paths` and `vite.config.ts` `resolve.alias` must stay in step. The types alias is `@game-types`, never `@types`.
- **Sizing:** all dimensions and font sizes authored in CSS-ish pixels and passed through `ui(n)` / `uiFont(n)` from `@core/GameConfig`. Never hardcode a raw pixel number for layout.
- **Depths:** use `GAME_DEPTHS` from `@core/GameDepths` — `UI_BACKGROUND: 100`, `UI_PANEL: 110`, `UI_TEXT: 120`, `UI_BUTTONS: 130`. Do not invent z-values.
- **Locale codes:** exactly `'en'` and `'vi'`. Default `'en'`.
- **Reserved level id:** `FLAPPY_LEVEL_ID = 2001`. Level id ranges: Matchstick 1-60, Sokoban 101-160, Logic Grid 1001-1005.
- **No new runtime dependency** other than `@capacitor/haptics` (Task 6).
- **Scenes are not unit-tested.** Scene tasks are verified with `npm run build` (type-check + bundle), `npm run lint`, and a manual pass in `npm run dev`.

---

## File Structure

**New — pure logic (unit tested):**

| File                            | Responsibility                                                    |
| ------------------------------- | ----------------------------------------------------------------- |
| `src/core/i18n/index.ts`        | Locale registry, current locale, `t()` and the pure `translate()` |
| `src/core/i18n/en.ts`           | English dictionary                                                |
| `src/core/i18n/vi.ts`           | Vietnamese dictionary                                             |
| `src/core/i18n/i18n.test.ts`    | Lookup and fallback behaviour                                     |
| `src/core/GameCatalog.ts`       | Declares what games exist; owns `FLAPPY_LEVEL_ID`                 |
| `src/core/GameCatalog.test.ts`  | Entry lookup, 3D filtering, dictionary-key coverage               |
| `src/core/GameProgress.ts`      | Pure progress maths over injected level list + progress record    |
| `src/core/GameProgress.test.ts` | Solved/stars, unlock rule, continue resolution, display numbering |

**New — Phaser (verified by running):**

| File                          | Responsibility                                                  |
| ----------------------------- | --------------------------------------------------------------- |
| `src/core/HapticsService.ts`  | The only way anything triggers haptic feedback                  |
| `src/ui/Panel.ts`             | Modal panel factory: backdrop, box, title, body, action buttons |
| `src/scenes/GamesScene.ts`    | Scrolling list of game cards                                    |
| `src/scenes/SettingsScene.ts` | Sound, haptics, language, reset progress                        |
| `src/scenes/AboutScene.ts`    | Name, version, credits                                          |
| `src/types/app-globals.d.ts`  | Declares the `__APP_VERSION__` Vite define                      |

**Modified:** `src/core/SettingsService.ts`, `src/core/ProgressService.ts`, `src/ui/GameButton.ts`, `src/scenes/MenuScene.ts`, `src/scenes/LevelSelectScene.ts`, `src/scenes/PlayScene.ts`, `src/games/flappy/FlappyGameScene.ts`, `src/main.ts`, `vite.config.ts`, `package.json`, `CLAUDE.md`, `docs/adr/0005-flappy-in-level-select.md`.

---

### Task 1: i18n module

**Files:**

- Create: `src/core/i18n/en.ts`
- Create: `src/core/i18n/vi.ts`
- Create: `src/core/i18n/index.ts`
- Test: `src/core/i18n/i18n.test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces:
  - `type LocaleCode = 'en' | 'vi'`
  - `LOCALES: ReadonlyArray<{ code: LocaleCode; label: string }>`
  - `translate(locale: LocaleCode, key: string): string` — pure
  - `setLocale(locale: string): void` — coerces an unknown string to `'en'`
  - `getLocale(): LocaleCode`
  - `t(key: string): string` — `translate(getLocale(), key)`

This module deliberately does **not** import `SettingsService`. `main.ts` reads the persisted language and calls `setLocale`. That keeps the dependency pointing one way and keeps this module trivially testable.

- [x] **Step 1: Write the English dictionary**

Create `src/core/i18n/en.ts`:

```ts
// src/core/i18n/en.ts
//
// Scope is the menu surfaces only — MenuScene, GamesScene, SettingsScene, AboutScene and the
// game catalog's copy. Gameplay text is NOT routed through here yet (see the spec's
// "Internationalization" section); LevelUI still carries its own hardcoded strings.

export const EN: Record<string, string> = {
  'menu.title': 'Brain Puzzle Game',
  'menu.continue': 'Continue',
  'menu.games': 'Games',
  'menu.settings': 'Settings',
  'menu.about': 'About',

  'common.back': '← Back',
  'common.level': 'Level',
  'common.close': 'Close',
  'common.cancel': 'Cancel',
  'common.on': 'On',
  'common.off': 'Off',

  'games.title': 'Games',
  'games.solved': 'solved',
  'games.best': 'Best',
  'games.howToPlay': 'How to play',
  'games.notStarted': 'Not started',

  'settings.title': 'Settings',
  'settings.sound': 'Sound',
  'settings.haptics': 'Vibration',
  'settings.language': 'Language',
  'settings.reset': 'Reset progress',
  'settings.resetTitle': 'Reset progress?',
  'settings.resetBody': 'This erases every solved level, star and high score. It cannot be undone.',
  'settings.resetConfirm': 'Erase everything',

  'about.title': 'About',
  'about.version': 'Version',
  'about.credits': 'Made with Phaser and three.js.',

  'game.matchstick.title': 'Matchsticks',
  'game.matchstick.description': 'Move a single stick to repair a broken equation.',
  'game.matchstick.howTo':
    'Each puzzle shows an equation built from matchsticks that is currently wrong. Drag the number of sticks the puzzle asks for to new slots so the equation becomes true. Use Undo to take a move back.',

  'game.sokoban.title': 'Sokoban',
  'game.sokoban.description': 'Push every box onto a target square.',
  'game.sokoban.howTo':
    'Walk with the arrow keys, WASD, or the on-screen D-pad. You can push a box but never pull one, so a box shoved into a corner is stuck. Get every box onto a target to win, and use Undo when you trap one.',

  'game.logicgrid.title': 'Logic Grid',
  'game.logicgrid.description': 'Deduce who owns what from a handful of clues.',
  'game.logicgrid.howTo':
    'Each clue tells you that two things go together or that they cannot. Tap a cell to cycle it: blank, then a tick for a definite pair, then a cross to rule it out. Every clue is true, and exactly one arrangement satisfies all of them.',

  'game.flappy.title': 'Flappy 3D',
  'game.flappy.description': 'Endless one-tap flying. Beat your own best score.',
  'game.flappy.howTo':
    'Tap to flap. Fly through the gap between each pair of pipes without touching them or the ground. There is no finish line — the run ends when you crash, and only your best score is kept.',
};
```

- [x] **Step 2: Write the Vietnamese dictionary**

Create `src/core/i18n/vi.ts`. Same key set exactly — Task 1's test asserts that.

```ts
// src/core/i18n/vi.ts

export const VI: Record<string, string> = {
  'menu.title': 'Game Giải Đố Trí Tuệ',
  'menu.continue': 'Tiếp tục',
  'menu.games': 'Trò chơi',
  'menu.settings': 'Cài đặt',
  'menu.about': 'Giới thiệu',

  'common.back': '← Quay lại',
  'common.level': 'Màn',
  'common.close': 'Đóng',
  'common.cancel': 'Hủy',
  'common.on': 'Bật',
  'common.off': 'Tắt',

  'games.title': 'Trò chơi',
  'games.solved': 'đã giải',
  'games.best': 'Cao nhất',
  'games.howToPlay': 'Cách chơi',
  'games.notStarted': 'Chưa chơi',

  'settings.title': 'Cài đặt',
  'settings.sound': 'Âm thanh',
  'settings.haptics': 'Rung',
  'settings.language': 'Ngôn ngữ',
  'settings.reset': 'Xóa tiến trình',
  'settings.resetTitle': 'Xóa tiến trình?',
  'settings.resetBody': 'Toàn bộ màn đã giải, sao và điểm cao sẽ bị xóa. Không thể hoàn tác.',
  'settings.resetConfirm': 'Xóa tất cả',

  'about.title': 'Giới thiệu',
  'about.version': 'Phiên bản',
  'about.credits': 'Được tạo bằng Phaser và three.js.',

  'game.matchstick.title': 'Xếp Diêm',
  'game.matchstick.description': 'Di chuyển que diêm để sửa phép tính bị sai.',
  'game.matchstick.howTo':
    'Mỗi màn có một phép tính ghép từ que diêm và đang sai. Hãy di chuyển đúng số que mà màn chơi yêu cầu sang vị trí khác để phép tính trở nên đúng. Dùng Undo để hoàn tác.',

  'game.sokoban.title': 'Đẩy Hộp',
  'game.sokoban.description': 'Đẩy mọi chiếc hộp vào ô đích.',
  'game.sokoban.howTo':
    'Di chuyển bằng các phím mũi tên, WASD hoặc D-pad trên màn hình. Bạn chỉ có thể đẩy hộp, không thể kéo, nên hộp bị đẩy vào góc sẽ mắc kẹt. Đưa tất cả hộp vào ô đích để thắng, và dùng Undo khi làm kẹt một hộp.',

  'game.logicgrid.title': 'Suy Luận Logic',
  'game.logicgrid.description': 'Suy ra ai sở hữu thứ gì từ một vài manh mối.',
  'game.logicgrid.howTo':
    'Mỗi manh mối cho biết hai thứ đi cùng nhau hoặc không thể đi cùng nhau. Chạm vào một ô để đổi trạng thái: trống, dấu tích khi chắc chắn đúng, rồi dấu chéo để loại trừ. Mọi manh mối đều đúng và chỉ có duy nhất một cách sắp xếp thỏa mãn tất cả.',

  'game.flappy.title': 'Flappy 3D',
  'game.flappy.description': 'Bay một chạm không giới hạn. Vượt kỷ lục của chính bạn.',
  'game.flappy.howTo':
    'Chạm để vỗ cánh. Bay qua khoảng trống giữa các cặp ống mà không đụng vào ống hay mặt đất. Không có vạch đích — lượt chơi kết thúc khi bạn đâm phải, và chỉ điểm cao nhất được lưu lại.',
};
```

- [x] **Step 3: Write the failing test**

Create `src/core/i18n/i18n.test.ts`:

```ts
import { describe, expect, it, beforeEach } from 'vitest';
import { EN } from './en';
import { VI } from './vi';
import { LOCALES, getLocale, setLocale, t, translate } from './index';

describe('i18n: dictionaries', () => {
  it('offers exactly the two locales the spec names', () => {
    expect(LOCALES.map((l) => l.code)).toEqual(['en', 'vi']);
  });

  it('translates every English key to Vietnamese with no gaps', () => {
    const missing = Object.keys(EN).filter((key) => !(key in VI));
    expect(missing).toEqual([]);
  });

  it('has no Vietnamese key that English lacks', () => {
    const extra = Object.keys(VI).filter((key) => !(key in EN));
    expect(extra).toEqual([]);
  });

  it('never leaves a value empty', () => {
    const blank = [...Object.entries(EN), ...Object.entries(VI)].filter(([, value]) => value.trim() === '');
    expect(blank).toEqual([]);
  });
});

describe('i18n: translate', () => {
  it('returns the string for the requested locale', () => {
    expect(translate('vi', 'menu.games')).toBe(VI['menu.games']);
  });

  it('falls back to English when the locale lacks the key', () => {
    expect(translate('vi', '__only_in_en__')).toBe('__only_in_en__');
  });

  it('returns the key itself when no locale has it, so a gap is visible but harmless', () => {
    expect(translate('en', 'nope.not.here')).toBe('nope.not.here');
  });
});

describe('i18n: current locale', () => {
  beforeEach(() => setLocale('en'));

  it('defaults to English', () => {
    expect(getLocale()).toBe('en');
  });

  it('switches locale and routes t() through it', () => {
    setLocale('vi');
    expect(getLocale()).toBe('vi');
    expect(t('menu.settings')).toBe(VI['menu.settings']);
  });

  it('coerces an unrecognised stored value to English rather than throwing', () => {
    setLocale('klingon');
    expect(getLocale()).toBe('en');
    expect(t('menu.settings')).toBe(EN['menu.settings']);
  });
});
```

- [x] **Step 4: Run the test to verify it fails**

Run: `npx vitest run src/core/i18n/i18n.test.ts`
Expected: FAIL — `Failed to resolve import "./index"`.

- [x] **Step 5: Write the implementation**

Create `src/core/i18n/index.ts`:

```ts
// src/core/i18n/index.ts
//
// The only place menu text is looked up. Deliberately does NOT import SettingsService: main.ts
// reads the persisted language and calls setLocale(), so this module stays pure and testable
// under docs/adr/0004-vitest-for-pure-logic.md.

import { EN } from './en';
import { VI } from './vi';

export type LocaleCode = 'en' | 'vi';

export const LOCALES: ReadonlyArray<{ code: LocaleCode; label: string }> = [
  { code: 'en', label: 'English' },
  { code: 'vi', label: 'Tiếng Việt' },
];

const DICTIONARIES: Record<LocaleCode, Record<string, string>> = { en: EN, vi: VI };

const DEFAULT_LOCALE: LocaleCode = 'en';

function isLocaleCode(value: string): value is LocaleCode {
  return LOCALES.some((l) => l.code === value);
}

let current: LocaleCode = DEFAULT_LOCALE;

/**
 * Resolves a key in the given locale. Falls back to English, then to the key itself — a missing
 * string shows up as a visible key in development instead of crashing a player's session.
 */
export function translate(locale: LocaleCode, key: string): string {
  return DICTIONARIES[locale][key] ?? DICTIONARIES[DEFAULT_LOCALE][key] ?? key;
}

/** Accepts an arbitrary string (it comes from storage) and coerces anything unknown to English. */
export function setLocale(locale: string): void {
  current = isLocaleCode(locale) ? locale : DEFAULT_LOCALE;
}

export function getLocale(): LocaleCode {
  return current;
}

export function t(key: string): string {
  return translate(current, key);
}
```

- [x] **Step 6: Run the test to verify it passes**

Run: `npx vitest run src/core/i18n/i18n.test.ts`
Expected: PASS, 10 tests.

- [x] **Step 7: Commit**

```bash
git add src/core/i18n
git commit -m "feat: add i18n module with English and Vietnamese menu strings"
```

---

### Task 2: GameCatalog

**Files:**

- Create: `src/core/GameCatalog.ts`
- Test: `src/core/GameCatalog.test.ts`
- Modify: `src/games/flappy/FlappyGameScene.ts` (import `FLAPPY_LEVEL_ID` instead of declaring it)

**Interfaces:**

- Consumes: `MechanicType` from `@game-types/Level`; the `game.*` dictionary keys from Task 1.
- Produces:
  - `FLAPPY_LEVEL_ID = 2001`
  - `type CatalogEntry` — discriminated on `kind: 'LEVELS' | 'ARCADE'`
  - `GAME_CATALOG: readonly CatalogEntry[]`
  - `catalogEntryForMechanic(mechanic: MechanicType): CatalogEntry | undefined`
  - `availableGames(is3DReady: boolean): CatalogEntry[]`

`FLAPPY_LEVEL_ID` moves here because `FlappyGameScene` imports Phaser, and a catalog importing the constant from there would drag Phaser into a `node`-environment Vitest run.

- [x] **Step 1: Write the failing test**

Create `src/core/GameCatalog.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { EN } from './i18n/en';
import { FLAPPY_LEVEL_ID, GAME_CATALOG, availableGames, catalogEntryForMechanic } from './GameCatalog';

describe('GameCatalog: entries', () => {
  it('reserves 2001 for Flappy, matching ADR 0001', () => {
    expect(FLAPPY_LEVEL_ID).toBe(2001);
  });

  it('lists the three puzzle games and Flappy, and none of the dormant mechanics', () => {
    expect(GAME_CATALOG.map((e) => e.key)).toEqual(['MATCH_STICK', 'SOKOBAN', 'LOGIC_GRID', 'FLAPPY']);
  });

  it('has a real dictionary entry behind every copy key', () => {
    const missing = GAME_CATALOG.flatMap((e) =>
      [e.titleKey, e.descriptionKey, e.howToPlayKey].filter((key) => !(key in EN)),
    );
    expect(missing).toEqual([]);
  });

  it('gives every entry a unique key', () => {
    expect(new Set(GAME_CATALOG.map((e) => e.key)).size).toBe(GAME_CATALOG.length);
  });
});

describe('GameCatalog: catalogEntryForMechanic', () => {
  it('finds the entry for a mechanic that has one', () => {
    const entry = catalogEntryForMechanic('SOKOBAN');
    expect(entry?.key).toBe('SOKOBAN');
    expect(entry?.kind).toBe('LEVELS');
  });

  it('returns undefined for a dormant mechanic with no catalog entry', () => {
    expect(catalogEntryForMechanic('DEVICE_SHAKE')).toBeUndefined();
  });
});

describe('GameCatalog: availableGames', () => {
  it('includes every game when the 3D layer is up', () => {
    expect(availableGames(true)).toHaveLength(GAME_CATALOG.length);
  });

  it('drops the games that require 3D when it is not', () => {
    const keys = availableGames(false).map((e) => e.key);
    expect(keys).not.toContain('FLAPPY');
    expect(keys).toContain('SOKOBAN');
  });
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/core/GameCatalog.test.ts`
Expected: FAIL — cannot resolve `./GameCatalog`.

- [x] **Step 3: Write the implementation**

Create `src/core/GameCatalog.ts`:

```ts
// src/core/GameCatalog.ts
//
// The single declaration of what games this app contains. Before this existed, game identity
// was scattered: display labels and icons lived in two scene-local records inside
// LevelSelectScene, Flappy's entry was a third scene-local list (ExtraGameEntry), and no game
// had a description anywhere.
//
// Must stay free of Phaser and three.js imports so it can be unit tested — see
// docs/adr/0004-vitest-for-pure-logic.md. That is also why FLAPPY_LEVEL_ID lives here rather
// than in FlappyGameScene, which imports Phaser.

import type { MechanicType } from '@game-types/Level';

/**
 * Reserved ProgressService id for Flappy's endless best score. Not a real level: no unlock
 * chain, absent from LevelRegistry. See docs/adr/0001-flappy-endless-high-score.md.
 */
export const FLAPPY_LEVEL_ID = 2001;

interface CatalogEntryBase {
  /** Stable id. Used for seenHowTo bookkeeping, so changing one re-shows that intro. */
  key: string;
  titleKey: string;
  descriptionKey: string;
  howToPlayKey: string;
  /** Emoji today. A texture key can replace this without the screens changing shape. */
  icon: string;
  /** Set only where there is no 2D fallback, so the card must hide when 3D is down. */
  requires3D?: boolean;
}

/**
 * Two kinds of game, discriminated the way LevelData already is: those made of levels, and
 * those that are a scene of their own.
 */
export type CatalogEntry =
  | (CatalogEntryBase & { kind: 'LEVELS'; mechanic: MechanicType })
  | (CatalogEntryBase & { kind: 'ARCADE'; sceneKey: string; scoreLevelId: number });

export const GAME_CATALOG: readonly CatalogEntry[] = [
  {
    kind: 'LEVELS',
    key: 'MATCH_STICK',
    mechanic: 'MATCH_STICK',
    icon: '🔥',
    titleKey: 'game.matchstick.title',
    descriptionKey: 'game.matchstick.description',
    howToPlayKey: 'game.matchstick.howTo',
  },
  {
    kind: 'LEVELS',
    key: 'SOKOBAN',
    mechanic: 'SOKOBAN',
    icon: '📦',
    titleKey: 'game.sokoban.title',
    descriptionKey: 'game.sokoban.description',
    howToPlayKey: 'game.sokoban.howTo',
    // Renders through SokobanWorld when 3D is up, but SokobanRenderer is a working 2D
    // fallback, so this entry is NOT gated on it.
  },
  {
    kind: 'LEVELS',
    key: 'LOGIC_GRID',
    mechanic: 'LOGIC_GRID',
    icon: '🧩',
    titleKey: 'game.logicgrid.title',
    descriptionKey: 'game.logicgrid.description',
    howToPlayKey: 'game.logicgrid.howTo',
  },
  {
    kind: 'ARCADE',
    key: 'FLAPPY',
    sceneKey: 'FlappyGameScene',
    scoreLevelId: FLAPPY_LEVEL_ID,
    icon: '🐤',
    titleKey: 'game.flappy.title',
    descriptionKey: 'game.flappy.description',
    howToPlayKey: 'game.flappy.howTo',
    // No 2D fallback exists for Flappy — it is entirely a ThreeWorld.
    requires3D: true,
  },
];

/**
 * The catalog entry a mechanic belongs to, or undefined for the three dormant mechanics
 * (CLICK_OBJECT, DRAG_AND_DROP, DEVICE_SHAKE) which no level uses and no card advertises.
 */
export function catalogEntryForMechanic(mechanic: MechanicType): CatalogEntry | undefined {
  return GAME_CATALOG.find((entry) => entry.kind === 'LEVELS' && entry.mechanic === mechanic);
}

/** Callers pass ThreeHost.isReady; this module must not import ThreeHost (it pulls in three.js). */
export function availableGames(is3DReady: boolean): CatalogEntry[] {
  return GAME_CATALOG.filter((entry) => is3DReady || !entry.requires3D);
}
```

- [x] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/core/GameCatalog.test.ts`
Expected: PASS, 8 tests.

- [x] **Step 5: Move `FLAPPY_LEVEL_ID` out of `FlappyGameScene`**

In `src/games/flappy/FlappyGameScene.ts`, delete the declaration on line 29:

```ts
export const FLAPPY_LEVEL_ID = 2001;
```

and add to its imports:

```ts
import { FLAPPY_LEVEL_ID } from '@core/GameCatalog';
```

The two existing uses in that file (`ProgressService.getHighScore(FLAPPY_LEVEL_ID)` and
`ProgressService.completeLevel(FLAPPY_LEVEL_ID, this.state.score)`) stay exactly as they are.

`src/scenes/LevelSelectScene.ts:9` also imports `FLAPPY_LEVEL_ID` from `FlappyGameScene`. Leave
it broken-but-compiling by pointing it at the new home for now — Task 8 deletes that import
along with the whole Arcade section:

```ts
import { FLAPPY_LEVEL_ID } from '@core/GameCatalog';
```

- [x] **Step 6: Verify the build still type-checks**

Run: `npm run build`
Expected: succeeds. If it reports an unresolved `FLAPPY_LEVEL_ID`, a `from '@games/flappy/FlappyGameScene'` import was missed — grep for it: `grep -rn "FLAPPY_LEVEL_ID" src/`.

- [x] **Step 7: Commit**

```bash
git add src/core/GameCatalog.ts src/core/GameCatalog.test.ts src/games/flappy/FlappyGameScene.ts src/scenes/LevelSelectScene.ts
git commit -m "feat: add GameCatalog as the single declaration of available games"
```

---

### Task 3: GameProgress derivations

**Files:**

- Create: `src/core/GameProgress.ts`
- Test: `src/core/GameProgress.test.ts`

**Interfaces:**

- Consumes: `LevelData`, `MechanicType` from `@game-types/Level`; `LevelProgress` from `@core/ProgressService` (type-only, so no storage code is pulled in).
- Produces:
  - `type ProgressRecord = Record<number, LevelProgress>`
  - `interface GameProgress { total: number; solved: number; stars: number }`
  - `gameProgress(levels: LevelData[], mechanic: MechanicType, progress: ProgressRecord): GameProgress`
  - `isLevelUnlocked(levels: LevelData[], levelId: number, progress: ProgressRecord): boolean`
  - `levelDisplayNumber(levels: LevelData[], levelId: number): number | undefined`
  - `resolveContinueIndex(levels: LevelData[], lastPlayedLevelId: number | undefined, progress: ProgressRecord): number | undefined`

Every function takes its data as arguments. Nothing here reads `localStorage`, which is what
keeps the rules testable while `ProgressService` stays the storage boundary.

- [x] **Step 1: Write the failing test**

Create `src/core/GameProgress.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { LevelData, MechanicType } from '@game-types/Level';
import type { LevelProgress } from './ProgressService';
import {
  gameProgress,
  isLevelUnlocked,
  levelDisplayNumber,
  resolveContinueIndex,
  type ProgressRecord,
} from './GameProgress';

/** Minimal stand-in: these functions only ever read level_id and mechanic. */
function level(levelId: number, mechanic: MechanicType): LevelData {
  return { level_id: levelId, mechanic } as unknown as LevelData;
}

/** Mirrors the real flattened registry order: matchstick, then sokoban, then logic grid. */
const LEVELS: LevelData[] = [
  level(1, 'MATCH_STICK'),
  level(2, 'MATCH_STICK'),
  level(3, 'MATCH_STICK'),
  level(101, 'SOKOBAN'),
  level(102, 'SOKOBAN'),
  level(1001, 'LOGIC_GRID'),
];

function progress(entries: Array<[number, Partial<LevelProgress>]>): ProgressRecord {
  const record: ProgressRecord = {};
  for (const [levelId, partial] of entries) {
    record[levelId] = { levelId, isUnlocked: true, highScore: 0, ...partial };
  }
  return record;
}

describe('GameProgress: gameProgress', () => {
  it('counts only the levels of the requested game', () => {
    const result = gameProgress(LEVELS, 'MATCH_STICK', progress([]));
    expect(result.total).toBe(3);
  });

  it('treats a level as solved once it has a high score', () => {
    const result = gameProgress(
      LEVELS,
      'MATCH_STICK',
      progress([
        [1, { highScore: 3 }],
        [2, { highScore: 1 }],
      ]),
    );
    expect(result.solved).toBe(2);
    expect(result.stars).toBe(4);
  });

  it('does not count an unlocked-but-unsolved level as solved', () => {
    const result = gameProgress(LEVELS, 'SOKOBAN', progress([[101, { isUnlocked: true, highScore: 0 }]]));
    expect(result.solved).toBe(0);
    expect(result.stars).toBe(0);
  });

  it('ignores progress belonging to another game', () => {
    const result = gameProgress(LEVELS, 'SOKOBAN', progress([[1, { highScore: 3 }]]));
    expect(result).toEqual({ total: 2, solved: 0, stars: 0 });
  });

  it('reports zeroes for a mechanic with no levels rather than throwing', () => {
    expect(gameProgress(LEVELS, 'DEVICE_SHAKE', progress([]))).toEqual({ total: 0, solved: 0, stars: 0 });
  });
});

describe('GameProgress: isLevelUnlocked', () => {
  it('unlocks the first level of every game on an empty profile', () => {
    const empty = progress([]);
    expect(isLevelUnlocked(LEVELS, 1, empty)).toBe(true);
    expect(isLevelUnlocked(LEVELS, 101, empty)).toBe(true);
    expect(isLevelUnlocked(LEVELS, 1001, empty)).toBe(true);
  });

  it('keeps later levels locked until progress says otherwise', () => {
    expect(isLevelUnlocked(LEVELS, 102, progress([]))).toBe(false);
  });

  it('unlocks a later level once progress records it', () => {
    expect(isLevelUnlocked(LEVELS, 102, progress([[102, { isUnlocked: true }]]))).toBe(true);
  });

  it('respects an explicit locked flag on a later level', () => {
    expect(isLevelUnlocked(LEVELS, 102, progress([[102, { isUnlocked: false }]]))).toBe(false);
  });

  it('returns false for a level id that does not exist', () => {
    expect(isLevelUnlocked(LEVELS, 999, progress([]))).toBe(false);
  });
});

describe('GameProgress: levelDisplayNumber', () => {
  it('restarts numbering at 1 for each game', () => {
    expect(levelDisplayNumber(LEVELS, 1)).toBe(1);
    expect(levelDisplayNumber(LEVELS, 101)).toBe(1);
    expect(levelDisplayNumber(LEVELS, 1001)).toBe(1);
  });

  it('numbers within a game by position, not by level id', () => {
    expect(levelDisplayNumber(LEVELS, 102)).toBe(2);
  });

  it('returns undefined for an unknown level', () => {
    expect(levelDisplayNumber(LEVELS, 555)).toBeUndefined();
  });
});

describe('GameProgress: resolveContinueIndex', () => {
  it('resolves a valid unlocked level to its index in the flattened list', () => {
    expect(resolveContinueIndex(LEVELS, 101, progress([[101, { isUnlocked: true }]]))).toBe(3);
  });

  it('returns undefined on a fresh install with nothing played', () => {
    expect(resolveContinueIndex(LEVELS, undefined, progress([]))).toBeUndefined();
  });

  it('returns undefined when the stored level no longer exists', () => {
    expect(resolveContinueIndex(LEVELS, 4242, progress([]))).toBeUndefined();
  });

  it('returns undefined when the stored level is locked, rather than offering an unplayable level', () => {
    expect(resolveContinueIndex(LEVELS, 102, progress([[102, { isUnlocked: false }]]))).toBeUndefined();
  });

  it('still resolves a first-of-game level with no stored progress at all', () => {
    expect(resolveContinueIndex(LEVELS, 1001, progress([]))).toBe(5);
  });
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/core/GameProgress.test.ts`
Expected: FAIL — cannot resolve `./GameProgress`.

- [x] **Step 3: Write the implementation**

Create `src/core/GameProgress.ts`:

```ts
// src/core/GameProgress.ts
//
// Progress maths, derived on read and never stored. Every function takes the level list and the
// progress record as arguments rather than reading storage, which is what keeps these rules
// unit testable while ProgressService stays the localStorage boundary.

import type { LevelData, MechanicType } from '@game-types/Level';
import type { LevelProgress } from './ProgressService';

export type ProgressRecord = Record<number, LevelProgress>;

export interface GameProgress {
  /** Levels this game contains. */
  total: number;
  /** Levels won at least once. */
  solved: number;
  /** Stars earned across the game. PlayScene passes stars as completeLevel's score argument, so
   *  a level's highScore IS its star count. */
  stars: number;
}

function levelsOf(levels: LevelData[], mechanic: MechanicType): LevelData[] {
  return levels.filter((lvl) => lvl.mechanic === mechanic);
}

export function gameProgress(levels: LevelData[], mechanic: MechanicType, progress: ProgressRecord): GameProgress {
  const own = levelsOf(levels, mechanic);
  let solved = 0;
  let stars = 0;

  for (const lvl of own) {
    const highScore = progress[lvl.level_id]?.highScore ?? 0;
    if (highScore > 0) {
      solved += 1;
      stars += highScore;
    }
  }

  return { total: own.length, solved, stars };
}

/**
 * Whether a level is playable.
 *
 * The first level of each game is always playable, which is load-bearing rather than cosmetic:
 * ProgressService seeds only level id 1, so without this clause Sokoban's 101 and Logic Grid's
 * 1001 would both read as locked on a fresh profile and neither game could be started. This
 * rule used to live inline in LevelSelectScene; it moved here so GamesScene and
 * LevelSelectScene cannot disagree about what is playable.
 */
export function isLevelUnlocked(levels: LevelData[], levelId: number, progress: ProgressRecord): boolean {
  const target = levels.find((lvl) => lvl.level_id === levelId);
  if (!target) return false;

  const isFirstOfItsGame = levelsOf(levels, target.mechanic)[0]?.level_id === levelId;
  if (isFirstOfItsGame) return true;

  return progress[levelId]?.isUnlocked ?? false;
}

/** The number shown to the player: position within its own game, from 1. */
export function levelDisplayNumber(levels: LevelData[], levelId: number): number | undefined {
  const target = levels.find((lvl) => lvl.level_id === levelId);
  if (!target) return undefined;

  const index = levelsOf(levels, target.mechanic).findIndex((lvl) => lvl.level_id === levelId);
  return index === -1 ? undefined : index + 1;
}

/**
 * Index into the flattened level list for the Continue action, or undefined when there is
 * nothing safe to resume. Every failure mode collapses to undefined so the caller simply omits
 * the Continue card: no stored id, an id that no longer exists (levels were edited between
 * releases), or an id that is now locked.
 */
export function resolveContinueIndex(
  levels: LevelData[],
  lastPlayedLevelId: number | undefined,
  progress: ProgressRecord,
): number | undefined {
  if (lastPlayedLevelId === undefined) return undefined;

  const index = levels.findIndex((lvl) => lvl.level_id === lastPlayedLevelId);
  if (index === -1) return undefined;
  if (!isLevelUnlocked(levels, lastPlayedLevelId, progress)) return undefined;

  return index;
}
```

- [x] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/core/GameProgress.test.ts`
Expected: PASS, 18 tests.

- [x] **Step 5: Run the whole suite to confirm nothing regressed**

Run: `npm test`
Expected: PASS — the new files plus the existing `FlappySim` and `generate-sfx` suites.

- [x] **Step 6: Commit**

```bash
git add src/core/GameProgress.ts src/core/GameProgress.test.ts
git commit -m "feat: add pure progress derivations and lift the unlock rule out of LevelSelectScene"
```

---

### Task 4: Extend SettingsService

**Files:**

- Modify: `src/core/SettingsService.ts`

**Interfaces:**

- Consumes: nothing.
- Produces, in addition to the existing `isSoundMuted()` / `setSoundMuted(muted)`:

  - `isHapticsEnabled(): boolean` / `setHapticsEnabled(enabled: boolean): void`
  - `getLanguage(): string` / `setLanguage(language: string): void`
  - `hasSeenHowTo(gameKey: string): boolean` / `markHowToSeen(gameKey: string): void`

- [x] **Step 1: Replace the file contents**

The existing `getSettings()` returns a bare `{ soundMuted: false }` and `JSON.parse`s straight
into `Settings`, so a blob written by the current version would leave the three new fields
`undefined`. Spreading over defaults fixes that without a migration step, since every new field
is additive.

Write `src/core/SettingsService.ts`:

```ts
// src/core/SettingsService.ts

export interface Settings {
  soundMuted: boolean;
  hapticsEnabled: boolean;
  /** Locale code. Kept as a plain string: this module must not depend on the i18n module. */
  language: string;
  /** Catalog keys whose how-to-play panel has been shown once already. */
  seenHowTo: string[];
}

const DEFAULTS: Settings = {
  soundMuted: false,
  hapticsEnabled: true,
  language: 'en',
  seenHowTo: [],
};

/**
 * A global player preference, distinct from ProgressService: that store is keyed by level id
 * (Record<number, LevelProgress>), and a preference like mute has no place inside it.
 */
export class SettingsService {
  private static readonly STORAGE_KEY = 'brain_puzzle_settings';

  private static getSettings(): Settings {
    try {
      const data = localStorage.getItem(this.STORAGE_KEY);
      if (data) {
        // Spread over defaults rather than trusting the parsed blob: a store written by an
        // earlier version has only soundMuted, and every field added since must still read
        // back as its default instead of undefined.
        return { ...DEFAULTS, ...(JSON.parse(data) as Partial<Settings>) };
      }
    } catch (e) {
      console.error('Could not read settings from localStorage', e);
    }

    return { ...DEFAULTS };
  }

  private static saveSettings(settings: Settings): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(settings));
    } catch (e) {
      console.error('Could not write settings to localStorage', e);
    }
  }

  private static update<K extends keyof Settings>(key: K, value: Settings[K]): void {
    const settings = this.getSettings();
    settings[key] = value;
    this.saveSettings(settings);
  }

  public static isSoundMuted(): boolean {
    return this.getSettings().soundMuted;
  }

  public static setSoundMuted(muted: boolean): void {
    this.update('soundMuted', muted);
  }

  public static isHapticsEnabled(): boolean {
    return this.getSettings().hapticsEnabled;
  }

  public static setHapticsEnabled(enabled: boolean): void {
    this.update('hapticsEnabled', enabled);
  }

  public static getLanguage(): string {
    return this.getSettings().language;
  }

  public static setLanguage(language: string): void {
    this.update('language', language);
  }

  public static hasSeenHowTo(gameKey: string): boolean {
    return this.getSettings().seenHowTo.includes(gameKey);
  }

  public static markHowToSeen(gameKey: string): void {
    const settings = this.getSettings();
    if (settings.seenHowTo.includes(gameKey)) return;
    settings.seenHowTo = [...settings.seenHowTo, gameKey];
    this.saveSettings(settings);
  }
}
```

- [x] **Step 2: Verify the build and lint**

Run: `npm run build && npm run lint`
Expected: both succeed. `AudioService` already calls `isSoundMuted`/`setSoundMuted`, whose
signatures are unchanged.

- [x] **Step 3: Verify the existing mute toggle still round-trips**

Run `npm run dev`, open the game, tap the mute button on the menu, reload the page.
Expected: the button still shows 🔇 after the reload — the widened blob did not break the
existing preference.

- [x] **Step 4: Commit**

```bash
git add src/core/SettingsService.ts
git commit -m "feat: add haptics, language and seenHowTo settings"
```

---

### Task 5: Record and expose the last played level

**Files:**

- Modify: `src/core/ProgressService.ts`
- Modify: `src/scenes/PlayScene.ts:227` (inside `loadLevel`)

**Interfaces:**

- Consumes: nothing from earlier tasks.
- Produces:
  - `ProgressService.getLastPlayedLevelId(): number | undefined`
  - `ProgressService.setLastPlayedLevelId(levelId: number): void`

`lastPlayedLevelId` gets its own localStorage key rather than being wedged into the
`Record<number, LevelProgress>` blob, which has no room for a scalar. `resetAllProgress()` must
clear both.

Note there is deliberately **no** `ProgressService` wrapper around `GameProgress.isLevelUnlocked`.
Every caller (`GamesScene`, `LevelSelectScene`, `MenuScene`) already holds the level list, so
they call the pure function directly with `ProgressService.getProgress()`. A wrapper would be an
unused export. The existing `isLevelUnlocked(levelId)` method stays for now — nothing new should
call it, because it knows only about level id 1 and reports the first Sokoban and Logic Grid
levels as locked on a fresh profile.

- [x] **Step 1: Add the new members to `ProgressService`**

In `src/core/ProgressService.ts`, add a second storage key next to the existing one:

```ts
  private static readonly STORAGE_KEY = 'matchstick_game_progress';
  // Separate key: the main store is Record<number, LevelProgress> and has no place for a
  // scalar. Cleared by resetAllProgress() along with the record.
  private static readonly LAST_PLAYED_KEY = 'brain_puzzle_last_played';
```

Add these methods to the class:

```ts
  /** The level the player most recently opened, or undefined if they never have. */
  public static getLastPlayedLevelId(): number | undefined {
    try {
      const raw = localStorage.getItem(this.LAST_PLAYED_KEY);
      if (raw === null) return undefined;
      const parsed = Number(raw);
      return Number.isFinite(parsed) ? parsed : undefined;
    } catch (e) {
      console.error('Could not read last played level from localStorage', e);
      return undefined;
    }
  }

  public static setLastPlayedLevelId(levelId: number): void {
    try {
      localStorage.setItem(this.LAST_PLAYED_KEY, String(levelId));
    } catch (e) {
      console.error('Could not write last played level to localStorage', e);
    }
  }
```

- [x] **Step 2: Clear the new key on reset**

Replace `resetAllProgress()` in the same file:

```ts
  /**
   * Xóa toàn bộ tiến trình (Dùng cho tính năng Reset Game)
   */
  public static resetAllProgress(): void {
    localStorage.removeItem(this.STORAGE_KEY);
    // Leaving this behind would make Continue offer a level from an erased profile.
    localStorage.removeItem(this.LAST_PLAYED_KEY);
  }
```

- [x] **Step 3: Record the level when `PlayScene` opens one**

In `src/scenes/PlayScene.ts`, inside `loadLevel`, immediately after `const rawLevel = this.allLevels[index];` (line 227) add:

```ts
// Powers the menu's Continue card. Written on open rather than on win, so resuming lands
// on the level the player actually left, including one they were still working on.
ProgressService.setLastPlayedLevelId(rawLevel.level_id);
```

`PlayScene` already imports `ProgressService` (it calls `completeLevel` in `handleWinLevel`). If
`grep -n "ProgressService" src/scenes/PlayScene.ts` shows no import, add
`import { ProgressService } from '@core/ProgressService';`.

- [x] **Step 4: Verify build, lint, and tests**

Run: `npm run build && npm run lint && npm test`
Expected: all pass.

- [x] **Step 5: Verify the value is actually written**

Run `npm run dev`, play into any level, then in the browser console:

```js
localStorage.getItem('brain_puzzle_last_played');
```

Expected: the `level_id` of the level on screen (e.g. `"1"` for the first matchstick level,
`"101"` for the first Sokoban level).

- [x] **Step 6: Commit**

```bash
git add src/core/ProgressService.ts src/scenes/PlayScene.ts
git commit -m "feat: record the last played level and expose the shared unlock rule"
```

---

### Task 6: HapticsService

**Files:**

- Create: `src/core/HapticsService.ts`
- Modify: `src/ui/GameButton.ts`
- Modify: `package.json` (dependency)

**Interfaces:**

- Consumes: `SettingsService.isHapticsEnabled` / `setHapticsEnabled` (Task 4).
- Produces:
  - `HapticsService.init(): void`
  - `HapticsService.isEnabled(): boolean` / `setEnabled(enabled: boolean): void`
  - `HapticsService.tap(): void`, `.success(): void`, `.error(): void`
  - `ButtonOptions.haptic?: boolean` on `createButton` (defaults to `true`)

Shaped deliberately like `AudioService`: one entry point, its own authoritative in-memory flag,
persisted through `SettingsService`, initialised once at boot.

- [x] **Step 1: Install the dependency**

```bash
npm install @capacitor/haptics@^8.0.0
```

Expected: `@capacitor/haptics` appears under `dependencies` in `package.json`. It ships a web
implementation backed by `navigator.vibrate`, so no separate web fallback is needed — but every
call still needs its promise rejection swallowed, because the web implementation throws
`Unimplemented` on browsers without vibrate support (notably iOS Safari).

- [x] **Step 2: Write the service**

Create `src/core/HapticsService.ts`:

```ts
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
```

- [x] **Step 3: Wire haptics into `createButton`**

In `src/ui/GameButton.ts`, add the import:

```ts
import { HapticsService } from '@core/HapticsService';
```

Add to `ButtonOptions`, after the `sfx` field:

```ts
  /** Light haptic knock on press. Defaults to true; pass false for a button that fires many
   *  times in a row (e.g. a D-pad) where a buzz per press becomes noise. */
  haptic?: boolean;
```

Change the `pointerdown` handler from:

```ts
container.on('pointerdown', () => setPressed(true));
```

to:

```ts
container.on('pointerdown', () => {
  setPressed(true);
  // On press, not on release: the point of a haptic is immediate acknowledgement of the
  // touch, while the sound below deliberately fires on pointerup with the action.
  if (opts.haptic !== false) HapticsService.tap();
});
```

- [x] **Step 4: Buzz on win, lose and crash**

A tap-only haptic misses the moments that matter most. Add `HapticsService` alongside the three
existing sound calls, so the feedback stays in one place per outcome:

In `src/scenes/PlayScene.ts`, add `import { HapticsService } from '@core/HapticsService';`, then
at line 327:

```ts
AudioService.play('WIN');
HapticsService.success();
```

and at line 361:

```ts
AudioService.play('LOSE');
HapticsService.error();
```

In `src/games/flappy/FlappyGameScene.ts`, add the same import, then at line 112:

```ts
AudioService.play('CRASH');
HapticsService.error();
```

- [x] **Step 5: Initialise it at boot**

In `src/main.ts`, add the import:

```ts
import { HapticsService } from '@core/HapticsService';
```

and extend the READY handler:

```ts
game.events.once(Phaser.Core.Events.READY, () => {
  ThreeHost.bindGame(game);
  AudioService.bindGame(game);
  HapticsService.init();
});
```

- [x] **Step 6: Verify build, lint and sync**

Run: `npm run build && npm run lint`
Expected: both pass.

Run: `npx cap sync android`
Expected: succeeds and lists `@capacitor/haptics` among the found plugins.

- [x] **Step 7: Verify no console noise in the browser**

Run `npm run dev` and tap several buttons.
Expected: buttons behave exactly as before, with **no** unhandled promise rejections in the
console. On a browser that supports `navigator.vibrate` (Chrome on Android) taps buzz; on
desktop nothing happens, which is correct.

- [x] **Step 8: Commit**

```bash
git add package.json package-lock.json src/core/HapticsService.ts src/ui/GameButton.ts src/main.ts src/scenes/PlayScene.ts src/games/flappy/FlappyGameScene.ts
git commit -m "feat: add HapticsService and buzz on press, win, lose and crash"
```

---

### Task 7: Panel component

**Files:**

- Create: `src/ui/Panel.ts`

**Interfaces:**

- Consumes: `createButton` / `ButtonVariant` from `@ui/GameButton`; `GAME_DEPTHS`; `ui`/`uiFont`; `t` from `@core/i18n`.
- Produces:
  - `interface PanelAction { label: string; variant?: ButtonVariant; onClick: () => void }`
  - `interface PanelOptions { title: string; body: string; actions?: PanelAction[]; closeLabel?: string; onClose?: () => void }`
  - `createPanel(scene: Phaser.Scene, opts: PanelOptions): Phaser.GameObjects.Container`

Returns a container that destroys itself when closed. The backdrop is interactive so it swallows
taps meant for the screen behind it.

- [x] **Step 1: Write the component**

Create `src/ui/Panel.ts`:

```ts
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

  const close = () => {
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
```

- [x] **Step 2: Verify build and lint**

Run: `npm run build && npm run lint`
Expected: both pass. If `GameColors.Hex.GRAY_DARK` or `GameColors.UI.TAB_ACTIVE_BG` does not
exist, run `grep -n "GRAY_DARK\|TAB_ACTIVE_BG" src/ui/GameColor.ts` and substitute the nearest
equivalent token rather than adding a raw hex literal.

- [x] **Step 3: Commit**

```bash
git add src/ui/Panel.ts
git commit -m "feat: add reusable modal Panel component"
```

The component gets exercised for the first time in Task 8; there is nothing to click yet.

---

### Task 8: GamesScene, and reduce LevelSelectScene

**Files:**

- Create: `src/scenes/GamesScene.ts`
- Modify: `src/scenes/LevelSelectScene.ts` (large reduction)
- Modify: `src/main.ts` (register `GamesScene`)

**Interfaces:**

- Consumes: `availableGames` and `CatalogEntry` in `GamesScene`, `catalogEntryForMechanic` in `LevelSelectScene` (Task 2); `gameProgress` in `GamesScene`, `isLevelUnlocked` and `levelDisplayNumber` in `LevelSelectScene` (Task 3); `createPanel` (Task 7); `t` (Task 1); `SettingsService.hasSeenHowTo` / `markHowToSeen` (Task 4).
- Produces: scene key `'GamesScene'`; `LevelSelectScene` now accepts `{ mechanic: MechanicType }` as scene data.

These ship together: stripping the Arcade section removes the only route to Flappy, so the
replacement has to exist in the same change.

- [x] **Step 1: Write `GamesScene`**

Create `src/scenes/GamesScene.ts`:

```ts
import * as Phaser from 'phaser';
import { GameConfig, ui, uiFont } from '@core/GameConfig';
import { GameColors } from '@ui/GameColor';
import { createButton } from '@ui/GameButton';
import { createPanel } from '@ui/Panel';
import { createMuteButton } from '@ui/MuteButton';
import { availableGames, type CatalogEntry } from '@core/GameCatalog';
import { gameProgress } from '@core/GameProgress';
import { GAME_DEPTHS } from '@core/GameDepths';
import { LevelRegistry } from '@levels/LevelRegistry';
import { ProgressService } from '@core/ProgressService';
import { SettingsService } from '@core/SettingsService';
import { AudioService } from '@core/AudioService';
import { ThreeHost } from '@three/ThreeHost';
import { t } from '@core/i18n';

const CARD_HEIGHT = 116;
const CARD_GAP = 12;
const SIDE_MARGIN = 16;
const HEADER_HEIGHT = 64;

/**
 * The game picker. Replaces the mechanic tab row that used to live in LevelSelectScene, and is
 * the home Flappy previously lacked — it is an ordinary catalog entry here rather than the
 * scene-local ExtraGameEntry special case documented in ADR 0005.
 */
export class GamesScene extends Phaser.Scene {
  private isDragging = false;
  private dragStartY = 0;
  private dragStartScrollY = 0;
  private maxScrollHeight = 0;

  constructor() {
    super('GamesScene');
  }

  create() {
    this.cameras.main.setBackgroundColor(GameConfig.backgroundColor);
    this.drawBackground();

    const entries = availableGames(ThreeHost.isReady);
    let cursorY = ui(HEADER_HEIGHT);

    for (const entry of entries) {
      this.renderCard(entry, cursorY);
      cursorY += ui(CARD_HEIGHT + CARD_GAP);
    }

    this.drawHeader();
    this.setupScrolling(cursorY);
    this.maybeAutoShowHowTo(entries);
  }

  private drawBackground() {
    const { width, height } = this.cameras.main;
    const gradient = this.add.graphics();
    gradient.fillGradientStyle(0x8e44ad, 0x8e44ad, GameConfig.backgroundColor, GameConfig.backgroundColor, 1);
    gradient.fillRect(0, 0, width, height);
    gradient.setScrollFactor(0);
  }

  /** Fixed header drawn last so it paints over cards scrolling underneath it. */
  private drawHeader() {
    const bar = this.add.graphics();
    bar.fillStyle(0x1a1a1a, 0.95);
    bar.fillRect(0, 0, this.cameras.main.width, ui(HEADER_HEIGHT) - ui(12));
    bar.setScrollFactor(0);
    // Above the cards scrolling under it, but below UI_PANEL so the how-to modal covers it.
    bar.setDepth(GAME_DEPTHS.UI_BACKGROUND);

    const backBtn = createButton(this, {
      x: ui(SIDE_MARGIN),
      y: ui(14),
      label: t('common.back'),
      sfx: 'SCENE_SWISH',
      onClick: () => this.scene.start('MenuScene'),
    });
    backBtn.setScrollFactor(0);
    backBtn.setDepth(GAME_DEPTHS.UI_BACKGROUND + 1);

    const mute = createMuteButton(this, { x: this.cameras.main.width - ui(30), y: ui(30) });
    mute.setScrollFactor(0);
    mute.setDepth(GAME_DEPTHS.UI_BACKGROUND + 1);
  }

  private renderCard(entry: CatalogEntry, top: number) {
    const { width } = this.cameras.main;
    const cardWidth = width - ui(SIDE_MARGIN) * 2;
    const left = ui(SIDE_MARGIN);
    const height = ui(CARD_HEIGHT);

    const box = this.add.graphics();
    box.fillStyle(GameColors.Hex.GRAY_DARK, 0.92);
    box.fillRoundedRect(left, top, cardWidth, height, ui(14));

    // The card body is its own hit area rather than a createButton, so the "?" button can sit
    // inside it without the two competing for the same tap.
    const hit = this.add.zone(left, top, cardWidth, height).setOrigin(0, 0).setInteractive({ useHandCursor: true });
    hit.on('pointerdown', () => {
      this.isDragging = true;
      this.dragStartY = this.input.activePointer.y;
      this.dragStartScrollY = this.cameras.main.scrollY;
    });
    hit.on('pointerup', () => {
      const pointer = this.input.activePointer;
      const dragged = Phaser.Math.Distance.Between(pointer.downX, pointer.downY, pointer.upX, pointer.upY);
      if (dragged > 10) return;
      AudioService.play('SCENE_SWISH');
      this.openGame(entry);
    });

    this.add
      .text(left + ui(16), top + height / 2, entry.icon, {
        fontFamily: GameConfig.fonts.default,
        fontSize: uiFont(40),
      })
      .setOrigin(0, 0.5);

    const textLeft = left + ui(72);
    const textWidth = cardWidth - ui(72) - ui(56);

    this.add.text(textLeft, top + ui(16), t(entry.titleKey), {
      fontFamily: GameConfig.fonts.default,
      fontSize: uiFont(19),
      fontStyle: 'bold',
      color: GameConfig.colors.text,
    });

    this.add.text(textLeft, top + ui(42), t(entry.descriptionKey), {
      fontFamily: GameConfig.fonts.default,
      fontSize: uiFont(13),
      color: '#cccccc',
      wordWrap: { width: textWidth },
    });

    this.add.text(textLeft, top + height - ui(26), this.progressLine(entry), {
      fontFamily: GameConfig.fonts.default,
      fontSize: uiFont(13),
      color: '#00FF66',
    });

    const help = createButton(this, {
      x: left + cardWidth - ui(34),
      y: top + ui(20),
      label: '?',
      variant: 'secondary',
      origin: 0.5,
      minWidth: 34,
      minHeight: 34,
      onClick: () => this.showHowTo(entry),
    });
    help.setDepth(1);
  }

  /** "12/60 solved · ★34" for a level game, "Best: 27" for an arcade one. */
  private progressLine(entry: CatalogEntry): string {
    if (entry.kind === 'ARCADE') {
      const best = ProgressService.getHighScore(entry.scoreLevelId);
      return best > 0 ? `${t('games.best')}: ${best}` : t('games.notStarted');
    }

    const progress = gameProgress(LevelRegistry.getAllLevels(), entry.mechanic, ProgressService.getProgress());
    if (progress.solved === 0) return t('games.notStarted');
    return `${progress.solved}/${progress.total} ${t('games.solved')} · ★${progress.stars}`;
  }

  private openGame(entry: CatalogEntry) {
    if (entry.kind === 'ARCADE') {
      this.scene.start(entry.sceneKey);
      return;
    }
    this.scene.start('LevelSelectScene', { mechanic: entry.mechanic });
  }

  private showHowTo(entry: CatalogEntry) {
    SettingsService.markHowToSeen(entry.key);
    createPanel(this, {
      title: `${entry.icon}  ${t(entry.titleKey)}`,
      body: t(entry.howToPlayKey),
      closeLabel: t('common.close'),
    });
  }

  /**
   * Shows one game's rules unprompted the first time it is seen. A "?" button alone does not
   * help a player who does not yet know they are confused, which is the whole problem with
   * Logic Grid — a deduction puzzle is not discoverable by tapping at it.
   *
   * Only ever one panel per visit, and only for a game with no progress at all.
   */
  private maybeAutoShowHowTo(entries: CatalogEntry[]) {
    const unseen = entries.find((entry) => !SettingsService.hasSeenHowTo(entry.key));
    if (!unseen) return;
    if (this.hasAnyProgress(unseen)) {
      SettingsService.markHowToSeen(unseen.key);
      return;
    }
    this.showHowTo(unseen);
  }

  private hasAnyProgress(entry: CatalogEntry): boolean {
    if (entry.kind === 'ARCADE') return ProgressService.getHighScore(entry.scoreLevelId) > 0;
    return gameProgress(LevelRegistry.getAllLevels(), entry.mechanic, ProgressService.getProgress()).solved > 0;
  }

  private setupScrolling(contentBottom: number) {
    this.maxScrollHeight = Math.max(this.cameras.main.height, contentBottom + ui(24));
    this.cameras.main.setBounds(0, 0, this.cameras.main.width, this.maxScrollHeight);

    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, deltaY: number) => {
      this.cameras.main.scrollY += deltaY * 0.8;
      this.clampCameraScroll();
    });

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!this.isDragging) return;
      this.cameras.main.scrollY = this.dragStartScrollY - (pointer.y - this.dragStartY);
      this.clampCameraScroll();
    });

    this.input.on('pointerup', () => (this.isDragging = false));
    this.input.on('pointerout', () => (this.isDragging = false));
  }

  private clampCameraScroll() {
    const maxScrollY = Math.max(0, this.maxScrollHeight - this.cameras.main.height);
    this.cameras.main.scrollY = Phaser.Math.Clamp(this.cameras.main.scrollY, 0, maxScrollY);
  }
}
```

- [x] **Step 2: Register the scene**

In `src/main.ts` add the import and extend the scene array:

```ts
import { GamesScene } from './scenes/GamesScene';
```

```ts
  scene: [LoadingScene, MenuScene, GamesScene, LevelSelectScene, PlayScene, FlappyGameScene],
```

- [x] **Step 3: Reduce `LevelSelectScene` — delete the dead concepts**

In `src/scenes/LevelSelectScene.ts`, delete outright:

- The `MECHANIC_LABELS` record (lines 13-21) and `MECHANIC_ICONS` record (lines 23-30).
- The `ExtraGameEntry` interface with its doc comment (lines 32-49) and the `EXTRA_GAMES` array (lines 51-53).
- The `availableExtraGames()` method (lines 161-164) and `tabLabel()` (lines 166-168).
- The entire `buildMechanicTabs()` method (lines 170-235).
- The whole Arcade block inside `renderLevelTiles()` (lines 377-450), from the `// Extra (non-level) games` comment through the closing brace of `if (extraGames.length > 0) { ... }`.
- The `currentMechanic` field (line 60), `categoryTabs` (line 62), and `tabRowHeight` (line 90).

Then delete the now-unused imports — `ThreeHost` and `FLAPPY_LEVEL_ID` — or `npm run build`
fails on `noUnusedLocals`.

- [x] **Step 4: Accept the mechanic as scene data**

Add near the top of the class, replacing the deleted `currentMechanic`:

```ts
  private mechanic!: MechanicType;
  private entry?: CatalogEntry;
```

Add an `init` before `create()`:

```ts
  init(data?: { mechanic?: MechanicType }) {
    // Always entered for one game, from GamesScene. Matchsticks is the fallback for a direct
    // scene.start with no data (e.g. a stale bookmark in the browser dev tools).
    this.mechanic = data?.mechanic ?? 'MATCH_STICK';
    this.entry = catalogEntryForMechanic(this.mechanic);
  }
```

Add these imports:

```ts
import { catalogEntryForMechanic, type CatalogEntry } from '@core/GameCatalog';
import { isLevelUnlocked, levelDisplayNumber } from '@core/GameProgress';
import { t } from '@core/i18n';
```

- [x] **Step 5: Replace the tab machinery with a fixed title**

Replace `topBarHeight`, `rebuild` and `drawTopBar` with versions that no longer take a tab-row
count:

```ts
  /** Fixed-height top bar: no tab rows to grow for any more. */
  private topBarHeight() {
    return ui(92);
  }

  private drawTopBar() {
    this.topBar?.destroy();
    const bar = this.add.graphics();
    bar.fillStyle(0x1a1a1a, 0.95);
    bar.fillRect(0, 0, this.cameras.main.width, this.topBarHeight());
    bar.setScrollFactor(0);
    bar.setDepth(100);
    this.topBar = bar;

    // The tab row used to tell the player which game they were in. It is gone, so say so.
    const title = this.add.text(this.sideMargin, ui(54), this.gameTitle(), {
      fontFamily: GameConfig.fonts.default,
      fontSize: uiFont(20),
      fontStyle: 'bold',
      color: GameConfig.colors.title,
    });
    title.setScrollFactor(0);
    title.setDepth(101);
    this.uiGroup.add(title);
  }

  private gameTitle(): string {
    return this.entry ? `${this.entry.icon}  ${t(this.entry.titleKey)}` : this.mechanic;
  }

  private rebuild() {
    this.drawTopBar();
    this.layoutGrid();
    this.renderLevelTiles();
  }
```

Change `layoutGrid` to drop its parameter — its last line becomes
`this.startY = this.topBarHeight() + ui(34);` and the signature becomes `private layoutGrid()`.

Change the Back button in `create()` to return to the game picker:

```ts
const backBtn = createButton(this, {
  x: 20,
  y: 20,
  label: t('common.back'),
  sfx: 'SCENE_SWISH',
  onClick: () => this.scene.start('GamesScene'),
});
```

- [x] **Step 6: Filter to one game and use the shared rules**

In `renderLevelTiles()`, replace the filter (lines 249-251) with:

```ts
const filtered = this.levels.map((lvl, idx) => ({ lvl, idx })).filter(({ lvl }) => lvl.mechanic === this.mechanic);
```

Then replace the inline numbering and unlock block (lines 287-305) with calls to the shared
functions, so this scene and `GamesScene` cannot disagree:

```ts
// Numbering restarts at 1 per game, and the first level of each game is always
// playable — both rules now live in GameProgress so GamesScene agrees with this screen.
const displayId = levelDisplayNumber(this.levels, lvl.level_id) ?? 1;
const isUnlocked = isLevelUnlocked(this.levels, lvl.level_id, ProgressService.getProgress());
const highScore = ProgressService.getHighScore(lvl.level_id);
const bestMoves = lvl.mechanic === 'SOKOBAN' ? ProgressService.getBestMoves(lvl.level_id) : undefined;

const icon = this.entry?.icon ?? '❓';
```

- [x] **Step 7: Verify build and lint**

Run: `npm run build && npm run lint`
Expected: both pass. Any `noUnusedLocals` error names an import or field left behind by Steps 3-6
— delete it.

- [x] **Step 8: Verify by playing**

Run `npm run dev` and check each of these:

1. Menu → (Games button does not exist yet; open the scene directly from the console: `game.scene.start('GamesScene')`, or wait for Task 9). Four cards render: Matchsticks, Sokoban, Logic Grid, Flappy.
2. The first card's how-to panel appears unprompted on a fresh profile (`localStorage.clear()` then reload). Closing it and revisiting the screen does not show it again.
3. Tapping `?` on any card opens that game's rules.
4. Tapping a puzzle card opens level select showing **only** that game's levels, with a title naming the game, numbering starting at 1, and no tab row.
5. Level select's Back returns to the games list.
6. Tapping the Flappy card starts Flappy directly.
7. Dragging the games list scrolls it without opening a card.
8. Progress lines read `Not started` on a fresh profile, and `1/60 solved · ★3` after winning one matchstick level.

- [x] **Step 9: Commit**

```bash
git add src/scenes/GamesScene.ts src/scenes/LevelSelectScene.ts src/main.ts
git commit -m "feat: add GamesScene and reduce LevelSelectScene to a single game"
```

---

### Task 9: MenuScene rewrite with Continue

**Files:**

- Modify: `src/scenes/MenuScene.ts`
- Modify: `src/main.ts` (set the locale before the game boots)

**Interfaces:**

- Consumes: `resolveContinueIndex`, `levelDisplayNumber` (Task 3); `catalogEntryForMechanic` (Task 2); `ProgressService.getLastPlayedLevelId` (Task 5); `t`, `setLocale` (Task 1).
- Produces: nothing new; `GamesScene`, `SettingsScene` and `AboutScene` are reached from here. `SettingsScene`/`AboutScene` arrive in Tasks 10-11, so their buttons are wired now and will 404 until then — Phaser logs a warning for an unknown scene key rather than crashing.

- [x] **Step 1: Set the locale before any scene is created**

In `src/main.ts`, add these imports:

```ts
import { SettingsService } from '@core/SettingsService';
import { setLocale } from '@core/i18n';
```

and immediately before `const game = new Phaser.Game(config);`:

```ts
// Before any scene builds text: scenes read strings during create(), so a locale applied after
// construction would leave the first screen in the wrong language until it was rebuilt.
setLocale(SettingsService.getLanguage());
```

- [x] **Step 2: Rewrite `create()` in `MenuScene`**

Replace the two `createButton` calls and their `animateButtonIn` calls (lines 50-70) with a
Continue card plus the three destinations. Keep `drawBackground`, `spawnFloatingShapes`,
`animateFloatingShape`, `animateButtonIn` and the title tween exactly as they are.

New imports for the file:

```ts
import { ProgressService } from '@core/ProgressService';
import { LevelRegistry } from '@levels/LevelRegistry';
import { catalogEntryForMechanic } from '@core/GameCatalog';
import { levelDisplayNumber, resolveContinueIndex } from '@core/GameProgress';
import { t } from '@core/i18n';
```

Replace the title text `'Brain Puzzle Game'` with `t('menu.title')`, then replace the button
block with:

```ts
// Continue first, and only when there is something safe to resume — see
// resolveContinueIndex for every case that collapses to "no card".
const levels = LevelRegistry.getAllLevels();
const lastPlayedId = ProgressService.getLastPlayedLevelId();
const continueIndex = resolveContinueIndex(levels, lastPlayedId, ProgressService.getProgress());

let cursorY = cy - ui(10);
let delay = 300;

if (continueIndex !== undefined) {
  const level = levels[continueIndex];
  const entry = catalogEntryForMechanic(level.mechanic);
  const displayNumber = levelDisplayNumber(levels, level.level_id) ?? 1;
  const gameTitle = entry ? t(entry.titleKey) : level.mechanic;

  const continueBtn = createButton(this, {
    x: cx,
    y: cursorY,
    // Two lines rather than an interpolated sentence: no format-string machinery, and word
    // order cannot come out wrong in another language.
    label: `${t('menu.continue')}\n${entry?.icon ?? ''} ${gameTitle} · ${t('common.level')} ${displayNumber}`,
    variant: 'success',
    origin: 0.5,
    minWidth: 240,
    paddingV: 12,
    sfx: 'SCENE_SWISH',
    onClick: () => this.scene.start('PlayScene', { levelIndex: continueIndex }),
  });
  this.animateButtonIn(continueBtn, delay);
  cursorY += ui(76);
  delay += 100;
}

for (const item of [
  { label: t('menu.games'), scene: 'GamesScene' },
  { label: t('menu.settings'), scene: 'SettingsScene' },
  { label: t('menu.about'), scene: 'AboutScene' },
]) {
  const button = createButton(this, {
    x: cx,
    y: cursorY,
    label: item.label,
    origin: 0.5,
    minWidth: 200,
    sfx: 'SCENE_SWISH',
    onClick: () => this.scene.start(item.scene),
  });
  this.animateButtonIn(button, delay);
  cursorY += ui(60);
  delay += 100;
}
```

- [x] **Step 3: Verify build and lint**

Run: `npm run build && npm run lint`
Expected: both pass.

- [x] **Step 4: Verify by playing**

Run `npm run dev`:

1. `localStorage.clear()`, reload. The menu shows **Games / Settings / About** and **no**
   Continue card.
2. Tap Games → a game → a level, then return to the menu (Back, Back). A Continue card now
   appears naming that game and level number.
3. Tap Continue → it opens that exact level.
4. Set a bogus id and reload — `localStorage.setItem('brain_puzzle_last_played', '99999')` —
   the Continue card disappears instead of erroring.
5. Settings and About buttons log an unknown-scene warning for now. That is expected until
   Tasks 10-11.

- [x] **Step 5: Commit**

```bash
git add src/scenes/MenuScene.ts src/main.ts
git commit -m "feat: rebuild the main menu around Continue, Games, Settings and About"
```

---

### Task 10: SettingsScene

**Files:**

- Create: `src/scenes/SettingsScene.ts`
- Modify: `src/main.ts` (register the scene)

**Interfaces:**

- Consumes: `AudioService.isMuted`/`setMuted`; `HapticsService.isEnabled`/`setEnabled` (Task 6); `SettingsService.getLanguage`/`setLanguage` (Task 4); `LOCALES`, `setLocale`, `t` (Task 1); `createPanel` (Task 7); `ProgressService.resetAllProgress`.
- Produces: scene key `'SettingsScene'`.

- [x] **Step 1: Write the scene**

Create `src/scenes/SettingsScene.ts`:

```ts
import * as Phaser from 'phaser';
import { GameConfig, ui, uiFont } from '@core/GameConfig';
import { createButton } from '@ui/GameButton';
import { createPanel } from '@ui/Panel';
import { AudioService } from '@core/AudioService';
import { HapticsService } from '@core/HapticsService';
import { SettingsService } from '@core/SettingsService';
import { ProgressService } from '@core/ProgressService';
import { LOCALES, setLocale, t } from '@core/i18n';

const ROW_HEIGHT = 64;
const SIDE_MARGIN = 20;

export class SettingsScene extends Phaser.Scene {
  constructor() {
    super('SettingsScene');
  }

  create() {
    this.cameras.main.setBackgroundColor(GameConfig.backgroundColor);
    this.drawBackground();

    const { width } = this.cameras.main;

    createButton(this, {
      x: ui(SIDE_MARGIN),
      y: ui(16),
      label: t('common.back'),
      sfx: 'SCENE_SWISH',
      onClick: () => this.scene.start('MenuScene'),
    });

    this.add
      .text(width / 2, ui(74), t('settings.title'), {
        fontFamily: GameConfig.fonts.default,
        fontSize: uiFont(26),
        fontStyle: 'bold',
        color: GameConfig.colors.title,
      })
      .setOrigin(0.5);

    let y = ui(130);

    // Sound goes through AudioService, which owns the authoritative flag and persists it — this
    // screen deliberately does not become a second source of truth (see ADR 0007).
    this.addToggleRow(y, t('settings.sound'), !AudioService.isMuted(), (on) => {
      AudioService.setMuted(!on);
      return !AudioService.isMuted();
    });
    y += ui(ROW_HEIGHT);

    this.addToggleRow(y, t('settings.haptics'), HapticsService.isEnabled(), (on) => {
      HapticsService.setEnabled(on);
      return HapticsService.isEnabled();
    });
    y += ui(ROW_HEIGHT);

    this.addLanguageRow(y);
    y += ui(ROW_HEIGHT);

    createButton(this, {
      x: this.cameras.main.width / 2,
      y: y + ui(20),
      label: t('settings.reset'),
      variant: 'danger',
      origin: 0.5,
      minWidth: 220,
      onClick: () => this.confirmReset(),
    });
  }

  private drawBackground() {
    const { width, height } = this.cameras.main;
    const gradient = this.add.graphics();
    gradient.fillGradientStyle(0x8e44ad, 0x8e44ad, GameConfig.backgroundColor, GameConfig.backgroundColor, 1);
    gradient.fillRect(0, 0, width, height);
  }

  private rowLabel(y: number, text: string) {
    this.add
      .text(ui(SIDE_MARGIN), y, text, {
        fontFamily: GameConfig.fonts.default,
        fontSize: uiFont(17),
        color: GameConfig.colors.text,
      })
      .setOrigin(0, 0.5);
  }

  /** `apply` performs the change and returns the state that actually took effect. */
  private addToggleRow(y: number, label: string, initial: boolean, apply: (on: boolean) => boolean) {
    this.rowLabel(y, label);

    let on = initial;
    const button = createButton(this, {
      x: this.cameras.main.width - ui(SIDE_MARGIN),
      y,
      label: on ? t('common.on') : t('common.off'),
      variant: on ? 'success' : 'secondary',
      origin: 0.5,
      minWidth: 90,
      onClick: () => {
        on = apply(!on);
        text.setText(on ? t('common.on') : t('common.off'));
      },
    });
    // createButton always builds [background, label] — see GameButton.ts.
    const text = button.getAt(1) as Phaser.GameObjects.Text;
    // Right-aligned: origin 0.5 centres it on the anchor, so pull it back half its width.
    button.x -= button.width / 2;
  }

  private addLanguageRow(y: number) {
    this.rowLabel(y, t('settings.language'));

    const current = LOCALES.find((l) => l.code === SettingsService.getLanguage()) ?? LOCALES[0];
    const button = createButton(this, {
      x: this.cameras.main.width - ui(SIDE_MARGIN),
      y,
      label: current.label,
      variant: 'secondary',
      origin: 0.5,
      minWidth: 120,
      onClick: () => this.pickLanguage(),
    });
    button.x -= button.width / 2;
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
          // Restart so every string on this screen is rebuilt in the new language. Phaser text
          // objects hold their string, so there is nothing to re-translate in place.
          this.scene.restart();
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
            // Back to the menu: it must re-evaluate the Continue card, which is now gone.
            this.scene.start('MenuScene');
          },
        },
      ],
      closeLabel: t('common.cancel'),
    });
  }
}
```

- [x] **Step 2: Register the scene**

In `src/main.ts`:

```ts
import { SettingsScene } from './scenes/SettingsScene';
```

```ts
  scene: [LoadingScene, MenuScene, GamesScene, LevelSelectScene, PlayScene, FlappyGameScene, SettingsScene],
```

- [x] **Step 3: Verify build and lint**

Run: `npm run build && npm run lint`
Expected: both pass. If lint flags `text` as used before definition in `addToggleRow`, that
mirrors the existing pattern in `MuteButton.ts` — the closure only reads it after the factory
returns. Add the same explanatory comment that file carries if the rule complains.

- [x] **Step 4: Verify by playing**

Run `npm run dev`:

1. Menu → Settings. Four rows: Sound, Vibration, Language, Reset progress.
2. Toggle Sound off; the label flips to Off and button taps go silent. Reload — it is still Off,
   and the menu's mute icon shows 🔇 (one shared source of truth).
3. Toggle Vibration; reload; the state persists.
4. Language → Tiếng Việt. The screen restarts in Vietnamese. Back to the menu: the title and
   all three buttons are Vietnamese. Reload the page — still Vietnamese.
5. Switch back to English.
6. Win a level so a Continue card exists, then Settings → Reset progress → Cancel. Progress
   survives.
7. Reset progress → Erase everything. It returns to the menu, the Continue card is gone, and
   Games shows `Not started` on every card.

- [x] **Step 5: Commit**

```bash
git add src/scenes/SettingsScene.ts src/main.ts
git commit -m "feat: add SettingsScene with sound, haptics, language and reset"
```

---

### Task 11: AboutScene and the version define

**Files:**

- Create: `src/scenes/AboutScene.ts`
- Create: `src/types/app-globals.d.ts`
- Modify: `vite.config.ts`
- Modify: `package.json` (version)
- Modify: `src/main.ts` (register the scene)

**Interfaces:**

- Consumes: `t` (Task 1); the `__APP_VERSION__` compile-time constant.
- Produces: scene key `'AboutScene'`.

- [x] **Step 1: Give the app a real version**

In `package.json`, change `"version": "0.0.0"` to `"version": "0.1.0"`. Showing `0.0.0` to a
player is worse than showing nothing, and the About screen displays this.

- [x] **Step 2: Expose it to the bundle**

In `vite.config.ts`, add the import and the define. Reading `package.json` at config time keeps
one source of truth instead of a constant that silently rots:

```ts
import { createRequire } from 'node:module';
```

```ts
const require = createRequire(import.meta.url);
const pkg = require('./package.json') as { version: string };
```

and inside `defineConfig({ ... })`, as a sibling of `resolve`:

```ts
  define: {
    // Single source of truth for the version the About screen shows.
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
```

Vitest uses a separate `vitest.config.ts` with no `define`, so nothing under test may reference
`__APP_VERSION__` — only the scene does, and scenes are not unit tested.

- [x] **Step 3: Declare the global for TypeScript**

Create `src/types/app-globals.d.ts`:

```ts
// Compile-time constants injected by Vite's `define` (see vite.config.ts). Declared here so
// tsc knows about them; they do not exist at runtime as real identifiers.

declare const __APP_VERSION__: string;
```

- [x] **Step 4: Write the scene**

Create `src/scenes/AboutScene.ts`:

```ts
import * as Phaser from 'phaser';
import { GameConfig, ui, uiFont } from '@core/GameConfig';
import { createButton } from '@ui/GameButton';
import { t } from '@core/i18n';

export class AboutScene extends Phaser.Scene {
  constructor() {
    super('AboutScene');
  }

  create() {
    this.cameras.main.setBackgroundColor(GameConfig.backgroundColor);
    this.drawBackground();

    const { width, centerX: cx } = this.cameras.main;

    createButton(this, {
      x: ui(20),
      y: ui(16),
      label: t('common.back'),
      sfx: 'SCENE_SWISH',
      onClick: () => this.scene.start('MenuScene'),
    });

    this.add
      .text(cx, ui(74), t('about.title'), {
        fontFamily: GameConfig.fonts.default,
        fontSize: uiFont(26),
        fontStyle: 'bold',
        color: GameConfig.colors.title,
      })
      .setOrigin(0.5);

    this.add
      .text(cx, ui(140), t('menu.title'), {
        fontFamily: GameConfig.fonts.default,
        fontSize: uiFont(20),
        fontStyle: 'bold',
        color: GameConfig.colors.text,
      })
      .setOrigin(0.5);

    this.add
      .text(cx, ui(176), `${t('about.version')} ${__APP_VERSION__}`, {
        fontFamily: GameConfig.fonts.default,
        fontSize: uiFont(15),
        color: '#cccccc',
      })
      .setOrigin(0.5);

    this.add
      .text(cx, ui(216), t('about.credits'), {
        fontFamily: GameConfig.fonts.default,
        fontSize: uiFont(14),
        color: '#cccccc',
        align: 'center',
        wordWrap: { width: width - ui(48) },
      })
      .setOrigin(0.5, 0);
  }

  private drawBackground() {
    const { width, height } = this.cameras.main;
    const gradient = this.add.graphics();
    gradient.fillGradientStyle(0x8e44ad, 0x8e44ad, GameConfig.backgroundColor, GameConfig.backgroundColor, 1);
    gradient.fillRect(0, 0, width, height);
  }
}
```

- [x] **Step 5: Register the scene**

In `src/main.ts`:

```ts
import { AboutScene } from './scenes/AboutScene';
```

```ts
  scene: [
    LoadingScene,
    MenuScene,
    GamesScene,
    LevelSelectScene,
    PlayScene,
    FlappyGameScene,
    SettingsScene,
    AboutScene,
  ],
```

- [x] **Step 6: Verify build, lint and tests**

Run: `npm run build && npm run lint && npm test`
Expected: all pass.

- [x] **Step 7: Verify by playing**

Run `npm run dev`: Menu → About shows the game name, `Version 0.1.0`, and the credits line.
Back returns to the menu. Switch the language to Vietnamese in Settings and revisit — the
labels are Vietnamese and the version number is unchanged.

- [x] **Step 8: Commit**

```bash
git add src/scenes/AboutScene.ts src/types/app-globals.d.ts vite.config.ts package.json src/main.ts
git commit -m "feat: add AboutScene showing the app version from package.json"
```

---

### Task 12: Documentation and ADRs

**Files:**

- Create: `docs/adr/0008-game-catalog-and-menu-structure.md`
- Modify: `docs/adr/0005-flappy-in-level-select.md` (superseded header)
- Modify: `CLAUDE.md`

**Interfaces:**

- Consumes: everything above.
- Produces: nothing consumed by code.

`CLAUDE.md` currently describes "five scenes registered", a `LevelSelectScene` with mechanic
tabs and an Arcade section, and `FLAPPY_LEVEL_ID` living in `FlappyGameScene`. All three are now
wrong, and it is the file every future session reads first.

- [x] **Step 1: Write the new ADR**

Create `docs/adr/0008-game-catalog-and-menu-structure.md` with exactly this content:

```markdown
# 0008 — A GameCatalog declares the games, and GamesScene picks between them

- Date: 2026-08-25
- Status: accepted
- Supersedes: [ADR 0005](0005-flappy-in-level-select.md) in full. ADR 0003's decision to keep
  Flappy out of `IMechanic`/`PlayScene` still stands, and ADR 0001's reserved score id still
  stands — only that constant's location changes.
- Implements: [the main menu redesign spec](../superpowers/specs/2026-08-25-main-menu-redesign-design.md)

## Context

`MenuScene` had two buttons: `Play`, which always restarted level 0, and `Levels`. That hid the
fact that the app contains four games, gave a returning player no way to resume, and left
nowhere to put settings or an about screen.

Game identity was scattered rather than declared. Display labels and emoji lived in two
scene-local records inside `LevelSelectScene` (`MECHANIC_LABELS`, `MECHANIC_ICONS`); Flappy's
identity lived in a third scene-local list (`ExtraGameEntry` / `EXTRA_GAMES`, introduced by ADR
0005 because the level browser was the only screen that could host it); and no game had a
description or how-to-play text anywhere, because there was no screen to show one on.

ADR 0005 was correct for its moment — it explicitly chose a scene-local concept over polluting
`LevelData`/`MechanicType` with a "level" that has no puzzle content. What has changed is that a
screen whose job is choosing a game now exists, so the special case has somewhere better to go.

## Decision

**`src/core/GameCatalog.ts` is the single declaration of what games exist.** One entry per game,
a discriminated union over `kind: 'LEVELS' | 'ARCADE'`, carrying the icon and the i18n keys for
title, description and how-to-play. It absorbs `MECHANIC_LABELS`, `MECHANIC_ICONS` and
`EXTRA_GAMES`, all three of which are deleted.

**`GamesScene` is the game picker**, rendering one card per catalog entry with live progress
derived by `src/core/GameProgress.ts`. Flappy is an ordinary `ARCADE` entry there, not an
exception — its card starts `FlappyGameScene` directly, and hides when `ThreeHost.isReady` is
false because it has no 2D fallback.

**`LevelSelectScene` shows one game's levels.** It is entered with `{ mechanic }` and has lost
its mechanic tab row, its `ALL` tab, its Arcade tab and its Arcade section. Keeping the tabs
would have meant two competing game pickers.

**`FLAPPY_LEVEL_ID` moves to `GameCatalog.ts`.** It previously lived in `FlappyGameScene`, which
imports Phaser, so a catalog importing it from there could not be unit tested under the `node`
environment Vitest uses (see [ADR 0004](0004-vitest-for-pure-logic.md)). The reserved score id is
part of a game's identity, so the catalog is its natural home anyway.

**Neither `GameCatalog` nor `GameProgress` may import Phaser or three.js.** That constraint is
what keeps the catalog, the progress maths and the first-of-game unlock rule under test.

## Consequences

Adding a game is now a catalog entry plus a level bundle pushed onto
`LevelRegistry.levelBundles` — no scene edits, and its card, description, rules panel and
progress line all appear for free. Previously it also meant touching two records and a tab row
inside `LevelSelectScene`.

The first-of-game unlock rule, which used to be an inline `isFirstOfItsMechanic` expression in
`LevelSelectScene`, is now `GameProgress.isLevelUnlocked` and shared. Two screens can no longer
disagree about which levels are playable. `ProgressService.isLevelUnlocked(levelId)` remains but
should not be called by anything new: it knows only about level id `1`, so it reports the first
Sokoban and Logic Grid levels as locked on a fresh profile.

The level browser lost cross-game navigation. Switching games costs one Back tap, which is the
price of having exactly one place to choose a game.

Menu copy is localised (English and Vietnamese) while gameplay text is not, so a player on
Vietnamese sees translated menus over largely English gameplay. That is a known, accepted gap —
`LevelUI` already mixes the two — and completing the migration is separate work.
```

- [x] **Step 2: Mark ADR 0005 superseded**

Add directly under the title of `docs/adr/0005-flappy-in-level-select.md`:

```markdown
> **Superseded by [0008](0008-game-catalog-and-menu-structure.md)** (2026-08-25). Flappy is now
> an ordinary `GameCatalog` entry on `GamesScene`; the `ExtraGameEntry` concept and the Arcade
> tab this ADR introduced have been deleted. The reasoning below is kept because it explains why
> the special case was correct while `LevelSelectScene` was the only screen that could host it.
```

Do not delete or rewrite the rest of the file.

- [x] **Step 3: Update `CLAUDE.md`**

Make these edits in the "Scene lifecycle" section and the two places that mention Flappy's id:

1. Change "boots Phaser with five scenes registered" to eight, and list `GamesScene`, `SettingsScene` and `AboutScene`.
2. Rewrite the `MenuScene` bullet: title screen with a conditional **Continue** card (resolved via `GameProgress.resolveContinueIndex` from `ProgressService.getLastPlayedLevelId()`) plus **Games**, **Settings** and **About**.
3. Rewrite the `LevelSelectScene` bullet: entered with `{ mechanic }` from `GamesScene`, shows one game's levels grouped by category, no mechanic tabs, no Arcade section. Remove the `ExtraGameEntry` sentence and the ADR 0005 reference, pointing at ADR 0008 instead.
4. Add bullets for `GamesScene` (cards from `GameCatalog`, live progress from `GameProgress`, auto-shown how-to-play on first visit), `SettingsScene` and `AboutScene`.
5. In the `FlappyGameScene` bullet, change `FLAPPY_LEVEL_ID = 2001` to say it is declared in `src/core/GameCatalog.ts`.
6. Add a short subsection after "Level data model" describing `GameCatalog` and `GameProgress` — the catalog declares games, the progress module derives counts from injected data, and neither may import Phaser so both stay unit-tested.
7. In the Audio layer section, add a sentence that `HapticsService` mirrors `AudioService` and is bound in `main.ts` the same way.

- [x] **Step 4: Verify the docs match reality**

Run these and confirm each returns nothing:

```bash
grep -n "ExtraGameEntry\|EXTRA_GAMES\|MECHANIC_ICONS\|MECHANIC_LABELS" src/ -r
grep -n "five scenes" CLAUDE.md
grep -rn "FLAPPY_LEVEL_ID = 2001" src/games/
```

Expected: no output from any of them. The last one should now only match `src/core/GameCatalog.ts`, so verify with `grep -rn "FLAPPY_LEVEL_ID = 2001" src/`.

- [x] **Step 5: Full verification pass**

Run: `npm run build && npm run lint && npm test`
Expected: all three pass.

- [x] **Step 6: Commit**

```bash
git add docs/adr CLAUDE.md
git commit -m "docs: record the game catalog decision and update CLAUDE.md"
```

---

## Post-implementation manual test pass

Run once at the end, on a real phone viewport (Chrome devtools at 390x844 minimum, ideally a
device over the LAN — `npm run dev` already listens on all interfaces):

- [x] Fresh profile (`localStorage.clear()`): menu shows Games/Settings/About, no Continue.
- [x] Games shows four cards; the first unseen game auto-opens its how-to once.
- [x] Each card's `?` opens the right rules text.
- [x] Each puzzle card opens level select filtered to that game, numbered from 1, titled, no tabs.
- [x] Flappy card starts Flappy; its card shows `Best: N` after a run.
- [x] Win a level; the games card progress line updates and the menu grows a Continue card.
- [x] Continue opens the level you left.
- [x] Settings: sound and vibration toggles persist across a reload; the menu mute icon agrees with the sound row.
- [x] Language switches the menu, games, settings and about screens; persists across a reload.
- [x] Reset progress asks first, then clears progress, the Continue card, and every card's progress line.
- [x] About shows version 0.1.0.
- [x] No card, button or text is clipped or overlapping at 390px wide.
- [x] No unhandled promise rejections or errors in the console during the whole pass.
