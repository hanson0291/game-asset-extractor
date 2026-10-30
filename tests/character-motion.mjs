import assert from 'node:assert/strict';
import * as THREE from '../vendor/modern/three.module.js';
import {createCharacterMotion} from '../character-motion.js';
const root=new THREE.Group();root.add(new THREE.Mesh(new THREE.BoxGeometry(1,2,.5),new THREE.MeshBasicMaterial()));
function bone(name,parent,x=0,y=0){const value=new THREE.Bone();value.name='mixamorig:'+name;value.position.set(x,y,0);parent.add(value);return value;}
const hips=bone('Hips',root,0,1),spine=bone('Spine',hips,0,.2),spine1=bone('Spine1',spine,0,.2);bone('Head',spine1,0,.4);
for(const [side,sign] of [['Left',-1],['Right',1]]){const arm=bone(side+'Arm',spine1,sign*.3,.1);bone(side+'ForeArm',arm,sign*.3,0);const leg=bone(side+'UpLeg',hips,sign*.15,-.1);const knee=bone(side+'Leg',leg,0,-.4);bone(side+'Foot',knee,0,-.4);}
const motion=createCharacterMotion(root);assert.equal(motion.hasRig,true);
motion.update(.1,{playing:true,moving:false});assert.match(motion.status,/waiting/);
motion.update(.1,{playing:true,moving:true});assert.match(motion.status,/walking/);
motion.trigger();motion.update(.1,{playing:false});assert.equal(motion.enabled,false);assert.match(motion.status,/off/);
motion.select('step');motion.trigger();let forward=0;for(let i=0;i<120;i++)forward+=motion.update(1/60).forward;
assert.ok(Math.abs(forward-.55)<1e-6,'One-shot advances exactly once');assert.equal(motion.oneShot,false);assert.match(motion.status,/complete/);
for(let i=0;i<60;i++)assert.equal(motion.update(1/60).forward,0,'Finished one-shot cannot drift');
motion.select('turn');motion.trigger();let turn=0;for(let i=0;i<150;i++)turn+=motion.update(1/60).turn;
assert.ok(Math.abs(turn-Math.PI)<1e-6,'Turn ends at exactly 180 degrees');
motion.select('step');motion.trigger();motion.update(.1);motion.stop();assert.equal(motion.oneShot,false);assert.equal(motion.update(.1).forward,0);
motion.select('brisk');assert.equal(motion.movementSpeed,1.4);motion.select('sneak');assert.equal(motion.movementSpeed,.5);
console.log('PASS: walk gating, on/off, one-shot distance, completion, cancellation, and turn angle.');
