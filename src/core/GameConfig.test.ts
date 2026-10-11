import { describe, expect, it } from 'vitest';
import { computeLayoutMetrics, computeUiPositions } from './GameConfig';

describe('computeLayoutMetrics', () => {
  it('matches the current boot formula for a portrait phone (390x844, capped DPR 2, touch)', () => {
    const m = computeLayoutMetrics(390, 844, 2, 0, true);
    expect(m.design).toEqual({ width: 780, height: 1688 });
    expect(m.dpadMetrics.button).toBe(Math.min(Math.round(56 * m.uiScale), 128));
    expect(m.playArea.top).toBeLessThanOrEqual(Math.round(m.design.height * 0.18));
  });

  it('reserves a larger fraction of height for HUD+D-pad on a short landscape viewport than a tall portrait one', () => {
    const portrait = computeLayoutMetrics(390, 844, 2, 0, true);
    const landscape = computeLayoutMetrics(844, 390, 2, 0, true);
    const portraitFraction = (portrait.playArea.top + portrait.playArea.bottom) / portrait.design.height;
    const landscapeFraction = (landscape.playArea.top + landscape.playArea.bottom) / landscape.design.height;
    expect(landscapeFraction).toBeGreaterThan(portraitFraction);
    // The 0.28 cap on `bottom` plus the 0.18 cap on `top` bounds the total below 46% of height.
    expect(landscapeFraction).toBeLessThan(0.46);
  });

  it('never lets the bottom reserve exceed 28% of the design height, even when the D-pad is bigger', () => {
    // A very short landscape viewport can make the D-pad itself bigger than 28% of the height
    // (pre-existing behavior, unchanged by this refactor) — the cap on `bottom` still holds.
    const m = computeLayoutMetrics(844, 390, 2, 20, true);
    expect(m.playArea.bottom).toBeLessThanOrEqual(Math.round(m.design.height * 0.28));
  });

  it('reserves at least the D-pad size on a viewport tall enough to fit it', () => {
    const m = computeLayoutMetrics(390, 844, 2, 20, true);
    expect(m.playArea.bottom).toBeGreaterThanOrEqual(m.dpadMetrics.cross + m.dpadMetrics.margin * 2);
  });

  it('reserves no D-pad space at all when there is no touch input', () => {
    const m = computeLayoutMetrics(844, 390, 2, 0, false);
    expect(m.dpadMetrics.cross).toBe(0);
    expect(m.dpadMetrics.reach).toBe(0);
  });
});

describe('computeUiPositions', () => {
  it('keeps every button position inside the design bounds', () => {
    const metrics = computeLayoutMetrics(844, 390, 2, 0, true);
    const ui = computeUiPositions(metrics, 0);
    for (const pos of [ui.backBtnPos, ui.undoBtnPos, ui.hintBtnPos, ui.resetBtnPos]) {
      expect(pos.x).toBeGreaterThanOrEqual(0);
      expect(pos.x).toBeLessThanOrEqual(metrics.design.width);
      expect(pos.y).toBeGreaterThanOrEqual(0);
      expect(pos.y).toBeLessThanOrEqual(metrics.design.height);
    }
  });

  it('derives wordWrapWidth from the design width, not a fixed constant', () => {
    const narrow = computeUiPositions(computeLayoutMetrics(390, 844, 2, 0, true), 0);
    const wide = computeUiPositions(computeLayoutMetrics(844, 390, 2, 0, true), 0);
    expect(wide.wordWrapWidth).toBeGreaterThan(narrow.wordWrapWidth);
  });
});
