# Sky Chick

A tap-to-fly arcade game built with **Phaser 4** and **TypeScript**: guide a pixel-art chick through gaps between pipes, collect coins, hearts and shields, and chase a daily best score. It ships to web game portals (GameDistribution, YouTube Playables) and to Android via **Capacitor**.

Every day has its own pipe layout, the same for every run that day. There are sound effects with a toggle in Settings, and the UI is in English and Vietnamese.

## Getting started

```bash
npm install
npm run dev        # start the dev server
npm run build      # type-check, then produce a production build
npm test           # run the pure-logic test suite (Vitest)
npm run package:gd # GameDistribution build, zipped as sky-chick-gd.zip for upload
```

See [`CLAUDE.md`](CLAUDE.md) for the full command list, project architecture, and the conventions the codebase follows.
