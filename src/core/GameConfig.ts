// Rounded display font loaded via Google Fonts in index.html; falls back to Arial if it
// fails to load or hasn't finished loading yet (LoadingScene waits on it before proceeding).
export const FONT_FAMILY = '"Baloo 2", Arial, sans-serif';

// The game size matches the viewport exactly, multiplied by the device's pixel ratio, instead
// of being a fixed 800x600. Two problems that solves:
//
//   * A fixed size left the game letterboxed into a 390x292 band on a 390x844 phone — 35% of
//     the screen, with every button scaled to 49%, which is what made touch targets unusable.
//   * Anything Scale.FIT has to stretch is soft. Text and emoji show it first, since a glyph
//     rasterised once and then magnified cannot be sharpened afterwards.
//
// Resolved once at module load. Rotating the device afterwards falls back to letterboxing the
// boot orientation (Phaser can't change its scale config per-frame, and no scene implements a
// resize relayout yet) — fine for a portrait-locked Capacitor build; see notes in main.ts.
/**
 * The layout box, in CSS pixels — exactly the viewport.
 *
 * Matching it precisely (rather than anchoring a fixed short side and letting Scale.FIT
 * stretch to fit) is what makes one layout unit exactly one CSS pixel and leaves nothing for
 * FIT to scale. An earlier version used a fixed 600-unit short side, which still upscaled by
 * 1.33x on a 1280x800 window before the screen's own pixel ratio was even applied.
 */
function resolveLayoutSize(): { width: number; height: number } {
  // visualViewport reflects the area actually visible around browser chrome (notably iOS
  // Safari's floating bottom bar), where innerWidth/innerHeight can measure against the
  // larger, chrome-collapsed viewport instead — the mismatch is what let the D-pad and the
  // Reset button render underneath Safari's bar on an iPhone.
  const viewport = typeof window === 'undefined' ? undefined : window.visualViewport;
  const vw = viewport?.width ?? (typeof window === 'undefined' ? 800 : window.innerWidth || 800);
  const vh = viewport?.height ?? (typeof window === 'undefined' ? 600 : window.innerHeight || 600);
  return { width: Math.max(320, vw), height: Math.max(320, vh) };
}

/**
 * iOS Safari's home-indicator / rounded-corner safe area, read once at boot via a probe element
 * so bottom-anchored HUD (D-pad, Reset) can add its own margin on top of PLAY_AREA.bottom
 * instead of sitting flush against — or under — the system chrome there.
 */
export function resolveSafeAreaBottom(): number {
  if (typeof document === 'undefined') return 0;
  const probe = document.createElement('div');
  probe.style.position = 'fixed';
  probe.style.visibility = 'hidden';
  probe.style.paddingBottom = 'env(safe-area-inset-bottom, 0px)';
  document.body.appendChild(probe);
  const value = parseFloat(getComputedStyle(probe).paddingBottom) || 0;
  document.body.removeChild(probe);
  return value;
}

/**
 * How many real device pixels the game renders per layout unit.
 *
 * Without this the canvas is drawn at CSS-pixel size and then stretched to the screen's real
 * pixels — measured at 2.67x on a Retina laptop and 2.92x on a DPR-3 phone. Text and emoji are
 * what show it first: a glyph rasterised once at 18px and blown up nearly 3x has soft, muddy
 * edges no font smoothing can recover.
 *
 * Rendering at the device's pixels instead makes the canvas map 1:1 to the screen. The cost is
 * fill rate, so it's capped at 2: a DPR-3 phone would otherwise ask for ~2.7M pixels per frame
 * for no visible gain over 2x on a small screen.
 *
 * Phaser 4 has no `resolution` config to do this for us (it's ignored — verified), so the game
 * size itself carries the ratio. That makes one game unit one PHYSICAL pixel, which is why
 * every fixed UI dimension below is multiplied by this: a 44-unit tap target at ratio 2 is
 * 88 game units, which is still exactly 44 CSS pixels on screen.
 */
export const PIXEL_RATIO = Math.min(Math.max(typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1, 1), 2);

const LAYOUT = resolveLayoutSize();

/**
 * Touch device? The D-pad is a touch control, so on a machine with a keyboard it is dead weight
 * that would cost a quarter of the screen in reserved space for nothing.
 */
export const HAS_TOUCH_INPUT =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(pointer: coarse)').matches
    : false;

/**
 * How much bigger the UI should be than its authored size, based on how much screen there is.
 *
 * Rendering 1:1 with the display fixes sharpness but costs something the old stretched setup
 * gave away for free: UI that grew with the window. At a fixed CSS size, a 24px title on a
 * 1280x800 desktop looks lost. Scaling by the short side restores that, and because the canvas
 * is still 1:1 the larger text is rasterised at the larger size rather than magnified — sharp
 * and appropriately sized, instead of one or the other.
 *
 * Never goes below 1: on a phone the authored sizes ARE the right sizes, and shrinking them
 * would drop tap targets under the 44px minimum they're built around.
 */
const REFERENCE_SHORT_SIDE = 600;

export interface LayoutMetrics {
  uiScale: number;
  design: { width: number; height: number };
  dpadMetrics: { button: number; gap: number; margin: number; cross: number; spacing: number; reach: number };
  playArea: { top: number; bottom: number; side: number };
}

/**
 * Pure re-derivation of every size below from an arbitrary viewport, rather than the boot one.
 * Kept parameter-driven (no reads of `window`/`document`) so it's usable both at module load
 * (see BOOT_METRICS) and from a live resize/orientation-change handler — see SokobanLayout.ts.
 */
export function computeLayoutMetrics(
  viewportWidth: number,
  viewportHeight: number,
  pixelRatio: number,
  safeAreaBottomCss: number,
  hasTouchInput: boolean,
): LayoutMetrics {
  const uiDensity = Math.min(Math.max(Math.min(viewportWidth, viewportHeight) / REFERENCE_SHORT_SIDE, 1), 1.75);
  const uiScale = pixelRatio * uiDensity;
  const scaleUi = (value: number) => Math.round(value * uiScale);

  const design = {
    width: Math.round(viewportWidth * pixelRatio),
    height: Math.round(viewportHeight * pixelRatio),
  };
  const safeAreaBottom = scaleUi(safeAreaBottomCss);

  // Capped in CSS pixels as well as scaled: the density factor is derived from the short side,
  // so on a wide-but-short window it would inflate the pad past any useful size — 69px arrows
  // on a desktop, eating the board to make room for a control that isn't even shown there.
  const dpadButton = Math.min(scaleUi(56), Math.round(64 * pixelRatio));
  const dpadGap = Math.min(scaleUi(4), Math.round(5 * pixelRatio));
  // Padded by safeAreaBottom so the pad clears iOS Safari's floating bottom bar / home
  // indicator instead of rendering underneath it.
  const dpadMargin = Math.min(scaleUi(10), Math.round(12 * pixelRatio)) + safeAreaBottom;
  const dpadCross = hasTouchInput ? dpadButton * 3 + dpadGap * 2 : 0;

  const dpadMetrics = {
    button: dpadButton,
    gap: dpadGap,
    margin: dpadMargin,
    cross: dpadCross,
    /** Centre-to-centre spacing between opposite arrows. */
    spacing: dpadButton + dpadGap,
    /** Half the cross, for keeping it inside the screen. */
    reach: dpadCross / 2,
  };

  // Bands at the edges of the screen the board is never laid into: the HUD strip along the top
  // (level title, question, Undo/Hint) and the D-pad along the bottom. Capped as a fraction of
  // the height, not just a fixed size, because a fixed reserve is fine on a tall screen and
  // ruinous on a short one — 140+90 units costs 27% of a portrait phone but 59% of the same
  // phone in landscape.
  const playArea = {
    top: Math.min(scaleUi(140), Math.round(design.height * 0.18)),
    bottom: Math.min(
      Math.max(Math.min(scaleUi(90), Math.round(design.height * 0.12)), dpadCross ? dpadCross + dpadMargin * 2 : 0) +
        safeAreaBottom,
      Math.round(design.height * 0.28),
    ),
    side: scaleUi(20),
  };

  return { uiScale, design, dpadMetrics, playArea };
}

const SAFE_AREA_BOTTOM_CSS = resolveSafeAreaBottom();
const BOOT_METRICS = computeLayoutMetrics(
  LAYOUT.width,
  LAYOUT.height,
  PIXEL_RATIO,
  SAFE_AREA_BOTTOM_CSS,
  HAS_TOUCH_INPUT,
);

/** Total factor from an authored CSS-ish pixel to a game unit. */
export const UI_SCALE = BOOT_METRICS.uiScale;

/** Scales a dimension authored in CSS-ish pixels into game units. */
export const ui = (value: number): number => Math.round(value * UI_SCALE);

/** Scales a font size, as the `'18px'` string Phaser text styles expect. */
export const uiFont = (px: number): string => `${Math.round(px * UI_SCALE)}px`;

const DESIGN = BOOT_METRICS.design;

/**
 * D-pad metrics. Single source of truth shared with PLAY_AREA.bottom below: a pad taller than
 * the band it sits in overlaps the board, and two independent constants would drift apart the
 * first time either is tuned. See computeLayoutMetrics for the actual formula.
 */
export const DPAD_METRICS = BOOT_METRICS.dpadMetrics;

/**
 * Bands at the edges of the screen the board is never laid into — see computeLayoutMetrics.
 * Single source of truth: the 3D layer, the 2D Sokoban renderer and the content-fitting
 * transform all read these, and they have to agree or the board and the HUD overlap.
 */
export const PLAY_AREA = BOOT_METRICS.playArea;

export interface UiPositions {
  titlePos: { x: number; y: number };
  questionPos: { x: number; y: number };
  wordWrapWidth: number;
  hintPos: { x: number; y: number };
  hintBtnPos: { x: number; y: number };
  backBtnPos: { x: number; y: number };
  undoBtnPos: { x: number; y: number };
  resetBtnPos: { x: number; y: number };
  catgegoryBadgePos: { x: number; y: number };
  timerPos: { x: number; y: number };
  starsPos: { x: number; y: number };
}

/**
 * Pure re-derivation of GameConfig.ui's positions from arbitrary metrics — see
 * computeLayoutMetrics. Positions are in design units: anything that needs to sit against an
 * edge or the centre is derived from the resolved design size — hardcoding e.g. x: 700 put the
 * Hint button off the right edge as soon as the design width stopped being 800.
 */
export function computeUiPositions(metrics: LayoutMetrics, safeAreaBottomCss: number): UiPositions {
  const { design } = metrics;
  const scaleUi = (value: number) => Math.round(value * metrics.uiScale);
  const safeAreaBottom = scaleUi(safeAreaBottomCss);
  return {
    titlePos: { x: scaleUi(16), y: scaleUi(50) },
    questionPos: { x: scaleUi(16), y: scaleUi(90) },
    // line length for question text wrapping
    wordWrapWidth: design.width - scaleUi(32),
    hintPos: { x: design.width / 2, y: design.height - scaleUi(44) - safeAreaBottom },
    hintBtnPos: { x: design.width - scaleUi(104), y: scaleUi(16) },
    backBtnPos: { x: scaleUi(16), y: scaleUi(16) },
    undoBtnPos: { x: scaleUi(132), y: scaleUi(16) },
    // The top HUD band (row 1 buttons, the badge row, and the question text under it) has no
    // room left for a labelled button on a narrow phone — see the timerPos note below. Reset
    // sits in the bottom-left corner instead, inside PLAY_AREA.bottom, which the board never
    // renders into. The D-pad (see ScreenRegions.ts) is pinned to the bottom-RIGHT corner of
    // that same band, so the two never collide. safeAreaBottom keeps it clear of iOS Safari's
    // floating bottom bar / home indicator, which sit on top of the page rather than resizing it.
    resetBtnPos: { x: scaleUi(16), y: design.height - scaleUi(60) - safeAreaBottom },
    catgegoryBadgePos: { x: scaleUi(16), y: scaleUi(60) },
    // The timer sits on the badge row, pinned to the right edge — NOT on the button row above.
    // There it was centred at width-150, which on a 390px-wide phone overlapped the Undo button,
    // and the gap between Undo and Hint is only ~64px: too narrow for "⏱ 120s" at any alignment.
    // The badge row's right side is empty on every screen size, so it fits without crowding.
    timerPos: { x: design.width - scaleUi(16), y: scaleUi(58) },
    starsPos: { x: design.width / 2, y: design.height * 0.37 },
  };
}

const BOOT_UI_POSITIONS = computeUiPositions(BOOT_METRICS, SAFE_AREA_BOTTOM_CSS);

export const GameConfig = {
  width: DESIGN.width,
  height: DESIGN.height,
  backgroundColor: 0x1a1a1a,
  pixalArt: true,
  // Renders the SOKOBAN mechanic through the real-time three.js layer (see
  // src/games/sokoban/SokobanWorld.ts) instead of the flat 2D sprite renderer.
  sokoban3D: true,
  // Phaser's `font: '...'` shorthand parses by naively splitting on whitespace and only
  // takes ONE token as the family, which breaks on "Baloo 2" (a two-word name). Use these as
  // { fontFamily, fontSize, fontStyle } spread into a Text style instead of a shorthand string.
  fonts: {
    default: FONT_FAMILY,
    title: { fontFamily: FONT_FAMILY, fontSize: uiFont(24), fontStyle: 'bold' },
    question: { fontFamily: FONT_FAMILY, fontSize: uiFont(20), fontStyle: 'normal' },
    hint: { fontFamily: FONT_FAMILY, fontSize: uiFont(22), fontStyle: 'normal' },
    button: { fontFamily: FONT_FAMILY, fontSize: uiFont(18), fontStyle: 'bold' },
  },
  colors: {
    title: '#ffff00',
    text: '#ffffff',
    hint: '#00ffff',
    success: '#00ff00',
    warning: '#ff00ff',
  },
  // See computeUiPositions for how these are derived.
  ui: {
    ...BOOT_UI_POSITIONS,
    // default visibility for metadata (difficulty/target) when no user preference stored
    showMetaDefault: false,
  },
  mechanics: {
    // These are compared against AUTHORED level coordinates via ContentSpace, which already
    // maps into game units, so they stay unscaled here.
    dragNearThreshold: 70,
    dragFarThreshold: 250,
    edgeMargin: 50,
    shakeThreshold: 15,
    winDelay: 1200,
    shakeAnimDuration: 50,
    shakeAnimOffset: 10,
    shakeAnimRepeat: 2,
  },
} as const;
