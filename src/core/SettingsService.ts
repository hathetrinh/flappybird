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
