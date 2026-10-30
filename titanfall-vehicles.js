// Built-in vehicle catalog entries.
//
// Ships EMPTY: this repository contains no extracted vehicles. Vehicles are
// normally registered through a runtime catalog at
// ./assets/<game>-vehicles/catalog.json (see vehicle-catalog.js, which merges
// that file with this list and tolerates it being absent). Add entries here
// only if you want vehicles baked into the code; the entry shape mirrors a
// character entry plus { family, status, mainMesh, triangles, enterCount,
// exitCount } — see ion-vehicle.md for a worked example.
export const titanfallVehicles = [];
