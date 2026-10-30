import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../vendor/modern/three.module.js';
import {characters} from '../characters.js';
import {createCharacterMotion} from '../character-motion.js';
import {createNativeVehicleEntry} from '../vehicle-entry.js';

// Decode the actual embedded animation channels without browser image loading.
const character=characters.find(c=>c.id==='ion-titan'),raw=fs.readFileSync(new URL('../'+character.animationModel,import.meta.url));
const jsonLength=raw.readUInt32LE(12),doc=JSON.parse(raw.subarray(20,20+jsonLength)),binary=raw.subarray(28+jsonLength);
const joints=new Set(doc.skins.flatMap(s=>s.joints));
const nodes=doc.nodes.map((n,i)=>{const node=joints.has(i)?new THREE.Bone():new THREE.Group();node.name=n.name||'';if(n.matrix)new THREE.Matrix4().fromArray(n.matrix).decompose(node.position,node.quaternion,node.scale);else{if(n.translation)node.position.fromArray(n.translation);if(n.rotation)node.quaternion.fromArray(n.rotation);if(n.scale)node.scale.fromArray(n.scale);}return node;});
doc.nodes.forEach((n,i)=>n.children?.forEach(child=>nodes[i].add(nodes[child])));
const root=new THREE.Group();doc.scenes[doc.scene||0].nodes.forEach(index=>root.add(nodes[index]));
function values(index){const a=doc.accessors[index],view=doc.bufferViews[a.bufferView],components={SCALAR:1,VEC3:3,VEC4:4}[a.type];assert.equal(a.componentType,5126);const stride=view.byteStride||components*4,out=[];for(let i=0;i<a.count;i++)for(let c=0;c<components;c++)out.push(binary.readFloatLE((view.byteOffset||0)+(a.byteOffset||0)+i*stride+c*4));return out;}
const clips=doc.animations.map(a=>new THREE.AnimationClip(a.name,-1,a.channels.map(channel=>{const sampler=a.samplers[channel.sampler],node=nodes[channel.target.node],path={translation:'position',rotation:'quaternion',scale:'scale'}[channel.target.path];assert.ok(node&&path);const Track=path==='quaternion'?THREE.QuaternionKeyframeTrack:THREE.VectorKeyframeTrack;return new Track(node.uuid+'.'+path,values(sampler.input),values(sampler.output));})));
const motion=createCharacterMotion(root,{clips}),interaction=createNativeVehicleEntry(motion,character);
assert.ok(interaction?.selfMounted,'Matching Titan/pilot asset is enabled');
assert.equal(createNativeVehicleEntry(motion,characters.find(c=>c.id==='mom'),{status:'ready',mainMesh:true}),null,'A complete car mesh alone cannot enable unrelated character clips');
const bad={...character,vehicleInteraction:{...character.vehicleInteraction,verified:false}};assert.equal(createNativeVehicleEntry(motion,bad),null);
for(const clip of clips){
  motion.select('glb:'+clip.name);
  const direction=clip.name.startsWith('Disembark')?'exit':'enter';
  assert.equal(interaction.begin(direction),true);assert.equal(motion.preset.id,'glb:'+clip.name,'Respect the selected original entry/exit variant');
  assert.equal(interaction.begin(direction),false,'Reject repeated E while the clip is playing');
  let result;for(let time=0;time<clip.duration+.3;time+=1/30){result=interaction.update(1/30);if(result)break;}
  assert.equal(result,direction,clip.name+' completes before switching control');assert.equal(interaction.busy,false);
  root.traverse(node=>assert.ok([...node.position,...node.quaternion].every(Number.isFinite),'Original animation transforms remain finite'));
}
interaction.begin('enter');interaction.update(.1);interaction.cancel();assert.equal(interaction.busy,false);assert.equal(motion.oneShot,false);
console.log('PASS: all 7 actual Titanfall clips, matched rig/profile, selected variants, completion, repeat guard, cancellation and unsupported car/character pairing.');
