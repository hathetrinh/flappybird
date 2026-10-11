# Rotating an imported glTF object does nothing (Blender)

- Found: 2026-08-22, in the Flappy scene preview harness
- Applies to: any bpy script that imports a .glb and then rotates or keyframes rotation

## Symptom

Ceiling pipes were imported, assigned `rotation_euler` of 180° about X, and came out completely
unrotated. No error, no warning. The measured bounding box proved the flip never happened:
the pipe sat at z 7.5–11.5 instead of the expected 3.5–7.5.

## Cause

The glTF importer sets `rotation_mode = 'QUATERNION'` on everything it brings in, because glTF
stores rotations as quaternions. Blender then evaluates the quaternion channels and ignores the
Euler ones entirely, so assigning `rotation_euler` writes a value nothing reads.

## Fix

Set the mode before assigning:

```python
obj.rotation_mode = "XYZ"   # converts the current rotation; Euler assignment now takes effect
obj.rotation_euler = (math.radians(180), 0, 0)
```

## Related

The same trap bites keyframes, and there it is worse — `obj.keyframe_insert('rotation_euler')`
creates curves that evaluate to nothing, so the exporter sees an unchanging rotation and writes
**no rotation channel at all**. The clip still exists and still passes a "does it have
animation?" check, while the model stands there motionless. Both generation scripts in
`tools/blender/` set `rotation_mode = "XYZ"` explicitly before keyframing for this reason.

Verify with `inspect_glb.py`: it prints each clip's channel list, so a rotation you authored but
which is missing from that list was silently dropped.
