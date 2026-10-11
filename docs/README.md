# Project documentation

Written decisions, designs, plans and hard-won gotchas. The point is retrieval: when someone
asks "why is it built like this?" or "didn't we hit this before?", the answer should be a file
rather than an archaeology session through git log.

## What goes where

| Folder       | Holds                                                                           | Naming                                                |
| ------------ | ------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `adr/`       | Architecture Decision Records — one decision, its context, and what it costs us | `NNNN-<slug>.md`, numbered in order, never renumbered |
| `specs/`     | Designs agreed before building. What we're building and why                     | `YYYY-MM-DD-<topic>.md`                               |
| `plans/`     | Implementation plans: phased, checkboxed, executable by someone with no context | `YYYY-MM-DD-<topic>.md`                               |
| `issues/`    | Technical issues and traps — a symptom, its real cause, and how to avoid it     | `<slug>.md`                                           |
| `questions/` | Open questions with no answer yet, so they stop being re-asked from scratch     | `<slug>.md`                                           |

## The rules that make it worth keeping

**An ADR is append-only.** Superseding a decision means a new ADR that says which one it
replaces, and a line at the top of the old one pointing forward. Editing a decision's history
to match today's opinion destroys the only thing the record was for.

**An issue is written from the symptom.** Title it with what you'd search for at 1am — the
thing you _saw_, not the cause you eventually found. "Model vanishes from frame" finds the
file; "node transform evaluation order" does not.

**A question gets closed, not deleted.** When it's answered, the answer goes in the file and
the file either stays (if the reasoning is worth keeping) or becomes an ADR (if it decided
something). A question that quietly disappears looks like it was never asked.

**Specs and plans are dated and immutable-ish.** They record what we agreed _then_. Drift
between a plan and the code is normal and fine; rewriting the plan to match the code is not,
because then it no longer explains why the code looks like it does.

## Documents written before this convention

These predate the structure above and have been left where they are rather than moved:

- `docs/superpowers/specs/` and `docs/superpowers/plans/` — designs and plans for the undo
  system, the matchstick add-stick split, and the Logic Grid mechanic.
- `docs/tasks/2026-08-15-logic-grid-*.md` — the Logic Grid work split into task files.
- `docs/refactoring-plan.md` — the original scene-graph and mechanic-registry refactor.

New work goes in the folders in the table. If the split ever becomes annoying, consolidating
those into `specs/` and `plans/` is a `git mv` away.

## Index

### ADRs

- [0001 — Flappy Bird 3D is one endless run with a high score](adr/0001-flappy-endless-high-score.md)
- [0002 — Extract a shared three.js host; one world module per 3D game](adr/0002-shared-three-host.md)
- [0003 — Flappy runs in its own Phaser scene, not as a PlayScene mechanic](adr/0003-dedicated-flappy-scene.md)
- [0004 — Add Vitest, for pure logic modules only](adr/0004-vitest-for-pure-logic.md)
- [0005 — Flappy Bird 3D appears in LevelSelectScene as a local "extra game" tile](adr/0005-flappy-in-level-select.md)
- [0006 — Organize `src/` by game, not by technical layer](adr/0006-game-first-source-layout.md)
- [0012 — The run's READY phase is the title screen; there is no menu scene](adr/0012-title-screen-in-game-scene.md)

### Specs

- [2026-08-22 — Flappy Bird 3D](specs/2026-08-22-flappy-bird-3d.md)

### Plans

- [2026-08-22 — Flappy Bird 3D](plans/2026-08-22-flappy-bird-3d.md)
- [2026-08-22 — Game-first `src/` restructure](plans/2026-08-22-game-first-restructure.md)

### Issues

- [An animated root node silently discards placement](issues/animated-root-node-discards-placement.md)
- [glTF import leaves objects in quaternion mode, so Euler assignment does nothing](issues/gltf-import-quaternion-rotation-mode.md)
- [The 3D board is rotated, so grid coordinates are not world coordinates](issues/rotated-board-grid-vs-world-coordinates.md)

### Questions

- [Should Flappy Bird appear in LevelSelect?](questions/should-flappy-appear-in-level-select.md) — closed, see ADR 0005
