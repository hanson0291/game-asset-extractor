// Game Asset Extractor — local server.
//
// Serves the app from this folder, the library API the pages expect
// (/api/library, backed by data/library.json), byte-range audio so voice
// clips can seek, and the multiplayer session routes (/api/session, see
// session-server.cjs). Node built-ins only — no npm install:
//
//   node server.cjs
//   -> http://127.0.0.1:5186/
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const sessions = require('./session-server.cjs');

const root = __dirname;
const PORT = 5186;
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4' };

// ---- Library API -------------------------------------------------------------
// data/library.json: { games: [{id, name}], characterGames: {characterId: gameId} }
const libraryPath = path.join(root, 'data', 'library.json');
function readLibrary() {
  let raw;
  try { raw = fs.readFileSync(libraryPath, 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return { games: [], characterGames: {} }; throw error; }
  const catalog = JSON.parse(raw.replace(/^\uFEFF/, ''));
  if (!Array.isArray(catalog.games) || !catalog.characterGames || typeof catalog.characterGames !== 'object') throw new Error('Invalid library data');
  return catalog;
}
function writeLibrary(catalog) {
  fs.mkdirSync(path.dirname(libraryPath), { recursive: true });
  const temporary = libraryPath + '.tmp';
  fs.writeFileSync(temporary, JSON.stringify(catalog, null, 2) + '\n');
  fs.renameSync(temporary, libraryPath);
}
function handleLibrary(req, res) {
  const send = (code, value) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
  if (req.method === 'GET') { try { send(200, readLibrary()); } catch { send(500, { error: 'The game library could not be read.' }); } return; }
  if (req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); send(405, { error: 'Method not allowed' }); return; }
  if (!String(req.headers['content-type'] || '').startsWith('application/json')) { send(415, { error: 'Send JSON' }); return; }
  if (req.headers.origin) {
    try { if (new URL(req.headers.origin).host !== req.headers.host) { send(403, { error: 'Origin not allowed' }); return; } }
    catch { send(403, { error: 'Origin not allowed' }); return; }
  }
  let body = '', tooLarge = false;
  req.on('data', chunk => { if (tooLarge) return; body += chunk; if (Buffer.byteLength(body) > 8192) { tooLarge = true; send(413, { error: 'Request too large' }); } });
  req.on('end', () => {
    if (tooLarge) return;
    let change;
    try { change = JSON.parse(body); } catch { send(400, { error: 'Invalid JSON' }); return; }
    let catalog;
    try { catalog = readLibrary(); } catch { send(500, { error: 'The game library could not be read.' }); return; }
    if (change.action === 'add-game' || change.action === 'rename-game') {
      const name = typeof change.name === 'string' ? change.name.trim() : '';
      if (!name || name.length > 80) { send(400, { error: 'Use a game name between 1 and 80 characters.' }); return; }
      const duplicate = catalog.games.find(game => game.name.toLowerCase() === name.toLowerCase() && (change.action !== 'rename-game' || game.id !== change.gameId));
      if (duplicate) { send(409, { error: 'That game category already exists.' }); return; }
      if (change.action === 'add-game') catalog.games.push({ id: require('node:crypto').randomUUID(), name });
      else {
        const game = catalog.games.find(game => game.id === change.gameId);
        if (!game) { send(404, { error: 'Game category not found' }); return; }
        game.name = name;
      }
    } else if (change.action === 'assign-character') {
      if (typeof change.characterId !== 'string' || !/^[a-z0-9-]{1,80}$/.test(change.characterId)) { send(400, { error: 'Invalid character' }); return; }
      if (!catalog.games.some(game => game.id === change.gameId)) { send(404, { error: 'Game category not found' }); return; }
      catalog.characterGames[change.characterId] = change.gameId;
    } else { send(400, { error: 'Unknown library action' }); return; }
    writeLibrary(catalog);
    send(200, catalog);
  });
}

// ---- Static files ------------------------------------------------------------
function serveFile(req, res, pathname) {
  let file = path.normalize(path.join(root, pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '')));
  if (!file.startsWith(root + path.sep) && file !== root) { res.writeHead(403).end('Forbidden'); return; }
  let stat;
  try { stat = fs.statSync(file); } catch { res.writeHead(404).end('Not found'); return; }
  if (stat.isDirectory()) { file = path.join(file, 'index.html'); try { stat = fs.statSync(file); } catch { res.writeHead(404).end('Not found'); return; } }
  const headers = { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' };
  if (req.headers.range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
    if (!match || (!match[1] && !match[2])) { res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` }).end(); return; }
    let start, end;
    if (!match[1]) { start = Math.max(0, stat.size - Number(match[2])); end = stat.size - 1; }
    else { start = Number(match[1]); end = match[2] ? Math.min(Number(match[2]), stat.size - 1) : stat.size - 1; }
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= stat.size) { res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` }).end(); return; }
    headers['Content-Range'] = `bytes ${start}-${end}/${stat.size}`;
    headers['Content-Length'] = end - start + 1;
    res.writeHead(206, headers);
    fs.createReadStream(file, { start, end }).pipe(res);
    return;
  }
  headers['Content-Length'] = stat.size;
  res.writeHead(200, headers);
  fs.createReadStream(file).pipe(res);
}

http.createServer((req, res) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
  catch { res.writeHead(400).end('Invalid request'); return; }
  if (pathname === '/api/library') { handleLibrary(req, res); return; }
  if (pathname.startsWith('/api/session') && sessions.handle(req, res, pathname)) return;
  serveFile(req, res, pathname);
}).listen(PORT, '127.0.0.1', () => console.log('Game Asset Extractor: http://127.0.0.1:' + PORT + '/'));
