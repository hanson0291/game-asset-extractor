import * as THREE from './vendor/modern/three.module.js';

const environments=new WeakMap();
// A small local studio reflection map makes the source metal/paint readable.
// It uses geometry and lights only, with no network textures or HDR downloads.
export function applyStudioEnvironment(scene,renderer){
  if(!environments.has(renderer)){
    const room=new THREE.Scene();room.background=new THREE.Color(0x77818b);
    const panels=[];
    for(const [position,size,color] of [[[0,8,0],[12,8],0xffffff],[[-8,3,3],[5,8],0xd5e7ff],[[7,4,-5],[6,9],0xffeedc]]){
      const geometry=new THREE.PlaneGeometry(...size),material=new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide});
      const panel=new THREE.Mesh(geometry,material);panel.position.fromArray(position);panel.lookAt(0,0,0);room.add(panel);panels.push(panel);
    }
    const generator=new THREE.PMREMGenerator(renderer),target=generator.fromScene(room,.08,.1,100);
    generator.dispose();panels.forEach(panel=>{panel.geometry.dispose();panel.material.dispose();});
    environments.set(renderer,target);
  }
  scene.environment=environments.get(renderer).texture;
}
