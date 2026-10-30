// Live multiplayer for the Character Extractor custom loader.
//
// The Start Server button opens a menu. On the computer that runs the 3D Web Apps server it starts a
// session room (session-server.cjs) and shows the tailnet link to send to other players. Anyone who
// opens that link joins the room; everybody sees everyone else's character model and name moving in
// real time. Transport: Server-Sent Events down, small POSTs up (no dependencies, works through
// Tailscale Serve).
import * as THREE from 'three';
import { GLTFLoader } from './vendor/modern/GLTFLoader.js';
import { characters } from './characters.js';
import { environments } from './environments/catalog.js';

const API = '/api/session', NAME_KEY = 'cx-player-name', SEND_MS = 100, DEFAULT_HEIGHT = 1.75;
const enc = encodeURIComponent;
const characterById = id => characters.find(character => character.id === id);
const environmentName = id => environments.find(environment => environment.id === id)?.name || 'another scene';
const store = {
  get(key) { try { return localStorage.getItem(key) || ''; } catch { return ''; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch { /* private mode */ } }
};

async function call(path, { method = 'GET', body, keepalive = false } = {}) {
  const response = await fetch(API + path, {
    method, cache: 'no-store', keepalive,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  let data = null;
  if (response.status !== 204) { try { data = await response.json(); } catch { data = null; } }
  if (!response.ok) {
    const error = new Error(data?.error || 'Request failed (' + response.status + ')');
    error.status = response.status;
    error.noApi = response.status === 404 && !data?.error;
    throw error;
  }
  return data;
}

function disposeTree(root) {
  root.traverse(object => {
    object.geometry?.dispose?.();
    for (const material of object.material ? (Array.isArray(object.material) ? object.material : [object.material]) : []) {
      for (const value of Object.values(material)) if (value?.isTexture) value.dispose();
      material.dispose();
    }
  });
}

function makeTag(name) {
  const canvas = document.createElement('canvas'), ratio = 4;
  canvas.width = 512; canvas.height = 128;
  const context = canvas.getContext('2d');
  context.font = '700 54px system-ui, -apple-system, "Segoe UI", sans-serif';
  const text = name.length > 18 ? name.slice(0, 17) + '…' : name;
  const width = Math.min(500, Math.ceil(context.measureText(text).width) + 56), x = (512 - width) / 2;
  context.fillStyle = 'rgba(10,20,13,.78)'; context.strokeStyle = 'rgba(184,243,152,.9)'; context.lineWidth = 4;
  context.beginPath(); context.roundRect(x, 22, width, 84, 24); context.fill(); context.stroke();
  context.fillStyle = '#eaf7df'; context.textAlign = 'center'; context.textBaseline = 'middle';
  context.fillText(text, 256, 66);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, fog: false }));
  sprite.scale.set(ratio * .4, ratio * .1, 1);
  sprite.renderOrder = 20;
  sprite.name = 'Player name tag';
  return sprite;
}

const STYLE = `
.mp-backdrop{position:fixed;inset:0;z-index:70;display:flex;align-items:center;justify-content:center;padding:max(14px,env(safe-area-inset-top)) max(14px,env(safe-area-inset-right)) max(14px,env(safe-area-inset-bottom)) max(14px,env(safe-area-inset-left));background:rgba(5,10,7,.74);-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px);color:#e1eddb;text-align:left;font-size:16px;line-height:1.45}
.mp-backdrop[hidden]{display:none}
.mp-dialog{width:min(480px,100%);max-height:100%;overflow:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;background:#141f18;border:1px solid #435d40;border-radius:16px;box-shadow:0 24px 70px rgba(0,0,0,.6);touch-action:pan-y}
.mp-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 18px 6px}
.mp-head h2{margin:0;font-size:20px;letter-spacing:.2px}
.mp-close{min-width:48px;min-height:48px;border:1px solid #435d40;border-radius:12px;background:#1f3023;color:#e1eddb;font-size:18px;cursor:pointer}
.mp-body{padding:6px 18px 20px;display:grid;gap:14px}
.mp-dialog label{display:grid;gap:7px;margin:0;font-size:13px;color:#bbceba}
.mp-dialog input{box-sizing:border-box;width:100%;min-height:50px;padding:0 14px;border:1px solid #435d40;border-radius:12px;background:#1f3023;color:#f1f9ea;font:inherit;font-size:16px}
.mp-dialog input:focus-visible,.mp-dialog button:focus-visible{outline:3px solid #b8f398;outline-offset:2px}
.mp-dialog input[readonly]{color:#cfe6c3;text-overflow:ellipsis}
.mp-dialog button{min-height:50px;padding:0 18px;border-radius:12px;border:1px solid #76956a;background:#243d2b;color:#e1eddb;font:inherit;font-size:16px;font-weight:650;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
.mp-dialog button:disabled{opacity:.45;cursor:default}
.mp-dialog button.mp-primary{background:#b8f398;border-color:#b8f398;color:#1d3315}
.mp-dialog button.mp-danger{background:#3a1f1b;border-color:#8c4a40;color:#ffd1c6}
.mp-lead,.mp-note,.mp-warn,.mp-status{margin:0;font-size:14px;color:#a9c0a6}
.mp-warn{padding:11px 13px;border-radius:12px;background:#352c14;border:1px solid #7b6a2d;color:#f2e2a6}
.mp-warn code{display:block;margin-top:6px;padding:8px 10px;border-radius:8px;background:#0e1710;color:#d9efcf;font-size:13px;overflow-wrap:anywhere;user-select:all}
.mp-error{margin:0;padding:11px 13px;border-radius:12px;background:#3a1f1b;border:1px solid #8c4a40;color:#ffd1c6;font-size:14px}
.mp-join{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:end}
.mp-join label{margin:0}
.mp-code{text-transform:uppercase;letter-spacing:3px}
.mp-codebox{display:flex;align-items:baseline;justify-content:space-between;gap:12px;padding:12px 14px;border-radius:12px;background:#0e1710;border:1px solid #2f4530;color:#9db79a;font-size:13px}
.mp-codebox b{font-size:26px;letter-spacing:5px;color:#b8f398;font-variant-numeric:tabular-nums}
.mp-linkrow{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px}
.mp-dialog h3{margin:2px 0 -6px;font-size:12px;letter-spacing:1.4px;text-transform:uppercase;color:#8da387}
.mp-players{list-style:none;margin:0;padding:0;display:grid;gap:8px}
.mp-players li{display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:48px;padding:6px 12px;border-radius:12px;background:#1b2b1f;border:1px solid #2f4530}
.mp-players strong{display:block;font-size:16px;overflow-wrap:anywhere}
.mp-players small{display:block;color:#8da387;font-size:12px}
.mp-badge{flex:none;padding:3px 8px;border-radius:999px;background:#2b4630;color:#b8f398;font-size:11px;font-weight:700;letter-spacing:.6px}
@media(max-width:480px){.mp-backdrop{align-items:flex-end;padding:0}.mp-dialog{width:100%;max-height:92dvh;border-radius:18px 18px 0 0;padding-bottom:env(safe-area-inset-bottom)}.mp-head,.mp-body{padding-left:max(18px,env(safe-area-inset-left));padding-right:max(18px,env(safe-area-inset-right))}}
`;

const TEMPLATE = `
<section class="mp-dialog" role="dialog" aria-modal="true" aria-labelledby="mpTitle">
  <div class="mp-head"><h2 id="mpTitle">Multiplayer</h2><button class="mp-close" type="button" aria-label="Close">✕</button></div>
  <div class="mp-body">
    <label>Your name<input class="mp-name" type="text" maxlength="24" autocomplete="nickname" autocapitalize="words" autocorrect="off" spellcheck="false" enterkeyhint="done" placeholder="Enter a name"></label>
    <div class="mp-idle" style="display:grid;gap:14px">
      <p class="mp-lead"></p>
      <label>Room code — used when you start the server<input class="mp-roomcode" type="text" maxlength="6" value="123456" autocomplete="off" autocapitalize="characters" autocorrect="off" spellcheck="false" inputmode="text"></label>
      <button class="mp-primary mp-start" type="button">Start server</button>
      <button class="mp-quick" type="button">Quick join the running server</button>
      <div class="mp-join">
        <label>Join with a code<input class="mp-code" type="text" maxlength="6" value="123456" autocomplete="off" autocapitalize="characters" autocorrect="off" spellcheck="false" inputmode="text" enterkeyhint="go" placeholder="ABC123"></label>
        <button class="mp-join-go" type="button">Join</button>
      </div>
    </div>
    <div class="mp-live" style="display:grid;gap:14px" hidden>
      <p class="mp-status"></p>
      <div class="mp-codebox"><span>Room code</span><b class="mp-code-text"></b></div>
      <div class="mp-linkblock" style="display:grid;gap:14px">
        <label>Link to send to other players<span class="mp-linkrow"><input class="mp-link" type="text" readonly aria-label="Session link"><button class="mp-copy" type="button">Copy</button></span></label>
        <button class="mp-share" type="button" hidden>Share link…</button>
      </div>
      <p class="mp-warn" hidden></p>
      <p class="mp-note" hidden></p>
      <h3>Players</h3>
      <ul class="mp-players"></ul>
      <button class="mp-leave" type="button"></button>
    </div>
    <p class="mp-error" role="alert" hidden></p>
  </div>
</section>`;

export function createMultiplayer({ viewport, buttons, quickButtons = [], getWorld, getEnvironmentId, getSelectedEnvironmentId, getCharacterId, getPose, normalizeCharacter, loadVehicle, onJoinedEnvironment }) {
  const style = document.createElement('style'); style.textContent = STYLE; document.head.append(style);
  const backdrop = document.createElement('div'); backdrop.className = 'mp-backdrop'; backdrop.hidden = true; backdrop.innerHTML = TEMPLATE;
  viewport.append(backdrop);
  const $ = selector => backdrop.querySelector(selector);
  const ui = {
    name: $('.mp-name'), idle: $('.mp-idle'), live: $('.mp-live'), lead: $('.mp-lead'), start: $('.mp-start'),
    quick: $('.mp-quick'), roomCode: $('.mp-roomcode'), code: $('.mp-code'), codeLabel: $('.mp-join label'), joinGo: $('.mp-join-go'), join: $('.mp-join'), status: $('.mp-status'), codeText: $('.mp-code-text'),
    linkBlock: $('.mp-linkblock'), link: $('.mp-link'), copy: $('.mp-copy'), share: $('.mp-share'), warn: $('.mp-warn'),
    note: $('.mp-note'), players: $('.mp-players'), leave: $('.mp-leave'), error: $('.mp-error'), close: $('.mp-close')
  };
  const state = { joined: false, code: '', pid: '', canHost: null, noApi: false, tailnet: null, roster: [], hostName: '', roomEnv: '', es: null, timer: 0, sending: false, busy: false, recovering: false, invite: '', rosterKey: '' };
  const loader = new GLTFLoader();
  const remotes = new Map();

  // ---- remote avatars ---------------------------------------------------------------------------
  function dropAvatar(entry) {
    if (entry.root) { entry.root.removeFromParent(); disposeTree(entry.root); }
    entry.root = null; entry.tag = null; entry.tagName = '';
  }
  function dropVehicle(entry) {
    if (entry.vroot) { entry.vroot.removeFromParent(); disposeTree(entry.vroot); }
    entry.vroot = null;
  }
  function dropAllAvatars() { for (const entry of remotes.values()) { dropAvatar(entry); dropVehicle(entry); } remotes.clear(); }
  async function loadVehicleFor(entry, world) {
    entry.vloading = true;
    const wanted = entry.vehicle; let holder = null;
    try { holder = await loadVehicle?.(wanted); } catch { holder = null; }
    entry.vloading = false;
    if (!holder) { entry.vfailed = wanted; return; }
    if (remotes.get(entry.id) !== entry || entry.vehicle !== wanted || getWorld() !== world) { disposeTree(holder); return; }
    const box = new THREE.Box3().setFromObject(holder);
    entry.vheight = Number.isFinite(box.max.y - box.min.y) ? box.max.y - box.min.y : 3;
    holder.position.set(entry.vtarget.x, entry.vtarget.y, entry.vtarget.z); holder.rotation.y = entry.vtarget.ry;
    entry.vroot = holder; world.add(holder);
  }
  function glide(node, target, k) {
    if (Math.hypot(target.x - node.position.x, target.z - node.position.z) > 30) node.position.set(target.x, target.y, target.z);
    node.position.x += (target.x - node.position.x) * k; node.position.y += (target.y - node.position.y) * k; node.position.z += (target.z - node.position.z) * k;
    const turn = ((target.ry - node.rotation.y + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    node.rotation.y += turn * k;
  }
  function placeholder(height) {
    const group = new THREE.Group(), body = new THREE.Mesh(new THREE.CylinderGeometry(.24, .24, height, 18), new THREE.MeshStandardMaterial({ color: 0x6aa0ff, roughness: .6 }));
    body.position.y = height / 2; group.add(body); return group;
  }
  function applyTag(entry) {
    if (entry.tagName === entry.name) return;
    entry.tag?.removeFromParent(); if (entry.tag) disposeTree(entry.tag);
    entry.tag = makeTag(entry.name); entry.tag.position.y = entry.height + .32; entry.root.add(entry.tag); entry.tagName = entry.name;
  }
  async function loadAvatar(entry, world) {
    entry.loading = true;
    const wanted = entry.character, character = characterById(wanted), height = character?.height || DEFAULT_HEIGHT;
    let model;
    try {
      if (!character) throw new Error('Unknown character');
      const gltf = await loader.loadAsync(character.animationModel || character.model);
      model = normalizeCharacter(gltf.scene, height);
    } catch { model = placeholder(height); }
    entry.loading = false;
    if (remotes.get(entry.id) !== entry || entry.character !== wanted || getWorld() !== world) { disposeTree(model); return; }
    const root = new THREE.Group(); root.name = 'Player ' + entry.name; root.add(model);
    entry.root = root; entry.height = height; entry.tagName = '';
    applyTag(entry);
    root.position.set(entry.target.x, entry.target.y, entry.target.z); root.rotation.y = entry.target.ry;
    world.add(root);
  }
  function applyRoster() {
    const live = new Set();
    for (const player of state.roster) {
      if (player.id === state.pid) continue;
      live.add(player.id);
      let entry = remotes.get(player.id);
      if (!entry) { entry = { id: player.id, name: player.name, character: player.character, env: player.env, target: { x: 0, y: 0, z: 0, ry: 0 }, root: null, tag: null, tagName: '', loading: false, height: DEFAULT_HEIGHT, vehicle: '', vtarget: { x: 0, y: 0, z: 0, ry: 0 }, vroot: null, vloading: false, vfailed: '', vheight: 3 }; remotes.set(player.id, entry); }
      if (entry.character !== player.character) { dropAvatar(entry); entry.character = player.character; }
      if (entry.vehicle !== (player.vehicle || '')) { dropVehicle(entry); entry.vehicle = player.vehicle || ''; entry.vfailed = ''; }
      entry.vtarget.x = player.vx || 0; entry.vtarget.y = player.vy || 0; entry.vtarget.z = player.vz || 0; entry.vtarget.ry = player.vry || 0;
      entry.name = player.name; entry.env = player.env; entry.driving = player.driving;
      entry.target.x = player.x; entry.target.y = player.y; entry.target.z = player.z; entry.target.ry = player.ry;
    }
    for (const [id, entry] of remotes) if (!live.has(id)) { dropAvatar(entry); dropVehicle(entry); remotes.delete(id); }
  }
  function update(dt) {
    const world = getWorld(), environmentId = getEnvironmentId(), k = 1 - Math.exp(-12 * Math.min(dt, .1));
    for (const entry of remotes.values()) {
      const show = !!world && !!entry.env && entry.env === environmentId;
      if (!show) { if (entry.root) dropAvatar(entry); if (entry.vroot) dropVehicle(entry); continue; }
      if (entry.vroot && entry.vroot.parent !== world) dropVehicle(entry);
      if (entry.vehicle && !entry.vroot && !entry.vloading && entry.vfailed !== entry.vehicle) loadVehicleFor(entry, world);
      if (entry.vroot) glide(entry.vroot, entry.vtarget, k);
      if (entry.root && entry.root.parent !== world) dropAvatar(entry);
      if (!entry.root) { if (!entry.loading) loadAvatar(entry, world); continue; }
      const root = entry.root, inVehicle = !!entry.driving && !!entry.vroot;
      glide(root, entry.target, k);
      applyTag(entry);
      root.children[0].visible = !inVehicle;          // the pilot is inside the vehicle
      if (entry.tag) entry.tag.position.y = (inVehicle ? entry.vheight : entry.height) + .32;
    }
  }

  // ---- session --------------------------------------------------------------------------------
  const playerName = () => ui.name.value.trim().replace(/\s+/g, ' ');
  function showError(message) { ui.error.hidden = !message; ui.error.textContent = message || ''; }
  function describe(error) {
    if (error?.noApi) return 'This server does not have the session feature yet. Close the 3D Web Apps server window, run start-local.cmd again, then reload this page.';
    if (error?.status === 403) return 'Only the computer that runs the server can start or stop it. Open http://127.0.0.1:' + (location.port || 80) + ' on that computer.';
    if (error instanceof TypeError) return 'Could not reach the server. Check the connection and try again.';
    return error?.message || 'Something went wrong.';
  }
  function localState() {
    const pose = getWorld() ? getPose() : null;
    return { name: playerName() || 'Player', character: getCharacterId() || '', env: pose ? getEnvironmentId() : '', x: pose?.x ?? 0, y: pose?.y ?? 0, z: pose?.z ?? 0, ry: pose?.ry ?? 0, driving: !!pose?.driving, vehicle: pose?.vehicle || '', vx: pose?.vx ?? 0, vy: pose?.vy ?? 0, vz: pose?.vz ?? 0, vry: pose?.vry ?? 0 };
  }
  async function sendPose() {
    if (!state.joined || state.sending) return;
    state.sending = true;
    try { await call('/update', { method: 'POST', body: { code: state.code, pid: state.pid, state: localState() }, keepalive: true }); }
    catch (error) { if (error.status === 404) recover(); }
    finally { state.sending = false; }
  }
  function closeEvents() { if (state.es) { state.es.close(); state.es = null; } }
  function connectEvents() {
    closeEvents();
    const es = new EventSource(API + '/events?code=' + enc(state.code) + '&pid=' + enc(state.pid));
    state.es = es;
    es.addEventListener('state', event => {
      let data; try { data = JSON.parse(event.data); } catch { return; }
      state.roster = data.players || []; state.hostName = data.hostName || ''; state.roomEnv = data.environment || '';
      applyRoster(); render();
    });
    es.addEventListener('closed', () => endSession('The host stopped the server.'));
    es.onerror = () => { if (state.es === es && es.readyState === EventSource.CLOSED) recover(); };
  }
  async function enter(code) {
    const joined = await call('/join', { method: 'POST', body: { code, name: playerName(), character: getCharacterId() || '', environment: getWorld() ? getEnvironmentId() : '' } });
    state.joined = true; state.code = code; state.pid = joined.pid; state.roomEnv = joined.environment || ''; state.invite = '';
    clearInterval(state.timer); state.timer = setInterval(sendPose, SEND_MS);
    connectEvents(); render();
    if (joined.environment) onJoinedEnvironment?.(joined.environment);
  }
  async function recover() {
    if (state.recovering || !state.joined) return;
    state.recovering = true; closeEvents(); showNote('Connection lost. Reconnecting…');
    try {
      for (let attempt = 0; attempt < 5 && state.joined; attempt++) {
        try {
          const info = await call('?code=' + enc(state.code));
          if (!info.active || (info.code && info.code !== state.code)) { endSession('The session is no longer running.'); return; }
          await enter(state.code); showNote(''); return;
        } catch (error) { if (error.status === 404 || error.noApi) { endSession('The session is no longer running.'); return; } }
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      endSession('Connection lost.');
    } finally { state.recovering = false; }
  }
  function endSession(message) {
    clearInterval(state.timer); closeEvents();
    state.joined = false; state.code = ''; state.pid = ''; state.roster = []; state.roomEnv = ''; state.rosterKey = '';
    dropAllAvatars(); render(); showError(message || '');
  }
  async function refreshStatus() {
    try {
      const info = await call(state.invite ? '?code=' + enc(state.invite) : '');
      state.noApi = false; state.canHost = !!info.host; state.tailnet = info.tailnet || null;
      return info;
    } catch (error) { state.noApi = !!error.noApi; state.canHost = error.noApi ? false : state.canHost; return null; }
  }
  async function begin(action) {
    if (state.busy) return;
    showError('');
    if (!playerName()) { showError('Enter a name first.'); ui.name.focus(); return; }
    store.set(NAME_KEY, playerName());
    state.busy = true; render();
    try { await action(); } catch (error) { showError(describe(error)); } finally { state.busy = false; render(); }
  }
  const startServer = () => begin(async () => {
    const roomCode = String(ui.roomCode.value || '').trim().toUpperCase();
    if (roomCode && !/^[A-Z0-9]{6}$/.test(roomCode)) throw new Error('Room codes are 6 letters or numbers — or clear the field to use 123456.');
    const info = await call('/start', { method: 'POST', body: { name: playerName(), environment: getEnvironmentId() || getSelectedEnvironmentId() || '', code: roomCode } });
    state.canHost = true; state.tailnet = info.tailnet || null;
    await enter(info.code);
  });
  const joinCode = code => begin(async () => {
    code = String(code || '').trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(code)) throw new Error('Enter the 6-character room code.');
    await enter(code);
    close();
  });
  // Quick Join: find the session running on this server (no link or code needed) and join it.
  const quickJoin = () => begin(async () => {
    const info = await call('?discover=1');
    if (!info.active || !info.code) throw new Error('No session is running right now. Ask the host to press Start Server.');
    await enter(info.code);
    close();
  });
  async function quickPress() {
    if (state.joined || state.busy) return;
    if (!playerName() && !ui.name.value) ui.name.value = store.get(NAME_KEY);
    if (playerName()) { backdrop.hidden = false; await quickJoin(); if (!state.joined) render(); else backdrop.hidden = true; return; }
    await open(); showError('Enter your name, then press Quick join.'); ui.name.focus();
  }
  async function leave() {
    if (state.busy) return;
    const host = state.canHost; state.busy = true; render();
    try {
      if (host) { await call('/stop', { method: 'POST', body: {} }); }
      else await call('/leave', { method: 'POST', body: { code: state.code, pid: state.pid } });
    } catch (error) { if (host) showError(describe(error)); }
    state.busy = false;
    endSession('');
  }

  // ---- dialog ---------------------------------------------------------------------------------
  function sessionLink() {
    if (!state.canHost || !state.tailnet?.url || !state.code) return '';
    const url = new URL(state.tailnet.url + location.pathname);
    if (state.roomEnv) url.searchParams.set('environment', state.roomEnv);
    url.searchParams.set('join', state.code);
    return url.toString();
  }
  function showNote(message) { ui.note.hidden = !message; ui.note.textContent = message || ''; }
  function renderPlayers() {
    const key = state.roster.map(p => [p.id, p.name, p.character, p.env, p.host].join('|')).join(';') + '#' + state.pid;
    if (key === state.rosterKey) return;
    state.rosterKey = key; ui.players.replaceChildren();
    for (const player of state.roster) {
      const item = document.createElement('li'), text = document.createElement('span'), name = document.createElement('strong'), meta = document.createElement('small');
      name.textContent = player.name; meta.textContent = [characterById(player.character)?.name || 'No character yet', player.env ? environmentName(player.env) : 'Not loaded'].join(' · ');
      text.append(name, meta); item.append(text);
      const badges = [player.id === state.pid ? 'YOU' : '', player.host ? 'HOST' : ''].filter(Boolean), tags = document.createElement('span');
      tags.style.cssText = 'display:flex;gap:6px;flex:none';
      for (const label of badges) { const badge = document.createElement('span'); badge.className = 'mp-badge'; badge.textContent = label; tags.append(badge); }
      if (badges.length) item.append(tags);
      ui.players.append(item);
    }
  }
  function render() {
    const hosting = state.joined && state.canHost, count = state.roster.length || (state.joined ? 1 : 0);
    for (const button of quickButtons) button.hidden = state.joined;
    for (const button of buttons) button.textContent = state.joined ? (hosting ? 'Server: ' : 'Joined: ') + state.code + ' · ' + count : 'Start Server';
    ui.idle.hidden = state.joined; ui.live.hidden = !state.joined;
    ui.idle.style.display = state.joined ? 'none' : 'grid'; ui.live.style.display = state.joined ? 'grid' : 'none';
    ui.name.disabled = state.busy;
    if (!state.joined) {
      const invited = !!state.invite;
      ui.start.hidden = invited || state.canHost === false;
      ui.start.disabled = state.busy; ui.start.textContent = state.busy ? 'Starting…' : 'Start server';
      ui.join.hidden = false; ui.join.style.gridTemplateColumns = invited ? '1fr' : ''; ui.codeLabel.hidden = invited; ui.joinGo.disabled = state.busy; ui.joinGo.textContent = invited ? 'Join session' : 'Join';
      ui.code.disabled = state.busy; ui.quick.hidden = invited || state.noApi; ui.quick.disabled = state.busy;
      ui.lead.textContent = invited
        ? 'You have been invited to a live session. Enter your name and join to see the other players.'
        : state.noApi
          ? 'This server does not have the session feature yet. Close the 3D Web Apps server window, run start-local.cmd again, then reload this page.'
          : state.canHost === false
            ? 'A server can only be started from the computer that runs this app (open http://127.0.0.1:' + (location.port || 80) + ' there). To join a session, open the link you were sent or enter its code.'
            : 'Starts a live session on this computer and gives you a link for other players on your Tailscale network. Everyone who opens it shares one room and sees each other’s characters.';
      return;
    }
    ui.codeText.textContent = state.code;
    ui.status.textContent = hosting ? 'Server running on this computer · ' + count + (count === 1 ? ' player' : ' players') : 'Connected to ' + (state.hostName || 'the host') + '’s session · ' + count + (count === 1 ? ' player' : ' players');
    const link = sessionLink();
    ui.linkBlock.hidden = !hosting; ui.linkBlock.style.display = hosting ? 'grid' : 'none';
    if (ui.link.value !== link) ui.link.value = link;
    ui.copy.disabled = !link; ui.share.hidden = !(link && navigator.share);
    const tailnet = state.tailnet; let warning = '', command = '';
    if (hosting && tailnet && !tailnet.available) warning = 'Tailscale could not be found or is not signed in on this computer, so there is no tailnet link yet. ' + (tailnet.reason || '');
    else if (hosting && tailnet && tailnet.serving === false) { warning = 'Tailscale Serve is not publishing this app yet, so the link will not open for other players. Run this once in a terminal on this computer:'; command = 'tailscale serve --bg http://127.0.0.1:' + (location.port || 80); }
    ui.warn.hidden = !warning; ui.warn.replaceChildren(document.createTextNode(warning));
    if (command) { const code = document.createElement('code'); code.textContent = command; ui.warn.append(code); }
    const there = state.roomEnv && getWorld() && getEnvironmentId() !== state.roomEnv;
    if (!state.recovering) showNote(there ? 'The session is in “' + environmentName(state.roomEnv) + '”. Choose that environment and press Load to see the other players.' : '');
    renderPlayers();
    ui.leave.className = hosting ? 'mp-danger mp-leave' : 'mp-leave'; ui.leave.disabled = state.busy;
    ui.leave.textContent = hosting ? 'Stop server' : 'Leave session';
  }
  async function open() {
    backdrop.hidden = false; showError('');
    if (!ui.name.value) ui.name.value = store.get(NAME_KEY);
    render();
    if (!state.joined) { await refreshStatus(); render(); }
    if (!ui.name.value) ui.name.focus(); else if (!state.joined) (state.invite ? ui.joinGo : ui.start.hidden ? ui.code : ui.start).focus();
  }
  function close() { backdrop.hidden = true; }
  backdrop.addEventListener('keydown', event => {
    event.stopPropagation();   // typing a name must not move the player
    if (event.key === 'Escape') { event.preventDefault(); close(); }
    else if (event.key === 'Enter' && event.target === ui.code) { event.preventDefault(); joinCode(ui.code.value); }
    else if (event.key === 'Enter' && event.target === ui.name) { event.preventDefault(); ui.name.blur(); }
  });
  backdrop.addEventListener('pointerdown', event => { event.stopPropagation(); if (event.target === backdrop) close(); });
  backdrop.addEventListener('wheel', event => event.stopPropagation(), { passive: true });
  ui.close.onclick = close;
  ui.start.onclick = startServer;
  ui.quick.onclick = quickJoin;
  ui.joinGo.onclick = () => joinCode(state.invite || ui.code.value);
  ui.leave.onclick = leave;
  ui.code.oninput = () => { ui.code.value = ui.code.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); };
  ui.name.onchange = () => { if (playerName()) store.set(NAME_KEY, playerName()); if (state.joined) sendPose(); };
  ui.copy.onclick = async () => {
    const text = ui.link.value; if (!text) return;
    let ok = false;
    try { await navigator.clipboard.writeText(text); ok = true; } catch { ui.link.focus(); ui.link.select(); try { ok = document.execCommand('copy'); } catch { ok = false; } }
    ui.copy.textContent = ok ? 'Copied' : 'Press Ctrl+C';
    setTimeout(() => { ui.copy.textContent = 'Copy'; }, 1800);
  };
  ui.share.onclick = async () => { try { await navigator.share({ title: 'Join my live session', text: (playerName() || 'A friend') + ' invited you to a live Character Extractor session.', url: ui.link.value }); } catch { /* cancelled */ } };
  ui.link.onfocus = () => ui.link.select();
  for (const button of buttons) button.onclick = open;
  for (const button of quickButtons) button.onclick = quickPress;
  window.addEventListener('pagehide', () => {
    if (!state.joined) return;
    try { navigator.sendBeacon(API + '/leave', new Blob([JSON.stringify({ code: state.code, pid: state.pid })], { type: 'application/json' })); } catch { /* best effort */ }
  });
  render();

  // On load: rejoin a server this computer is already hosting, or join through an invite link.
  (async function init() {
    ui.name.value = store.get(NAME_KEY);
    const invite = (new URLSearchParams(location.search).get('join') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    if (invite.length === 6) {
      state.invite = invite; ui.code.value = invite;
      const info = await refreshStatus();
      if (!info?.active) { state.invite = ''; render(); await open(); showError('That session is not running any more. Ask the host for a new link.'); return; }
      if (playerName()) { try { await enter(invite); return; } catch (error) { state.invite = invite; render(); await open(); showError(describe(error)); return; } }
      render(); await open(); return;
    }
    const info = await refreshStatus();
    if (info?.active && info.host && info.code && playerName()) { try { await enter(info.code); } catch { /* shows as not joined */ } }
    render();
  })();

  return { update, open, close, get joined() { return state.joined; } };
}
