import * as THREE from './vendor/modern/three.module.js';

export function isMech(car){return car.userData.vehicle?.family==='titan_mech';}

// Mounted locomotion is an explicitly procedural preview, not an extracted clip.
export function createMechController(car){
  const size=car.userData.size||{width:3,height:6.4,length:3},origin=car.position.clone(),heading=car.rotation.y;
  let speed=0,phase=0,rest=null;
  const bones={};car.traverse(node=>{if(node.isBone&&/^(def_[lr]_(thigh|knee|shoulder))$/.test(node.name)&&!bones[node.name])bones[node.name]=node;});
  function captureRest(){rest=new Map(Object.values(bones).map(node=>[node,node.quaternion.clone()]));phase=0;}
  function gait(dt){
    if(!rest)captureRest();phase+=dt*Math.abs(speed)*2.8;
    for(const [node,base] of rest)node.quaternion.copy(base);
    if(Math.abs(speed)<.02)return;
    const amplitude=Math.min(1,Math.abs(speed)/3.5),direction=Math.sign(speed);
    for(const [side,offset] of [['l',0],['r',Math.PI]]){
      const wave=Math.sin(phase+offset)*amplitude;
      bones['def_'+side+'_thigh']?.rotateX(wave*.28*direction);
      bones['def_'+side+'_knee']?.rotateX(Math.max(0,-wave)*.4);
      bones['def_'+side+'_shoulder']?.rotateX(-wave*.08*direction);
    }
  }
  return {kind:'mech',car,size,forwardAxis:'+z',get speed(){return speed;},captureRest,
    stop(){speed=0;gait(0);},
    reset(){speed=0;car.position.copy(origin);car.rotation.y=heading;rest=null;},
    update(dt,{throttle=0,steer=0,brake=false,bounds=null}={}){
      throttle=THREE.MathUtils.clamp(throttle,-1,1);steer=THREE.MathUtils.clamp(steer,-1,1);
      const desired=brake?0:throttle*(throttle>=0?4.5:2.5),rate=brake?14:5;
      speed=THREE.MathUtils.damp(speed,desired,rate,dt);
      car.rotation.y-=steer*1.25*dt;
      car.position.x+=Math.sin(car.rotation.y)*speed*dt;car.position.z+=Math.cos(car.rotation.y)*speed*dt;
      if(bounds){
        const padding=Math.max(size.width,size.length)/2;
        const x=THREE.MathUtils.clamp(car.position.x,bounds.minX+padding,bounds.maxX-padding),z=THREE.MathUtils.clamp(car.position.z,bounds.minZ+padding,bounds.maxZ-padding);
        if(x!==car.position.x||z!==car.position.z)speed=0;car.position.x=x;car.position.z=z;
      }
      gait(dt);car.updateMatrixWorld(true);
    }
  };
}
