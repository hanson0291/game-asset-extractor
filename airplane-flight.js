import * as THREE from './vendor/modern/three.module.js';

const ROTATE_SPEED=34,STALL_SPEED=24,CEILING=150,MAX_PITCH=THREE.MathUtils.degToRad(26),MAX_BANK=THREE.MathUtils.degToRad(55);

export function isAirplane(model){
  const text=[model.name,model.userData.vehicle?.id,model.userData.vehicle?.family,model.userData.vehicle?.name].filter(Boolean).join(' ');
  if(/helicopter/i.test(text))return false;
  // Fixed-wing aircraft: planes and jets, plus the 007 First Light 'Drone Webb'
  // jet. A plain 'drone' (quadcopter) keeps the ground controller.
  return /plane|jet/i.test(text)||/drone[\s_-]*webb/i.test(text);
}

// Assisted fixed-wing flight: throttle commands thrust, the stick commands
// pitch and bank, banked wings turn the aircraft, and lift only exists once
// airspeed passes the rotate speed. Pull the stick back to take off; below
// the stall speed the nose drops and the aircraft sinks. Demo-grade flight,
// matching the helicopter's assisted model rather than a full simulation.
export function createAirplaneController(car){
  const size=car.userData.size||{width:11,height:3,length:14},origin=car.position.clone(),initialHeading=car.rotation.y;
  car.rotation.order='YXZ';
  let running=false,engine=0,throttle=0,speed=0,verticalSpeed=0,elevator=0,grounded=true;
  const altitude=()=>Math.max(0,car.position.y-origin.y);
  return {
    kind:'airplane',car,size,
    get speed(){return speed;},get verticalSpeed(){return verticalSpeed;},get altitude(){return altitude();},
    get heading(){return (THREE.MathUtils.radToDeg(-car.rotation.y)%360+360)%360;},
    get bank(){return -THREE.MathUtils.radToDeg(car.rotation.z);},get nosePitch(){return THREE.MathUtils.radToDeg(car.rotation.x);},
    get throttlePercent(){return throttle*100;},get enginePercent(){return engine*100;},get elevatorPercent(){return elevator*100;},
    get grounded(){return grounded;},get stalled(){return !grounded&&speed<STALL_SPEED+2;},get takeoffReady(){return grounded&&speed>=ROTATE_SPEED;},
    start(){running=true;},
    stop(){running=false;engine=0;throttle=0;speed=0;verticalSpeed=0;elevator=0;car.rotation.x=car.rotation.z=0;},
    reset(){running=false;engine=0;throttle=0;speed=0;verticalSpeed=0;elevator=0;grounded=true;car.position.copy(origin);car.rotation.set(0,initialHeading,0,'YXZ');},
    update(dt,{pitch=0,roll=0,throttleInput=0,rudder=0,brake=false,bounds=null}={}){
      const count=Math.max(1,Math.ceil(dt/(1/60))),step=dt/count;
      pitch=THREE.MathUtils.clamp(pitch,-1,1);roll=THREE.MathUtils.clamp(roll,-1,1);
      throttleInput=THREE.MathUtils.clamp(throttleInput,-1,1);rudder=THREE.MathUtils.clamp(rudder,-1,1);
      elevator=pitch;
      for(let i=0;i<count;i++){
        engine=THREE.MathUtils.damp(engine,running?1:0,1.8,step);
        throttle=THREE.MathUtils.clamp(throttle+throttleInput*step*.55,0,1);
        // Attitude: the stick banks the wings and raises/lowers the nose.
        // On the ground the nose only answers once airspeed builds.
        car.rotation.z=THREE.MathUtils.damp(car.rotation.z,-roll*MAX_BANK*(grounded?.35:1),4,step);
        const pitchAuthority=grounded?THREE.MathUtils.clamp(speed/ROTATE_SPEED,0,1):1;
        car.rotation.x=THREE.MathUtils.damp(car.rotation.x,pitch*MAX_PITCH*pitchAuthority,4,step);
        // Heading: nosewheel/rudder steering on the ground, coordinated
        // banked turns (plus a little rudder) in the air.
        if(grounded){
          const steer=THREE.MathUtils.clamp(rudder+roll,-1,1);
          if(speed>.2||throttle>.05)car.rotation.y-=steer*(.25+Math.min(speed,12)*.05)*step;
        }else{
          const turn=THREE.MathUtils.clamp(Math.tan(-car.rotation.z)*9.81/Math.max(speed,14),-1.1,1.1);
          car.rotation.y-=(turn+rudder*.22)*step;
        }
        // Airspeed: thrust fights drag; climbing bleeds speed, diving gains it.
        const pathPitch=grounded?0:car.rotation.x;
        let accel=engine*throttle*17-.0026*speed*Math.abs(speed)-9.81*Math.sin(pathPitch)*.8;
        if(brake)accel-=grounded?9:4.5;
        if(grounded)accel-=.5;
        speed=Math.max(0,speed+accel*step);
        // Vertical: liftoff needs rotate speed and a pull on the stick.
        if(grounded&&speed>=ROTATE_SPEED&&pitch>.12){grounded=false;car.position.y=origin.y+.05;}
        if(grounded){verticalSpeed=0;car.position.y=origin.y;}
        else{
          // Near the stall speed lift fades: a growing sink term overtakes
          // the climb the nose attitude asks for, so a stalled aircraft sinks.
          let target=Math.sin(car.rotation.x)*speed-Math.max(0,STALL_SPEED+4-speed)*1.1;
          verticalSpeed=THREE.MathUtils.damp(verticalSpeed,target,2.5,step);
          car.position.y+=verticalSpeed*step;
          if(car.position.y<=origin.y){car.position.y=origin.y;if(verticalSpeed<0)verticalSpeed=0;grounded=true;}
          if(car.position.y>origin.y+CEILING){car.position.y=origin.y+CEILING;if(verticalSpeed>0)verticalSpeed=0;}
        }
        const horizontal=speed*Math.cos(pathPitch);
        car.position.x-=Math.sin(car.rotation.y)*horizontal*step;
        car.position.z-=Math.cos(car.rotation.y)*horizontal*step;
        if(bounds){const pad=Math.max(size.width,size.length)/2;for(const [axis,min,max] of [['x',bounds.minX,bounds.maxX],['z',bounds.minZ,bounds.maxZ]]){
          car.position[axis]=max-min<=pad*2?(min+max)/2:THREE.MathUtils.clamp(car.position[axis],min+pad,max-pad);
        }}
      }
    }
  };
}
