Original vehicle-entry support
==============================

Ion Titan on the Vehicles page
-------------------------------

Select Jack Cooper or Andrew and the separate Titanfall 2 / Ion Titan vehicle, or use
Load with Jack Cooper on the vehicle card. This supports all five original
embarks and both exits with in-play variant selectors and nearest-side auto
selection. Andrew keeps his own visible rig, retargeted from the original
Cooper motion; both E and the action button play the full clip before control
changes. Other unsupported characters retain instant entry. See ion-vehicle.md for controls, texture provenance and limits.

Working: Ion Titan + Cooper (Titanfall 2)
----------------------------------------

Select Ion Titan + Cooper as the character and leave the separate vehicle
selector on None. E / the Embark button plays a synced original Titan/pilot
clip before enabling mounted movement. E again plays the original disembark
clip before returning control. Entry/exit cannot be repeated while playing;
Stop and Reset cancel safely. Fullscreen remains optional.

All five embark and both disembark clips in ion-titan-embark.glb were tested
using their actual animation channels. The selected compatible original clip
is respected. The profile is explicitly paired with this combined asset;
its animations are never applied to Mom, cats, or unrelated cars.

Pending: 007 First Light cars / Mom
----------------------------------

The installed archives contain 23,939 ANMC motion resources. A read-only scan
of ANMC and MOMA resources found a candidate with ExitVehicleEnded:
018C2F5710665671.ANMC. The original 33,096-byte resource and an audit record
are retained in tools/firstlight/original-animation-candidates/.

This is an event-string candidate, not a verified decoded entry/exit clip.
The motion format, target vehicle and skeleton/retargeting must be verified
before playback. Mom uses a different source rig. Static vehicle geometry
being fully extracted does not establish animation compatibility.

Schoolboy Runaway also contains Sit Down / Sitting Idle clips in its humanoid
muscle format and car-trunk open/close clips. Those are not verified as Mom
entering a vehicle, and are not substituted or labeled as vehicle-entry clips.

Unsupported combinations retain instant entry, with that status shown next
to the action. No procedural movement is claimed to be an original game clip.

Future verified pairs can declare a game-sourced entryAnimation profile on
the vehicle catalog: verified=true, matching characterId, and explicit enter
and exit clip IDs already bound to the selected character's motion player.
The vehicle must also have a ready main mesh. Missing/unverified pairs fail
closed to instant entry.
