import * as THREE from './vendor/modern/three.module.js';
import {isHelicopter,createHelicopterController} from './helicopter-flight.js';
import {isAirplane,createAirplaneController} from './airplane-flight.js';
import {isMech,createMechController} from './mech-driving.js';

const chaseTarget=new THREE.Vector3(),chasePosition=new THREE.Vector3();
export function createVehicleDriver(car){
  if(isHelicopter(car))return createHelicopterController(car);
  if(isAirplane(car))return createAirplaneController(car);
  if(isMech(car))return createMechController(car);
  const size=car.userData.size||{width:2,height:1.5,length:4.8};
  const origin=car.position.clone(),heading=car.rotation.y;
  const wheelbase=THREE.MathUtils.clamp(size.length*.55,1,12);
  let speed=0;
  return {
    car,size,get speed(){return speed;},
    stop(){speed=0;},
    reset(){speed=0;car.position.copy(origin);car.rotation.y=heading;},
    update(dt,{throttle=0,steer=0,brake=false,bounds=null}={}){
      // Substeps make acceleration and steering stable on slower touch devices.
      const steps=Math.max(1,Math.ceil(dt/(1/60))),step=dt/steps;
      throttle=THREE.MathUtils.clamp(throttle,-1,1);steer=THREE.MathUtils.clamp(steer,-1,1);
      for(let i=0;i<steps;i++){
        const opposite=throttle&&Math.sign(throttle)!==Math.sign(speed)&&Math.abs(speed)>.15;
        if(brake||!throttle||opposite){
          const drag=brake?12:opposite?10:2.5;
          speed=Math.sign(speed)*Math.max(0,Math.abs(speed)-drag*step);
        }else speed+=throttle*(throttle>0?6:3.5)*step;
        speed=THREE.MathUtils.clamp(speed,-4,14);
        car.rotation.y-=steer*(speed/wheelbase)*Math.tan(.5)/(1+Math.abs(speed)*.08)*step;
        car.position.x-=Math.sin(car.rotation.y)*speed*step;
        car.position.z-=Math.cos(car.rotation.y)*speed*step;
        if(bounds){
          const padding=Math.max(size.width,size.length)/2;
          const x=bounds.maxX-bounds.minX<=padding*2?(bounds.minX+bounds.maxX)/2:THREE.MathUtils.clamp(car.position.x,bounds.minX+padding,bounds.maxX-padding);
          const z=bounds.maxZ-bounds.minZ<=padding*2?(bounds.minZ+bounds.maxZ)/2:THREE.MathUtils.clamp(car.position.z,bounds.minZ+padding,bounds.maxZ-padding);
          if(x!==car.position.x||z!==car.position.z)speed=0;
          car.position.x=x;car.position.z=z;
        }
      }
    }
  };
}

export function updateVehicleCamera(camera,driver,dt,{yawOffset=0,pitch=.35,instant=false}={}){
  const {car,size}=driver,distance=Math.max(5,Math.max(size.length,size.width,driver.kind==='mech'?size.height:0)*1.45);
  const angle=car.rotation.y+yawOffset+(driver.forwardAxis==='+z'?Math.PI:0);
  chaseTarget.copy(car.position);chaseTarget.y+=Math.max(.65,size.height*.65);
  chasePosition.set(chaseTarget.x+Math.sin(angle)*distance*Math.cos(pitch),chaseTarget.y+Math.sin(pitch)*distance,chaseTarget.z+Math.cos(angle)*distance*Math.cos(pitch));
  if(instant)camera.position.copy(chasePosition);else camera.position.lerp(chasePosition,1-Math.exp(-8*dt));
  camera.lookAt(chaseTarget);
  if(camera.fov!==60){camera.fov=60;camera.updateProjectionMatrix();}
}
