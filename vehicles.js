import * as THREE from 'three';
import {GLTFLoader} from './vendor/modern/GLTFLoader.js';
import {loadVehicleCatalog} from './vehicle-catalog.js';
import {applyStudioEnvironment} from './studio-lighting.js';

const $=selector=>document.querySelector(selector),dialog=$('#vehicleDialog');
let catalog,selectedType='all',selectedGame='all',signature='',renderer,scene,camera,model,drag=null,yaw=.65,pitch=.28,distance=5,loadId=0,mixer=null,clips=[],lastTime=0;
const target=new THREE.Vector3(),previewCache=new Map(),queue=[];let previewRenderer,previewBusy=false;
const categories=[['all','All vehicles'],['cars','Cars & SUVs'],['bikes','Bikes & scooters'],['utility','Trucks & machinery'],['mechs','Mechs & Titans'],['air','Aircraft & drones'],['water','Watercraft']];
function type(vehicle){const name=vehicle.family;return /mech|titan/.test(name)?'mechs':/boat|ship|yacht|dinghy|submarine|dugong|barge/.test(name)?'water':/plane|jet|helicopter|drone/.test(name)?'air':/bike|bicycle|scooter|motorcycle/.test(name)?'bikes':/truck|lorry|tractor|forklift|digger|crane|trailer|apc|apv|cable_car/.test(name)?'utility':'cars';}
function gameId(vehicle){return vehicle.gameId||catalog.gameId||'007-first-light';}
function gameName(vehicle){return catalog.games?.find(game=>game.id===gameId(vehicle))?.name||vehicle.gameName||vehicle.game||(gameId(vehicle)===(catalog.gameId||'007-first-light')?catalog.game:null)||gameId(vehicle).split('-').map(word=>word.charAt(0).toUpperCase()+word.slice(1)).join(' ');}
function selectGame(id){selectedGame=id;render();}
function renderGames(){
  const games=new Map();for(const vehicle of catalog.vehicles){const id=gameId(vehicle);if(!games.has(id))games.set(id,{id,name:gameName(vehicle),count:0});games.get(id).count++;}
  if(selectedGame!=='all'&&!games.has(selectedGame))selectedGame='all';
  const entries=[{id:'all',name:'All games',count:catalog.vehicles.length},...[...games.values()].sort((a,b)=>a.name.localeCompare(b.name))];
  $('#vehicleGames').replaceChildren();$('#vehicleGameFilter').replaceChildren();
  for(const game of entries){
    const option=document.createElement('option');option.value=game.id;option.textContent=game.name;$('#vehicleGameFilter').append(option);
    const button=document.createElement('button');button.type='button';button.className='game-nav'+(game.id===selectedGame?' active':'');button.setAttribute('aria-pressed',String(game.id===selectedGame));button.textContent=game.name;
    const count=document.createElement('b');count.textContent=game.count;button.append(count);button.onclick=()=>selectGame(game.id);$('#vehicleGames').append(button);
  }
  $('#vehicleGameFilter').value=selectedGame;
}
async function load(){
  try{
    const next=await loadVehicleCatalog(),key=JSON.stringify(next);
    catalog=next;if(key!==signature){signature=key;render();}
    const imported=catalog.vehicles.filter(v=>v.model).length,partial=catalog.vehicles.filter(v=>v.status==='partial').length;
    $('#vehicleSummary').textContent=`${imported} imported · ${partial} partial · ${catalog.vehicles.length} families`;
    $('#vehicleStatus').textContent=(catalog.complete?'Batch finished. Select a vehicle to inspect its imported mesh. Animated vehicles can also be opened in Custom Loader.':'Batch importing vehicles… completed assets appear here as they become available.')+(catalog.warning?' '+catalog.warning:'');
    if(!catalog.complete)setTimeout(load,10000);
  }catch(error){$('#vehicleStatus').textContent=error.message;}
}
function render(){
  renderGames();
  $('#vehicleCount').textContent=catalog.vehicles.length;$('#vehicleTypes').replaceChildren();
  for(const [id,label] of categories){const button=document.createElement('button');button.type='button';button.className='game-nav'+(id===selectedType?' active':'');button.setAttribute('aria-pressed',String(id===selectedType));button.textContent=label;const count=document.createElement('b');count.textContent=catalog.vehicles.filter(v=>(selectedGame==='all'||gameId(v)===selectedGame)&&(id==='all'||type(v)===id)).length;button.append(count);button.onclick=()=>{selectedType=id;render();};$('#vehicleTypes').append(button);}
  observer.disconnect();$('#vehicleGrid').replaceChildren();
  const search=$('#vehicleSearch').value.trim().toLowerCase(),filter=$('#vehicleFilter').value;
  const visible=catalog.vehicles.filter(v=>(selectedGame==='all'||gameId(v)===selectedGame)&&(selectedType==='all'||type(v)===selectedType)&&v.name.toLowerCase().includes(search)&&(filter==='all'||(filter==='imported'?!!v.model:v.status===filter))).sort((a,b)=>a.name.localeCompare(b.name));
  $('#vehicleResults').textContent=`${visible.length} of ${catalog.vehicles.length} vehicles`;
  for(const vehicle of visible){
    const card=document.createElement('article');card.className='character-card vehicle-card';card.dataset.status=vehicle.status;
    const preview=document.createElement('button');preview.type='button';preview.className='character-preview';preview.setAttribute('aria-label','Open '+vehicle.name);preview.disabled=!vehicle.model;
    const placeholder=document.createElement('span');placeholder.className='preview-placeholder';placeholder.textContent='▰';
    const image=document.createElement('img');image.hidden=true;image.alt=vehicle.name+' imported mesh preview';
    const badge=document.createElement('span');badge.className='model-badge';badge.textContent=vehicle.status==='ready'?'IMPORTED MAIN MESH':vehicle.status==='partial'?'PARTIAL IMPORT':'UNAVAILABLE';preview.append(placeholder,image,badge);
    const details=document.createElement('div');details.className='card-details';const title=document.createElement('div');title.className='card-title';const strong=document.createElement('strong');strong.textContent=vehicle.name;title.append(strong);
    const description=document.createElement('p');description.className='character-description vehicle-description';description.textContent=gameName(vehicle)+' · '+(vehicle.description||(vehicle.model?(vehicle.mainMesh?'Original main mesh':'Available component preview · main mesh not identified'):'Resources could not be converted from the currently readable archives.'));
    const info=document.createElement('div');info.className='asset-info';for(const value of vehicle.model?['GLB',vehicle.triangles.toLocaleString()+' triangles',vehicle.animationCount?vehicle.enterCount+' embark · '+vehicle.exitCount+' disembark':'Static preview']:['Not imported']){const span=document.createElement('span');span.textContent=value;info.append(span);}
    const open=document.createElement('button');open.type='button';open.className='open-character';open.disabled=!vehicle.model;open.textContent=vehicle.model?'Open vehicle ↗':'Import unavailable';open.onclick=preview.onclick=()=>openVehicle(vehicle);
    details.append(title,description,info,open);
    if(vehicle.playCharacterId){const play=document.createElement('a');play.className='open-character';play.textContent='Load with Jack Cooper ↗';play.href='./custom-loader.html?character='+encodeURIComponent(vehicle.playCharacterId)+'&vehicle='+encodeURIComponent(vehicle.id)+'&environment=studio';details.append(play);}
    card.append(preview,details);$('#vehicleGrid').append(card);
    if(vehicle.model){preview.vehicle=vehicle;preview.previewImage=image;preview.placeholder=placeholder;observer.observe(preview);}
  }
  if(!visible.length){const empty=document.createElement('p');empty.className='empty-game';empty.textContent='No vehicles match these filters.';$('#vehicleGrid').append(empty);}
}
const observer=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){observer.unobserve(entry.target);queue.push(entry.target);drainPreviews();}},{rootMargin:'100px'});
function dispose(root){root?.traverse(object=>{if(object.isMesh){object.geometry.dispose();for(const mat of Array.isArray(object.material)?object.material:[object.material]){for(const value of Object.values(mat))if(value?.isTexture)value.dispose();mat.dispose();}}});}
function lighting(scene){const light=new THREE.DirectionalLight(0xffffff,3);light.position.set(4,8,5);scene.add(light,new THREE.HemisphereLight(0xd8ecff,0x4e5846,2));}
function frameObject(object){object.updateMatrixWorld(true);object.traverse(node=>{if(node.isSkinnedMesh){node.skeleton.update();node.computeBoundingBox();node.frustumCulled=false;}});const bounds=new THREE.Box3().setFromObject(object);const size=bounds.getSize(new THREE.Vector3());bounds.getCenter(target);return Math.max(size.x,size.y,size.z);}
async function drainPreviews(){
  if(previewBusy)return;previewBusy=true;
  while(queue.length){const item=queue.shift();if(!item.isConnected)continue;const vehicle=item.vehicle;let object;
    try{
      let data=vehicle.thumbnail||previewCache.get(vehicle.id);
      if(!data){
        object=(await new GLTFLoader().loadAsync(vehicle.model)).scene;
        if(!previewRenderer){previewRenderer=new THREE.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true});previewRenderer.setSize(480,320);previewRenderer.setPixelRatio(1);}
        object.updateMatrixWorld(true);object.traverse(node=>{if(node.isSkinnedMesh){node.skeleton.update();node.computeBoundingBox();node.frustumCulled=false;}});
        const previewScene=new THREE.Scene(),bounds=new THREE.Box3().setFromObject(object),center=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3()),scale=2/Math.max(size.x,size.y,size.z);
        if(vehicle.family==='titan_mech')applyStudioEnvironment(previewScene,previewRenderer);
        object.position.sub(center);const holder=new THREE.Group();holder.add(object);holder.scale.setScalar(scale);previewScene.add(holder);lighting(previewScene);
        const previewCamera=new THREE.PerspectiveCamera(36,1.5,.01,100);previewCamera.position.set(2.4,1.4,3.6);previewCamera.lookAt(0,0,0);previewRenderer.render(previewScene,previewCamera);data=previewRenderer.domElement.toDataURL('image/png');previewCache.set(vehicle.id,data);
      }
      if(item.isConnected){item.previewImage.src=data;item.previewImage.hidden=false;item.placeholder.hidden=true;}
    }catch{item.placeholder.textContent='▰';}finally{dispose(object);}
  }
  previewBusy=false;
}
function initialize(){
  if(renderer)return;renderer=new THREE.WebGLRenderer({canvas:$('#vehicleCanvas'),antialias:true,preserveDrawingBuffer:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=THREE.SRGBColorSpace;scene=new THREE.Scene();scene.background=new THREE.Color(0x17241c);camera=new THREE.PerspectiveCamera(40,1,.01,5000);lighting(scene);new ResizeObserver(resize).observe($('#vehicleStage'));requestAnimationFrame(animate);
}
function resize(){if(!renderer)return;const rect=$('#vehicleStage').getBoundingClientRect();renderer.setSize(rect.width,rect.height,false);camera.aspect=rect.width/Math.max(1,rect.height);camera.updateProjectionMatrix();}
function frame(){if(!model)return;const size=frameObject(model);const limitingFov=Math.min(camera.fov*Math.PI/180,2*Math.atan(Math.tan(camera.fov*Math.PI/360)*camera.aspect));distance=size/(2*Math.tan(limitingFov/2))*1.2;camera.near=Math.max(.001,size/10000);camera.far=Math.max(100,size*100);camera.updateProjectionMatrix();yaw=.65;pitch=.28;}
function animate(time){requestAnimationFrame(animate);const dt=Math.min(.1,(time-lastTime)/1000||0);lastTime=time;if(!dialog.open||!model)return;mixer?.update(dt);if($('#rotateVehicle').checked&&!drag)yaw+=.003;camera.position.set(target.x+distance*Math.cos(pitch)*Math.sin(yaw),target.y+distance*Math.sin(pitch),target.z+distance*Math.cos(pitch)*Math.cos(yaw));camera.lookAt(target);renderer.render(scene,camera);}
async function openVehicle(vehicle){
  if(!vehicle.model)return;const token=++loadId;$('#vehicleTitle').textContent=vehicle.name;$('#vehicleDetails').textContent=gameName(vehicle)+' · '+vehicle.triangles.toLocaleString()+' triangles · '+(vehicle.animationCount?vehicle.animationCount+' original animations':vehicle.status==='partial'?'Partial import':'Imported main mesh');$('#vehicleWarnings').textContent=vehicle.warnings.join(' · ');$('#vehicleLoading').textContent='Loading model…';$('#vehicleLoading').hidden=false;$('#wireframeVehicle').checked=false;$('#downloadVehicle').href=vehicle.model;$('#downloadVehicle').download=vehicle.id+'.glb';
  mixer?.stopAllAction();mixer=null;clips=[];$('#vehicleAnimation').replaceChildren(new Option('Rest pose',''));$('#vehicleAnimation').disabled=true;
  if(!dialog.open)dialog.showModal();initialize();if(vehicle.family==='titan_mech')applyStudioEnvironment(scene,renderer);else scene.environment=null;resize();if(model){scene.remove(model);dispose(model);model=null;}
  try{const result=await new GLTFLoader().loadAsync(vehicle.model);if(token!==loadId){dispose(result.scene);return;}model=result.scene;scene.add(model);clips=result.animations||[];mixer=clips.length?new THREE.AnimationMixer(model):null;clips.forEach((clip,i)=>$('#vehicleAnimation').append(new Option(clip.name,String(i))));$('#vehicleAnimation').disabled=!clips.length;frame();$('#vehicleLoading').hidden=true;}
  catch(error){if(token===loadId)$('#vehicleLoading').textContent='Could not load this vehicle: '+error.message;}
}
$('#closeVehicle').onclick=()=>dialog.close();dialog.addEventListener('close',()=>{++loadId;drag=null;mixer?.stopAllAction();mixer=null;clips=[];if(model){scene.remove(model);dispose(model);model=null;}});
$('#vehicleAnimation').onchange=()=>{if(!mixer)return;mixer.stopAllAction();const value=$('#vehicleAnimation').value;if(value==='')return;const action=mixer.clipAction(clips[Number(value)]);action.reset().setLoop(THREE.LoopOnce,1);action.clampWhenFinished=true;action.play();};
$('#frameVehicle').onclick=frame;$('#wireframeVehicle').onchange=()=>model?.traverse(object=>{if(object.isMesh)for(const mat of Array.isArray(object.material)?object.material:[object.material])mat.wireframe=$('#wireframeVehicle').checked;});
$('#renderVehicle').onclick=()=>{if(!model)return;renderer.render(scene,camera);const link=document.createElement('a');link.download='vehicle-render.png';link.href=renderer.domElement.toDataURL('image/png');link.click();};
const canvas=$('#vehicleCanvas'),touches=new Map();let pinch=0;
canvas.onpointerdown=event=>{canvas.setPointerCapture(event.pointerId);touches.set(event.pointerId,{x:event.clientX,y:event.clientY});drag=event.pointerId;if(touches.size===2){const [a,b]=[...touches.values()];pinch=Math.hypot(a.x-b.x,a.y-b.y);}};
canvas.onpointermove=event=>{const previous=touches.get(event.pointerId);if(!previous)return;touches.set(event.pointerId,{x:event.clientX,y:event.clientY});if(touches.size===2){const [a,b]=[...touches.values()],next=Math.hypot(a.x-b.x,a.y-b.y);if(pinch>0&&next>0)distance=Math.max(.05,distance*pinch/next);pinch=next;return;}yaw-=(event.clientX-previous.x)*.007;pitch=THREE.MathUtils.clamp(pitch+(event.clientY-previous.y)*.007,-1.3,1.3);};
for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,e=>{touches.delete(e.pointerId);drag=touches.size?[...touches.keys()][0]:null;pinch=0;});
canvas.addEventListener('wheel',event=>{event.preventDefault();distance=THREE.MathUtils.clamp(distance*Math.exp(event.deltaY*.001),.05,10000);},{passive:false});
$('#vehicleGameFilter').onchange=()=>catalog&&selectGame($('#vehicleGameFilter').value);
$('#vehicleSearch').oninput=$('#vehicleFilter').onchange=()=>catalog&&render();load();
