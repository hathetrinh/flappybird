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
    expect(translate('vi', 'menu.best')).toBe(VI['menu.best']);
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
    expect(t('settings.title')).toBe(VI['settings.title']);
  });

  it('coerces an unrecognised stored value to English rather than throwing', () => {
    setLocale('klingon');
    expect(getLocale()).toBe('en');
    expect(t('settings.title')).toBe(EN['settings.title']);
  });
});
