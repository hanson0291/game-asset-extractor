import * as THREE from './vendor/modern/three.module.js';

export const motionPresets=[
  {id:'walk',name:'Walk',mode:'loop',cadence:1.45,stride:.48,knee:.65,arm:.32,bob:.012,speed:1},
  {id:'brisk',name:'Brisk walk',mode:'loop',cadence:2.1,stride:.66,knee:.9,arm:.5,bob:.018,speed:1.4},
  {id:'sneak',name:'Sneak walk',mode:'loop',cadence:.95,stride:.28,knee:.5,arm:.18,bob:.007,speed:.5},
  {id:'step',name:'Step forward',mode:'once',duration:.95},
  {id:'turn',name:'Turn around',mode:'once',duration:1.3}
];

// Preview motions use the original weighted game rigs, not imported game clips.
function createPreviewMotion(root){
  const bones=new Map(),rest=new Map();
  root.updateMatrixWorld(true);
  root.traverse(object=>{
    if(object.isSkinnedMesh)object.frustumCulled=false;
    if(!object.isBone)return;
    const name=(object.userData.unityBoneName||object.name).split(':').pop().toLowerCase();
    bones.set(name,object);
    rest.set(object,{position:object.position.clone(),quaternion:object.quaternion.clone()});
  });
  const quadruped=bones.has('hip')&&bones.has('shoulder_l')&&bones.has('left_thigh');
  const aliases=quadruped?{
    hips:'hip',spine:'spine_1',spine1:'spine_5',
    leftupleg:'left_thigh',leftleg:'left_knee',leftfoot:'left_ankle',
    rightupleg:'right_thigh',rightleg:'right_knee',rightfoot:'right_ankle',
    leftarm:'shoulder_l',leftforearm:'elbow_l',lefthand:'wrist_l',
    rightarm:'shoulder_r',rightforearm:'elbow_r',righthand:'wrist_r'
  }:{
    hips:'def_c_hip',spine:'def_c_spinea',spine1:'def_c_spineb',head:'def_c_head',
    leftupleg:'def_l_thigh',leftleg:'def_l_knee',leftfoot:'def_l_ankle',
    rightupleg:'def_r_thigh',rightleg:'def_r_knee',rightfoot:'def_r_ankle',
    leftarm:'def_l_shoulder',leftforearm:'def_l_elbow',lefthand:'def_l_wrist',
    rightarm:'def_r_shoulder',rightforearm:'def_r_elbow',righthand:'def_r_wrist'
  };
  for(const [name,alias] of Object.entries(aliases))if(!bones.has(name)&&bones.has(alias))bones.set(name,bones.get(alias));
  const footMarkers=quadruped?[]:['leftfoot','rightfoot','lefttoebase','righttoebase'].map(name=>bones.get(name)).filter(Boolean);
  const footPosition=new THREE.Vector3(),hipPosition=new THREE.Vector3(),offset=new THREE.Vector3();
  const footLevel=()=>Math.min(...footMarkers.map(bone=>root.worldToLocal(bone.getWorldPosition(footPosition)).y));
  const restingFootLevel=footMarkers.length?footLevel():0;
  const worldScale=root.getWorldScale(new THREE.Vector3());
  const rawHeight=new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3()).y/Math.max(Math.abs(worldScale.y),.00001);
  const armRestAngles={};
  for(const name of ['leftarm','rightarm']){
    const bone=bones.get(name);
    const elbow=bones.get(name.replace('arm','forearm'));
    if(bone&&elbow){
      const position=root.worldToLocal(bone.getWorldPosition(new THREE.Vector3()));
      const end=root.worldToLocal(elbow.getWorldPosition(new THREE.Vector3())).sub(position);
      const desired=Math.atan2(-1,(Math.sign(position.x)||1)*.1);
      armRestAngles[name]=Math.atan2(Math.sin(desired-Math.atan2(end.y,end.x)),Math.cos(desired-Math.atan2(end.y,end.x)));
    }
  }
  const rootRotation=new THREE.Quaternion(),parentRotation=new THREE.Quaternion(),delta=new THREE.Quaternion(),axis=new THREE.Vector3();
  let preset=motionPresets[0],enabled=true,elapsed=0,once=null,completed=false,lastStatus='Walk · looping';
  const hasRig=['hips','leftupleg','rightupleg','leftarm','rightarm'].every(name=>bones.has(name));
  const smooth=t=>t*t*(3-2*t);
  function rotate(name,rotations){
    const bone=bones.get(name);if(!bone)return;
    bone.quaternion.copy(rest.get(bone).quaternion);
    const relative=bone.parent.getWorldQuaternion(parentRotation).invert().multiply(rootRotation);
    for(const [x,y,z,angle] of rotations){axis.set(x,y,z).applyQuaternion(relative).normalize();delta.setFromAxisAngle(axis,angle);bone.quaternion.premultiply(delta);}
    bone.updateMatrixWorld(true);
  }
  function update(dt,{playing=false,moving=false}={}){
    if(!hasRig)return {forward:0,turn:0};
    for(const [bone,base] of rest){bone.position.copy(base.position);bone.quaternion.copy(base.quaternion);}
    root.updateMatrixWorld(true);root.getWorldQuaternion(rootRotation);
    let phase=0,amplitude=0,gait=preset.mode==='loop'?preset:motionPresets[0],forward=0,turn=0;
    if(once){
      const before=Math.min(1,once.elapsed/preset.duration);once.elapsed+=dt;const progress=Math.min(1,once.elapsed/preset.duration);
      phase=progress*Math.PI*2;amplitude=Math.sin(progress*Math.PI);
      if(preset.id==='step')forward=.55*(smooth(progress)-smooth(before));
      if(preset.id==='turn')turn=Math.PI*(smooth(progress)-smooth(before));
      lastStatus=preset.name+' · playing once';
      if(progress>=1){once=null;completed=true;amplitude=0;lastStatus=preset.name+' · complete';}
    }else if(preset.mode==='loop'&&enabled&&(!playing||moving)){
      elapsed+=dt;phase=elapsed*gait.cadence*Math.PI*2;amplitude=1;lastStatus=preset.name+(playing?' · walking':' · looping in place');
    }else{
      elapsed=0;lastStatus=preset.mode==='once'?preset.name+(completed?' · complete':' · ready'):preset.name+(enabled?' · waiting for movement':' · off');
    }
    const left=Math.sin(phase)*amplitude,right=-left;
    const crouch=preset.id==='sneak'&&amplitude>0;
    const lean=(crouch?.14:preset.id==='brisk'?.08:0)*amplitude;
    const hips=bones.get('hips');
    hips.position.y+=rawHeight*((Math.abs(Math.sin(phase))*gait.bob*amplitude)-(crouch&&quadruped?.055:0));hips.updateMatrixWorld(true);
    rotate('spine',[[1,0,0,lean],[0,1,0,left*.035]]);
    rotate('spine1',[[0,0,1,left*.025]]);
    for(const [side,value] of [['left',left],['right',right]]){
      const sneaking=crouch&&!quadruped;
      const thigh=sneaking?-.24+value*.16:value*gait.stride-(crouch?.2:0);
      // In character space, positive X flexes a humanoid knee backward.
      // Negative angles hyperextend it, producing the forward kick in sneak.
      const knee=sneaking?.48+Math.max(0,-value)*.24:Math.max(0,-value)*gait.knee;
      rotate(side+'upleg',[[1,0,0,thigh]]);
      rotate(side+'leg',[[1,0,0,quadruped?-knee-(crouch?.35:0):knee]]);
      rotate(side+'foot',[[1,0,0,sneaking?-thigh-knee:Math.max(0,value)*.15]]);
      if(quadruped){
        rotate(side+'arm',[[1,0,0,-value*gait.stride*.7]]);
        rotate(side+'forearm',[[1,0,0,Math.max(0,value)*gait.knee*.7]]);
        rotate(side+'hand',[[1,0,0,-Math.max(0,value)*.18]]);
      }else{
        rotate(side+'arm',[[0,0,1,armRestAngles[side+'arm']||0],[1,0,0,-value*gait.arm]]);
        rotate(side+'forearm',[[1,0,0,-.12-Math.max(0,value)*.15]]);
      }
    }
    if(quadruped)for(let i=1;i<=17;i++)rotate('tail_'+i,[[0,1,0,Math.sin(phase*.5-i*.16)*.015*amplitude]]);
    rotate('head',[[0,1,0,preset.id==='turn'?left*.1:0]]);
    if(crouch&&!quadruped&&footMarkers.length){
      // Let leg compression set crouch height, keeping the supporting foot at
      // its resting floor level instead of pushing both feet through the floor.
      const correction=restingFootLevel-footLevel();
      offset.set(0,correction,0);root.localToWorld(offset);
      root.getWorldPosition(hipPosition);offset.sub(hipPosition);
      hips.getWorldPosition(hipPosition).add(offset);
      hips.position.copy(hips.parent.worldToLocal(hipPosition));
    }
    root.updateMatrixWorld(true);
    return {forward,turn};
  }
  return {
    hasRig,
    get preset(){return preset},get enabled(){return enabled},get oneShot(){return !!once},get status(){return lastStatus},
    get movementSpeed(){return preset.mode==='loop'&&enabled?preset.speed:1},
    select(id){const next=motionPresets.find(value=>value.id===id);if(!next)return;preset=next;once=null;completed=false;elapsed=0;enabled=next.mode==='loop';},
    trigger(){completed=false;if(preset.mode==='loop'){enabled=!enabled;elapsed=0;}else{once={elapsed:0};elapsed=0;}},
    stop(){enabled=false;once=null;completed=false;elapsed=0;},
    update
  };
}

// Native clips bind by bone name, never by node order (the four cat GLBs differ).
// Preview controls remain available when original clips cannot be decoded.
export function createCharacterMotion(root,{clips=[],clipSettings={}}={}){
  const preview=createPreviewMotion(root),bones=new Map(),rest=[];
  root.traverse(bone=>{if(bone.isBone){bones.set(bone.name,bone);rest.push([bone,bone.position.clone(),bone.quaternion.clone()]);}});
  const embedded=clips.filter(clip=>clip instanceof THREE.AnimationClip&&clip.tracks.length);
  const native=clips.filter(clip=>!(clip instanceof THREE.AnimationClip)&&clip.tracks?.length&&clip.tracks.every(track=>bones.has(track.bone)));
  const embeddedPresets=embedded.map(clip=>({id:'glb:'+clip.name,name:clip.name,mode:clipSettings[clip.name]?.mode==='loop'?'loop':'once',locomotion:!!clipSettings[clip.name]?.locomotion,speed:clipSettings[clip.name]?.speed||1,duration:clip.duration,source:'game',embedded:clip}));
  // embedded GLB clips can also move non-bone nodes (root motion wrappers): remember their rest transforms too
  root.traverse(node=>{if(!node.isBone&&embedded.length)rest.push([node,node.position.clone(),node.quaternion.clone()]);});
  const presets=[...embeddedPresets,...native.map(clip=>({...clip,source:'game'})),...motionPresets.map(preset=>({...preset,name:preset.name+' (preview)',source:'preview'}))];
  const mixer=new THREE.AnimationMixer(root),actions=new Map();
  for(const clip of native){
    const times=Array.from({length:clip.frames},(_,index)=>index/clip.fps),tracks=[];
    for(const track of clip.tracks){
      const name=bones.get(track.bone).uuid;
      tracks.push(new THREE.QuaternionKeyframeTrack(name+'.quaternion',times,track.quaternions));
      tracks.push(new THREE.VectorKeyframeTrack(name+'.position',times,track.positions));
    }
    actions.set(clip.id,mixer.clipAction(new THREE.AnimationClip(clip.id,clip.duration,tracks)));
  }
  for(const preset of embeddedPresets)actions.set(preset.id,mixer.clipAction(preset.embedded));
  let selected=presets[0],enabled=selected.mode==='loop',once=false,complete=false,status='',wasActive=false;
  function reset(){mixer.stopAllAction();wasActive=false;for(const [bone,p,q] of rest){bone.position.copy(p);bone.quaternion.copy(q);}root.updateMatrixWorld(true);}
  function start(){const action=actions.get(selected.id);action.reset();action.setLoop(selected.mode==='loop'?THREE.LoopRepeat:THREE.LoopOnce,selected.mode==='loop'?Infinity:1);action.clampWhenFinished=true;action.play();wasActive=true;}
  if(selected.source==='game')start();
  return {
    presets,hasRig:preview.hasRig||native.length>0||embedded.length>0,
    get preset(){return selected},get enabled(){return selected.source==='game'?enabled:preview.enabled},
    get oneShot(){return selected.source==='game'?once:preview.oneShot},
    get status(){return selected.source==='game'?status:preview.status+' · preview'},
    get movementSpeed(){return selected.source==='game'?(enabled?selected.speed:1):preview.movementSpeed},
    select(id){const next=presets.find(p=>p.id===id)||presets[0];reset();selected=next;enabled=next.mode==='loop';once=false;complete=false;
      if(next.source==='game'){if(enabled)start();}else preview.select(next.id);
    },
    trigger(){if(selected.source!=='game'){preview.trigger();return;}complete=false;if(selected.mode==='loop'){enabled=!enabled;if(enabled)start();else reset();}else{enabled=true;once=true;reset();start();}},
    stop(){if(selected.source!=='game')preview.stop();reset();enabled=false;once=false;complete=false;},
    update(dt,{playing=false,moving=false}={}){
      if(selected.source!=='game')return preview.update(dt,{playing,moving});
      const active=enabled&&(selected.mode==='once'||!selected.locomotion||!playing||moving);
      if(active){
        if(!wasActive)start();
        const action=actions.get(selected.id);mixer.update(dt);
        if(once&&action.time>=selected.duration){once=false;complete=true;}
      }else if(wasActive&&selected.mode==='loop')reset();
      status=selected.name+' · '+(complete?'complete':once?'playing once':!enabled?(selected.mode==='once'?'ready':'off'):active?'playing':'waiting for movement')+' · game clip';
      root.updateMatrixWorld(true);return {forward:0,turn:0};
    }
  };
}
