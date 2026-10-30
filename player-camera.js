import * as THREE from './vendor/modern/three.module.js';

const lookTarget=new THREE.Vector3();

export function updatePlayerCamera(camera,actor,{firstPerson=false,yaw,pitch,distance,target}){
  actor.visible=!firstPerson;
  const fov=firstPerson?75:45;
  if(camera.fov!==fov){camera.fov=fov;camera.updateProjectionMatrix();}
  if(firstPerson){
    actor.getWorldPosition(camera.position);
    // Actor origin is the body's center; the floor is half its height below it.
    camera.position.y+=(actor.userData.height||1.75)*.42;
    lookTarget.set(-Math.sin(yaw)*Math.cos(pitch),-Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch)).add(camera.position);
    camera.lookAt(lookTarget);
  }else{
    camera.position.set(target.x+distance*Math.cos(pitch)*Math.sin(yaw),target.y+distance*Math.sin(pitch),target.z+distance*Math.cos(pitch)*Math.cos(yaw));
    camera.lookAt(target);
  }
}
