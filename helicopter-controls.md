Helicopter controls
===================

Helicopter assets automatically use assisted flight rather than the road-car
controller. Press E / Pilot after starting Play. Fullscreen is optional.

Keyboard:
- Space: climb; Shift: descend.
- W/S: cyclic forward/back; A/D: lateral cyclic/strafe.
- Q/R: yaw left/right. E remains the enter/exit action.
- H: level/hover hold at the current height.

Mouse:
- Left-drag: orbit the chase camera.
- Right-drag: cyclic movement while held; release to center cyclic.
- Wheel: adjust climb/descent trim; H / Hover clears trim and holds position.
- Hold Rise/Descend buttons for mouse-controlled vertical movement.

Touch:
- Left stick: cyclic forward/back and lateral movement.
- Right stick: collective/climb command vertically and yaw horizontally.
- Hold Rise/Descend or tap Hover; drag the scene to orbit the camera.

The HUD shows heading, height above the flat launch surface (AGL, meters),
horizontal ground speed (knots), vertical speed (m/s), rotor percentage,
collective command, pitch and bank. Attitude and instrument values are taken
from the controller state. This is assisted demo flight, not a full aerodynamic
or terrain-collision simulation. Neutral vertical input arrests climb/descent;
Hover additionally damps horizontal drift and holds the captured altitude.
The demo ceiling is 150 m AGL. Land before exiting; Stop and Reset remain
available independently of flight state.

The Backdrop Helicopter visual is aligned so its nose matches forward movement,
and a procedural main rotor is added to its rotor-less extracted backdrop mesh.
The rotor animation is a visualization, not an extracted original game clip.
