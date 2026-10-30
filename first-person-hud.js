import * as THREE from './vendor/modern/three.module.js';

/* First-person interface for Custom Loader play mode.
   - HUD overlay (crosshair, compass, health, ammo, vehicle gauges, prompts), themed per game.
   - Held weapon / arms drawn in front of the camera (procedural, not extracted game meshes).
   - Cockpit camera that puts the view inside the vehicle being driven.
   The HUD is a recreation in the spirit of each game's interface, not an extract of the game's UI files. */

const THEMES={
  'titanfall-2':{id:'titanfall-2',label:'PILOT',accent:'#79dcff',alert:'#ff9a3c',weapon:'carbine',weaponName:'R-201 CARBINE',mag:30,reserve:180,shield:true,crosshair:'ring'},
  '007-first-light':{id:'007-first-light',label:'AGENT',accent:'#f1e3b6',alert:'#e0524a',weapon:'pistol',weaponName:'COMPACT PISTOL',mag:7,reserve:35,shield:false,crosshair:'dot'},
  default:{id:'default',label:'',accent:'#ffffff',alert:'#ffb44a',weapon:null,weaponName:'',mag:0,reserve:0,shield:false,crosshair:'dot'}
};
const BUBBLE_WEAPON={kind:'bubble',name:'BUBBLE GUN',mag:Infinity,reserve:0};
/** Slot 1 is always the bubble gun; slot 2 is the game's own rifle or pistol, when it has one. */
function weaponsFor(theme){const list=[BUBBLE_WEAPON];if(theme.weapon)list.push({kind:theme.weapon,name:theme.weaponName,mag:theme.mag,reserve:theme.reserve});return list;}
const VIEW_SCALE={bubble:.44,carbine:.68,pistol:.5};
const TITAN_THEME={...THEMES['titanfall-2'],label:'TITAN',weapon:null,weaponName:'XO-16 · ION',crosshair:'ring'};

const CSS=`
.fp-hud{position:absolute;inset:0;pointer-events:none;z-index:3;font-family:'Segoe UI',system-ui,sans-serif;color:var(--fp);text-shadow:0 0 6px rgba(0,0,0,.65)}
.fp-hud[hidden]{display:none}
.fp-cross{position:absolute;left:50%;top:50%;width:0;height:0}
.fp-cross i{position:absolute;display:block;background:var(--fp);box-shadow:0 0 4px rgba(0,0,0,.8)}
.fp-hud[data-cross=dot] .fp-cross i.dot{left:-2px;top:-2px;width:4px;height:4px;border-radius:50%}
.fp-hud[data-cross=dot] .fp-cross i.r,.fp-hud[data-cross=dot] .fp-cross i.t{display:none}
.fp-hud[data-cross=ring] .fp-cross i.dot{left:-1.5px;top:-1.5px;width:3px;height:3px;border-radius:50%}
.fp-cross i.ring{left:-13px;top:-13px;width:26px;height:26px;border:2px solid var(--fp);background:none;border-radius:50%;opacity:.8}
.fp-hud[data-cross=dot] .fp-cross i.ring{display:none}
.fp-cross i.t{width:2px;height:7px}.fp-cross i.t.a{left:-1px;top:-26px}.fp-cross i.t.b{left:-1px;top:19px}
.fp-cross i.r{width:7px;height:2px}.fp-cross i.r.a{left:-26px;top:-1px}.fp-cross i.r.b{left:19px;top:-1px}
.fp-hud[data-mode=air] .fp-cross i.ring,.fp-hud[data-mode=air] .fp-cross i.t,.fp-hud[data-mode=air] .fp-cross i.r{display:none}
.fp-hit{position:absolute;left:50%;top:50%;width:30px;height:30px;margin:-15px 0 0 -15px;opacity:0;transition:opacity .25s}
.fp-hit.on{opacity:1;transition:none}
.fp-hit::before,.fp-hit::after{content:'';position:absolute;left:14px;top:0;width:2px;height:30px;background:var(--fp-alert);transform:rotate(45deg)}
.fp-hit::after{transform:rotate(-45deg)}
.fp-compass{position:absolute;top:58px;left:50%;width:min(340px,50vw);height:34px;margin-left:calc(min(340px,50vw)/-2);overflow:hidden;-webkit-mask-image:linear-gradient(90deg,transparent,#000 22%,#000 78%,transparent);mask-image:linear-gradient(90deg,transparent,#000 22%,#000 78%,transparent)}
.fp-compass-track{position:absolute;left:50%;top:0;height:100%;will-change:transform}
.fp-compass-track span{position:absolute;top:0;width:40px;margin-left:-20px;text-align:center;font-size:11px;font-weight:600;letter-spacing:.06em;opacity:.75}
.fp-compass-track span::after{content:'';display:block;width:1px;height:7px;margin:2px auto 0;background:var(--fp);opacity:.7}
.fp-compass-track span.card{font-size:14px;font-weight:800;opacity:1}
.fp-compass-mark{position:absolute;top:44px;left:50%;margin-left:-5px;width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:7px solid var(--fp)}
.fp-heading{position:absolute;top:92px;left:50%;transform:translateX(-50%);font-size:12px;font-weight:700;letter-spacing:.1em;opacity:.9}
.fp-where{position:absolute;left:50%;top:116px;transform:translateX(-50%);max-width:50vw;font-size:11px;letter-spacing:.14em;text-transform:uppercase;opacity:.8;text-align:center;white-space:nowrap}
.fp-where b{font-size:10px;opacity:.6;font-weight:600;margin-right:8px}
.fp-vitals{position:absolute;left:22px;bottom:156px;width:min(250px,34vw)}
.fp-vitals .tag{font-size:11px;font-weight:700;letter-spacing:.16em;margin-bottom:5px}
.fp-bar{height:7px;background:rgba(0,0,0,.45);border:1px solid color-mix(in srgb,var(--fp) 55%,transparent);margin-bottom:4px;transform:skewX(-18deg)}
.fp-bar b{display:block;height:100%;width:100%;background:var(--fp);transition:width .2s}
.fp-bar.shield b{background:#7fa8ff}
.fp-hud[data-shield=off] .fp-bar.shield{display:none}
.fp-ammo{position:absolute;right:26px;bottom:156px;text-align:right}
.fp-ammo .count{font-size:44px;font-weight:800;line-height:1;letter-spacing:-.01em}
.fp-ammo .count small{font-size:20px;font-weight:600;opacity:.7;margin-left:6px}
.fp-ammo .name{font-size:11px;font-weight:700;letter-spacing:.16em;opacity:.9;margin-top:4px}
.fp-ammo .keys{font-size:10px;letter-spacing:.1em;opacity:.65;margin-top:3px}
.fp-ammo.low .count{color:var(--fp-alert)}
.fp-ammo .reload{height:3px;margin-top:6px;background:rgba(0,0,0,.45)}.fp-ammo .reload b{display:block;height:100%;width:0;background:var(--fp)}
.fp-hud[data-mode=air] .fp-ammo,.fp-hud[data-mode=car] .fp-ammo,.fp-hud[data-mode=titan] .fp-ammo,.fp-hud[data-weapon=none] .fp-ammo{display:none}
.fp-gauge{position:absolute;right:26px;bottom:156px;text-align:right;display:none}
.fp-hud[data-mode=air] .fp-gauge,.fp-hud[data-mode=car] .fp-gauge,.fp-hud[data-mode=titan] .fp-gauge{display:block}
.fp-gauge .speed{font-size:44px;font-weight:800;line-height:1}
.fp-gauge .speed small{font-size:15px;font-weight:600;opacity:.75;margin-left:6px}
.fp-gauge .row{font-size:12px;font-weight:700;letter-spacing:.12em;margin-top:5px;opacity:.9}
.fp-gauge .throttle{width:150px;height:5px;margin:7px 0 0 auto;background:rgba(0,0,0,.45);border:1px solid color-mix(in srgb,var(--fp) 55%,transparent)}
.fp-gauge .throttle b{display:block;height:100%;width:0;background:var(--fp)}
.fp-hud:not([data-mode=air]) .fp-gauge .air{display:none}
.fp-core{position:absolute;left:50%;bottom:34px;width:min(280px,40vw);transform:translateX(-50%);text-align:center;font-size:10px;font-weight:700;letter-spacing:.18em;display:none}
.fp-hud[data-mode=titan] .fp-core{display:block}
.fp-core .meter{height:6px;margin-top:5px;background:rgba(0,0,0,.45);border:1px solid color-mix(in srgb,var(--fp) 55%,transparent)}.fp-core .meter b{display:block;height:100%;width:0;background:var(--fp-alert)}
.fp-prompt{position:absolute;left:50%;bottom:170px;transform:translateX(-50%);padding:7px 14px;font-size:13px;font-weight:700;letter-spacing:.1em;background:rgba(0,0,0,.5);border:1px solid color-mix(in srgb,var(--fp) 60%,transparent);border-radius:3px;white-space:nowrap}
.fp-prompt[hidden]{display:none}
.fp-prompt kbd{font:inherit;display:inline-block;min-width:20px;padding:0 5px;margin-right:8px;text-align:center;color:#101418;background:var(--fp);border-radius:2px}
@media(max-width:700px){.fp-ammo .count,.fp-gauge .speed{font-size:30px}.fp-where{display:none}}
`;

function esc(value){return String(value??'').replace(/[&<>"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));}

function material(color,{metal=.2,rough=.6,emissive=0}={}){
  return new THREE.MeshStandardMaterial({color,metalness:metal,roughness:rough,emissive:emissive||0x000000,emissiveIntensity:emissive?1:0});
}
function box(w,h,d,mat,x=0,y=0,z=0){const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);mesh.position.set(x,y,z);return mesh;}
function cyl(radius,length,mat,x=0,y=0,z=0){const mesh=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,length,14),mat);mesh.rotation.x=Math.PI/2;mesh.position.set(x,y,z);return mesh;}
function limb(from,to,radius,mat){
  const length=from.distanceTo(to),mesh=new THREE.Mesh(new THREE.CylinderGeometry(radius*.85,radius,length,12),mat);
  mesh.position.copy(from).add(to).multiplyScalar(.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),to.clone().sub(from).normalize());
  return mesh;
}

function bubbleLabelTexture(){
  const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=200;const g=canvas.getContext('2d');
  g.fillStyle='#f4f6f9';g.fillRect(0,0,1024,200);g.fillStyle='#23408a';g.textBaseline='middle';g.textAlign='center';
  const face=' Segoe UI, Arial, sans-serif';g.font='900 120px'+face;
  const size=Math.floor(120*(1024*.94)/g.measureText('BUBBLE GUN').width);g.font='900 '+size+'px'+face;   // one line, scaled to fill the label
  g.fillText('BUBBLE GUN',512,106);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;return texture;
}
function bubbleWheelTexture(){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=128;const g=canvas.getContext('2d');
  g.fillStyle='#c8cdd6';g.beginPath();g.arc(64,64,62,0,Math.PI*2);g.fill();
  g.fillStyle='#8c95a3';g.beginPath();g.arc(64,64,50,0,Math.PI*2);g.fill();
  g.fillStyle='#1d2433';
  for(let i=0;i<12;i++){g.save();g.translate(64,64);g.rotate(i*Math.PI/6);g.beginPath();g.ellipse(0,-34,9,15,0,0,Math.PI*2);g.fill();g.restore();}
  g.fillStyle='#e3e7ee';g.beginPath();g.arc(64,64,12,0,Math.PI*2);g.fill();
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;return texture;
}
/** Toy bubble blaster: white shell with navy trim, twin bubble wheels in the front drum, top scope, side torch, two grips. */
function buildBubbleGun(weapon,muzzle,out){
  const white=material(0xf2f4f7,{metal:.1,rough:.4}),navy=material(0x1f3d8f,{metal:.15,rough:.45}),dark=material(0x141a28,{metal:.3,rough:.5}),gray=material(0xaab2be,{metal:.4,rough:.4});
  const redLight=material(0xff2a1a,{emissive:0xff2a1a}),lens=new THREE.MeshBasicMaterial({color:0xcfefff});
  weapon.add(box(.085,.085,.3,white,0,0,0));                         // main body
  weapon.add(box(.074,.04,.22,white,0,-.05,-.05));                   // lower cowl
  weapon.add(box(.04,.008,.28,gray,0,.046,0));                       // top rail
  for(const side of [-1,1]){
    if(side>0)weapon.add(box(.004,.05,.12,navy,side*.0435,.005,-.1));  // right side panel (the left side carries the big label)
    for(let i=0;i<7;i++)weapon.add(box(.005,.026,.008,dark,side*.0445,-.05,-.15+i*.018)); // lower vents
    // The left side faces the player in first person, so its label is larger than the right one.
    const big=side<0,label=new THREE.Mesh(new THREE.PlaneGeometry(big?.28:.14,big?.055:.0275),new THREE.MeshBasicMaterial({map:out.label||(out.label=bubbleLabelTexture())}));
    label.position.set(side*(big?.0462:.0442),big?0:.01,big?-.005:.06);label.rotation.y=side*Math.PI/2;weapon.add(label);
  }
  weapon.add(cyl(.035,.22,white,0,0,.25));                           // long rear barrel
  for(const z of [.18,.25,.32])weapon.add(cyl(.0365,.012,navy,0,0,z));
  weapon.add(cyl(.078,.16,white,0,.003,-.215));                      // front drum
  weapon.add(cyl(.081,.012,navy,0,.003,-.293));                      // drum rim
  weapon.add(cyl(.068,.004,navy,0,.003,-.3));                        // drum floor
  out.wheels=[];const wheelMaterial=new THREE.MeshBasicMaterial({map:bubbleWheelTexture(),side:THREE.DoubleSide,transparent:true});
  for(const y of [.037,-.031]){const wheel=new THREE.Mesh(new THREE.CircleGeometry(.032,28),wheelMaterial);wheel.position.set(0,y,-.304);weapon.add(wheel);out.wheels.push(wheel);}
  // scope
  const tube=cyl(.022,.13,navy,0,.085,-.07);weapon.add(tube);
  weapon.add(cyl(.026,.016,navy,0,.085,-.14));weapon.add(cyl(.0185,.004,lens,0,.085,-.1465));
  weapon.add(cyl(.026,.016,navy,0,.085,-.005));
  weapon.add(box(.05,.03,.1,navy,0,.062,-.07));weapon.add(box(.012,.02,.012,navy,0,.108,-.04));
  const knob=new THREE.Mesh(new THREE.CylinderGeometry(.011,.011,.02,10),navy);knob.rotation.z=Math.PI/2;knob.position.set(.03,.09,-.04);weapon.add(knob);
  // side torch
  const torch=cyl(.014,.1,navy,.055,-.028,-.16);weapon.add(torch);weapon.add(cyl(.011,.004,lens,.055,-.028,-.213));
  weapon.add(box(.01,.008,.008,redLight,.054,-.045,-.1));
  // grips
  const front=box(.034,.1,.04,navy,0,-.105,-.2);front.rotation.x=.1;weapon.add(front);
  const rear=box(.034,.1,.05,navy,0,-.095,.1);rear.rotation.x=-.28;weapon.add(rear);
  weapon.add(box(.008,.03,.05,navy,0,-.065,.04));weapon.add(box(.006,.022,.008,white,0,-.057,.052));
  muzzle.position.set(0,.003,-.31);
  weapon.position.set(.2,-.18,-.46);weapon.rotation.set(.02,.14,0);
}

// Everything is modelled in camera space: +x right, +y up, -z forward. Units are metres.
function buildViewmodel(kind,theme){
  const group=new THREE.Group(),weapon=new THREE.Group(),muzzle=new THREE.Group();
  const suit=material(kind==='pistol'?0x1c2434:0x3a4150,{rough:.85,metal:0}),glove=material(0x15171b,{rough:.9,metal:0});
  const cuff=material(kind==='pistol'?0xe9e6df:0x595f6c,{rough:.7,metal:0});
  const steel=material(0x24282e,{metal:.75,rough:.35}),grip=material(0x15171a,{rough:.8,metal:.05}),accent=material(kind==='pistol'?0x8d8f93:0xd9702a,{metal:.4,rough:.5});
  const extra={};
  if(kind==='bubble'){buildBubbleGun(weapon,muzzle,extra);}
  else if(kind==='carbine'){
    weapon.add(box(.05,.075,.34,steel,0,0,0));                       // receiver
    weapon.add(box(.046,.05,.2,grip,0,-.004,-.26));                  // handguard
    weapon.add(cyl(.011,.2,steel,0,.004,-.46));                      // barrel
    weapon.add(cyl(.016,.05,steel,0,.004,-.57));                     // muzzle brake
    weapon.add(box(.042,.07,.16,grip,0,-.01,.25));                   // stock
    const magazine=box(.034,.12,.055,steel,0,-.095,-.02);magazine.rotation.x=.18;weapon.add(magazine);
    const pistolGrip=box(.034,.095,.05,grip,0,-.085,.1);pistolGrip.rotation.x=-.3;weapon.add(pistolGrip);
    weapon.add(box(.012,.04,.012,accent,0,.055,-.12));               // sight post
    weapon.add(box(.04,.04,.07,steel,0,.062,-.02));                  // optic body
    weapon.add(box(.007,.007,.002,material(0xff3b30,{emissive:0xff2a1a}),0,.068,-.056)); // red dot
    weapon.add(box(.052,.012,.2,accent,0,.04,-.2));                  // rail accent
    muzzle.position.set(0,.004,-.62);
    weapon.position.set(.15,-.15,-.34);weapon.rotation.set(0,.05,0);
  }else{
    weapon.add(box(.03,.036,.19,steel,0,.03,-.02));                  // slide
    weapon.add(box(.028,.026,.15,accent,0,.004,-.005));              // frame
    weapon.add(cyl(.007,.04,steel,0,.032,-.125));                    // barrel tip
    const handle=box(.032,.1,.05,grip,0,-.055,.055);handle.rotation.x=-.18;weapon.add(handle);
    weapon.add(box(.008,.012,.008,steel,0,.054,.055));               // rear sight
    muzzle.position.set(0,.032,-.15);
    weapon.position.set(.2,-.2,-.62);weapon.rotation.set(.04,.02,0);
  }
  const flashMaterial=new THREE.MeshBasicMaterial({color:0xffd28a,transparent:true,opacity:.95,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide});
  const flash=new THREE.Group();
  for(const turn of [0,Math.PI/2]){const plane=new THREE.Mesh(new THREE.PlaneGeometry(.1,.1),flashMaterial);plane.rotation.z=turn;plane.rotation.y=Math.PI/2;flash.add(plane);}
  const star=new THREE.Mesh(new THREE.PlaneGeometry(.12,.12),flashMaterial);flash.add(star);
  flash.visible=false;if(kind!=='bubble')muzzle.add(flash);weapon.add(muzzle);
  group.add(weapon);

  // Arms live inside the weapon group so hands stay on the grips while the weapon bobs and recoils.
  weapon.updateMatrixWorld(true);
  const right=kind==='bubble'?new THREE.Vector3(0,-.1,.1):kind==='carbine'?new THREE.Vector3(0,-.1,.1):new THREE.Vector3(.0,-.07,.06);
  const left=kind==='bubble'?new THREE.Vector3(0,-.11,-.2):kind==='carbine'?new THREE.Vector3(0,-.04,-.27):new THREE.Vector3(-.015,-.075,.045);
  const elbowRight=weapon.worldToLocal(new THREE.Vector3(.34,-.5,.12)),elbowLeft=weapon.worldToLocal(new THREE.Vector3(-.3,-.5,.1));
  for(const [hand,elbow] of [[right,elbowRight],[left,elbowLeft]]){
    weapon.add(box(.05,.05,.075,glove,hand.x,hand.y,hand.z));
    const wrist=hand.clone().add(elbow.clone().sub(hand).normalize().multiplyScalar(.07));
    weapon.add(limb(wrist,hand,.024,cuff));
    const cuffEnd=wrist.clone().add(elbow.clone().sub(wrist).normalize().multiplyScalar(.04));
    weapon.add(limb(cuffEnd,wrist,.028,cuff));
    weapon.add(limb(elbow,cuffEnd,.034,suit));
  }
  group.traverse(node=>{if(node.isMesh){node.frustumCulled=false;node.castShadow=false;node.receiveShadow=false;node.renderOrder=20;}});
  group.userData={weapon,muzzle,flash,wheels:extra.wheels||[],home:weapon.position.clone(),homeRot:weapon.rotation.clone()};
  return group;
}

export function themeFor(gameId){return THEMES[gameId]||THEMES.default;}

export function createFirstPersonHud({viewport,getScene,getCamera,onWeaponChange}){
  if(!document.getElementById('fp-hud-style')){const style=document.createElement('style');style.id='fp-hud-style';style.textContent=CSS;document.head.append(style);}
  const root=document.createElement('div');root.className='fp-hud';root.hidden=true;root.setAttribute('aria-hidden','true');
  root.innerHTML=`<div class="fp-where"><b>LOCATION</b><span data-f="where"></span></div>
    <div class="fp-compass"><div class="fp-compass-track" data-f="track"></div></div><div class="fp-compass-mark"></div><div class="fp-heading" data-f="heading">000°</div>
    <div class="fp-cross"><i class="ring"></i><i class="t a"></i><i class="t b"></i><i class="r a"></i><i class="r b"></i><i class="dot"></i></div><div class="fp-hit" data-f="hit"></div>
    <div class="fp-vitals"><div class="tag" data-f="tag"></div><div class="fp-bar"><b data-f="health"></b></div><div class="fp-bar shield"><b data-f="shield"></b></div></div>
    <div class="fp-ammo" data-f="ammoBox"><div class="count"><span data-f="mag">0</span><small data-f="reserve">0</small></div><div class="name" data-f="weaponName"></div><div class="keys" data-f="keys">F FIRE · R RELOAD</div><div class="reload"><b data-f="reloadBar"></b></div></div>
    <div class="fp-gauge"><div class="speed"><span data-f="speed">0</span><small data-f="unit">km/h</small></div><div class="row air" data-f="alt"></div><div class="row" data-f="gaugeName"></div><div class="throttle air"><b data-f="throttle"></b></div></div>
    <div class="fp-core"><span>ION CORE</span><div class="meter"><b data-f="core"></b></div></div>
    <div class="fp-prompt" data-f="prompt" hidden></div>`;
  viewport.append(root);
  const f=Object.fromEntries([...root.querySelectorAll('[data-f]')].map(node=>[node.dataset.f,node]));

  // Compass track: two full turns of 15 degree ticks, so the strip can wrap seamlessly.
  const PX=3;let trackHtml='';
  const names={0:'N',45:'NE',90:'E',135:'SE',180:'S',225:'SW',270:'W',315:'NW'};
  for(let turn=0;turn<3;turn++)for(let degree=0;degree<360;degree+=15){
    const label=names[degree];trackHtml+=`<span class="${label&&label.length===1?'card':''}" style="left:${(turn*360+degree)*PX}px">${label||degree}</span>`;
  }
  f.track.innerHTML=trackHtml;

  const view=new THREE.Group();view.name='first-person-viewmodel';view.visible=false;view.scale.setScalar(.68);
  let vm=null,vmKind=null,vmCamera=null;
  const state={active:false,theme:THEMES.default,weapons:weaponsFor(THEMES.default),weaponIndex:0,ammo:{},trigger:false,swap:0,mag:0,reserve:0,reloading:0,flash:0,recoil:0,hit:0,time:0,bob:0,lastYaw:0,lastPitch:0,swayX:0,swayY:0,mode:'foot',location:'',cache:{}};
  const tmp=new THREE.Vector3(),mpos=new THREE.Vector3(),mdir=new THREE.Vector3();
  const cur=()=>state.weapons[state.weaponIndex]||null;

  // ---- bubble stream: pooled instanced spheres, constant emission rate while the trigger is held ----
  const BUBBLE_COUNT=260,BUBBLE_RATE=36;
  let bubbles=null,bubbleCursor=0,bubbleAcc=0,bubbleClock=0,bubbleAlive=0;
  const bubbleData=Array.from({length:BUBBLE_COUNT},()=>({life:0,age:0,size:0,phase:0,pos:new THREE.Vector3(),vel:new THREE.Vector3()}));
  const dummy=new THREE.Object3D(),bubbleColor=new THREE.Color();
  function ensureBubbles(scene){
    if(!bubbles){
      const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,
        vertexShader:`varying vec3 vN;varying vec3 vV;varying vec3 vC;
          void main(){mat4 m=modelMatrix*instanceMatrix;vec4 wp=m*vec4(position,1.);vN=normalize(mat3(m)*normal);vV=normalize(cameraPosition-wp.xyz);vC=instanceColor;gl_Position=projectionMatrix*viewMatrix*wp;}`,
        fragmentShader:`varying vec3 vN;varying vec3 vV;varying vec3 vC;
          void main(){float f=1.-abs(dot(normalize(vN),normalize(vV)));float rim=pow(f,2.2);
            vec3 irid=.5+.5*cos(6.2832*(vC.r+f*.8+vec3(0.,.33,.67)));
            gl_FragColor=vec4(mix(vec3(1.),irid,.75)*(.55+rim*.6),clamp(.1+rim*.8,0.,.92));}`});
      bubbles=new THREE.InstancedMesh(new THREE.SphereGeometry(1,14,10),material,BUBBLE_COUNT);
      bubbles.name='bubbles';bubbles.frustumCulled=false;bubbles.renderOrder=15;bubbles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      dummy.scale.setScalar(0);dummy.updateMatrix();
      for(let i=0;i<BUBBLE_COUNT;i++){bubbles.setMatrixAt(i,dummy.matrix);bubbles.setColorAt(i,bubbleColor.setScalar(Math.random()));}
      bubbles.instanceColor.needsUpdate=true;
    }
    if(bubbles.parent!==scene)scene.add(bubbles);
  }
  function emitBubble(origin,direction){
    const index=bubbleCursor,b=bubbleData[index];bubbleCursor=(bubbleCursor+1)%BUBBLE_COUNT;
    b.age=0;b.life=3.4+Math.random()*2;b.size=.05+Math.random()*.06;b.phase=Math.random()*6.283;
    b.pos.copy(origin);b.vel.set(Math.random()-.5,Math.random()-.5,Math.random()-.5).multiplyScalar(.55).addScaledVector(direction,2.2+Math.random()*.9);
    bubbles.setColorAt(index,bubbleColor.setScalar(Math.random()));bubbles.instanceColor.needsUpdate=true;
  }
  function stepBubbles(dt){
    if(!bubbles||!bubbleAlive&&!state.trigger)return;
    bubbleClock+=dt;bubbleAlive=0;
    for(let i=0;i<BUBBLE_COUNT;i++){
      const b=bubbleData[i];if(b.life<=0)continue;
      b.age+=dt;
      if(b.age>=b.life){b.life=0;dummy.position.copy(b.pos);dummy.scale.setScalar(0);dummy.updateMatrix();bubbles.setMatrixAt(i,dummy.matrix);continue;}
      bubbleAlive++;
      b.vel.multiplyScalar(Math.exp(-.7*dt));b.vel.y+=.12*dt;
      b.vel.x+=Math.sin(bubbleClock*2+b.phase)*.2*dt;b.vel.z+=Math.cos(bubbleClock*1.7+b.phase)*.2*dt;
      b.pos.addScaledVector(b.vel,dt);
      const grow=Math.min(1,b.age/.12),fade=Math.min(1,(b.life-b.age)/.3);
      dummy.position.copy(b.pos);dummy.scale.setScalar(b.size*grow*(fade<1?1+(1-fade)*.35:1));dummy.updateMatrix();bubbles.setMatrixAt(i,dummy.matrix);
    }
    bubbles.instanceMatrix.needsUpdate=true;
  }

  function setText(key,value){if(state.cache[key]!==value){state.cache[key]=value;f[key].textContent=value;}}
  function setWidth(key,percent){const value=Math.round(percent*10)/10+'%';if(state.cache['w'+key]!==value){state.cache['w'+key]=value;f[key].style.width=value;}}
  function applyTheme(theme){
    state.theme=theme;root.style.setProperty('--fp',theme.accent);root.style.setProperty('--fp-alert',theme.alert);
    root.dataset.cross=theme.crosshair;root.dataset.shield=theme.shield?'on':'off';root.dataset.weapon=state.weapons.length?'yes':'none';
    setText('tag',theme.label);setText('weaponName',cur()?.name||'');
    state.cache.mag=state.cache.reserve=null;
  }
  function loadWeapon(){
    const w=cur();
    if(w&&w.kind!=='bubble'){const ammo=state.ammo[w.kind]||{mag:w.mag,reserve:w.reserve};state.mag=ammo.mag;state.reserve=ammo.reserve;}
    setText('weaponName',w?.name||'');state.cache.mag=state.cache.reserve=null;
    onWeaponChange?.(w?.name||'');
  }
  function selectWeapon(index){
    const count=state.weapons.length;if(!count)return;
    index=((index%count)+count)%count;if(index===state.weaponIndex)return;
    const w=cur();if(w&&w.kind!=='bubble')state.ammo[w.kind]={mag:state.mag,reserve:state.reserve};
    state.reloading=0;state.trigger=false;state.swap=.3;state.weaponIndex=index;loadWeapon();
  }
  function cycleWeapon(){selectWeapon(state.weaponIndex+1);}
  function fire(){
    const w=cur();
    if(!state.active||state.mode!=='foot'||!w||state.reloading>0)return;
    if(w.kind==='bubble'){state.trigger=true;return;}
    if(state.mag<=0){reload();return;}
    state.mag--;state.flash=.06;state.recoil=1;state.hit=.18;
  }
  // The F keyup counterpart to fire(): ends the bubble gun's hold-to-stream. Exposed so the
  // loader's on-screen Fire button (above the LOOK stick) can mirror the key exactly.
  function release(){state.trigger=false;}
  function reload(){
    const w=cur();
    if(!state.active||state.mode!=='foot'||!w||w.kind==='bubble'||state.reloading>0||state.mag>=w.mag||state.reserve<=0)return;
    state.reloading=1.5;
  }
  window.addEventListener('keydown',event=>{
    if(!state.active||event.repeat&&event.key.toLowerCase()!=='f')return;
    if(/^(input|select|textarea)$/i.test(event.target?.tagName||''))return;
    const key=event.key.toLowerCase();
    if(key==='f'){fire();}else if(key==='r'&&state.mode==='foot'){reload();}
    else if(state.mode==='foot'&&(key==='1'||key==='2')){selectWeapon(Number(key)-1);}
    else if(state.mode==='foot'&&key==='x'){cycleWeapon();}
  });
  window.addEventListener('keyup',event=>{if(event.key.toLowerCase()==='f')state.trigger=false;});
  window.addEventListener('blur',()=>{state.trigger=false;});

  function attachViewmodel(){
    const camera=getCamera(),scene=getScene();
    if(!camera||!scene)return false;
    const kind=cur()?.kind||null;
    if(!vm||vmKind!==kind){
      if(vm){view.remove(vm);}
      vm=kind?buildViewmodel(kind,state.theme):null;vmKind=kind;
      if(vm)view.add(vm);
      view.scale.setScalar(VIEW_SCALE[kind]||.68);
    }
    if(vmCamera!==camera||view.parent!==camera){camera.add(view);vmCamera=camera;}
    if(camera.parent!==scene)scene.add(camera);
    return true;
  }

  function configure({gameId,location=''}={}){
    state.location=location;setText('where',location);
    state.mag=state.reserve=0;state.reloading=0;state.trigger=false;
    const theme=themeFor(gameId);state.weapons=weaponsFor(theme);state.weaponIndex=0;state.ammo={};
    applyTheme(theme);loadWeapon();
  }

  /** @param {object} o show: bool, driving, kind ('car'|'airplane'|'helicopter'|'mech'), speed (m/s), altitude, throttle (0..1), prompt, moving, yaw, pitch */
  function update(dt,o){
    const show=!!o.show;
    if(root.hidden===show)root.hidden=!show;
    if(show!==state.active){state.active=show;if(!show){view.visible=false;state.flash=0;state.trigger=false;}}
    stepBubbles(dt);
    if(!show)return;
    state.time+=dt;
    const driving=!!o.driving,kind=o.kind;
    const mode=driving?(kind==='mech'?'titan':kind==='airplane'||kind==='helicopter'?'air':'car'):'foot';
    if(mode!==state.mode||state.cache.theme!==(mode==='titan'?'titan':state.theme.id)){
      state.mode=mode;state.cache.theme=mode==='titan'?'titan':state.theme.id;root.dataset.mode=mode;
      if(mode==='titan'){const t=TITAN_THEME;root.style.setProperty('--fp',t.accent);root.style.setProperty('--fp-alert',t.alert);root.dataset.cross='ring';root.dataset.shield='on';setText('tag',t.label);}
      else{applyTheme(state.theme);setText('tag',state.theme.label);}
    }
    const camera=getCamera();
    // Compass
    if(camera){
      camera.getWorldDirection(tmp);
      let bearing=Math.atan2(tmp.x,-tmp.z)*180/Math.PI;bearing=(bearing%360+360)%360;
      const offset=-(360+bearing)*PX;
      const text='translateX('+offset.toFixed(1)+'px)';
      if(state.cache.track!==text){state.cache.track=text;f.track.style.transform=text;}
      setText('heading',String(Math.round(bearing)%360).padStart(3,'0')+'°');
    }
    // Weapon state
    state.flash=Math.max(0,state.flash-dt);state.hit=Math.max(0,state.hit-dt);state.recoil=Math.max(0,state.recoil-dt*9);
    if(state.reloading>0){state.reloading=Math.max(0,state.reloading-dt);if(state.reloading===0){const take=Math.min((cur()?.mag||0)-state.mag,state.reserve);state.mag+=take;state.reserve-=take;}}
    f.hit.classList.toggle('on',state.hit>0);
    const w=cur(),isBubble=w?.kind==='bubble';
    setText('mag',isBubble?'∞':String(state.mag));setText('reserve',isBubble?'':'/ '+state.reserve);
    setText('keys',isBubble?'F HOLD · STREAM · X SWAP':'F FIRE · R RELOAD · X SWAP');
    f.ammoBox.classList.toggle('low',!!w&&!isBubble&&w.mag>0&&state.mag<=Math.ceil(w.mag*.25));
    setWidth('reloadBar',state.reloading>0?(1-state.reloading/1.5)*100:0);
    // Gauges
    if(driving){
      const speed=Math.abs(o.speed||0);
      if(kind==='airplane'||kind==='helicopter'){setText('speed',String(Math.round(speed*1.943844)));setText('unit','kt');setText('alt','ALT '+Math.round(o.altitude||0)+' m');setWidth('throttle',(o.throttle||0)*100);}
      else{setText('speed',String(Math.round(speed*3.6)));setText('unit','km/h');}
      setText('gaugeName',o.vehicleName?String(o.vehicleName).toUpperCase():'');
      setWidth('core',Math.min(100,(speed/4.5)*25));
    }
    // Prompt
    const prompt=o.prompt||'';
    if(state.cache.prompt!==prompt){state.cache.prompt=prompt;f.prompt.hidden=!prompt;if(prompt){const m=/^\[(\w+)\]\s*(.*)$/.exec(prompt);f.prompt.innerHTML=m?`<kbd>${esc(m[1])}</kbd>${esc(m[2])}`:esc(prompt);}}
    // Held weapon
    state.swap=Math.max(0,state.swap-dt);
    const showModel=mode==='foot'&&!!cur()&&attachViewmodel();
    view.visible=!!(showModel&&vm);
    if(view.visible){
      const {weapon,flash,home,homeRot}=vm.userData;
      const dyaw=((o.yaw||0)-state.lastYaw),dpitch=((o.pitch||0)-state.lastPitch);state.lastYaw=o.yaw||0;state.lastPitch=o.pitch||0;
      const k=1-Math.exp(-10*dt);
      state.swayX+=(THREE.MathUtils.clamp(dyaw*.6,-.05,.05)-state.swayX)*k;state.swayY+=(THREE.MathUtils.clamp(-dpitch*.6,-.05,.05)-state.swayY)*k;
      state.bob=o.moving?state.bob+dt*8.5:state.bob*Math.exp(-6*dt);
      const bobX=o.moving?Math.sin(state.bob)*.006:0,bobY=o.moving?Math.abs(Math.sin(state.bob))*.007:0;
      const dip=(state.reloading>0?Math.sin(Math.min(1,(1.5-state.reloading)/1.5)*Math.PI)*.16:0)+state.swap/.3*.16;
      weapon.position.set(home.x+bobX+state.swayX,home.y+bobY+state.swayY-dip,home.z+state.recoil*.035);
      weapon.rotation.set(homeRot.x+state.recoil*.06+dip*1.4,homeRot.y,homeRot.z+state.swayX*1.2);
      flash.visible=state.flash>0&&!isBubble;if(flash.visible)flash.rotation.z=Math.random()*Math.PI;
      if(isBubble){
        const streaming=state.trigger&&state.swap<=0;
        for(const wheel of vm.userData.wheels)wheel.rotation.z+=dt*(streaming?11:.8);
        if(streaming&&camera){
          ensureBubbles(getScene());camera.updateMatrixWorld(true);vm.userData.muzzle.getWorldPosition(mpos);camera.getWorldDirection(mdir);
          bubbleAcc+=dt*BUBBLE_RATE;
          while(bubbleAcc>=1){bubbleAcc-=1;emitBubble(mpos,mdir);}
        }else bubbleAcc=0;
      }
    }
  }
  function dispose(){root.remove();if(view.parent)view.parent.remove(view);}
  return {configure,update,fire,release,reload,selectWeapon,cycleWeapon,dispose,get weaponName(){return cur()?.name||'';},get weaponCount(){return state.weapons.length;},get active(){return state.active;}};
}

const eye=new THREE.Vector3(),local=new THREE.Vector3(),baseQ=new THREE.Quaternion(),lookQ=new THREE.Quaternion(),euler=new THREE.Euler(0,0,0,'YXZ');

/** Seat position (in the vehicle's own frame) and forward axis for each vehicle type. */
export function cockpitSeat(driver){
  const {size,kind}=driver,family=driver.car.userData.vehicle?.family||'';
  if(kind==='mech')return {x:0,y:size.height*.8,z:size.length*.1,flip:true,bone:'def_c_head'};
  if(kind==='airplane')return {x:0,y:size.height*.7,z:-size.length*.3,flip:false};
  if(kind==='helicopter')return {x:-size.width*.1,y:size.height*.6,z:-size.length*.16,flip:false};
  if(/motorcycle|scooter|bicycle|quadbike/.test(family+driver.car.name.toLowerCase()))return {x:0,y:size.height*.88,z:-size.length*.04,flip:false};
  return {x:-size.width*.17,y:size.height*.78,z:-size.length*.07,flip:false};
}

const fwd=new THREE.Vector3(),flipQ=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),Math.PI);
/** Where the seat is this frame, with -z pointing out of the windshield; applyCockpitCamera refreshes it. */
export const cockpitFrame={position:new THREE.Vector3(),quaternion:new THREE.Quaternion()};
/** Puts the camera at the driver's seat, looking along the vehicle. yaw is a free-look offset; pitch>.35 looks down. */
export function applyCockpitCamera(camera,driver,{yaw=0,pitch=.35,forward=.55,fov=75}={}){
  const {car}=driver,seat=cockpitSeat(driver);
  car.updateWorldMatrix(true,true);
  car.getWorldQuaternion(baseQ);
  let head=null;
  if(seat.bone){
    if(car.userData.fpHead===undefined){car.userData.fpHead=null;car.traverse(node=>{if(!car.userData.fpHead&&node.isBone&&node.name===seat.bone)car.userData.fpHead=node;});}
    head=car.userData.fpHead;
  }
  if(head){
    // Titan: sit just in front of the head bone so the camera looks out of the cockpit.
    head.getWorldPosition(eye);fwd.set(0,0,1).applyQuaternion(baseQ);eye.addScaledVector(fwd,forward);eye.y+=.1;
  }else{
    local.set(seat.x,seat.y,seat.z);eye.copy(local).applyMatrix4(car.matrixWorld);
  }
  camera.position.copy(eye);
  cockpitFrame.position.copy(eye);cockpitFrame.quaternion.copy(baseQ);if(seat.flip)cockpitFrame.quaternion.multiply(flipQ);
  euler.set(-(pitch-.35),yaw+(seat.flip?Math.PI:0),0,'YXZ');lookQ.setFromEuler(euler);
  camera.quaternion.copy(baseQ).multiply(lookQ);
  if(camera.fov!==fov){camera.fov=fov;camera.updateProjectionMatrix();}
}

const culled=new Map();
/** Inside a vehicle the hull's inner faces are not modelled, so draw only front faces: the body then stays out of the view. */
export function setCockpitCulling(car,on){
  if(!car||on===culled.has(car))return;
  if(on){
    const saved=new Map();
    car.traverse(node=>{if(!node.isMesh)return;for(const material of Array.isArray(node.material)?node.material:[node.material]){if(material&&!saved.has(material)){saved.set(material,material.side);material.side=THREE.FrontSide;material.needsUpdate=true;}}});
    culled.set(car,saved);
  }else{
    for(const [material,side] of culled.get(car)){material.side=side;material.needsUpdate=true;}
    culled.delete(car);
  }
}

/* Occluder hiding: extracted vehicles often have a solid shell (roof, canopy, bonnet panels) around the seat.
   Meshes that enclose the eye and are hit by view rays are hidden while the cockpit view is on, so the player sees out. */
const hiddenParts=new Map(),ray=new THREE.Raycaster(),ndc=new THREE.Vector2(),partBox=new THREE.Box3(),partSize=new THREE.Vector3();
let lastScan=0;
export function updateCockpitOccluders(car,camera,now,force=false){
  if(!car||car.userData.vehicle?.family==='titan_mech')return;
  if(!force&&now-lastScan<700)return;lastScan=now;
  ray.camera=camera;ray.far=4;
  const hide=hiddenParts.get(car)||new Set();hiddenParts.set(car,hide);
  const targets=[];car.traverse(node=>{if(node.isMesh&&node.visible)targets.push(node);});
  for(const [x,y] of [[0,0],[-.6,0],[.6,0],[0,.6],[0,-.4],[-.6,.5],[.6,.5],[-.9,0],[.9,0]]){
    ndc.set(x,y);ray.setFromCamera(ndc,camera);
    for(const hit of ray.intersectObjects(targets,false)){
      const mesh=hit.object;if(hide.has(mesh)||!mesh.visible)continue;
      partBox.setFromObject(mesh);partBox.getSize(partSize);
      if(Math.max(partSize.x,partSize.y,partSize.z)<1.2||!partBox.expandByScalar(.05).containsPoint(camera.position))continue;
      mesh.visible=false;hide.add(mesh);
    }
  }
}
export function restoreCockpitOccluders(car){
  const hide=hiddenParts.get(car);if(!hide)return;
  for(const mesh of hide)mesh.visible=true;hiddenParts.delete(car);lastScan=0;
}
