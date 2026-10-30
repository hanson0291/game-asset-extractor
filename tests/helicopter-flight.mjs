import assert from 'node:assert/strict';
import * as THREE from '../vendor/modern/three.module.js';
import {createVehicleDriver} from '../vehicle-driving.js';
function setup(){const car=new THREE.Group();car.name='Vehicle: Backdrop Helicopter';car.userData.size={width:2.5,height:2.7,length:10};car.userData.vehicle={id:'backdrop-helicopter',family:'backdrop_helicopter'};return createVehicleDriver(car);}
const flight=setup();assert.equal(flight.kind,'helicopter');assert.ok(flight.car.getObjectByName('Simulated main rotor'),'Backdrop prop gets a visible main rotor');flight.start();
assert.ok(Math.abs(flight.car.getObjectByName('Flight-oriented helicopter visual').rotation.y-Math.PI)<1e-9,'Backdrop nose aligns with forward controls and rear chase camera');
for(let i=0;i<180;i++)flight.update(1/60,{lift:1});
assert.ok(flight.altitude>5&&flight.verticalSpeed>4,'Collective lifts vertically');assert.equal(flight.grounded,false);assert.ok(flight.rotorPercent>95);
const startZ=flight.car.position.z;for(let i=0;i<120;i++)flight.update(1/60,{forward:1,lateral:.2,yaw:.3});
assert.ok(flight.speed>5&&flight.car.position.z<startZ,'Cyclic moves through the air');assert.ok(flight.car.rotation.y<0,'Pedals turn right independently of road speed');assert.ok(flight.nosePitch<0&&flight.bank>0,'Attitude shows nose-down/right-bank commands');
flight.hover();const heldAltitude=flight.altitude;for(let i=0;i<300;i++)flight.update(1/60);
assert.ok(flight.speed<.01&&Math.abs(flight.altitude-heldAltitude)<.1&&Math.abs(flight.verticalSpeed)<.01,'Hover hold damps motion and holds altitude');
for(let i=0;i<600;i++)flight.update(1/60,{lift:-1});assert.equal(flight.altitude,0);assert.equal(flight.verticalSpeed,0);assert.equal(flight.grounded,true,'Landing clamps to the ground');
flight.reset();assert.equal(flight.altitude,0);assert.equal(flight.rotorPercent,0);assert.equal(flight.speed,0);assert.equal(flight.car.rotation.y,0);
flight.start();for(let i=0;i<240;i++)flight.update(1/60,{lift:1});const before=flight.heading;flight.hover();for(let i=0;i<60;i++)flight.update(1/60,{yaw:1});assert.ok(flight.heading>before,'Hover yaw changes compass heading');
for(let i=0;i<2400;i++)flight.update(1/60,{lift:1});assert.ok(flight.altitude<=150,'Ceiling is enforced');
const simulate=dt=>{const f=setup();f.start();for(let elapsed=0;elapsed<4-1e-5;elapsed+=dt)f.update(dt,{lift:.7,forward:.3,yaw:.1});return f;};
assert.ok(simulate(1/30).car.position.distanceTo(simulate(1/60).car.position)<1e-6,'Flight is consistent at 30/60 FPS');
console.log('PASS: helicopter detection, rotor, collective lift, cyclic, independent yaw, attitude, hover hold, landing, reset, ceiling and frame-rate stability.');
