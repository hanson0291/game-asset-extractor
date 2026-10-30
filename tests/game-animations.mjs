import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../vendor/modern/three.module.js';
import {createCharacterMotion} from '../character-motion.js';
import {characters} from '../characters.js';

// Rebuild the actual GLB node hierarchies without decoding browser textures.
function skeleton(file){
  const raw=fs.readFileSync(new URL('../'+file.replace(/^\.\//,''),import.meta.url));
  const doc=JSON.parse(raw.subarray(20,20+raw.readUInt32LE(12)));
  const joints=new Set(doc.skins.flatMap(s=>s.joints));
  const nodes=doc.nodes.map((node,index)=>{
    const object=joints.has(index)?new THREE.Bone():new THREE.Group();object.name=node.name||'';
    if(node.translation)object.position.fromArray(node.translation);
    if(node.rotation)object.quaternion.fromArray(node.rotation);
    if(node.scale)object.scale.fromArray(node.scale);
    if(node.matrix)new THREE.Matrix4().fromArray(node.matrix).decompose(object.position,object.quaternion,object.scale);
    return object;
  });
  doc.nodes.forEach((node,index)=>node.children?.forEach(child=>nodes[index].add(nodes[child])));
  const root=new THREE.Group();doc.scenes[doc.scene||0].nodes.forEach(index=>root.add(nodes[index]));
  root.add(new THREE.Mesh(new THREE.BoxGeometry(1,2,1),new THREE.MeshBasicMaterial()));
  return root;
}
const clips=JSON.parse(fs.readFileSync(new URL('../assets/stray-animations/clips.json',import.meta.url))).clips;
for(const character of characters){
  const root=skeleton(character.animationModel),motion=createCharacterMotion(root,{clips:character.gameId==='stray'?clips:[]});
  assert.ok(motion.hasRig,character.name+' skeleton must be recognized');
  if(character.gameId!=='stray'){
    motion.update(.1);assert.match(motion.status,/preview/);
    if(character.gameId==='schoolboy-runaway'){
      motion.stop();motion.update(0);root.updateMatrixWorld(true);
      const bone=name=>root.getObjectByName('mixamorig:'+name);
      const position=name=>root.worldToLocal(bone(name).getWorldPosition(new THREE.Vector3()));
      const markers=['LeftFoot','RightFoot','LeftToeBase','RightToeBase'].filter(name=>bone(name));
      const floor=()=>Math.min(...markers.map(name=>position(name).y));
      const restingFloor=floor(),restingHip=position('Hips').y;
      motion.select('sneak');
      for(let frame=0;frame<180;frame++){
        motion.update(1/60);
        for(const side of ['Left','Right']){
          const thigh=position(side+'Leg').sub(position(side+'UpLeg')).normalize();
          const shin=position(side+'Foot').sub(position(side+'Leg')).normalize();
          assert.ok(thigh.cross(shin).x>.15,character.name+' sneak must bend knees backward, not hyperextend');
        }
        assert.ok(Math.abs(floor()-restingFloor)<1e-6,character.name+' supporting foot stays at floor level');
        assert.ok(position('Hips').y<restingHip,character.name+' sneak lowers the hips');
      }
      motion.stop();motion.update(0);
      assert.ok(Math.abs(position('Hips').y-restingHip)<1e-6,'Stop restores standing height');
    }
    continue;
  }
  assert.equal(motion.presets.filter(p=>p.source==='game').length,4,character.name+' must bind all original clips');
  const hip=root.getObjectByName('Hip'),head=root.getObjectByName('head'),paw=root.getObjectByName('Left_ToeBase');
  const initial=hip.quaternion.clone().normalize();
  motion.update(.1,{playing:true,moving:false});assert.ok(initial.angleTo(hip.quaternion.clone().normalize())<1e-6,'Play mode idle stays in resting pose');
  motion.update(.1,{playing:true,moving:true});assert.ok(initial.angleTo(hip.quaternion.clone().normalize())>.01,'Original clip changes the hip');
  for(const clip of clips){
    motion.select(clip.id);if(clip.mode==='once')motion.trigger();
    for(let i=0;i<Math.ceil(clip.duration*60)+5;i++){
      const step=motion.update(1/60);
      assert.equal(step.forward,0,'Native root motion must not cause double movement');
      if(clip.locomotion)assert.ok(head.getWorldPosition(new THREE.Vector3()).y>paw.getWorldPosition(new THREE.Vector3()).y,'Original gait must stay upright');
      root.traverse(bone=>{if(bone.isBone)assert.ok(Math.abs(bone.quaternion.length()-1)<1e-5,'Quaternion stays normalized');});
    }
    if(clip.mode==='once'){assert.equal(motion.oneShot,false);assert.match(motion.status,/complete/);}
    motion.stop();motion.update(0);assert.ok(initial.angleTo(hip.quaternion.clone().normalize())<1e-6,'Stop restores bind pose');
  }
  motion.select('walk');assert.equal(motion.preset.source,'preview');motion.update(.1);
}
console.log('PASS: all 7 actual rigs; 4 original clips on all 4 cats; upright gait, idle, completion, stop, and preview fallback.');

