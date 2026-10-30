import * as THREE from './vendor/modern/three.module.js';

// Preserve the original paired clip's timing and root trajectory while adapting
// its world-space bone rotations to Andrew's differently oriented bind pose.
export function createIonOccupant(sourceRoot,actor){
  if(!actor)return null;
  const source=new Map(),target=new Map(),sourceBind=new Map(),targetBind=new Map();
  const collect=(root,bones,bind)=>root.traverse(node=>{
    if(node.isBone)bones.set((node.userData.unityBoneName||node.name).split(':').pop().replace(/_\d+$/,'').toLowerCase(),node);
    if(node.isSkinnedMesh){node.frustumCulled=false;node.skeleton.bones.forEach((bone,i)=>{
      if(!bind.has(bone))bind.set(bone,node.skeleton.boneInverses[i].clone().invert());
    });}
  });
  let pilotRoot;sourceRoot.traverse(node=>{if(node.userData.ionRole==='pilot-root')pilotRoot=node;});
  if(!pilotRoot)return null;collect(pilotRoot,source,sourceBind);
  // Meshes are siblings of the animated skeleton root in some GLB exports.
  sourceRoot.traverse(node=>{if(node.userData.ionRole==='pilot-mesh')collect(node,source,sourceBind);});
  collect(actor,target,targetBind);
  const names={Hips:'Cooper_Hips',Spine:'def_c_spineA',Spine1:'def_c_spineB',Spine2:'def_c_spineC',Neck:'def_c_neckA',Head:'def_c_head'};
  for(const [side,prefix] of [['Left','l'],['Right','r']]){
    for(const [name,sourceName] of Object.entries({Shoulder:'clav',Arm:'shoulder',ForeArm:'elbow',Hand:'wrist',UpLeg:'thigh',Leg:'knee',Foot:'ankle',ToeBase:'ball'}))names[side+name]='def_'+prefix+'_'+sourceName;
    for(const [finger,suffix] of [['Thumb','Thumb'],['Index','Index'],['Middle','Mid'],['Ring','Ring'],['Pinky','Pinky']])
      for(let i=1;i<=3;i++)names[side+'Hand'+finger+i]='def_'+prefix+'_fin'+suffix+['A','B','C'][i-1];
  }
  const model=actor.children[0];if(!model)return null;
  actor.updateMatrixWorld(true);sourceRoot.updateMatrixWorld(true);
  const mappings=[];
  for(const [to,from] of Object.entries(names)){
    const s=source.get(from.toLowerCase()),t=target.get(to.toLowerCase());if(!s||!t||!sourceBind.has(s)||!targetBind.has(t))continue;
    const sb=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().extractRotation(sourceBind.get(s)));
    const tb=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().extractRotation(targetBind.get(t)));
    mappings.push({s,t,offset:sb.invert().multiply(tb)});
  }
  const hips=target.get('hips'),sourceHips=source.get('cooper_hips');
  if(!hips||!sourceHips||mappings.length<18)return null;
  // Parent rotations must be applied before their children, regardless of glTF node order.
  const depth=node=>{let d=0;for(;node.parent;node=node.parent)d++;return d;};
  mappings.sort((a,b)=>depth(a.t)-depth(b.t));
  let saved=null;
  const q=new THREE.Quaternion(),parentQ=new THREE.Quaternion(),position=new THREE.Vector3();
  function restore(){if(!saved)return;for(const [bone,pose] of saved){bone.position.copy(pose.p);bone.quaternion.copy(pose.q);}actor.updateMatrixWorld(true);saved=null;}
  return {
    begin(){restore();saved=new Map([...target.values()].map(bone=>[bone,{p:bone.position.clone(),q:bone.quaternion.clone()}]));},
    update(){
      sourceRoot.updateMatrixWorld(true);actor.updateMatrixWorld(true);
      for(const {s,t,offset} of mappings){
        s.getWorldQuaternion(q).multiply(offset);t.parent.getWorldQuaternion(parentQ).invert();
        t.quaternion.copy(parentQ.multiply(q));t.updateMatrixWorld(true);
      }
      sourceHips.getWorldPosition(position);hips.position.copy(hips.parent.worldToLocal(position));actor.updateMatrixWorld(true);
    },
    restore,
    get head(){return target.get('head')||null;},
    get mappedBones(){return mappings.length;}
  };
}
