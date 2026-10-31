# Game Asset Extractor

A browser-based workspace for **assets you extract from your own games**: view
characters, browse their voice lines, walk them around in a 3D scene, drive and
fly the vehicles, and invite a second player in — all from one local page.

**This repository contains no game assets.** No models, textures, audio, or
animation data from any game are included. The app ships empty on purpose —
the instructions below walk you through extracting assets from games you own
and dropping them in. The code is MIT-licensed (see `LICENSE`); anything you
extract remains the property of its game's rights holders, so keep extracted
files local — the included `.gitignore` already keeps them out of git.

## Quick start

Requires [Node.js](https://nodejs.org) 18+ (no npm install — built-ins only).

```sh
node server.cjs
```

Then open **http://127.0.0.1:5187/**. On Windows you can double-click
`start.cmd` instead. Fresh out of the box the library is empty; that's
expected — see "Extract your own assets".

(Any static file server can serve the pages, but the bundled server also
provides the library API, byte-range audio seeking, and multiplayer, so it's
the recommended way to run it.)

## What you get

- **Character library** (`index.html`) — organize extracted characters by
  game, add/rename game categories, assign characters to games.
- **Custom Loader / Play mode** (`custom-loader.html`) — load a character
  into an environment and play: third- and first-person cameras, WASD +
  mouse/pointer-lock, touch joysticks on mobile, gamepad support, a first-
  person weapon HUD with an on-screen Fire button, talk/voice playback, and
  drivable vehicles — ground vehicles, helicopters (see
  `helicopter-controls.md`), fixed-wing aircraft (`airplane-controls.md`),
  and mechs with animated enter/exit sequences.
- **Vehicle library** (`vehicles.html`) — browse and load registered
  vehicles; at the McKenzie Field hangar environment, all fixed-wing
  aircraft park on the runway ready to board.
- **Model viewer** (`viewer.html`) — inspect a single GLB/glTF/OBJ with
  orbit controls, wireframe, lighting controls, and PNG export.
- **Multiplayer** — the host starts a session from the Play page (room code
  defaults to **123456** and can be customized); a second player joins with
  the link. Only the computer running the server can start/stop the room.
- **Extraction tools** (`tools/`) — the actual exporter scripts used for the
  worked examples below.

## Folder layout

```
characters.js            the character registry (edit this to add characters)
titanfall-vehicles.js    built-in vehicle entries (ships empty)
environments/catalog.js  environment list (models themselves are not included)
data/library.json        game categories + character assignments (via the UI)
assets/                  YOUR extracted files live here (gitignored)
  <game>/<character>/    model .glb, optional animation .glb, audio/ clips
  <game>-vehicles/       catalog.json + vehicle .glb files
tools/                   exporter scripts (Python) + registration helpers
blender/                 procedural environment generator (Blender Python)
tests/                   node test suites for the runtime modules
server.cjs               the local server (static files + APIs + sessions)
session-server.cjs       the multiplayer session module used by server.cjs
```

## Extract your own assets

The pipeline is always the same four steps: **get the model out of the game →
convert it to GLB → place it in `assets/` → register it.** Details:

### 1. Before you start

- Work only from a game you legally own, installed locally. The tools below
  only *read* game files; never modify a game installation.
- Check the game's terms — extraction for personal use is common in modding
  communities, but redistributing extracted assets is not. Don't upload them.

### 2. Identify the engine and pick an extractor

| Engine | Typical files | Common tools |
| --- | --- | --- |
| Unity | `*_Data/` folders, `.assets`, `sharedassets*.assets` | **AssetStudio** (browse/export meshes, textures, AudioClips, Animator clips), **UABEA** (raw bundle inspection) |
| Unreal | `.pak` / `.ucas`+`.utoc` | **FModel** (export PSK/PSKX + animations), then Blender's PSK importer |
| Source / others | varies | The game's modding community tools; export FBX or OBJ where possible |

In AssetStudio: load the game's data folder, filter by *Mesh*, *Texture2D*,
*AnimationClip*, or *AudioClip*, and export the pieces for one character
together so names stay consistent.

### 3. Convert to GLB in Blender

Import the export (FBX/OBJ/PSK) into [Blender](https://www.blender.org),
then:

- Delete importer junk (empty roots are fine to keep if the skeleton needs
  them), apply scale so the character stands at real-world metres tall, and
  face −Z or +Z consistently — note what you chose in the registry entry's
  `description` so future-you remembers.
- Keep the armature and animation actions in the same file where you can;
  export a second, rig-focused GLB as the `animationModel` only if your
  static export and animation export differ.
- Export **glTF Binary (.glb)** with animations included. One self-contained
  `.glb` per model keeps the loader happy (it also reads `.gltf` + companion
  files and `.obj` geometry in the viewer).

### 4. Place the files and register the character

```
assets/<game-slug>/<character-slug>/
  model.glb            (required)
  model-rigged.glb     (optional animation variant)
  audio/               (optional .wav/.ogg/.mp3 voice clips)
```

Open `characters.js` — it contains a fully commented example entry listing
every field (id, name, gameId, height, model, animationModel, audio,
voiceCount, languages, clipSettings, description). Copy it, point it at your
files, reload the page, and your character is in the picker. Game categories
themselves are managed on the library page (they're stored in
`data/library.json` by the server).

Voice lines: drop the clips into the character's `audio/` folder and set
`voiceCount`/`languages`; the voice browser picks them up for search and
playback. The loader probes clip files by name pattern — keep the exporter's
original filenames.

### 5. Environments

Three environments are **procedural** — no game files involved. Install
Blender and run `blender/generate_environments.py` to generate
`environments/forest.glb`, `rocks.glb`, `course.glb` and `layouts.json`
(the script header and `blender/README.md` explain the VS Code task setup;
the generator uses a fixed seed, so output is reproducible).

To add an environment of your own (extracted or modelled), export a GLB into
`environments/` and add an entry to `environments/catalog.js`; the entry
shape — including the optional `runway` block that triggers the parked-
aircraft fleet — is documented by the existing entries.

### 6. Vehicles (optional, more involved)

Vehicles register through `assets/<game>-vehicles/catalog.json` (merged at
runtime by `vehicle-catalog.js`; a missing file is fine). Driving, flight,
and entry animations are keyed off the entry's `family` and clip names.
This is the advanced end of the pool — the worked example is worth reading
first: `ion-vehicle.md` documents a complete mech extraction, and
`tools/ion/prepare_ion.py` is its exporter.

### Worked examples included

- `tools/export_kitty.py` + `little-kitty.md` — a Unity cat character, start
  to finish.
- `tools/catquest/` + `cat-quest-iii.md` — exporter, inspector, and the
  `register.mjs` helper that writes registry entries for you.
- `tools/ion/prepare_ion.py` + `ion-vehicle.md` — the mech + paired
  character/vehicle entry animations.
- `vehicle-entry-support.md` — how native entry/exit animations are wired.

## Tests

```sh
node tests/play-mode.mjs          # drives the real Play-mode handlers
node tests/airplane-flight.mjs    # flight model
node tests/helicopter-flight.mjs  # helicopter model
# …and the rest of tests/
```

The runtime suites pass asset-free. Two kinds of suites will fail until you
feed them: `environment-events` reads the generated `environments/layouts.json`
(run the Blender generator in §5), and the suites named after specific games
(`catquest`, `little-kitty`, `ion-vehicle`, `model-parity`, …) read real
extracted files and fail with "file not found" until you've extracted those
assets yourself — they're kept as executable documentation of what a correct
extraction looks like. One deliberate divergence: `tests/play-mode.mjs` here
carries a small fixture registry entry instead of importing `characters.js`,
so it passes even though the shipped registry is empty.

## License

The code is MIT-licensed — see `LICENSE`. Extracted game assets are not
covered by that license and are not part of this repository.
