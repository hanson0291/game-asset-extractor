// Exercise actual loader event handlers without controlling the user's browser.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as THREE from '../vendor/modern/three.module.js';
import {updatePlayerCamera} from '../player-camera.js';
import {createVehicleDriver,updateVehicleCamera} from '../vehicle-driving.js';
import {createNativeVehicleEntry} from '../vehicle-entry.js';
import {motionPresets,createCharacterMotion} from '../character-motion.js';
// Fixture registry: in this standalone repo ../characters.js ships EMPTY (no
// extracted assets), but the native-entry scenario below needs one profile
// carrying the Ion Titan's vehicleInteraction shape. Model paths are never
// fetched — the harness stubs the loaders.
const characters=[{id:'ion-titan',name:'Ion Titan + Cooper',gameId:'titanfall-2',model:'./assets/titanfall2-ion-titan/ion-titan-embark.glb',animationModel:'./assets/titanfall2-ion-titan/ion-titan-embark.glb',vehicleInteraction:{kind:'self',source:'game',verified:true,game:'Titanfall 2',enter:['glb:Embark - kneel front','glb:Embark - kneel behind','glb:Embark - kneel left','glb:Embark - kneel right','glb:Embark - stand front'],exit:['glb:Disembark - stand','glb:Disembark - crouch']},description:'Test fixture mirroring the worked example in ion-vehicle.md.'}];
import {environments} from '../environments/catalog.js';
import {fixedWingVehicles,runwayParking} from '../runway-fleet.js';

class Element {
  constructor(tag='div'){this.tag=tag;this.children=[];this.options=this.children;this.value='';this.dataset={};this.style={};this.attributes={};this.listeners=new Map();this.disabled=false;this.hidden=false;this.classList={add(){},remove(){},toggle(){}};}
  append(...children){this.children.push(...children);if(this.tag==='select'&&!this.value)this.value=children[0]?.value||'';}
  replaceChildren(){this.children=[];this.options=this.children;this.value='';}
  setAttribute(name,value){this.attributes[name]=value;}
  removeAttribute(name){delete this.attributes[name];}
  addEventListener(type,callback){this.listeners.set(type,callback);}
  querySelector(){return new Element();}
  querySelectorAll(){return [{childNodes:[{textContent:''}]},{childNodes:[{textContent:''}]}];}
  focus(){this.focused=true;}
  hasPointerCapture(){return false;}
  setPointerCapture(){}
  closest(){return this.editable?this:null;}
}
const elements=new Map();
const html=fs.readFileSync(new URL('../custom-loader.html',import.meta.url),'utf8');
for(const match of html.matchAll(/<(\w+)[^>]*\bid="([^"]+)"[^>]*>/g)){
  const element=new Element(match[1]);element.disabled=/\bdisabled\b/.test(match[0]);elements.set('#'+match[2],element);
}
assert.equal(elements.get('#firstPersonScene').disabled,true,'First person stays disabled until a scene loads');
const document={body:new Element(),querySelector:id=>elements.get(id),createElement:tag=>new Element(tag),addEventListener(){},fullscreenElement:null,exitFullscreen:async()=>{document.fullscreenElement=null;}};
const viewport=elements.get('#sceneViewport');viewport.requestFullscreen=async()=>{document.fullscreenElement=viewport;};
const windowHandlers=new Map();
const context=vm.createContext({THREE,GLTFLoader:class{},characters,environments,motionPresets,createCharacterMotion,updatePlayerCamera,createVehicleDriver,updateVehicleCamera,createNativeVehicleEntry,
  // Stubs for the collaborators the loader gained with the HUD, cockpit, talk and
  // multiplayer modules: the sandbox strips the loader's imports, so every name it
  // uses must be provided here. Only the shapes the loader touches are modelled.
  createCharacterTalk:()=>({toggle(){},stop(){},refresh(){},setCharacter:async()=>{}}),
  createFirstPersonHud:()=>({weaponCount:0,weaponName:'',update(){},configure(){},cycleWeapon(){}}),
  createTitanCockpit:()=>({active:false,interactive:false,enter(){},exit(){},update(){},render(){},toggleInteractive(){},setInteractive(){}}),
  DEFAULT_SCREEN_URL:'',
  createMultiplayer:()=>({update(){}}),
  prepareIonModel:()=>null,createIonEntry:()=>null,applyStudioEnvironment:()=>{},
  applyCockpitCamera:()=>{},setCockpitCulling:()=>{},updateCockpitOccluders:()=>{},restoreCockpitOccluders:()=>{},cockpitFrame:{},
  fixedWingVehicles,runwayParking,
  loadVehicleCatalog:async()=>({vehicles:[],games:[]}),
  initialCharacterId:()=> 'mom',document,window:{scrollY:0,scrollTo(){},addEventListener:(name,callback)=>windowHandlers.set(name,callback)},
  fetch:async()=>({ok:false}),URLSearchParams,location:{search:''},navigator:{getGamepads:()=>[],userAgent:'play-mode-test'},setTimeout,clearTimeout,setInterval,clearInterval,HTMLElement:Element,requestAnimationFrame(){}});
const source=fs.readFileSync(new URL('../custom-loader.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'');
vm.runInContext(source+`\n globalThis.testPlay={
  prepare(){world=new THREE.Group();actor=new THREE.Group();actor.userData.height=1.75;actor.position.y=.875;world.add(actor);spawn.copy(actor.position);camera=new THREE.PerspectiveCamera(45,1,.01,250);},
  state(){return {playing,firstPerson,pitch,visible:actor.visible,fov:camera.fov,position:actor.position.clone()};},
  fullscreenChanged,
  vehicle(){const car=new THREE.Group();car.position.set(4,0,0);car.userData.size={width:2,height:1.4,length:4.8};world.add(car);vehicleDriver=createVehicleDriver(car);},
  drivingState(){return {driving,speed:vehicleDriver?.speed,car:vehicleDriver?.car.position.clone()};},
  driveTouch(){moveInput.set(.4,-1);updateDriving(1);},
  nativeVehicle(){
    const profile=characters.find(c=>c.id==='ion-titan');
    const pivot=new THREE.Group();actor.add(pivot);
    const clips=['Embark - kneel front','Disembark - stand'].map(name=>new THREE.AnimationClip(name,.25,[new THREE.VectorKeyframeTrack(pivot.uuid+'.position',[0,.25],[0,0,0,0,.1,0])]));
    motion=createCharacterMotion(pivot,{clips});vehicleEntry=createNativeVehicleEntry(motion,profile);
    actor.userData.size={width:2,height:3,length:2};vehicleDriver=createVehicleDriver(actor);
  },
  andrewVehicle(){
    const car=new THREE.Group();car.userData.size={width:3,height:6,length:3};car.userData.vehicle={family:'titan_mech'};world.add(car);vehicleDriver=createVehicleDriver(car);actor.position.set(2.5,.875,0);
    let phase=null;vehicleEntry={paired:true,retargeted:true,source:'Titanfall 2 · retargeted to Andrew',enterOptions:[],exitOptions:[],
      get busy(){return !!phase;},get phase(){return phase;},begin(direction){if(phase)return false;phase=direction;return true;},
      update(){const result=phase;phase=null;return result;},cancel(){phase=null;},getExitPose(){return {position:new THREE.Vector3(3,0,2),heading:.7};}};
  },
  entryFrame(dt){updateVehicleEntry(dt);},
  entryBusy(){return !!vehicleEntry?.busy;},
  helicopter(){vehicleEntry=null;const car=new THREE.Group();car.name='Backdrop Helicopter';car.userData.size={width:2.5,height:2.7,length:10};car.userData.vehicle={id:'backdrop-helicopter',family:'backdrop_helicopter'};world.add(car);vehicleDriver=createVehicleDriver(car);},
  flightFrame(dt){updateDriving(dt);},
  flightState(){return {altitude:vehicleDriver.altitude,speed:vehicleDriver.speed,heading:vehicleDriver.heading,grounded:vehicleDriver.grounded};},
  flightTouch(){moveInput.set(.5,-.8);lookInput.set(.4,-.7);updateDriving(2);},
};`,context);
const harness=context.testPlay;harness.prepare();
await elements.get('#firstPersonScene').onclick();
assert.equal(harness.state().playing,true);assert.equal(harness.state().firstPerson,true);assert.equal(harness.state().visible,false);
assert.equal(document.fullscreenElement,null,'First person starts in the page without requesting fullscreen');
assert.equal(elements.get('#togglePerspective').textContent,'Third person');assert.equal(harness.state().pitch,0);
elements.get('#resetPlayer').onclick();assert.equal(harness.state().firstPerson,true,'Reset preserves first-person mode');assert.equal(harness.state().pitch,0);
elements.get('#togglePerspective').onclick();assert.equal(harness.state().firstPerson,false);assert.equal(harness.state().visible,true);
elements.get('#togglePerspective').onclick();assert.equal(harness.state().firstPerson,true);
await elements.get('#exitPlay').onclick();
assert.equal(harness.state().playing,false);assert.equal(harness.state().firstPerson,false);assert.equal(harness.state().visible,true);assert.equal(harness.state().fov,45);assert.equal(document.fullscreenElement,null);
await elements.get('#playScene').onclick();assert.equal(harness.state().firstPerson,false,'Play retains third-person behavior');
assert.equal(document.fullscreenElement,null,'Play starts in the page');
await elements.get('#toggleFullscreen').onclick();assert.equal(document.fullscreenElement,viewport,'Fullscreen is explicitly requested');
await document.exitFullscreen();harness.fullscreenChanged();assert.equal(harness.state().playing,true,'Leaving native fullscreen keeps play running');
await elements.get('#toggleFullscreen').onclick();await elements.get('#toggleFullscreen').onclick();
assert.equal(document.fullscreenElement,null);assert.equal(harness.state().playing,true,'Fullscreen toggle never stops play');
await elements.get('#playScene').onclick();assert.equal(harness.state().playing,false,'Toolbar Stop ends play');
viewport.requestFullscreen=async()=>{throw Error('Fullscreen unavailable');};
await elements.get('#firstPersonScene').onclick();await elements.get('#toggleFullscreen').onclick();assert.equal(harness.state().playing,true);assert.equal(harness.state().firstPerson,true);assert.equal(elements.get('#playNotice').hidden,false,'Unavailable fullscreen leaves first person running in the page');
await elements.get('#exitPlay').onclick();assert.equal(harness.state().visible,true);
// The on-screen action shares the same path as E and uses the touch vectors.
harness.vehicle();await elements.get('#firstPersonScene').onclick();
const pressE=(repeat=false,target=elements.get('#sceneCanvas'))=>windowHandlers.get('keydown')({key:'e',repeat,target,preventDefault(){}});
pressE();
assert.equal(harness.drivingState().driving,true);assert.equal(harness.state().visible,false);assert.equal(harness.state().firstPerson,false);
pressE(true);assert.equal(harness.drivingState().driving,true,'Holding E does not repeatedly enter and exit');
const input=new Element('input');input.editable=true;pressE(false,input);assert.equal(harness.drivingState().driving,true,'Typing E in an input does not exit the car');
assert.equal(elements.get('#togglePerspective').disabled,false,'Perspective stays live while driving: it toggles the cockpit view');assert.equal(elements.get('#driveVehicle').textContent,'E · Exit vehicle');
harness.driveTouch();assert.ok(harness.drivingState().speed>0);assert.ok(harness.drivingState().car.z<0);
elements.get('#driveVehicle').onclick();assert.equal(harness.drivingState().driving,false);assert.equal(harness.drivingState().speed,0);assert.equal(harness.state().firstPerson,true,'Exit restores walking camera preference');
elements.get('#driveVehicle').onclick();elements.get('#resetPlayer').onclick();assert.ok(harness.drivingState().car.distanceTo(new THREE.Vector3(4,0,0))<1e-9);assert.equal(harness.drivingState().driving,true);
await elements.get('#exitPlay').onclick();assert.equal(harness.drivingState().driving,false);assert.equal(harness.state().visible,true,'Stop play restores the character');
harness.nativeVehicle();await elements.get('#playScene').onclick();pressE();
assert.equal(harness.entryBusy(),true);assert.equal(harness.drivingState().driving,false,'Driving cannot begin before embark completes');
assert.equal(elements.get('#driveVehicle').disabled,true);pressE();assert.equal(harness.entryBusy(),true);
harness.entryFrame(.3);assert.equal(harness.drivingState().driving,true);assert.equal(elements.get('#driveVehicle').textContent,'E · Disembark');
pressE();assert.equal(harness.entryBusy(),true);harness.entryFrame(.3);assert.equal(harness.drivingState().driving,false);assert.equal(harness.state().visible,true);
pressE();await elements.get('#exitPlay').onclick();assert.equal(harness.entryBusy(),false,'Stop cancels the entry animation');assert.equal(harness.state().visible,true);
harness.andrewVehicle();await elements.get('#playScene').onclick();pressE();
assert.equal(harness.entryBusy(),true,'E starts Andrew embark');assert.equal(harness.state().visible,true,'Andrew stays visible during his retargeted animation');assert.equal(harness.drivingState().driving,false,'Wait for embark before mounted control');
assert.equal(elements.get('#driveVehicle').textContent,'Embarking…');pressE();harness.entryFrame(.1);assert.equal(harness.drivingState().driving,true);
pressE();assert.equal(harness.entryBusy(),true,'E starts disembark');harness.entryFrame(.1);assert.equal(harness.drivingState().driving,false);assert.ok(harness.state().position.distanceTo(new THREE.Vector3(3,.875,2))<1e-8,'Restore Andrew at original pilot exit');
pressE();elements.get('#resetPlayer').onclick();assert.equal(harness.entryBusy(),false);assert.equal(harness.state().visible,true,'Reset cancels Andrew embark safely');
pressE();await elements.get('#exitPlay').onclick();assert.equal(harness.entryBusy(),false);assert.equal(harness.state().visible,true,'Stop cancels Andrew embark safely');
harness.helicopter();await elements.get('#playScene').onclick();pressE();
assert.equal(elements.get('#flightInstruments').hidden,false);assert.equal(elements.get('#playAnimationControls').hidden,true);
assert.equal(elements.get('#moveStickCaption').textContent,'CYCLIC');assert.equal(elements.get('#lookStickCaption').textContent,'LIFT / YAW');
const keyDown=key=>windowHandlers.get('keydown')({key,repeat:false,target:elements.get('#sceneCanvas'),preventDefault(){}});
keyDown(' ');harness.flightFrame(3);assert.ok(harness.flightState().altitude>5,'Space climbs');assert.match(elements.get('#flightAltitude').textContent,/\d+\.\d/);
assert.equal(elements.get('#driveVehicle').disabled,true);pressE();assert.equal(harness.drivingState().driving,true,'Airborne exit is blocked');
keyDown('h');harness.flightTouch();assert.ok(harness.flightState().speed>0&&harness.flightState().heading>0,'Touch cyclic, collective and yaw work');
keyDown('h');const sceneCanvas=elements.get('#sceneCanvas');
sceneCanvas.listeners.get('pointerdown')({pointerId:1,button:2,clientX:100,clientY:100});sceneCanvas.listeners.get('pointermove')({pointerId:1,clientX:150,clientY:50});harness.flightFrame(1);assert.ok(harness.flightState().speed>0,'Right-drag mouse cyclic works');sceneCanvas.listeners.get('pointerup')({pointerId:1});
keyDown('h');sceneCanvas.listeners.get('wheel')({deltaY:-100,preventDefault(){}});harness.flightFrame(2);assert.ok(harness.flightState().altitude>5,'Mouse wheel commands lift');
keyDown('h');keyDown('Shift');harness.flightFrame(20);assert.equal(harness.flightState().grounded,true,'Shift lands the helicopter');
pressE();assert.equal(harness.drivingState().driving,false);assert.equal(elements.get('#flightInstruments').hidden,true);assert.equal(harness.state().visible,true);
await elements.get('#exitPlay').onclick();
console.log('PASS: in-page play/fullscreen, E key entry, repeat/input guards, touch driving, exit to walking, vehicle reset and Stop restoration.');
