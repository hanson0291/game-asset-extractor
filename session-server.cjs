'use strict';
// Live multiplayer rooms for the 3D Web Apps server (no dependencies).
//
//   GET  /api/session                 host: status + tailnet link info.  guest: ?code=XXXXXX for room info
//   POST /api/session/start           host only. {name, environment, code?} -> opens the room under the
//                                     requested code when it is a valid 6-character code, else the default
//   POST /api/session/stop            host only. closes the room
//   POST /api/session/join            {code, name, character, environment} -> {pid}
//   GET  /api/session/events          ?code=&pid=  Server-Sent Events stream of every player's pose
//   POST /api/session/update          {code, pid, state:{name,character,env,x,y,z,ry,driving}}
//   POST /api/session/leave           {code, pid}
//
// Only requests made on this computer (loopback Host, no proxy headers) may start or stop the room, so
// players arriving through Tailscale Serve can join but cannot control the server. The room code in the
// link is the shared secret; Tailscale membership is the outer gate.
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');

const DEFAULT_ROOM_CODE = '123456';
const MAX_PLAYERS = 16, STALE_MS = 15000, TICK_MS = 100, KEEPALIVE_MS = 15000;
let room = null;

const send = (res, code, value) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
const num = (value, fallback = 0) => Number.isFinite(Number(value)) ? Math.max(-1e5, Math.min(1e5, Number(value))) : fallback;
const id = (value) => typeof value === 'string' && /^[A-Za-z0-9._-]{1,80}$/.test(value) ? value : '';
const cleanName = (value) => String(value ?? '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 24) || 'Player';

function isHostRequest(req) {
  const host = String(req.headers.host || '').toLowerCase();
  const loopbackHost = /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(host);
  const loopbackSocket = /^(::1|127\.0\.0\.1|::ffff:127\.0\.0\.1)$/.test(req.socket.remoteAddress || '');
  const proxied = req.headers['x-forwarded-for'] || req.headers['x-forwarded-host'] || req.headers['tailscale-user-login'];
  return loopbackHost && loopbackSocket && !proxied;
}

function readJson(req, res, limit, done) {
  if (!String(req.headers['content-type'] || '').startsWith('application/json')) { send(res, 415, { error: 'Send JSON' }); return; }
  let body = '', tooLarge = false;
  req.on('data', chunk => { if (tooLarge) return; body += chunk; if (Buffer.byteLength(body) > limit) { tooLarge = true; send(res, 413, { error: 'Request too large' }); } });
  req.on('end', () => {
    if (tooLarge) return;
    let value; try { value = JSON.parse(body || '{}'); } catch { send(res, 400, { error: 'Invalid JSON' }); return; }
    done(value && typeof value === 'object' ? value : {});
  });
}

// ---- Tailscale: find this machine's tailnet name and whether Serve is publishing the app --------------
function runTailscale(args, done) {
  const candidates = ['tailscale', 'C:\\Program Files\\Tailscale\\tailscale.exe', 'C:\\Program Files (x86)\\Tailscale\\tailscale.exe'];
  const attempt = index => {
    if (index >= candidates.length) { done(new Error('The tailscale command was not found.')); return; }
    execFile(candidates[index], args, { timeout: 6000, windowsHide: true, maxBuffer: 4 * 1024 * 1024 }, (error, stdout) => {
      if (error && error.code === 'ENOENT') attempt(index + 1); else if (error) done(error); else done(null, stdout);
    });
  };
  attempt(0);
}
let tailnetCache = null;
function tailnetInfo(done) {
  if (tailnetCache && Date.now() - tailnetCache.at < 20000) { done(tailnetCache.value); return; }
  const finish = value => { tailnetCache = { at: Date.now(), value }; done(value); };
  runTailscale(['status', '--json'], (error, stdout) => {
    if (error) { finish({ available: false, reason: error.message }); return; }
    let value;
    try {
      const status = JSON.parse(stdout), self = status.Self || {}, dnsName = String(self.DNSName || '').replace(/\.$/, '');
      value = { available: !!dnsName, backendState: status.BackendState || '', dnsName, ips: self.TailscaleIPs || [], url: dnsName ? 'https://' + dnsName : null, serving: null };
      if (!dnsName) value.reason = 'Tailscale is not signed in on this computer.';
    } catch { finish({ available: false, reason: 'Tailscale returned unreadable status.' }); return; }
    if (!value.available) { finish(value); return; }
    runTailscale(['serve', 'status', '--json'], (serveError, serveOut) => {
      if (!serveError) { try { const serve = JSON.parse(serveOut || '{}'); value.serving = !!(serve.Web && Object.keys(serve.Web).length); } catch { /* leave unknown */ } }
      finish(value);
    });
  });
}

// ---- room --------------------------------------------------------------------------------------------
// Rooms always open under the default code, so the host and every guest already know it;
// the join field in the app is prefilled with the same code.
function roster() {
  return [...room.players.values()].map(p => ({ id: p.id, name: p.name, character: p.character, env: p.env, x: p.x, y: p.y, z: p.z, ry: p.ry, driving: p.driving, vehicle: p.vehicle, vx: p.vx, vy: p.vy, vz: p.vz, vry: p.vry, host: p.host }));
}
function pushState(extra) {
  if (!room) return;
  const payload = 'event: state\ndata: ' + JSON.stringify({ t: Date.now(), hostName: room.hostName, environment: room.environment, players: roster(), ...extra }) + '\n\n';
  for (const client of room.clients.values()) { try { client.write(payload); } catch { /* closed */ } }
  room.dirty = false; room.lastPush = Date.now();
}
function tick() {
  if (!room) return;
  const now = Date.now();
  for (const [pid, player] of room.players) {
    if (now - player.seen > STALE_MS) { room.players.delete(pid); room.clients.get(pid)?.end(); room.clients.delete(pid); room.dirty = true; }
  }
  if (room.dirty || now - room.lastPush > 2000) pushState();
  if (now - room.lastKeepalive > KEEPALIVE_MS) { room.lastKeepalive = now; for (const client of room.clients.values()) { try { client.write(': keepalive\n\n'); } catch { /* closed */ } } }
}
function openRoom(hostName, environment, requestedCode) {
  const custom = String(requestedCode || '').trim().toUpperCase();
  const code = /^[A-Z0-9]{6}$/.test(custom) ? custom : DEFAULT_ROOM_CODE;
  room = { code, createdAt: Date.now(), hostName: cleanName(hostName), environment: id(environment), players: new Map(), clients: new Map(), dirty: true, lastPush: 0, lastKeepalive: Date.now() };
  room.timer = setInterval(tick, TICK_MS);
  console.log('[session] opened room ' + room.code);
}
function closeRoom() {
  if (!room) return;
  clearInterval(room.timer);
  for (const client of room.clients.values()) { try { client.write('event: closed\ndata: {}\n\n'); client.end(); } catch { /* closed */ } }
  console.log('[session] closed room ' + room.code);
  room = null;
}
const publicInfo = () => ({ active: true, hostName: room.hostName, environment: room.environment, players: room.players.size });

function handle(req, res, pathname) {
  if (pathname !== '/api/session' && !pathname.startsWith('/api/session/')) return false;
  const url = new URL(req.url, 'http://localhost'), route = pathname.slice('/api/session'.length).replace(/\/$/, '') || '/';
  const host = isHostRequest(req);

  if (route === '/' && req.method === 'GET') {
    const code = url.searchParams.get('code');
    if (url.searchParams.get('discover')) { send(res, 200, room ? { ...publicInfo(), code: room.code } : { active: false }); return true; }
    if (!host) { if (room && code && code === room.code) send(res, 200, publicInfo()); else send(res, 200, { active: false }); return true; }
    tailnetInfo(tailnet => send(res, 200, room ? { ...publicInfo(), host: true, code: room.code, players: roster(), tailnet } : { active: false, host: true, tailnet }));
    return true;
  }
  if (req.method === 'GET' && route === '/events') {
    const code = url.searchParams.get('code'), pid = url.searchParams.get('pid');
    if (!room || code !== room.code || !room.players.has(pid)) { send(res, 404, { error: 'No such session' }); return true; }
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.write('retry: 2000\n\n');
    room.clients.get(pid)?.end();
    room.clients.set(pid, res);
    room.players.get(pid).seen = Date.now();
    const mine = room; req.on('close', () => { if (mine.clients.get(pid) === res) mine.clients.delete(pid); });
    pushState();
    return true;
  }
  if (req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); send(res, 405, { error: 'Method not allowed' }); return true; }

  if (route === '/start' || route === '/stop') {
    if (!host) { send(res, 403, { error: 'Only the computer running the server can do this.' }); return true; }
    if (req.headers.origin) { try { if (new URL(req.headers.origin).host !== req.headers.host) { send(res, 403, { error: 'Origin not allowed' }); return true; } } catch { send(res, 403, { error: 'Origin not allowed' }); return true; } }
    if (route === '/stop') { closeRoom(); send(res, 200, { active: false }); return true; }
    readJson(req, res, 2048, body => {
      if (!room) openRoom(body.name, body.environment, body.code);
      tailnetInfo(tailnet => send(res, 200, { ...publicInfo(), host: true, code: room.code, players: roster(), tailnet }));
    });
    return true;
  }
  if (route === '/join') {
    readJson(req, res, 2048, body => {
      if (!room || body.code !== room.code) { send(res, 404, { error: 'That session is not running.' }); return; }
      if (room.players.size >= MAX_PLAYERS) { send(res, 409, { error: 'The session is full.' }); return; }
      const pid = crypto.randomBytes(6).toString('hex');
      room.players.set(pid, { id: pid, name: cleanName(body.name), character: id(body.character), env: id(body.environment), x: 0, y: 0, z: 0, ry: 0, driving: false, vehicle: '', vx: 0, vy: 0, vz: 0, vry: 0, host, seen: Date.now() });
      room.dirty = true;
      send(res, 200, { pid, ...publicInfo() });
    });
    return true;
  }
  if (route === '/update' || route === '/leave') {
    readJson(req, res, 2048, body => {
      if (!room || body.code !== room.code || !room.players.has(body.pid)) { send(res, 404, { error: 'No such session' }); return; }
      const player = room.players.get(body.pid);
      if (route === '/leave') { room.players.delete(body.pid); room.clients.get(body.pid)?.end(); room.clients.delete(body.pid); room.dirty = true; res.writeHead(204).end(); return; }
      const s = body.state && typeof body.state === 'object' ? body.state : {};
      player.name = cleanName(s.name ?? player.name); player.character = id(s.character); player.env = id(s.env);
      player.x = num(s.x, player.x); player.y = num(s.y, player.y); player.z = num(s.z, player.z); player.ry = num(s.ry, player.ry); player.driving = !!s.driving;
      player.vehicle = id(s.vehicle); player.vx = num(s.vx, player.vx); player.vy = num(s.vy, player.vy); player.vz = num(s.vz, player.vz); player.vry = num(s.vry, player.vry);
      player.seen = Date.now(); room.dirty = true;
      res.writeHead(204).end();
    });
    return true;
  }
  send(res, 404, { error: 'Unknown session action' });
  return true;
}

const summary = () => room ? { active: true, players: room.players.size, environment: room.environment } : { active: false, players: 0 };

module.exports = { handle, summary };
