import * as THREE from './vendor/modern/three.module.js';
import {createCharacterMotion} from './character-motion.js';
import {createNativeVehicleEntry} from './vehicle-entry.js';
import {createIonOccupant} from './ion-occupant.js';

function role(root,name){let found=null;root.traverse(node=>{if(node.userData.ionRole===name)found=node;});return found;}

export function prepareIonModel(root){
  const titan=role(root,'titan-mesh'),pilot=role(root,'pilot-mesh');
  if(pilot)pilot.visible=false;
  root.updateMatrixWorld(true);
  titan?.traverse(node=>{if(node.isSkinnedMesh){node.skeleton.update();node.computeBoundingBox();node.frustumCulled=false;}});
  return titan?new THREE.Box3().setFromObject(titan):null;
}

// Keep the original Titan/pilot timing. Andrew uses an explicit bind-pose
// retarget; other unsupported rigs retain instant entry.
export function createIonEntry(root,clips,character,vehicle,actor=null){
  const pilot=role(root,'pilot-mesh'),pilotRoot=role(root,'pilot-root'),hips=role(root,'pilot-hips'),titanRoot=role(root,'titan-root');
  if(!pilot||!pilotRoot||!hips||!titanRoot)return null;
  pilot.visible=false;
  const retargeted=character.id==='andrew';
  if(vehicle.entryAnimation?.characterId!==character.id&&!retargeted)return null;
  const occupant=retargeted?createIonOccupant(root,actor):null;
  if(retargeted&&!occupant)return null;
  const motion=createCharacterMotion(root,{clips});
  const native=createNativeVehicleEntry(motion,{id:vehicle.entryAnimation.characterId},vehicle);
  if(!native){motion.stop();return null;}
  const enter=vehicle.entryAnimation.enter.filter(id=>motion.presets.some(p=>p.id===id));
  const exit=vehicle.entryAnimation.exit.filter(id=>motion.presets.some(p=>p.id===id));
  const titanNodes=[];titanRoot.traverse(node=>titanNodes.push(node));
  const capture=()=>titanNodes.map(node=>({node,p:node.position.clone(),q:node.quaternion.clone(),s:node.scale.clone()}));
  const restore=pose=>pose.forEach(({node,p,q,s})=>{node.position.copy(p);node.quaternion.copy(q);node.scale.copy(s);});
  const anchors=new Map();
  for(const id of enter){
    motion.select(id);motion.trigger();motion.update(0,{playing:true});root.updateMatrixWorld(true);
    anchors.set(id,root.worldToLocal(hips.getWorldPosition(new THREE.Vector3())));
  }
  motion.stop();pilot.visible=false;
  let preferredEnter='auto',preferredExit=exit[0],bridge=null,exitPose=null;
  // The pilot rig's head bone, so a first-person camera can ride along while the pilot climbs in.
  let pilotHead=null;pilotRoot.traverse(node=>{if(!pilotHead&&node.isBone&&/(^|_)head$/i.test((node.userData.unityBoneName||node.name).split(':').pop().replace(/_\d+$/,'')))pilotHead=node;});
  const label=id=>id.replace(/^glb:/,'');
  return {
    paired:true,selfMounted:false,retargeted,source:retargeted?'Titanfall 2 · retargeted to Andrew':'Titanfall 2',
    enterOptions:[{id:'auto',name:'Automatic · nearest side'},...enter.map(id=>({id,name:label(id)}))],
    exitOptions:exit.map(id=>({id,name:label(id)})),
    get busy(){return native.busy;},get phase(){return native.phase;},
    get enterChoice(){return preferredEnter;},get exitChoice(){return preferredExit;},
    setVariant(direction,id){if(native.busy)return false;if(direction==='enter'&&(id==='auto'||enter.includes(id)))preferredEnter=id;else if(direction==='exit'&&exit.includes(id))preferredExit=id;else return false;return true;},
    begin(direction,actorPosition=null){
      if(native.busy)return false;
      let selected=direction==='exit'?preferredExit:preferredEnter;
      if(direction==='enter'&&selected==='auto'){
        selected=enter.filter(id=>!id.includes('stand front')).reduce((best,id)=>{
          if(!actorPosition)return best;
          const a=root.localToWorld(anchors.get(id).clone()),b=root.localToWorld(anchors.get(best).clone());
          return Math.hypot(a.x-actorPosition.x,a.z-actorPosition.z)<Math.hypot(b.x-actorPosition.x,b.z-actorPosition.z)?id:best;
        },enter[0]);
      }
      const before=capture();motion.select(selected);
      if(!native.begin(direction))return false;
      motion.update(0,{playing:true});const after=capture();restore(before);
      bridge={before,after,elapsed:0};exitPose=null;pilot.visible=!retargeted;root.updateMatrixWorld(true);occupant?.begin();occupant?.update();return true;
    },
    update(dt){
      if(bridge){
        bridge.elapsed+=dt;const t=Math.min(1,bridge.elapsed/.35),ease=t*t*(3-2*t);
        bridge.before.forEach((from,i)=>{const to=bridge.after[i];from.node.position.lerpVectors(from.p,to.p,ease);from.node.quaternion.slerpQuaternions(from.q,to.q,ease);from.node.scale.lerpVectors(from.s,to.s,ease);});
        root.updateMatrixWorld(true);occupant?.update();if(t<1)return null;bridge=null;
      }
      const result=native.update(dt);occupant?.update();
      if(result){
        root.updateMatrixWorld(true);
        if(result==='exit'){
          const position=hips.getWorldPosition(new THREE.Vector3()),forward=new THREE.Vector3(0,0,1).applyQuaternion(pilotRoot.getWorldQuaternion(new THREE.Quaternion()));
          exitPose={position,heading:Math.atan2(forward.x,forward.z)};
        }
        pilot.visible=false;occupant?.restore();
      }
      return result;
    },
    getExitPose(){return exitPose;},
    getHead(){return occupant?.head||pilotHead||null;},
    cancel(){occupant?.restore();native.cancel();motion.stop();bridge=null;exitPose=null;pilot.visible=false;}
  };
}
