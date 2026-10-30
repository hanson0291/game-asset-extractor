import * as THREE from 'three';
import { GLTFLoader } from './vendor/modern/GLTFLoader.js';
import { characters, initialCharacterId } from './characters.js';
import { environments } from './environments/catalog.js';
import { motionPresets, createCharacterMotion } from './character-motion.js';
import { updatePlayerCamera } from './player-camera.js';
import { createVehicleDriver, updateVehicleCamera } from './vehicle-driving.js';
import { createNativeVehicleEntry } from './vehicle-entry.js';
import { createCharacterTalk } from './character-talk.js';
import { loadVehicleCatalog } from './vehicle-catalog.js';
import { prepareIonModel, createIonEntry } from './ion-entry.js';
import { applyStudioEnvironment } from './studio-lighting.js';
import { createFirstPersonHud, applyCockpitCamera, setCockpitCulling, updateCockpitOccluders, restoreCockpitOccluders, cockpitFrame } from './first-person-hud.js';
import { createTitanCockpit, DEFAULT_SCREEN_URL } from './titan-cockpit.js';
import { createMultiplayer } from './multiplayer.js';
import { fixedWingVehicles, runwayParking } from './runway-fleet.js';

const $=selector=>document.querySelector(selector);
const canvas=$('#sceneCanvas'), viewport=$('#sceneViewport');
let renderer,scene,camera,world,actor,contentBounds,loading=false;
const talk=createCharacterTalk({onChange:state=>{
  for(const id of ['#talkScene','#talkPlay']){const button=$(id);button.disabled=loading||!state.available;button.textContent=state.active?'Stop talking':'Talk';button.setAttribute('aria-pressed',String(state.active));button.title=state.message;}
  $('#talkStatus').textContent=state.message;
}});
$('#talkScene').onclick=$('#talkPlay').onclick=()=>talk.toggle();
window.addEventListener('pagehide',()=>talk.stop());
let activeEnvironment=null;
let vehicleDriver=null,fleetDrivers=[],driving=false,walkingFirstPerson=false;
let vehicleEntry=null;
let keyLight=null;
let playing=false,firstPerson=false,playSession=0,movementBounds=null;
let cockpit=false,cabin=false,loadedGameId='',loadedCharacterId='',mp=null;
const fpHud=createFirstPersonHud({viewport,getScene:()=>scene,getCamera:()=>camera,onWeaponChange:()=>syncWeaponButton()});
const EMBARK_RANGE=3.048,rangeOffset=new THREE.Vector3();   // 10 ft, measured from the vehicle's footprint
let embarkNear=null;
const cabinView=createTitanCockpit({viewport,url:new URLSearchParams(location.search).get('cockpitScreen')||DEFAULT_SCREEN_URL}),cabinDir=new THREE.Vector3();
let motion=null,motionChoice=null,movingThisFrame=false,motionUIKey='';
const motionViews=[];
const moveInput=new THREE.Vector2(),lookInput=new THREE.Vector2(),keys=new Set(),spawn=new THREE.Vector3();
const mouseFlight=new THREE.Vector2();let mouseLiftTrim=0,heldLift=0,heldThrottle=0;
const joystickResets=[];
let yaw=.65,pitch=.4,distance=10,lastTime=0,pinchDistance=0;
const target=new THREE.Vector3(0,.9,0), pointers=new Map();
const characterGameSelect=$('#characterGameSelect'),characterSelect=$('#characterSelect'),environmentSelect=$('#environmentSelect');
const query=new URLSearchParams(location.search);
const startCharacter=initialCharacterId();
setupMotionControls('#animationControls','motion');setupMotionControls('#playAnimationControls','playMotion');
const defaultGameNames={'schoolboy-runaway':'SchoolBoy Runaway','titanfall-2':'Titanfall 2','stray':'Stray','007-first-light':'007 First Light','little-kitty-big-city':'Little Kitty, Big City','cat-quest-iii':'Cat Quest III'};
let characterRows=[];
const compareNames=(a,b)=>a.localeCompare(b,undefined,{numeric:true,sensitivity:'base'});
function fillCharacters(selected=characterSelect.value){
  const rows=characterRows.filter(row=>row.gameId===characterGameSelect.value);
  characterSelect.replaceChildren();
  rows.forEach(({character})=>{const option=document.createElement('option');option.value=character.id;option.textContent=character.name;characterSelect.append(option)});
  characterSelect.value=rows.some(row=>row.character.id===selected)?selected:rows[0]?.character.id||'';
  characterSelect.disabled=loading||!rows.length;
}
function fillCharacterOptions(library){
  const selected=characterSelect.value||startCharacter;
  characterRows=characters.map(character=>{
    const gameId=library?.characterGames?.[character.id]||character.gameId||'unknown';
    const game=library?.games?.find(item=>item.id===gameId);
    return {character,gameId,gameName:game?.name||defaultGameNames[gameId]||gameId};
  }).sort((a,b)=>compareNames(a.character.name,b.character.name));
  const games=new Map(characterRows.map(row=>[row.gameId,row.gameName]));
  const selectedGame=characterRows.find(row=>row.character.id===selected)?.gameId||characterGameSelect.value;
  characterGameSelect.replaceChildren();
  [...games].sort((a,b)=>compareNames(a[1],b[1])).forEach(([id,name])=>{const option=document.createElement('option');option.value=id;option.textContent=name;characterGameSelect.append(option)});
  characterGameSelect.value=games.has(selectedGame)?selectedGame:characterGameSelect.options[0]?.value||'';
  fillCharacters(selected);
}
fillCharacterOptions();
// Keep future game categories consistent with the library dashboard.
fetch('./api/library').then(response=>response.ok?response.json():null).then(library=>{
  if(!library)return;
  fillCharacterOptions(library);
}).catch(()=>{});
environmentSelect.replaceChildren();
environments.forEach(environment=>{const option=document.createElement('option');option.value=environment.id;option.textContent=environment.name;environmentSelect.append(option)});
if(environments.some(environment=>environment.id===query.get('environment')))environmentSelect.value=query.get('environment');
function updateDescription(){
  $('#environmentDescription').textContent=environments.find(environment=>environment.id===environmentSelect.value).description;
  if(world)status('Selections changed. Press Load to update the scene.');
}
characterSelect.onchange=environmentSelect.onchange=updateDescription;
characterGameSelect.onchange=()=>{fillCharacters();updateDescription();};
const vehicleGameSelect=$('#vehicleGameSelect'),vehicleSelect=$('#vehicleSelect');let vehicleCatalogs=[];
function fillVehicles(){const catalog=vehicleCatalogs.find(item=>item.id===vehicleGameSelect.value);vehicleSelect.replaceChildren(new Option('None',''));(catalog?.vehicles||[]).forEach(vehicle=>vehicleSelect.append(new Option(vehicle.name+(vehicle.status==='partial'?' (partial)':''),vehicle.id)));vehicleSelect.disabled=!catalog;}
vehicleGameSelect.onchange=()=>{fillVehicles();if(world)status('Selections changed. Press Load to update the scene.');};
vehicleSelect.onchange=()=>{if(world)status('Selections changed. Press Load to update the scene.');};
loadVehicleCatalog().then(data=>{
  const vehicles=(data.vehicles||[]).filter(vehicle=>vehicle.model).sort((a,b)=>a.name.localeCompare(b.name));
  if(!vehicles.length)return;
  const groups=new Map();
  for(const vehicle of vehicles){const id=vehicle.gameId||'007-first-light';if(!groups.has(id))groups.set(id,{id,name:data.games?.find(game=>game.id===id)?.name||vehicle.gameName||id,vehicles:[]});groups.get(id).vehicles.push(vehicle);}
  vehicleCatalogs=[...groups.values()].sort((a,b)=>a.name.localeCompare(b.name));
  vehicleCatalogs.forEach(catalog=>vehicleGameSelect.append(new Option(catalog.name,catalog.id)));
  const wanted=query.get('vehicle');const owner=vehicleCatalogs.find(catalog=>catalog.vehicles.some(vehicle=>vehicle.id===wanted));
  if(owner){vehicleGameSelect.value=owner.id;fillVehicles();vehicleSelect.value=wanted;}
}).catch(()=>{});
updateDescription();

function status(message,error=false){$('#loaderStatus').textContent=message;$('#loaderStatus').classList.toggle('error',error)}
function initialize(){
  if(renderer)return;
  renderer=new THREE.WebGLRenderer({canvas,antialias:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(45,1,.01,250);
  const hemisphere=new THREE.HemisphereLight(0xe1efff,0x63714b,2.2);
  const key=new THREE.DirectionalLight(0xfff1dd,3);key.position.set(8,15,10);key.castShadow=true;
  key.shadow.mapSize.set(1024,1024);key.shadow.camera.left=-18;key.shadow.camera.right=18;key.shadow.camera.top=18;key.shadow.camera.bottom=-18;key.shadow.camera.far=65;key.shadow.normalBias=.04;key.shadow.bias=-.0004;
  scene.add(hemisphere,key,key.target);keyLight=key;
  new ResizeObserver(resize).observe(viewport);resize();requestAnimationFrame(animate);
}
function resize(){if(!renderer)return;const {width,height}=viewport.getBoundingClientRect();renderer.setSize(width,height,false);camera.aspect=width/Math.max(height,1);camera.updateProjectionMatrix()}
const WHEELED=new Set(['aston-martin-valhalla-2025','jaguar-type00','triumph-motorcycle']);
function collectWheels(root){const wheels=[];root.traverse(node=>{if(node.name.startsWith('wheel_')&&node.userData.radius){node.rotation.order='YXZ';wheels.push({node,radius:node.userData.radius,front:node.position.z<0,steer:0});}});return wheels;}
function spinWheels(driver,steer,dt){
  const wheels=driver?.car?.userData.wheels;if(!wheels?.length)return;
  const roll=driver.speed*dt;
  for(const wheel of wheels){wheel.node.rotation.x-=roll/wheel.radius;if(wheel.front){wheel.steer+=(-steer*.5-wheel.steer)*Math.min(1,dt*10);wheel.node.rotation.y=wheel.steer;}}
}
function animate(time){
  requestAnimationFrame(animate);
  const dt=Math.min((time-lastTime)/1000,.1);lastTime=time;
  if(!world)return;
  movingThisFrame=false;
  pollGamepad();
  if(playing&&vehicleEntry?.busy)updateVehicleEntry(dt);
  else if(playing&&driving)updateDriving(dt);
  else if(playing)updatePlayer(dt);
  else if($('#autoRotate').checked&&!pointers.size)yaw+=dt*.2;
  if(motion&&!driving&&!vehicleEntry?.busy){
    const step=motion.update(dt,{playing,moving:movingThisFrame});
    actor.position.x+=Math.sin(actor.rotation.y)*step.forward;actor.position.z+=Math.cos(actor.rotation.y)*step.forward;actor.rotation.y+=step.turn;
    if(playing&&firstPerson)yaw+=step.turn;
    clampActor();syncMotionControls();
  }
  if(driving||vehicleEntry?.busy){actor.visible=vehicleEntry?.retargeted?!!vehicleEntry.busy:!vehicleEntry?.paired&&(!!vehicleEntry?.busy||vehicleDriver.car===actor);if(embarkFirstPerson())placeEmbarkCamera();else updateVehicleCamera(camera,vehicleDriver,dt,{yawOffset:yaw,pitch});if(cockpit&&driving&&!vehicleEntry?.busy){if(cabin){yaw=THREE.MathUtils.clamp(yaw,-2,2);pitch=THREE.MathUtils.clamp(pitch,-.2,.9);}if(vehicleDriver.car!==actor)actor.visible=false;applyCockpitCamera(camera,vehicleDriver,{yaw,pitch,forward:cabin?1.5:.55,fov:cabin?90:75});}}
  else updatePlayerCamera(camera,actor,{firstPerson:playing&&firstPerson,yaw,pitch,distance,target});
  if(keyLight){const focus=(driving&&vehicleDriver?vehicleDriver.car:actor)?.position;if(focus){keyLight.target.position.copy(focus);keyLight.position.set(focus.x+8,focus.y+15,focus.z+10);keyLight.target.updateMatrixWorld();}}
  updateFirstPersonHud(dt);updateCabin(dt);mp?.update(dt);
  renderer.render(scene,camera);cabinView.render(renderer,camera);
}
function dispose(root){
  const geometries=new Set(),materials=new Set(),textures=new Set();
  root?.traverse(object=>{if(object.geometry&&object.material){geometries.add(object.geometry);for(const material of Array.isArray(object.material)?object.material:[object.material]){materials.add(material);Object.values(material).forEach(value=>{if(value?.isTexture)textures.add(value)})}}});
  geometries.forEach(value=>value.dispose());textures.forEach(value=>value.dispose());materials.forEach(value=>value.dispose());
}
function normalizeCharacter(model,height=1.75){
  model.updateMatrixWorld(true);
  model.traverse(object=>{if(object.isSkinnedMesh)object.computeBoundingBox();});
  const bounds=new THREE.Box3().setFromObject(model),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
  if(!Number.isFinite(size.y)||size.y<=0)throw new Error('Character geometry is empty.');
  const holder=new THREE.Group();holder.name='Selected character';holder.userData.height=height;holder.add(model);model.position.sub(center);const scale=height/size.y;holder.scale.setScalar(scale);holder.position.y=size.y*scale/2;
  return holder;
}
async function loadScene(event){
  event.preventDefault();if(loading||playing)return;
  const character=characters.find(value=>value.id===characterSelect.value),environment=environments.find(value=>value.id===environmentSelect.value);
  if(!character||!environment){status('Choose a character and an environment.',true);return;}
  const vehicle=vehicleCatalogs.find(item=>item.id===vehicleGameSelect.value)?.vehicles.find(item=>item.id===vehicleSelect.value);
  loading=true;$('#loadScene').disabled=characterGameSelect.disabled=characterSelect.disabled=environmentSelect.disabled=vehicleGameSelect.disabled=vehicleSelect.disabled=true;$('#playScene').disabled=$('#firstPersonScene').disabled=true;$('#loadScene').firstChild.textContent='Loading… ';$('#sceneLoading').hidden=false;status('Loading '+character.name+' and '+environment.name+'…');
  let nextWorld;
  talk.stop();talk.refresh();
  try{
    initialize();
    if(vehicle?.family==='titan_mech')applyStudioEnvironment(scene,renderer);else scene.environment=null;
    const loader=new GLTFLoader();
    const results=await Promise.allSettled([loader.loadAsync(character.animationModel||character.model),environment.model?loader.loadAsync(environment.model):Promise.resolve({scene:new THREE.Group()}),vehicle?loader.loadAsync(WHEELED.has(vehicle.id)?'./assets/firstlight-vehicles/drive/'+vehicle.id+'.glb':vehicle.animationModel||vehicle.model):Promise.resolve(null)]);
    if(results.some(result=>result.status==='rejected')){
      results.forEach(result=>{if(result.status==='fulfilled'&&result.value)dispose(result.value.scene)});
      throw new Error('A model file could not load. Check that the local server is running, then try again.');
    }
    nextWorld=new THREE.Group();nextWorld.name=character.name+' in '+environment.name;
    let gameClips=results[0].value.animations||[],clipWarning='';
    if(character.animations){
      try{const response=await fetch(character.animations);if(!response.ok)throw new Error('Animation file unavailable');gameClips=(await response.json()).clips;}
      catch{gameClips=[];clipWarning=' Original clips could not load; preview motions are available.';}
    }
    nextWorld.add(results[1].value.scene);const nextActor=normalizeCharacter(results[0].value.scene,character.height||1.75);nextWorld.add(nextActor);if(environment.spawn){nextActor.position.x=environment.spawn[0];nextActor.position.z=environment.spawn[1];}
    const makeVehicleHolder=(item,gltf)=>{
      const car=gltf.scene;car.name=item.name;car.updateMatrixWorld(true);
      const box=(item.family==='titan_mech'?prepareIonModel(car):null)||new THREE.Box3().setFromObject(car),vsize=box.getSize(new THREE.Vector3()),vcenter=box.getCenter(new THREE.Vector3());
      const holder=new THREE.Group();holder.name='Vehicle: '+item.name;car.position.sub(new THREE.Vector3(vcenter.x,box.min.y,vcenter.z));holder.add(car);
      holder.userData.size={width:vsize.x,height:vsize.y,length:vsize.z};holder.userData.wheels=collectWheels(car);holder.userData.vehicle={id:item.id,family:item.family,name:item.name};
      return holder;
    };
    let nextDriver=null;
    if(vehicle&&results[2].value){const holder=makeVehicleHolder(vehicle,results[2].value),vsize=holder.userData.size;holder.position.set(nextActor.position.x+Math.max(vsize.x,vsize.z)/2+1.5,0,nextActor.position.z);nextWorld.add(holder);nextDriver=createVehicleDriver(holder);}
    // Runway fleet: with no vehicle picked, an environment with a runway
    // (McKenzie Field) parks every fixed-wing aircraft in a line on it.
    // A plane whose model fails to load is skipped, never fatal.
    let nextFleet=[];
    if(!vehicle&&environment.runway&&vehicleCatalogs.length){
      const fleet=fixedWingVehicles(vehicleCatalogs);
      const loaded=await Promise.allSettled(fleet.map(item=>loader.loadAsync(item.model)));
      const parked=[];
      loaded.forEach((result,index)=>{if(result.status==='fulfilled'&&result.value)parked.push({item:fleet[index],holder:makeVehicleHolder(fleet[index],result.value)});});
      const slots=runwayParking(environment.runway,parked.map(entry=>entry.holder.userData.size));
      parked.forEach((entry,index)=>{entry.holder.position.set(slots[index].x,slots[index].y,slots[index].z);entry.holder.rotation.y=slots[index].heading;nextWorld.add(entry.holder);nextFleet.push(createVehicleDriver(entry.holder));});
    }
    const bounds=new THREE.Box3().setFromObject(nextWorld),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
    nextWorld.traverse(object=>{if(object.isMesh){object.castShadow=true;object.receiveShadow=true}});
    if(environment.groundPlane!==false){
      const ground=new THREE.Mesh(new THREE.PlaneGeometry(nextFleet.length?4000:Math.max(24,size.x+8),nextFleet.length?4000:Math.max(24,size.z+8)),new THREE.MeshStandardMaterial({color:environment.ground,roughness:1}));ground.rotation.x=-Math.PI/2;ground.position.set(center.x,Math.min(-.025,bounds.min.y-.025),center.z);ground.receiveShadow=true;nextWorld.add(ground);
    }
    if(environment.id==='studio'){const grid=new THREE.GridHelper(24,24,0x617654,0x364f3a);grid.position.y=-.015;nextWorld.add(grid)}
    if(world){scene.remove(world);dispose(world)}
    world=nextWorld;actor=nextActor;vehicleDriver=nextDriver;fleetDrivers=nextFleet;driving=false;activeEnvironment=environment;contentBounds=bounds;scene.add(world);scene.background=new THREE.Color(environment.sky);scene.fog=environment.fog?new THREE.Fog(environment.sky,environment.fog.near??22,environment.fog.far??65):null;camera.far=environment.far||250;camera.near=environment.near||.01;camera.updateProjectionMatrix();
    const wasEnabled=motion?motion.enabled:true;
    motion=createCharacterMotion(results[0].value.scene,{clips:gameClips,clipSettings:character.clipSettings});motion.select(motionChoice);motionChoice=motion.preset.id;
    const pairedEntry=vehicle?.family==='titan_mech'?createIonEntry(results[2].value.scene,results[2].value.animations,character,vehicle,nextActor):null;
    if(nextDriver)nextDriver.entry=pairedEntry;
    vehicleEntry=nextFleet.length?null:pairedEntry||createNativeVehicleEntry(motion,character,vehicle);
    if(vehicle?.family==='titan_mech'&&!pairedEntry)clipWarning+=' Choose Jack Cooper or Andrew for animated embark/disembark; this character uses instant entry.';
    if(vehicleEntry?.selfMounted&&!vehicleDriver){
      const dimensions=new THREE.Box3().setFromObject(actor).getSize(new THREE.Vector3());
      actor.userData.size={width:dimensions.x,height:dimensions.y,length:dimensions.z};vehicleDriver=createVehicleDriver(actor);
    }
    if(!wasEnabled&&motion.preset.mode==='loop')motion.stop();
    motionUIKey='';syncMotionControls();syncMechVariants();
    spawn.copy(actor.position);
    movementBounds={minX:center.x-Math.max(24,size.x+8)/2+.35,maxX:center.x+Math.max(24,size.x+8)/2-.35,minZ:center.z-Math.max(24,size.z+8)/2+.35,maxZ:center.z+Math.max(24,size.z+8)/2-.35};
    if(environment.walkBounds){const [minX,maxX,minZ,maxZ]=environment.walkBounds;movementBounds={minX,maxX,minZ,maxZ};}
    $('#playScene').disabled=$('#firstPersonScene').disabled=false;
    canvas.hidden=false;$('#sceneEmpty').hidden=true;$('#frameCharacter').disabled=$('#frameEnvironment').disabled=$('#resetCamera').disabled=$('#autoRotate').disabled=false;
    resetCamera();resize();if(vehicle?.family==='titan_mech')frameEnvironment();
    let meshes=0,triangles=0;world.traverse(object=>{if(object.isMesh){meshes++;const geometry=object.geometry;triangles+=(geometry.index?geometry.index.count:geometry.attributes.position.count)/3}});
    loadedGameId=characterGameSelect.value;loadedCharacterId=character.id;$('#loadedCharacter').textContent=character.name;$('#loadedEnvironment').textContent=environment.name;$('#sceneMeshes').textContent=meshes.toLocaleString();$('#sceneTriangles').textContent=Math.round(triangles).toLocaleString();$('#sceneTitle').textContent=character.name+(vehicle?' + '+vehicle.name:'')+' · '+environment.name;$('#sceneBadge').textContent='LOADED';$('#sceneReady').textContent='Scene ready';status(character.name+' loaded in '+environment.name+'.'+clipWarning);
    void talk.setCharacter(character);
    const url=new URL(location.href);url.searchParams.set('character',character.id);url.searchParams.set('environment',environment.id);if(vehicle)url.searchParams.set('vehicle',vehicle.id);else url.searchParams.delete('vehicle');history.replaceState(null,'',url);
  }catch(error){if(nextWorld&&nextWorld!==world)dispose(nextWorld);status(error.message||'Could not load the scene.',true);}
  finally{loading=false;talk.refresh();$('#loadScene').disabled=characterGameSelect.disabled=characterSelect.disabled=environmentSelect.disabled=vehicleGameSelect.disabled=false;vehicleSelect.disabled=!vehicleGameSelect.value;$('#playScene').disabled=$('#firstPersonScene').disabled=!world;$('#loadScene').firstChild.textContent='Load ';$('#sceneLoading').hidden=true;}
}
function resetCamera(){const home=activeEnvironment?.camera;target.fromArray(home?.target||[0,.9,0]);yaw=home?.yaw??.65;pitch=home?.pitch??.38;distance=home?.distance??10;$('#autoRotate').checked=false}
function frameCharacter(){if(!actor)return;const bounds=new THREE.Box3().setFromObject(actor);bounds.getCenter(target);distance=Math.max(1.3,bounds.getSize(new THREE.Vector3()).y*2.4);yaw=.45;pitch=.18}
function frameEnvironment(){if(!contentBounds)return;const sphere=contentBounds.getBoundingSphere(new THREE.Sphere());target.copy(sphere.center);const limitingFov=Math.min(camera.fov*Math.PI/180,2*Math.atan(Math.tan(camera.fov*Math.PI/360)*camera.aspect));distance=sphere.radius/Math.sin(limitingFov/2)*1.1;yaw=.6;pitch=.6}
$('#loaderForm').onsubmit=loadScene;$('#frameCharacter').onclick=frameCharacter;$('#frameEnvironment').onclick=frameEnvironment;$('#resetCamera').onclick=resetCamera;

function clearPlayInput(){
  moveInput.set(0,0);lookInput.set(0,0);keys.clear();pointers.clear();pinchDistance=0;
  mouseFlight.set(0,0);mouseLiftTrim=0;heldLift=0;heldThrottle=0;
  joystickResets.forEach(reset=>reset());
}
function clampActor(){
  if(!actor||!movementBounds)return;
  actor.position.x=THREE.MathUtils.clamp(actor.position.x,movementBounds.minX,movementBounds.maxX);
  actor.position.z=THREE.MathUtils.clamp(actor.position.z,movementBounds.minZ,movementBounds.maxZ);
}
function setupMotionControls(selector,prefix){
  const container=$(selector);container.classList.add('motion-controls');
  const label=document.createElement('label');label.htmlFor=prefix+'Select';label.textContent='Animation';
  const select=document.createElement('select');select.id=prefix+'Select';select.disabled=true;
  for(const [mode,title] of [['loop','Walking loops · toggle on/off'],['once','One-shot actions · click to play']]){
    const group=document.createElement('optgroup');group.label=title;
    motionPresets.filter(preset=>preset.mode===mode).forEach(preset=>{const option=document.createElement('option');option.value=preset.id;option.textContent=preset.name+(mode==='loop'?' · loop':' · once');group.append(option)});select.append(group);
  }
  const buttons=document.createElement('div');buttons.className='motion-buttons';
  const action=document.createElement('button');action.id=prefix+'Action';action.type='button';action.className='motion-action';action.textContent='Start loop';action.disabled=true;
  const stop=document.createElement('button');stop.id=prefix+'Stop';stop.type='button';stop.className='motion-stop';stop.textContent='Stop motion';stop.disabled=true;
  const output=document.createElement('p');output.id=prefix+'Status';output.className='motion-status';output.setAttribute('role','status');output.textContent='Load a character to enable motions.';
  select.onchange=()=>{motionChoice=select.value;motion?.select(motionChoice);motionUIKey='';syncMotionControls()};
  action.onclick=()=>{motion?.trigger();motionUIKey='';syncMotionControls()};
  stop.onclick=()=>{motion?.stop();motionUIKey='';syncMotionControls()};
  buttons.append(action,stop);container.append(label,select,buttons,output);motionViews.push({select,action,stop,output});
}
function syncMotionControls(){
  const key=motion?[motion.preset.id,motion.enabled,motion.oneShot,motion.status,motion.hasRig,driving,vehicleEntry?.busy].join('|'):'unloaded';if(key===motionUIKey)return;motionUIKey=key;
  for(const view of motionViews){
    const ready=!!motion?.hasRig&&!driving&&!vehicleEntry?.busy;view.select.disabled=view.action.disabled=view.stop.disabled=!ready;
    if(!ready){view.output.textContent=vehicleEntry?.busy?'Playing original '+vehicleEntry.phase+' animation…':driving?'Exit the vehicle to use character motions.':motion?'No compatible rig for this character.':'Load a character to enable motions.';continue;}
    const signature=motion.presets.map(p=>p.id).join('|');
    if(view.select.dataset.presets!==signature){
      view.select.replaceChildren();
      for(const [source,title] of [['game','Original game animations'],['preview','Preview motions']]){
        const group=document.createElement('optgroup');group.label=title;
        for(const preset of motion.presets.filter(p=>p.source===source)){
          const option=document.createElement('option');option.value=preset.id;option.textContent=preset.name+(preset.mode==='loop'?' · loop':' · once');group.append(option);
        }
        if(group.children.length)view.select.append(group);
      }
      view.select.dataset.presets=signature;
    }
    view.select.value=motion.preset.id;
    const looping=motion.preset.mode==='loop';view.action.textContent=looping?(motion.enabled?'Turn loop off':'Turn loop on'):'Play once';
    if(looping)view.action.setAttribute('aria-pressed',String(motion.enabled));else view.action.removeAttribute('aria-pressed');
    view.action.disabled=!looping&&motion.oneShot;view.stop.disabled=!motion.enabled&&!motion.oneShot;
    view.output.textContent=motion.status;
  }
}
function updatePlayer(dt){
  yaw-=(lookInput.x+padLook.x)*dt*2.4;
  pitch=THREE.MathUtils.clamp(pitch+(lookInput.y+padLook.y)*dt*1.6,firstPerson?-1.45:.05,firstPerson?1.45:1.15);
  const side=moveInput.x+padMove.x+(keys.has('d')||keys.has('arrowright')?1:0)-(keys.has('a')||keys.has('arrowleft')?1:0);
  const forward=-(moveInput.y+padMove.y)+(keys.has('w')||keys.has('arrowup')?1:0)-(keys.has('s')||keys.has('arrowdown')?1:0);
  const movement=new THREE.Vector3(Math.cos(yaw)*side-Math.sin(yaw)*forward,0,-Math.sin(yaw)*side-Math.cos(yaw)*forward);
  if(movement.lengthSq()>1)movement.normalize();
  if(movement.lengthSq()>.0001&&!motion?.oneShot){
    movingThisFrame=true;actor.position.addScaledVector(movement,dt*2.7*(motion?.movementSpeed||1));clampActor();
    actor.rotation.y=Math.atan2(movement.x,movement.z);
  }
  const follow=new THREE.Vector3(actor.position.x,actor.position.y,actor.position.z);
  target.lerp(follow,1-Math.exp(-12*dt));
}
function setFirstPerson(enabled){
  if(driving||vehicleEntry?.busy)return;
  firstPerson=enabled;clearPlayInput();
  pitch=enabled?0:.25;
  $('#togglePerspective').textContent=enabled?'Third person':'First person';
  $('#togglePerspective').setAttribute('aria-label',enabled?'Switch to third person':'Switch to first person');
  $('#firstPersonScene').setAttribute('aria-pressed',String(playing&&enabled));
  $('#playHelp').textContent=(enabled?'First person · ':'')+'Left stick: move · Right stick: look';
  if(actor)actor.visible=!enabled;
  syncPerspectiveButtons();
}
function firstPersonView(){return driving?cockpit:firstPerson;}
function applyCameraClip(){
  const aircraft=driving&&(vehicleDriver?.kind==='helicopter'||vehicleDriver?.kind==='airplane');
  camera.far=aircraft?Math.max(3000,activeEnvironment?.far||0):(activeEnvironment?.far||250);
  camera.near=cockpit&&driving?.05:aircraft?Math.max(activeEnvironment?.near||.01,.3):(activeEnvironment?.near||.01);
  camera.updateProjectionMatrix();
}
function syncPerspectiveButtons(){
  syncWeaponButton();
  const on=playing&&firstPersonView(),button=$('#togglePerspective');
  button.textContent=on?(driving?'Exterior view':'Third person'):'First person';
  button.setAttribute('aria-label',on?(driving?'Switch to exterior view':'Switch to third person'):'Switch to first person');
  button.setAttribute('aria-pressed',String(on));
  const cabinButton=$('#cockpitView');cabinButton.hidden=!(playing&&driving&&vehicleDriver?.kind==='mech');cabinButton.textContent=cabin?'Exit cockpit':'Cockpit view';cabinButton.setAttribute('aria-pressed',String(cabin));cabinButton.disabled=!!vehicleEntry?.busy;
  $('#firstPersonScene').setAttribute('aria-pressed',String(on));$('#firstPersonScene').textContent=playing?(on?'First person: On':'First person: Off'):'First person';
}
function setCockpit(enabled){
  if(!driving||vehicleEntry?.busy)return;
  cockpit=enabled;if(!enabled)cabin=false;yaw=0;pitch=.35;clearPlayInput();applyCameraClip();
  syncPerspectiveButtons();
}
/** Titan only: sit inside the modelled cockpit (windshield, consoles and the web screen). Turning it off returns to the first-person HUD view. */
function setCabin(enabled){
  if(!driving||vehicleEntry?.busy||vehicleDriver?.kind!=='mech')return;
  cabin=enabled;cockpit=true;yaw=0;pitch=.35;clearPlayInput();applyCameraClip();
  syncPerspectiveButtons();
}
function updateCabin(dt){
  if(!(cabin&&driving&&playing&&!vehicleEntry?.busy&&world)){if(cabinView.active)cabinView.exit();return;}
  if(!cabinView.active)cabinView.enter(scene);
  camera.getWorldDirection(cabinDir);const heading=(Math.atan2(cabinDir.x,-cabinDir.z)*180/Math.PI+360)%360;
  cabinView.update(dt,camera,cockpitFrame,{speed:Math.abs(vehicleDriver?.speed||0),heading});
}
function toggleFirstPersonView(){if(!playing)return;if(driving)setCockpit(!cockpit);else setFirstPerson(!firstPerson);}
function distanceToVehicle(driver){
  const {car,size}=driver,c=Math.cos(car.rotation.y),s=Math.sin(car.rotation.y);
  rangeOffset.set(actor.position.x-car.position.x,0,actor.position.z-car.position.z);
  const lx=rangeOffset.x*c-rangeOffset.z*s,lz=rangeOffset.x*s+rangeOffset.z*c;
  return Math.hypot(Math.max(Math.abs(lx)-size.width/2,0),Math.max(Math.abs(lz)-size.length/2,0));
}
function canEmbark(){return !!actor&&((!!vehicleDriver&&distanceToVehicle(vehicleDriver)<=EMBARK_RANGE)||!!nearestFleetPlane());}
function syncWeaponButton(){
  const button=$('#cycleWeapon');if(!button)return;
  button.hidden=!(playing&&!driving&&!vehicleEntry?.busy&&fpHud.weaponCount>0);
  button.textContent='Weapon: '+fpHud.weaponName.replace(/\b(\w)(\w*)/g,(m,a,b)=>a+b.toLowerCase());
  // The Fire button above the LOOK stick mirrors the F key, which the HUD only honours while
  // it is shown (first person) on foot with a weapon — so it is hidden everywhere else.
  const fire=$('#fireWeapon');if(fire)fire.hidden=!(playing&&firstPersonView()&&!driving&&!vehicleEntry?.busy&&fpHud.weaponCount>0);
}
const embarkLook=new THREE.Vector3();
/** True while a first-person player is climbing into a vehicle: the camera rides on the pilot's head instead of orbiting. */
function embarkFirstPerson(){return !!vehicleEntry?.busy&&!driving&&vehicleEntry.phase==='enter'&&walkingFirstPerson&&firstPerson;}
function placeEmbarkCamera(){
  const head=vehicleEntry.getHead?.();
  if(!head){updatePlayerCamera(camera,actor,{firstPerson:true,yaw,pitch,distance,target});return;}
  head.getWorldPosition(camera.position);
  embarkLook.set(-Math.sin(yaw)*Math.cos(pitch),-Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch));
  camera.position.addScaledVector(embarkLook,.1);camera.position.y+=.04;
  camera.lookAt(embarkLook.add(camera.position));
  if(camera.fov!==75){camera.fov=75;camera.updateProjectionMatrix();}
  if(camera.near!==.05){camera.near=.05;camera.updateProjectionMatrix();}
}
function updateFirstPersonHud(dt){
  const busy=!!vehicleEntry?.busy,show=playing&&!!world&&!busy&&firstPersonView();
  const driver=vehicleDriver,kind=driving?driver?.kind:null;
  if(driver){const inside=playing&&driving&&cockpit&&!busy;setCockpitCulling(driver.car,inside);if(inside)updateCockpitOccluders(driver.car,camera,performance.now());else restoreCockpitOccluders(driver.car);}
  let prompt='';
  if(show&&driver&&!busy){
    const verb=driver.kind==='mech'?'EMBARK':driver.kind==='airplane'?'FLY':driver.kind==='helicopter'?'PILOT':'DRIVE',name=(driver.car.userData.vehicle?.name||driver.car.name||'vehicle').toUpperCase();
    if(!driving){if(canEmbark())prompt='[E] '+verb+' '+name;}
    else if((driver.kind!=='airplane'&&driver.kind!=='helicopter')||driver.grounded)prompt=Math.abs(driver.speed||0)<.5?'[E] EXIT':'';
  }
  const nearNow=playing&&!driving&&!busy?canEmbark():true;
  if(nearNow!==embarkNear){embarkNear=nearNow;$('#driveVehicle').hidden=!nearNow;}
  fpHud.update(dt,{show,driving,kind,speed:driver?.speed||0,altitude:driver?.altitude||0,throttle:driver?.kind==='helicopter'?(driver.collectivePercent||0)/100:(driver?.throttlePercent||0)/100,vehicleName:driver?.car?.userData.vehicle?.name,prompt,moving:movingThisFrame,yaw,pitch});
}
async function enterPlay(useFirstPerson=false){
  if(!world||loading||playing)return;
  ++playSession;playing=true;clearPlayInput();
  $('#autoRotate').checked=false;
  target.copy(actor.position);distance=activeEnvironment?.playDistance||Math.max(1.8,actor.userData.height*2.85);pitch=.25;
  fpHud.configure({gameId:loadedGameId,location:$('#loadedEnvironment').textContent});
  setFirstPerson(useFirstPerson);
  syncDriveControls();
  viewport.classList.add('is-playing');$('#playOverlay').hidden=false;$('#playNotice').hidden=true;
  promptForGamepad();
  $('#playTitle').textContent=$('#loadedCharacter').textContent+' · '+$('#loadedEnvironment').textContent;
  $('#exitPlay').textContent='Exit Play ✕';$('#playScene').textContent='■ Stop';$('#toggleFullscreen').textContent='Fullscreen';canvas.focus({preventScroll:true});resize();
}
async function toggleFullscreen(){
  if(!playing)return;
  const session=playSession;
  try{
    if((document.fullscreenElement||document.webkitFullscreenElement)===viewport){
      const exit=document.exitFullscreen||document.webkitExitFullscreen;await exit.call(document);fullscreenChanged();return;
    }
    const request=viewport.requestFullscreen||viewport.webkitRequestFullscreen;
    if(!request)throw new Error('Fullscreen is not supported');
    await request.call(viewport);
    if(session!==playSession){if(document.fullscreenElement===viewport)await document.exitFullscreen();return;}
  }catch{
    if(session!==playSession)return;
    $('#playNotice').textContent='Fullscreen is unavailable. You can keep playing in the page.';$('#playNotice').hidden=false;
  }
  fullscreenChanged();
}
async function exitPlay(){
  if(!playing)return;
  vehicleEntry?.cancel();
  if(driving)leaveVehicle();
  playing=false;gamepadWanted=false;++playSession;cockpit=false;cabin=false;cabinView.exit();setFirstPerson(false);
  camera.fov=45;camera.updateProjectionMatrix();target.copy(actor.position);
  viewport.classList.remove('is-playing');$('#playOverlay').hidden=true;$('#playScene').textContent='▶ Play';
  try{
    if(document.fullscreenElement===viewport)await document.exitFullscreen();
    else if(document.webkitFullscreenElement===viewport&&document.webkitExitFullscreen)document.webkitExitFullscreen();
  }catch{}
  resize();$('#playScene').focus({preventScroll:true});status('Play ended. You can change the scene or press Play again.');
}
function fullscreenChanged(){
  const fullscreen=document.fullscreenElement||document.webkitFullscreenElement;
  $('#toggleFullscreen').textContent=fullscreen===viewport?'Exit fullscreen':'Fullscreen';
  resize();
}
document.addEventListener('fullscreenchange',fullscreenChanged);document.addEventListener('webkitfullscreenchange',fullscreenChanged);
$('#playScene').onclick=()=>playing?exitPlay():enterPlay(false);$('#firstPersonScene').onclick=()=>playing?toggleFirstPersonView():enterPlay(true);$('#exitPlay').onclick=exitPlay;
$('#toggleFullscreen').onclick=toggleFullscreen;
$('#togglePerspective').onclick=toggleFirstPersonView;$('#cycleWeapon').onclick=()=>{fpHud.cycleWeapon();canvas.focus({preventScroll:true});};$('#cockpitView').onclick=()=>setCabin(!cabin);
// On-screen Fire button (touch), above the LOOK stick: pointerdown is the F keydown and the
// release is the F keyup, so a tap fires once and holding streams the bubble gun while held.
const fireButton=$('#fireWeapon');
fireButton.addEventListener('pointerdown',event=>{
  event.preventDefault();event.stopPropagation();
  try{fireButton.setPointerCapture(event.pointerId);}catch{/* capture is a nicety, not a requirement */}
  fpHud.fire();
});
for(const type of ['pointerup','pointercancel','lostpointercapture'])fireButton.addEventListener(type,event=>{event.preventDefault();fpHud.release();});
fireButton.addEventListener('contextmenu',event=>event.preventDefault());
$('#resetPlayer').onclick=()=>{if(!actor)return;clearPlayInput();if(vehicleEntry?.busy||vehicleEntry?.selfMounted){vehicleEntry.cancel();motion?.stop();driving=false;vehicleDriver.reset();setFirstPerson(false);syncDriveControls();}if(driving){vehicleDriver.reset();vehicleDriver.start?.();yaw=0;pitch=.35;updateVehicleCamera(camera,vehicleDriver,0,{instant:true});return;}motion?.stop();actor.position.copy(spawn);actor.rotation.y=0;target.copy(actor.position);yaw=.65;pitch=firstPerson?0:.25;distance=activeEnvironment?.playDistance||Math.max(1.8,actor.userData.height*2.85);};
function syncMechVariants(){
  for(const [selector,prefix] of [['#mechEntryControls','mech'],['#playMechEntryControls','playMech']]){
    const host=$(selector);if(!host)continue;host.hidden=!vehicleEntry?.paired;host.replaceChildren();
    if(!vehicleEntry?.paired)continue;
    const note=document.createElement('p');note.className='motion-status';note.textContent=vehicleEntry.retargeted?'Ion Titan · game clips retargeted to Andrew':'Ion Titan · original paired animations';host.append(note);
    for(const [direction,label,options,value] of [['enter','Embark',vehicleEntry.enterOptions,vehicleEntry.enterChoice],['exit','Disembark',vehicleEntry.exitOptions,vehicleEntry.exitChoice]]){
      const field=document.createElement('label');field.textContent=label;field.htmlFor=prefix+direction;
      const select=document.createElement('select');select.id=prefix+direction;select.setAttribute('aria-label',label+' animation');select.disabled=vehicleEntry.busy;
      for(const option of options){const item=document.createElement('option');item.value=option.id;item.textContent=option.name;select.append(item);}
      select.value=value;select.onchange=()=>{vehicleEntry.setVariant(direction,select.value);syncMechVariants();};field.append(select);host.append(field);
    }
  }
}
function syncDriveControls(){
  const busy=!!vehicleEntry?.busy;
  const flight=driving&&(vehicleDriver?.kind==='helicopter'||vehicleDriver?.kind==='airplane');const plane=driving&&vehicleDriver?.kind==='airplane';
  $('#driveVehicle').disabled=(!vehicleDriver&&!fleetDrivers.length)||busy;$('#driveVehicle').textContent=busy?(vehicleEntry.phase==='enter'?'Entering…':'Exiting…'):vehicleEntry?(driving?'E · Disembark':'E · Embark'):driving?'E · Exit vehicle':'E · Drive';
  if(vehicleDriver?.kind==='helicopter')$('#driveVehicle').textContent=driving?'E · Exit helicopter':'E · Pilot';
  if(vehicleDriver?.kind==='airplane')$('#driveVehicle').textContent=driving?'E · Exit plane':'E · Pilot';
  if(!vehicleDriver&&fleetDrivers.length&&!driving)$('#driveVehicle').textContent='E · Pilot';
  viewport.classList.toggle('is-flying',flight);$('#flightInstruments').hidden=!flight;$('#flightControls').hidden=!flight;$('#playAnimationControls').hidden=flight||!!vehicleEntry?.paired;
  $('#moveStickCaption').textContent=plane?'STICK':flight?'CYCLIC':'MOVE';$('#lookStickCaption').textContent=plane?'RUDDER / CAM':flight?'LIFT / YAW':'LOOK';applyFlightPanel(vehicleDriver?.kind);
  $('#entryAnimationStatus').textContent=vehicleEntry?'Original '+vehicleEntry.source+' entry / exit':vehicleDriver?'Instant entry · compatible original clip unavailable':(fleetDrivers.length?'Instant entry · walk up to a plane on the runway':'');
  if(vehicleDriver?.kind==='mech'){
    $('#driveVehicle').textContent=busy?(vehicleEntry.phase==='enter'?'Embarking…':'Disembarking…'):driving?'E · Disembark':'E · Embark Ion';
  }
  $('#driveVehicle').setAttribute('aria-pressed',String(driving));$('#driveSpeed').hidden=!driving;
  $('#togglePerspective').disabled=busy;$('#firstPersonScene').disabled=busy||!world;
  $('#moveJoystick').setAttribute('aria-label',flight?'Helicopter cyclic: forward, backward and strafe':driving?'Vehicle throttle and steering joystick':'Movement joystick');
  $('#lookJoystick').setAttribute('aria-label',flight?'Helicopter collective and yaw joystick':'Camera joystick');
  $('#playHelp').textContent=flight?'Flying · Left: cyclic · Right: lift / yaw':driving?(vehicleDriver?.kind==='airplane'?'Flying · Left stick: throttle (up climbs) / turn · Right stick: camera':'Driving · Left stick: throttle / steer · Right stick: camera'):(firstPerson?'First person · ':'')+'Left stick: move · Right stick: look';
  $('#driveHelp').textContent=flight?'Space / Shift: lift · WASD: cyclic · Q / R: yaw · H: hover':vehicleDriver?.kind==='airplane'?'W/S: throttle (above 55% climbs after takeoff speed) · A/D: turn · Space: wheel brake':'W/S: throttle · A/D: steer · Space: brake';
  if(vehicleDriver?.kind==='mech'){$('#playHelp').textContent=driving?'Piloting Ion · move / turn · right stick: camera':'Approach Ion and press E to embark';$('#driveHelp').textContent='W/S: walk · A/D: turn · Space: stop';}
  $('#driveHelp').hidden=!driving;syncPerspectiveButtons();motionUIKey='';syncMotionControls();syncMechVariants();
}
function leaveVehicle(){
  if(!driving)return;vehicleDriver.stop();const {car,size}=vehicleDriver;
  camera.far=activeEnvironment?.far||250;camera.near=activeEnvironment?.near||.01;camera.updateProjectionMatrix();
  if(car!==actor){const exitPose=vehicleEntry?.getExitPose?.();if(exitPose){actor.position.set(exitPose.position.x,spawn.y,exitPose.position.z);actor.rotation.y=exitPose.heading;}else actor.position.set(car.position.x+Math.cos(car.rotation.y)*(size.width/2+.8),spawn.y,car.position.z-Math.sin(car.rotation.y)*(size.width/2+.8));clampActor();}
  cockpit=false;cabin=false;driving=false;clearPlayInput();setFirstPerson(walkingFirstPerson);yaw=car.rotation.y+.65;target.copy(actor.position);
  distance=activeEnvironment?.playDistance||Math.max(1.8,actor.userData.height*2.85);syncDriveControls();
}
function toggleDriving(){
  if(!playing||(!vehicleDriver&&!fleetDrivers.length))return;
  if(vehicleEntry?.busy)return;
  if(driving&&(vehicleDriver.kind==='helicopter'||vehicleDriver.kind==='airplane')&&!vehicleDriver.grounded){$('#flightState').textContent='LAND BEFORE EXITING';return;}
  if(driving&&fleetDrivers.includes(vehicleDriver)){leaveVehicle();canvas.focus({preventScroll:true});return;}
  if(!driving&&fleetDrivers.length){
    const near=nearestFleetPlane();
    if(near){
      walkingFirstPerson=firstPerson;setFirstPerson(false);vehicleDriver=near;driving=true;clearPlayInput();vehicleDriver.stop();vehicleDriver.start?.();yaw=0;pitch=.35;actor.visible=false;
      camera.far=3000;camera.updateProjectionMatrix();
      updateVehicleCamera(camera,vehicleDriver,0,{instant:true});syncDriveControls();canvas.focus({preventScroll:true});return;
    }
    if(!vehicleDriver&&!vehicleEntry)return;
  }
  if(!driving&&!canEmbark())return;   // must be within 10 ft to climb in
  if(vehicleEntry){
    if(!driving)walkingFirstPerson=firstPerson;          // a first-person player stays in first person while climbing in
    clearPlayInput();vehicleDriver.stop();if(driving||!walkingFirstPerson){yaw=0;pitch=.35;}
    vehicleEntry.begin(driving?'exit':'enter',actor.getWorldPosition(new THREE.Vector3()));actor.visible=!!vehicleEntry.retargeted||!vehicleEntry.paired;
    updateVehicleCamera(camera,vehicleDriver,0,{instant:true});syncDriveControls();canvas.focus({preventScroll:true});return;
  }
  if(driving)leaveVehicle();else{
    walkingFirstPerson=firstPerson;setFirstPerson(false);driving=true;clearPlayInput();vehicleDriver.stop();vehicleDriver.start?.();yaw=0;pitch=.35;actor.visible=false;
    if(vehicleDriver.kind==='helicopter'||vehicleDriver.kind==='airplane'){camera.far=Math.max(3000,activeEnvironment?.far||0);camera.near=Math.max(activeEnvironment?.near||.01,.3);camera.updateProjectionMatrix();}
    cabin=walkingFirstPerson&&vehicleDriver.kind==='mech';cockpit=walkingFirstPerson;applyCameraClip();
    updateVehicleCamera(camera,vehicleDriver,0,{instant:true});syncDriveControls();
  }
  canvas.focus({preventScroll:true});
}
function updateDriving(dt){
  const steer=moveInput.x+padMove.x+(keys.has('d')||keys.has('arrowright')?1:0)-(keys.has('a')||keys.has('arrowleft')?1:0);
  const throttle=-(moveInput.y+padMove.y)+(keys.has('w')||keys.has('arrowup')?1:0)-(keys.has('s')||keys.has('arrowdown')?1:0);
  if(vehicleDriver.kind==='helicopter'){
    const lift=-(lookInput.y+padLook.y)+(keys.has(' ')?1:0)-(keys.has('shift')?1:0)+heldLift+mouseLiftTrim;
    const pedals=lookInput.x+padLook.x+(keys.has('r')?1:0)-(keys.has('q')?1:0);
    vehicleDriver.update(dt,{forward:throttle+mouseFlight.y,lateral:steer+mouseFlight.x,yaw:pedals,lift,bounds:movementBounds});
    updateFlightInstruments();return;
  }
  if(vehicleDriver.kind==='airplane'){
    const pitchInput=-(moveInput.y+padMove.y)+(keys.has('arrowup')?1:0)-(keys.has('arrowdown')?1:0);
    const rollInput=moveInput.x+padMove.x+(keys.has('arrowright')?1:0)-(keys.has('arrowleft')?1:0);
    const throttleInput=(keys.has('w')?1:0)-(keys.has('s')?1:0)+heldThrottle;
    const rudderInput=lookInput.x+padLook.x+(keys.has('r')?1:0)-(keys.has('q')?1:0);
    vehicleDriver.update(dt,{pitch:pitchInput,roll:rollInput,throttle:throttleInput,rudder:rudderInput,brake:keys.has(' '),bounds:movementBounds});
    pitch=THREE.MathUtils.clamp(pitch+(lookInput.y+padLook.y)*dt*1.6,cockpit?-.7:.1,cockpit?1.3:.85);
    updateAirplaneInstruments();return;
  }
  vehicleDriver.update(dt,{throttle,steer,brake:keys.has(' '),bounds:movementBounds});spinWheels(vehicleDriver,steer,dt);
  yaw-=(lookInput.x+padLook.x)*dt*2.4;pitch=THREE.MathUtils.clamp(pitch+(lookInput.y+padLook.y)*dt*1.6,cockpit?-.7:.1,cockpit?1.3:.85);
  $('#driveSpeed').textContent=Math.round(Math.abs(vehicleDriver.speed)*3.6)+' km/h'+(vehicleDriver.speed<-.1?' · Reverse':'');
}
function nearestFleetPlane(){
  if(!actor)return null;
  let best=null,bestDistance=Infinity;
  for(const driver of fleetDrivers){
    const {car,size}=driver,range=Math.max(size.width,size.length)/2+4;
    const distance=Math.hypot(car.position.x-actor.position.x,car.position.z-actor.position.z);
    if(distance<=range&&distance<bestDistance){best=driver;bestDistance=distance;}
  }
  return best;
}
$('#driveVehicle').onclick=toggleDriving;
function updateFlightInstruments(){
  const flight=vehicleDriver;
  $('#flightAltitude').textContent=flight.altitude.toFixed(1);$('#flightGroundSpeed').textContent=(flight.speed*1.943844).toFixed(0);
  $('#flightVerticalSpeed').textContent=(flight.verticalSpeed>=0?'+':'')+flight.verticalSpeed.toFixed(1);
  $('#flightHeading').textContent=String(Math.round(flight.heading)%360).padStart(3,'0')+'°';
  $('#flightRotor').textContent=flight.rotorPercent.toFixed(0)+'%';$('#flightCollective').textContent=flight.collectivePercent.toFixed(0)+'%';
  $('#flightPitch').textContent=flight.nosePitch.toFixed(0)+'°';$('#flightBank').textContent=flight.bank.toFixed(0)+'°';
  $('#flightHorizon').style.transform=`rotate(${-flight.bank}deg) translateY(${flight.nosePitch*1.2}px)`;
  $('#flightState').textContent=flight.rotorPercent<80?'ROTOR SPOOLING':flight.grounded?'ON GROUND':flight.hovering?'HOVER HOLD':'ASSISTED FLIGHT';
  $('#hoverFlight').setAttribute('aria-pressed',String(flight.hovering));
  $('#driveSpeed').textContent=(flight.speed*1.943844).toFixed(0)+' kt';
  $('#driveVehicle').disabled=!flight.grounded;$('#driveVehicle').textContent=flight.grounded?'E · Exit helicopter':'Land to exit';
}
function updateAirplaneInstruments(){
  const flight=vehicleDriver;
  $('#flightAltitude').textContent=flight.altitude.toFixed(1);$('#flightGroundSpeed').textContent=(flight.speed*1.943844).toFixed(0);
  $('#flightVerticalSpeed').textContent=(flight.verticalSpeed>=0?'+':'')+flight.verticalSpeed.toFixed(1);
  $('#flightHeading').textContent=String(Math.round(flight.heading)%360).padStart(3,'0')+'°';
  $('#flightRotor').textContent=flight.throttlePercent.toFixed(0)+'%';$('#flightCollective').textContent=(flight.elevatorPercent>=0?'+':'')+flight.elevatorPercent.toFixed(0)+'%';
  $('#flightPitch').textContent=flight.nosePitch.toFixed(0)+'°';$('#flightBank').textContent=flight.bank.toFixed(0)+'°';
  $('#flightHorizon').style.transform=`rotate(${-flight.bank}deg) translateY(${flight.nosePitch*1.2}px)`;
  $('#flightState').textContent=flight.enginePercent<80?'ENGINE SPOOLING':flight.stalled?'STALL':flight.grounded?(flight.takeoffReady?'PULL BACK TO TAKE OFF':flight.speed>1?'TAKEOFF ROLL':'ON GROUND'):'AIRBORNE';
  $('#driveSpeed').textContent=(flight.speed*1.943844).toFixed(0)+' kt';
  $('#driveVehicle').disabled=!flight.grounded;$('#driveVehicle').textContent=flight.grounded?'E · Exit plane':'Land to exit';
}
let flightPanelKind=null;
function applyFlightPanel(kind){
  const mode=kind==='airplane'?'airplane':kind==='helicopter'?'helicopter':null;
  if(mode===flightPanelKind)return;flightPanelKind=mode;
  const plane=mode==='airplane';
  $('#flightInstruments').setAttribute('aria-label',plane?'Airplane flight instruments':'Helicopter flight instruments');
  $('#flightControls').setAttribute('aria-label',plane?'Airplane flight controls':'Helicopter flight controls');
  $('#riseFlight').innerHTML=plane?'▲ Throttle <small>W</small>':'↑ Rise <small>Space</small>';
  $('#descendFlight').innerHTML=plane?'▼ Throttle <small>S</small>':'↓ Descend <small>Shift</small>';
  $('#hoverFlight').hidden=plane;
  $('#flightControls').querySelector('p').innerHTML=plane?'W/S throttle · Arrows: pitch / roll<br>Q/R rudder · Space brake · Land to exit':'W/S forward/back · A/D strafe · Q/R yaw<br>Drag: camera · Right-drag: cyclic<br>Wheel: climb trim · H: hold position';
  const labels=$('#flightInstruments').querySelectorAll('.flight-secondary span');
  labels[0].childNodes[0].textContent=plane?'THR ':'ROTOR ';
  labels[1].childNodes[0].textContent=plane?'ELEV ':'COLL ';
  $('#flightInstruments').querySelectorAll('dl dt')[1].textContent=plane?'IAS · kt':'GS · kt';
}
function hoverHelicopter(){if(!driving||vehicleDriver?.kind!=='helicopter')return;clearPlayInput();vehicleDriver.hover();canvas.focus({preventScroll:true});}
$('#hoverFlight').onclick=hoverHelicopter;
for(const [id,direction] of [['#riseFlight',1],['#descendFlight',-1]]){
  const button=$(id);
  button.addEventListener('pointerdown',event=>{if(!driving||vehicleDriver?.kind!=='helicopter')return;event.preventDefault();button.setPointerCapture(event.pointerId);heldLift=direction;canvas.focus({preventScroll:true});});
  for(const type of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(type,()=>{heldLift=0;});
  button.addEventListener('pointerdown',event=>{if(!driving||vehicleDriver?.kind!=='airplane')return;event.preventDefault();button.setPointerCapture(event.pointerId);heldThrottle=direction;canvas.focus({preventScroll:true});});
  for(const type of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(type,()=>{heldThrottle=0;});
}
function updateVehicleEntry(dt){
  const result=vehicleEntry.update(dt);
  if(result==='enter'){driving=true;cabin=walkingFirstPerson&&vehicleDriver?.kind==='mech';cockpit=walkingFirstPerson;if(walkingFirstPerson){yaw=0;pitch=.35;}firstPerson=false;applyCameraClip();vehicleDriver.captureRest?.();vehicleDriver.start?.();syncDriveControls();}
  else if(result==='exit'){vehicleDriver.captureRest?.();leaveVehicle();}
  else if(result==='cancelled'){cockpit=false;cabin=false;driving=false;setFirstPerson(walkingFirstPerson);applyCameraClip();syncDriveControls();}
}
function setupJoystick(id,input){
  const pad=$(id),thumb=pad.querySelector('.joystick-thumb');let pointerId=null;
  function reset(){
    const held=pointerId;pointerId=null;input.set(0,0);thumb.style.transform='translate(-50%,-50%)';pad.classList.remove('engaged');
    if(held!==null&&pad.hasPointerCapture(held))pad.releasePointerCapture(held);
  }
  function update(event){
    const rect=pad.getBoundingClientRect(),radius=rect.width*.34;
    const dx=event.clientX-(rect.left+rect.width/2),dy=event.clientY-(rect.top+rect.height/2),length=Math.hypot(dx,dy),scale=length>radius?radius/length:1;
    const x=dx*scale,y=dy*scale;input.set(x/radius,y/radius);
    if(input.length()<.12)input.set(0,0);
    thumb.style.transform=`translate(calc(-50% + ${x}px),calc(-50% + ${y}px))`;
  }
  pad.addEventListener('pointerdown',event=>{if(!playing||pointerId!==null)return;event.preventDefault();event.stopPropagation();pointerId=event.pointerId;pad.setPointerCapture(pointerId);pad.classList.add('engaged');update(event);});
  pad.addEventListener('pointermove',event=>{if(event.pointerId!==pointerId)return;event.preventDefault();update(event);});
  for(const type of ['pointerup','pointercancel','lostpointercapture'])pad.addEventListener(type,event=>{if(event.pointerId===pointerId)reset();});
  joystickResets.push(reset);
}
setupJoystick('#moveJoystick',moveInput);setupJoystick('#lookJoystick',lookInput);

// ---- Gamepad: Bluetooth/USB controllers on the standard mapping ----------------------------------
// Play asks for a controller the moment it starts: promptForGamepad (called from enterPlay) puts the
// 'Connect a Controller' toast up and arms the connection at that moment. A browser only hands a
// gamepad over after its user presses a button on it, which is what the toast asks for; the sticks
// then feed the same moveInput/lookInput channels as the touch sticks, so walking, driving and
// flight all read the pad. A = interact (E), B = stop play, Start = first/third person.
const padMove=new THREE.Vector2(),padLook=new THREE.Vector2(),padHeld=new Set();
let gamepadIndex=null,gamepadWanted=false,gamepadSeed=false,gamepadToastTimer=0;
function gamepadToast(message,sticky=false){
  const notice=$('#playNotice');notice.textContent=message;notice.hidden=false;
  clearTimeout(gamepadToastTimer);
  if(!sticky)gamepadToastTimer=setTimeout(()=>{notice.hidden=true;},5000);
}
function adoptGamepad(){
  gamepadIndex=null;
  for(const pad of navigator.getGamepads?navigator.getGamepads():[])if(pad&&pad.connected){gamepadIndex=pad.index;gamepadSeed=true;return pad;}
  return null;
}
function promptForGamepad(){
  gamepadWanted=true;
  const pad=adoptGamepad();
  if(pad)gamepadToast('🎮 Controller connected: '+pad.id.slice(0,42));
  else gamepadToast('🎮 Connect a Controller — press any button on it',true);
}
window.addEventListener('gamepadconnected',event=>{
  gamepadIndex=event.gamepad.index;gamepadSeed=true;
  if(gamepadWanted&&playing)gamepadToast('🎮 Controller connected: '+event.gamepad.id.slice(0,42));
});
window.addEventListener('gamepaddisconnected',event=>{
  if(event.gamepad.index!==gamepadIndex)return;
  gamepadIndex=null;padHeld.clear();
  if(gamepadWanted&&playing)gamepadToast('🎮 Controller disconnected — Connect a Controller',true);
});
const padAxis=value=>Math.abs(value)<.15?0:value;
function pollGamepad(){
  padMove.set(0,0);padLook.set(0,0);
  if(!playing||gamepadIndex===null||!navigator.getGamepads)return;
  const pad=navigator.getGamepads()[gamepadIndex];
  if(!pad||!pad.connected)return;
  padMove.set(padAxis(pad.axes[0]||0),padAxis(pad.axes[1]||0));
  padLook.set(padAxis(pad.axes[2]||0),padAxis(pad.axes[3]||0));
  const down=i=>!!pad.buttons[i]?.pressed;
  // The D-pad mirrors the left stick.
  if(down(14))padMove.x-=1;if(down(15))padMove.x+=1;if(down(12))padMove.y-=1;if(down(13))padMove.y+=1;
  if(padMove.length()>1)padMove.normalize();
  // The press that woke the controller up must not also trigger an action: seed what's held.
  if(gamepadSeed){gamepadSeed=false;pad.buttons.forEach((button,i)=>{if(button.pressed)padHeld.add(i);});}
  for(const [index,action] of [[0,()=>toggleDriving()],[1,()=>exitPlay()],[9,()=>toggleFirstPersonView()]]){
    if(down(index)){if(!padHeld.has(index)){padHeld.add(index);action();}}
    else padHeld.delete(index);
  }
}
window.addEventListener('keydown',event=>{
  if(!playing)return;
  const key=event.key.toLowerCase();
  if(key==='escape'){event.preventDefault();exitPlay();return;}
  if(key==='e'&&!event.repeat&&!(event.target instanceof HTMLElement&&event.target.closest('select,input,textarea,[contenteditable=true]'))){event.preventDefault();toggleDriving();return;}
  if(key==='t'&&cabin&&!event.repeat&&!(event.target instanceof HTMLElement&&event.target.closest('select,input,textarea,[contenteditable=true]'))){event.preventDefault();cabinView.toggleInteractive();return;}
  if(event.target instanceof HTMLElement&&event.target.closest('select,input,textarea,button'))return;
  if(driving&&vehicleDriver?.kind==='helicopter'&&key==='h'){event.preventDefault();hoverHelicopter();return;}
  if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].includes(key)||(driving&&key===' ')||(driving&&(vehicleDriver?.kind==='helicopter'||vehicleDriver?.kind==='airplane')&&['q','r'].includes(key))||(driving&&vehicleDriver?.kind==='helicopter'&&key==='shift')){event.preventDefault();keys.add(key);}
});
window.addEventListener('keyup',event=>keys.delete(event.key.toLowerCase()));
window.addEventListener('blur',clearPlayInput);
document.addEventListener('visibilitychange',()=>{if(document.hidden)clearPlayInput()});

function pan(dx,dy){
  const scale=distance*.0015,right=new THREE.Vector3(1,0,0).applyQuaternion(camera.quaternion),up=new THREE.Vector3(0,1,0).applyQuaternion(camera.quaternion);
  target.addScaledVector(right,-dx*scale).addScaledVector(up,dy*scale);
}
canvas.tabIndex=0;canvas.setAttribute('aria-description','Drag to orbit, right-drag to pan, scroll or pinch to zoom. Arrow keys orbit, plus and minus zoom, F frames the character, R resets the camera.');
canvas.addEventListener('contextmenu',event=>event.preventDefault());
canvas.addEventListener('pointerdown',event=>{
  if(cabinView.interactive)cabinView.setInteractive(false);
  if(!world)return;canvas.focus();canvas.setPointerCapture(event.pointerId);pointers.set(event.pointerId,{x:event.clientX,y:event.clientY,pan:event.button===2});
  if(pointers.size===2){const [a,b]=[...pointers.values()];pinchDistance=Math.hypot(a.x-b.x,a.y-b.y)}
});
canvas.addEventListener('pointermove',event=>{
  const previous=pointers.get(event.pointerId);if(!previous||!world)return;
  pointers.set(event.pointerId,{x:event.clientX,y:event.clientY,pan:previous.pan});
  if(driving){
    if(vehicleDriver?.kind==='helicopter'&&previous.pan){mouseFlight.x=THREE.MathUtils.clamp(mouseFlight.x+(event.clientX-previous.x)*.008,-1,1);mouseFlight.y=THREE.MathUtils.clamp(mouseFlight.y-(event.clientY-previous.y)*.008,-1,1);return;}
    yaw-=(event.clientX-previous.x)*.007;pitch=THREE.MathUtils.clamp(pitch+(event.clientY-previous.y)*.007,cockpit?-.7:.1,cockpit?1.3:.85);return;
  }
  if(playing&&firstPerson){yaw-=(event.clientX-previous.x)*.007;pitch=THREE.MathUtils.clamp(pitch+(event.clientY-previous.y)*.007,-1.45,1.45);return;}
  if(pointers.size===2){const [a,b]=[...pointers.values()],separation=Math.hypot(a.x-b.x,a.y-b.y);if(pinchDistance>0&&separation>0)distance=THREE.MathUtils.clamp(distance*pinchDistance/separation,.7,150);pinchDistance=separation;return;}
  const dx=event.clientX-previous.x,dy=event.clientY-previous.y;
  if(previous.pan)pan(dx,dy);else{yaw-=dx*.007;pitch=THREE.MathUtils.clamp(pitch+dy*.007,-.15,1.45)}
});
function releasePointer(event){pointers.delete(event.pointerId);pinchDistance=0;mouseFlight.set(0,0);}
canvas.addEventListener('pointerup',releasePointer);canvas.addEventListener('pointercancel',releasePointer);canvas.addEventListener('lostpointercapture',releasePointer);
canvas.addEventListener('wheel',event=>{if(!world)return;event.preventDefault();if(driving&&vehicleDriver?.kind==='helicopter'){mouseLiftTrim=THREE.MathUtils.clamp(mouseLiftTrim-Math.sign(event.deltaY)*.2,-1,1);return;}if(playing&&firstPerson)return;distance=THREE.MathUtils.clamp(distance*Math.exp(event.deltaY*.001),.7,150)},{passive:false});
canvas.addEventListener('keydown',event=>{
  if(!world||playing)return;
  const key=event.key.toLowerCase();
  if(!['arrowleft','arrowright','arrowup','arrowdown','+','=','-','f','r'].includes(key))return;
  event.preventDefault();
  if(key==='arrowleft')yaw+=.1;if(key==='arrowright')yaw-=.1;
  if(key==='arrowup')pitch=Math.min(1.45,pitch+.1);if(key==='arrowdown')pitch=Math.max(-.15,pitch-.1);
  if(key==='+'||key==='=')distance=Math.max(.7,distance*.9);if(key==='-')distance=Math.min(150,distance*1.1);
  if(key==='f')frameCharacter();if(key==='r')resetCamera();
});

// ---- multiplayer: Start Server menu, live shared session (character model + name) ----
function mpPose(){
  if(!actor)return null;
  const own=vehicleDriver?.car,vid=own&&own!==actor?own.userData?.vehicle?.id:'';
  const vehiclePose=vid?{vehicle:vid,vx:own.position.x,vy:own.position.y,vz:own.position.z,vry:own.rotation.y}:{};
  const car=driving&&own;
  if(car&&car!==actor)return{x:car.position.x,y:car.position.y,z:car.position.z,ry:car.rotation.y,driving:true,...vehiclePose};
  return{x:actor.position.x,y:actor.position.y-(actor.userData.height||1.75)/2,z:actor.position.z,ry:actor.rotation.y,driving:!!driving,...vehiclePose};
}
const mpLoader=new GLTFLoader();
async function mpLoadVehicle(id){
  const vehicle=vehicleCatalogs.flatMap(catalog=>catalog.vehicles).find(item=>item.id===id);if(!vehicle)return null;
  const car=(await mpLoader.loadAsync(WHEELED.has(vehicle.id)?'./assets/firstlight-vehicles/drive/'+vehicle.id+'.glb':vehicle.animationModel||vehicle.model)).scene;
  car.name=vehicle.name;car.updateMatrixWorld(true);
  const box=(vehicle.family==='titan_mech'?prepareIonModel(car):null)||new THREE.Box3().setFromObject(car),centre=box.getCenter(new THREE.Vector3());
  const holder=new THREE.Group();holder.name='Remote vehicle: '+vehicle.name;car.position.sub(new THREE.Vector3(centre.x,box.min.y,centre.z));holder.add(car);
  holder.traverse(object=>{if(object.isMesh){object.castShadow=true;object.receiveShadow=true}});
  return holder;
}
function mpJoinEnvironment(id){
  if(!environments.some(environment=>environment.id===id)||loading||playing)return;
  if(world&&activeEnvironment?.id===id)return;
  environmentSelect.value=id;updateDescription();$('#loaderForm').requestSubmit();
}
mp=createMultiplayer({viewport,buttons:[$('#serverMenu'),$('#serverMenuPlay')],quickButtons:[$('#quickJoin'),$('#quickJoinPlay')],getWorld:()=>world,getEnvironmentId:()=>activeEnvironment?.id||'',getSelectedEnvironmentId:()=>environmentSelect.value,getCharacterId:()=>loadedCharacterId||characterSelect.value,getPose:mpPose,loadVehicle:mpLoadVehicle,normalizeCharacter,onJoinedEnvironment:mpJoinEnvironment});

// ---- sidebar hide / unhide ----
function setSidebar(hidden){document.querySelector('.loader-layout').classList.toggle('sidebar-hidden',hidden);$('#showSidebar').hidden=!hidden;$('#hideSidebar').setAttribute('aria-expanded',String(!hidden));requestAnimationFrame(()=>window.dispatchEvent(new Event('resize')));}
$('#hideSidebar').onclick=()=>setSidebar(true);$('#showSidebar').onclick=()=>setSidebar(false);
