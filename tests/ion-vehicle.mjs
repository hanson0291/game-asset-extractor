import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../vendor/modern/three.module.js';
import {titanfallVehicles} from '../titanfall-vehicles.js';
import {loadVehicleCatalog} from '../vehicle-catalog.js';
import {prepareIonModel,createIonEntry} from '../ion-entry.js';
import {createVehicleDriver,updateVehicleCamera} from '../vehicle-driving.js';
const vehicle=titanfallVehicles[0];
const threeURL=new URL('../vendor/modern/three.module.js',import.meta.url).href;
const moduleURL=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const utilsURL=moduleURL(fs.readFileSync(new URL('../vendor/modern/BufferGeometryUtils.js',import.meta.url),'utf8').replace("from 'three'",'from '+JSON.stringify(threeURL)));
const loaderSource=fs.readFileSync(new URL('../vendor/modern/GLTFLoader.js',import.meta.url),'utf8').replace("from 'three'",'from '+JSON.stringify(threeURL)).replace("from './BufferGeometryUtils.js'",'from '+JSON.stringify(utilsURL));
const {GLTFLoader}=await import(moduleURL(loaderSource));
function readDoc(path){const raw=fs.readFileSync(new URL('../'+path,import.meta.url)),n=raw.readUInt32LE(12);assert.equal(raw.readUInt32LE(8),raw.length);return {raw,n,doc:JSON.parse(raw.subarray(20,20+n)),binary:raw.subarray(28+n)};}
async function parse(path){
 const {raw,n,doc}=readDoc(path);
 for(const mat of doc.materials){for(const obj of [mat,mat.pbrMetallicRoughness])if(obj)for(const key of Object.keys(obj))if(key.endsWith('Texture'))delete obj[key];}
 let data=Buffer.from(JSON.stringify(doc));data=Buffer.concat([data,Buffer.alloc((4-data.length%4)%4,32)]);
 const h=Buffer.alloc(20);h.write('glTF');h.writeUInt32LE(2,4);h.writeUInt32LE(20+data.length+raw.length-20-n,8);h.writeUInt32LE(data.length,12);h.writeUInt32LE(0x4e4f534a,16);
 const bytes=Buffer.concat([h,data,raw.subarray(20+n)]);
 return await new Promise((ok,bad)=>new GLTFLoader().parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'',ok,bad));
}
const main=readDoc(vehicle.model),pair=readDoc(vehicle.animationModel);
assert.equal(main.doc.skins.length,1);assert.equal(pair.doc.skins.length,2);
assert.equal(main.doc.animations.length,7);assert.equal(pair.doc.animations.length,7);
assert.equal(pair.doc.animations.filter(a=>a.name.startsWith('Embark')).length,5);
assert.equal(pair.doc.animations.filter(a=>a.name.startsWith('Disembark')).length,2);
assert.ok(main.doc.nodes.some(n=>n.extras?.ionRole==='titan-mesh'));
assert.ok(!main.doc.nodes.some(n=>n.extras?.ionRole==='pilot-mesh'),'Gallery mesh contains only the Titan');
assert.equal(main.doc.materials.find(m=>m.name==='t_m_ion_nose_art_v12').alphaMode,'BLEND','Nose art uses its real opacity mask');
assert.ok(main.doc.materials.every(m=>m.pbrMetallicRoughness.baseColorTexture),'Every Titan material is textured');
for(const image of main.doc.images){const v=main.doc.bufferViews[image.bufferView];assert.ok(v.byteOffset+v.byteLength<=main.binary.length);}
const merged=await loadVehicleCatalog(async()=>({ok:true,json:async()=>({game:'007 First Light',complete:true,vehicles:[{id:'car',name:'Car',family:'car',model:'car.glb'}]})}));
assert.equal(merged.vehicles.length,2);assert.deepEqual(merged.games.map(g=>g.name),['007 First Light','Titanfall 2']);
const fallback=await loadVehicleCatalog(async()=>{throw Error('Offline');});assert.equal(fallback.vehicles.length,1);assert.match(fallback.warning,/Offline/);
const gltf=await parse(vehicle.animationModel),root=gltf.scene,holder=new THREE.Group();
const box=prepareIonModel(root),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
assert.ok(size.y>5&&size.y<9,'Titan has metre-scale dimensions');
root.position.sub(new THREE.Vector3(center.x,box.min.y,center.z));holder.add(root);holder.position.set(4,0,2);holder.userData.size={width:size.x,height:size.y,length:size.z};holder.userData.vehicle={id:vehicle.id,family:vehicle.family};
const pilot=root.getObjectByName('Cooper_Pilot');assert.equal(pilot.visible,false);
const entry=createIonEntry(root,gltf.animations,{id:'jack-cooper'},vehicle);assert.ok(entry?.paired);assert.equal(entry.enterOptions.length,6);assert.equal(entry.exitOptions.length,2);
assert.equal(createIonEntry(root,gltf.animations,{id:'mom'},vehicle),null,'Incompatible characters are never relabeled as Cooper');
function advance(direction){let complete=null;for(let i=0;i<240;i++){complete=entry.update(1/30);if(i%20===0)root.traverse(n=>assert.ok([...n.position,...n.quaternion].every(Number.isFinite),'Finite source transforms'));if(complete)break;}assert.equal(complete,direction);assert.equal(pilot.visible,false);assert.equal(entry.busy,false);}
for(const enter of vehicle.entryAnimation.enter){
 for(const exit of vehicle.entryAnimation.exit){
  assert.equal(entry.setVariant('enter',enter),true);assert.equal(entry.setVariant('exit',exit),true);
  assert.equal(entry.begin('enter',new THREE.Vector3()),true);assert.equal(pilot.visible,true);assert.equal(entry.begin('enter'),false);assert.equal(entry.setVariant('exit',exit),false);
  advance('enter');
  holder.position.x+=.25;holder.rotation.y+=.1;holder.updateMatrixWorld(true);
  assert.equal(entry.begin('exit'),true);advance('exit');const pose=entry.getExitPose();assert.ok(pose?.position.toArray().every(Number.isFinite));assert.ok(pose.position.distanceTo(holder.position)>2,'Pilot exits onto the ground outside the mech');
 }
}
entry.setVariant('enter','auto');assert.equal(entry.begin('enter',holder.position.clone()),true);entry.update(.1);entry.cancel();assert.equal(pilot.visible,false);assert.equal(entry.busy,false);
const driver=createVehicleDriver(holder);assert.equal(driver.kind,'mech');driver.captureRest();
const leg=holder.getObjectByName('def_l_thigh'),legRest=leg.quaternion.clone();
const origin=holder.position.clone();driver.update(1,{throttle:1});assert.ok(leg.quaternion.angleTo(legRest)>.01,'Mounted gait moves the actual Titan leg rig');assert.ok(holder.position.distanceTo(origin)>1);assert.ok(driver.speed>0);
const heading=holder.rotation.y;driver.update(.5,{steer:1,brake:true});assert.notEqual(holder.rotation.y,heading,'Mech can turn without car wheelbase steering');
driver.stop();assert.equal(driver.speed,0);driver.reset();assert.ok(holder.position.distanceTo(origin)<1e-6);
const camera=new THREE.PerspectiveCamera();updateVehicleCamera(camera,driver,0,{instant:true});assert.ok(camera.position.distanceTo(holder.position)>size.y,'Camera frames the whole Titan');
console.log('PASS: textured Ion-only vehicle, paired rigs, 7 original clips / 10 entry-exit combinations, side selection, pose bridging, pilot visibility, exit placement, cancellation, mech controls/camera and multi-game catalog fallback.');

// Andrew keeps his own mesh while E's paired entry controller drives the source
// trajectory and adapted bone rotations. Completion/cancellation restores his rig.
const andrew=await parse('./assets/schoolboy-andrew/andrew-rigged.glb');
const actor=new THREE.Group(),ab=new THREE.Box3().setFromObject(andrew.scene),as=ab.getSize(new THREE.Vector3()),ac=ab.getCenter(new THREE.Vector3());
andrew.scene.position.sub(ac);actor.add(andrew.scene);actor.scale.setScalar(1.75/as.y);actor.position.y=.875;actor.updateMatrixWorld(true);
const source2=await parse(vehicle.animationModel);prepareIonModel(source2.scene);source2.scene.position.set(6,0,4);source2.scene.rotation.y=.7;
const scene2=new THREE.Group();scene2.add(source2.scene,actor);scene2.updateMatrixWorld(true);
const ae=createIonEntry(source2.scene,source2.animations,{id:'andrew'},vehicle,actor);assert.ok(ae?.retargeted,'Andrew has animated entry rather than instant entry');
const ah=andrew.scene.getObjectByName('mixamorigHips')||andrew.scene.getObjectByName('mixamorig:Hips');assert.ok(ah);
const originalHip=ah.position.clone(),originalArm=(andrew.scene.getObjectByName('mixamorigLeftArm')||andrew.scene.getObjectByName('mixamorig:LeftArm')).quaternion.clone();
const sh=source2.scene.getObjectByName('Cooper_Hips'),sp=source2.scene.getObjectByName('Cooper_Pilot');
for(const enter of vehicle.entryAnimation.enter)for(const exit of vehicle.entryAnimation.exit){
 ae.setVariant('enter',enter);ae.setVariant('exit',exit);
 for(const direction of ['enter','exit']){
  assert.equal(ae.begin(direction,actor.position),true);assert.equal(sp.visible,false,'Never replace Andrew with the Cooper mesh');
  assert.equal(ae.begin(direction),false);let result=null,frames=0;
  while(!result&&frames++<240){result=ae.update(1/30);if(!result){scene2.updateMatrixWorld(true);assert.ok(ah.getWorldPosition(new THREE.Vector3()).distanceTo(sh.getWorldPosition(new THREE.Vector3()))<1e-4,'Andrew follows the original pilot hip trajectory');}}
  assert.equal(result,direction);assert.ok(ah.position.distanceTo(originalHip)<1e-8,'Restore walking rig after each clip');
 }
}
ae.begin('enter');ae.update(.7);assert.ok(ah.position.distanceTo(originalHip)>1);ae.cancel();assert.ok(ah.position.distanceTo(originalHip)<1e-8);assert.equal(ae.busy,false);assert.equal(sp.visible,false);
assert.ok((andrew.scene.getObjectByName('mixamorigLeftArm')||andrew.scene.getObjectByName('mixamorig:LeftArm')).quaternion.angleTo(originalArm)<1e-7,'Cancellation restores limb pose');
assert.equal(createIonEntry(source2.scene,source2.animations,{id:'andrew'},vehicle),null,'A missing target rig never silently substitutes Cooper');
console.log('PASS: actual Andrew rig retarget, all 10 entry/exit combinations, moving/rotated source trajectory, no Cooper substitution, repeat guard and complete pose restoration.');
