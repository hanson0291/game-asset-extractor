/* Blender-authored layouts, animated with the lab's bundled Three r85. */
(function () {
  'use strict';
  const section = document.createElement('section');
  section.style.cssText = 'margin-top:12px;border-top:1px solid #477653;padding-top:10px;display:grid;gap:8px';
  section.innerHTML = '<label for="environment-kind" class="label">ENVIRONMENT EVENT</label>' +
    '<select id="environment-kind" style="width:100%;padding:10px;background:#153520;color:#effff3;border:1px solid #477653;border-radius:10px;font:inherit;font-size:12px">' +
    '<option value="rocks">Rockfall · scattered boulders</option><option value="forest">Forest bloom · clustered trees</option><option value="course">Obstacle wave · hopping course</option>' +
    '<option value="daynight">Day &amp; night · instant sky cycle</option>' +
    '<option value="daynight-manual">Day &amp; night · manual sun slider</option></select>' +
    // Its own rule rather than the panel's .row class: .row is display:none in the
    // mobile layout, and an inline display would outrank the [hidden] attribute.
    '<style>#sun-row{display:flex;align-items:center;gap:9px}#sun-row[hidden]{display:none}</style>' +
    '<div id="sun-row" hidden><span style="font-size:11px;color:#a9c6b0;white-space:nowrap">Sun</span>' +
    '<input id="sun-time" aria-label="Time of day" type="range" min="0" max="24" step=".25" value="12" style="accent-color:#89f3ac;flex:1;min-width:0">' +
    '<output id="sun-output" style="font-size:11px;color:#a9c6b0;white-space:nowrap">12:00 · midday</output></div>' +
    '<button id="environment-trigger" disabled>TRIGGER ENVIRONMENT</button><button id="environment-clear" disabled>Clear environment</button>' +
    '<small id="environment-status" role="status" aria-live="polite">Environment events need the 3D view.</small>';
  document.getElementById('panel').appendChild(section);
  const trigger = section.querySelector('#environment-trigger');
  const clear = section.querySelector('#environment-clear');
  const select = section.querySelector('select');
  const status = section.querySelector('#environment-status');
  const sunRow = section.querySelector('#sun-row');
  const sunSlider = section.querySelector('#sun-time');
  const sunOutput = section.querySelector('#sun-output');
  window.EnvironmentEvents = { attach(scene, rig) {
    const root = new THREE.Group(); root.name = 'Procedural environment'; scene.add(root);
    const materials = {}, geometries = {};
    const geometry = type => geometries[type] || (geometries[type] = type === 'rock' ? new THREE.IcosahedronGeometry(1,0) : type === 'crown' ? new THREE.ConeGeometry(1,2,7) : type === 'trunk' ? new THREE.CylinderGeometry(1,1,2,7) : type === 'orb' ? new THREE.SphereGeometry(1,20,14) : new THREE.BoxGeometry(2,2,2));
    let layouts, items = [], start = 0, serial = 0;

    // The day/night event is lighting rather than geometry, so it has no
    // drop-in animation: the sky, the fog and the preview rig's lights are
    // rewritten on the frame it fires and then keep turning.
    const CYCLE = 24000;                                  // ms for one full day
    const DAY_SKY = new THREE.Color(0x8fc9ff), NIGHT_SKY = new THREE.Color(0x050b16);
    const DAY_LIGHT = new THREE.Color(0xfff4ea), NIGHT_LIGHT = new THREE.Color(0x93b6ff);
    const skyTint = new THREE.Color(), lightTint = new THREE.Color();
    const lights = []; scene.traverse(object => { if(object.isLight) lights.push({light:object,color:object.color.clone(),intensity:object.intensity,position:object.position.clone()}); });
    const keyLight = lights.filter(entry => entry.light.isDirectionalLight)[0];
    const baseline = {background: scene.background && scene.background.clone(), fog: scene.fog && scene.fog.color.clone()};
    let cycling = false, manual = false, orbs = null;
    function makeOrb(color, radius) {
      const mesh = new THREE.Mesh(geometry('orb'), new THREE.MeshBasicMaterial({color}));
      mesh.scale.setScalar(radius); root.add(mesh); return mesh;
    }
    function startCycle() {
      orbs = {sun: makeOrb(0xffe6a8,.9), moon: makeOrb(0xdfe9ff,.55)};
      cycling = true;
      applyCycle(start);                                  // in place before the first frame
    }
    // Same sky, driven by the slider instead of the clock: the row appears when
    // the event is triggered, so the control only exists while it does something.
    function startManual() {
      orbs = {sun: makeOrb(0xffe6a8,.9), moon: makeOrb(0xdfe9ff,.55)};
      manual = true; sunRow.hidden = false;
      scrub();
    }
    function applyCycle(now) { applySky(((now-start)%CYCLE)/CYCLE); }
    // The slider reads in clock hours; phase 0 is sunrise, so 06:00 lands there.
    const phaseFromHour = hour => (((hour-6)/24)%1+1)%1;
    const clockLabel = hour => {
      const h = ((hour%24)+24)%24, name = h<5||h>=20 ? 'night' : h<8 ? 'dawn' : h<17 ? 'midday' : 'dusk';
      return String(Math.floor(h)).padStart(2,'0')+':'+String(Math.round(h%1*60)).padStart(2,'0')+' · '+name;
    };
    function scrub() {
      sunOutput.value = clockLabel(+sunSlider.value);
      if(manual) applySky(phaseFromHour(+sunSlider.value));
    }
    sunSlider.oninput = scrub;
    function applySky(phase) {
      const angle = phase*Math.PI*2;
      const day = Math.max(0,Math.min(1,Math.sin(angle)*2.2+.5));
      skyTint.copy(NIGHT_SKY).lerp(DAY_SKY,day);
      lightTint.copy(NIGHT_LIGHT).lerp(DAY_LIGHT,day);
      if(scene.background && scene.background.isColor) scene.background.copy(skyTint); else scene.background = skyTint.clone();
      if(scene.fog) scene.fog.color.copy(skyTint);
      for(const entry of lights) {
        entry.light.color.copy(lightTint);
        entry.light.intensity = entry.intensity * (entry.light.isAmbientLight ? THREE.Math.lerp(.34,1,day) : THREE.Math.lerp(.22,1.1,day));
      }
      // Sun and moon ride opposite ends of the same arc; the key light follows
      // whichever one is up, always from above so the fur never lights bottom-up.
      if(keyLight) keyLight.light.position.set(Math.cos(angle)*5,Math.abs(Math.sin(angle))*5+.8,4);
      if(orbs) {
        orbs.sun.position.set(Math.cos(angle)*13,Math.sin(angle)*9+1.5,-6);
        orbs.moon.position.set(-Math.cos(angle)*13,-Math.sin(angle)*9+1.5,-6);
      }
    }
    function restoreSky() {
      cycling = false; manual = false; orbs = null; sunRow.hidden = true;
      for(const entry of lights) { entry.light.color.copy(entry.color); entry.light.intensity = entry.intensity; entry.light.position.copy(entry.position); }
      if(baseline.background) { if(scene.background && scene.background.isColor) scene.background.copy(baseline.background); else scene.background = baseline.background.clone(); }
      if(scene.fog && baseline.fog) scene.fog.color.copy(baseline.fog);
    }

    const empty = () => { while(root.children.length) root.remove(root.children[0]); items = []; if(cycling||manual) restoreSky(); };
    clear.onclick = () => { empty(); status.textContent = 'Environment cleared.'; };
    function fire(kind) {
      if(kind.indexOf('daynight') !== 0 && (!layouts || !layouts[kind])) return;
      empty(); serial++;
      const angle = Math.random()*Math.PI*2, cos = Math.cos(angle), sin = Math.sin(angle);
      root.position.set(rig.position.x,0,rig.position.z);
      start = performance.now();
      root.userData.kind = kind;
      if(kind === 'daynight') startCycle();
      else if(kind === 'daynight-manual') startManual();
      else {
        for(const spec of layouts[kind]) {
          const material = materials[spec.color] || (materials[spec.color] = new THREE.MeshStandardMaterial({color:spec.color,roughness:1,shading:THREE.FlatShading}));
          const mesh = new THREE.Mesh(geometry(spec.type),material);
          const [x,y,z] = spec.position;
          mesh.position.set(x*cos+z*sin,y,-x*sin+z*cos);
          mesh.rotation.y = spec.rotation + angle;
          mesh.scale.fromArray(spec.scale);
          root.add(mesh);
          items.push({mesh,y,scale:mesh.scale.clone(),delay:Math.sqrt(x*x+z*z)*.06});
        }
        update(start);
      }
      status.textContent = select.options[select.selectedIndex].text + ' · event '+serial;
      window.dispatchEvent(new CustomEvent('bunny-environment-trigger',{detail:{kind,iteration:serial}}));
    }
    function update(now) {
      if(cycling) applyCycle(now);
      for(const item of items) {
        const t = Math.max(0,Math.min(1,(now-start)/1000-item.delay));
        if(root.userData.kind === 'rocks') item.mesh.position.y = item.y + 7*(1-t)*(1-t);
        else if(root.userData.kind === 'forest') { const s = Math.max(.001,1-Math.pow(1-t,3)); item.mesh.scale.copy(item.scale).multiplyScalar(s); item.mesh.position.y=item.y*s; }
        else item.mesh.position.y = item.y - 2*Math.pow(1-t,3);
      }
    }
    trigger.onclick = () => fire(select.value);
    fetch('./environments/layouts.json').then(r => { if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); }).then(data => {
      layouts=data; trigger.disabled=false; clear.disabled=false; status.textContent='Choose an event, then trigger. Each replaces the previous layout.';
    }).catch(error => { status.textContent='Could not load environments. Reload to retry.'; console.error(error); });
    function frame(now) { update(now); requestAnimationFrame(frame); } requestAnimationFrame(frame);
    return {root,fire,clear:empty,update};
  }};
})();
