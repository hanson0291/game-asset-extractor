import assert from 'node:assert/strict';
import {fixedWingVehicles,runwayParking} from '../runway-fleet.js';

const catalogs=[{id:'007-first-light',vehicles:[
  {id:'cargo-plane',name:'Cargo Plane',family:'plane',model:'./cargo.glb',status:'partial'},
  {id:'drone-webb',name:'Drone Webb',family:'drone_webb',model:'./webb.glb'},
  {id:'aston-martin-valhalla-2025',name:'Aston Martin Valhalla',family:'car',model:'./car.glb'},
  {id:'camera-drone',name:'Camera Drone',family:'drone',model:'./drone.glb'},
  {id:'rescue-helicopter',name:'Rescue Helicopter',family:'helicopter',model:'./heli.glb'},
  {id:'mystery-jet',name:'Mystery Jet',family:'jet',model:null},
]}];
assert.deepEqual(fixedWingVehicles(catalogs).map(vehicle=>vehicle.id),['cargo-plane','drone-webb'],'Only fixed-wing aircraft with models join the fleet');
assert.deepEqual(fixedWingVehicles([]),[],'No catalogs, no fleet');
assert.deepEqual(fixedWingVehicles([{vehicles:[{id:'cargo-plane',name:'Cargo Plane',model:'./a.glb'}]},{vehicles:[{id:'cargo-plane',name:'Cargo Plane',model:'./a.glb'}]}]).length,1,'Duplicate catalog entries park once');

const runway={center:[40,0,40],length:320};
const slots=runwayParking(runway,[{length:60},{length:14},{length:20}]);
assert.equal(slots.length,3);
assert.ok(slots.every(slot=>slot.z===40&&slot.y===0),'Slots sit on the runway centerline');
assert.ok(slots.every(slot=>slot.heading===-Math.PI/2),'Every aircraft faces the same way down the strip');
assert.ok(slots[0].x<slots[1].x&&slots[1].x<slots[2].x,'Slots line up nose to tail');
assert.equal((slots[0].x-30+slots[2].x+10)/2,40,'The line is centered on the runway center');
assert.equal(slots[1].x-slots[0].x,30+6+7,'Neighbouring aircraft keep the 6 m gap');
for(const slot of slots)assert.ok(Math.abs(slot.x-40)<=152,'Slots stay on the strip');

const crowd=runwayParking(runway,Array.from({length:12},()=>({length:40})));
assert.equal(crowd[1].x-crowd[0].x,42,'An over-long line drops to the 2 m gap instead of overlapping');
assert.equal((crowd[0].x-20+crowd[11].x+20)/2,40,'An over-long line stays centered');
console.log('PASS: runway fleet selection (fixed-wing only, modeled, deduped) and parking layout (centered, gapped, no overlap).');
