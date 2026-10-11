// Compile-time constants injected by Vite's `define` (see vite.config.ts). Declared here so
// tsc knows about them; they do not exist at runtime as real identifiers.

declare const __APP_VERSION__: string;

// Which portal this build is for, from Vite's --mode: 'gd' (GameDistribution), 'youtube'
// (YouTube Playables), or 'web' for every other build (dev server, Netlify, Capacitor/Android).
declare const __PLATFORM__: 'gd' | 'youtube' | 'web';
