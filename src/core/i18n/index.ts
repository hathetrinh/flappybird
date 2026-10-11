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
