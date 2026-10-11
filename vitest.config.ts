import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

// Only pure-logic modules are tested here (see docs/adr/0004-vitest-for-pure-logic.md), so the
// default node environment is right — no jsdom, no canvas, nothing to stub.
//
// Extends vite.config.ts rather than standing alone so tests resolve the same path aliases
// (@core, @game-types, ...) the app does, without a third copy of the alias list to keep in step.
export default defineConfig((env) =>
  mergeConfig(viteConfig(env), {
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    },
  }),
);
