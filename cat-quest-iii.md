# Cat Quest III local character collection

Source: `E:/SteamLibrary/steamapps/common/CatQuest_Purribean/Cat Quest III_Data`.
The game installation is read only during extraction.

The game uses layered SpriteRenderer characters rather than volumetric cat meshes.
The local GLBs embed the original sprite PNGs, preserve each prefab's transform
hierarchy and pivots, and separate layers using the original sprite sorting order.
The library labels them **2.5D SPRITES**. They also load in Custom Loader.
The catalog contains 53 entries, including alternate appearances and the original
concert crowd assembly; this is not a claim of 53 distinct named identities.

## Coverage and limits

The collection includes the playable cats, named feline NPCs, pirate and peasant
cats, sibling and Gentlebro head variants, ghost forms, and tavern appearances.
Concert, Lonely Cave, Chimeowra and watchtower feline appearances are included.
Each entry has a `provenance.json` next to its model, listing the source prefab,
asset object IDs, sprite parts and any explicit source-sprite substitutions.
Duplicate scene instances and rat-only enemy prefabs are excluded. Equippable
player armor combinations are not separate character identities.

These are static prefab poses. Native sprite-swap animations, gameplay logic,
voice clips and runtime outfit switching are not exported. Custom rim lighting
is approximated using unlit materials, and additive glow sprites are omitted.
Some original sprites are themselves complete flat NPC illustrations.

## Files and reproduction

- `catquest-characters.js`: shared metadata imported by `characters.js`.
- `assets/cat-quest-iii/`: local models, extraction catalog and provenance.
- `tools/catquest/inspect_catquest.py`: inventories local assets and bundles.
- `tools/catquest/export_catquest.py`: reconstructs the character GLBs.
- `tools/catquest/register.mjs`: registers exports without replacing other games.
- `tools/catquest/render_check.py`: background Blender contact-sheet check.
- `tests/catquest.mjs`: validates GLBs, embedded PNGs, Three.js loading, category
  assignments and Custom Loader sorting, including renamed categories.

The Python tools use the existing `tools/python-deps` UnityPy/Pillow/NumPy
installation and the verified Unity version `2022.3.14f1`. Run the inventory
before the exporter. Registration is run from the parent workspace containing
both the live `character-extractor` and the `three-d-web-apps` source repository.
The original library data was preserved as `data/library.before-catquest.json`.

Game models, images, local catalog data and dependency binaries stay outside Git.
Game categories sort alphabetically in the library, its assignment menus and the
Custom Loader character choices; renaming categories preserves that ordering.
