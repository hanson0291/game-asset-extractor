import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../vendor/modern/three.module.js';
import {createCharacterMotion} from '../character-motion.js';
import {characters} from '../characters.js';
// Resolve the browser import map in memory, without installing another Three copy.
const threeURL=new URL('../vendor/modern/three.module.js',import.meta.url).href;
const moduleURL=source=>'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
const utilsURL=moduleURL(fs.readFileSync(new URL('../vendor/modern/BufferGeometryUtils.js',import.meta.url),'utf8').replace("from 'three'",'from '+JSON.stringify(threeURL)));
const loaderSource=fs.readFileSync(new URL('../vendor/modern/GLTFLoader.js',import.meta.url),'utf8').replace("from 'three'",'from '+JSON.stringify(threeURL)).replace("from './BufferGeometryUtils.js'",'from '+JSON.stringify(utilsURL));
const {GLTFLoader}=await import(moduleURL(loaderSource));
const character=characters.find(c=>c.id==='little-kitty');
assert.equal(character.gameId,'little-kitty-big-city');
const raw=fs.readFileSync(new URL('../assets/little-kitty-player/kitty.glb',import.meta.url));
assert.equal(raw.toString('ascii',0,4),'glTF');assert.equal(raw.readUInt32LE(8),raw.length);
const length=raw.readUInt32LE(12),doc=JSON.parse(raw.subarray(20,20+length));
assert.equal(doc.skins[0].joints.length,58);assert.equal(doc.animations.length,12);
// Test actual skeletal deformation headlessly; texture decoding is covered by the render check.
for(const material of doc.materials)delete material.pbrMetallicRoughness.baseColorTexture;
let encoded=Buffer.from(JSON.stringify(doc));encoded=Buffer.concat([encoded,Buffer.alloc((4-encoded.length%4)%4,32)]);
const header=Buffer.alloc(20);header.write('glTF');header.writeUInt32LE(2,4);header.writeUInt32LE(20+encoded.length+raw.length-20-length,8);header.writeUInt32LE(encoded.length,12);header.writeUInt32LE(0x4e4f534a,16);
const bytes=Buffer.concat([header,encoded,raw.subarray(20+length)]);
const gltf=await new Promise((resolve,reject)=>new GLTFLoader().parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'',resolve,reject));
const root=gltf.scene;root.updateMatrixWorld(true);
const rest=new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
for(const clip of gltf.animations){
 const mixer=new THREE.AnimationMixer(root);mixer.clipAction(clip).play();
 for(const fraction of [0,.25,.5,.9]){
  mixer.setTime(clip.duration*fraction);root.updateMatrixWorld(true);
  root.traverse(o=>{if(o.isSkinnedMesh){o.skeleton.update();o.computeBoundingBox();}});
  const box=new THREE.Box3().setFromObject(root),size=box.getSize(new THREE.Vector3());
  assert.ok([...box.min,...box.max].every(Number.isFinite),clip.name+' finite bounds');
  assert.ok(size.length()<rest.length()*4,clip.name+' no exploding skin');
 }
 mixer.stopAllAction();
 assert.ok(clip.tracks.some(t=>t.name.endsWith('.quaternion')),clip.name+' rotations');
}
const controller=createCharacterMotion(root,{clips:gltf.animations,clipSettings:character.clipSettings});
controller.select('glb:Cat_Trot');assert.equal(controller.preset.mode,'loop');assert.equal(controller.movementSpeed,.8);
controller.update(.1,{playing:true,moving:true});controller.trigger();assert.equal(controller.enabled,false);
controller.select('glb:Cat_Stretch_01');assert.equal(controller.preset.mode,'once');controller.trigger();controller.update(controller.preset.duration+.01);assert.equal(controller.oneShot,false);
const manifest=JSON.parse(fs.readFileSync(new URL('../assets/little-kitty-player/audio/manifest.json',import.meta.url)));
assert.equal(manifest.tracks.length,character.voiceCount);assert.equal(manifest.errors.length,0);
for(const track of manifest.tracks){assert.match(track.original_name,/^vo_(cat_protagonist|meowbutton)_/);const data=fs.readFileSync(new URL('../assets/little-kitty-player/audio/'+track.file,import.meta.url));assert.ok(data.length>44);assert.equal(data.toString('ascii',0,4),'RIFF');}
console.log('PASS: 58-bone cat, 12 deforming original clips, loop/action controls, 72 playable protagonist WAVs.');
