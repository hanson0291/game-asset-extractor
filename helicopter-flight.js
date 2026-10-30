import * as THREE from './vendor/modern/three.module.js';

export function isHelicopter(model){return /helicopter/i.test([model.name,model.userData.vehicle?.id,model.userData.vehicle?.family].filter(Boolean).join(' '));}

// Assisted helicopter flight: collective commands climb, cyclic commands
// horizontal acceleration, and pedals command yaw independently of airspeed.
export function createHelicopterController(car){
  const size=car.userData.size||{width:3,height:3,length:10},origin=car.position.clone(),initialHeading=car.rotation.y;
  const velocity=new THREE.Vector3();car.rotation.order='YXZ';
  // The backdrop model's nose faces +Z; the flight/control convention is -Z.
  // Rotate only this known asset's visual, leaving heading and camera aligned.
  if(car.userData.vehicle?.id==='backdrop-helicopter'&&!car.userData.flightOrientationAligned){
    const visual=new THREE.Group();visual.name='Flight-oriented helicopter visual';
    for(const child of [...car.children])visual.add(child);
    visual.rotation.y=Math.PI;car.add(visual);car.userData.flightOrientationAligned=true;
  }
  let rpm=0,running=false,hoverAssist=true,hoverY=origin.y,collective=.5;
  let rotor=null,disk=null;
  // This particular backdrop prop has no main rotor in its extracted mesh.
  if(car.userData.vehicle?.id==='backdrop-helicopter'){
    rotor=new THREE.Group();rotor.name='Simulated main rotor';rotor.position.set(0,size.height*.95,-size.length*.08);
    const radius=Math.max(size.width*.8,size.length*.36),material=new THREE.MeshStandardMaterial({color:0x28312e,metalness:.3,roughness:.6,transparent:true});
    for(let i=0;i<2;i++){const blade=new THREE.Mesh(new THREE.BoxGeometry(radius*2,.025,.12),material);blade.rotation.y=i*Math.PI/2;rotor.add(blade);}
    const hub=new THREE.Mesh(new THREE.CylinderGeometry(.12,.12,.18,12),new THREE.MeshStandardMaterial({color:0x666d68,metalness:.6,roughness:.4}));rotor.add(hub);
    disk=new THREE.Mesh(new THREE.CircleGeometry(radius,48),new THREE.MeshBasicMaterial({color:0xaab7ac,transparent:true,opacity:0,side:THREE.DoubleSide,depthWrite:false}));disk.rotation.x=-Math.PI/2;rotor.add(disk);car.add(rotor);
  }
  function rotorAppearance(){if(rotor){disk.material.opacity=rpm*.16;for(const blade of rotor.children)if(blade.geometry?.type==='BoxGeometry')blade.material.opacity=1-rpm*.6;}}
  const altitude=()=>Math.max(0,car.position.y-origin.y);
  return {
    kind:'helicopter',car,size,
    get speed(){return Math.hypot(velocity.x,velocity.z);},get verticalSpeed(){return velocity.y;},get altitude(){return altitude();},
    get heading(){return (THREE.MathUtils.radToDeg(-car.rotation.y)%360+360)%360;},
    get rotorPercent(){return rpm*100;},get collectivePercent(){return running?collective*100:0;},
    get hovering(){return hoverAssist;},get grounded(){return altitude()<.08;},
    get bank(){return -THREE.MathUtils.radToDeg(car.rotation.z);},get nosePitch(){return THREE.MathUtils.radToDeg(car.rotation.x);},
    start(){running=true;hoverAssist=true;hoverY=car.position.y;},
    hover(){hoverAssist=true;hoverY=car.position.y;},
    stop(){running=false;velocity.set(0,0,0);rpm=0;collective=.5;car.rotation.x=car.rotation.z=0;rotorAppearance();},
    reset(){running=false;rpm=0;collective=.5;velocity.set(0,0,0);car.position.copy(origin);car.rotation.set(0,initialHeading,0,'YXZ');hoverAssist=true;hoverY=origin.y;rotorAppearance();},
    update(dt,{forward=0,lateral=0,yaw=0,lift=0,bounds=null}={}){
      const count=Math.max(1,Math.ceil(dt/(1/60))),step=dt/count;
      forward=THREE.MathUtils.clamp(forward,-1,1);lateral=THREE.MathUtils.clamp(lateral,-1,1);yaw=THREE.MathUtils.clamp(yaw,-1,1);lift=THREE.MathUtils.clamp(lift,-1,1);
      if(Math.max(Math.abs(forward),Math.abs(lateral),Math.abs(yaw),Math.abs(lift))>.04)hoverAssist=false;
      for(let i=0;i<count;i++){
        rpm=THREE.MathUtils.damp(rpm,running?1:0,1.8,step);
        const available=rpm>.8?1:0;
        const verticalTarget=available?(hoverAssist?THREE.MathUtils.clamp((hoverY-car.position.y)*1.5,-2,2):lift*5):0;
        velocity.y=THREE.MathUtils.damp(velocity.y,verticalTarget,3,step);
        car.position.y=Math.max(origin.y,Math.min(origin.y+150,car.position.y+velocity.y*step));
        if((altitude()===0&&velocity.y<0)||(altitude()>=150&&velocity.y>0))velocity.y=0;
        const airborne=altitude()>.08;
        car.rotation.y-=yaw*1.1*rpm*step;
        const bank=airborne?-lateral*.22:0,pitch=airborne?-forward*.22:0;
        car.rotation.z=THREE.MathUtils.damp(car.rotation.z,bank,5,step);car.rotation.x=THREE.MathUtils.damp(car.rotation.x,pitch,5,step);
        if(airborne&&available){
          const acceleration=hoverAssist?0:6;
          velocity.x+=(-Math.sin(car.rotation.y)*forward+Math.cos(car.rotation.y)*lateral)*acceleration*step;
          velocity.z+=(-Math.cos(car.rotation.y)*forward-Math.sin(car.rotation.y)*lateral)*acceleration*step;
        }
        const damping=hoverAssist?3:airborne?.35:8;velocity.x*=Math.exp(-damping*step);velocity.z*=Math.exp(-damping*step);
        const speed=Math.hypot(velocity.x,velocity.z);if(speed>35){velocity.x*=35/speed;velocity.z*=35/speed;}
        car.position.x+=velocity.x*step;car.position.z+=velocity.z*step;
        if(bounds){const pad=Math.max(size.width,size.length)/2;for(const [axis,min,max] of [['x',bounds.minX,bounds.maxX],['z',bounds.minZ,bounds.maxZ]]){
          const clamped=max-min<=pad*2?(min+max)/2:THREE.MathUtils.clamp(car.position[axis],min+pad,max-pad);
          if(clamped!==car.position[axis])velocity[axis]=0;car.position[axis]=clamped;
        }}
        collective=THREE.MathUtils.clamp(.5+lift*.35+(hoverAssist?(hoverY-car.position.y)*.06:0),0,1);
        if(rotor){rotor.rotation.y+=rpm*Math.PI*14*step;rotorAppearance();}
      }
    }
  };
}
