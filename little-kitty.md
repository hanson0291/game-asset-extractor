# Little Kitty, Big City — local player extraction

The library and Custom Loader share the `little-kitty` entry. The local extraction contains the player prefab's 4,065-vertex mesh, 58 weighted bones, original texture images, 12 skeletal animation clips, and 72 explicitly named protagonist vocal clips (meows, purrs and efforts).

## Regenerate locally

From the **live Character Extractor folder** (`../character-extractor` next to the dashboard repo):

```powershell
python -m pip install --target tools/python-deps UnityPy numpy Pillow
python tools/export_kitty.py
node tests/little-kitty.mjs
```

The exporter reads `E:/SteamLibrary/steamapps/common/LittleKittyBigCity/Little Kitty, Big City_Data/sharedassets2.assets` without modifying it. Edit `ROOT` for another install location. `OUT` defaults to `assets/little-kitty-player` beside this app's scripts. Copy this PR's `tools/export_kitty.py` and test into the live app first, following the repository deployment instructions. UnityPy's AudioClip decoder needs its supported native FMOD dependency (already present on this host); a decode failure is recorded in the manifest rather than replaced with placeholder audio.

Outputs are `kitty.glb`, `provenance.json` and `audio/manifest.json` with WAV files. All outputs and Python dependencies remain local and are excluded from Git. After deploying the source, add a **Little Kitty, Big City** game category using the library's Add game button, then assign **Kitty** to it using the card's Game category selector. Existing installations retain these assignments in local `data/library.json`.

## Animations and controls

Original clips: Cat_Trot, Cat_Run, Cat_Idle07, Cat_Idle03, Cat_Stretch_01, Cat_Stretch_02, Cat_Meow_JustHead, Cat_Sit_To_Lie, Cat_Lie_To_Sleep, Cat_Lie_Idle_2, Cat_Jump_InPlace_Start, Cat_Jump_Forward_Land.

Trot/run/idle/lie-idle loop and can be toggled off. The other actions play once when triggered. In Play mode, locomotion loops wait for movement input. Select the original game clips from Custom Loader's Animation menu; their names are kept for traceability. The viewer also exposes embedded GLB animation clips and the cat's audio library.

## Fidelity and validation

Unity streamed cubic scalar curves are evaluated at 30 Hz. Generic transform paths are matched to the original hierarchy by CRC32, including the CG root. Euler curves use Unity's ZXY order, converted to normalized quaternions. Mesh coordinates, rotations, triangle winding and inverse bind matrices are reflected consistently for glTF.

The game's toon/fur/procedural eye shaders are approximated with PBR materials. The exported customization base texture appears gray and retains its markings; runtime coat customization is not recreated. Non-skeletal shader and facial blend-shape channels are omitted. These are original skeletal clips, with those rendering/facial limitations.

`tests/little-kitty.mjs` requires local assets. It loads the GLB using the app's actual GLTFLoader, evaluates every clip at multiple times for finite, bounded skin deformation, checks loop/action behavior, and checks every protagonist WAV. Source-only regression checks: `node tests/embedded-motion.mjs`, `node tests/character-motion.mjs`, `node tests/play-mode.mjs`.

The existing local James Bond entry and explicit no-audio state are also retained so deployment does not remove that earlier local addition. Bond assets are not included.
