// Titan cabin: a procedural pilot's cockpit (windshield, dash, side consoles) drawn around the seat,
// plus a live web screen on the right-hand console. The screen is a real <iframe> laid over the canvas and
// warped with a CSS matrix3d so it sits exactly on the 3D panel as the pilot looks around.
import * as THREE from 'three';

export const DEFAULT_SCREEN_URL='http://100.98.204.108:8090/';
const PANEL={x:1.08,y:0,z:-.25,w:1.04,h:.65};          // right console, metres in cockpit space (eye at origin, -z forward)
const FRAME_W=1280,FRAME_H=800;                       // iframe's own layout size (16:10, matches the panel)
const TEAL=0x79dcff,ORANGE=0xff7a1a;

const CSS=`
.cabin-layer{position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:2;visibility:hidden}
.cabin-layer.on{visibility:visible}
.cabin-layer iframe{position:absolute;left:0;top:0;width:${FRAME_W}px;height:${FRAME_H}px;border:0;background:#04090c;transform-origin:0 0;pointer-events:none;opacity:0;will-change:transform}
.cabin-layer iframe.show{opacity:1}
.cabin-layer.use iframe{pointer-events:auto;box-shadow:0 0 0 6px rgba(121,220,255,.9)}
.cabin-hint{position:absolute;right:16px;top:92px;padding:6px 10px;border:1px solid rgba(121,220,255,.55);background:rgba(4,12,18,.72);color:#bfeaff;font:600 11px/1.2 'Segoe UI',system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;border-radius:4px;display:none}
.cabin-layer.on .cabin-hint{display:block}
.cabin-hint kbd{display:inline-block;margin-right:6px;padding:1px 6px;border:1px solid currentColor;border-radius:3px}
`;

/** Solves for the 2D projective map taking (0,0),(w,0),(w,h),(0,h) to the four destination points; returns a CSS matrix3d. */
export function homographyMatrix(w,h,dst){
  const src=[[0,0],[w,0],[w,h],[0,h]],A=[];
  for(let i=0;i<4;i++){
    const [x,y]=src[i],X=dst[i].x,Y=dst[i].y;
    A.push([x,y,1,0,0,0,-x*X,-y*X,X]);
    A.push([0,0,0,x,y,1,-x*Y,-y*Y,Y]);
  }
  for(let c=0;c<8;c++){
    let p=c;for(let r=c+1;r<8;r++)if(Math.abs(A[r][c])>Math.abs(A[p][c]))p=r;
    if(Math.abs(A[p][c])<1e-12)return null;
    [A[c],A[p]]=[A[p],A[c]];
    for(let r=0;r<8;r++){if(r===c)continue;const f=A[r][c]/A[c][c];for(let k=c;k<9;k++)A[r][k]-=f*A[c][k];}
  }
  const [a,b,cc,d,e,f,g,hh]=A.map((row,i)=>row[8]/row[i]);
  return `matrix3d(${a},${d},0,${g},${b},${e},0,${hh},0,0,1,0,${cc},${f},0,1)`;
}

function texture(canvas){const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=4;return tex;}
function makeCanvas(w,h){const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;return canvas;}

export function createTitanCockpit({viewport,url=DEFAULT_SCREEN_URL}){
  const style=document.createElement('style');style.textContent=CSS;document.head.appendChild(style);
  const layer=document.createElement('div');layer.className='cabin-layer';
  const hint=document.createElement('div');hint.className='cabin-hint';
  layer.appendChild(hint);viewport.appendChild(layer);
  let iframe=null,interactive=false,active=false,group=null,clock=0,paintClock=0;
  // The cabin is drawn in its own pass over a cleared depth buffer, so parts of the Titan model inside the seat volume never poke through it.
  const cabinScene=new THREE.Scene();cabinScene.add(new THREE.AmbientLight(0xaecbd8,.9));

  function updateHint(){hint.innerHTML=interactive?'<kbd>click outside</kbd>release screen':'<kbd>T</kbd>use screen';}
  updateHint();

  function ensureFrame(){
    if(iframe)return;
    iframe=document.createElement('iframe');
    iframe.title='Cockpit screen';iframe.setAttribute('allow','autoplay; fullscreen; clipboard-write');iframe.referrerPolicy='no-referrer';
    iframe.addEventListener('load',()=>{iframe.classList.add('show');if(!interactive)window.focus();});
    iframe.src=url;
    layer.insertBefore(iframe,hint);
  }

  const dark=new THREE.MeshStandardMaterial({color:0x1a2025,roughness:.72,metalness:.35,emissive:0x070d11,side:THREE.DoubleSide});
  const panel=new THREE.MeshStandardMaterial({color:0x262e34,roughness:.6,metalness:.4,emissive:0x0a1318,side:THREE.DoubleSide});
  const orange=new THREE.MeshBasicMaterial({color:ORANGE,side:THREE.DoubleSide});
  const tealGlow=new THREE.MeshBasicMaterial({color:TEAL,side:THREE.DoubleSide});

  function box(w,h,d,mat,x,y,z,ry=0,rx=0){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);m.rotation.set(rx,ry,0);return m;}

  function build(){
    // The seat sits a little forward of the cockpit's centre, so the windshield opens wider around the pilot.
    const root=new THREE.Group();root.name='Titan cockpit';const g=new THREE.Group();g.position.z=.25;root.add(g);
    // Shell: floor, roof, side and rear walls (double sided so the inside faces draw).
    g.add(box(2.4,.1,1.5,dark,0,-1.0,.45));                              // floor behind the seat only, so the ground shows through in front
    g.add(box(2.4,.1,2.5,dark,0,.82,-.05));
    g.add(box(.1,1.9,2,dark,-1.2,-.1,.2));                                // side walls stop beside the pilot: the windshield wraps round to the sides
    g.add(box(.1,1.9,2,dark,1.2,-.1,.2));
    g.add(box(2.4,1.9,.1,dark,0,-.1,1.2));
    // Front: dash, header and two pillars leave a wide windshield opening.
    g.add(box(2.4,.3,.6,dark,0,.66,-1.1));
    g.add(box(.14,1.9,.2,dark,-1.16,-.1,-.88,.32));                       // slim corner pillars so the outside view is as wide as possible
    g.add(box(.14,1.9,.2,dark,1.16,-.1,-.88,-.32));
    // Orange trim along the dash and header edges, as on the Ion's inner frame.
    g.add(box(2.1,.012,.012,orange,0,.5,-1.36));
    // Roof lights and floor strip lights.
    for(const x of [-.6,0,.6])g.add(box(.3,.015,.06,tealGlow,x,.78,-.2));
    g.add(box(.02,.02,1.8,tealGlow,-.62,-.94,-.1));g.add(box(.02,.02,1.8,tealGlow,.62,-.94,-.1));
    // Armrests and the two flight grips.
    for(const s of [-1,1]){
      g.add(box(.3,.08,.8,panel,s*.55,-.56,-.1));
      const grip=new THREE.Mesh(new THREE.CylinderGeometry(.024,.03,.22,10),dark);grip.position.set(s*.42,-.44,-.34);grip.rotation.x=-.4;g.add(grip);
      g.add(box(.012,.012,.3,tealGlow,s*.55,-.51,-.1));
    }

    // Displays.
    const status=makeCanvas(512,320),centre=makeCanvas(320,160),link=makeCanvas(512,320);
    const statusTex=texture(status),centreTex=texture(centre),linkTex=texture(link);
    function screenPanel(w,h,tex,x,y,z,ry,rx=0,holo=false){
      const holder=new THREE.Group();holder.position.set(x,y,z);holder.rotation.set(rx,ry,0,'YXZ');
      if(!holo){
        holder.add(box(w+.07,h+.07,.04,panel,0,0,-.03));
        for(const [sx,sy,sw,sh] of [[0,h/2+.04,w+.09,.012],[0,-h/2-.04,w+.09,.012],[-w/2-.04,0,.012,h+.09],[w/2+.04,0,.012,h+.09]])holder.add(box(sw,sh,.012,orange,sx,sy,-.008));
      }
      const face=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map:tex,side:THREE.DoubleSide,transparent:holo,depthWrite:!holo}));
      holder.add(face);g.add(holder);return holder;
    }
    // The link screen is on the right-hand wall, 90 degrees to the pilot's right; the status panel mirrors it on the left.
    const rightPanel=screenPanel(PANEL.w,PANEL.h,linkTex,PANEL.x,PANEL.y,PANEL.z,-Math.PI/2);
    screenPanel(.7,.44,statusTex,-1.08,-.04,-.25,Math.PI/2);
    screenPanel(.42,.21,centreTex,-.1,-.4,-.9,0,-.7,true);
    root.userData={status,centre,link,statusTex,centreTex,linkTex,rightPanel};

    const light=new THREE.PointLight(0x9fdfff,1.4,5,1.6);light.position.set(0,.3,.1);g.add(light);
    g.traverse(node=>{if(node.isMesh){node.castShadow=false;node.receiveShadow=false;node.frustumCulled=false;node.renderOrder=2;}});
    return root;
  }

  // ---- display painting -------------------------------------------------------------------------
  function frameBox(ctx,w,h,title){
    ctx.fillStyle='#03111a';ctx.fillRect(0,0,w,h);
    ctx.strokeStyle='#79dcff';ctx.lineWidth=3;ctx.strokeRect(6,6,w-12,h-12);
    ctx.fillStyle='#79dcff';ctx.font='bold 22px Segoe UI, sans-serif';ctx.fillText(title,20,38);
    ctx.fillStyle='rgba(121,220,255,.25)';ctx.fillRect(20,48,w-40,2);
  }
  function drawStatus(canvas,t,info){
    const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height;
    frameBox(ctx,w,h,'ION  ·  SYSTEMS');
    const bars=[['CORE',.55+.1*Math.sin(t*.7)],['SHIELD',.9],['SPEED',Math.min(1,(info.speed||0)/20)],['DASH',.75+.1*Math.sin(t*1.3)]];
    ctx.font='16px Segoe UI, sans-serif';
    bars.forEach(([name,value],i)=>{const y=82+i*46;ctx.fillStyle='#9bd7ee';ctx.fillText(name,20,y);ctx.fillStyle='rgba(121,220,255,.18)';ctx.fillRect(20,y+8,220,12);ctx.fillStyle=i===2?'#ffb066':'#79dcff';ctx.fillRect(20,y+8,220*value,12);});
    const cx=380,cy=190,r=100;
    ctx.strokeStyle='rgba(121,220,255,.5)';ctx.lineWidth=2;
    for(const k of [1,.66,.33]){ctx.beginPath();ctx.arc(cx,cy,r*k,0,Math.PI*2);ctx.stroke();}
    ctx.beginPath();ctx.moveTo(cx-r,cy);ctx.lineTo(cx+r,cy);ctx.moveTo(cx,cy-r);ctx.lineTo(cx,cy+r);ctx.stroke();
    const sweep=t*1.8;ctx.fillStyle='rgba(121,220,255,.3)';ctx.beginPath();ctx.moveTo(cx,cy);ctx.arc(cx,cy,r,sweep-.5,sweep);ctx.closePath();ctx.fill();
    ctx.strokeStyle='#bfeaff';ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(cx+Math.cos(sweep)*r,cy+Math.sin(sweep)*r);ctx.stroke();
    ctx.fillStyle='#ffb066';for(const [a,d] of [[.8,.55],[2.4,.7],[4.1,.4],[5.3,.8]]){ctx.fillRect(cx+Math.cos(a)*r*d-3,cy+Math.sin(a)*r*d-3,6,6);}
    ctx.fillStyle='#79dcff';ctx.fillRect(cx-4,cy-4,8,8);
  }
  function drawCentre(canvas,t,info){
    const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height;
    ctx.clearRect(0,0,w,h);                                   // transparent: just floating readout over the view
    ctx.shadowColor='rgba(0,12,20,.9)';ctx.shadowBlur=8;
    ctx.fillStyle='#79dcff';ctx.font='bold 20px Segoe UI, sans-serif';ctx.fillText('PILOT',20,34);
    ctx.fillStyle='#e8fbff';ctx.font='bold 58px Segoe UI, sans-serif';ctx.fillText(String(Math.round((info.speed||0)*3.6)).padStart(3,'0'),20,112);
    ctx.fillStyle='#79dcff';ctx.font='20px Segoe UI, sans-serif';ctx.fillText('km/h',150,112);
    ctx.fillText('HDG '+String(Math.round(info.heading||0)).padStart(3,'0')+'°',190,60);
    ctx.shadowBlur=0;ctx.fillStyle='rgba(121,220,255,.6)';ctx.fillRect(20,44,w-40,2);
  }
  function drawLink(canvas){
    const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height;
    frameBox(ctx,w,h,'SCREEN LINK');
    ctx.fillStyle='#9bd7ee';ctx.font='20px Segoe UI, sans-serif';
    ctx.fillText('Connecting to',20,120);ctx.fillStyle='#e8fbff';ctx.font='bold 22px Segoe UI, sans-serif';ctx.fillText(url.replace(/^https?:\/\//,''),20,156);
    ctx.fillStyle='#9bd7ee';ctx.font='16px Segoe UI, sans-serif';ctx.fillText('If this stays blank the page refuses to be framed',20,210);ctx.fillText('or the address is unreachable from this device.',20,234);
  }

  // ---- iframe placement -------------------------------------------------------------------------
  const corner=new THREE.Vector3(),centreW=new THREE.Vector3(),normalW=new THREE.Vector3(),toCam=new THREE.Vector3(),viewPoint=new THREE.Vector3(),quat=new THREE.Quaternion();
  function placeIframe(camera){
    if(!iframe)return;
    const pane=group.userData.rightPanel,W=layer.clientWidth,H=layer.clientHeight;
    if(!W||!H){iframe.style.visibility='hidden';return;}
    pane.updateWorldMatrix(true,false);
    const points=[];let visible=true;
    camera.updateMatrixWorld(true);
    for(const [sx,sy] of [[-1,1],[1,1],[1,-1],[-1,-1]]){
      corner.set(sx*PANEL.w/2,sy*PANEL.h/2,0).applyMatrix4(pane.matrixWorld);
      viewPoint.copy(corner).applyMatrix4(camera.matrixWorldInverse);
      if(viewPoint.z>-camera.near*1.5){visible=false;break;}
      corner.project(camera);points.push({x:(corner.x*.5+.5)*W,y:(-corner.y*.5+.5)*H});
    }
    if(visible){
      pane.getWorldPosition(centreW);pane.getWorldQuaternion(quat);normalW.set(0,0,1).applyQuaternion(quat);toCam.copy(camera.position).sub(centreW);
      if(normalW.dot(toCam)<=0)visible=false;
    }
    if(visible){
      const xs=points.map(p=>p.x),ys=points.map(p=>p.y);
      if(Math.max(...xs)<0||Math.min(...xs)>W||Math.max(...ys)<0||Math.min(...ys)>H)visible=false;
    }
    const matrix=visible?homographyMatrix(FRAME_W,FRAME_H,points):null;
    if(!matrix){iframe.style.visibility='hidden';return;}
    iframe.style.visibility='visible';iframe.style.transform=matrix;
  }

  function enter(){
    if(!group){group=build();cabinScene.add(group);}
    ensureFrame();active=true;layer.classList.add('on');
    paintClock=1;drawLink(group.userData.link);group.userData.linkTex.needsUpdate=true;
  }
  function exit(){
    active=false;setInteractive(false);layer.classList.remove('on');
    if(iframe)iframe.style.visibility='hidden';
  }
  function setInteractive(on){
    on=!!on&&active;if(on===interactive)return;
    interactive=on;layer.classList.toggle('use',on);updateHint();
  }
  /** frame = {position, quaternion} of the cockpit space this frame (from applyCockpitCamera). */
  function update(dt,camera,frame,info={}){
    if(!active||!group)return;
    group.position.copy(frame.position);group.quaternion.copy(frame.quaternion);group.updateMatrixWorld(true);
    clock+=dt;paintClock+=dt;
    if(paintClock>.12){
      paintClock=0;const t=clock,d=group.userData;
      drawStatus(d.status,t,info);d.statusTex.needsUpdate=true;
      drawCentre(d.centre,t,info);d.centreTex.needsUpdate=true;
    }
    placeIframe(camera);
  }
  function render(renderer,camera){
    if(!active||!group)return;
    const auto=renderer.autoClear;renderer.autoClear=false;renderer.clearDepth();renderer.render(cabinScene,camera);renderer.autoClear=auto;
  }
  function dispose(){exit();layer.remove();style.remove();}
  return {enter,exit,update,render,setInteractive,toggleInteractive:()=>setInteractive(!interactive),dispose,get active(){return active;},get interactive(){return interactive;},get url(){return url;}};
}
