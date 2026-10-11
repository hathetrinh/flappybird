# A model vanishes from frame, or ignores where you put it

- Found: 2026-08-22, while building the Flappy bird asset (`tools/blender/generate_flappy_assets.py`)
- Applies to: any generated .glb with animation clips

## Symptom

The bird was placed in a pipe gap at a measured world height of z ≈ 2.5. Every part reported
the right coordinates when probed. It rendered nowhere near there — it was simply absent from
the frame, sitting back at the origin.

## Cause

The model's **root node was animated**. Every part had been parented to `Bird_Body` to make the
body's bob carry the whole bird, which also made the animated body the root of the exported
hierarchy. Anything that positions the root — a Blender scene placing the import, or a game
engine placing the model each frame — has that placement overwritten the instant the animation
system evaluates the root's own `location` channel.

The measurement and the render disagreed because the probe read `matrix_world` before animation
evaluation, and the renderer drew it after.

## Fix

Put an inert node above the animated one. `generate_flappy_assets.py` now creates a `Bird_Root`
empty, parents the animated body to it, and animates strictly below it. Placement goes on the
root; clips never touch it.

## How to notice it next time

`inspect_glb.py` reports node and channel counts, and a clip whose channel count includes the
root looks perfectly healthy — this is not detectable from the file's structure alone. What
catches it is placing the model somewhere non-trivial and _rendering_ it, which is what
`tools/blender/preview_flappy_scene.py` exists to do.

The same rule appears from the engine side in `generate_player_animation.py`: only children are
animated, never the root, because `ThreeSokobanLayer` writes the root transform every frame.
Two different symptoms, one rule — **whoever positions a node must be the only one animating it.**
