// The character registry.
//
// This repository ships with NO characters registered and no game assets at
// all. To add one of your own: extract a model from a game you own, export it
// as a .glb, drop it under ./assets/<game>/<character>/, and add an entry
// below. See README.md ("Extract your own assets") for the full walkthrough.
//
// Every field the loader understands, shown in one example entry:
//
// {
//   id: 'example-character',        // unique id: lowercase letters, digits, dashes
//   name: 'Example Character',      // shown in the character picker
//   gameId: 'example-game',         // groups characters in the library
//   height: 1.8,                    // metres; used for framing and scale (optional)
//   model: './assets/example-game/example-character/model.glb',
//   animationModel: './assets/example-game/example-character/model.glb',
//                                   // optional rigged variant used for animation
//   animations: './assets/example-game/clips.json',
//                                   // optional external clip manifest
//   audio: './assets/example-game/example-character/audio/',
//                                   // optional folder of voice clips
//   voiceCount: 0,                  // clips in the audio folder
//   languages: ['English'],         // labels for the voice browser
//   animationCount: 0,
//   clipSettings: {                 // per-clip overrides, keyed by clip name
//     'Walk': { mode: 'loop', locomotion: true, speed: 1.0 }
//   },
//   vehicleInteraction: undefined,  // optional paired character/vehicle entry data
//   description: 'Where it came from and how it was extracted.'
// }

export const characters = [];

export function initialCharacterId() {
  const requested = new URLSearchParams(location.search).get('character');
  if (characters.some(character => character.id === requested)) return requested;
  try {
    const saved = localStorage.getItem('gae-selected-character');
    if (characters.some(character => character.id === saved)) return saved;
  } catch {}
  return characters.length ? characters[0].id : '';
}
