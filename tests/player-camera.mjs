import assert from 'node:assert/strict';
import * as THREE from '../vendor/modern/three.module.js';
import {updatePlayerCamera} from '../player-camera.js';

const camera=new THREE.PerspectiveCamera(45,1,.01,250),actor=new THREE.Group();
const parent=new THREE.Group();parent.position.set(3,0,-2);parent.add(actor);
const target=new THREE.Vector3(0,.9,0),direction=new THREE.Vector3();
for(const height of [1.75,.45]){
  actor.userData.height=height;actor.position.set(1,height/2,4);
  updatePlayerCamera(camera,actor,{firstPerson:true,yaw:0,pitch:0,distance:5,target});
  assert.ok(camera.position.distanceTo(new THREE.Vector3(4,height*.92,2))<1e-9,'Camera sits at character eye height');
  assert.equal(actor.visible,false,'Hide model so the camera cannot see inside the head');
  assert.equal(camera.fov,75);camera.getWorldDirection(direction);
  assert.ok(direction.distanceTo(new THREE.Vector3(0,0,-1))<1e-9,'Forward camera matches forward movement');
  updatePlayerCamera(camera,actor,{firstPerson:true,yaw:Math.PI/2,pitch:-.6,distance:5,target});
  camera.getWorldDirection(direction);assert.ok(direction.x<-.8&&direction.y>.5,'Yaw and upward look work');
  updatePlayerCamera(camera,actor,{firstPerson:true,yaw:0,pitch:.6,distance:5,target});
  camera.getWorldDirection(direction);assert.ok(direction.y<-.5,'Downward look works');
  updatePlayerCamera(camera,actor,{firstPerson:false,yaw:.65,pitch:.25,distance:5,target});
  assert.equal(actor.visible,true,'Restore character for third person and preview');assert.equal(camera.fov,45);
  assert.ok(Math.abs(camera.position.distanceTo(target)-5)<1e-9,'Restore orbit camera distance');
}
console.log('PASS: first-person eye height for humans/cats, movement-aligned look, pitch, hidden model, and third-person restoration.');
