import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

test('exported layouts animate, replace cleanly, and preserve the spawn clearing', async () => {
  const layouts=JSON.parse(readFileSync(new URL('../environments/layouts.json',import.meta.url)));
  const controls={};
  for(const id of ['#environment-trigger','#environment-clear','select','#environment-status','#sun-row','#sun-time','#sun-output']) controls[id]={options:[{text:'Event'}],selectedIndex:0,value:12,hidden:true};
  const section={style:{},querySelector:id=>controls[id]};
  const sandbox={window:{dispatchEvent(){}},document:{createElement:()=>section,getElementById:()=>({appendChild(){}})},performance:{now:()=>0},requestAnimationFrame(){},CustomEvent:function(){},console,fetch:async()=>({ok:true,json:async()=>layouts})};
  vm.runInNewContext(readFileSync(new URL('../vendor/three.min.js',import.meta.url),'utf8'),sandbox);
  vm.runInNewContext(readFileSync(new URL('../environment-events.js',import.meta.url),'utf8'),sandbox);
  const rig=new sandbox.THREE.Group();rig.position.set(20,0,30);
  const controller=sandbox.window.EnvironmentEvents.attach(new sandbox.THREE.Scene(),rig);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(controls['#environment-trigger'].disabled,false);
  for(const kind of ['rocks','forest','course']) {
    controller.fire(kind);
    assert.equal(controller.root.children.length,layouts[kind].length);
    assert.ok(controller.root.children.length>=18);
    assert.equal(controller.root.position.x,20);
    controller.update(10000);
    controller.root.children.forEach((mesh,i)=>{
      assert.ok(Math.hypot(mesh.position.x,mesh.position.z)>=3);
      assert.equal(mesh.position.y,layouts[kind][i].position[1]);
      assert.equal(mesh.scale.y,layouts[kind][i].scale[1]);
    });
    controller.fire(kind);
    assert.equal(controller.root.children.length,layouts[kind].length,'retrigger must not accumulate meshes');
  }
  controls['#environment-clear'].onclick();
  assert.equal(controller.root.children.length,0);
});

test('the day/night event takes hold instantly and restores the lab lighting on clear', async () => {
  const layouts=JSON.parse(readFileSync(new URL('../environments/layouts.json',import.meta.url)));
  const controls={};
  for(const id of ['#environment-trigger','#environment-clear','select','#environment-status','#sun-row','#sun-time','#sun-output']) controls[id]={options:[{text:'Event'}],selectedIndex:0,value:12,hidden:true};
  const section={style:{},querySelector:id=>controls[id]};
  const sandbox={window:{dispatchEvent(){}},document:{createElement:()=>section,getElementById:()=>({appendChild(){}})},performance:{now:()=>0},requestAnimationFrame(){},CustomEvent:function(){},console,fetch:async()=>({ok:true,json:async()=>layouts})};
  vm.runInNewContext(readFileSync(new URL('../vendor/three.min.js',import.meta.url),'utf8'),sandbox);
  vm.runInNewContext(readFileSync(new URL('../environment-events.js',import.meta.url),'utf8'),sandbox);
  const {THREE}=sandbox;
  const scene=new THREE.Scene();
  scene.background=new THREE.Color(0x0b1b11); scene.fog=new THREE.Fog(0x0b1b11,11,34);
  const ambient=new THREE.AmbientLight(0xf6f3ff,.58); scene.add(ambient);
  const key=new THREE.DirectionalLight(0xfff4ea,.82); key.position.set(3,5,4); scene.add(key);
  const controller=sandbox.window.EnvironmentEvents.attach(scene,new THREE.Group());
  await new Promise(resolve=>setImmediate(resolve));

  const sky=scene.background.getHex(), keyIntensity=key.intensity;
  controller.fire('daynight');
  assert.notEqual(scene.background.getHex(),sky,'sky must change on the frame the event fires');
  assert.equal(scene.fog.color.getHex(),scene.background.getHex());
  assert.equal(controller.root.children.length,2,'a sun and a moon ride the cycle');

  // Noon, then midnight half a cycle later: sky, lights and orbs all swap over.
  controller.update(6000);
  const noon=scene.background.getHex(), sunY=controller.root.children[0].position.y;
  assert.ok(key.intensity>=keyIntensity,'noon is at least as bright as the lab rig');
  controller.update(18000);
  assert.notEqual(scene.background.getHex(),noon);
  assert.ok(key.intensity<keyIntensity,'night dims the key light');
  assert.ok(controller.root.children[0].position.y<sunY,'the sun sets');
  assert.ok(controller.root.children[1].position.y>controller.root.children[0].position.y,'the moon rises opposite it');
  assert.ok(key.position.y>0,'the key light always stays above the bunny');

  // Switching to a layout event, and clearing, both hand the lab back its own rig.
  controller.fire('rocks');
  assert.equal(scene.background.getHex(),sky);
  assert.equal(key.intensity,keyIntensity);
  controller.fire('daynight');
  controls['#environment-clear'].onclick();
  assert.equal(controller.root.children.length,0);
  assert.equal(scene.background.getHex(),sky);
  assert.equal(scene.fog.color.getHex(),0x0b1b11);
  assert.equal(ambient.intensity,.58);
  assert.deepEqual([key.position.x,key.position.y,key.position.z],[3,5,4]);
});

test('the manual day/night event exposes its sun slider only while it is running', async () => {
  const layouts=JSON.parse(readFileSync(new URL('../environments/layouts.json',import.meta.url)));
  const controls={};
  for(const id of ['#environment-trigger','#environment-clear','select','#environment-status','#sun-row','#sun-time','#sun-output']) controls[id]={options:[{text:'Event'}],selectedIndex:0,value:12,hidden:true};
  const section={style:{},querySelector:id=>controls[id]};
  const sandbox={window:{dispatchEvent(){}},document:{createElement:()=>section,getElementById:()=>({appendChild(){}})},performance:{now:()=>0},requestAnimationFrame(){},CustomEvent:function(){},console,fetch:async()=>({ok:true,json:async()=>layouts})};
  vm.runInNewContext(readFileSync(new URL('../vendor/three.min.js',import.meta.url),'utf8'),sandbox);
  vm.runInNewContext(readFileSync(new URL('../environment-events.js',import.meta.url),'utf8'),sandbox);
  const {THREE}=sandbox;
  const scene=new THREE.Scene();
  scene.background=new THREE.Color(0x0b1b11); scene.fog=new THREE.Fog(0x0b1b11,11,34);
  const key=new THREE.DirectionalLight(0xfff4ea,.82); key.position.set(3,5,4); scene.add(key);
  const controller=sandbox.window.EnvironmentEvents.attach(scene,new THREE.Group());
  await new Promise(resolve=>setImmediate(resolve));
  const slider=controls['#sun-time'], row=controls['#sun-row'], output=controls['#sun-output'];

  assert.equal(row.hidden,true,'the slider stays out of the panel until the event runs');
  controller.fire('daynight-manual');
  assert.equal(row.hidden,false);
  assert.equal(output.value,'12:00 · midday');
  assert.equal(controller.root.children.length,2);

  // Scrubbing repaints the sky without the clock advancing at all.
  const noonSky=scene.background.getHex(), noonKey=key.intensity;
  slider.value=0; slider.oninput();
  assert.equal(output.value,'00:00 · night');
  assert.notEqual(scene.background.getHex(),noonSky);
  assert.ok(key.intensity<noonKey,'midnight on the slider dims the key light');
  slider.value=12; slider.oninput();
  assert.equal(scene.background.getHex(),noonSky,'scrubbing back restores the same noon');
  controller.update(60000);
  assert.equal(scene.background.getHex(),noonSky,'the manual event never drifts on its own');

  // Handing off to another event, or clearing, puts the slider away again.
  controller.fire('rocks');
  assert.equal(row.hidden,true);
  assert.equal(scene.background.getHex(),0x0b1b11);
  controller.fire('daynight-manual');
  controls['#environment-clear'].onclick();
  assert.equal(row.hidden,true);
  assert.equal(controller.root.children.length,0);
  assert.equal(key.intensity,.82);
});
