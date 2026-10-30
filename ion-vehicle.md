# Ion Titan vehicle

Open Vehicles → Titanfall 2 → Ion Titan → Load with Jack Cooper. Press Load, Play, then E (or the Embark button). W/S walks, A/D turns, Space stops. Press E again to disembark. Fullscreen is optional.

The Embark selector offers automatic nearest-side selection plus five original clips: kneel front, behind, left, right, and stand front. The Disembark selector offers stand and crouch. Selections also appear inside play mode. Controls lock while an animation runs; Reset or Stop cancels safely. The separate walking character is hidden while the original synchronized Cooper/Titan pair animates, then restored at the pilot's exit position.

These seven clips belong to the original paired rig. Andrew is explicitly supported through a bind-pose-aware humanoid retarget: his own visible mesh follows the original pilot trajectory and bone rotations, while Cooper stays hidden. E and the on-screen action share the animated enter/exit path. His walking pose is restored after completion, Reset or Stop. Andrew retains his own proportions, so exact hand/foot contacts can differ from Cooper. Other selected characters retain instant entry; they do not receive unverified retargeted animations. Mounted walking uses a procedural gait, not an extracted locomotion clip.

## Local assets

- `assets/titanfall2-ion-titan/ion-vehicle.glb`: standalone vehicle, Titan only, original seven Titan animation tracks.
- `assets/titanfall2-ion-titan/ion-vehicle-paired.glb`: original Titan and Cooper rigs, synchronized seven clips for play mode.
- `assets/titanfall2-ion-titan/vehicle-provenance.json`: original-file hashes, texture sources, conversion notes and limits.
- Existing `ion-titan-embark.glb` remains unchanged for the original combined character entry.

The installed game is at `J:/Titanfall2`. Existing local original texture exports from LegionPlus supplied body warpaint, cockpit and nose art. Body/cockpit albedo, AO, normal, illumination, gloss and specular textures were rebuilt as embedded PBR maps (2048px body/cockpit, 1024px masked nose art). Two-channel normals have reconstructed Z and adjusted green orientation. Source specular/gloss shaders are approximated with metallic/roughness materials and a locally generated studio reflection map.

The default pose is a closed standing Titan sampled from the original stand disembark's last frame. Titan global translation is removed from both synchronized roots to hold the parked vehicle in place while preserving pilot-relative motion. A short pose bridge connects the current parked pose with the selected clip.

Rebuild using bundled Python with Pillow and NumPy: `python tools/ion/prepare_ion.py`. The script reads local sources and writes derived assets only. Paths can be inspected in the script; the original game files are never modified.

Validation: `node tests/ion-vehicle.mjs` loads actual GLBs through Three.js, checks meshes, skins, all seven clips, ten embark/exit combinations, source pilot visibility, nearest-side selection, bridge completion, cancellation, moved-vehicle exit position, mech movement and camera, and catalog fallback. Existing vehicle library, driving, native entry, helicopter and play-mode tests remain passing. Browser checks confirmed the 86-vehicle library, boarding, walking, crouch exit and reset cancellation.
