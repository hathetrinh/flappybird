import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { defineConfig, type Plugin } from 'vite';

const src = (p: string) => fileURLToPath(new URL(`./src/${p}`, import.meta.url));

const require = createRequire(import.meta.url);
const pkg = require('./package.json') as { version: string };

// GameDistribution's SDK loader, injected into index.html by the `gd` build only — the dev server
// and every other build never load it. Every SDK event is forwarded to GameDistributionSDK
// (src/core/GameDistribution.ts) via window.GD_Callbacks; events that fire before the game has
// booted (a preroll ad on page load) are queued for it to replay.
// Sky Chick's own GD entry. Empty until it is created on developer.gamedistribution.com; the gd
// build refuses to run without it rather than ship another game's id (ad revenue and stats go
// to whichever entry the id names).
const GD_GAME_ID = '';
const GD_SDK_SNIPPET = `<script>
  window.GD_Callbacks = { queue: [] };
  window.GD_OPTIONS = {
    gameId: '${GD_GAME_ID}',
    onEvent: function (event) {
      var cb = window.GD_Callbacks;
      if (cb.onEvent) cb.onEvent(event);
      else cb.queue.push({ name: event.name });
    },
  };
  (function (d, s, id) {
    var js, fjs = d.getElementsByTagName(s)[0];
    if (d.getElementById(id)) return;
    js = d.createElement(s);
    js.id = id;
    js.src = 'https://html5.api.gamedistribution.com/main.min.js';
    fjs.parentNode.insertBefore(js, fjs);
  })(document, 'script', 'gamedistribution-jssdk');
</script>`;

function gdSdkPlugin(enabled: boolean): Plugin {
  if (enabled && !/^[0-9a-f]{32}$/.test(GD_GAME_ID)) {
    throw new Error('GD_GAME_ID in vite.config.ts is not set: create the game on GameDistribution and paste its id.');
  }
  return {
    name: 'gd-sdk',
    transformIndexHtml: (html) => (enabled ? html.replace('</head>', `${GD_SDK_SNIPPET}\n  </head>`) : html),
  };
}

export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [gdSdkPlugin(mode === 'gd')],
  define: {
    // Single source of truth for the version the About screen shows.
    __APP_VERSION__: JSON.stringify(pkg.version),
    // Which portal SDK main.ts initialises — `vite build --mode gd|youtube`, anything else is 'web'.
    __PLATFORM__: JSON.stringify(mode === 'gd' || mode === 'youtube' ? mode : 'web'),
  },
  resolve: {
    // Must stay in step with `paths` in tsconfig.json — tsc reads that, Vite reads this, and a
    // mismatch type-checks clean then fails at runtime with an unresolved import.
    alias: {
      '@core': src('core'),
      '@ui': src('ui'),
      '@scenes': src('scenes'),
      '@games': src('games'),
    },
  },
  server: {
    // Listen on every interface, not just localhost, so phones and tablets on the same
    // Wi-Fi can open the dev server by this machine's LAN IP (Vite prints the Network URL
    // on start). Same as passing `--host`; drop this line to go back to localhost-only.
    host: true,
    // Lets the dev server accept requests tunneled through ngrok (subdomain changes
    // each session on the free tier, so a wildcard beats hardcoding today's host).
    allowedHosts: ['.ngrok-free.app'],
  },
  preview: {
    // Same for `npm run preview`, so the production build can be tested on a device too.
    host: true,
  },
}));
